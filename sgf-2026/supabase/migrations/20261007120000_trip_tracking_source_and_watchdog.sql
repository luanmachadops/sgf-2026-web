-- Fonte de rastreamento por prefeitura + vigia de viagem com lembretes.
--
-- * tenants.tracking_source: 'auto' (rastreador quando houver, senão celular),
--   'vehicle' (rastreador; sem rastreador cai no celular) ou 'phone'.
-- * Tempos dos lembretes por prefeitura (padrão 15 min / 30 min / 2 h).
-- * trip_tracking_mode(vehicle): diz ao app se liga o GPS do celular.
-- * trip_watch + trip_watchdog(): roda no pg_cron a cada 5 min, detecta veículo
--   parado (rastreador ou último ponto do celular) e manda lembretes via
--   notifications (o trigger existente dispara o push). Passado o limite, marca
--   close_required_at e o app obriga o motorista a encerrar a viagem.
--   O estado fica em trip_watch para não disparar os gatilhos de log de trips.

alter table public.tenants
  add column if not exists tracking_source text not null default 'auto'
    check (tracking_source in ('auto', 'vehicle', 'phone')),
  add column if not exists trip_reminder_first_min integer not null default 15
    check (trip_reminder_first_min between 5 and 240),
  add column if not exists trip_reminder_interval_min integer not null default 30
    check (trip_reminder_interval_min between 5 and 240),
  add column if not exists trip_close_required_min integer not null default 120
    check (trip_close_required_min between 15 and 1440);

