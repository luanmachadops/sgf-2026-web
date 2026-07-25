-- ─────────────────────────────────────────────────────────────────────────────
-- Veículo preso em viagem não finalizada
--
-- Problema: uma viagem em `andamento` que o motorista esqueceu de encerrar
-- prende o veículo indefinidamente — nenhum outro motorista consegue usá-lo.
--
-- Solução em três camadas:
--   1. `check_vehicle_conflict` passa a informar HÁ QUANTO TEMPO a viagem está
--      sem sinal de vida (GPS), permitindo ao app distinguir "viagem realmente
--      em curso" de "viagem abandonada".
--   2. `release_stale_trip` permite que qualquer motorista do tenant libere uma
--      viagem abandonada (sem atividade há ≥ 6h), com auditoria e notificação
--      ao motorista anterior. Viagem com sinal recente continua protegida.
--   3. `auto_close_abandoned_trips` (pg_cron, de hora em hora) encerra
--      automaticamente viagens sem atividade há ≥ 24h.
-- ─────────────────────────────────────────────────────────────────────────────

-- Janela (em horas) sem atividade a partir da qual a viagem é considerada
-- abandonada e pode ser liberada por outro motorista.
create or replace function public.trip_stale_after_hours()
returns int language sql immutable as $$ select 6 $$;

