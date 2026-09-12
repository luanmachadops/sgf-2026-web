-- 5D2: explicit, auditable mapping between classified workshop quote lines,
-- contract items and the department appropriation. This stage only validates
-- the mapping; the following stage will reserve and execute the balance.
create table public.service_order_quote_item_procurement_links (
  quote_item_id uuid primary key references public.service_order_quote_items(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id),
  procurement_item_id uuid not null references public.procurement_items(id),
  allocation_id uuid not null references public.instrument_budget_allocations(id),
  procurement_price_id uuid not null references public.procurement_item_prices(id),
  contract_unit_price numeric(16,6) not null check(contract_unit_price >= 0 and contract_unit_price <> 'NaN'::numeric),
  linked_by uuid not null references public.profiles(id),
  linked_at timestamptz not null default now()
);
create index service_order_quote_item_procurement_links_item
  on public.service_order_quote_item_procurement_links(procurement_item_id, allocation_id);
alter table public.service_order_quote_item_procurement_links enable row level security;
revoke all on public.service_order_quote_item_procurement_links from public, anon, authenticated;

create function sgf_private.quote_procurement_actor() returns public.profiles
language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles;
begin
  actor := sgf_private.procurement_actor();
  if not coalesce('budgets'=any(actor.allowed_modules), false)
     or not coalesce('maintenances'=any(actor.allowed_modules), false) then
    raise exception 'Acesso a licitações, limites e manutenções obrigatório' using errcode='42501';
  end if;
  return actor;
end $$;
revoke all on function sgf_private.quote_procurement_actor() from public, anon, authenticated;

