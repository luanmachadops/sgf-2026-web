-- Exportada de produção em 2026-10-13 (supabase_migrations.schema_migrations,
-- versão 20261009211755). Já aplicada; o SQL abaixo é o registrado no banco, sem alterações.

-- ─────────────────────────────────────────────────────────────────────────────
-- P1.4 / P1.5 / P1.6 — Alertas de controle: salto de km, uso fora do expediente
-- e consumo anômalo.
--
-- NÃO APLICADA ainda: requer aprovação explícita (DDL em produção).
--
-- Princípio: NENHUM destes alertas bloqueia a operação (emergências existem).
-- Eles apenas MARCAM o registro e NOTIFICAM os gestores do tenant.
--
-- Decisões de desenho:
--  * trips: viagem 'concluida'/'cancelada' é imutável (tf_trip_cancel_guard).
--    Por isso as marcas (odometer_gap_km, off_hours, off_hours_authorization_id)
--    são gravadas em BEFORE INSERT (a viagem nasce 'andamento'), nunca depois.
--  * Ordem dos triggers BEFORE INSERT em trips (alfabética):
--      trg_tenant (preenche tenant_id) -> trg_trip_insert_guard (valida; pode
--      abortar) -> trg_trip_zz_alerts_mark (esta migration). Assim só marcamos
--      viagens que serão realmente aceitas e já com tenant_id resolvido.
--  * A NOTIFICAÇÃO sai em AFTER INSERT (trg_trip_zz_alerts_notify): só então a
--      viagem existe de fato (entity_id/link válidos) e, se o INSERT for
--      revertido por outro trigger/constraint, nenhuma notificação órfã é criada.
--  * fuelings: km_per_liter NÃO é calculado por trigger; é calculado dentro das
--      RPCs manager_review_fueling (UPDATE na validação) e
--      manager_create_direct_fueling (INSERT 'lancado_direto'), no mesmo
--      statement que grava has_anomaly/anomaly_type. Por isso o novo trigger é
--      BEFORE INSERT OR UPDATE e reage a km_per_liter preenchido/alterado.
--      A notificação de anomalia já é feita por tg_notify_fueling (AFTER), que
--      dispara quando has_anomaly passa a true — não duplicamos.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tolerâncias por prefeitura ───────────────────────────────────────────────
alter table public.tenants
  add column if not exists km_gap_tolerance integer not null default 5,
  add column if not exists consumption_tolerance_pct integer not null default 25;

alter table public.tenants
  drop constraint if exists tenants_km_gap_tolerance_check,
  add constraint tenants_km_gap_tolerance_check check (km_gap_tolerance >= 0),
  drop constraint if exists tenants_consumption_tolerance_pct_check,
  add constraint tenants_consumption_tolerance_pct_check check (consumption_tolerance_pct between 1 and 99);

comment on column public.tenants.km_gap_tolerance is 'Tolerância (km) entre o hodômetro final da última viagem concluída e o inicial da próxima; acima disso a viagem é marcada com odometer_gap_km e os gestores são notificados.';
comment on column public.tenants.consumption_tolerance_pct is 'Queda percentual tolerada do km/L de um abastecimento em relação à média dos últimos 5 abastecimentos de tanque cheio do veículo; abaixo disso o abastecimento é marcado como consumo_baixo.';

-- 2. Expediente, feriados e autorização fora do horário ──────────────────────
create table if not exists public.work_schedules (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default public.get_user_tenant_id() references public.tenants(id),
  department_id uuid references public.departments(id),
  weekday       smallint not null check (weekday between 0 and 6),
  start_time    time not null,
  end_time      time not null,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  constraint work_schedules_time_order check (end_time > start_time),
  constraint work_schedules_unique unique nulls not distinct (tenant_id, department_id, weekday)
);

create table if not exists public.holidays (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.get_user_tenant_id() references public.tenants(id),
  date        date not null,
  description text not null check (length(btrim(description)) >= 3),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint holidays_unique unique (tenant_id, date)
);

