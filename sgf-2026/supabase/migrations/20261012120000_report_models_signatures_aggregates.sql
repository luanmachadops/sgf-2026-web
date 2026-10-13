-- Aplicada em produção em 2026-10-12 (aprovada pelo usuário). O apply_migration
-- do MCP excedia o tempo limite; o SQL foi executado em partes, com
-- lock_timeout, e registrado em supabase_migrations.schema_migrations.
-- Relatórios (PLANO-RELATORIOS.md, D2/D3/D5). Só acrescenta objetos:
--   1) app_settings.report_signatures — assinaturas padrão da prefeitura
--   2) report_layout_models — modelos de layout compartilhados por prefeitura
--   3) get_report_department_consolidated / get_report_vehicle_cost —
--      agregações no Postgres (antes o navegador baixava as tabelas inteiras)
--   4) mapeamento dos novos recursos no filtro de módulos da API
-- As funções de agregação são SECURITY INVOKER: valem o RLS e o filtro de
-- módulos de cada tabela, exatamente como as consultas que substituem.

-- ---------------------------------------------------------------------
-- 1) Assinaturas padrão dos relatórios
-- ---------------------------------------------------------------------
alter table public.app_settings
  add column if not exists report_signatures jsonb not null default '[]'::jsonb;

alter table public.app_settings
  drop constraint if exists app_settings_report_signatures_shape;
alter table public.app_settings
  add constraint app_settings_report_signatures_shape check (
    jsonb_typeof(report_signatures) = 'array'
    and jsonb_array_length(report_signatures) <= 6
    and pg_column_size(report_signatures) <= 4096
  );

comment on column public.app_settings.report_signatures is
  'Assinaturas padrão dos relatórios em PDF: [{"name": "...", "role": "..."}], no máximo 6.';

-- ---------------------------------------------------------------------
-- 2) Modelos de layout compartilhados
-- ---------------------------------------------------------------------
create table if not exists public.report_layout_models (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default public.get_user_tenant_id() references public.tenants(id),
  report_id  text not null check (report_id ~ '^[a-z0-9-]{1,80}$'),
  name       text not null check (length(btrim(name)) between 1 and 60),
  config     jsonb not null check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 8192),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, report_id, name)
);

create index if not exists report_layout_models_tenant_report_idx
  on public.report_layout_models (tenant_id, report_id);

comment on table public.report_layout_models is
  'Modelos de layout de relatório (campos, ordem, agrupamento, impressão) compartilhados pela prefeitura.';

alter table public.report_layout_models enable row level security;

drop policy if exists active_session_read on public.report_layout_models;
create policy active_session_read on public.report_layout_models
  as restrictive for select
  using ((select sgf_private.resource_allowed('report_layout_models'::text, false)));

drop policy if exists active_session_insert on public.report_layout_models;
create policy active_session_insert on public.report_layout_models
  as restrictive for insert
  with check ((select sgf_private.resource_allowed('report_layout_models'::text, true)));

drop policy if exists active_session_update on public.report_layout_models;
create policy active_session_update on public.report_layout_models
  as restrictive for update
  using ((select sgf_private.resource_allowed('report_layout_models'::text, true)))
  with check ((select sgf_private.resource_allowed('report_layout_models'::text, true)));

drop policy if exists active_session_delete on public.report_layout_models;
create policy active_session_delete on public.report_layout_models
  as restrictive for delete
  using ((select sgf_private.resource_allowed('report_layout_models'::text, true)));

-- Todos da prefeitura veem os modelos.
drop policy if exists report_layout_models_select on public.report_layout_models;
create policy report_layout_models_select on public.report_layout_models
  for select to authenticated
  using (public.is_superadmin() or tenant_id = public.get_user_tenant_id());

-- Qualquer usuário do painel cria modelos para a própria prefeitura.
drop policy if exists report_layout_models_insert on public.report_layout_models;
create policy report_layout_models_insert on public.report_layout_models
  for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id() and created_by = auth.uid());

-- Altera/exclui quem criou, ou admin/gestor da prefeitura.
drop policy if exists report_layout_models_update on public.report_layout_models;
create policy report_layout_models_update on public.report_layout_models
  for update to authenticated
  using (tenant_id = public.get_user_tenant_id() and (created_by = auth.uid() or public.is_admin_or_manager()))
  with check (tenant_id = public.get_user_tenant_id());

drop policy if exists report_layout_models_delete on public.report_layout_models;
create policy report_layout_models_delete on public.report_layout_models
  for delete to authenticated
  using (tenant_id = public.get_user_tenant_id() and (created_by = auth.uid() or public.is_admin_or_manager()));

revoke all on public.report_layout_models from anon, authenticated;
grant select, insert, update, delete on public.report_layout_models to authenticated;

-- ---------------------------------------------------------------------
-- 3) Agregações dos relatórios
-- ---------------------------------------------------------------------
-- Período: [p_from, p_to] em timestamptz; null = sem limite.
-- Regras (as mesmas do relatório no navegador, ver reportData.ts):
--   combustível = abastecimentos validados/lançados direto, pela data efetiva
--                 (filled_at, senão created_at);
--   viagens/km  = viagens concluídas ou com anomalia, pela saída (start_at);
--   manutenção  = custo final (senão orçamento) das OS recebidas/concluídas,
--                 pela competência (recebimento, senão conclusão, senão abertura);
--   multas      = valor das infrações ocorridas no período;
--   veículos e disponibilidade = situação atual.

