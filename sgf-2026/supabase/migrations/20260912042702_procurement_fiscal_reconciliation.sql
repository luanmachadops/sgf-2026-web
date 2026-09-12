-- Stage 6A: auditable fiscal reconciliation by procurement instrument,
-- budget allocation and department. This is read-only and deliberately keeps
-- legacy ledger rows separate until an operator proves their new allocation.

create function sgf_private.procurement_fiscal_actor()
returns public.profiles
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  actor public.profiles;
begin
  actor := sgf_private.instrument_budget_actor(false);
  if not coalesce('reports'=any(actor.allowed_modules), false) then
    raise exception 'Acesso ao módulo de relatórios obrigatório' using errcode='42501';
  end if;
  return actor;
end;
$$;
revoke all on function sgf_private.procurement_fiscal_actor() from public, anon, authenticated;

create function sgf_private.procurement_fiscal_reconciliation_read(
  p_year integer default null,
  p_instrument uuid default null,
  p_department uuid default null
)
returns table (
  process_id uuid,
  process_reference text,
  instrument_id uuid,
  instrument_reference text,
  instrument_kind text,
  instrument_status text,
  allocation_id uuid,
  fiscal_year integer,
  department_id uuid,
  department_name text,
  category text,
  appropriation text,
  funding_source text,
  simam_code text,
  declared_value numeric,
  planned_limit numeric,
  reserved_amount numeric,
  realized_amount numeric,
  disputed_amount numeric,
  consumed_amount numeric,
  remaining_amount numeric,
  invoiced_amount numeric,
  attested_amount numeric,
  paid_amount numeric
)
language plpgsql
stable
security definer
set search_path=''
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
    select
      process.id as process_id,
      process.reference as process_reference,
      instrument.id as instrument_id,
      instrument.reference as instrument_reference,
      instrument.kind as instrument_kind,
      instrument.status as instrument_status,
      allocation.id as allocation_id,
      plan.fiscal_year,
      allocation.department_id,
      department.name as department_name,
      allocation.category,
      allocation.appropriation,
      allocation.funding_source,
      allocation.simam_code,
      instrument.declared_value,
      allocation.spending_limit as planned_limit
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
    select
      reservation.allocation_id,
      sum(case when reservation.state='reserved' then reservation.committed_amount else 0 end)::numeric as reserved_amount,
      sum(case when reservation.state='realized' then reservation.committed_amount else 0 end)::numeric as realized_amount,
      sum(case when reservation.state='disputed' then reservation.committed_amount else 0 end)::numeric as disputed_amount,
      null::numeric as invoiced_amount,
      null::numeric as attested_amount,
      null::numeric as paid_amount
    from public.procurement_fuel_reservations reservation
    where reservation.tenant_id=actor.tenant_id
    group by reservation.allocation_id
  ),
  station_usage as (
    select
      reservation.allocation_id,
      sum(case when reservation.state='reserved' then reservation.committed_amount else 0 end)::numeric as reserved_amount,
      sum(case when reservation.state='realized' then reservation.committed_amount else 0 end)::numeric as realized_amount,
      sum(case when reservation.state='disputed' then reservation.committed_amount else 0 end)::numeric as disputed_amount,
      null::numeric as invoiced_amount,
      null::numeric as attested_amount,
      null::numeric as paid_amount
    from public.procurement_station_reservations reservation
    where reservation.tenant_id=actor.tenant_id
    group by reservation.allocation_id
  ),
  workshop_lines as (
    select
      reservation.quote_item_id,
      reservation.allocation_id,
      reservation.service_order_id,
      invoice.id as invoice_id,
      invoice.amount as invoice_amount,
      invoice.attested_at,
      coalesce(invoice.attested_amount, invoice.amount) as attested_invoice_amount,
      invoice_line.line_amount
    from public.service_order_quote_procurement_reservations reservation
    join public.service_order_invoice_items invoice_line
      on invoice_line.quote_item_id=reservation.quote_item_id
    join public.service_order_invoices invoice
      on invoice.id=invoice_line.invoice_id
     and invoice.service_order_id=reservation.service_order_id
    where reservation.tenant_id=actor.tenant_id
      and reservation.state='realized'
  ),
  workshop_invoice_totals as (
    select service_order_id, invoice_id, sum(line_amount)::numeric as invoice_line_total
    from workshop_lines
    group by service_order_id, invoice_id
  ),
  workshop_order_totals as (
    select service_order_id, sum(line_amount)::numeric as order_line_total
    from workshop_lines
    group by service_order_id
  ),
  workshop_paid as (
    select payment.service_order_id, sum(payment.amount)::numeric as paid_amount
    from public.service_order_payments payment
    where payment.tenant_id=actor.tenant_id
    group by payment.service_order_id
  ),
  workshop_usage as (
    select
      reservation.allocation_id,
      sum(case when reservation.state='reserved' then reservation.committed_amount else 0 end)::numeric as reserved_amount,
      sum(case when reservation.state='realized' then reservation.committed_amount else 0 end)::numeric as realized_amount,
      0::numeric as disputed_amount,
      sum(workshop_line.line_amount)::numeric as invoiced_amount,
      sum(case when workshop_line.attested_at is null then 0 else
        workshop_line.line_amount * workshop_line.attested_invoice_amount / nullif(workshop_invoice_total.invoice_line_total,0)
      end)::numeric as attested_amount,
      sum(coalesce(workshop_paid.paid_amount,0) * workshop_line.line_amount / nullif(workshop_order_total.order_line_total,0))::numeric as paid_amount
    from public.service_order_quote_procurement_reservations reservation
    left join workshop_lines workshop_line
      on workshop_line.quote_item_id=reservation.quote_item_id
     and workshop_line.allocation_id=reservation.allocation_id
     and workshop_line.service_order_id=reservation.service_order_id
    left join workshop_invoice_totals workshop_invoice_total
      on workshop_invoice_total.service_order_id=workshop_line.service_order_id
     and workshop_invoice_total.invoice_id=workshop_line.invoice_id
    left join workshop_order_totals workshop_order_total
      on workshop_order_total.service_order_id=workshop_line.service_order_id
    left join workshop_paid
      on workshop_paid.service_order_id=reservation.service_order_id
    where reservation.tenant_id=actor.tenant_id
    group by reservation.allocation_id
  ),
  usage as (
    select * from fuel_usage
    union all select * from station_usage
    union all select * from workshop_usage
  ),
  rolled as (
    select
      usage.allocation_id,
      sum(usage.reserved_amount)::numeric as reserved_amount,
      sum(usage.realized_amount)::numeric as realized_amount,
      sum(usage.disputed_amount)::numeric as disputed_amount,
      sum(usage.invoiced_amount)::numeric as invoiced_amount,
      sum(usage.attested_amount)::numeric as attested_amount,
      sum(usage.paid_amount)::numeric as paid_amount
    from usage
    group by usage.allocation_id
  )
  select
    base.process_id,
    base.process_reference,
    base.instrument_id,
    base.instrument_reference,
    base.instrument_kind,
    base.instrument_status,
    base.allocation_id,
    base.fiscal_year,
    base.department_id,
    base.department_name,
    base.category,
    base.appropriation,
    base.funding_source,
    base.simam_code,
    base.declared_value,
    base.planned_limit,
    coalesce(rolled.reserved_amount,0),
    coalesce(rolled.realized_amount,0),
    coalesce(rolled.disputed_amount,0),
    coalesce(rolled.reserved_amount,0)+coalesce(rolled.realized_amount,0)+coalesce(rolled.disputed_amount,0),
    greatest(base.planned_limit-(coalesce(rolled.reserved_amount,0)+coalesce(rolled.realized_amount,0)+coalesce(rolled.disputed_amount,0)),0),
    rolled.invoiced_amount,
    rolled.attested_amount,
    rolled.paid_amount
  from base
  left join rolled on rolled.allocation_id=base.allocation_id
  order by base.fiscal_year desc,base.department_name,base.instrument_reference,base.category,base.appropriation,base.allocation_id;