create table if not exists public.off_hours_authorizations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default public.get_user_tenant_id() references public.tenants(id),
  vehicle_id    uuid not null references public.vehicles(id) on delete restrict,
  driver_id     uuid references public.profiles(id) on delete restrict,
  valid_from    timestamptz not null,
  valid_to      timestamptz not null,
  reason        text not null check (length(btrim(reason)) >= 10),
  authorized_by uuid default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  revoked_by    uuid references public.profiles(id),
  revoke_reason text,
  constraint off_hours_auth_period check (valid_to > valid_from),
  constraint off_hours_auth_revoke_reason check (
    revoked_at is null or length(btrim(coalesce(revoke_reason, ''))) >= 10
  )
);

create index if not exists work_schedules_tenant_idx on public.work_schedules (tenant_id, department_id);
create index if not exists holidays_tenant_date_idx on public.holidays (tenant_id, date);
create index if not exists off_hours_auth_lookup_idx
  on public.off_hours_authorizations (tenant_id, vehicle_id, valid_from, valid_to)
  where revoked_at is null;

comment on table public.work_schedules is 'Expediente por prefeitura/secretaria e dia da semana. department_id nulo = padrão do tenant. Se o tenant não tem NENHUMA linha, o alerta de uso fora do expediente fica desligado.';
comment on column public.work_schedules.tenant_id is 'Prefeitura (tenant) dona do registro.';
comment on column public.work_schedules.department_id is 'Secretaria à qual o expediente se aplica; nulo = padrão do tenant.';
comment on column public.work_schedules.weekday is 'Dia da semana, 0 = domingo ... 6 = sábado (mesma convenção de extract(dow)). Dia sem linha = sem expediente.';
comment on column public.work_schedules.start_time is 'Início do expediente (horário local America/Sao_Paulo).';
comment on column public.work_schedules.end_time is 'Fim do expediente (horário local America/Sao_Paulo); deve ser maior que o início.';
comment on column public.work_schedules.created_by is 'Usuário que cadastrou o expediente.';
comment on column public.work_schedules.created_at is 'Data/hora de criação.';

comment on table public.holidays is 'Feriados e pontos facultativos por prefeitura; viagem iniciada em feriado conta como fora do expediente.';
comment on column public.holidays.tenant_id is 'Prefeitura (tenant) dona do registro.';
comment on column public.holidays.date is 'Data do feriado (calendário local).';
comment on column public.holidays.description is 'Nome/descrição do feriado.';
comment on column public.holidays.created_by is 'Usuário que cadastrou o feriado.';
comment on column public.holidays.created_at is 'Data/hora de criação.';

comment on table public.off_hours_authorizations is 'Autorização prévia de uso de veículo fora do expediente/feriado/fim de semana. Nunca é apagada: o cancelamento é uma revogação com motivo (trilha de auditoria).';
comment on column public.off_hours_authorizations.tenant_id is 'Prefeitura (tenant) dona do registro.';
comment on column public.off_hours_authorizations.vehicle_id is 'Veículo autorizado.';
comment on column public.off_hours_authorizations.driver_id is 'Motorista autorizado; nulo = qualquer motorista com o veículo.';
comment on column public.off_hours_authorizations.valid_from is 'Início da vigência da autorização.';
comment on column public.off_hours_authorizations.valid_to is 'Fim da vigência da autorização.';
comment on column public.off_hours_authorizations.reason is 'Justificativa da autorização (mínimo 10 caracteres).';
comment on column public.off_hours_authorizations.authorized_by is 'Gestor que concedeu a autorização (auth.uid() por padrão).';
comment on column public.off_hours_authorizations.created_at is 'Data/hora de criação.';
comment on column public.off_hours_authorizations.revoked_at is 'Data/hora da revogação; nulo = autorização não revogada.';
comment on column public.off_hours_authorizations.revoked_by is 'Usuário que revogou a autorização.';
comment on column public.off_hours_authorizations.revoke_reason is 'Motivo da revogação (mínimo 10 caracteres).';