-- Última evidência de vida de uma viagem: início, última posição ao vivo ou
-- último ponto gravado da rota.
create or replace function public.trip_last_activity_at(p_trip_id uuid, p_start_at timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select greatest(
    p_start_at,
    coalesce((select max(lp.updated_at) from public.live_positions lp where lp.trip_id = p_trip_id), p_start_at),
    coalesce((select max(tl.recorded_at) from public.trip_locations tl where tl.trip_id = p_trip_id), p_start_at)
  );
$$;

-- ─── 1. Conflito enriquecido ────────────────────────────────────────────────
drop function if exists public.check_vehicle_conflict(uuid);

create function public.check_vehicle_conflict(p_vehicle_id uuid)
returns table (
  in_use boolean,
  driver_name text,
  trip_id uuid,
  start_at timestamptz,
  last_activity_at timestamptz,
  is_stale boolean
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    true,
    p.full_name,
    t.id,
    t.start_at,
    public.trip_last_activity_at(t.id, t.start_at),
    public.trip_last_activity_at(t.id, t.start_at)
      < now() - make_interval(hours => public.trip_stale_after_hours())
  from public.trips t
  join public.profiles p on p.id = t.driver_id
  where t.vehicle_id = p_vehicle_id
    and t.status = 'andamento'
    and t.driver_id <> auth.uid()
    and t.tenant_id = get_user_tenant_id()
  order by t.start_at desc
  limit 1;
$$;

revoke all on function public.check_vehicle_conflict(uuid) from public, anon;
grant execute on function public.check_vehicle_conflict(uuid) to authenticated;

-- ─── 2. Liberação manual de viagem abandonada ───────────────────────────────
create or replace function public.release_stale_trip(p_vehicle_id uuid, p_reason text default null)
returns table (
  released boolean,
  trip_id uuid,
  previous_driver_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  caller_tenant_id uuid;
  caller_name text;
  v_trip_id uuid;
  v_driver_id uuid;
  v_driver_name text;
  v_start_at timestamptz;
  v_last timestamptz;
  v_plate text;
begin
  if caller_id is null then
    raise exception 'Não autenticado';
  end if;

  select p.tenant_id, p.full_name
    into caller_tenant_id, caller_name
    from public.profiles p
   where p.id = caller_id
     and p.role::text in ('motorista', 'admin', 'manager', 'secretario');

  if caller_tenant_id is null then
    raise exception 'Seu perfil não pode liberar um veículo';
  end if;

  select v.plate into v_plate
    from public.vehicles v
   where v.id = p_vehicle_id and v.tenant_id = caller_tenant_id;

  if v_plate is null then
    raise exception 'Veículo não encontrado para esta organização';
  end if;

  select t.id, t.driver_id, pr.full_name, t.start_at
    into v_trip_id, v_driver_id, v_driver_name, v_start_at
    from public.trips t
    join public.profiles pr on pr.id = t.driver_id
   where t.vehicle_id = p_vehicle_id
     and t.tenant_id = caller_tenant_id
     and t.status = 'andamento'
   order by t.start_at desc
   limit 1
   for update of t;

  if v_trip_id is null then
    return query select false, null::uuid, null::text;
    return;
  end if;

  v_last := public.trip_last_activity_at(v_trip_id, v_start_at);

  -- Viagem do próprio motorista pode ser encerrada a qualquer momento;
  -- a de outro motorista, apenas se estiver abandonada.
  if v_driver_id <> caller_id
     and v_last >= now() - make_interval(hours => public.trip_stale_after_hours()) then
    raise exception 'Viagem em curso: última atividade em %. Só é possível liberar após % horas sem sinal.',
      to_char(v_last at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
      public.trip_stale_after_hours();
  end if;

  update public.trips
     set end_at = v_last,
         status = 'concluida',
         notes = concat_ws(
           E'\n',
           nullif(notes, ''),
           format(
             'Viagem encerrada por inatividade em %s. Liberada por %s. Última atividade: %s.%s',
             to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
             coalesce(caller_name, 'motorista'),
             to_char(v_last at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
             case when nullif(trim(p_reason), '') is null then '' else ' Motivo: ' || trim(p_reason) end
           )
         )
   where id = v_trip_id
     and status = 'andamento';

  update public.live_positions
     set is_active = false, updated_at = now()
   where trip_id = v_trip_id;

  update public.profiles
     set current_vehicle_id = null
   where tenant_id = caller_tenant_id
     and current_vehicle_id = p_vehicle_id
     and id <> caller_id;

  -- Avisa o motorista anterior (auditoria visível no app).
  if v_driver_id <> caller_id then
    insert into public.notifications (driver_id, tenant_id, type, title, body, entity_type, entity_id)
    values (
      v_driver_id, caller_tenant_id, 'warning',
      'Viagem encerrada por inatividade',
      format('Sua viagem com o veículo %s ficou sem sinal e foi encerrada para liberar o veículo. Se a viagem continua, registre o encerramento correto.', v_plate),
      'trip', v_trip_id
    );
  end if;

  return query select true, v_trip_id, v_driver_name;
end;
$$;

revoke all on function public.release_stale_trip(uuid, text) from public, anon;
grant execute on function public.release_stale_trip(uuid, text) to authenticated;

-- ─── 3. Encerramento automático (rede de segurança) ─────────────────────────
create or replace function public.auto_close_abandoned_trips(p_hours int default 24)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int := 0;
  r record;
  v_last timestamptz;
begin
  for r in
    select t.id, t.driver_id, t.tenant_id, t.start_at, t.vehicle_id, v.plate
      from public.trips t
      join public.vehicles v on v.id = t.vehicle_id
     where t.status = 'andamento'
       and t.start_at < now() - make_interval(hours => p_hours)
     for update of t
  loop
    v_last := public.trip_last_activity_at(r.id, r.start_at);
    if v_last >= now() - make_interval(hours => p_hours) then
      continue;
    end if;

    update public.trips
       set end_at = v_last,
           status = 'concluida',
           notes = concat_ws(
             E'\n', nullif(notes, ''),
             format('Viagem encerrada automaticamente por inatividade (%s h sem sinal). Última atividade: %s.',
               p_hours, to_char(v_last at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'))
           )
     where id = r.id;

    update public.live_positions set is_active = false, updated_at = now() where trip_id = r.id;
    update public.profiles set current_vehicle_id = null
     where id = r.driver_id and current_vehicle_id = r.vehicle_id;

    insert into public.notifications (driver_id, tenant_id, type, title, body, entity_type, entity_id)
    values (r.driver_id, r.tenant_id, 'warning', 'Viagem encerrada automaticamente',
            format('Sua viagem com o veículo %s ficou %s h sem sinal e foi encerrada automaticamente.', r.plate, p_hours),
            'trip', r.id);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.auto_close_abandoned_trips(int) from public, anon, authenticated;

select cron.unschedule('auto-close-abandoned-trips')
 where exists (select 1 from cron.job where jobname = 'auto-close-abandoned-trips');

select cron.schedule(
  'auto-close-abandoned-trips',
  '10 * * * *',
  $cron$ select public.auto_close_abandoned_trips(24); $cron$
);
