-- Stage 6B: explicit, immutable reconciliation of one legacy ledger entry.
-- No operational row is rewritten and no central reservation is created.

create table public.procurement_legacy_reconciliations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  source_type text not null check(source_type in ('fuelings','service_orders','station_operations')),
  source_id uuid not null,
  legacy_contract_id uuid not null references public.budget_contracts(id),
  instrument_id uuid not null references public.procurement_instruments(id),
  allocation_id uuid not null references public.instrument_budget_allocations(id),
  reserved_amount numeric(14,2) not null check(reserved_amount>=0 and reserved_amount<>'NaN'::numeric),
  realized_amount numeric(14,2) not null check(realized_amount>=0 and realized_amount<>'NaN'::numeric),
  disputed_amount numeric(14,2) not null check(disputed_amount>=0 and disputed_amount<>'NaN'::numeric),
  amount_at_reconciliation numeric(14,2) not null check(amount_at_reconciliation>=0 and amount_at_reconciliation<>'NaN'::numeric),
  source_status text not null,
  justification text not null check(length(trim(justification)) between 3 and 1000),
  documents jsonb not null check(jsonb_typeof(documents)='array'),
  reconciled_by uuid not null references public.profiles(id),
  reconciled_at timestamptz not null default now(),
  unique(tenant_id,source_type,source_id)
);
create index procurement_legacy_reconciliation_allocation on public.procurement_legacy_reconciliations(allocation_id);
create index procurement_legacy_reconciliation_instrument on public.procurement_legacy_reconciliations(instrument_id,reconciled_at desc);
alter table public.procurement_legacy_reconciliations enable row level security;
revoke all on public.procurement_legacy_reconciliations from public,anon,authenticated;

create function sgf_private.procurement_legacy_reconcile_actor()
returns public.profiles
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  actor public.profiles;
begin
  actor := sgf_private.procurement_actor();
  if not coalesce('budgets'=any(actor.allowed_modules),false)
     or not coalesce('reports'=any(actor.allowed_modules),false) then
    raise exception 'Acesso a limites e relatórios obrigatório' using errcode='42501';
  end if;
  return actor;
end;
$$;
revoke all on function sgf_private.procurement_legacy_reconcile_actor() from public,anon,authenticated;