-- 2.1 Autorização é imutável, exceto a revogação (uma única vez, com motivo).
create or replace function public.tf_off_hours_auth_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'INSERT' then
    -- O veículo precisa ser do mesmo tenant (a FK sozinha não garante).
    if not exists (select 1 from public.vehicles v
                    where v.id = new.vehicle_id and v.tenant_id = new.tenant_id) then
      raise exception 'Veículo não pertence a esta prefeitura' using errcode = 'check_violation';
    end if;
    new.revoked_at := null; new.revoked_by := null; new.revoke_reason := null;
    new.authorized_by := coalesce(auth.uid(), new.authorized_by);
    return new;
  end if;

  if old.revoked_at is not null then
    raise exception 'Autorização já revogada não pode ser alterada' using errcode = 'insufficient_privilege';
  end if;
  if (to_jsonb(new) - 'revoked_at' - 'revoked_by' - 'revoke_reason')
     is distinct from (to_jsonb(old) - 'revoked_at' - 'revoked_by' - 'revoke_reason') then
    raise exception 'Autorização só pode ser revogada, não editada' using errcode = 'insufficient_privilege';
  end if;
  if new.revoked_at is null then
    return new;
  end if;
  if length(btrim(coalesce(new.revoke_reason, ''))) < 10 then
    raise exception 'Informe o motivo da revogação (mínimo 10 caracteres)' using errcode = 'check_violation';
  end if;
  new.revoked_at := now();
  new.revoked_by := auth.uid();
  return new;
end $$;

comment on function public.tf_off_hours_auth_guard() is 'Garante que off_hours_authorizations só aceite INSERT válido (veículo do mesmo tenant) e UPDATE de revogação com motivo; qualquer outra edição é recusada.';

drop trigger if exists trg_off_hours_auth_guard on public.off_hours_authorizations;
create trigger trg_off_hours_auth_guard
  before insert or update on public.off_hours_authorizations
  for each row execute function public.tf_off_hours_auth_guard();

-- 2.2 Auditoria (tf_activity_log não exige vehicle_id: o rótulo fica nulo nas
--     tabelas sem veículo). Autorizações não têm DELETE, então só create/update.
drop trigger if exists trg_activity_work_schedules on public.work_schedules;
create trigger trg_activity_work_schedules
  after insert or update or delete on public.work_schedules
  for each row execute function public.tf_activity_log('work_schedule');

drop trigger if exists trg_activity_holidays on public.holidays;
create trigger trg_activity_holidays
  after insert or update or delete on public.holidays
  for each row execute function public.tf_activity_log('holiday');

drop trigger if exists trg_activity_off_hours_authorizations on public.off_hours_authorizations;
create trigger trg_activity_off_hours_authorizations
  after insert or update on public.off_hours_authorizations
  for each row execute function public.tf_activity_log('off_hours_authorization');

-- 2.3 RLS ─────────────────────────────────────────────────────────────────────
alter table public.work_schedules enable row level security;
alter table public.holidays enable row level security;
alter table public.off_hours_authorizations enable row level security;

revoke all on public.work_schedules, public.holidays, public.off_hours_authorizations from anon;
grant select, insert, update, delete on public.work_schedules, public.holidays to authenticated;
grant select, insert, update on public.off_hours_authorizations to authenticated;

