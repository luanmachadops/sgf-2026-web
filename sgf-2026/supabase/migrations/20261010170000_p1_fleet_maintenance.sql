-- ─────────────────────────────────────────────────────────────────────────────
-- P1.8 + P1.9 — Manutencao preventiva por km/tempo e classificacao da frota
-- (propria x locada x cedida x comodato, contrato de locacao, centro de custo).
--
-- Aplicada em produção em 2026-10-09 com aprovação do usuário.
--
-- Decisoes:
--  * Nao usa a tabela morta `maintenances`; a preventiva vive em
--    maintenance_plans e a execucao continua em service_orders.
--  * vehicles.vehicle_type e texto livre (sem categoria) => plano e sempre por
--    veiculo (vehicle_id obrigatorio).
--  * Sem DELETE em nenhuma tabela nova (planos se desativam; contratos se
--    encerram com ended_at).
--  * O estado de aviso (last_notified_*) fica no proprio plano; o trigger de
--    auditoria e `UPDATE OF <colunas de negocio>` para o cron nao gerar ruido
--    no activity_log.
--  * RPCs/tabelas novas precisam ser mapeadas em sgf_private.resource_modules
--    (negado por padrao) — migration separada, ver relatorio.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── A1) Classificacao do veiculo ────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'vehicle_ownership') then
    create type public.vehicle_ownership as enum ('proprio', 'locado', 'cedido', 'comodato');
  end if;
end $$;

alter table public.vehicles
  add column if not exists ownership public.vehicle_ownership not null default 'proprio';

comment on type public.vehicle_ownership is
  'Vinculo do veiculo com o municipio: proprio, locado (contrato de locacao), cedido (cedido por outro ente) ou comodato.';
comment on column public.vehicles.ownership is
  'Frota propria x locada x cedida x comodato (P1.9). Veiculos existentes ficam como proprio.';

-- ── A2) Centros de custo ────────────────────────────────────────────────────
create table if not exists public.cost_centers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default public.get_user_tenant_id() references public.tenants(id),
  code          text not null check (length(btrim(code)) > 0),
  name          text not null check (length(btrim(name)) > 0),
  department_id uuid references public.departments(id),
  active        boolean not null default true,
  created_by    uuid default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now(),
  constraint cost_centers_tenant_code_key unique (tenant_id, code)
);
create index if not exists cost_centers_tenant_idx on public.cost_centers (tenant_id, active);

alter table public.vehicles
  add column if not exists cost_center_id uuid references public.cost_centers(id);
create index if not exists vehicles_cost_center_idx on public.vehicles (cost_center_id) where cost_center_id is not null;

comment on table  public.cost_centers is 'Centros de custo do municipio (codigo + nome, opcionalmente ligados a uma secretaria). Usados para ratear despesas da frota nos relatorios.';
comment on column public.cost_centers.code is 'Codigo contabil do centro de custo; unico por tenant.';
comment on column public.cost_centers.department_id is 'Secretaria dona do centro de custo (opcional).';
comment on column public.cost_centers.active is 'Centro inativo nao deve ser oferecido para novos veiculos; nao ha DELETE.';
comment on column public.vehicles.cost_center_id is 'Centro de custo ao qual as despesas do veiculo sao atribuidas (P1.9).';

-- ── A3) Contratos de locacao ────────────────────────────────────────────────
create table if not exists public.vehicle_rental_contracts (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default public.get_user_tenant_id() references public.tenants(id),
  vehicle_id        uuid not null references public.vehicles(id),
  supplier_name     text not null check (length(btrim(supplier_name)) > 0),
  supplier_document text,
  contract_number   text not null check (length(btrim(contract_number)) > 0),
  start_date        date not null,
  end_date          date,
  monthly_value     numeric(12,2) check (monthly_value is null or monthly_value >= 0),
  km_franchise      integer check (km_franchise is null or km_franchise >= 0),
  notes             text,
  created_by        uuid default auth.uid() references public.profiles(id),
  created_at        timestamptz not null default now(),
  ended_at          timestamptz,
  ended_reason      text,
  constraint rental_contract_dates_chk check (end_date is null or end_date >= start_date),
  constraint rental_contract_ended_reason_chk check (ended_at is null or length(btrim(coalesce(ended_reason, ''))) >= 5)
);
create index if not exists rental_contracts_vehicle_idx on public.vehicle_rental_contracts (vehicle_id, start_date desc);
create index if not exists rental_contracts_expiry_idx
  on public.vehicle_rental_contracts (tenant_id, end_date) where ended_at is null and end_date is not null;