create function sgf_private.procurement_legacy_reconcile(
  p_source_type text,
  p_source_id uuid,
  p_instrument uuid,
  p_allocation uuid,
  p_justification text,
  p_documents jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles;
  legacy record;
  instrument public.procurement_instruments;
  allocation public.instrument_budget_allocations;
  plan public.instrument_budget_plans;
  existing public.procurement_legacy_reconciliations;
  document jsonb;
  reconciliation_id uuid;
  total_amount numeric;
  committed_amount numeric;
begin
  actor := sgf_private.procurement_legacy_reconcile_actor();
  if p_source_type is null or p_source_type not in ('fuelings','service_orders','station_operations')
     or p_source_id is null or p_instrument is null or p_allocation is null then
    raise exception 'Origem, instrumento e dotação são obrigatórios';
  end if;
  if coalesce(length(trim(p_justification)),0) not between 3 and 1000 then
    raise exception 'Informe a justificativa da conciliação';
  end if;
  if jsonb_typeof(p_documents) is distinct from 'array' or jsonb_array_length(p_documents) not between 1 and 20 then
    raise exception 'Anexe ao menos uma referência documental HTTPS';
  end if;
  for document in select value from jsonb_array_elements(p_documents) loop
    if jsonb_typeof(document) is distinct from 'object'
       or exists(select 1 from jsonb_object_keys(document) key where key not in ('label','url'))
       or jsonb_typeof(document->'label') is distinct from 'string'
       or jsonb_typeof(document->'url') is distinct from 'string'
       or coalesce(length(trim(document->>'label')),0) not between 1 and 120
       or coalesce(document->>'url','') !~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?([/:?#][^[:space:]]*)?$'
       or length(document->>'url')>2000
       or document->>'url' ~ '^https://[^/]*@' then
      raise exception 'Documento exige título e endereço HTTPS válido';
    end if;
  end loop;

  select entry.*,contract.tenant_id as contract_tenant_id,contract.fiscal_year as legacy_year
    into legacy
    from public.budget_entries entry
    join public.budget_contracts contract on contract.id=entry.contract_id
   where entry.source_type=p_source_type and entry.source_id=p_source_id and contract.tenant_id=actor.tenant_id
   for update;
  if not found then raise exception 'Lançamento legado não encontrado na prefeitura'; end if;
  total_amount:=legacy.reserved+legacy.realized+legacy.disputed;
  if total_amount<=0 then raise exception 'O lançamento legado não possui valor para conciliar'; end if;
  if (p_source_type='fuelings' and exists(select 1 from public.procurement_fuel_reservations reservation where reservation.fueling_id=p_source_id))
     or (p_source_type='station_operations' and exists(select 1 from public.procurement_station_reservations reservation where reservation.operation_id=p_source_id))
     or (p_source_type='service_orders' and exists(select 1 from public.service_order_quote_procurement_reservations reservation where reservation.service_order_id=p_source_id)) then
    raise exception 'Este lançamento já possui vínculo central; não é necessário conciliar o legado';
  end if;

  select * into existing from public.procurement_legacy_reconciliations
   where tenant_id=actor.tenant_id and source_type=p_source_type and source_id=p_source_id for update;
  if found then
    if existing.instrument_id<>p_instrument or existing.allocation_id<>p_allocation
       or existing.justification<>trim(p_justification) or existing.documents<>p_documents then
      raise exception 'Este lançamento já foi conciliado com outros dados';
    end if;
    return existing.id;
  end if;

  select * into instrument from public.procurement_instruments
   where id=p_instrument and tenant_id=actor.tenant_id for update;
  if not found then raise exception 'Instrumento não encontrado na prefeitura'; end if;
  select a.* into allocation
    from public.instrument_budget_allocations a
    join public.instrument_budget_plans budget_plan on budget_plan.id=a.plan_id and budget_plan.instrument_id=instrument.id
   where a.id=p_allocation for update;
  if not found then raise exception 'Dotação não pertence ao instrumento selecionado'; end if;
  select * into plan from public.instrument_budget_plans where id=allocation.plan_id;
  if plan.fiscal_year<>legacy.legacy_year then raise exception 'Exercício da dotação não coincide com o contrato legado'; end if;
  if allocation.department_id<>legacy.department_id then raise exception 'A dotação deve pertencer à secretaria do lançamento legado'; end if;
  select coalesce(sum(reservation.amount),0) into committed_amount
    from (
      select reservation.committed_amount as amount from public.procurement_fuel_reservations reservation where reservation.allocation_id=allocation.id and reservation.state in ('reserved','realized','disputed')
      union all
      select reservation.committed_amount as amount from public.procurement_station_reservations reservation where reservation.allocation_id=allocation.id and reservation.state in ('reserved','realized','disputed')
      union all
      select reservation.committed_amount as amount from public.service_order_quote_procurement_reservations reservation where reservation.allocation_id=allocation.id and reservation.state='realized'
    ) reservation;
  committed_amount:=committed_amount+(select coalesce(sum(amount_at_reconciliation),0) from public.procurement_legacy_reconciliations where allocation_id=allocation.id);
  if committed_amount+total_amount>allocation.spending_limit then raise exception 'A conciliação ultrapassa o saldo da dotação selecionada'; end if;

  reconciliation_id:=gen_random_uuid();
  insert into public.procurement_legacy_reconciliations(
    id,tenant_id,source_type,source_id,legacy_contract_id,instrument_id,allocation_id,
    reserved_amount,realized_amount,disputed_amount,amount_at_reconciliation,source_status,
    justification,documents,reconciled_by
  ) values (
    reconciliation_id,actor.tenant_id,p_source_type,p_source_id,legacy.contract_id,p_instrument,p_allocation,
    legacy.reserved,legacy.realized,legacy.disputed,total_amount,legacy.source_status,
    trim(p_justification),p_documents,actor.id
  );
  insert into public.procurement_registry_events(tenant_id,process_id,record_id,kind,actor_id,actor_name,reason,before_value,after_value)
    select actor.tenant_id,instrument.process_id,reconciliation_id,'legacy_reconciliation',actor.id,
      coalesce(nullif(trim(actor.full_name),''),'Gestor'),trim(p_justification),null,
      to_jsonb(reconciliation)||jsonb_build_object('legacy_contract_reference',contract.reference,'department_id',legacy.department_id)
      from public.procurement_legacy_reconciliations reconciliation
      join public.budget_contracts contract on contract.id=reconciliation.legacy_contract_id
     where reconciliation.id=reconciliation_id;
  return reconciliation_id;
end;
$$;
revoke all on function sgf_private.procurement_legacy_reconcile(text,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;

create function public.reconcile_procurement_legacy_entry(
  p_source_type text,
  p_source_id uuid,
  p_instrument uuid,
  p_allocation uuid,
  p_justification text,
  p_documents jsonb
)
returns uuid
language sql
security invoker
set search_path=''
as $$
  select sgf_private.procurement_legacy_reconcile(p_source_type,p_source_id,p_instrument,p_allocation,p_justification,p_documents)
$$;
revoke all on function public.reconcile_procurement_legacy_entry(text,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function sgf_private.procurement_legacy_reconcile(text,uuid,uuid,uuid,text,jsonb) to authenticated;
grant execute on function public.reconcile_procurement_legacy_entry(text,uuid,uuid,uuid,text,jsonb) to authenticated;

create function sgf_private.procurement_reconciled_legacy_totals_read(
  p_year integer default null,
  p_instrument uuid default null,
  p_department uuid default null
)
returns table(allocation_id uuid, legacy_reconciled_amount numeric)
language plpgsql
stable
security definer
set search_path=''
as $$
declare actor public.profiles;
begin
  actor:=sgf_private.procurement_fiscal_actor();
  if p_year is not null and (p_year<1900 or p_year>2200) then raise exception 'Exercício inválido'; end if;
  return query
  select reconciliation.allocation_id,sum(reconciliation.amount_at_reconciliation)::numeric
    from public.procurement_legacy_reconciliations reconciliation
    join public.instrument_budget_allocations allocation on allocation.id=reconciliation.allocation_id
    join public.instrument_budget_plans plan on plan.id=allocation.plan_id
    join public.procurement_instruments instrument on instrument.id=plan.instrument_id
   where reconciliation.tenant_id=actor.tenant_id
     and (p_year is null or plan.fiscal_year=p_year)
     and (p_instrument is null or instrument.id=p_instrument)
     and (p_department is null or allocation.department_id=p_department)
     and (actor.role<>'secretario' or allocation.department_id=actor.department_id)
   group by reconciliation.allocation_id;
end;
$$;
revoke all on function sgf_private.procurement_reconciled_legacy_totals_read(integer,uuid,uuid) from public,anon,authenticated;
grant execute on function sgf_private.procurement_reconciled_legacy_totals_read(integer,uuid,uuid) to authenticated;

create function public.get_procurement_reconciled_legacy_totals(
  p_year integer default null,
  p_instrument uuid default null,
  p_department uuid default null
)
returns table(allocation_id uuid, legacy_reconciled_amount numeric)
language sql
stable
security invoker
set search_path=''
as $$
  select * from sgf_private.procurement_reconciled_legacy_totals_read(p_year,p_instrument,p_department)
$$;
revoke all on function public.get_procurement_reconciled_legacy_totals(integer,uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_procurement_reconciled_legacy_totals(integer,uuid,uuid) to authenticated;

-- Once a row is formally reconciled, it leaves the pending queue. The old
-- queue shape remains unchanged so existing report exports keep working.
create or replace function sgf_private.procurement_legacy_reconciliation_read(
  p_year integer default null,
  p_department uuid default null
)
returns table (
  source_type text, source_id uuid, contract_id uuid, contract_reference text, fiscal_year integer,
  department_id uuid, department_name text, partner_id uuid, vehicle_id uuid,
  reserved_amount numeric, realized_amount numeric, disputed_amount numeric, consumed_amount numeric,
  source_status text, reconciliation_status text
)
language plpgsql stable security definer set search_path=''
as $$
declare actor public.profiles;
begin
  actor:=sgf_private.procurement_fiscal_actor();
  if p_year is not null and (p_year<1900 or p_year>2200) then raise exception 'Exercício inválido'; end if;
  return query
  select entry.source_type,entry.source_id,entry.contract_id,contract.reference,contract.fiscal_year,
    entry.department_id,department.name,entry.partner_id,entry.vehicle_id,entry.reserved,entry.realized,entry.disputed,
    entry.reserved+entry.realized+entry.disputed,entry.source_status,'pending'::text
    from public.budget_entries entry
    join public.budget_contracts contract on contract.id=entry.contract_id
    left join public.departments department on department.id=entry.department_id
   where contract.tenant_id=actor.tenant_id
     and (p_year is null or contract.fiscal_year=p_year)
     and (p_department is null or entry.department_id=p_department)
     and (actor.role<>'secretario' or entry.department_id=actor.department_id)
     and not exists(select 1 from public.procurement_legacy_reconciliations reconciliation where reconciliation.tenant_id=actor.tenant_id and reconciliation.source_type=entry.source_type and reconciliation.source_id=entry.source_id)
     and not (
       (entry.source_type='fuelings' and exists(select 1 from public.procurement_fuel_reservations reservation where reservation.fueling_id=entry.source_id))
       or (entry.source_type='station_operations' and exists(select 1 from public.procurement_station_reservations reservation where reservation.operation_id=entry.source_id))
       or (entry.source_type='service_orders' and exists(select 1 from public.service_order_quote_procurement_reservations reservation where reservation.service_order_id=entry.source_id))
     )
   order by contract.fiscal_year desc,department.name,entry.source_type,entry.source_id;
end;
$$;
revoke all on function sgf_private.procurement_legacy_reconciliation_read(integer,uuid) from public,anon,authenticated;
grant execute on function sgf_private.procurement_legacy_reconciliation_read(integer,uuid) to authenticated;

alter function sgf_private.resource_modules(text,boolean)
  rename to resource_modules_before_procurement_legacy_reconciliation;
create function sgf_private.resource_modules(p_resource text,p_write boolean)
returns text[] language sql immutable set search_path='' as $$
  select case
    when p_resource='reconcile_procurement_legacy_entry' then array['procurement','budgets','reports']::text[]
    when p_resource='get_procurement_reconciled_legacy_totals' then array['budgets','reports']::text[]
    else sgf_private.resource_modules_before_procurement_legacy_reconciliation(p_resource,p_write)
  end
$$;
revoke all on function sgf_private.resource_modules(text,boolean) from public,anon,authenticated;

comment on table public.procurement_legacy_reconciliations is
  'Vínculo imutável e justificado entre uma despesa do ledger legado e uma dotação do registro central; não cria reserva operacional nem altera o lançamento original.';
comment on function public.reconcile_procurement_legacy_entry(text,uuid,uuid,uuid,text,jsonb) is
  'Concilia explicitamente um lançamento legado com instrumento e dotação, exigindo justificativa, documento HTTPS e auditoria do processo.';