-- Restritivas: sessão ativa + módulo autorizado (mapear em resource_modules).
do $$
declare t text;
begin
  foreach t in array array['work_schedules', 'holidays', 'off_hours_authorizations'] loop
    execute format('drop policy if exists active_session_read on public.%I', t);
    execute format('create policy active_session_read on public.%I as restrictive for select using ((select sgf_private.resource_allowed(%L, false)))', t, t);
    execute format('drop policy if exists active_session_insert on public.%I', t);
    execute format('create policy active_session_insert on public.%I as restrictive for insert with check ((select sgf_private.resource_allowed(%L, true)))', t, t);
    execute format('drop policy if exists active_session_update on public.%I', t);
    execute format('create policy active_session_update on public.%I as restrictive for update using ((select sgf_private.resource_allowed(%L, true))) with check ((select sgf_private.resource_allowed(%L, true)))', t, t, t);
  end loop;
  -- DELETE só nas tabelas de configuração (expediente/feriado). O resultado já
  -- fica congelado em trips.off_hours, então remover uma regra não reescreve o passado.
  foreach t in array array['work_schedules', 'holidays'] loop
    execute format('drop policy if exists active_session_delete on public.%I', t);
    execute format('create policy active_session_delete on public.%I as restrictive for delete using ((select sgf_private.resource_allowed(%L, true)))', t, t);
  end loop;
end $$;

-- Permissivas: admin/gestor do próprio tenant (e superadmin).
do $$
declare t text;
begin
  foreach t in array array['work_schedules', 'holidays', 'off_hours_authorizations'] loop
    execute format('drop policy if exists %I on public.%I', t || '_manager_select', t);
    execute format('create policy %I on public.%I for select using (public.is_superadmin() or (public.is_admin_or_manager() and tenant_id = public.get_user_tenant_id()))', t || '_manager_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_manager_insert', t);
    execute format('create policy %I on public.%I for insert with check (public.is_superadmin() or (public.is_admin_or_manager() and tenant_id = public.get_user_tenant_id()))', t || '_manager_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_manager_update', t);
    execute format('create policy %I on public.%I for update using (public.is_superadmin() or (public.is_admin_or_manager() and tenant_id = public.get_user_tenant_id())) with check (public.is_superadmin() or (public.is_admin_or_manager() and tenant_id = public.get_user_tenant_id()))', t || '_manager_update', t);
  end loop;
  foreach t in array array['work_schedules', 'holidays'] loop
    execute format('drop policy if exists %I on public.%I', t || '_manager_delete', t);
    execute format('create policy %I on public.%I for delete using (public.is_superadmin() or (public.is_admin_or_manager() and tenant_id = public.get_user_tenant_id()))', t || '_manager_delete', t);
  end loop;
end $$;

-- 3. trips: colunas de alerta ─────────────────────────────────────────────────
alter table public.trips
  add column if not exists odometer_gap_km integer,
  add column if not exists off_hours boolean not null default false,
  add column if not exists off_hours_authorization_id uuid
    references public.off_hours_authorizations(id) on delete restrict;

create index if not exists trips_off_hours_idx on public.trips (tenant_id, start_at desc) where off_hours;
create index if not exists trips_odometer_gap_idx on public.trips (tenant_id, start_at desc) where odometer_gap_km is not null;
create index if not exists trips_vehicle_end_idx on public.trips (vehicle_id, start_at desc) where status = 'concluida';

comment on column public.trips.odometer_gap_km is 'Diferença (km) entre start_odometer desta viagem e o end_odometer da viagem concluída anterior do veículo. Positivo acima da tolerância do tenant = km rodado sem registro; negativo = hodômetro regressivo. Nulo = sem divergência. Gravado só no INSERT.';
comment on column public.trips.off_hours is 'true quando a viagem iniciou fora do expediente, em dia sem expediente ou feriado, SEM autorização vigente. Gravado só no INSERT; nunca bloqueia a viagem.';
comment on column public.trips.off_hours_authorization_id is 'Autorização prévia fora do horário que cobria esta viagem (rastreabilidade); quando preenchida, off_hours fica false.';

-- 4. trips: marcação em BEFORE INSERT ─────────────────────────────────────────
create or replace function public.tf_trip_alerts_mark()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tol        integer;
  v_prev_end   integer;
  v_gap        integer;
  v_dept       uuid;
  v_ts         timestamptz := coalesce(new.start_at, now());
  v_local      timestamp := (coalesce(new.start_at, now()) at time zone 'America/Sao_Paulo');
  v_dow        smallint := extract(dow from (coalesce(new.start_at, now()) at time zone 'America/Sao_Paulo'))::smallint;
  v_has_sched  boolean;
  v_use_dept   boolean;
  v_in_hours   boolean;
  v_holiday    boolean;
  v_auth       uuid;
