-- Stage 5B1. Internal ledger only: no client can create a reservation yet.
-- A future issuance adapter must reserve and INSERT the fueling in one transaction.
create table public.procurement_fuel_reservations (
 fueling_id uuid primary key references public.fuelings(id) deferrable initially deferred,
 tenant_id uuid not null references public.tenants(id),
 item_id uuid not null references public.procurement_items(id),
 allocation_id uuid not null references public.instrument_budget_allocations(id),
 price_id uuid not null references public.procurement_item_prices(id),
 vehicle_id uuid not null references public.vehicles(id),
 station_id uuid not null references public.fuel_stations(id),
 fuel_type text not null, expires_at timestamptz not null,
 authorized_quantity numeric(16,3) not null check(authorized_quantity>0 and authorized_quantity<>'NaN'::numeric),
 unit_price numeric(16,6) not null check(unit_price>0 and unit_price<>'NaN'::numeric),
 state text not null check(state in ('reserved','realized','disputed','released')),
 committed_quantity numeric(16,3) not null check(committed_quantity>=0 and committed_quantity<>'NaN'::numeric),
 committed_amount numeric(14,2) not null check(committed_amount>=0 and committed_amount<>'NaN'::numeric),
 request jsonb not null, created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index procurement_fuel_item on public.procurement_fuel_reservations(item_id);
create index procurement_fuel_allocation on public.procurement_fuel_reservations(allocation_id);
alter table public.procurement_fuel_reservations enable row level security;
revoke all on public.procurement_fuel_reservations from public,anon,authenticated;

create function sgf_private.reserve_procurement_fueling(p_fueling uuid,p_item uuid,p_allocation uuid,p_row jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
 actor public.profiles; item public.procurement_items; instrument public.procurement_instruments;
 allocation public.instrument_budget_allocations; plan public.instrument_budget_plans;
 price public.procurement_item_prices; existing public.procurement_fuel_reservations;
 vehicle public.vehicles; qty numeric; amount numeric; expiry timestamptz;
 day date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 actor:=sgf_private.procurement_actor();
 if not coalesce('budgets'=any(actor.allowed_modules),false) or not coalesce('refuelings'=any(actor.allowed_modules),false) then raise exception 'Acesso a limites e abastecimentos obrigatório' using errcode='42501'; end if;
 if p_fueling is null or jsonb_typeof(p_row) is distinct from 'object' then raise exception 'Reserva inválida'; end if;
 if exists(select 1 from jsonb_object_keys(p_row) k where k not in ('vehicle_id','station_id','fuel_type','max_liters','expires_at')) then raise exception 'Campo de reserva não permitido'; end if;
 -- Same tenant-first order as the legacy ledger, followed by the procurement process.
 perform 1 from public.tenants where id=actor.tenant_id for update;
 select i.* into item from public.procurement_items i join public.procurement_instruments ins on ins.id=i.instrument_id where i.id=p_item and ins.tenant_id=actor.tenant_id;
 if not found then raise exception 'Item não encontrado'; end if;
 select * into instrument from public.procurement_instruments where id=item.instrument_id;
 perform 1 from public.procurement_processes where id=instrument.process_id for update;
 select * into item from public.procurement_items where id=p_item;
 select * into instrument from public.procurement_instruments where id=item.instrument_id;
 select * into existing from public.procurement_fuel_reservations where fueling_id=p_fueling;
 if found then
 if existing.tenant_id is distinct from actor.tenant_id or existing.item_id<>p_item or existing.allocation_id<>p_allocation or existing.request is distinct from p_row then raise exception 'Identificador de reserva já usado por outra solicitação'; end if;
 return; -- Same request never creates a second charge or revives a cancelled request.
 end if;
 if exists(select 1 from public.fuelings where id=p_fueling) or exists(select 1 from public.budget_entries where source_type='fuelings' and source_id=p_fueling) then raise exception 'Abastecimento existente exige conciliação; não pode trocar de controle'; end if;
 if instrument.kind<>'contract' or item.category<>'fuel' or item.unit<>'L' or item.partner_kind<>'posto' then raise exception 'Selecione item de combustível em litros de um contrato'; end if;
 if day not between instrument.starts_on and instrument.ends_on then raise exception 'Contrato fora da vigência'; end if;
 select a.* into allocation from public.instrument_budget_allocations a join public.instrument_budget_plans b on b.id=a.plan_id where a.id=p_allocation and b.instrument_id=instrument.id and b.fiscal_year=extract(year from day);
 if not found or allocation.category<>'fuel' then raise exception 'Dotação incompatível com o contrato, categoria ou exercício'; end if;
 select * into plan from public.instrument_budget_plans where id=allocation.plan_id;
 select * into vehicle from public.vehicles where id=(p_row->>'vehicle_id')::uuid and tenant_id=actor.tenant_id;
 if not found or vehicle.department_id is distinct from allocation.department_id then raise exception 'Veículo não pertence à secretaria da dotação'; end if;
 if (p_row->>'station_id')::uuid is distinct from item.partner_id then raise exception 'Posto não é o fornecedor do item'; end if;
 if coalesce(p_row->>'fuel_type','') not in ('Diesel','Gasolina','Etanol') then raise exception 'Combustível inválido'; end if;
 qty:=(p_row->>'max_liters')::numeric; expiry:=(p_row->>'expires_at')::timestamptz;
 if qty is null or qty<=0 or qty in ('NaN'::numeric,'Infinity'::numeric) or qty<>round(qty,3) then raise exception 'Quantidade inválida'; end if;
 if vehicle.tank_capacity is null or qty>vehicle.tank_capacity then raise exception 'Confira a capacidade do tanque e a quantidade'; end if;
 if expiry is null or not isfinite(expiry) or expiry<=now() or expiry>now()+interval '7 days' or (expiry at time zone 'America/Sao_Paulo')::date>instrument.ends_on or extract(year from expiry at time zone 'America/Sao_Paulo')<>plan.fiscal_year then raise exception 'Validade inválida para contrato ou exercício'; end if;
 select * into price from public.procurement_item_prices where item_id=item.id and effective_on<=day order by effective_on desc,revision desc limit 1;
 if not found or price.pricing_mode<>'unit' or price.unit_price<=0 then raise exception 'Reserva de combustível exige preço unitário positivo conferido'; end if;
 amount:=round(qty*price.unit_price,2);
 if amount<=0 then raise exception 'Valor da reserva deve ser positivo'; end if;
 if qty+(select coalesce(sum(committed_quantity),0) from public.procurement_fuel_reservations where item_id=item.id)>item.quantity then raise exception 'Quantidade disponível do item insuficiente'; end if;
 if amount+(select coalesce(sum(committed_amount),0) from public.procurement_fuel_reservations where allocation_id=allocation.id)>allocation.spending_limit then raise exception 'Saldo disponível da dotação insuficiente'; end if;
 insert into public.procurement_fuel_reservations(fueling_id,tenant_id,item_id,allocation_id,price_id,vehicle_id,station_id,fuel_type,expires_at,authorized_quantity,unit_price,state,committed_quantity,committed_amount,request,created_by)
 values(p_fueling,actor.tenant_id,item.id,allocation.id,price.id,vehicle.id,item.partner_id,p_row->>'fuel_type',expiry,qty,price.unit_price,'reserved',qty,amount,p_row,actor.id);
 insert into public.procurement_registry_events(tenant_id,process_id,record_id,kind,actor_id,actor_name,reason,after_value)
 values(actor.tenant_id,instrument.process_id,p_fueling,'budget',actor.id,coalesce(actor.full_name,'Gestor'),'Reserva vinculada ao abastecimento',(select to_jsonb(r) from public.procurement_fuel_reservations r where fueling_id=p_fueling));
end $$;
revoke all on function sgf_private.reserve_procurement_fueling(uuid,uuid,uuid,jsonb) from public,anon,authenticated;

create function sgf_private.procurement_fueling_transition() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.procurement_fuel_reservations; next_state text; qty numeric; amount numeric; before_value jsonb; process uuid;
begin
 select * into r from public.procurement_fuel_reservations where fueling_id=case when tg_op='INSERT' then new.id else old.id end;
 if not found then return case when tg_op='DELETE' then old else new end; end if;
 if tg_op='DELETE' then raise exception 'Abastecimento vinculado não pode ser excluído'; end if;
 if tg_op='UPDATE' and exists(select 1 from unnest(array['id','driver_id','authorized_at','authorized_by','created_at']) field where to_jsonb(new)->field is distinct from to_jsonb(old)->field) then raise exception 'Identificação e autoria da autorização são imutáveis'; end if;
 perform 1 from public.tenants where id=r.tenant_id for update;
 select * into r from public.procurement_fuel_reservations where fueling_id=new.id for update;
 if (new.tenant_id,new.vehicle_id,new.station_id,new.fuel_type,new.max_liters,new.expires_at) is distinct from (r.tenant_id,r.vehicle_id,r.station_id,r.fuel_type,r.authorized_quantity,r.expires_at) then raise exception 'Vínculos e condições da autorização são imutáveis'; end if;
 if tg_op='INSERT' then
 if new.workflow_status<>'autorizado' or new.cancelled_at is not null or coalesce(new.liters,0)<>0 or new.filled_at is not null or coalesce(new.total_cost,0)<>0 then raise exception 'Reserva deve iniciar com autorização pendente'; end if;
 return new;
 end if;
 if r.state='released' then
 if to_jsonb(new) is distinct from to_jsonb(old) then raise exception 'Reserva liberada não pode ser reaberta ou alterada'; end if;
 return new;
 end if;
 if r.state in ('realized','disputed') then
 if (new.liters,new.total_cost,new.price_per_liter,new.filled_at) is distinct from (old.liters,old.total_cost,old.price_per_liter,old.filled_at) then raise exception 'Execução financeira não pode ser reescrita'; end if;
 if new.workflow_status not in ('concluido','validado','rejeitado_admin') then raise exception 'Despesa executada não pode liberar reserva'; end if;
 if r.state='disputed' and new.workflow_status<>'rejeitado_admin' then raise exception 'Despesa contestada exige conciliação específica'; end if;
 next_state:=case when new.workflow_status='rejeitado_admin' then 'disputed' else 'realized' end;
 qty:=r.committed_quantity; amount:=r.committed_amount;
 elsif new.workflow_status='autorizado' and new.cancelled_at is null then
 if (new.liters,new.total_cost,new.price_per_liter,new.filled_at) is distinct from (old.liters,old.total_cost,old.price_per_liter,old.filled_at) then raise exception 'Alteração financeira fora da conclusão'; end if;
 return new;
 elsif new.workflow_status in ('rejeitado_admin','rejeitado_motorista') and new.filled_at is null then
 if coalesce(new.liters,0)<>0 or coalesce(new.total_cost,0)<>0 then raise exception 'Cancelamento não pode ocultar execução'; end if;
 next_state:='released'; qty:=0; amount:=0;
 elsif new.workflow_status='concluido' then
 if r.expires_at<=now() then raise exception 'Autorização vencida'; end if;
 if new.filled_at is null or new.liters is null or new.liters<=0 or new.liters='NaN'::numeric or new.liters>r.authorized_quantity or new.liters<>round(new.liters,3) then raise exception 'Quantidade executada inválida'; end if;
 if new.price_per_liter is distinct from r.unit_price or new.total_cost is distinct from round(new.liters*r.unit_price,2) then raise exception 'Conclusão deve usar o preço reservado'; end if;
 next_state:='realized'; qty:=new.liters; amount:=new.total_cost;
 else raise exception 'Transição de reserva inválida'; end if;
 before_value:=to_jsonb(r);
 update public.procurement_fuel_reservations set state=next_state,committed_quantity=qty,committed_amount=amount,updated_at=now() where fueling_id=r.fueling_id;
 if before_value - 'updated_at' is distinct from (select to_jsonb(x)-'updated_at' from public.procurement_fuel_reservations x where fueling_id=r.fueling_id) then
 select i.process_id into process from public.procurement_items it join public.procurement_instruments i on i.id=it.instrument_id where it.id=r.item_id;
 insert into public.procurement_registry_events(tenant_id,process_id,record_id,kind,actor_id,actor_name,reason,before_value,after_value)
 values(r.tenant_id,process,r.fueling_id,'budget',auth.uid(),coalesce((select full_name from public.profiles where id=auth.uid()),'Sistema'),'Transição do abastecimento: '||next_state,before_value,(select to_jsonb(x) from public.procurement_fuel_reservations x where fueling_id=r.fueling_id));
 end if;
 return new;
end $$;
revoke all on function sgf_private.procurement_fueling_transition() from public,anon,authenticated;
create trigger a_procurement_fueling_transition before insert or update or delete on public.fuelings for each row execute function sgf_private.procurement_fueling_transition();

-- Legacy departmental booking must not charge the same bound fueling again.
alter function sgf_private.book_budget(text,jsonb,uuid) rename to book_budget_before_procurement_fuel;
create function sgf_private.book_budget(p_source text,p_row jsonb,p_initial_contract uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_source='fuelings' and exists(select 1 from public.procurement_fuel_reservations where fueling_id=(p_row->>'id')::uuid) then
 if p_initial_contract is not null then raise exception 'Abastecimento já vinculado ao novo controle'; end if;
 return;
 end if;
 perform sgf_private.book_budget_before_procurement_fuel(p_source,p_row,p_initial_contract);
end $$;
revoke all on function sgf_private.book_budget(text,jsonb,uuid) from public,anon,authenticated;

-- A plan revision may not rewrite the department/category or delete a used allocation.
create function sgf_private.procurement_reserved_allocation_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.procurement_fuel_reservations where allocation_id=old.id) then
 if tg_op='DELETE' then raise exception 'Dotação possui histórico de reservas'; end if;
 if (new.department_id,new.category,new.plan_id,new.appropriation,new.funding_source,new.simam_code) is distinct from (old.department_id,old.category,old.plan_id,old.appropriation,old.funding_source,old.simam_code) then raise exception 'Dotação com histórico não pode trocar sua identificação'; end if;
 if new.spending_limit<(select sum(committed_amount) from public.procurement_fuel_reservations where allocation_id=old.id) then raise exception 'Teto inferior ao valor comprometido'; end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function sgf_private.procurement_reserved_allocation_guard() from public,anon,authenticated;
create trigger procurement_reserved_allocation_guard before update or delete on public.instrument_budget_allocations for each row execute function sgf_private.procurement_reserved_allocation_guard();
create function sgf_private.procurement_reserved_item_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.procurement_fuel_reservations where item_id=old.id) then
 if (new.instrument_id,new.origin_item_id,new.partner_id,new.partner_kind,new.category,new.unit) is distinct from (old.instrument_id,old.origin_item_id,old.partner_id,old.partner_kind,old.category,old.unit) then raise exception 'Item possui histórico de abastecimentos'; end if;
 if new.quantity<(select sum(committed_quantity) from public.procurement_fuel_reservations where item_id=old.id) then raise exception 'Quantidade inferior ao comprometido'; end if;
 end if;
 return new;
end $$;
revoke all on function sgf_private.procurement_reserved_item_guard() from public,anon,authenticated;
create trigger procurement_reserved_item_guard before update on public.procurement_items for each row execute function sgf_private.procurement_reserved_item_guard();