comment on table  public.vehicle_rental_contracts is 'Contratos de locacao de veiculos (fornecedor, vigencia, valor mensal, franquia de km). Sem DELETE: encerrar preenchendo ended_at/ended_reason.';
comment on column public.vehicle_rental_contracts.end_date is 'Fim da vigencia prevista; null = prazo indeterminado. Alimenta o alerta de vencimento (30/15/7/0 dias).';
comment on column public.vehicle_rental_contracts.km_franchise is 'Franquia de km contratada (por mes); null = ilimitada/nao informada.';
comment on column public.vehicle_rental_contracts.ended_at is 'Encerramento antecipado/efetivo do contrato; exige ended_reason.';

-- ── B4) Planos de manutencao preventiva ─────────────────────────────────────
create table if not exists public.maintenance_plans (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null default public.get_user_tenant_id() references public.tenants(id),
  vehicle_id           uuid not null references public.vehicles(id),
  service_type         text not null check (service_type ~ '^[a-z0-9_]+$'),
  service_label        text not null check (length(btrim(service_label)) > 0),
  interval_km          integer check (interval_km is null or interval_km > 0),
  interval_days        integer check (interval_days is null or interval_days > 0),
  warn_pct             integer not null default 10 check (warn_pct between 1 and 100),
  last_done_km         integer check (last_done_km is null or last_done_km >= 0),
  last_done_at         date,
  active               boolean not null default true,
  last_notified_at     timestamptz,
  last_notified_status text check (last_notified_status is null or last_notified_status in ('proximo', 'vencido')),
  created_by           uuid default auth.uid() references public.profiles(id),
  created_at           timestamptz not null default now(),
  constraint maintenance_plans_interval_chk check (interval_km is not null or interval_days is not null)
);
create unique index if not exists maintenance_plans_active_uniq
  on public.maintenance_plans (vehicle_id, service_type) where active;
create index if not exists maintenance_plans_tenant_idx on public.maintenance_plans (tenant_id, active);

comment on table  public.maintenance_plans is 'Plano de manutencao preventiva por veiculo e tipo de servico, com intervalo por km e/ou dias. Sem DELETE: desativar com active=false.';
comment on column public.maintenance_plans.service_type is 'Chave tecnica do servico (ex.: troca_oleo, rodizio_pneus, revisao, filtro_ar); minusculas/numeros/underscore.';
comment on column public.maintenance_plans.service_label is 'Nome exibido do servico (ex.: Troca de oleo).';
comment on column public.maintenance_plans.interval_km is 'Intervalo em km entre execucoes; null = nao controla por km.';
comment on column public.maintenance_plans.interval_days is 'Intervalo em dias entre execucoes; null = nao controla por tempo.';
comment on column public.maintenance_plans.warn_pct is 'Percentual do intervalo restante a partir do qual o plano fica "proximo" (padrao 10).';
comment on column public.maintenance_plans.last_done_km is 'Odometro da ultima execucao; base do calculo por km. Atualizado ao concluir a OS vinculada.';
comment on column public.maintenance_plans.last_done_at is 'Data da ultima execucao; base do calculo por tempo. Atualizado ao concluir a OS vinculada.';
comment on column public.maintenance_plans.last_notified_at is 'Controle anti-duplicidade do aviso diario (run_preventive_maintenance_check).';
comment on column public.maintenance_plans.last_notified_status is 'Ultimo status avisado (proximo|vencido); zerado ao voltar a em_dia ou ao concluir a OS.';