begin
  if new.tenant_id is null or new.status::text = 'cancelada' then
    return new;
  end if;

  -- 4.1 Salto de km ─────────────────────────────────────────────────────────
  if new.start_odometer is not null then
    select t.end_odometer into v_prev_end
      from public.trips t
     where t.vehicle_id = new.vehicle_id
       and t.status::text = 'concluida'
       and t.end_odometer is not null
       and t.start_at < v_ts
     order by t.start_at desc
     limit 1;

    if v_prev_end is not null then
      select coalesce(te.km_gap_tolerance, 5) into v_tol from public.tenants te where te.id = new.tenant_id;
      v_gap := new.start_odometer - v_prev_end;
      if v_gap > coalesce(v_tol, 5) or v_gap < 0 then
        new.odometer_gap_km := v_gap;
      end if;
    end if;
  end if;

  -- 4.2 Fora do expediente ──────────────────────────────────────────────────
  select exists (select 1 from public.work_schedules w where w.tenant_id = new.tenant_id) into v_has_sched;
  if not v_has_sched then
    return new;  -- recurso desligado até o tenant cadastrar um expediente
  end if;

  select v.department_id into v_dept from public.vehicles v where v.id = new.vehicle_id;

  -- Expediente da secretaria do veículo, se ela tiver algum cadastrado; senão o padrão do tenant.
  select exists (select 1 from public.work_schedules w
                  where w.tenant_id = new.tenant_id and v_dept is not null and w.department_id = v_dept)
    into v_use_dept;

  select exists (
    select 1 from public.work_schedules w
     where w.tenant_id = new.tenant_id
       and w.weekday = v_dow
       and (case when v_use_dept then w.department_id = v_dept else w.department_id is null end)
       and v_local::time >= w.start_time
       and v_local::time <= w.end_time
  ) into v_in_hours;

  select exists (select 1 from public.holidays h
                  where h.tenant_id = new.tenant_id and h.date = v_local::date)
    into v_holiday;

  if v_in_hours and not v_holiday then
    return new;
  end if;

  select a.id into v_auth
    from public.off_hours_authorizations a
   where a.tenant_id = new.tenant_id
     and a.vehicle_id = new.vehicle_id
     and (a.driver_id is null or a.driver_id = new.driver_id)
     and a.revoked_at is null
     and v_ts between a.valid_from and a.valid_to
   order by a.created_at desc
   limit 1;

  if v_auth is not null then
    new.off_hours_authorization_id := v_auth;   -- coberta: registra, mas não marca como irregular
  else
    new.off_hours := true;
  end if;

  return new;
end $$;

comment on function public.tf_trip_alerts_mark() is 'BEFORE INSERT em trips: preenche odometer_gap_km (salto/regressão de km vs. última viagem concluída do veículo) e off_hours/off_hours_authorization_id (uso fora do expediente, fim de semana ou feriado sem autorização). Nunca lança exceção por regra de negócio: só marca.';

-- Nome com 'zz' para rodar DEPOIS de trg_tenant e trg_trip_insert_guard.
drop trigger if exists trg_trip_zz_alerts_mark on public.trips;
create trigger trg_trip_zz_alerts_mark
  before insert on public.trips
  for each row execute function public.tf_trip_alerts_mark();

-- 5. trips: notificação em AFTER INSERT ──────────────────────────────────────
create or replace function public.tf_trip_alerts_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_plate  text;
  v_driver text;
  v_link   text := '/trip-detail?id=' || new.id::text;
