-- Stage 5C1: internal ledger for non-fuel station operations. No public issuance API.
-- The future adapter must reserve and insert the operation in the same transaction.
create table public.procurement_station_reservations (
 operation_id uuid primary key references public.station_operations(id) deferrable initially deferred,
 tenant_id uuid not null references public.tenants(id),
 item_id uuid not null references public.procurement_items(id),
 allocation_id uuid not null references public.instrument_budget_allocations(id),
 price_id uuid not null references public.procurement_item_prices(id),
 catalog_item_id uuid not null references public.station_catalog_items(id),
 vehicle_id uuid not null references public.vehicles(id),
 station_id uuid not null references public.fuel_stations(id),
 department_id uuid not null references public.departments(id),
 item_kind text not null check(item_kind in ('arla','lubrificante','servico')),
 item_name text not null, unit text not null check(unit in ('L','UN','KG','SERVICO')),
 expires_at timestamptz not null,
 authorized_quantity numeric(16,3) not null check(authorized_quantity>0 and authorized_quantity<>'NaN'::numeric),
 unit_price numeric(16,6) not null check(unit_price>0 and unit_price<>'NaN'::numeric),
 state text not null check(state in ('reserved','realized','disputed','released')),
 committed_quantity numeric(16,3) not null check(committed_quantity>=0 and committed_quantity<>'NaN'::numeric),
 committed_amount numeric(14,2) not null check(committed_amount>=0 and committed_amount<>'NaN'::numeric),
 request jsonb not null, created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index procurement_station_item on public.procurement_station_reservations(item_id);
create index procurement_station_allocation on public.procurement_station_reservations(allocation_id);
alter table public.procurement_station_reservations enable row level security;
revoke all on public.procurement_station_reservations from public,anon,authenticated;
alter table public.station_operations alter column unit_price type numeric(16,6);

create function sgf_private.reserve_procurement_station_operation(p_operation uuid,p_item uuid,p_allocation uuid,p_row jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
 actor public.profiles; item public.procurement_items; instrument public.procurement_instruments;
 allocation public.instrument_budget_allocations; plan public.instrument_budget_plans;
 price public.procurement_item_prices; existing public.procurement_station_reservations;
 vehicle public.vehicles; catalog public.station_catalog_items;
 qty numeric; amount numeric; expiry timestamptz; expected_kind text;
 day date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 actor:=sgf_private.procurement_actor();
 if not coalesce('budgets'=any(actor.allowed_modules),false) or not coalesce('stations'=any(actor.allowed_modules),false) then raise exception 'Acesso a limites e postos obrigatório' using errcode='42501'; end if;
 if p_operation is null or jsonb_typeof(p_row) is distinct from 'object' then raise exception 'Reserva inválida'; end if;
 if exists(select 1 from jsonb_object_keys(p_row) k where k not in ('vehicle_id','station_id','catalog_item_id','quantity','expires_at')) then raise exception 'Campo de reserva não permitido'; end if;
 perform 1 from public.tenants where id=actor.tenant_id for update;
 select i.* into item from public.procurement_items i join public.procurement_instruments ins on ins.id=i.instrument_id where i.id=p_item and ins.tenant_id=actor.tenant_id;
 if not found then raise exception 'Item não encontrado'; end if;
 select * into instrument from public.procurement_instruments where id=item.instrument_id;
 perform 1 from public.procurement_processes where id=instrument.process_id for update;
 select * into item from public.procurement_items where id=p_item;
 select * into instrument from public.procurement_instruments where id=item.instrument_id;
 select * into existing from public.procurement_station_reservations where operation_id=p_operation;
 if found then
 if existing.tenant_id is distinct from actor.tenant_id or existing.created_by<>actor.id or existing.item_id<>p_item or existing.allocation_id<>p_allocation or existing.request is distinct from p_row then raise exception 'Identificador de reserva já usado por outra solicitação'; end if;
 return;
 end if;
 if exists(select 1 from public.station_operations where id=p_operation) or exists(select 1 from public.budget_entries where source_type='station_operations' and source_id=p_operation) then raise exception 'Operação existente exige conciliação; não pode trocar de controle'; end if;
 expected_kind:=case item.category when 'arla' then 'arla' when 'lubricant' then 'lubrificante' when 'labor' then 'servico' when 'tire_service' then 'servico' end;
 if instrument.kind<>'contract' or expected_kind is null or item.partner_kind<>'posto' then raise exception 'Selecione ARLA, lubrificante ou serviço de posto de um contrato'; end if;
 if day not between instrument.starts_on and instrument.ends_on then raise exception 'Contrato fora da vigência'; end if;
 select a.* into allocation from public.instrument_budget_allocations a join public.instrument_budget_plans b on b.id=a.plan_id where a.id=p_allocation and b.instrument_id=instrument.id and b.fiscal_year=extract(year from day);
 if not found or allocation.category<>item.category then raise exception 'Dotação incompatível com o contrato, categoria ou exercício'; end if;
 select * into plan from public.instrument_budget_plans where id=allocation.plan_id;
 select * into vehicle from public.vehicles where id=(p_row->>'vehicle_id')::uuid and tenant_id=actor.tenant_id;
 if not found or vehicle.department_id is distinct from allocation.department_id then raise exception 'Veículo não pertence à secretaria da dotação'; end if;
 if (p_row->>'station_id')::uuid is distinct from item.partner_id then raise exception 'Posto não é o fornecedor do item'; end if;
 select * into catalog from public.station_catalog_items where id=(p_row->>'catalog_item_id')::uuid and tenant_id=actor.tenant_id and station_id=item.partner_id for share;
 if not found or not catalog.active or catalog.kind<>expected_kind or catalog.unit is distinct from (case item.unit when 'SERV' then 'SERVICO' else item.unit end) then raise exception 'Catálogo incompatível com fornecedor, categoria ou unidade do item'; end if;
 qty:=(p_row->>'quantity')::numeric; expiry:=(p_row->>'expires_at')::timestamptz;
 if qty is null or qty<=0 or qty in ('NaN'::numeric,'Infinity'::numeric) or qty<>round(qty,3) then raise exception 'Quantidade inválida'; end if;
 -- ARLA/lubricants/services do not consume the vehicle propulsion-fuel tank.
 if expiry is null or not isfinite(expiry) or expiry<=now() or expiry>now()+interval '7 days' or (expiry at time zone 'America/Sao_Paulo')::date>instrument.ends_on or extract(year from expiry at time zone 'America/Sao_Paulo')<>plan.fiscal_year then raise exception 'Validade inválida para contrato ou exercício'; end if;
 select * into price from public.procurement_item_prices where item_id=item.id and effective_on<=day order by effective_on desc,revision desc limit 1;
 if not found or price.pricing_mode<>'unit' or price.unit_price<=0 then raise exception 'Reserva exige preço unitário positivo conferido'; end if;
 amount:=round(qty*price.unit_price,2);
 if amount<=0 then raise exception 'Valor da reserva deve ser positivo'; end if;
 if qty+(select coalesce(sum(committed_quantity),0) from public.procurement_station_reservations where item_id=item.id)>item.quantity then raise exception 'Quantidade disponível do item insuficiente'; end if;
 if amount+(select coalesce(sum(committed_amount),0) from public.procurement_station_reservations where allocation_id=allocation.id)>allocation.spending_limit then raise exception 'Saldo disponível da dotação insuficiente'; end if;
 insert into public.procurement_station_reservations(operation_id,tenant_id,item_id,allocation_id,price_id,catalog_item_id,vehicle_id,station_id,department_id,item_kind,item_name,unit,expires_at,authorized_quantity,unit_price,state,committed_quantity,committed_amount,request,created_by)
 values(p_operation,actor.tenant_id,item.id,allocation.id,price.id,catalog.id,vehicle.id,item.partner_id,allocation.department_id,catalog.kind,item.description,catalog.unit,expiry,qty,price.unit_price,'reserved',qty,amount,p_row,actor.id);
 insert into public.procurement_registry_events(tenant_id,process_id,record_id,kind,actor_id,actor_name,reason,after_value)
 values(actor.tenant_id,instrument.process_id,p_operation,'budget',actor.id,coalesce(actor.full_name,'Gestor'),'Reserva vinculada à operação de posto',(select to_jsonb(r) from public.procurement_station_reservations r where operation_id=p_operation));
end $$;
revoke all on function sgf_private.reserve_procurement_station_operation(uuid,uuid,uuid,jsonb) from public,anon,authenticated;

create function sgf_private.procurement_station_transition() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.procurement_station_reservations; next_state text; qty numeric; amount numeric; previous jsonb; process uuid;
begin
 select * into r from public.procurement_station_reservations where operation_id=case when tg_op='INSERT' then new.id else old.id end;
 if not found then return case when tg_op='DELETE' then old else new end; end if;
 if tg_op='DELETE' then raise exception 'Operação vinculada não pode ser excluída'; end if;
 if tg_op='UPDATE' and exists(select 1 from unnest(array['id','driver_id','protocol','authorized_at','authorized_by','created_at']) field where to_jsonb(new)->field is distinct from to_jsonb(old)->field) then raise exception 'Identificação e autoria da autorização são imutáveis'; end if;
 perform 1 from public.tenants where id=r.tenant_id for update;
 select * into r from public.procurement_station_reservations where operation_id=new.id for update;
 if (new.tenant_id,new.vehicle_id,new.station_id,new.department_id,new.catalog_item_id,new.item_kind,new.item_name,new.unit,new.authorized_quantity,new.unit_price,new.expires_at) is distinct from (r.tenant_id,r.vehicle_id,r.station_id,r.department_id,r.catalog_item_id,r.item_kind,r.item_name,r.unit,r.authorized_quantity,r.unit_price,r.expires_at) then raise exception 'Vínculos e condições da autorização são imutáveis'; end if;
 if tg_op='INSERT' then
 if new.status is distinct from 'autorizado' or new.quantity is not null or new.executed_at is not null or new.executed_by is not null or new.total_cost is not null or new.receipt_number is not null or new.evidence_path is not null or new.authorized_by is distinct from r.created_by then raise exception 'Reserva deve iniciar com autorização pendente e autoria válida'; end if;
 return new;
 end if;
 if r.state='released' then
 if to_jsonb(new) is distinct from to_jsonb(old) then raise exception 'Reserva liberada não pode ser reaberta ou alterada'; end if;
 return new;
 end if;
 if r.state in ('realized','disputed') then
 if (new.quantity,new.total_cost,new.executed_at,new.executed_by,new.odometer,new.receipt_number,new.evidence_path) is distinct from (old.quantity,old.total_cost,old.executed_at,old.executed_by,old.odometer,old.receipt_number,old.evidence_path) then raise exception 'Execução financeira e comprovantes não podem ser reescritos'; end if;
 if new.status is null or new.status not in ('concluido','validado','rejeitado') then raise exception 'Despesa executada não pode liberar reserva'; end if;
 if r.state='disputed' and new.status<>'rejeitado' then raise exception 'Despesa contestada exige conciliação específica'; end if;
 next_state:=case when new.status='rejeitado' then 'disputed' else 'realized' end;
 qty:=r.committed_quantity; amount:=r.committed_amount;
 elsif new.status='autorizado' then
 if (new.quantity,new.total_cost,new.executed_at,new.executed_by,new.receipt_number,new.evidence_path) is distinct from (old.quantity,old.total_cost,old.executed_at,old.executed_by,old.receipt_number,old.evidence_path) then raise exception 'Alteração financeira fora da conclusão'; end if;
 return new;
 elsif new.status='cancelado' then
 if new.quantity is not null or new.total_cost is not null or new.executed_at is not null or new.executed_by is not null or new.receipt_number is not null or new.evidence_path is not null then raise exception 'Cancelamento não pode ocultar execução'; end if;
 next_state:='released'; qty:=0; amount:=0;
 elsif new.status='concluido' then
 if r.expires_at<=now() then raise exception 'Autorização vencida'; end if;
 if new.executed_at is null or new.executed_by is null or nullif(btrim(new.receipt_number),'') is null or nullif(btrim(new.evidence_path),'') is null then raise exception 'Execução exige responsável e comprovantes'; end if;
 if new.quantity is null or new.quantity<=0 or new.quantity='NaN'::numeric or new.quantity>r.authorized_quantity or new.quantity<>round(new.quantity,3) then raise exception 'Quantidade executada inválida'; end if;
 if new.total_cost is distinct from round(new.quantity*r.unit_price,2) or new.total_cost<=0 then raise exception 'Conclusão deve usar o preço reservado'; end if;
 next_state:='realized'; qty:=new.quantity; amount:=new.total_cost;
 else raise exception 'Transição de reserva inválida'; end if;
 previous:=to_jsonb(r);
 update public.procurement_station_reservations set state=next_state,committed_quantity=qty,committed_amount=amount,updated_at=now() where operation_id=r.operation_id;
 if previous-'updated_at' is distinct from (select to_jsonb(x)-'updated_at' from public.procurement_station_reservations x where operation_id=r.operation_id) then
 select i.process_id into process from public.procurement_items it join public.procurement_instruments i on i.id=it.instrument_id where it.id=r.item_id;
 insert into public.procurement_registry_events(tenant_id,process_id,record_id,kind,actor_id,actor_name,reason,before_value,after_value)
 values(r.tenant_id,process,r.operation_id,'budget',auth.uid(),coalesce((select full_name from public.profiles where id=auth.uid()),'Sistema'),'Transição da operação de posto: '||next_state,previous,(select to_jsonb(x) from public.procurement_station_reservations x where operation_id=r.operation_id));
 end if;
 return new;
end $$;
revoke all on function sgf_private.procurement_station_transition() from public,anon,authenticated;
create trigger a_procurement_station_transition before insert or update or delete on public.station_operations for each row execute function sgf_private.procurement_station_transition();

-- Fuel and non-fuel allocations have disjoint categories; each ledger remains separate.
-- These additional guards complement the existing fuel guards under the process lock.
create function sgf_private.procurement_station_allocation_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.procurement_station_reservations where allocation_id=old.id) then
 if tg_op='DELETE' then raise exception 'Dotação possui histórico de operações de posto'; end if;
 if (new.department_id,new.category,new.plan_id,new.appropriation,new.funding_source,new.simam_code) is distinct from (old.department_id,old.category,old.plan_id,old.appropriation,old.funding_source,old.simam_code) then raise exception 'Dotação com histórico não pode trocar sua identificação'; end if;
 if new.spending_limit<(select sum(committed_amount) from public.procurement_station_reservations where allocation_id=old.id) then raise exception 'Teto inferior ao valor comprometido'; end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function sgf_private.procurement_station_allocation_guard() from public,anon,authenticated;
create trigger procurement_station_allocation_guard before update or delete on public.instrument_budget_allocations for each row execute function sgf_private.procurement_station_allocation_guard();
create function sgf_private.procurement_station_item_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.procurement_station_reservations where item_id=old.id) then
 if (new.instrument_id,new.origin_item_id,new.partner_id,new.partner_kind,new.category,new.unit) is distinct from (old.instrument_id,old.origin_item_id,old.partner_id,old.partner_kind,old.category,old.unit) then raise exception 'Item possui histórico de operações de posto'; end if;
 if new.quantity<(select sum(committed_quantity) from public.procurement_station_reservations where item_id=old.id) then raise exception 'Quantidade inferior ao comprometido'; end if;
 end if;
 return new;
end $$;
revoke all on function sgf_private.procurement_station_item_guard() from public,anon,authenticated;
create trigger procurement_station_item_guard before update on public.procurement_items for each row execute function sgf_private.procurement_station_item_guard();

alter function sgf_private.book_budget(text,jsonb,uuid) rename to book_budget_before_procurement_station;
create function sgf_private.book_budget(p_source text,p_row jsonb,p_initial_contract uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_source='station_operations' and exists(select 1 from public.procurement_station_reservations where operation_id=(p_row->>'id')::uuid) then
 if p_initial_contract is not null then raise exception 'Operação já vinculada ao novo controle'; end if;
 return;
 end if;
 perform sgf_private.book_budget_before_procurement_station(p_source,p_row,p_initial_contract);
end $$;
revoke all on function sgf_private.book_budget(text,jsonb,uuid) from public,anon,authenticated;
