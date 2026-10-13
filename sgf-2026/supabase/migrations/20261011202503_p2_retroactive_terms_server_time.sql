-- Exportada de produção em 2026-10-13 (supabase_migrations.schema_migrations,
-- versão 20261011202503). Já aplicada; o SQL abaixo é o registrado no banco, sem alterações.

alter table public.trips
  add column if not exists server_started_at timestamptz,
  add column if not exists server_ended_at   timestamptz;
alter table public.trips alter column server_started_at set default now();
alter table public.trip_locations
  add column if not exists server_received_at timestamptz;
alter table public.trip_locations alter column server_received_at set default now();

comment on column public.trips.server_started_at is 'Hora do servidor no INSERT da viagem (o start_at vem do aparelho).';
comment on column public.trips.server_ended_at   is 'Hora do servidor quando a viagem passou a concluida/cancelada (o end_at vem do aparelho).';
comment on column public.trip_locations.server_received_at is 'Hora do servidor ao receber o ponto (recorded_at vem do aparelho).';

create or replace function public.tf_trip_server_end_time()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if old.status = 'andamento'::public.trip_status
     and new.status is distinct from old.status
     and new.server_ended_at is null then
    new.server_ended_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_trip_server_end_time on public.trips;
create trigger trg_trip_server_end_time
  before update of status on public.trips
  for each row execute function public.tf_trip_server_end_time();

alter table public.trips
  add column if not exists retroactive_document_path text,
  add column if not exists retroactive_registered_by uuid references public.profiles(id);

comment on column public.trips.retroactive_document_path is 'Scan/foto da folha de papel (bucket documentos). Obrigatório em viagem retroativa.';

create or replace function public.tf_trip_insert_guard()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_driver        record;
  v_vehicle       record;
  v_today_start   timestamptz := date_trunc('day', now());
  v_has_pair      boolean;
  v_latest_full   uuid;
  v_has_critical  boolean;
  v_require_purpose boolean;
  v_retroactive   boolean := coalesce(current_setting('app.retroactive_trip', true), '') = 'on';
begin
  select p.access_blocked, p.driver_status, p.cnh_expiry
    into v_driver
    from public.profiles p
   where p.id = new.driver_id;

  if not found then
    raise exception 'TRIP_GUARD_DRIVER_NOT_FOUND: motorista nao encontrado.'
      using errcode = 'TR001';
  end if;

  if v_retroactive then
    select v.status into v_vehicle from public.vehicles v where v.id = new.vehicle_id;
    if not found then
      raise exception 'TRIP_GUARD_VEHICLE_NOT_FOUND: veiculo nao encontrado.'
        using errcode = 'TR005';
    end if;
    return new;
  end if;

  if coalesce(v_driver.access_blocked, false) then
    raise exception 'TRIP_GUARD_DRIVER_BLOCKED: seu acesso esta bloqueado. Procure a administracao.'
      using errcode = 'TR002';
  end if;

  if coalesce(v_driver.driver_status, 'ativo') <> 'ativo' then
    raise exception 'TRIP_GUARD_DRIVER_STATUS: seu cadastro nao esta ativo (status: %). Procure a administracao.', v_driver.driver_status
      using errcode = 'TR003';
  end if;

  if v_driver.cnh_expiry is null or v_driver.cnh_expiry < current_date then
    raise exception 'TRIP_GUARD_CNH_EXPIRED: sua CNH esta vencida ou sem data cadastrada. Atualize seu cadastro antes de iniciar uma viagem.'
      using errcode = 'TR004';
  end if;

  select v.status into v_vehicle
    from public.vehicles v
   where v.id = new.vehicle_id;

  if not found then
    raise exception 'TRIP_GUARD_VEHICLE_NOT_FOUND: veiculo nao encontrado.'
      using errcode = 'TR005';
  end if;

  if v_vehicle.status <> 'liberado' then
    raise exception 'TRIP_GUARD_VEHICLE_STATUS: veiculo indisponivel (status atual: %). Nao e possivel iniciar viagem.', v_vehicle.status
      using errcode = 'TR006';
  end if;

  select exists (
    select 1
      from public.checklists c
     where c.driver_id = new.driver_id
       and c.vehicle_id = new.vehicle_id
       and c.created_at >= v_today_start
  ) into v_has_pair;

  if not v_has_pair then
    raise exception 'TRIP_GUARD_CHECKLIST_MISSING: e necessario registrar o checklist de hoje para este veiculo antes de iniciar a viagem.'
      using errcode = 'TR007';
  end if;

  select c.id into v_latest_full
    from public.checklists c
   where c.vehicle_id = new.vehicle_id
     and c.quick_confirm = false
     and c.created_at >= v_today_start
   order by c.created_at desc
   limit 1;

  if v_latest_full is not null then
    select exists (
      select 1
        from public.checklist_items ci
       where ci.checklist_id = v_latest_full
         and ci.item_key in ('freios', 'pneus', 'luzes')
         and ci.state = 'atencao'
    ) into v_has_critical;

    if v_has_critical then
      raise exception 'TRIP_GUARD_CHECKLIST_CRITICAL: o checklist de hoje deste veiculo reprovou um item critico (freios, pneus ou luzes). A viagem nao pode ser iniciada ate a correcao.'
        using errcode = 'TR008';
    end if;
  end if;

  select t.require_trip_purpose
    into v_require_purpose
    from public.tenants t
   where t.id = coalesce(
           new.tenant_id,
           (select v.tenant_id from public.vehicles v where v.id = new.vehicle_id)
         );

  if coalesce(v_require_purpose, false) then
    if nullif(btrim(coalesce(new.origin, '')), '') is null
       or length(btrim(coalesce(new.purpose, ''))) < 10
       or new.purpose_category is null then
      raise exception 'TRIP_GUARD_PURPOSE_MISSING: informe origem, finalidade (minimo 10 caracteres) e categoria da finalidade do deslocamento.'
        using errcode = 'TR009';
    end if;
  end if;

  return new;