begin
  -- Lancamento retroativo (folhas de papel da transicao): fica marcado na
  -- viagem e aparece no dashboard, mas nao dispara notificacao em massa.
  if new.tenant_id is null
     or coalesce(new.is_retroactive, false)
     or (new.odometer_gap_km is null and not new.off_hours) then
    return new;
  end if;

  select v.plate into v_plate from public.vehicles v where v.id = new.vehicle_id;
  select p.full_name into v_driver from public.profiles p where p.id = new.driver_id;

  if new.odometer_gap_km is not null and new.odometer_gap_km < 0 then
    perform public.notify_fleet_managers(
      new.tenant_id, 'alert',
      'Hodômetro regressivo entre viagens',
      'A viagem do veículo ' || coalesce(v_plate, 'sem placa') || ' iniciou com '
        || new.start_odometer || ' km, ' || abs(new.odometer_gap_km)
        || ' km a menos que o fim da viagem anterior (motorista: ' || coalesce(v_driver, 'desconhecido') || ').',
      v_link, 'viagem_km_regressivo', new.id);
  elsif new.odometer_gap_km is not null then
    perform public.notify_fleet_managers(
      new.tenant_id, 'warning',
      'Km sem registro entre viagens',
      new.odometer_gap_km || ' km sem registro entre viagens do veículo ' || coalesce(v_plate, 'sem placa')
        || ' (motorista: ' || coalesce(v_driver, 'desconhecido') || ').',
      v_link, 'viagem_salto_km', new.id);
  end if;

  if new.off_hours then
    perform public.notify_fleet_managers(
      new.tenant_id, 'warning',
      'Viagem fora do expediente sem autorização',
      'O veículo ' || coalesce(v_plate, 'sem placa') || ' saiu fora do expediente, em dia sem expediente ou feriado, '
        || 'sem autorização prévia (motorista: ' || coalesce(v_driver, 'desconhecido') || ').',
      v_link, 'viagem_fora_expediente', new.id);
  end if;

  return new;
end $$;

comment on function public.tf_trip_alerts_notify() is 'AFTER INSERT em trips: notifica gestores/admins do tenant (notify_fleet_managers) sobre salto de km, km regressivo e uso fora do expediente sem autorização.';

drop trigger if exists trg_trip_zz_alerts_notify on public.trips;
create trigger trg_trip_zz_alerts_notify
  after insert on public.trips
  for each row execute function public.tf_trip_alerts_notify();

-- 6. fuelings: consumo anômalo ───────────────────────────────────────────────
-- anomaly_type é text livre (sem CHECK/enum): não exige ajuste de constraint.
-- Precedência: uma anomalia JÁ existente (ex.: volume acima do tanque) nunca é
-- sobrescrita; 'consumo_baixo' é acrescentado ao texto existente. Hodômetro
-- regressivo e rejeição não têm km_per_liter, logo não se sobrepõem a esta regra.
create or replace function public.tf_fuelings_consumption_check()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tol  integer;
  v_avg  numeric;
  v_n    integer;
begin
  if new.km_per_liter is null or new.km_per_liter <= 0
     or not coalesce(new.full_tank, false)
     or new.vehicle_id is null or new.tenant_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.km_per_liter is not distinct from old.km_per_liter then
    return new;  -- só avalia quando o km/L foi calculado/alterado
  end if;

  select coalesce(te.consumption_tolerance_pct, 25) into v_tol
    from public.tenants te where te.id = new.tenant_id;

  select avg(h.km_per_liter), count(*) into v_avg, v_n
    from (
      select f.km_per_liter
        from public.fuelings f
       where f.vehicle_id = new.vehicle_id
         and f.id <> new.id
         and f.full_tank
         and f.km_per_liter is not null and f.km_per_liter > 0
         and f.workflow_status in ('validado', 'lancado_direto')
       order by coalesce(f.filled_at, f.created_at) desc
       limit 5
    ) h;

  if v_n < 3 or v_avg is null then
    return new;  -- histórico insuficiente
  end if;

  if new.km_per_liter < v_avg * (100 - coalesce(v_tol, 25)) / 100.0 then
    if coalesce(new.has_anomaly, false) and nullif(btrim(coalesce(new.anomaly_type, '')), '') is not null then
      if new.anomaly_type not like '%consumo_baixo%' then
        new.anomaly_type := new.anomaly_type || '; consumo_baixo';
      end if;
    else
      new.has_anomaly := true;
      new.anomaly_type := 'consumo_baixo';
    end if;
  end if;

  return new;
