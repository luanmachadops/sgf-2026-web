-- ============================================================================
-- LICITAÇÕES E PORTAIS DE PARCEIROS
-- Versão sincronizada com a migração aplicada no projeto Supabase.
--
-- 1. Acrescenta teto financeiro e faixas de alerta aos contratos.
-- 2. Separa o contexto de leitura do contexto operacional: contrato vencido
--    nunca apaga/esconde histórico, mas continua impedindo novas operações.
-- 3. Reserva orçamento de combustível na autorização e de manutenção quando
--    o orçamento da oficina é aprovado, com trava concorrente por fornecedor.
-- 4. Entrega os dados agregados dos dashboards sem expor tabelas de terceiros.
-- ============================================================================

alter table public.fuel_stations
  add column if not exists contract_value numeric(14,2),
  add column if not exists contract_alert_percent numeric(5,2) not null default 20,
  add column if not exists contract_alert_days integer not null default 30;

alter table public.repair_shops
  add column if not exists contract_value numeric(14,2),
  add column if not exists contract_alert_percent numeric(5,2) not null default 20,
  add column if not exists contract_alert_days integer not null default 30;

alter table public.fuel_stations
  drop constraint if exists fuel_stations_contract_value_check,
  add constraint fuel_stations_contract_value_check
    check (contract_value is null or contract_value >= 0),
  drop constraint if exists fuel_stations_contract_alert_percent_check,
  add constraint fuel_stations_contract_alert_percent_check
    check (contract_alert_percent >= 0 and contract_alert_percent <= 100),
  drop constraint if exists fuel_stations_contract_alert_days_check,
  add constraint fuel_stations_contract_alert_days_check
    check (contract_alert_days between 1 and 365);

alter table public.repair_shops
  drop constraint if exists repair_shops_contract_value_check,
  add constraint repair_shops_contract_value_check
    check (contract_value is null or contract_value >= 0),
  drop constraint if exists repair_shops_contract_alert_percent_check,
  add constraint repair_shops_contract_alert_percent_check
    check (contract_alert_percent >= 0 and contract_alert_percent <= 100),
  drop constraint if exists repair_shops_contract_alert_days_check,
  add constraint repair_shops_contract_alert_days_check
    check (contract_alert_days between 1 and 365);

create index if not exists idx_fuel_stations_tenant_contract_end
  on public.fuel_stations (tenant_id, contract_end)
  where is_active and contract_end is not null;

create index if not exists idx_repair_shops_tenant_contract_end
  on public.repair_shops (tenant_id, contract_end)
  where is_active and contract_end is not null;

-- ─── Cálculo interno do valor comprometido ─────────────────────────────────

create or replace function public.station_contract_committed(p_station_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(
    case
      when f.workflow_status::text = 'autorizado'
       and f.cancelled_at is null
       and (f.expires_at is null or f.expires_at > now())
      then round(
        coalesce(f.max_liters, v.tank_capacity, 0)
        * coalesce(
            f.price_per_liter,
            (
              select nullif(fp.value, '')::numeric
              from jsonb_each_text(coalesce(s.fuel_prices, '{}'::jsonb)) fp
              where lower(fp.key) = lower(f.fuel_type)
              limit 1
            ),
            0
          ),
        2
      )
      when f.filled_at is not null then coalesce(f.total_cost, 0)
      else 0
    end
  ), 0)::numeric
  from public.fuel_stations s
  left join public.fuelings f on f.station_id = s.id
  left join public.vehicles v on v.id = f.vehicle_id
  where s.id = p_station_id
$$;

create or replace function public.repair_shop_contract_committed(p_repair_shop_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(coalesce(so.budget, 0)), 0)::numeric
  from public.service_orders so
  where so.repair_shop_id = p_repair_shop_id
    and so.operational_status::text <> 'cancelled'
    and so.financial_status::text <> 'not_started'
$$;

revoke all on function public.station_contract_committed(uuid)
  from public, anon, authenticated;
revoke all on function public.repair_shop_contract_committed(uuid)
  from public, anon, authenticated;

-- ─── Contexto: leitura preservada, operação validada ────────────────────────