-- Vinculo OS -> plano e novo valor de origem.
alter table public.service_orders
  add column if not exists maintenance_plan_id uuid references public.maintenance_plans(id);
create index if not exists service_orders_plan_idx on public.service_orders (maintenance_plan_id) where maintenance_plan_id is not null;
comment on column public.service_orders.maintenance_plan_id is 'Plano preventivo atendido por esta OS; ao concluir, atualiza last_done_km/last_done_at do plano.';

alter table public.service_orders drop constraint if exists service_orders_origin_check;
alter table public.service_orders
  add constraint service_orders_origin_check
  check (origin = any (array['driver', 'checklist', 'manager', 'issue', 'preventiva']));

-- Opt-in por prefeitura para abrir OS preventiva automaticamente.
alter table public.tenants add column if not exists auto_preventive_os boolean not null default false;
comment on column public.tenants.auto_preventive_os is 'Se true, o job diario abre OS (origin=preventiva) quando um plano fica proximo/vencido. Padrao false: so avisa.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.cost_centers              enable row level security;
alter table public.vehicle_rental_contracts  enable row level security;
alter table public.maintenance_plans         enable row level security;

-- Restritivas de sessao ativa/modulo (mesmo padrao de departments; sem DELETE).
do $$
declare r text;
begin
  foreach r in array array['cost_centers', 'vehicle_rental_contracts', 'maintenance_plans'] loop
    execute format('drop policy if exists active_session_read on public.%I', r);
    execute format('create policy active_session_read on public.%I as restrictive for select to authenticated using ((select sgf_private.resource_allowed(%L, false)))', r, r);
    execute format('drop policy if exists active_session_insert on public.%I', r);
    execute format('create policy active_session_insert on public.%I as restrictive for insert to authenticated with check ((select sgf_private.resource_allowed(%L, true)))', r, r);
    execute format('drop policy if exists active_session_update on public.%I', r);
    execute format('create policy active_session_update on public.%I as restrictive for update to authenticated using ((select sgf_private.resource_allowed(%L, true))) with check ((select sgf_private.resource_allowed(%L, true)))', r, r, r);
  end loop;
end $$;

-- cost_centers: leitura admin/gestor/secretario do tenant; escrita admin/gestor.
drop policy if exists cost_centers_select on public.cost_centers;
create policy cost_centers_select on public.cost_centers for select to authenticated
  using (public.is_superadmin() or ((public.is_admin_or_manager() or public.is_secretario()) and tenant_id = public.get_user_tenant_id()));
drop policy if exists cost_centers_insert on public.cost_centers;
create policy cost_centers_insert on public.cost_centers for insert to authenticated
  with check (public.is_superadmin() or (public.is_admin_or_manager() and tenant_id = public.get_user_tenant_id()));
drop policy if exists cost_centers_update on public.cost_centers;
create policy cost_centers_update on public.cost_centers for update to authenticated
  using (public.is_superadmin() or (public.is_admin_or_manager() and tenant_id = public.get_user_tenant_id()))
  with check (public.is_superadmin() or (public.is_admin_or_manager() and tenant_id = public.get_user_tenant_id()));

