-- ============================================================================
-- ETAPA 2 — Leitura transparente do consumo das licitações
--
-- O saldo contratual não pode somar marcos financeiros cumulativos. Reserva,
-- realização, faturamento e pagamento descrevem a mesma despesa em momentos
-- diferentes; portanto, somente reserva + realização + valores contestados
-- consomem o teto da licitação.
--
-- Postos ainda não possuem fechamento fiscal/NF/pagamento modelados. Nesses
-- casos os respectivos campos retornam NULL, nunca zero, para não sugerir um
-- fato fiscal inexistente.
-- ============================================================================

create or replace function public.station_contract_usage(p_station_id uuid)
returns table (
  reserved_value numeric,
  realized_value numeric,
  disputed_value numeric,
  consumed_value numeric,
  month_realized_value numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with values_by_status as (
    select
      coalesce(sum(
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
          else 0
        end
      ), 0)::numeric reserved,
      coalesce(sum(
        case
          when f.filled_at is not null
           and f.workflow_status::text in ('concluido', 'validado', 'lancado_direto')
          then coalesce(f.total_cost, 0)
          else 0
        end
      ), 0)::numeric realized,
      coalesce(sum(
        case
          when f.filled_at is not null
           and f.workflow_status::text = 'rejeitado_admin'
          then coalesce(f.total_cost, 0)
          else 0
        end
      ), 0)::numeric disputed,
      coalesce(sum(
        case
          when f.filled_at >= date_trunc('month', now())
           and f.workflow_status::text in ('concluido', 'validado', 'lancado_direto')
          then coalesce(f.total_cost, 0)
          else 0
        end
      ), 0)::numeric month_realized
    from public.fuel_stations s
    left join public.fuelings f on f.station_id = s.id
    left join public.vehicles v on v.id = f.vehicle_id
    where s.id = p_station_id
  )
  select reserved,
         realized,
         disputed,
         reserved + realized + disputed,
         month_realized
  from values_by_status
$$;

create or replace function public.repair_shop_contract_usage(p_repair_shop_id uuid)
returns table (
  reserved_value numeric,
  realized_value numeric,
  disputed_value numeric,
  consumed_value numeric,
  invoiced_value numeric,
  paid_value numeric,
  month_realized_value numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with order_values as (
    select
      coalesce(sum(
        case
          when so.operational_status::text <> 'cancelled'
           and so.operational_status::text <> 'received'
           and so.financial_status::text <> 'not_started'
          then coalesce(so.budget, 0)
          else 0
        end
      ), 0)::numeric reserved,
      coalesce(sum(
        case
          when so.operational_status::text = 'received'
           and so.financial_status::text <> 'not_started'
          then coalesce(so.cost, so.budget, 0)
          else 0
        end
      ), 0)::numeric realized,
      coalesce(sum(
        case
          when so.operational_status::text = 'received'
           and so.financial_status::text <> 'not_started'
           and so.received_at >= date_trunc('month', now())
          then coalesce(so.cost, so.budget, 0)
          else 0
        end
      ), 0)::numeric month_realized
    from public.service_orders so
    where so.repair_shop_id = p_repair_shop_id
  ),
  invoices as (
    select coalesce(sum(i.amount), 0)::numeric invoiced
    from public.service_order_invoices i
    where i.repair_shop_id = p_repair_shop_id
  ),
  payments as (
    select coalesce(sum(p.amount), 0)::numeric paid
    from public.service_order_payments p
    join public.service_orders so on so.id = p.service_order_id
    where so.repair_shop_id = p_repair_shop_id
  )
  select o.reserved,
         o.realized,
         0::numeric,
         o.reserved + o.realized,
         i.invoiced,
         p.paid,
         o.month_realized
  from order_values o
  cross join invoices i
  cross join payments p
$$;

revoke all on function public.station_contract_usage(uuid)
  from public, anon, authenticated;
revoke all on function public.repair_shop_contract_usage(uuid)
  from public, anon, authenticated;

-- Mantém as travas e alertas existentes usando a mesma definição do painel.
create or replace function public.station_contract_committed(p_station_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(u.consumed_value, 0)
  from public.station_contract_usage(p_station_id) u
$$;

create or replace function public.repair_shop_contract_committed(p_repair_shop_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(u.consumed_value, 0)
  from public.repair_shop_contract_usage(p_repair_shop_id) u
$$;

revoke all on function public.station_contract_committed(uuid)
  from public, anon, authenticated;
revoke all on function public.repair_shop_contract_committed(uuid)
  from public, anon, authenticated;

create or replace function public.get_partner_contract_usage()
returns table (
  partner_kind text,
  partner_id uuid,
  partner_name text,
  contract_number text,
  contract_start date,
  contract_end date,
  contract_value numeric,
  reserved_value numeric,
  realized_value numeric,
  disputed_value numeric,
  consumed_value numeric,
  invoiced_value numeric,
  paid_value numeric,
  remaining_value numeric,
  consumed_percent numeric,
  month_realized_value numeric,
  month_contract_percent numeric,
  days_remaining integer,
  is_active boolean,
  can_create_new boolean
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

  if ctx.kind = 'posto' then
    return query
      select 'posto'::text,
             s.id,
             s.name,
             s.contract_number,
             s.contract_start,
             s.contract_end,
             s.contract_value,
             u.reserved_value,
             u.realized_value,
             u.disputed_value,
             u.consumed_value,
             null::numeric,
             null::numeric,
             case when s.contract_value is null then null
                  else greatest(s.contract_value - u.consumed_value, 0) end,
             case when coalesce(s.contract_value, 0) <= 0 then null
                  else round(u.consumed_value / s.contract_value * 100, 2) end,
             u.month_realized_value,
             case when coalesce(s.contract_value, 0) <= 0 then null
                  else round(u.month_realized_value / s.contract_value * 100, 2) end,
             case when s.contract_end is null then null
                  else s.contract_end - current_date end,
             s.is_active,
             s.is_active
               and (s.contract_start is null or s.contract_start <= current_date)
               and (s.contract_end is null or s.contract_end >= current_date)
               and (s.contract_value is null or u.consumed_value < s.contract_value)
      from public.fuel_stations s
      cross join lateral public.station_contract_usage(s.id) u
      where s.id = ctx.partner_id
        and s.tenant_id = ctx.tenant_id;
  else
    return query
      select 'oficina'::text,
             o.id,
             o.name,
             o.contract_number,
             o.contract_start,
             o.contract_end,
             o.contract_value,
             u.reserved_value,
             u.realized_value,
             u.disputed_value,
             u.consumed_value,
             u.invoiced_value,
             u.paid_value,
             case when o.contract_value is null then null
                  else greatest(o.contract_value - u.consumed_value, 0) end,
             case when coalesce(o.contract_value, 0) <= 0 then null
                  else round(u.consumed_value / o.contract_value * 100, 2) end,
             u.month_realized_value,
             case when coalesce(o.contract_value, 0) <= 0 then null
                  else round(u.month_realized_value / o.contract_value * 100, 2) end,
             case when o.contract_end is null then null
                  else o.contract_end - current_date end,
             o.is_active,
             o.is_active
               and (o.contract_start is null or o.contract_start <= current_date)
               and (o.contract_end is null or o.contract_end >= current_date)
               and (o.contract_value is null or u.consumed_value < o.contract_value)
      from public.repair_shops o
      cross join lateral public.repair_shop_contract_usage(o.id) u
      where o.id = ctx.partner_id
        and o.tenant_id = ctx.tenant_id;
  end if;
end
$$;

revoke all on function public.get_partner_contract_usage()
  from public, anon;
grant execute on function public.get_partner_contract_usage()
  to authenticated;

create or replace function public.get_procurement_contract_usage()
returns table (
  partner_kind text,
  partner_id uuid,
  partner_name text,
  contract_number text,
  contract_start date,
  contract_end date,
  contract_value numeric,
  reserved_value numeric,
  realized_value numeric,
  disputed_value numeric,
  consumed_value numeric,
  invoiced_value numeric,
  paid_value numeric,
  remaining_value numeric,
  consumed_percent numeric,
  month_realized_value numeric,
  month_contract_percent numeric,
  days_remaining integer,
  is_active boolean,
  can_create_new boolean
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
    with usage as (
      select 'posto'::text kind,
             s.id,
             s.name,
             s.contract_number,
             s.contract_start,
             s.contract_end,
             s.contract_value,
             u.reserved_value,
             u.realized_value,
             u.disputed_value,
             u.consumed_value,
             null::numeric invoiced_value,
             null::numeric paid_value,
             u.month_realized_value,
             s.is_active
      from public.fuel_stations s
      cross join lateral public.station_contract_usage(s.id) u
      where ctx.superadmin or s.tenant_id = ctx.tenant_id

      union all

      select 'oficina'::text,
             o.id,
             o.name,
             o.contract_number,
             o.contract_start,
             o.contract_end,
             o.contract_value,
             u.reserved_value,
             u.realized_value,
             u.disputed_value,
             u.consumed_value,
             u.invoiced_value,
             u.paid_value,
             u.month_realized_value,
             o.is_active
      from public.repair_shops o
      cross join lateral public.repair_shop_contract_usage(o.id) u
      where ctx.superadmin or o.tenant_id = ctx.tenant_id
    )
    select x.kind,
           x.id,
           x.name,
           x.contract_number,
           x.contract_start,
           x.contract_end,
           x.contract_value,
           x.reserved_value,
           x.realized_value,
           x.disputed_value,
           x.consumed_value,
           x.invoiced_value,
           x.paid_value,
           case when x.contract_value is null then null
                else greatest(x.contract_value - x.consumed_value, 0) end,
           case when coalesce(x.contract_value, 0) <= 0 then null
                else round(x.consumed_value / x.contract_value * 100, 2) end,
           x.month_realized_value,
           case when coalesce(x.contract_value, 0) <= 0 then null
                else round(x.month_realized_value / x.contract_value * 100, 2) end,
           case when x.contract_end is null then null
                else x.contract_end - current_date end,
           x.is_active,
           x.is_active
             and (x.contract_start is null or x.contract_start <= current_date)
             and (x.contract_end is null or x.contract_end >= current_date)
             and (x.contract_value is null or x.consumed_value < x.contract_value)
    from usage x
    order by x.kind, x.name;
end
$$;

revoke all on function public.get_procurement_contract_usage()
  from public, anon;
grant execute on function public.get_procurement_contract_usage()
  to authenticated;

comment on function public.get_partner_contract_usage() is
  'Resumo do teto contratual do parceiro autenticado, sem somar marcos financeiros cumulativos.';
comment on function public.get_procurement_contract_usage() is
  'Resumo gerencial das licitações de postos e oficinas do tenant autenticado.';
