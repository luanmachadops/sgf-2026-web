-- ─────────────────────────────────────────────────────────────────────────────
-- Registro de deslocamento para auditoria / TCE (finalidade pública).
--
-- NÃO APLICADA ainda: requer aprovação explícita (DDL em produção).
--
-- Compatibilidade: todas as colunas novas são nulas/default. O app atual faz
-- INSERT direto em `trips` (sem RPC) sem origin/purpose; por isso a exigência
-- é controlada por `tenants.require_trip_purpose` (default false) dentro do
-- trigger `tf_trip_insert_guard`. Com a flag false nada muda.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Enums ────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'trip_purpose_category') then
    create type public.trip_purpose_category as enum (
      'saude', 'educacao', 'transporte_escolar', 'obras_servicos',
      'administrativo', 'assistencia_social', 'seguranca', 'agricultura', 'outro'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'checklist_fuel_level') then
    create type public.checklist_fuel_level as enum (
      'vazio', 'um_quarto', 'meio', 'tres_quartos', 'cheio'
    );
  end if;
end $$;

-- 2. trips: finalidade do deslocamento ────────────────────────────────────────
alter table public.trips
  add column if not exists origin text,
  add column if not exists purpose text,
  add column if not exists purpose_category public.trip_purpose_category,
  add column if not exists passenger_count integer,
  add column if not exists passengers jsonb not null default '[]'::jsonb,
  add column if not exists cargo_description text;

alter table public.trips
  drop constraint if exists trips_passenger_count_check,
  add constraint trips_passenger_count_check check (passenger_count is null or passenger_count >= 0);

alter table public.trips
  drop constraint if exists trips_passengers_is_array,
  add constraint trips_passengers_is_array check (jsonb_typeof(passengers) = 'array');

comment on column public.trips.origin is 'Local de origem (saída) do deslocamento, em texto livre.';
comment on column public.trips.purpose is 'Finalidade pública do deslocamento (motivo/justificativa), exigida pelo controle externo (TCE). Mínimo de 10 caracteres quando o município exige.';
comment on column public.trips.purpose_category is 'Categoria da finalidade pública do deslocamento (saúde, educação, etc.).';
comment on column public.trips.passenger_count is 'Quantidade de passageiros transportados, sem contar o condutor.';
comment on column public.trips.passengers is 'Lista de passageiros em JSON: [{"nome": "...", "documento": "..."}]; documento é opcional.';
comment on column public.trips.cargo_description is 'Descrição da carga transportada (materiais, equipamentos, medicamentos etc.), quando houver.';