create or replace function public.partner_read_context()
returns table (
  profile_id uuid,
  tenant_id uuid,
  kind text,
  partner_id uuid,
  partner_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  select p.id, p.tenant_id, p.role, p.station_id, p.repair_shop_id,
         p.access_blocked
    into r
    from public.profiles p
   where p.id = auth.uid()
     and p.role in ('posto', 'oficina');

  if r.id is null then
    raise exception 'Acesso restrito a postos e oficinas';
  end if;
  if coalesce(r.access_blocked, false) then
    raise exception 'Seu acesso está bloqueado. Procure a prefeitura.';
  end if;

  if r.role = 'posto' then
    return query
      select r.id, r.tenant_id, 'posto'::text, s.id, s.name
      from public.fuel_stations s
      where s.id = r.station_id
        and s.tenant_id = r.tenant_id;
  else
    return query
      select r.id, r.tenant_id, 'oficina'::text, o.id, o.name
      from public.repair_shops o
      where o.id = r.repair_shop_id
        and o.tenant_id = r.tenant_id;
  end if;

  if not found then
    raise exception 'O vínculo deste acesso não foi encontrado. Procure a prefeitura.';
  end if;
end
$$;

-- O contexto operacional continua sendo a única porta das RPCs de escrita,
-- agora com mensagens específicas para a interface.
create or replace function public.partner_context()
returns table (
  profile_id uuid,
  tenant_id uuid,
  kind text,
  partner_id uuid,
  partner_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  partner record;
begin
  select * into ctx from public.partner_read_context();

  if ctx.kind = 'posto' then
    select s.* into partner
    from public.fuel_stations s
    where s.id = ctx.partner_id
      and s.tenant_id = ctx.tenant_id;

    if not coalesce(partner.is_active, false) then
      raise exception 'O cadastro do posto está inativo. O histórico continua disponível, mas novos abastecimentos estão bloqueados.';
    end if;
    if partner.contract_start is not null and partner.contract_start > current_date then
      raise exception 'A licitação do posto inicia em %. O histórico continua disponível.', to_char(partner.contract_start, 'DD/MM/YYYY');
    end if;
    if partner.contract_end is not null and partner.contract_end < current_date then
      raise exception 'A licitação do posto venceu em %. O histórico continua disponível, mas novos abastecimentos estão bloqueados.', to_char(partner.contract_end, 'DD/MM/YYYY');
    end if;
  else
    select o.* into partner
    from public.repair_shops o
    where o.id = ctx.partner_id
      and o.tenant_id = ctx.tenant_id;

    if not coalesce(partner.is_active, false) then
      raise exception 'O cadastro da oficina está inativo. Ordens e documentos anteriores continuam disponíveis, mas novas operações estão bloqueadas.';
    end if;
    if partner.contract_start is not null and partner.contract_start > current_date then
      raise exception 'O contrato da oficina inicia em %. Ordens anteriores continuam disponíveis.', to_char(partner.contract_start, 'DD/MM/YYYY');
    end if;
    if partner.contract_end is not null and partner.contract_end < current_date then
      raise exception 'O contrato da oficina venceu em %. Ordens e documentos anteriores continuam disponíveis, mas novas operações estão bloqueadas.', to_char(partner.contract_end, 'DD/MM/YYYY');
    end if;
  end if;

  return query
    select ctx.profile_id, ctx.tenant_id, ctx.kind, ctx.partner_id,
           ctx.partner_name;
end
$$;

revoke all on function public.partner_read_context() from public, anon;
grant execute on function public.partner_read_context() to authenticated;
revoke all on function public.partner_context() from public, anon;
grant execute on function public.partner_context() to authenticated;

-- As consultas usam o contexto de leitura. Assim vencimento/inatividade não
-- apagam histórico, fechamento, autorizações já emitidas nem ordens antigas.
create or replace function public.get_station_pending_authorizations()
returns table (
  fueling_id uuid,
  plate text,
  brand text,
  model text,
  fuel_type text,
  max_liters numeric,
  authorized_at timestamptz,
  expires_at timestamptz,
  note text,
  price_per_liter numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
begin
  select * into ctx from public.partner_read_context();
  if ctx.kind <> 'posto' then raise exception 'Somente postos'; end if;

  return query
    select f.id, v.plate, v.brand, v.model,
           f.fuel_type, f.max_liters, f.authorized_at, f.expires_at,
           f.authorization_note,
           (
             select nullif(fp.value, '')::numeric
             from jsonb_each_text(coalesce(s.fuel_prices, '{}'::jsonb)) fp
             where lower(fp.key) = lower(f.fuel_type)
             limit 1
           )
    from public.fuelings f
    join public.vehicles v on v.id = f.vehicle_id
    join public.fuel_stations s on s.id = f.station_id
    where f.tenant_id = ctx.tenant_id
      and f.station_id = ctx.partner_id
      and f.workflow_status::text = 'autorizado'
      and f.cancelled_at is null
      and (f.expires_at is null or f.expires_at > now())
    order by f.authorized_at;
end
$$;

create or replace function public.get_repair_shop_orders()
returns table (
  order_id uuid,
  plate text,
  brand text,
  model text,
  year int,
  odometer int,
  category text,
  description text,
  priority text,
  operational_status text,
  financial_status text,
  commitment_number text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
begin
  select * into ctx from public.partner_read_context();
  if ctx.kind <> 'oficina' then raise exception 'Somente oficinas'; end if;

  return query
    select so.id, v.plate, v.brand, v.model, v.year, so.odometer,
           so.category, so.description, so.priority::text,
           so.operational_status::text, so.financial_status::text,
           so.commitment_number, so.created_at
    from public.service_orders so
    join public.vehicles v on v.id = so.vehicle_id
    where so.tenant_id = ctx.tenant_id
      and so.repair_shop_id = ctx.partner_id
    order by so.created_at desc;
end
$$;

-- Somente troca o helper de autenticação; filtros, paginação e DTO permanecem.
create or replace function public.get_station_history(
  p_from date default (current_date - 90),
  p_to date default current_date,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  fueling_id uuid,
  plate text,
  brand text,
  model text,
  fuel_type text,
  liters numeric,
  odometer int,
  price_per_liter numeric,
  total_cost numeric,
  receipt_no text,
  photo_url text,
  filled_at timestamptz,
  workflow_status text,
  rejection_reason text,
  has_anomaly boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  v_from date := coalesce(p_from, current_date - 90);
  v_to date := coalesce(p_to, current_date);
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  select * into ctx from public.partner_read_context();
  if ctx.kind <> 'posto' then raise exception 'Somente postos'; end if;
  if v_from > v_to then raise exception 'Período inválido'; end if;

  return query
    select f.id, v.plate, v.brand, v.model, f.fuel_type, f.liters,
           f.odometer, f.price_per_liter, f.total_cost,
           f.pump_receipt_number, f.photo_pump_url, f.filled_at,
           f.workflow_status::text,
           case when f.workflow_status::text = 'rejeitado_admin'
             then f.anomaly_type else null end,
           coalesce(f.has_anomaly, false),
           count(*) over ()
    from public.fuelings f
    join public.vehicles v on v.id = f.vehicle_id
    where f.tenant_id = ctx.tenant_id
      and f.station_id = ctx.partner_id
      and f.filled_at is not null
      and f.filled_at >= v_from::timestamptz
      and f.filled_at < (v_to + 1)::timestamptz
    order by f.filled_at desc
    limit v_limit
    offset v_offset;
end
$$;

create or replace function public.get_station_monthly_summary(
  p_month date default current_date
)
returns table (
  fuel_type text,
  total_count bigint,
  total_liters numeric,
  total_amount numeric,
  pending_count bigint,
  pending_amount numeric,
  validated_count bigint,
  validated_amount numeric,
  rejected_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  v_start timestamptz;
  v_end timestamptz;
begin
  select * into ctx from public.partner_read_context();
  if ctx.kind <> 'posto' then raise exception 'Somente postos'; end if;
  if p_month is null then raise exception 'Informe o mês do fechamento'; end if;

  v_start := date_trunc('month', p_month::timestamp)
    at time zone 'America/Sao_Paulo';
  v_end := (date_trunc('month', p_month::timestamp) + interval '1 month')
    at time zone 'America/Sao_Paulo';

  return query
    select lower(f.fuel_type)::text,
           count(*) filter (where f.workflow_status::text in ('concluido', 'validado')),
           coalesce(sum(f.liters) filter (
             where f.workflow_status::text in ('concluido', 'validado')
           ), 0),
           coalesce(sum(f.total_cost) filter (
             where f.workflow_status::text in ('concluido', 'validado')
           ), 0),
           count(*) filter (where f.workflow_status::text = 'concluido'),
           coalesce(sum(f.total_cost) filter (
             where f.workflow_status::text = 'concluido'
           ), 0),
           count(*) filter (where f.workflow_status::text = 'validado'),
           coalesce(sum(f.total_cost) filter (
             where f.workflow_status::text = 'validado'
           ), 0),
           count(*) filter (where f.workflow_status::text = 'rejeitado_admin')
    from public.fuelings f
    where f.tenant_id = ctx.tenant_id
      and f.station_id = ctx.partner_id
      and f.filled_at >= v_start
      and f.filled_at < v_end
      and f.workflow_status::text in ('concluido', 'validado', 'rejeitado_admin')
    group by lower(f.fuel_type)
    order by lower(f.fuel_type);
end
$$;

-- ─── Estado contratual do parceiro ─────────────────────────────────────────

create or replace function public.get_partner_contract_status()
returns table (
  partner_kind text,
  partner_id uuid,
  partner_name text,
  is_active boolean,
  contract_number text,
  contract_start date,
  contract_end date,
  contract_value numeric,
  committed_value numeric,
  remaining_value numeric,
  remaining_percent numeric,
  alert_percent numeric,
  alert_days integer,
  days_remaining integer,
  can_create_new boolean,
  can_execute_existing boolean,
  block_code text,
  block_title text,
  block_message text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  p record;
  v_committed numeric;
  v_remaining numeric;
  v_percent numeric;
  v_date_ok boolean;
  v_budget_ok boolean;
begin
  select * into ctx from public.partner_read_context();

  if ctx.kind = 'posto' then
    select s.* into p from public.fuel_stations s where s.id = ctx.partner_id;
    v_committed := public.station_contract_committed(p.id);
  else
    select o.* into p from public.repair_shops o where o.id = ctx.partner_id;
    v_committed := public.repair_shop_contract_committed(p.id);
  end if;

  v_remaining := case when p.contract_value is null then null
    else greatest(p.contract_value - v_committed, 0) end;
  v_percent := case when coalesce(p.contract_value, 0) <= 0 then null
    else round(greatest(p.contract_value - v_committed, 0)
      / p.contract_value * 100, 2) end;
  v_date_ok := coalesce(p.is_active, false)
    and (p.contract_start is null or p.contract_start <= current_date)
    and (p.contract_end is null or p.contract_end >= current_date);
  v_budget_ok := p.contract_value is null or v_remaining > 0;

  return query
    select ctx.kind, p.id, p.name, coalesce(p.is_active, false),
           p.contract_number, p.contract_start, p.contract_end,
           p.contract_value, v_committed, v_remaining, v_percent,
           p.contract_alert_percent, p.contract_alert_days,
           case when p.contract_end is null then null
             else p.contract_end - current_date end,
           v_date_ok and v_budget_ok,
           v_date_ok,
           case
             when not coalesce(p.is_active, false) then 'inactive'
             when p.contract_start is not null and p.contract_start > current_date then 'not_started'
             when p.contract_end is not null and p.contract_end < current_date then 'expired'
             when not v_budget_ok then 'budget_exhausted'
             else null
           end,
           case
             when not coalesce(p.is_active, false) then 'Cadastro inativo'
             when p.contract_start is not null and p.contract_start > current_date then 'Contrato ainda não iniciou'
             when p.contract_end is not null and p.contract_end < current_date then 'Licitação vencida'
             when not v_budget_ok then 'Orçamento da licitação esgotado'
             else null
           end,
           case
             when not coalesce(p.is_active, false) then
               'O cadastro está inativo. Consultas, histórico e documentos continuam disponíveis; novas operações estão bloqueadas.'
             when p.contract_start is not null and p.contract_start > current_date then
               format('O contrato inicia em %s. Consultas anteriores continuam disponíveis.', to_char(p.contract_start, 'DD/MM/YYYY'))
             when p.contract_end is not null and p.contract_end < current_date then
               format('O contrato venceu em %s. Consultas e registros anteriores continuam disponíveis; novas operações estão bloqueadas.', to_char(p.contract_end, 'DD/MM/YYYY'))
             when not v_budget_ok then
               'O valor da licitação está 100% comprometido. Novas autorizações estão bloqueadas; histórico e operações já autorizadas continuam disponíveis.'
             else null
           end;
end
$$;

revoke all on function public.get_partner_contract_status()
  from public, anon;
grant execute on function public.get_partner_contract_status()
  to authenticated;

-- ─── Dados agregados dos dashboards de posto e oficina ─────────────────────

create or replace function public.get_partner_dashboard()
returns table (
  partner_kind text,
  metrics jsonb,
  monthly_series jsonb,
  status_series jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  v_metrics jsonb;
  v_monthly jsonb;
  v_status jsonb;
begin
  select * into ctx from public.partner_read_context();

  if ctx.kind = 'posto' then
    select jsonb_build_object(
      'pending', count(*) filter (
        where f.workflow_status::text = 'autorizado'
          and f.cancelled_at is null
          and (f.expires_at is null or f.expires_at > now())
      ),
      'monthCount', count(*) filter (
        where f.filled_at >= date_trunc('month', now())
      ),
      'monthLiters', coalesce(sum(f.liters) filter (
        where f.filled_at >= date_trunc('month', now())
      ), 0),
      'monthAmount', coalesce(sum(f.total_cost) filter (
        where f.filled_at >= date_trunc('month', now())
      ), 0),
      'awaitingValidation', count(*) filter (
        where f.workflow_status::text = 'concluido'
      )
    ) into v_metrics
    from public.fuelings f
    where f.tenant_id = ctx.tenant_id
      and f.station_id = ctx.partner_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'key', to_char(month_start, 'YYYY-MM'),
      'amount', amount,
      'liters', liters,
      'count', total_count
    ) order by month_start), '[]'::jsonb)
    into v_monthly
    from (
      select m.month_start,
             coalesce(sum(f.total_cost), 0) amount,
             coalesce(sum(f.liters), 0) liters,
             count(f.id) total_count
      from generate_series(
        date_trunc('month', current_date) - interval '5 months',
        date_trunc('month', current_date),
        interval '1 month'
      ) m(month_start)
      left join public.fuelings f
        on f.tenant_id = ctx.tenant_id
       and f.station_id = ctx.partner_id
       and f.filled_at >= m.month_start
       and f.filled_at < m.month_start + interval '1 month'
      group by m.month_start
    ) months;

    select coalesce(jsonb_agg(jsonb_build_object(
      'status', workflow_status,
      'count', total_count
    ) order by total_count desc), '[]'::jsonb)
    into v_status
    from (
      select f.workflow_status::text workflow_status, count(*) total_count
      from public.fuelings f
      where f.tenant_id = ctx.tenant_id
        and f.station_id = ctx.partner_id
      group by f.workflow_status::text
    ) statuses;
  else
    select jsonb_build_object(
      'open', count(*) filter (
        where so.operational_status::text not in ('received', 'cancelled')
      ),
      'attention', count(*) filter (
        where so.operational_status::text in ('authorized', 'at_shop', 'awaiting_quote_approval')
      ),
      'inProgress', count(*) filter (
        where so.operational_status::text = 'in_progress'
      ),
      'ready', count(*) filter (
        where so.operational_status::text = 'ready'
      ),
      'monthInvoiced', coalesce((
        select sum(i.amount)
        from public.service_order_invoices i
        where i.tenant_id = ctx.tenant_id
          and i.repair_shop_id = ctx.partner_id
          and i.created_at >= date_trunc('month', now())
      ), 0)
    ) into v_metrics
    from public.service_orders so
    where so.tenant_id = ctx.tenant_id
      and so.repair_shop_id = ctx.partner_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'key', to_char(month_start, 'YYYY-MM'),
      'amount', amount,
      'count', total_count
    ) order by month_start), '[]'::jsonb)
    into v_monthly
    from (
      select m.month_start,
             coalesce(sum(so.budget), 0) amount,
             count(so.id) total_count
      from generate_series(
        date_trunc('month', current_date) - interval '5 months',
        date_trunc('month', current_date),
        interval '1 month'
      ) m(month_start)
      left join public.service_orders so
        on so.tenant_id = ctx.tenant_id
       and so.repair_shop_id = ctx.partner_id
       and so.created_at >= m.month_start
       and so.created_at < m.month_start + interval '1 month'
      group by m.month_start
    ) months;

    select coalesce(jsonb_agg(jsonb_build_object(
      'status', operational_status,
      'count', total_count
    ) order by total_count desc), '[]'::jsonb)
    into v_status
    from (
      select so.operational_status::text operational_status,
             count(*) total_count
      from public.service_orders so
      where so.tenant_id = ctx.tenant_id
        and so.repair_shop_id = ctx.partner_id
      group by so.operational_status::text
    ) statuses;
  end if;

  return query select ctx.kind, v_metrics, v_monthly, v_status;
end
$$;

revoke all on function public.get_partner_dashboard() from public, anon;
grant execute on function public.get_partner_dashboard() to authenticated;

-- ─── Avisos de licitação no dashboard da gestão ────────────────────────────

create or replace function public.get_procurement_alerts()
returns table (
  partner_kind text,
  partner_id uuid,
  partner_name text,
  contract_number text,
  contract_end date,
  days_remaining integer,
  contract_value numeric,
  committed_value numeric,
  remaining_value numeric,
  remaining_percent numeric,
  alert_code text,
  severity text,
  blocks_new_operations boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
begin
  select * into ctx from public.service_order_manager_context();

  return query
    with partners as (
      select 'posto'::text kind, s.id, s.name, s.contract_number,
             s.contract_end, s.contract_value,
             s.contract_alert_percent alert_percent,
             s.contract_alert_days alert_days,
             s.is_active,
             public.station_contract_committed(s.id) committed
      from public.fuel_stations s
      where ctx.superadmin or s.tenant_id = ctx.tenant_id
      union all
      select 'oficina'::text, o.id, o.name, o.contract_number,
             o.contract_end, o.contract_value,
             o.contract_alert_percent, o.contract_alert_days, o.is_active,
             public.repair_shop_contract_committed(o.id)
      from public.repair_shops o
      where ctx.superadmin or o.tenant_id = ctx.tenant_id
    ),
    snapshots as (
      select p.*,
             case when p.contract_value is null then null
               else greatest(p.contract_value - p.committed, 0) end remaining,
             case when coalesce(p.contract_value, 0) <= 0 then null
               else round(greatest(p.contract_value - p.committed, 0)
                 / p.contract_value * 100, 2) end remaining_pct,
             case when p.contract_end is null then null
               else p.contract_end - current_date end days_left
      from partners p
    )
    select s.kind, s.id, s.name, s.contract_number, s.contract_end,
           s.days_left, s.contract_value, s.committed, s.remaining,
           s.remaining_pct, a.alert_code, a.severity, a.blocks
    from snapshots s
    cross join lateral (
      select 'contract_expired'::text, 'error'::text, true
      where s.contract_end is not null and s.days_left < 0
      union all
      select 'contract_expiring', 'warning', false
      where s.contract_end is not null
        and s.days_left between 0 and s.alert_days
      union all
      select 'budget_exhausted', 'error', true
      where s.contract_value is not null and s.remaining <= 0
      union all
      select 'budget_low', 'warning', false
      where s.contract_value is not null
        and s.remaining > 0
        and s.remaining_pct <= s.alert_percent
    ) a(alert_code, severity, blocks)
    order by
      case a.severity when 'error' then 0 else 1 end,
      s.days_left nulls last,
      s.remaining_pct nulls last,
      s.name;
end
$$;

revoke all on function public.get_procurement_alerts()
  from public, anon;
grant execute on function public.get_procurement_alerts()
  to authenticated;

-- ─── Travas financeiras: somente novas despesas ─────────────────────────────

create or replace function public.enforce_station_contract_budget()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
  v_liters numeric;
  v_price numeric;
  v_new_commitment numeric;
  v_committed numeric;
  v_remaining numeric;
begin
  if new.station_id is null
     or new.workflow_status::text not in ('autorizado', 'lancado_direto') then
    return new;
  end if;

  select * into s
  from public.fuel_stations
  where id = new.station_id
  for update;

  if s.contract_value is null then return new; end if;

  if new.workflow_status::text = 'autorizado' then
    select coalesce(new.max_liters, v.tank_capacity)
      into v_liters
      from public.vehicles v
     where v.id = new.vehicle_id;
    if v_liters is null or v_liters <= 0 then
      raise exception 'Informe o limite de litros para reservar o orçamento desta licitação';
    end if;
    select nullif(fp.value, '')::numeric
      into v_price
      from jsonb_each_text(coalesce(s.fuel_prices, '{}'::jsonb)) fp
     where lower(fp.key) = lower(new.fuel_type)
     limit 1;
    v_new_commitment := round(v_liters * coalesce(v_price, 0), 2);
  else
    v_new_commitment := coalesce(new.total_cost, 0);
  end if;

  if v_new_commitment <= 0 then
    raise exception 'Não foi possível calcular o valor a comprometer na licitação';
  end if;

  v_committed := public.station_contract_committed(s.id);
  v_remaining := greatest(s.contract_value - v_committed, 0);
  if v_new_commitment > v_remaining then
    raise exception 'Orçamento da licitação insuficiente: saldo de R$ % para uma nova operação de R$ %. Histórico e registros anteriores continuam disponíveis.',
      round(v_remaining, 2), round(v_new_commitment, 2);
  end if;

  return new;
end
$$;

drop trigger if exists trg_enforce_station_contract_budget
  on public.fuelings;
create trigger trg_enforce_station_contract_budget
before insert on public.fuelings
for each row execute function public.enforce_station_contract_budget();

create or replace function public.enforce_repair_shop_contract_budget()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  shop record;
  v_committed numeric;
  v_remaining numeric;
begin
  if new.status <> 'aprovado'
     or old.status = 'aprovado' then
    return new;
  end if;

  select * into shop
  from public.repair_shops
  where id = new.repair_shop_id
  for update;

  if not coalesce(shop.is_active, false) then
    raise exception 'A oficina está inativa. Ordens anteriores continuam disponíveis, mas um novo orçamento não pode ser aprovado.';
  end if;
  if shop.contract_start is not null and shop.contract_start > current_date then
    raise exception 'O contrato da oficina inicia em %', to_char(shop.contract_start, 'DD/MM/YYYY');
  end if;
  if shop.contract_end is not null and shop.contract_end < current_date then
    raise exception 'O contrato da oficina venceu em %. Ordens anteriores continuam disponíveis.', to_char(shop.contract_end, 'DD/MM/YYYY');
  end if;
  if shop.contract_value is null then return new; end if;

  v_committed := public.repair_shop_contract_committed(shop.id);
  v_remaining := greatest(shop.contract_value - v_committed, 0);
  if coalesce(new.total, 0) > v_remaining then
    raise exception 'Orçamento da licitação da oficina insuficiente: saldo de R$ % para aprovar R$ %. Ordens anteriores continuam disponíveis.',
      round(v_remaining, 2), round(coalesce(new.total, 0), 2);
  end if;

  return new;
end
$$;

drop trigger if exists trg_enforce_repair_shop_contract_budget
  on public.service_order_quotes;
create trigger trg_enforce_repair_shop_contract_budget
before update of status on public.service_order_quotes
for each row execute function public.enforce_repair_shop_contract_budget();

revoke all on function public.enforce_station_contract_budget()
  from public, anon, authenticated;
revoke all on function public.enforce_repair_shop_contract_budget()
  from public, anon, authenticated;

comment on column public.fuel_stations.contract_value is
  'Valor total da licitação; nulo mantém o controle financeiro desabilitado até configuração.';
comment on column public.repair_shops.contract_value is
  'Valor total da licitação; nulo mantém o controle financeiro desabilitado até configuração.';
comment on function public.partner_read_context() is
  'Contexto somente leitura do parceiro; não bloqueia histórico por vencimento/inatividade.';
comment on function public.get_partner_contract_status() is
  'Status detalhado da vigência e do orçamento do parceiro autenticado.';
comment on function public.get_procurement_alerts() is
  'Alertas de vencimento e saldo de licitação para o dashboard da gestão.';
