-- Ordens antigas podem ter custo nulo ou zerado mesmo após o recebimento.
-- Nessa situação, o orçamento aprovado continua sendo a melhor evidência do
-- valor que consumiu a licitação e não pode liberar saldo artificialmente.
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
          then coalesce(nullif(so.cost, 0), so.budget, 0)
          else 0
        end
      ), 0)::numeric realized,
      coalesce(sum(
        case
          when so.operational_status::text = 'received'
           and so.financial_status::text <> 'not_started'
           and so.received_at >= date_trunc('month', now())
          then coalesce(nullif(so.cost, 0), so.budget, 0)
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

revoke all on function public.repair_shop_contract_usage(uuid)
  from public, anon, authenticated;