-- 3. trip_stops: paradas da viagem ────────────────────────────────────────────
create table if not exists public.trip_stops (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.get_user_tenant_id() references public.tenants(id),
  trip_id     uuid not null references public.trips(id) on delete restrict,
  seq         integer not null check (seq >= 1),
  description text,
  lat         double precision,
  lng         double precision,
  arrived_at  timestamptz,
  left_at     timestamptz,
  source      text not null default 'declarada' check (source in ('declarada', 'gps')),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create index if not exists trip_stops_trip_seq_idx on public.trip_stops (trip_id, seq);
create index if not exists trip_stops_tenant_idx on public.trip_stops (tenant_id);

comment on table public.trip_stops is 'Paradas/destinos intermediários de uma viagem, declaradas pelo motorista ou detectadas por GPS. Sem DELETE (trilha de auditoria).';
comment on column public.trip_stops.tenant_id is 'Prefeitura (tenant) dona do registro; preenchido pelo usuário autenticado.';
comment on column public.trip_stops.trip_id is 'Viagem à qual a parada pertence (FK com ON DELETE RESTRICT).';
comment on column public.trip_stops.seq is 'Ordem da parada dentro da viagem, começando em 1.';
comment on column public.trip_stops.description is 'Descrição do local/motivo da parada.';
comment on column public.trip_stops.lat is 'Latitude da parada (graus decimais).';
comment on column public.trip_stops.lng is 'Longitude da parada (graus decimais).';
comment on column public.trip_stops.arrived_at is 'Data/hora de chegada à parada.';
comment on column public.trip_stops.left_at is 'Data/hora de saída da parada.';
comment on column public.trip_stops.source is 'Origem do registro: declarada (informada pelo motorista) ou gps (detectada pelo rastreamento).';
comment on column public.trip_stops.created_by is 'Usuário que criou o registro (auth.uid()).';
comment on column public.trip_stops.created_at is 'Data/hora de criação do registro.';

alter table public.trip_stops enable row level security;

-- Sessão ativa / módulos permitidos (mesmo padrão restritivo das demais tabelas).
drop policy if exists active_session_read on public.trip_stops;
create policy active_session_read on public.trip_stops
  as restrictive for select
  using ((select sgf_private.resource_allowed('trip_stops'::text, false)));

drop policy if exists active_session_insert on public.trip_stops;
create policy active_session_insert on public.trip_stops
  as restrictive for insert
  with check ((select sgf_private.resource_allowed('trip_stops'::text, true)));

drop policy if exists active_session_update on public.trip_stops;
create policy active_session_update on public.trip_stops
  as restrictive for update
  using ((select sgf_private.resource_allowed('trip_stops'::text, true)))
  with check ((select sgf_private.resource_allowed('trip_stops'::text, true)));

-- Gestores do tenant (e superadmin) veem tudo.
drop policy if exists trip_stops_admin_manager_select_all on public.trip_stops;
create policy trip_stops_admin_manager_select_all on public.trip_stops
  for select
  using (public.is_superadmin() or (public.is_admin_or_manager() and tenant_id = public.get_user_tenant_id()));

-- Motorista vê as paradas das próprias viagens.
drop policy if exists trip_stops_select_own on public.trip_stops;
create policy trip_stops_select_own on public.trip_stops
  for select
  using (exists (
    select 1 from public.trips t
     where t.id = trip_stops.trip_id and t.driver_id = auth.uid()
  ));

-- Motorista insere paradas apenas nas próprias viagens em andamento.
drop policy if exists trip_stops_insert_own on public.trip_stops;
create policy trip_stops_insert_own on public.trip_stops
  for insert
  with check (
    tenant_id = public.get_user_tenant_id()
    and exists (
      select 1 from public.trips t
       where t.id = trip_stops.trip_id
         and t.driver_id = auth.uid()
         and t.status = 'andamento'
         and t.tenant_id = trip_stops.tenant_id
    )
  );

-- Motorista atualiza (ex.: registrar left_at) apenas nas próprias viagens em andamento.
drop policy if exists trip_stops_update_own on public.trip_stops;
create policy trip_stops_update_own on public.trip_stops
  for update
  using (exists (
    select 1 from public.trips t
     where t.id = trip_stops.trip_id and t.driver_id = auth.uid() and t.status = 'andamento'
  ))
  with check (exists (
    select 1 from public.trips t
     where t.id = trip_stops.trip_id and t.driver_id = auth.uid() and t.status = 'andamento'
  ));

-- Gestores corrigem registros do tenant. NÃO há policy de DELETE.
drop policy if exists trip_stops_admin_manager_update on public.trip_stops;
create policy trip_stops_admin_manager_update on public.trip_stops
  for update
  using (public.is_superadmin() or (public.is_admin_or_manager() and tenant_id = public.get_user_tenant_id()))
  with check (public.is_superadmin() or (public.is_admin_or_manager() and tenant_id = public.get_user_tenant_id()));

-- (Sem trigger de activity_log: tf_activity_log não conhece 'trip_stop' e o
-- ramo genérico depende de vehicle_id, que não existe nesta tabela. A trilha de
-- auditoria é dada por created_by/created_at + ausência de DELETE.)

-- 4. tenants.require_trip_purpose + guard ─────────────────────────────────────
alter table public.tenants
  add column if not exists require_trip_purpose boolean not null default false;

comment on column public.tenants.require_trip_purpose is 'Quando true, toda viagem nova exige origem, finalidade (mín. 10 caracteres) e categoria da finalidade (guarda TRIP_GUARD_PURPOSE_MISSING).';

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
begin
  select p.access_blocked, p.driver_status, p.cnh_expiry
    into v_driver
    from public.profiles p
   where p.id = new.driver_id;

  if not found then
    raise exception 'TRIP_GUARD_DRIVER_NOT_FOUND: motorista nao encontrado.'
      using errcode = 'TR001';
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

  -- Finalidade pública (TCE): só vale para tenants com a flag ligada.
  -- tenant_id já vem preenchido por trg_tenant (BEFORE INSERT, roda antes deste
  -- trigger por ordem alfabética); se faltar, resolve pelo veículo.
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

-- 5. P1: checklist e abastecimento ────────────────────────────────────────────
alter table public.checklists
  add column if not exists fuel_level public.checklist_fuel_level,
  add column if not exists spare_tire_ok boolean,
  add column if not exists safety_items jsonb;

comment on column public.checklists.fuel_level is 'Nível de combustível observado no checklist (vazio, 1/4, 1/2, 3/4, cheio).';
comment on column public.checklists.spare_tire_ok is 'Estepe presente e em condições de uso (true/false); nulo se não verificado.';
comment on column public.checklists.safety_items is 'Itens de segurança conferidos (triângulo, extintor, macaco, chave de roda etc.) em JSON: {"extintor": true, ...}.';

alter table public.checklist_items
  add column if not exists damage_description text,
  add column if not exists photo_urls text[] not null default '{}';

comment on column public.checklist_items.damage_description is 'Descrição da avaria/problema encontrado no item do checklist.';
comment on column public.checklist_items.photo_urls is 'Fotos que evidenciam a avaria do item (caminhos no storage).';

alter table public.fuelings
  add column if not exists invoice_number text,
  add column if not exists nfce_access_key text;

alter table public.fuelings
  drop constraint if exists fuelings_nfce_access_key_check,
  add constraint fuelings_nfce_access_key_check check (nfce_access_key is null or nfce_access_key ~ '^[0-9]{44}$');

comment on column public.fuelings.invoice_number is 'Número da nota/cupom fiscal do abastecimento.';
comment on column public.fuelings.nfce_access_key is 'Chave de acesso da NFC-e (44 dígitos numéricos).';