create or replace function public.get_report_department_consolidated(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_department uuid default null
)
returns table (
  department_id uuid,
  department text,
  vehicles integer,
  available integer,
  trips integer,
  km numeric,
  fuel numeric,
  maintenance numeric,
  fines numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with veh as (
    select v.id, v.department_id, v.status from public.vehicles v
  ),
  fuel as (
    select veh.department_id, sum(f.total_cost) as total
      from public.fuelings f join veh on veh.id = f.vehicle_id
     where f.workflow_status in ('validado', 'lancado_direto')
       and (p_from is null or coalesce(f.filled_at, f.created_at) >= p_from)
       and (p_to is null or coalesce(f.filled_at, f.created_at) <= p_to)
     group by veh.department_id
  ),
  trip as (
    select veh.department_id, count(*) as trips, sum(coalesce(t.distance_km, 0)) as km
      from public.trips t join veh on veh.id = t.vehicle_id
     where t.status in ('concluida', 'problema')
       and (p_from is null or t.start_at >= p_from)
       and (p_to is null or t.start_at <= p_to)
     group by veh.department_id
  ),
  maint as (
    select veh.department_id, sum(coalesce(o.cost, o.budget, 0)) as total
      from public.service_orders o join veh on veh.id = o.vehicle_id
     where (o.operational_status = 'received' or o.status = 'concluida')
       and (p_from is null or coalesce(o.received_at, o.completed_at, o.created_at) >= p_from)
       and (p_to is null or coalesce(o.received_at, o.completed_at, o.created_at) <= p_to)
     group by veh.department_id
  ),
  fine as (
    select veh.department_id, sum(coalesce(i.amount, 0)) as total
      from public.infractions i join veh on veh.id = i.vehicle_id
     where (p_from is null or i.occurred_at >= p_from)
       and (p_to is null or i.occurred_at <= p_to)
     group by veh.department_id
  )
  select d.id,
         d.name,
         (select count(*) from veh where veh.department_id = d.id)::integer,
         (select count(*) from veh where veh.department_id = d.id and veh.status = 'liberado')::integer,
         coalesce(trip.trips, 0)::integer,
         coalesce(trip.km, 0),
         coalesce(fuel.total, 0),
         coalesce(maint.total, 0),
         coalesce(fine.total, 0)
    from public.departments d
    left join trip  on trip.department_id  = d.id
    left join fuel  on fuel.department_id  = d.id
    left join maint on maint.department_id = d.id
    left join fine  on fine.department_id  = d.id
   where p_department is null or d.id = p_department
   order by d.name, d.id
$$;

create or replace function public.get_report_vehicle_cost(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_department uuid default null
)
returns table (
  vehicle_id uuid,
  plate text,
  brand text,
  model text,
  department text,
  trips integer,
  km numeric,
  liters numeric,
  fuel numeric,
  maintenance numeric,
  fines numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with fuel as (
    select f.vehicle_id, sum(coalesce(f.liters, 0)) as liters, sum(coalesce(f.total_cost, 0)) as total
      from public.fuelings f
     where f.workflow_status in ('validado', 'lancado_direto')
       and (p_from is null or coalesce(f.filled_at, f.created_at) >= p_from)
       and (p_to is null or coalesce(f.filled_at, f.created_at) <= p_to)
     group by f.vehicle_id
  ),
  trip as (
    select t.vehicle_id, count(*) as trips, sum(coalesce(t.distance_km, 0)) as km
      from public.trips t
     where t.status in ('concluida', 'problema')
       and (p_from is null or t.start_at >= p_from)
       and (p_to is null or t.start_at <= p_to)
     group by t.vehicle_id
  ),
  maint as (
    select o.vehicle_id, sum(coalesce(o.cost, o.budget, 0)) as total
      from public.service_orders o
     where (o.operational_status = 'received' or o.status = 'concluida')
       and (p_from is null or coalesce(o.received_at, o.completed_at, o.created_at) >= p_from)
       and (p_to is null or coalesce(o.received_at, o.completed_at, o.created_at) <= p_to)
     group by o.vehicle_id
  ),
  fine as (
    select i.vehicle_id, sum(coalesce(i.amount, 0)) as total
      from public.infractions i
     where (p_from is null or i.occurred_at >= p_from)
       and (p_to is null or i.occurred_at <= p_to)
     group by i.vehicle_id
  )
  select v.id,
         v.plate,
         v.brand,
         v.model,
         d.name,
         coalesce(trip.trips, 0)::integer,
         coalesce(trip.km, 0),
         coalesce(fuel.liters, 0),
         coalesce(fuel.total, 0),
         coalesce(maint.total, 0),
         coalesce(fine.total, 0)
    from public.vehicles v
    left join public.departments d on d.id = v.department_id
    left join trip  on trip.vehicle_id  = v.id
    left join fuel  on fuel.vehicle_id  = v.id
    left join maint on maint.vehicle_id = v.id
    left join fine  on fine.vehicle_id  = v.id
   where p_department is null or v.department_id = p_department
   order by v.plate, v.id
$$;

revoke all on function public.get_report_department_consolidated(timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.get_report_vehicle_cost(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.get_report_department_consolidated(timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.get_report_vehicle_cost(timestamptz, timestamptz, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Filtro de módulos da API: mantém todos os casos atuais e acrescenta
--    os recursos de relatório desta migration.
-- ---------------------------------------------------------------------
create or replace function sgf_private.resource_modules(p_resource text, p_write boolean)
returns text[]
language sql
immutable
set search_path to ''
as $function$
select case
  -- Relatórios (2026-10-12): modelos compartilhados e agregações.
  when p_resource in ('report_layout_models','get_report_department_consolidated','get_report_vehicle_cost') then array['reports']::text[]
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