-- contratos e planos: leitura admin/gestor (secretario so da propria secretaria); escrita admin/gestor.
do $$
declare r text;
begin
  foreach r in array array['vehicle_rental_contracts', 'maintenance_plans'] loop
    execute format('drop policy if exists %1$s_manager_select on public.%1$s', r);
    execute format($p$create policy %1$s_manager_select on public.%1$s for select to authenticated
      using (public.is_superadmin() or (public.is_admin_or_manager() and tenant_id = public.get_user_tenant_id()))$p$, r);
    execute format('drop policy if exists %1$s_secretario_select on public.%1$s', r);
    execute format($p$create policy %1$s_secretario_select on public.%1$s for select to authenticated
      using (public.is_secretario() and tenant_id = public.get_user_tenant_id()
        and exists (select 1 from public.vehicles v where v.id = %1$s.vehicle_id and v.department_id = public.get_user_department_id()))$p$, r);
    execute format('drop policy if exists %1$s_manager_insert on public.%1$s', r);
    execute format($p$create policy %1$s_manager_insert on public.%1$s for insert to authenticated
      with check (public.is_superadmin() or (public.is_admin_or_manager() and tenant_id = public.get_user_tenant_id()
        and exists (select 1 from public.vehicles v where v.id = %1$s.vehicle_id and v.tenant_id = %1$s.tenant_id)))$p$, r);
    execute format('drop policy if exists %1$s_manager_update on public.%1$s', r);
    execute format($p$create policy %1$s_manager_update on public.%1$s for update to authenticated
      using (public.is_superadmin() or (public.is_admin_or_manager() and tenant_id = public.get_user_tenant_id()))
      with check (public.is_superadmin() or (public.is_admin_or_manager() and tenant_id = public.get_user_tenant_id()
        and exists (select 1 from public.vehicles v where v.id = %1$s.vehicle_id and v.tenant_id = %1$s.tenant_id)))$p$, r);
  end loop;
end $$;

revoke all on public.cost_centers, public.vehicle_rental_contracts, public.maintenance_plans from anon, authenticated;
grant select, insert, update on public.cost_centers, public.vehicle_rental_contracts, public.maintenance_plans to authenticated;

-- ── Tenant e auditoria ──────────────────────────────────────────────────────
drop trigger if exists trg_tenant on public.cost_centers;
create trigger trg_tenant before insert on public.cost_centers
  for each row execute function public.tf_tenant_from_user();
drop trigger if exists trg_tenant on public.vehicle_rental_contracts;
create trigger trg_tenant before insert on public.vehicle_rental_contracts
  for each row execute function public.tf_tenant_from_vehicle();
drop trigger if exists trg_tenant on public.maintenance_plans;
create trigger trg_tenant before insert on public.maintenance_plans
  for each row execute function public.tf_tenant_from_vehicle();

drop trigger if exists trg_activity_cost_centers on public.cost_centers;
create trigger trg_activity_cost_centers after insert or update on public.cost_centers
  for each row execute function public.tf_activity_log('cost_center');
drop trigger if exists trg_activity_vehicle_rental_contracts on public.vehicle_rental_contracts;
create trigger trg_activity_vehicle_rental_contracts after insert or update on public.vehicle_rental_contracts
  for each row execute function public.tf_activity_log('rental_contract');
-- UPDATE OF (sem last_notified_*): o cron nao polui a trilha de auditoria.
drop trigger if exists trg_activity_maintenance_plans on public.maintenance_plans;
create trigger trg_activity_maintenance_plans
  after insert or update of vehicle_id, service_type, service_label, interval_km, interval_days, warn_pct, last_done_km, last_done_at, active
  on public.maintenance_plans
  for each row execute function public.tf_activity_log('maintenance_plan');

-- ── B5) Avaliacao do plano + view ───────────────────────────────────────────
create or replace function public.maintenance_plan_eval(
  p_interval_km int, p_interval_days int, p_warn_pct int,
  p_last_km int, p_last_at date, p_odometer int,
  out km_remaining int, out days_remaining int, out status text)
language plpgsql stable set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  km_remaining   := case when p_interval_km   is not null and p_last_km is not null then p_last_km + p_interval_km - p_odometer end;
  days_remaining := case when p_interval_days is not null and p_last_at is not null then (p_last_at + p_interval_days) - v_today end;
  status := case
    when km_remaining is null and days_remaining is null then 'sem_base'
    when coalesce(km_remaining, 1) <= 0 or coalesce(days_remaining, 1) <= 0 then 'vencido'
    when km_remaining   <= p_interval_km   * p_warn_pct / 100.0
      or days_remaining <= p_interval_days * p_warn_pct / 100.0 then 'proximo'
    else 'em_dia'
  end;
end $$;
comment on function public.maintenance_plan_eval(int, int, int, int, date, int) is
  'Calcula km/dias restantes e status (em_dia|proximo|vencido|sem_base) de um plano. sem_base = sem last_done para nenhum dos intervalos configurados.';