end;
$$;
revoke all on function sgf_private.procurement_fiscal_reconciliation_read(integer,uuid,uuid) from public, anon, authenticated;
grant execute on function sgf_private.procurement_fiscal_reconciliation_read(integer,uuid,uuid) to authenticated;

create function sgf_private.procurement_legacy_reconciliation_read(
  p_year integer default null,
  p_department uuid default null
)
returns table (
  source_type text,
  source_id uuid,
  contract_id uuid,
  contract_reference text,
  fiscal_year integer,
  department_id uuid,
  department_name text,
  partner_id uuid,
  vehicle_id uuid,
  reserved_amount numeric,
  realized_amount numeric,
  disputed_amount numeric,
  consumed_amount numeric,
  source_status text,
  reconciliation_status text
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  actor public.profiles;
begin
  actor := sgf_private.procurement_fiscal_actor();
  if p_year is not null and (p_year < 1900 or p_year > 2200) then
    raise exception 'Exercício inválido';
  end if;

  return query
  select
    entry.source_type,
    entry.source_id,
    entry.contract_id,
    contract.reference,
    contract.fiscal_year,
    entry.department_id,
    department.name,
    entry.partner_id,
    entry.vehicle_id,
    entry.reserved,
    entry.realized,
    entry.disputed,
    entry.reserved+entry.realized+entry.disputed,
    entry.source_status,
    'pending'::text
  from public.budget_entries entry
  join public.budget_contracts contract on contract.id=entry.contract_id
  left join public.departments department on department.id=entry.department_id
  where contract.tenant_id=actor.tenant_id
    and (p_year is null or contract.fiscal_year=p_year)
    and (p_department is null or entry.department_id=p_department)
    and (actor.role<>'secretario' or entry.department_id=actor.department_id)
    and not (
      (entry.source_type='fuelings' and exists(select 1 from public.procurement_fuel_reservations reservation where reservation.fueling_id=entry.source_id))
      or (entry.source_type='station_operations' and exists(select 1 from public.procurement_station_reservations reservation where reservation.operation_id=entry.source_id))
      or (entry.source_type='service_orders' and exists(select 1 from public.service_order_quote_procurement_reservations reservation where reservation.service_order_id=entry.source_id))
    )
  order by contract.fiscal_year desc,department.name,entry.source_type,entry.source_id;
end;
$$;
revoke all on function sgf_private.procurement_legacy_reconciliation_read(integer,uuid) from public, anon, authenticated;
grant execute on function sgf_private.procurement_legacy_reconciliation_read(integer,uuid) to authenticated;

create function public.get_procurement_fiscal_reconciliation(
  p_year integer default null,
  p_instrument uuid default null,
  p_department uuid default null
)
returns table (
  process_id uuid,
  process_reference text,
  instrument_id uuid,
  instrument_reference text,
  instrument_kind text,
  instrument_status text,
  allocation_id uuid,
  fiscal_year integer,
  department_id uuid,
  department_name text,
  category text,
  appropriation text,
  funding_source text,
  simam_code text,
  declared_value numeric,
  planned_limit numeric,
  reserved_amount numeric,
  realized_amount numeric,
  disputed_amount numeric,
  consumed_amount numeric,
  remaining_amount numeric,
  invoiced_amount numeric,
  attested_amount numeric,
  paid_amount numeric
)
language sql
stable
security invoker
set search_path=''
as $$
  select * from sgf_private.procurement_fiscal_reconciliation_read(p_year,p_instrument,p_department)
$$;
revoke all on function public.get_procurement_fiscal_reconciliation(integer,uuid,uuid) from public, anon, authenticated;
grant execute on function public.get_procurement_fiscal_reconciliation(integer,uuid,uuid) to authenticated;

create function public.get_procurement_legacy_reconciliation(
  p_year integer default null,
  p_department uuid default null
)
returns table (
  source_type text,
  source_id uuid,
  contract_id uuid,
  contract_reference text,
  fiscal_year integer,
  department_id uuid,
  department_name text,
  partner_id uuid,
  vehicle_id uuid,
  reserved_amount numeric,
  realized_amount numeric,
  disputed_amount numeric,
  consumed_amount numeric,
  source_status text,
  reconciliation_status text
)
language sql
stable
security invoker
set search_path=''
as $$
  select * from sgf_private.procurement_legacy_reconciliation_read(p_year,p_department)
$$;
revoke all on function public.get_procurement_legacy_reconciliation(integer,uuid) from public, anon, authenticated;
grant execute on function public.get_procurement_legacy_reconciliation(integer,uuid) to authenticated;

alter function sgf_private.resource_modules(text,boolean)
  rename to resource_modules_before_procurement_fiscal_reconciliation;
create function sgf_private.resource_modules(p_resource text,p_write boolean)
returns text[]
language sql
immutable
set search_path=''
as $$
  select case
    when p_resource in ('get_procurement_fiscal_reconciliation','get_procurement_legacy_reconciliation')
      then array['reports','budgets','procurement']::text[]
    else sgf_private.resource_modules_before_procurement_fiscal_reconciliation(p_resource,p_write)
  end
$$;
revoke all on function sgf_private.resource_modules(text,boolean) from public, anon, authenticated;

comment on function public.get_procurement_fiscal_reconciliation(integer,uuid,uuid) is
  'Relatório fiscal por instrumento, dotação e secretaria. Os marcos de reserva, realização, faturamento, ateste e pagamento não são somados entre si para consumir o teto.';
comment on function public.get_procurement_legacy_reconciliation(integer,uuid) is
  'Fila somente leitura de lançamentos do ledger legado sem vínculo comprovado com reservas do registro de licitações.';
