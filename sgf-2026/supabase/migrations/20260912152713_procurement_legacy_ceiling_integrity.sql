-- Reconciled legacy expenses consume the same allocation ceiling as every
-- central reservation. Keep the legacy amount visible in its own report while
-- enforcing one authoritative balance in database writes.

create function sgf_private.procurement_allocation_committed(p_allocation uuid)
returns numeric
language sql
stable
security definer
set search_path=''
as $$
  select
    coalesce((select sum(r.committed_amount) from public.procurement_fuel_reservations r where r.allocation_id=p_allocation),0)
    + coalesce((select sum(r.committed_amount) from public.procurement_station_reservations r where r.allocation_id=p_allocation),0)
    + coalesce((select sum(r.committed_amount) from public.service_order_quote_procurement_reservations r where r.allocation_id=p_allocation),0)
    + coalesce((select sum(r.amount_at_reconciliation) from public.procurement_legacy_reconciliations r where r.allocation_id=p_allocation),0)
$$;
revoke all on function sgf_private.procurement_allocation_committed(uuid) from public,anon,authenticated;

create function sgf_private.procurement_allocation_ceiling_guard()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='UPDATE' and exists(select 1 from public.procurement_legacy_reconciliations r where r.allocation_id=old.id)
    and (to_jsonb(new)-'spending_limit'-'updated_at') is distinct from (to_jsonb(old)-'spending_limit'-'updated_at') then
    raise exception 'Dotação com legado conciliado não pode trocar sua identificação';
  end if;
  if tg_op='DELETE' and sgf_private.procurement_allocation_committed(old.id)>0 then
    raise exception 'Dotação possui consumo financeiro e não pode ser excluída';
  end if;
  if tg_op='UPDATE' and new.spending_limit<sgf_private.procurement_allocation_committed(old.id) then
    raise exception 'Teto inferior ao valor comprometido; confira o consumo financeiro total da dotação';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function sgf_private.procurement_allocation_ceiling_guard() from public,anon,authenticated;
create trigger a_procurement_allocation_ceiling_guard
before update or delete on public.instrument_budget_allocations
for each row execute function sgf_private.procurement_allocation_ceiling_guard();

create function sgf_private.procurement_reservation_combined_ceiling_guard()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare current_amount numeric; previous_amount numeric:=0; limit_amount numeric;
begin
  -- Serialize with allocation revisions and every reservation writer.
  perform 1 from public.instrument_budget_allocations where id=new.allocation_id for update;
  if tg_op='UPDATE' and old.allocation_id=new.allocation_id then previous_amount:=old.committed_amount; end if;
  current_amount:=sgf_private.procurement_allocation_committed(new.allocation_id);
  select spending_limit into limit_amount from public.instrument_budget_allocations where id=new.allocation_id;
  if limit_amount is null then raise exception 'Dotação não encontrada'; end if;
  if current_amount-previous_amount+new.committed_amount>limit_amount then
    raise exception 'Operação ultrapassa o consumo financeiro total da dotação';
  end if;
  return new;
end;
$$;
revoke all on function sgf_private.procurement_reservation_combined_ceiling_guard() from public,anon,authenticated;
create trigger a_procurement_fuel_combined_ceiling_guard before insert or update on public.procurement_fuel_reservations for each row execute function sgf_private.procurement_reservation_combined_ceiling_guard();
create trigger a_procurement_station_combined_ceiling_guard before insert or update on public.procurement_station_reservations for each row execute function sgf_private.procurement_reservation_combined_ceiling_guard();
create trigger a_procurement_workshop_combined_ceiling_guard before insert or update on public.service_order_quote_procurement_reservations for each row execute function sgf_private.procurement_reservation_combined_ceiling_guard();