create table if not exists public.trip_watch (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  driver_id uuid not null,
  source text not null default 'phone' check (source in ('vehicle', 'phone')),
  anchor_lat double precision,
  anchor_lng double precision,
  last_signal_at timestamptz,
  stopped_since timestamptz,
  reminders_sent integer not null default 0,
  last_reminder_at timestamptz,
  manager_alerted_at timestamptz,
  close_required_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists trip_watch_driver_idx on public.trip_watch (driver_id);

alter table public.trip_watch enable row level security;
revoke all on public.trip_watch from anon;
grant select on public.trip_watch to authenticated;
create policy trip_watch_select on public.trip_watch for select to authenticated
  using (
    driver_id = auth.uid()
    or is_superadmin()
    or (is_admin_or_manager() and tenant_id = get_user_tenant_id())
  );

-- Distância aproximada em metros (equirretangular; suficiente para < 1 km).
create or replace function public.approx_distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select sqrt(
    power(radians(lat2 - lat1) * 6371000, 2)
    + power(radians(lng2 - lng1) * 6371000 * cos(radians((lat1 + lat2) / 2)), 2)
  );
$$;

-- Rastreador ativo e com sinal recente para o veículo?
create or replace function public.vehicle_tracker_live(p_vehicle_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
      from public.trackers t
      join public.device_status d on d.tracker_id = t.id
     where t.vehicle_id = p_vehicle_id
       and t.active
       and d.updated_at > now() - interval '30 minutes'
  );
$$;

-- Qual GPS o app deve usar nesta viagem: 'vehicle' (app não liga o GPS) ou 'phone'.
create or replace function public.trip_tracking_mode(p_vehicle_id uuid)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
  v_source text;
begin
  select v.tenant_id, t.tracking_source
    into v_tenant, v_source
    from public.vehicles v
    join public.tenants t on t.id = v.tenant_id
   where v.id = p_vehicle_id;
  if v_tenant is null then return 'phone'; end if;
  if not is_superadmin() and v_tenant is distinct from get_user_tenant_id() then
    raise exception 'Veículo de outra prefeitura.' using errcode = '42501';
  end if;
  if v_source = 'phone' then return 'phone'; end if;
  -- 'auto' e 'vehicle': rastreador quando ativo com sinal; senão o celular.
  return case when public.vehicle_tracker_live(p_vehicle_id) then 'vehicle' else 'phone' end;
end;
$$;
revoke all on function public.trip_tracking_mode(uuid) from public, anon;
grant execute on function public.trip_tracking_mode(uuid) to authenticated;
revoke all on function public.vehicle_tracker_live(uuid) from public, anon;

create or replace function public.trip_watchdog()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  w public.trip_watch%rowtype;
  v_lat double precision;
  v_lng double precision;
  v_speed double precision;
  v_signal timestamptz;
  v_source text;
  v_moving boolean;
  v_stopped_min numeric;
  v_due_min numeric;
  v_label text;
  v_sent integer := 0;
begin
  -- Viagens encerradas saem do vigia.
  delete from public.trip_watch tw
   using public.trips t
   where t.id = tw.trip_id and t.status <> 'andamento';

  for r in
    select t.id, t.tenant_id, t.driver_id, t.vehicle_id, t.start_at,
           tn.tracking_source, tn.trip_reminder_first_min, tn.trip_reminder_interval_min, tn.trip_close_required_min,
           coalesce(nullif(v.name, ''), nullif(trim(concat_ws(' ', v.brand, v.model)), ''), 'Veículo') || coalesce(' (' || v.plate || ')', '') as vehicle_label
      from public.trips t
      join public.tenants tn on tn.id = t.tenant_id
      left join public.vehicles v on v.id = t.vehicle_id
     where t.status = 'andamento'
  loop
    v_lat := null; v_lng := null; v_speed := null; v_signal := null; v_source := 'phone';

    -- Fonte: rastreador com sinal recente (salvo se a prefeitura usa só o celular).
    if r.tracking_source <> 'phone' and r.vehicle_id is not null then
      select d.lat, d.lng, d.speed, d.updated_at
        into v_lat, v_lng, v_speed, v_signal
        from public.trackers tk
        join public.device_status d on d.tracker_id = tk.id
       where tk.vehicle_id = r.vehicle_id and tk.active
         and d.updated_at > now() - interval '30 minutes'
       order by d.updated_at desc
       limit 1;
      if v_signal is not null then v_source := 'vehicle'; end if;
    end if;

    -- Celular: último ponto gravado na viagem.
    if v_source = 'phone' then
      select l.lat, l.lng, case when l.speed >= 0 then l.speed * 3.6 end, l.recorded_at
        into v_lat, v_lng, v_speed, v_signal
        from public.trip_locations l
       where l.trip_id = r.id
       order by l.recorded_at desc
       limit 1;
    end if;

    -- Sem nenhum sinal (ex.: localização negada): não há como saber se está
    -- parado; fica a cargo do encerramento automático de viagens abandonadas.
    if v_lat is null then
      continue;
    end if;

    select * into w from public.trip_watch where trip_id = r.id;
    if not found then
      insert into public.trip_watch (trip_id, tenant_id, driver_id, source, anchor_lat, anchor_lng, last_signal_at, stopped_since)
      values (r.id, r.tenant_id, r.driver_id, v_source, v_lat, v_lng, v_signal, coalesce(v_signal, r.start_at))
      returning * into w;
      -- Primeiro ciclo: só registra a âncora.
      continue;
    end if;

    -- Andou? (mais de 150 m da âncora, ou velocidade acima de 5 km/h com sinal novo)
    v_moving := v_lat is not null and (
      (w.anchor_lat is null)
      or public.approx_distance_m(w.anchor_lat, w.anchor_lng, v_lat, v_lng) > 150
      or (coalesce(v_speed, 0) > 5 and v_signal > coalesce(w.last_signal_at, '-infinity'))
    );

    if v_moving then
      update public.trip_watch
         set source = v_source, anchor_lat = v_lat, anchor_lng = v_lng, last_signal_at = v_signal,
             stopped_since = null, reminders_sent = 0, last_reminder_at = null,
             manager_alerted_at = null, close_required_at = null, updated_at = now()
       where trip_id = r.id;
      continue;
    end if;

    -- Parado: desde a última vez que se moveu (ou o último sinal, se o celular calou).
    w.stopped_since := coalesce(w.stopped_since, w.last_signal_at, v_signal, now());
    v_stopped_min := extract(epoch from (now() - w.stopped_since)) / 60;
    v_label := r.vehicle_label;

    -- Próximo lembrete: a cada "1º aviso" até 1 h, depois no intervalo configurado.
    v_due_min := case
      when w.reminders_sent = 0 then r.trip_reminder_first_min
      when w.last_reminder_at is null then r.trip_reminder_first_min
      else extract(epoch from (w.last_reminder_at - w.stopped_since)) / 60
           + case when extract(epoch from (w.last_reminder_at - w.stopped_since)) / 60 < 60
                  then r.trip_reminder_first_min else r.trip_reminder_interval_min end
    end;

    if v_stopped_min >= r.trip_close_required_min and w.close_required_at is null then
      w.close_required_at := now();
      insert into public.notifications (driver_id, tenant_id, type, title, body, link, entity_type, entity_id)
      values (r.driver_id, r.tenant_id, 'alert', 'Encerre a viagem agora',
              format('%s está parado há %s. Abra o app e encerre a viagem — é obrigatório.', v_label,
                     case when v_stopped_min >= 120 then replace(round(v_stopped_min / 60, 1)::text, '.', ',') || ' h' else round(v_stopped_min) || ' min' end),
              '/end-trip', 'trip_close', r.id);
      w.reminders_sent := w.reminders_sent + 1;
      w.last_reminder_at := now();
      v_sent := v_sent + 1;
    elsif v_stopped_min >= v_due_min then
      insert into public.notifications (driver_id, tenant_id, type, title, body, link, entity_type, entity_id)
      values (r.driver_id, r.tenant_id, 'warning',
              case when w.close_required_at is not null then 'Encerre a viagem agora' else 'Veículo parado — a viagem ainda está aberta' end,
              format('%s está parado há %s min. Se você terminou, abra o app e encerre a viagem.', v_label, round(v_stopped_min)),
              '/end-trip', 'trip_close', r.id);
      w.reminders_sent := w.reminders_sent + 1;
      w.last_reminder_at := now();
      v_sent := v_sent + 1;
    end if;

    -- Gestores: um alerta por episódio, a partir de 1 h parado.
    if v_stopped_min >= 60 and w.manager_alerted_at is null then
      insert into public.notifications (driver_id, tenant_id, type, title, body, link, entity_type, entity_id)
      select p.id, r.tenant_id, 'warning', 'Viagem aberta com veículo parado',
             format('%s está parado há %s min com a viagem em andamento.', v_label, round(v_stopped_min)),
             '/viagens', 'trip', r.id
        from public.profiles p
       where p.tenant_id = r.tenant_id and p.role in ('admin', 'gestor') and p.id <> r.driver_id;
      w.manager_alerted_at := now();
    end if;

    update public.trip_watch
       set source = v_source, last_signal_at = coalesce(v_signal, w.last_signal_at),
           stopped_since = w.stopped_since, reminders_sent = w.reminders_sent,
           last_reminder_at = w.last_reminder_at, manager_alerted_at = w.manager_alerted_at,
           close_required_at = w.close_required_at, updated_at = now()
     where trip_id = r.id;
  end loop;

  return v_sent;
end;
$$;
revoke all on function public.trip_watchdog() from public, anon, authenticated;

select cron.schedule('trip-watchdog', '*/5 * * * *', $$ select public.trip_watchdog(); $$);
