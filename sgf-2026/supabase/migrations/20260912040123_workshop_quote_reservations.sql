-- 5D3: reservation ledger for approved workshop quotes. The ledger is private
-- and is changed only by the service-order approval, cancellation and receipt flows.
create table public.service_order_quote_procurement_reservations (
  quote_item_id uuid primary key references public.service_order_quote_items(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id),
  service_order_id uuid not null references public.service_orders(id),
  procurement_item_id uuid not null references public.procurement_items(id),
  allocation_id uuid not null references public.instrument_budget_allocations(id),
  procurement_price_id uuid not null references public.procurement_item_prices(id),
  reserved_quantity numeric(16,2) not null check(reserved_quantity > 0 and reserved_quantity <> 'NaN'::numeric),
  reserved_unit_price numeric(16,6) not null check(reserved_unit_price >= 0 and reserved_unit_price <> 'NaN'::numeric),
  reserved_amount numeric(14,2) not null check(reserved_amount >= 0 and reserved_amount <> 'NaN'::numeric),
  committed_quantity numeric(16,2) not null check(committed_quantity >= 0 and committed_quantity <> 'NaN'::numeric),
  committed_amount numeric(14,2) not null check(committed_amount >= 0 and committed_amount <> 'NaN'::numeric),
  state text not null check(state in ('reserved','released','realized')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index service_order_quote_procurement_reservations_order on public.service_order_quote_procurement_reservations(service_order_id, state);
create index service_order_quote_procurement_reservations_item on public.service_order_quote_procurement_reservations(procurement_item_id, allocation_id);
alter table public.service_order_quote_procurement_reservations enable row level security;
revoke all on public.service_order_quote_procurement_reservations from public, anon, authenticated;

create function sgf_private.reserve_workshop_quote(p_quote_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare
  actor public.profiles; quote_row public.service_order_quotes; order_row public.service_orders;
  reservation_line record; item public.procurement_items; instrument public.procurement_instruments;
  allocation public.instrument_budget_allocations; price public.procurement_item_prices; process_row record;
  total_quantity numeric; total_amount numeric; day date := current_date;
begin
  actor := sgf_private.quote_procurement_actor();
  select q.* into quote_row from public.service_order_quotes q
   where q.id=p_quote_id and q.tenant_id=actor.tenant_id for update;
  if not found then raise exception 'Orçamento não encontrado'; end if;
  if quote_row.status<>'enviado' then raise exception 'Este orçamento já foi analisado'; end if;
  select so.* into order_row from public.service_orders so
   where so.id=quote_row.service_order_id and so.tenant_id=actor.tenant_id for update;
  if not found or order_row.operational_status<>'awaiting_quote_approval' or order_row.financial_status<>'not_started' then
    raise exception 'A ordem de serviço não está aguardando aprovação';
  end if;
  perform 1 from public.tenants where id=actor.tenant_id for update;
  for process_row in
    select distinct procurement_instrument.process_id
      from public.service_order_quote_item_procurement_links link
      join public.service_order_quote_items quote_item on quote_item.id=link.quote_item_id
      join public.procurement_items procurement_item on procurement_item.id=link.procurement_item_id
      join public.procurement_instruments procurement_instrument on procurement_instrument.id=procurement_item.instrument_id
     where quote_item.quote_id=quote_row.id
     order by procurement_instrument.process_id
  loop
    perform 1 from public.procurement_processes where id=process_row.process_id for update;
  end loop;
  if exists(select 1 from public.service_order_quote_items quote_item where quote_item.quote_id=quote_row.id and (quote_item.category is null or quote_item.unit is null)) then
    raise exception 'Solicite nova versão: item sem categoria ou unidade';
  end if;
  if (select count(*) from public.service_order_quote_items where quote_id=quote_row.id)
     <> (select count(*) from public.service_order_quote_item_procurement_links link join public.service_order_quote_items quote_item on quote_item.id=link.quote_item_id where quote_item.quote_id=quote_row.id) then
    raise exception 'Vincule todos os itens do orçamento à licitação antes de aprovar';
  end if;
  if exists(select 1 from public.service_order_quote_procurement_reservations reservation join public.service_order_quote_items quote_item on quote_item.id=reservation.quote_item_id where quote_item.quote_id=quote_row.id) then
    raise exception 'Este orçamento já possui reserva contratual';
  end if;

  for reservation_line in
    with raw as (
      select quote_item.id quote_item_id, quote_item.qty, quote_item.unit_price,
        link.procurement_item_id, link.allocation_id, link.procurement_price_id,
        trunc(quote_item.qty * quote_item.unit_price, 2) floor_amount,
        quote_item.qty * quote_item.unit_price - trunc(quote_item.qty * quote_item.unit_price, 2) remainder
      from public.service_order_quote_items quote_item
      join public.service_order_quote_item_procurement_links link on link.quote_item_id=quote_item.id
      where quote_item.quote_id=quote_row.id
    ), ranked as (
      select raw.*, row_number() over(order by remainder desc, quote_item_id) remainder_rank,
        coalesce(sum(floor_amount) over(),0) floor_total
      from raw
    )
    select ranked.*, ranked.floor_amount + case when remainder_rank <= (round(quote_row.total * 100)::integer - round(floor_total * 100)::integer) then .01 else 0 end amount
      from ranked
     order by quote_item_id
  loop
    select selected_item.* into item from public.procurement_items selected_item
     where selected_item.id=reservation_line.procurement_item_id for update;
    select * into instrument from public.procurement_instruments where id=item.instrument_id;
    select * into allocation from public.instrument_budget_allocations where id=reservation_line.allocation_id for update;
    select candidate_price.* into price from public.procurement_item_prices candidate_price
      where candidate_price.item_id=item.id and candidate_price.effective_on<=day
      order by candidate_price.effective_on desc, candidate_price.revision desc limit 1;
    if item.id is null or instrument.tenant_id<>actor.tenant_id or instrument.kind<>'contract' or item.partner_kind<>'oficina'
       or item.partner_id<>quote_row.repair_shop_id or current_date not between instrument.starts_on and instrument.ends_on then
      raise exception 'Vínculo contratual deixou de ser compatível';
    end if;
    if not exists(select 1 from public.service_order_quote_items quote_item where quote_item.id=reservation_line.quote_item_id
       and quote_item.category=item.category and quote_item.unit=item.unit) then raise exception 'Item contratual incompatível com categoria ou unidade'; end if;
    if price.id is null or price.pricing_mode<>'unit' or price.unit_price is null or reservation_line.unit_price>price.unit_price then
      raise exception 'Preço do orçamento excede ou não possui preço contratual vigente';
    end if;
    if allocation.id is null or not exists(
      select 1 from public.instrument_budget_plans plan join public.vehicles vehicle on vehicle.id=order_row.vehicle_id and vehicle.tenant_id=actor.tenant_id
       where plan.id=allocation.plan_id and plan.instrument_id=instrument.id and plan.fiscal_year=extract(year from day)
         and allocation.department_id=vehicle.department_id and allocation.category=item.category
    ) then raise exception 'Vínculo orçamentário deixou de ser compatível'; end if;
    select coalesce(sum(committed_quantity),0) into total_quantity from public.service_order_quote_procurement_reservations where procurement_item_id=item.id;
    if total_quantity + reservation_line.qty > item.quantity then raise exception 'Quantidade contratual insuficiente para reservar o orçamento'; end if;
    select coalesce(sum(committed_amount),0) + coalesce((select sum(committed_amount) from public.procurement_station_reservations where allocation_id=allocation.id),0)
      into total_amount from public.service_order_quote_procurement_reservations where allocation_id=allocation.id;
    if total_amount + reservation_line.amount > allocation.spending_limit then raise exception 'Teto da dotação insuficiente para reservar o orçamento'; end if;
    insert into public.service_order_quote_procurement_reservations(
      quote_item_id,tenant_id,service_order_id,procurement_item_id,allocation_id,procurement_price_id,
      reserved_quantity,reserved_unit_price,reserved_amount,committed_quantity,committed_amount,state,created_by
    ) values (
      reservation_line.quote_item_id,actor.tenant_id,order_row.id,item.id,allocation.id,price.id,
      reservation_line.qty,reservation_line.unit_price,reservation_line.amount,reservation_line.qty,reservation_line.amount,'reserved',actor.id
    );
    insert into public.procurement_registry_events(tenant_id,process_id,record_id,kind,actor_id,actor_name,reason,before_value,after_value)
    values(actor.tenant_id,instrument.process_id,reservation_line.quote_item_id,'workshop_reservation',actor.id,coalesce(nullif(trim(actor.full_name),''),'Gestor'),'Reserva na aprovação do orçamento',null,
      (select to_jsonb(reservation) from public.service_order_quote_procurement_reservations reservation where reservation.quote_item_id=reservation_line.quote_item_id));
  end loop;
end $$;
revoke all on function sgf_private.reserve_workshop_quote(uuid) from public, anon, authenticated;

create function sgf_private.transition_workshop_order_reservations(p_order_id uuid,p_state text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; order_row public.service_orders; reservation public.service_order_quote_procurement_reservations; process_id uuid; before_value jsonb;
begin
  actor := sgf_private.quote_procurement_actor();
  if p_state not in ('released','realized') or coalesce(length(trim(p_reason)),0) not between 3 and 1000 then raise exception 'Transição de reserva inválida'; end if;
  select * into order_row from public.service_orders where id=p_order_id and tenant_id=actor.tenant_id for update;
  if not found then raise exception 'Ordem de serviço não encontrada'; end if;
  perform 1 from public.tenants where id=actor.tenant_id for update;
  for reservation in select * from public.service_order_quote_procurement_reservations where service_order_id=order_row.id and state='reserved' for update loop
    select procurement_instrument.process_id into process_id from public.procurement_items procurement_item join public.procurement_instruments procurement_instrument on procurement_instrument.id=procurement_item.instrument_id where procurement_item.id=reservation.procurement_item_id;
    perform 1 from public.procurement_processes where id=process_id for update;
    before_value:=to_jsonb(reservation);
    update public.service_order_quote_procurement_reservations set state=p_state,
      committed_quantity=case when p_state='released' then 0 else reserved_quantity end,
      committed_amount=case when p_state='released' then 0 else reserved_amount end,updated_at=now()
     where quote_item_id=reservation.quote_item_id;
    insert into public.procurement_registry_events(tenant_id,process_id,record_id,kind,actor_id,actor_name,reason,before_value,after_value)
    values(actor.tenant_id,process_id,reservation.quote_item_id,'workshop_reservation',actor.id,coalesce(nullif(trim(actor.full_name),''),'Gestor'),trim(p_reason),before_value,
      (select to_jsonb(current_reservation) from public.service_order_quote_procurement_reservations current_reservation where current_reservation.quote_item_id=reservation.quote_item_id));
  end loop;
end $$;
revoke all on function sgf_private.transition_workshop_order_reservations(uuid,text,text) from public, anon, authenticated;

create function sgf_private.workshop_reservation_quote_item_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.service_order_quote_procurement_reservations where quote_item_id=old.id) then
    if tg_op='DELETE' or (new.quote_id,new.kind,new.description,new.qty,new.unit_price,new.unit,new.category) is distinct from (old.quote_id,old.kind,old.description,old.qty,old.unit_price,old.unit,old.category) then
      raise exception 'Item de orçamento com reserva não pode ser alterado ou removido';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function sgf_private.workshop_reservation_quote_item_guard() from public, anon, authenticated;
create trigger workshop_reservation_quote_item_guard before update or delete on public.service_order_quote_items for each row execute function sgf_private.workshop_reservation_quote_item_guard();

create function sgf_private.workshop_reservation_link_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.service_order_quote_procurement_reservations where quote_item_id=old.quote_item_id) then
    raise exception 'Vínculo contratual com reserva não pode ser alterado ou removido';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function sgf_private.workshop_reservation_link_guard() from public, anon, authenticated;
create trigger workshop_reservation_link_guard before update or delete on public.service_order_quote_item_procurement_links for each row execute function sgf_private.workshop_reservation_link_guard();

create function sgf_private.workshop_reservation_quote_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='aprovado' and old.status<>'aprovado' and exists(
    select 1 from public.service_order_quote_items quote_item
     where quote_item.quote_id=new.id and not exists(select 1 from public.service_order_quote_procurement_reservations reservation where reservation.quote_item_id=quote_item.id)
  ) then raise exception 'Aprovação exige reserva de todos os itens vinculados'; end if;
  return new;
end $$;
revoke all on function sgf_private.workshop_reservation_quote_guard() from public, anon, authenticated;
create trigger workshop_reservation_quote_guard before update of status on public.service_order_quotes for each row execute function sgf_private.workshop_reservation_quote_guard();

create function sgf_private.workshop_reservation_order_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.operational_status='cancelled' and exists(select 1 from public.service_order_quote_procurement_reservations where service_order_id=old.id and state='reserved') then
    raise exception 'Libere as reservas antes de cancelar a ordem de serviço';
  end if;
  if new.operational_status='received' and exists(select 1 from public.service_order_quote_procurement_reservations where service_order_id=old.id and state='reserved') then
    raise exception 'Realize as reservas antes de receber o veículo';
  end if;
  return new;
end $$;
revoke all on function sgf_private.workshop_reservation_order_guard() from public, anon, authenticated;
create trigger workshop_reservation_order_guard before update of operational_status on public.service_orders for each row execute function sgf_private.workshop_reservation_order_guard();

create function sgf_private.workshop_reservation_allocation_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare committed numeric;
begin
  if exists(select 1 from public.service_order_quote_procurement_reservations where allocation_id=old.id) then
    if tg_op='DELETE' then raise exception 'Dotação possui histórico de reservas de oficina'; end if;
    if (new.department_id,new.category,new.plan_id,new.appropriation,new.funding_source,new.simam_code) is distinct from (old.department_id,old.category,old.plan_id,old.appropriation,old.funding_source,old.simam_code) then
      raise exception 'Dotação com histórico não pode trocar sua identificação';
    end if;
    select coalesce(sum(committed_amount),0) + coalesce((select sum(committed_amount) from public.procurement_station_reservations where allocation_id=old.id),0)
      into committed from public.service_order_quote_procurement_reservations where allocation_id=old.id;
    if new.spending_limit<committed then raise exception 'Teto inferior ao valor comprometido'; end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function sgf_private.workshop_reservation_allocation_guard() from public, anon, authenticated;
create trigger workshop_reservation_allocation_guard before update or delete on public.instrument_budget_allocations for each row execute function sgf_private.workshop_reservation_allocation_guard();

create function sgf_private.workshop_reservation_item_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.service_order_quote_procurement_reservations where procurement_item_id=old.id) then
    if (new.instrument_id,new.origin_item_id,new.partner_id,new.partner_kind,new.category,new.unit) is distinct from (old.instrument_id,old.origin_item_id,old.partner_id,old.partner_kind,old.category,old.unit) then
      raise exception 'Item possui histórico de reservas de oficina';
    end if;
    if new.quantity<(select sum(committed_quantity) from public.service_order_quote_procurement_reservations where procurement_item_id=old.id) then
      raise exception 'Quantidade inferior à comprometida';
    end if;
  end if;
  return new;
end $$;
revoke all on function sgf_private.workshop_reservation_item_guard() from public, anon, authenticated;
create trigger workshop_reservation_item_guard before update on public.procurement_items for each row execute function sgf_private.workshop_reservation_item_guard();

create function sgf_private.workshop_reservation_station_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare committed numeric;
begin
  select coalesce(sum(committed_amount),0) + coalesce((select sum(committed_amount) from public.service_order_quote_procurement_reservations where allocation_id=new.allocation_id),0)
    into committed from public.procurement_station_reservations where allocation_id=new.allocation_id and operation_id<>new.operation_id;
  if committed + new.committed_amount > (select spending_limit from public.instrument_budget_allocations where id=new.allocation_id) then
    raise exception 'Teto da dotação insuficiente para a operação de posto';
  end if;
  return new;
end $$;
revoke all on function sgf_private.workshop_reservation_station_guard() from public, anon, authenticated;
create trigger workshop_reservation_station_guard before insert or update on public.procurement_station_reservations for each row execute function sgf_private.workshop_reservation_station_guard();

alter function public.manager_review_service_order_quote(uuid,boolean,text) rename to manager_review_service_order_quote_before_workshop_reservation;
create function public.manager_review_service_order_quote(p_quote_id uuid,p_approved boolean,p_note text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_approved then perform sgf_private.reserve_workshop_quote(p_quote_id); end if;
  perform public.manager_review_service_order_quote_before_workshop_reservation(p_quote_id,p_approved,p_note);
end $$;
revoke all on function public.manager_review_service_order_quote(uuid,boolean,text), public.manager_review_service_order_quote_before_workshop_reservation(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.manager_review_service_order_quote(uuid,boolean,text) to authenticated;

alter function public.manager_cancel_service_order(uuid,text) rename to manager_cancel_service_order_before_workshop_reservation;
create function public.manager_cancel_service_order(p_order_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.service_order_quote_procurement_reservations where service_order_id=p_order_id and state='reserved') then
    perform sgf_private.transition_workshop_order_reservations(p_order_id,'released','Cancelamento da OS: '||trim(p_reason));
  end if;
  perform public.manager_cancel_service_order_before_workshop_reservation(p_order_id,p_reason);
end $$;
revoke all on function public.manager_cancel_service_order(uuid,text), public.manager_cancel_service_order_before_workshop_reservation(uuid,text) from public, anon, authenticated;
grant execute on function public.manager_cancel_service_order(uuid,text) to authenticated;

alter function public.manager_receive_service_order_vehicle(uuid) rename to manager_receive_service_order_vehicle_before_workshop_reservation;
create function public.manager_receive_service_order_vehicle(p_order_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.service_order_quote_procurement_reservations where service_order_id=p_order_id and state='reserved') then
    perform sgf_private.transition_workshop_order_reservations(p_order_id,'realized','Serviço recebido; reserva convertida em realização contratual');
  end if;
  perform public.manager_receive_service_order_vehicle_before_workshop_reservation(p_order_id);
end $$;
revoke all on function public.manager_receive_service_order_vehicle(uuid), public.manager_receive_service_order_vehicle_before_workshop_reservation(uuid) from public, anon, authenticated;
grant execute on function public.manager_receive_service_order_vehicle(uuid) to authenticated;

alter function sgf_private.resource_modules(text,boolean) rename to resource_modules_before_workshop_quote_reservations;
create function sgf_private.resource_modules(p_resource text,p_write boolean) returns text[]
language sql immutable set search_path='' as $$
select case when p_resource in ('manager_review_service_order_quote','manager_cancel_service_order','manager_receive_service_order_vehicle')
  then array['maintenances','procurement','budgets']
  else sgf_private.resource_modules_before_workshop_quote_reservations(p_resource,p_write) end
$$;
revoke all on function sgf_private.resource_modules(text,boolean) from public, anon, authenticated;
notify pgrst,'reload schema';