create or replace view public.maintenance_plan_status
with (security_invoker = true) as
select p.id as plan_id, p.tenant_id, p.vehicle_id, v.plate, v.name as vehicle_name,
       v.current_odometer, p.service_type, p.service_label,
       p.interval_km, p.interval_days, p.warn_pct, p.last_done_km, p.last_done_at, p.active,
       e.km_remaining, e.days_remaining, e.status
  from public.maintenance_plans p
  join public.vehicles v on v.id = p.vehicle_id
  cross join lateral public.maintenance_plan_eval(
    p.interval_km, p.interval_days, p.warn_pct, p.last_done_km, p.last_done_at, v.current_odometer) e;
comment on view public.maintenance_plan_status is
  'Status por plano (km/dias restantes; em_dia|proximo|vencido|sem_base). security_invoker: respeita RLS de planos e veiculos.';
revoke all on public.maintenance_plan_status from anon, authenticated;
grant select on public.maintenance_plan_status to authenticated;

-- ── B6) Job diario ──────────────────────────────────────────────────────────
create or replace function public.run_preventive_maintenance_check()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r record;
  v_sent int := 0;
  v_title text;
  v_body text;
  v_rank_new int;
  v_rank_old int;
  v_opener uuid;
  v_days int;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- 1) Planos preventivos
  for r in
    select p.id, p.tenant_id, p.vehicle_id, p.service_label, p.last_notified_status,
           coalesce(v.plate, v.name, v.unit_code) as vlabel, v.current_odometer,
           e.km_remaining, e.days_remaining, e.status, t.auto_preventive_os
      from public.maintenance_plans p
      join public.vehicles v on v.id = p.vehicle_id
      join public.tenants t on t.id = p.tenant_id
      cross join lateral public.maintenance_plan_eval(
        p.interval_km, p.interval_days, p.warn_pct, p.last_done_km, p.last_done_at, v.current_odometer) e
     where p.active
  loop
    if r.status in ('em_dia', 'sem_base') then
      if r.last_notified_status is not null then
        update public.maintenance_plans set last_notified_status = null, last_notified_at = null where id = r.id;
      end if;
      continue;
    end if;

    v_rank_new := case r.status when 'vencido' then 2 else 1 end;
    v_rank_old := case r.last_notified_status when 'vencido' then 2 when 'proximo' then 1 else 0 end;

    if v_rank_new > v_rank_old then
      v_title := case r.status when 'vencido' then 'Manutencao preventiva vencida' else 'Manutencao preventiva proxima' end;
      v_body := format('%s · %s%s%s',
        r.service_label, r.vlabel,
        case when r.km_remaining   is not null then format(' — %s km', case when r.km_remaining <= 0 then 'vencido ha ' || abs(r.km_remaining) else 'faltam ' || r.km_remaining end) else '' end,
        case when r.days_remaining is not null then format(' — %s dias', case when r.days_remaining <= 0 then 'vencido ha ' || abs(r.days_remaining) else 'faltam ' || r.days_remaining end) else '' end);

      insert into public.notifications (driver_id, tenant_id, type, title, body, link, entity_type, entity_id)
      select pr.id, r.tenant_id, case r.status when 'vencido' then 'alert' else 'warning' end,
             v_title, v_body, '/manutencoes', 'maintenance_plan', r.id
        from public.profiles pr
       where pr.tenant_id = r.tenant_id and pr.role in ('admin', 'gestor') and pr.archived_at is null;

      update public.maintenance_plans
         set last_notified_status = r.status, last_notified_at = now()
       where id = r.id;
      v_sent := v_sent + 1;
    end if;

    -- OS preventiva automatica (opt-in), sem duplicar enquanto houver OS aberta do plano.
    if r.auto_preventive_os
       and not exists (select 1 from public.service_orders so
                        where so.maintenance_plan_id = r.id
                          and so.status not in ('concluida', 'rejeitada')) then
      select pr.id into v_opener
        from public.profiles pr
       where pr.tenant_id = r.tenant_id and pr.role in ('admin', 'gestor') and pr.archived_at is null
       order by (pr.role = 'admin') desc, pr.created_at
       limit 1;
      if v_opener is not null then
        insert into public.service_orders
          (tenant_id, vehicle_id, category, description, priority, odometer, origin, opened_by, maintenance_plan_id)
        values
          (r.tenant_id, r.vehicle_id, r.service_label,
           'Manutencao preventiva gerada automaticamente (' || r.status || ').',
           case r.status when 'vencido' then 'alta' else 'media' end::public.issue_severity,
           r.current_odometer, 'preventiva', v_opener, r.id);
      end if;
    end if;
  end loop;

  -- 2) Contratos de locacao vencendo (30/15/7/0 dias), um aviso por dia e marco.
  for r in
    select c.id, c.tenant_id, c.contract_number, c.supplier_name, c.end_date,
           coalesce(v.plate, v.name, v.unit_code) as vlabel
      from public.vehicle_rental_contracts c
      join public.vehicles v on v.id = c.vehicle_id
     where c.ended_at is null and c.end_date is not null
       and (c.end_date - v_today) in (30, 15, 7, 0)
  loop
    v_days := r.end_date - v_today;
    v_title := case v_days when 0 then 'Contrato de locacao vence hoje'
                           else format('Contrato de locacao: faltam %s dias', v_days) end;
    if exists (select 1 from public.notifications n
                where n.entity_type = 'rental_contract' and n.entity_id = r.id
                  and n.title = v_title and n.created_at::date = current_date) then
      continue;
    end if;
    insert into public.notifications (driver_id, tenant_id, type, title, body, link, entity_type, entity_id)
    select pr.id, r.tenant_id, case when v_days <= 7 then 'alert' else 'warning' end, v_title,
           format('Contrato %s (%s) · %s — vigencia ate %s.', r.contract_number, r.supplier_name, r.vlabel, to_char(r.end_date, 'DD/MM/YYYY')),
           '/veiculos', 'rental_contract', r.id
      from public.profiles pr
     where pr.tenant_id = r.tenant_id and pr.role in ('admin', 'gestor') and pr.archived_at is null;
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end $$;
comment on function public.run_preventive_maintenance_check() is
  'Job diario (cron preventive-maintenance-daily): avisa gestores de planos proximo/vencido (sem duplicar via last_notified_status), opcionalmente abre OS preventiva (tenants.auto_preventive_os) e avisa contratos de locacao vencendo. Retorna quantidade de avisos.';