end;
$function$;

create or replace function public.tf_trip_retroactive_only_by_rpc()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.is_retroactive and coalesce(current_setting('app.retroactive_trip', true), '') <> 'on' then
    raise exception 'TRIP_RETROACTIVE_RPC_ONLY: viagem retroativa so pode ser lancada pelo gestor no painel.'
      using errcode = 'TR010';
  end if;
  return new;
end $$;

drop trigger if exists trg_trip_retroactive_only_by_rpc on public.trips;
create trigger trg_trip_retroactive_only_by_rpc
  before insert on public.trips
  for each row execute function public.tf_trip_retroactive_only_by_rpc();

create or replace function public.manager_create_retroactive_trip(
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_start_odometer integer,
  p_end_odometer integer,
  p_origin text,
  p_destination text,
  p_purpose text,
  p_purpose_category public.trip_purpose_category,
  p_passenger_count integer,
  p_justification text,
  p_document_path text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_id uuid;
begin
  if not (public.is_superadmin() or public.is_admin_or_manager()) then
    raise exception 'Somente admin ou gestor pode lançar viagem retroativa.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.vehicles v where v.id = p_vehicle_id and (v.tenant_id = v_tenant or public.is_superadmin())) then
    raise exception 'Veículo não encontrado nesta prefeitura.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_driver_id and (p.tenant_id = v_tenant or public.is_superadmin())) then
    raise exception 'Motorista não encontrado nesta prefeitura.' using errcode = '42501';
  end if;

  if p_start_at is null or p_end_at is null or p_end_at < p_start_at then
    raise exception 'Informe saída e chegada (a chegada não pode ser antes da saída).' using errcode = '22023';
  end if;
  if p_start_at > now() then
    raise exception 'Viagem retroativa não pode ter data futura.' using errcode = '22023';
  end if;
  if p_start_odometer is null or p_end_odometer is null or p_end_odometer < p_start_odometer then
    raise exception 'Informe o km de saída e de chegada (chegada maior ou igual à saída).' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_justification, ''))) < 10 then
    raise exception 'Justificativa obrigatória (mínimo 10 caracteres).' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_purpose, ''))) < 10 then
    raise exception 'Finalidade obrigatória (mínimo 10 caracteres).' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_destination, '')), '') is null then
    raise exception 'Informe o destino.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_document_path, '')), '') is null then
    raise exception 'Anexe o scan ou a foto da folha de papel.' using errcode = '22023';
  end if;

  perform set_config('app.retroactive_trip', 'on', true);

  insert into public.trips (
    driver_id, vehicle_id, start_at, end_at, start_odometer, end_odometer, distance_km,
    origin, destination, purpose, purpose_category, passenger_count,
    status, is_retroactive, justification, retroactive_document_path, retroactive_registered_by
  ) values (
    p_driver_id, p_vehicle_id, p_start_at, p_end_at, p_start_odometer, p_end_odometer,
    p_end_odometer - p_start_odometer,
    nullif(btrim(p_origin), ''), btrim(p_destination), btrim(p_purpose), p_purpose_category, p_passenger_count,
    'concluida', true, btrim(p_justification), p_document_path, auth.uid()
  )
  returning id into v_id;

  perform set_config('app.retroactive_trip', '', true);
  return v_id;
end $$;

revoke all on function public.manager_create_retroactive_trip(uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, public.trip_purpose_category, integer, text, text) from public, anon;
grant execute on function public.manager_create_retroactive_trip(uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, public.trip_purpose_category, integer, text, text) to authenticated;

create or replace function public.notify_retroactive_trip()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_tenant_id uuid;
  v_plate     text;
  v_driver    text;
  v_author    text;
  v_body      text;
begin
  select v.tenant_id, v.plate into v_tenant_id, v_plate
  from public.vehicles v
  where v.id = new.vehicle_id;

  if v_tenant_id is null then
    return new;
  end if;

  select p.full_name into v_driver from public.profiles p where p.id = new.driver_id;
  select p.full_name into v_author from public.profiles p where p.id = new.retroactive_registered_by;

  v_body := coalesce(v_author, 'Um gestor') || ' lançou uma viagem retroativa (folha de papel) do motorista '
            || coalesce(v_driver, 'desconhecido') || ' no veículo '
            || coalesce(v_plate, 'sem placa') || '. Justificativa: '
            || coalesce(nullif(new.justification, ''), 'não informada') || '.';

  perform public.notify_fleet_managers(
    v_tenant_id,
    'info',
    'Viagem retroativa registrada',
    v_body,
    '/trip-detail?id=' || new.id::text,
    'viagem_retroativa',
    new.id
  );

  return new;
