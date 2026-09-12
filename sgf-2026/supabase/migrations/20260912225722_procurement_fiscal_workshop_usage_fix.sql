-- 6A corrective migration: keep workshop reservation consumption independent
-- from the one-to-many invoice ledger. A quote item has one reservation but
-- may be delivered by several partial invoices.

create or replace function sgf_private.procurement_fiscal_reconciliation_read(
  p_year integer default null,
  p_instrument uuid default null,
  p_department uuid default null
)
returns table (
  process_id uuid, process_reference text, instrument_id uuid,
  instrument_reference text, instrument_kind text, instrument_status text,
  allocation_id uuid, fiscal_year integer, department_id uuid,
  department_name text, category text, appropriation text, funding_source text,
  simam_code text, declared_value numeric, planned_limit numeric,
  reserved_amount numeric, realized_amount numeric, disputed_amount numeric,
  consumed_amount numeric, remaining_amount numeric, invoiced_amount numeric,
  attested_amount numeric, paid_amount numeric
)
language plpgsql stable security definer set search_path=''
as $$
declare
  actor public.profiles;
begin
  actor := sgf_private.procurement_fiscal_actor();
  if p_year is not null and (p_year < 1900 or p_year > 2200) then
    raise exception 'Exercício inválido';
  end if;

  return query
  with base as (
    select process.id process_id, process.reference process_reference,
      instrument.id instrument_id, instrument.reference instrument_reference,
      instrument.kind instrument_kind, instrument.status instrument_status,
      allocation.id allocation_id, plan.fiscal_year, allocation.department_id,
      department.name department_name, allocation.category,
      allocation.appropriation, allocation.funding_source, allocation.simam_code,
      instrument.declared_value, allocation.spending_limit planned_limit
    from public.instrument_budget_allocations allocation
    join public.instrument_budget_plans plan on plan.id=allocation.plan_id
    join public.procurement_instruments instrument on instrument.id=plan.instrument_id
    join public.procurement_processes process on process.id=instrument.process_id
    join public.departments department on department.id=allocation.department_id
    where process.tenant_id=actor.tenant_id
      and (p_year is null or plan.fiscal_year=p_year)
      and (p_instrument is null or instrument.id=p_instrument)
      and (p_department is null or allocation.department_id=p_department)
      and (actor.role<>'secretario' or allocation.department_id=actor.department_id)
  ),
  fuel_usage as (
    select reservation.allocation_id,
      sum(case when reservation.state='reserved' then reservation.committed_amount else 0 end)::numeric reserved_amount,
      sum(case when reservation.state='realized' then reservation.committed_amount else 0 end)::numeric realized_amount,
      sum(case when reservation.state='disputed' then reservation.committed_amount else 0 end)::numeric disputed_amount,
      null::numeric invoiced_amount, null::numeric attested_amount, null::numeric paid_amount
    from public.procurement_fuel_reservations reservation
    where reservation.tenant_id=actor.tenant_id group by reservation.allocation_id
  ),
  station_usage as (
    select reservation.allocation_id,
      sum(case when reservation.state='reserved' then reservation.committed_amount else 0 end)::numeric reserved_amount,
      sum(case when reservation.state='realized' then reservation.committed_amount else 0 end)::numeric realized_amount,
      sum(case when reservation.state='disputed' then reservation.committed_amount else 0 end)::numeric disputed_amount,
      null::numeric invoiced_amount, null::numeric attested_amount, null::numeric paid_amount
    from public.procurement_station_reservations reservation
    where reservation.tenant_id=actor.tenant_id group by reservation.allocation_id
  ),
  workshop_reservation_usage as (
    select reservation.allocation_id,
      sum(case when reservation.state='reserved' then reservation.committed_amount else 0 end)::numeric reserved_amount,
      sum(case when reservation.state='realized' then reservation.committed_amount else 0 end)::numeric realized_amount,
      0::numeric disputed_amount
    from public.service_order_quote_procurement_reservations reservation
    where reservation.tenant_id=actor.tenant_id group by reservation.allocation_id
  ),
  workshop_invoice_lines as (
    select reservation.allocation_id, reservation.service_order_id,
      invoice_line.invoice_id, invoice_line.line_amount,
      invoice.attested_at,
      coalesce(invoice.attested_amount, invoice.amount) attested_invoice_amount
    from public.service_order_quote_procurement_reservations reservation
    join public.service_order_invoice_items invoice_line
      on invoice_line.quote_item_id=reservation.quote_item_id
    join public.service_order_invoices invoice
      on invoice.id=invoice_line.invoice_id
     and invoice.service_order_id=reservation.service_order_id
    where reservation.tenant_id=actor.tenant_id and reservation.state='realized'
  ),
  workshop_invoice_totals as (
    select service_order_id, invoice_id, sum(line_amount)::numeric invoice_total
    from workshop_invoice_lines group by service_order_id, invoice_id
  ),
  workshop_allocation_invoice_totals as (
    select line.allocation_id, line.service_order_id, line.invoice_id, sum(line.line_amount)::numeric allocation_invoice_total
    from workshop_invoice_lines line group by line.allocation_id, line.service_order_id, line.invoice_id
  ),
  workshop_order_totals as (
    select service_order_id, sum(line_amount)::numeric order_total
    from workshop_invoice_lines group by service_order_id
  ),
  workshop_paid_by_invoice as (
    select invoice_id, service_order_id, sum(amount)::numeric paid_amount
    from public.service_order_payments
    where tenant_id=actor.tenant_id and invoice_id is not null
    group by invoice_id, service_order_id
  ),
  workshop_paid_by_order as (
    select service_order_id, sum(amount)::numeric paid_amount
    from public.service_order_payments
    where tenant_id=actor.tenant_id and invoice_id is null
    group by service_order_id
  ),
  workshop_invoice_usage as (
    select allocation_invoice.allocation_id,
      sum(allocation_invoice.allocation_invoice_total)::numeric invoiced_amount,
      sum(case when lines.attested_at is null then 0 else
        allocation_invoice.allocation_invoice_total * lines.attested_invoice_amount / nullif(invoice_total.invoice_total,0)
      end)::numeric attested_amount,
      sum(coalesce(paid_invoice.paid_amount,0) * allocation_invoice.allocation_invoice_total / nullif(invoice_total.invoice_total,0))
        + sum(coalesce(paid_order.paid_amount,0) * allocation_invoice.allocation_invoice_total / nullif(order_total.order_total,0))
        ::numeric paid_amount
    from workshop_allocation_invoice_totals allocation_invoice
    join workshop_invoice_totals invoice_total
      on invoice_total.service_order_id=allocation_invoice.service_order_id
     and invoice_total.invoice_id=allocation_invoice.invoice_id
    join lateral (
      select max(attested_at) attested_at, max(attested_invoice_amount) attested_invoice_amount
      from workshop_invoice_lines line
      where line.service_order_id=allocation_invoice.service_order_id
        and line.invoice_id=allocation_invoice.invoice_id
    ) lines on true
    left join workshop_order_totals order_total on order_total.service_order_id=allocation_invoice.service_order_id
    left join workshop_paid_by_invoice paid_invoice
      on paid_invoice.service_order_id=allocation_invoice.service_order_id
     and paid_invoice.invoice_id=allocation_invoice.invoice_id
    left join workshop_paid_by_order paid_order on paid_order.service_order_id=allocation_invoice.service_order_id
    group by allocation_invoice.allocation_id
  ),
  workshop_usage as (
    select reservation_usage.allocation_id,
      reservation_usage.reserved_amount, reservation_usage.realized_amount,
      reservation_usage.disputed_amount, coalesce(invoice_usage.invoiced_amount,0) invoiced_amount,
      coalesce(invoice_usage.attested_amount,0) attested_amount, coalesce(invoice_usage.paid_amount,0) paid_amount
    from workshop_reservation_usage reservation_usage
    left join workshop_invoice_usage invoice_usage using (allocation_id)
  ),
  usage as (
    select u.reserved_amount, u.realized_amount, u.disputed_amount, u.invoiced_amount, u.attested_amount, u.paid_amount, u.allocation_id from fuel_usage u
    union all select u.reserved_amount, u.realized_amount, u.disputed_amount, u.invoiced_amount, u.attested_amount, u.paid_amount, u.allocation_id from station_usage u
    union all select u.reserved_amount, u.realized_amount, u.disputed_amount, u.invoiced_amount, u.attested_amount, u.paid_amount, u.allocation_id from workshop_usage u
  ),
  rolled as (
    select usage.allocation_id, sum(usage.reserved_amount)::numeric reserved_amount,
      sum(usage.realized_amount)::numeric realized_amount, sum(usage.disputed_amount)::numeric disputed_amount,
      sum(usage.invoiced_amount)::numeric invoiced_amount, sum(usage.attested_amount)::numeric attested_amount,
      sum(usage.paid_amount)::numeric paid_amount
    from usage group by usage.allocation_id
  )
  select base.process_id, base.process_reference, base.instrument_id, base.instrument_reference,
    base.instrument_kind, base.instrument_status, base.allocation_id, base.fiscal_year,
    base.department_id, base.department_name, base.category, base.appropriation,
    base.funding_source, base.simam_code, base.declared_value, base.planned_limit,
    coalesce(rolled.reserved_amount,0), coalesce(rolled.realized_amount,0),
    coalesce(rolled.disputed_amount,0),
    coalesce(rolled.reserved_amount,0)+coalesce(rolled.realized_amount,0)+coalesce(rolled.disputed_amount,0),
    greatest(base.planned_limit-(coalesce(rolled.reserved_amount,0)+coalesce(rolled.realized_amount,0)+coalesce(rolled.disputed_amount,0)),0),
    rolled.invoiced_amount, rolled.attested_amount, rolled.paid_amount
  from base left join rolled on rolled.allocation_id=base.allocation_id
  order by base.fiscal_year desc, base.department_name, base.instrument_reference,
    base.category, base.appropriation, base.allocation_id;
end;
$$;

revoke all on function sgf_private.procurement_fiscal_reconciliation_read(integer,uuid,uuid) from public, anon, authenticated;
grant execute on function sgf_private.procurement_fiscal_reconciliation_read(integer,uuid,uuid) to authenticated;