revoke all on function public.run_preventive_maintenance_check() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('preventive-maintenance-daily') where exists (select 1 from cron.job where jobname = 'preventive-maintenance-daily');
  perform cron.schedule('preventive-maintenance-daily', '15 8 * * *', 'select public.run_preventive_maintenance_check();');
end $$;

-- ── B7) Conclusao da OS atualiza o plano ────────────────────────────────────
create or replace function public.tf_service_order_complete_plan()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  update public.maintenance_plans p
     set last_done_km = coalesce(new.odometer, (select v.current_odometer from public.vehicles v where v.id = new.vehicle_id), p.last_done_km),
         last_done_at = (coalesce(new.completed_at, now()) at time zone 'America/Sao_Paulo')::date,
         last_notified_status = null,
         last_notified_at = null
   where p.id = new.maintenance_plan_id and p.tenant_id = new.tenant_id;
  return null;
end $$;
comment on function public.tf_service_order_complete_plan() is
  'AFTER UPDATE em service_orders: ao passar a status=concluida com maintenance_plan_id, grava last_done_km/last_done_at no plano e zera o controle de aviso.';

drop trigger if exists trg_service_order_complete_plan on public.service_orders;
create trigger trg_service_order_complete_plan
  after update of status, operational_status on public.service_orders
  for each row
  when (new.maintenance_plan_id is not null and new.status = 'concluida' and old.status is distinct from new.status)
  execute function public.tf_service_order_complete_plan();