create function sgf_private.procurement_legacy_reconciliation_integrity_guard()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare legacy public.budget_entries; expected_category text; matching_categories integer; limit_amount numeric;
begin
  -- Serialize with allocation revisions and every reservation writer.
  perform 1 from public.instrument_budget_allocations where id=new.allocation_id for update;
  select * into legacy from public.budget_entries
   where source_type=new.source_type and source_id=new.source_id for update;
  if not found or legacy.contract_id<>new.legacy_contract_id or legacy.department_id<>(select department_id from public.instrument_budget_allocations where id=new.allocation_id) then
    raise exception 'Lançamento legado ou secretaria divergente';
  end if;
  if legacy.reserved<>0 or ((legacy.realized>0)::integer+(legacy.disputed>0)::integer)<>1 then
    raise exception 'Concilie somente despesa legada final, realizada ou contestada; reservas abertas devem ser encerradas primeiro';
  end if;
  if legacy.realized+legacy.disputed<>new.amount_at_reconciliation then raise exception 'Valor conciliado diverge do lançamento legado'; end if;

  if new.source_type='fuelings' then
    expected_category:='fuel';
  elsif new.source_type='station_operations' then
    select case item_kind when 'arla' then 'arla' when 'lubrificante' then 'lubricant' end into expected_category
      from public.station_operations where id=new.source_id and tenant_id=new.tenant_id and station_id=legacy.partner_id;
    if expected_category is null then raise exception 'Serviço legado de posto não possui categoria comprovável para conciliação automática'; end if;
  else
    if exists(
      select 1 from public.service_order_quotes quote
      join public.service_order_quote_items quote_item on quote_item.quote_id=quote.id
      where quote.service_order_id=new.source_id and quote.status='aprovado'
        and quote.repair_shop_id=legacy.partner_id and quote_item.category is null
    ) then raise exception 'OS legada possui item sem categoria comprovável'; end if;
    select count(distinct quote_item.category),min(quote_item.category)
      into matching_categories,expected_category
      from public.service_order_quotes quote
      join public.service_order_quote_items quote_item on quote_item.quote_id=quote.id
     where quote.service_order_id=new.source_id and quote.status='aprovado' and quote.repair_shop_id=legacy.partner_id and quote_item.category is not null;
    if matching_categories<>1 then raise exception 'OS legada sem categoria única comprovável; conciliação por uma única dotação bloqueada'; end if;
  end if;
  if expected_category is distinct from (select category from public.instrument_budget_allocations where id=new.allocation_id) then
    raise exception 'Categoria da dotação diverge da despesa legada';
  end if;
  if not exists(
    select 1 from public.procurement_items item
    where item.instrument_id=new.instrument_id and item.partner_id=legacy.partner_id
      and item.partner_kind=case when new.source_type='service_orders' then 'oficina' else 'posto' end
      and item.category=expected_category
  ) then raise exception 'Instrumento não possui item compatível com fornecedor e categoria da despesa legada'; end if;

  select spending_limit into limit_amount from public.instrument_budget_allocations where id=new.allocation_id;
  if sgf_private.procurement_allocation_committed(new.allocation_id)+new.amount_at_reconciliation>limit_amount then
    raise exception 'A conciliação ultrapassa o saldo financeiro total da dotação';
  end if;
  return new;
end;
$$;
revoke all on function sgf_private.procurement_legacy_reconciliation_integrity_guard() from public,anon,authenticated;
create trigger a_procurement_legacy_reconciliation_integrity_guard
before insert on public.procurement_legacy_reconciliations
for each row execute function sgf_private.procurement_legacy_reconciliation_integrity_guard();

create function sgf_private.procurement_reconciled_legacy_freeze_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (tg_op='DELETE' or (new.source_type,new.source_id,new.contract_id,new.department_id,new.partner_id,new.reserved,new.realized,new.disputed) is distinct from (old.source_type,old.source_id,old.contract_id,old.department_id,old.partner_id,old.reserved,old.realized,old.disputed))
    and exists(select 1 from public.procurement_legacy_reconciliations r where r.source_type=old.source_type and r.source_id=old.source_id) then
    raise exception 'Lançamento legado conciliado é imutável';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function sgf_private.procurement_reconciled_legacy_freeze_guard() from public,anon,authenticated;
create trigger a_procurement_reconciled_legacy_freeze_guard
before update or delete on public.budget_entries
for each row execute function sgf_private.procurement_reconciled_legacy_freeze_guard();

comment on function sgf_private.procurement_allocation_committed(uuid) is
  'Consumo único do teto: reservas centrais de combustível, posto e oficina mais legado formalmente conciliado.';