end;
$function$;

create table if not exists public.driver_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id),
  driver_id uuid not null default auth.uid() references public.profiles(id),
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  app_version text,
  platform text,
  device text,
  ip inet,
  user_agent text,
  unique (driver_id, terms_version)
);

comment on table public.driver_terms_acceptances is 'Ciência do motorista sobre rastreamento e uso dos dados (LGPD). Uma linha por versão do termo; imutável.';

create or replace function public.tf_driver_terms_fill()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_headers json;
  v_ip text;
begin
  new.driver_id := auth.uid();
  new.accepted_at := now();
  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    v_headers := null;
  end;
  if v_headers is not null then
    v_ip := btrim(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1));
    begin
      new.ip := nullif(v_ip, '')::inet;
    exception when others then
      new.ip := null;
    end;
    new.user_agent := v_headers->>'user-agent';
  end if;
  return new;
end $$;

drop trigger if exists trg_driver_terms_fill on public.driver_terms_acceptances;
create trigger trg_driver_terms_fill
  before insert on public.driver_terms_acceptances
  for each row execute function public.tf_driver_terms_fill();

create or replace function public.tf_driver_terms_immutable()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  raise exception 'Registro de ciência do termo não pode ser alterado nem apagado.' using errcode = '42501';
end $$;

drop trigger if exists trg_driver_terms_immutable on public.driver_terms_acceptances;
create trigger trg_driver_terms_immutable
  before update or delete on public.driver_terms_acceptances
  for each row execute function public.tf_driver_terms_immutable();

alter table public.driver_terms_acceptances enable row level security;

drop policy if exists active_session_read on public.driver_terms_acceptances;
create policy active_session_read on public.driver_terms_acceptances as restrictive
  for select to authenticated using ((select sgf_private.resource_allowed('driver_terms_acceptances', false)));
drop policy if exists active_session_insert on public.driver_terms_acceptances;
create policy active_session_insert on public.driver_terms_acceptances as restrictive
  for insert to authenticated with check ((select sgf_private.resource_allowed('driver_terms_acceptances', true)));

drop policy if exists driver_terms_insert_own on public.driver_terms_acceptances;
create policy driver_terms_insert_own on public.driver_terms_acceptances
  for insert to authenticated with check (driver_id = auth.uid() and tenant_id = public.get_user_tenant_id());
drop policy if exists driver_terms_select_own on public.driver_terms_acceptances;
create policy driver_terms_select_own on public.driver_terms_acceptances
  for select to authenticated using (driver_id = auth.uid());
drop policy if exists driver_terms_select_manager on public.driver_terms_acceptances;
create policy driver_terms_select_manager on public.driver_terms_acceptances
  for select to authenticated using (public.is_superadmin() or (public.is_admin_or_manager() and tenant_id = public.get_user_tenant_id()));

grant select, insert on public.driver_terms_acceptances to authenticated;

create or replace function sgf_private.resource_modules(p_resource text, p_write boolean)
 returns text[]
 language sql
 immutable
 set search_path to ''
as $function$
select case
  when p_resource='get_trip_timeline' then array['trips']::text[]
  when p_resource='reconcile_procurement_legacy_entry' then array['procurement','budgets','reports']::text[]
  when p_resource='get_procurement_reconciled_legacy_totals' then array['budgets','reports']::text[]
  -- P0 (2026-10-09): viagem imutavel, retificacoes, paradas e auditoria.
  when p_resource in ('manager_cancel_trip','manager_correct_trip','trip_corrections','trip_stops') then array['trips']::text[]
  when p_resource='verify_activity_chain' then array['settings','reports']::text[]
  -- P1 (2026-10-09): expediente, autorizacoes, prestacao de contas, frota e preventiva.
  when p_resource in ('work_schedules','holidays') then array['settings']::text[]
  when p_resource='off_hours_authorizations' then array['settings','trips']::text[]
  when p_resource in ('report_snapshots','register_report_snapshot','sign_report_snapshot','verify_report') then array['reports']::text[]
  when p_resource in ('maintenance_plans','maintenance_plan_status','maintenance_plan_eval') then array['maintenances']::text[]
  when p_resource='cost_centers' then array['fleet','departments']::text[]
  when p_resource='vehicle_rental_contracts' then array['fleet']::text[]
  -- P2 (2026-10-11): lancamento retroativo, termo de ciencia, checklist->viagem.
  when p_resource='manager_create_retroactive_trip' then array['trips']::text[]
  when p_resource='driver_terms_acceptances' then array['drivers']::text[]
  else sgf_private.resource_modules_before_procurement_legacy_reconciliation(p_resource,p_write)
end
$function$;