create function sgf_private.quote_procurement_candidates(p_quote_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles; quote_row public.service_order_quotes; result jsonb;
begin
  actor := sgf_private.quote_procurement_actor();
  if p_quote_id is null then raise exception 'Orçamento inválido'; end if;
  select q.* into quote_row
    from public.service_order_quotes q
    join public.service_orders so on so.id=q.service_order_id
   where q.id=p_quote_id and q.tenant_id=actor.tenant_id and so.tenant_id=actor.tenant_id;
  if not found then raise exception 'Orçamento não encontrado'; end if;

  select coalesce(jsonb_agg(to_jsonb(line) order by line.quote_item_id), '[]'::jsonb) into result
  from (
    select qi.id as quote_item_id, qi.description, qi.kind, qi.category, qi.unit, qi.qty, qi.unit_price,
      (select jsonb_build_object(
        'procurement_item_id', link.procurement_item_id,
        'allocation_id', link.allocation_id,
        'procurement_price_id', link.procurement_price_id,
        'contract_unit_price', link.contract_unit_price
      ) from public.service_order_quote_item_procurement_links link where link.quote_item_id=qi.id) as linked,
      coalesce((select jsonb_agg(jsonb_build_object(
        'item_id', item.id, 'item_reference', item.reference,
        'item_description', item.description, 'instrument_reference', instrument.reference,
        'allocation_id', allocation.id, 'department_name', department.name,
        'appropriation', allocation.appropriation, 'funding_source', allocation.funding_source,
        'contract_unit_price', price.unit_price
      ) order by instrument.reference, item.reference, allocation.appropriation, allocation.id)
      from public.service_orders so
      join public.vehicles vehicle on vehicle.id=so.vehicle_id and vehicle.tenant_id=quote_row.tenant_id
      join public.procurement_items item on item.partner_kind='oficina' and item.partner_id=quote_row.repair_shop_id
      join public.procurement_instruments instrument on instrument.id=item.instrument_id and instrument.tenant_id=quote_row.tenant_id and instrument.kind='contract'
      join lateral (
        select candidate_price.* from public.procurement_item_prices candidate_price
         where candidate_price.item_id=item.id and candidate_price.effective_on<=current_date
         order by candidate_price.effective_on desc, candidate_price.revision desc limit 1
      ) price on price.pricing_mode='unit' and price.unit_price is not null and price.unit_price>=qi.unit_price
      join public.instrument_budget_plans plan on plan.instrument_id=instrument.id and plan.fiscal_year=extract(year from current_date)
      join public.instrument_budget_allocations allocation on allocation.plan_id=plan.id and allocation.department_id=vehicle.department_id and allocation.category=qi.category
      join public.departments department on department.id=allocation.department_id
      where item.category=qi.category and item.unit=qi.unit
        and current_date between instrument.starts_on and instrument.ends_on
      ), '[]'::jsonb) as candidates
    from public.service_order_quote_items qi
    where qi.quote_id=quote_row.id
  ) line;
  return result;
end $$;
revoke all on function sgf_private.quote_procurement_candidates(uuid) from public, anon, authenticated;
grant execute on function sgf_private.quote_procurement_candidates(uuid) to authenticated;

create function sgf_private.set_quote_procurement_links(p_quote_id uuid, p_links jsonb, p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare
  actor public.profiles; quote_row public.service_order_quotes; order_row public.service_orders;
  link_row jsonb; quote_item public.service_order_quote_items; item public.procurement_items;
  instrument public.procurement_instruments; allocation public.instrument_budget_allocations;
  plan public.instrument_budget_plans; price public.procurement_item_prices; before_value jsonb;
  expected_count integer; supplied_count integer; unique_count integer; day date := current_date;
begin
  actor := sgf_private.quote_procurement_actor();
  if p_quote_id is null or jsonb_typeof(p_links) is distinct from 'array' then raise exception 'Vínculos inválidos'; end if;
  if coalesce(length(trim(p_reason)),0) not between 3 and 1000 then raise exception 'Informe a justificativa do vínculo'; end if;
  select q.* into quote_row from public.service_order_quotes q
   where q.id=p_quote_id and q.tenant_id=actor.tenant_id for update;
  if not found then raise exception 'Orçamento não encontrado'; end if;
  select so.* into order_row from public.service_orders so
   where so.id=quote_row.service_order_id and so.tenant_id=actor.tenant_id for update;
  if not found then raise exception 'Orçamento não encontrado'; end if;
  if quote_row.status<>'enviado' or order_row.operational_status<>'awaiting_quote_approval' or order_row.financial_status<>'not_started' then
    raise exception 'O orçamento não está disponível para vinculação';
  end if;
  select count(*) into expected_count from public.service_order_quote_items where quote_id=quote_row.id;
  select count(*), count(distinct (value->>'quote_item_id')::uuid) into supplied_count, unique_count
    from jsonb_array_elements(p_links);
  if supplied_count<>expected_count or unique_count<>expected_count or expected_count=0 then raise exception 'Vincule todos os itens do orçamento uma única vez'; end if;
  if exists(select 1 from jsonb_array_elements(p_links) value where jsonb_typeof(value) is distinct from 'object' or exists(select 1 from jsonb_object_keys(value) key where key not in ('quote_item_id','procurement_item_id','allocation_id'))) then
    raise exception 'Campo de vínculo não permitido';
  end if;
  perform 1 from public.tenants where id=actor.tenant_id for update;

  for link_row in select value from jsonb_array_elements(p_links) loop
    select * into quote_item from public.service_order_quote_items
     where id=(link_row->>'quote_item_id')::uuid and quote_id=quote_row.id for update;
    if not found or quote_item.category is null or quote_item.unit is null then raise exception 'Cada item precisa de categoria e unidade explícitas'; end if;
    select to_jsonb(link) into before_value from public.service_order_quote_item_procurement_links link where link.quote_item_id=quote_item.id;
    select selected_item.* into item from public.procurement_items selected_item
     join public.procurement_instruments selected_instrument on selected_instrument.id=selected_item.instrument_id
     where selected_item.id=(link_row->>'procurement_item_id')::uuid
       and selected_instrument.tenant_id=actor.tenant_id
     for update of selected_item;
    if not found then raise exception 'Item contratual não encontrado'; end if;
    select * into instrument from public.procurement_instruments where id=item.instrument_id;
    if instrument.kind<>'contract' or item.partner_kind<>'oficina' or item.partner_id<>quote_row.repair_shop_id
       or item.category<>quote_item.category or item.unit<>quote_item.unit or day not between instrument.starts_on and instrument.ends_on then
      raise exception 'Item contratual incompatível com oficina, categoria, unidade ou vigência';
    end if;
    select candidate_price.* into price from public.procurement_item_prices candidate_price
      where candidate_price.item_id=item.id and candidate_price.effective_on<=day
      order by candidate_price.effective_on desc, candidate_price.revision desc limit 1;
    if not found or price.pricing_mode<>'unit' or price.unit_price is null or quote_item.unit_price>price.unit_price then
      raise exception 'Preço do orçamento excede ou não possui preço unitário contratual vigente';
    end if;
    select selected_allocation.* into allocation from public.instrument_budget_allocations selected_allocation
      join public.instrument_budget_plans selected_plan on selected_plan.id=selected_allocation.plan_id
      join public.vehicles vehicle on vehicle.id=order_row.vehicle_id and vehicle.tenant_id=actor.tenant_id
      where selected_allocation.id=(link_row->>'allocation_id')::uuid and selected_plan.instrument_id=instrument.id
        and selected_plan.fiscal_year=extract(year from day) and selected_allocation.department_id=vehicle.department_id
        and selected_allocation.category=quote_item.category
      for update of selected_allocation;
    if not found then raise exception 'Dotação incompatível com contrato, secretaria, categoria ou exercício'; end if;
    select * into plan from public.instrument_budget_plans where id=allocation.plan_id;
    insert into public.service_order_quote_item_procurement_links(
      quote_item_id,tenant_id,procurement_item_id,allocation_id,procurement_price_id,contract_unit_price,linked_by
    ) values (
      quote_item.id,actor.tenant_id,item.id,allocation.id,price.id,price.unit_price,actor.id
    ) on conflict(quote_item_id) do update set procurement_item_id=excluded.procurement_item_id,
      allocation_id=excluded.allocation_id,procurement_price_id=excluded.procurement_price_id,
      contract_unit_price=excluded.contract_unit_price,linked_by=excluded.linked_by,linked_at=now();
    insert into public.procurement_registry_events(tenant_id,process_id,record_id,kind,actor_id,actor_name,reason,before_value,after_value)
    values(actor.tenant_id,instrument.process_id,quote_item.id,'quote_link',actor.id,coalesce(nullif(trim(actor.full_name),''),'Gestor'),trim(p_reason),before_value,
      (select to_jsonb(link) from public.service_order_quote_item_procurement_links link where link.quote_item_id=quote_item.id));
  end loop;
end $$;
revoke all on function sgf_private.set_quote_procurement_links(uuid,jsonb,text) from public, anon, authenticated;
grant execute on function sgf_private.set_quote_procurement_links(uuid,jsonb,text) to authenticated;

create function public.get_quote_procurement_candidates(p_quote_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$select sgf_private.quote_procurement_candidates(p_quote_id)$$;
create function public.set_quote_procurement_links(p_quote_id uuid,p_links jsonb,p_reason text) returns void
language sql security invoker set search_path='' as $$select sgf_private.set_quote_procurement_links(p_quote_id,p_links,p_reason)$$;
revoke all on function public.get_quote_procurement_candidates(uuid), public.set_quote_procurement_links(uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.get_quote_procurement_candidates(uuid), public.set_quote_procurement_links(uuid,jsonb,text) to authenticated;

alter function public.manager_review_service_order_quote(uuid,boolean,text) rename to manager_review_service_order_quote_before_procurement_links;
create function public.manager_review_service_order_quote(p_quote_id uuid,p_approved boolean,p_note text default null) returns void
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; quote_row public.service_order_quotes; quote_item public.service_order_quote_items;
  link public.service_order_quote_item_procurement_links; item public.procurement_items; instrument public.procurement_instruments;
  allocation public.instrument_budget_allocations; price public.procurement_item_prices; vehicle public.vehicles;
begin
  if not p_approved then
    perform public.manager_review_service_order_quote_before_procurement_links(p_quote_id,p_approved,p_note);
    return;
  end if;
  actor := sgf_private.quote_procurement_actor();
  select * into quote_row from public.service_order_quotes where id=p_quote_id and tenant_id=actor.tenant_id for update;
  if not found then raise exception 'Orçamento não encontrado'; end if;
  if quote_row.status<>'enviado' then raise exception 'Este orçamento já foi analisado'; end if;
  select vehicle_row.* into vehicle from public.vehicles vehicle_row join public.service_orders so on so.vehicle_id=vehicle_row.id
    where so.id=quote_row.service_order_id and vehicle_row.tenant_id=actor.tenant_id;
  if not found then raise exception 'Veículo da ordem de serviço não encontrado'; end if;
  for quote_item in select * from public.service_order_quote_items where quote_id=quote_row.id loop
    if quote_item.category is null or quote_item.unit is null then raise exception 'Solicite nova versão: item sem categoria ou unidade'; end if;
    select * into link from public.service_order_quote_item_procurement_links where quote_item_id=quote_item.id;
    if not found then raise exception 'Vincule todos os itens do orçamento à licitação antes de aprovar'; end if;
    select selected_item.* into item from public.procurement_items selected_item where selected_item.id=link.procurement_item_id;
    select * into instrument from public.procurement_instruments where id=item.instrument_id;
    select * into allocation from public.instrument_budget_allocations where id=link.allocation_id;
    select candidate_price.* into price from public.procurement_item_prices candidate_price where candidate_price.item_id=item.id and candidate_price.effective_on<=current_date order by candidate_price.effective_on desc,candidate_price.revision desc limit 1;
    if item.id is null or instrument.tenant_id<>actor.tenant_id or instrument.kind<>'contract' or item.partner_kind<>'oficina'
       or item.partner_id<>quote_row.repair_shop_id or item.category<>quote_item.category or item.unit<>quote_item.unit
       or current_date not between instrument.starts_on and instrument.ends_on then raise exception 'Vínculo contratual deixou de ser compatível'; end if;
    if allocation.id is null or allocation.department_id<>vehicle.department_id or allocation.category<>quote_item.category
       or not exists(select 1 from public.instrument_budget_plans plan where plan.id=allocation.plan_id and plan.instrument_id=instrument.id and plan.fiscal_year=extract(year from current_date)) then
      raise exception 'Vínculo orçamentário deixou de ser compatível';
    end if;
    if price.id is null or price.pricing_mode<>'unit' or price.unit_price is null or quote_item.unit_price>price.unit_price then
      raise exception 'Preço do orçamento excede ou não possui preço contratual vigente';
    end if;
  end loop;
  perform public.manager_review_service_order_quote_before_procurement_links(p_quote_id,p_approved,p_note);
end $$;
revoke all on function public.manager_review_service_order_quote(uuid,boolean,text), public.manager_review_service_order_quote_before_procurement_links(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.manager_review_service_order_quote(uuid,boolean,text) to authenticated;

alter function sgf_private.resource_modules(text,boolean) rename to resource_modules_before_workshop_quote_procurement_links;
create function sgf_private.resource_modules(p_resource text,p_write boolean) returns text[]
language sql immutable set search_path='' as $$
select case when p_resource in ('get_quote_procurement_candidates','set_quote_procurement_links','manager_review_service_order_quote')
  then array['maintenances','procurement','budgets']
  else sgf_private.resource_modules_before_workshop_quote_procurement_links(p_resource,p_write) end
$$;
revoke all on function sgf_private.resource_modules(text,boolean) from public, anon, authenticated;
notify pgrst,'reload schema';