end $$;

comment on function public.tf_fuelings_consumption_check() is 'BEFORE INSERT/UPDATE em fuelings: se o km/L (calculado pelas RPCs de validação/lançamento direto) ficar abaixo de (100 - tenants.consumption_tolerance_pct)% da média dos últimos 5 abastecimentos de tanque cheio do veículo (mínimo 3), marca has_anomaly=true e anomaly_type=consumo_baixo, sem sobrescrever anomalia existente. A notificação é feita por tg_notify_fueling.';

-- Prefixo trg_fuelings_z...: roda depois dos guards (trg_fuelings_guard etc.).
drop trigger if exists trg_fuelings_zz_consumption on public.fuelings;
create trigger trg_fuelings_zz_consumption
  before insert or update on public.fuelings
  for each row execute function public.tf_fuelings_consumption_check();

-- 7. get_dashboard_alerts ─────────────────────────────────────────────────────
-- O wrapper público (public.get_dashboard_alerts) continua intacto: ele valida
-- o acesso e delega a esta função. Redefinimos o corpo ORIGINAL preservando
-- todos os alertas existentes e acrescentando os três novos no final.
create or replace function sgf_private.rpc_original__get_dashboard_alerts()
returns table(kind text, severity text, title text, detail text, count bigint, link text)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_tenant uuid := get_user_tenant_id();
begin
  if v_tenant is null then raise exception 'Usuário sem prefeitura vinculada'; end if;

  return query
  -- CNH vencida é impedimento legal para dirigir: vem sempre primeiro.
  select 'cnh_vencida', 'critical',
         'CNH vencida', 'Motorista(s) sem habilitação válida para dirigir',
         count(*), '/motoristas'
    from public.profiles
   where tenant_id = v_tenant and role = 'motorista'
     and driver_status = 'ativo' and cnh_expiry is not null and cnh_expiry < current_date
  having count(*) > 0;

  return query
  select 'cnh_vencendo', 'warning',
         'CNH vencendo em 30 dias', 'Programe a renovação antes de escalar',
         count(*), '/motoristas'
    from public.profiles
   where tenant_id = v_tenant and role = 'motorista'
     and driver_status = 'ativo'
     and cnh_expiry between current_date and current_date + 30
  having count(*) > 0;

  return query
  select 'contrato_posto', 'warning',
         'Contrato de posto vencendo', 'Abastecer sem cobertura contratual é irregular',
         count(*), '/postos'
    from public.fuel_stations
   where tenant_id = v_tenant and is_active
     and contract_end is not null and contract_end <= current_date + 30
  having count(*) > 0;

  return query
  select 'contrato_oficina', 'warning',
         'Contrato de oficina vencendo', 'Enviar veículo sem contrato vigente é irregular',
         count(*), '/oficinas'
    from public.repair_shops
   where tenant_id = v_tenant and is_active
     and contract_end is not null and contract_end <= current_date + 30
  having count(*) > 0;

  return query
  select 'os_orcamento', 'info',
         'Orçamento aguardando aprovação', 'A oficina está parada esperando sua resposta',
         count(*), '/manutencoes'
    from public.service_orders
   where tenant_id = v_tenant and operational_status = 'awaiting_quote_approval'
  having count(*) > 0;

  return query
  select 'os_empenho', 'info',
         'OS aguardando empenho', 'O serviço não começa sem a reserva orçamentária',
         count(*), '/manutencoes'
    from public.service_orders
   where tenant_id = v_tenant and financial_status = 'awaiting_commitment'
  having count(*) > 0;

  return query
  select 'os_retirada', 'info',
         'Veículo pronto para retirada', 'A oficina concluiu e aguarda a conferência',
         count(*), '/manutencoes'
    from public.service_orders
   where tenant_id = v_tenant and operational_status = 'ready'
  having count(*) > 0;

  return query
  select 'abast_validar', 'info',
         'Abastecimento aguardando validação', 'O posto registrou e espera sua conferência',
         count(*), '/abastecimentos'
    from public.fuelings
   where tenant_id = v_tenant and workflow_status = 'concluido'
  having count(*) > 0;

  return query
  select 'abast_anomalia', 'warning',
         'Abastecimento com divergência', 'Consumo ou hodômetro fora do padrão',
         count(*), '/abastecimentos'
    from public.fuelings
   where tenant_id = v_tenant and has_anomaly
     and created_at >= now() - interval '30 days'
  having count(*) > 0;

  -- Item crítico reprovado no checklist: é o sinal mais barato de quebra
  -- iminente, e hoje não aparece em lugar nenhum do dashboard.
  return query
  select 'checklist_critico', 'critical',
         'Checklist com item crítico', 'Freios, pneus ou luzes reprovados nos últimos 7 dias',
         count(distinct c.id), '/checklists'
    from public.checklists c
    join public.checklist_items i on i.checklist_id = c.id
   where c.tenant_id = v_tenant
     and i.state = 'atencao' and i.item_key in ('freios','pneus','luzes')
     and c.created_at >= now() - interval '7 days'
  having count(distinct c.id) > 0;

  return query
  select 'veiculo_bloqueado', 'warning',
         'Veículo bloqueado', 'Fora de operação até liberação',
         count(*), '/veiculos'
    from public.vehicles
   where tenant_id = v_tenant and status = 'bloqueado'
  having count(*) > 0;

  -- ── P1.4–P1.6 (novos) ──────────────────────────────────────────────────────
  return query
  select 'km_regressivo', 'critical',
         'Hodômetro regressivo entre viagens', 'Viagem iniciou com km menor que o fim da anterior (últimos 30 dias)',
         count(*), '/viagens'
    from public.trips
   where tenant_id = v_tenant and odometer_gap_km < 0 and status <> 'cancelada'
     and start_at >= now() - interval '30 days'
  having count(*) > 0;

  return query
  select 'salto_km', 'warning',
         'Km sem registro entre viagens', 'Veículo rodou além da tolerância sem viagem registrada (últimos 30 dias)',
         count(*), '/viagens'
    from public.trips
   where tenant_id = v_tenant and odometer_gap_km > 0 and status <> 'cancelada'
     and start_at >= now() - interval '30 days'
  having count(*) > 0;

  return query
  select 'fora_expediente', 'warning',
         'Uso fora do expediente sem autorização', 'Viagens em horário, fim de semana ou feriado sem autorização prévia (últimos 30 dias)',
         count(*), '/viagens'
    from public.trips
   where tenant_id = v_tenant and off_hours and status <> 'cancelada'
     and start_at >= now() - interval '30 days'
  having count(*) > 0;

  -- Já entra também em abast_anomalia (has_anomaly); este item isola o consumo.
  return query
  select 'abast_consumo_baixo', 'warning',
         'Consumo abaixo da média do veículo', 'km/L muito inferior à média dos últimos abastecimentos (últimos 30 dias)',
         count(*), '/abastecimentos'
    from public.fuelings
   where tenant_id = v_tenant and has_anomaly
     and anomaly_type like '%consumo_baixo%'
     and created_at >= now() - interval '30 days'
  having count(*) > 0;
end;
$function$;

comment on function sgf_private.rpc_original__get_dashboard_alerts() is 'Corpo de public.get_dashboard_alerts: alertas do dashboard do tenant do usuário. Inclui, desde P1.4-P1.6, km_regressivo, salto_km, fora_expediente e abast_consumo_baixo.';
