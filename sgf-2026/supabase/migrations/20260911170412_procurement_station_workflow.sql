-- Stage 5C2: guarded issuance and completion. No contract is enabled by this migration.
create table public.procurement_station_rollouts (
 instrument_id uuid primary key references public.procurement_instruments(id),
 enabled boolean not null default false,
 document_reference text not null check(length(trim(document_reference))>=3)
);
alter table public.procurement_station_rollouts enable row level security;
revoke all on public.procurement_station_rollouts from public,anon,authenticated;
alter table public.procurement_station_reservations add column issuance_payload jsonb;

create function sgf_private.issue_procurement_station_operation(p_request uuid,p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; item public.procurement_items; vehicle public.vehicles;
 existing public.procurement_station_reservations; reserved public.procurement_station_reservations; driver uuid;
begin
 actor:=sgf_private.procurement_actor();
 if not coalesce('budgets'=any(actor.allowed_modules),false) or not coalesce('stations'=any(actor.allowed_modules),false) then raise exception 'Acesso a limites e postos obrigatório' using errcode='42501'; end if;
 if p_request is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Solicitação inválida'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('item_id','allocation_id','vehicle_id','driver_id','catalog_item_id','quantity','expires_at','note')) then raise exception 'Campo não permitido'; end if;
 perform 1 from public.tenants where id=actor.tenant_id for update;
 select * into existing from public.procurement_station_reservations where operation_id=p_request;
 if found then
 if existing.tenant_id is distinct from actor.tenant_id or existing.created_by<>actor.id or existing.issuance_payload is distinct from p_payload then raise exception 'Solicitação já utilizada'; end if;
 return p_request;
 end if;
 select i.* into item from public.procurement_items i join public.procurement_instruments ins on ins.id=i.instrument_id where i.id=(p_payload->>'item_id')::uuid and ins.tenant_id=actor.tenant_id;
 if not found then raise exception 'Item não encontrado'; end if;
 perform 1 from public.procurement_processes where id=(select process_id from public.procurement_instruments where id=item.instrument_id) for update;
 perform 1 from public.procurement_station_rollouts where instrument_id=item.instrument_id and enabled for share;
 if not found then raise exception 'Contrato aguarda habilitação de operações complementares após homologação'; end if;
 select * into item from public.procurement_items where id=item.id;
 select * into vehicle from public.vehicles where id=(p_payload->>'vehicle_id')::uuid and tenant_id=actor.tenant_id for update;
 if not found or vehicle.status::text in ('bloqueado','inativo') then raise exception 'Veículo indisponível'; end if;
 driver:=(p_payload->>'driver_id')::uuid;
 perform 1 from public.profiles where id=driver and tenant_id=actor.tenant_id and role='motorista' and driver_status='ativo' and not coalesce(access_blocked,false) for share;
 if not found then raise exception 'Motorista ativo não encontrado'; end if;
 perform 1 from public.fuel_stations where id=item.partner_id and tenant_id=actor.tenant_id and is_active for update;
 if not found then raise exception 'Posto ativo não encontrado'; end if;
 if length(coalesce(p_payload->>'note',''))>1000 then raise exception 'Observação muito longa'; end if;
 perform sgf_private.reserve_procurement_station_operation(p_request,item.id,(p_payload->>'allocation_id')::uuid,jsonb_build_object('vehicle_id',vehicle.id,'station_id',item.partner_id,'catalog_item_id',p_payload->>'catalog_item_id','quantity',p_payload->'quantity','expires_at',p_payload->>'expires_at'));
 update public.procurement_station_reservations set issuance_payload=p_payload where operation_id=p_request returning * into reserved;
 -- The existing fiscal trigger validates aggregate commitment coverage using this price.
 insert into public.station_operations(id,tenant_id,station_id,catalog_item_id,vehicle_id,driver_id,department_id,protocol,item_kind,item_name,unit,status,authorized_quantity,unit_price,authorization_note,authorized_by,authorized_at,expires_at)
 values(p_request,actor.tenant_id,reserved.station_id,reserved.catalog_item_id,vehicle.id,driver,reserved.department_id,'OPS-'||upper(replace(p_request::text,'-','')),reserved.item_kind,reserved.item_name,reserved.unit,'autorizado',reserved.authorized_quantity,reserved.unit_price,nullif(trim(p_payload->>'note'),''),actor.id,now(),reserved.expires_at);
 return p_request;
end $$;
revoke all on function sgf_private.issue_procurement_station_operation(uuid,jsonb) from public,anon,authenticated;
grant execute on function sgf_private.issue_procurement_station_operation(uuid,jsonb) to authenticated;
create function public.issue_procurement_station_operation(p_request uuid,p_payload jsonb) returns uuid
language sql security invoker set search_path='' as $$select sgf_private.issue_procurement_station_operation(p_request,p_payload)$$;
revoke all on function public.issue_procurement_station_operation(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.issue_procurement_station_operation(uuid,jsonb) to authenticated;

-- Exclude new-contract operations only from the legacy global limit, never from fiscal usage.
alter function public.station_contract_committed(uuid) rename to station_contract_committed_before_station_procurement;
revoke all on function public.station_contract_committed_before_station_procurement(uuid) from public,anon,authenticated;
create function public.station_contract_committed(p_station_id uuid) returns numeric
language sql stable security definer set search_path='' as $$
 select greatest(public.station_contract_committed_before_station_procurement(p_station_id)-
 (select coalesce(sum(case when o.status='autorizado' and o.expires_at>now() then round(o.authorized_quantity*o.unit_price,2) when o.status in ('concluido','validado','rejeitado') then coalesce(o.total_cost,0) else 0 end),0)
 from public.procurement_station_reservations r join public.station_operations o on o.id=r.operation_id where r.station_id=p_station_id),0)
$$;
revoke all on function public.station_contract_committed(uuid) from public,anon,authenticated;

-- Preserve the old endpoint and route bound records through stricter validation.
alter function public.partner_complete_station_operation(uuid,numeric,integer,text,text) set schema sgf_private;
alter function sgf_private.partner_complete_station_operation(uuid,numeric,integer,text,text) rename to complete_station_operation_before_procurement;
revoke all on function sgf_private.complete_station_operation_before_procurement(uuid,numeric,integer,text,text) from public,anon,authenticated;
create function sgf_private.complete_station_operation_router(p_operation_id uuid,p_quantity numeric,p_odometer integer,p_receipt_number text,p_evidence_path text)
returns table(total_cost numeric,unit_price numeric,protocol text)
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; operation public.station_operations;
begin
 if not sgf_private.current_session_allowed() then raise exception 'Sessão inválida ou revogada' using errcode='42501'; end if;
 if not exists(select 1 from public.procurement_station_reservations where operation_id=p_operation_id) then
 return query select * from sgf_private.complete_station_operation_before_procurement(p_operation_id,p_quantity,p_odometer,p_receipt_number,p_evidence_path);
 return;
 end if;
 select * into actor from public.profiles where id=auth.uid();
 if actor.role is distinct from 'posto' or not coalesce('stations'=any(actor.allowed_modules),false) then raise exception 'Acesso restrito ao posto' using errcode='42501'; end if;
 -- Match the tenant-first lock order used by issuance and the financial ledger.
 perform 1 from public.tenants where id=actor.tenant_id for update;
 select * into operation from public.station_operations where id=p_operation_id and tenant_id=actor.tenant_id and station_id=actor.station_id for update;
 if not found then raise exception 'Autorização não encontrada para este posto'; end if;
 if operation.executed_at is not null then
 if operation.executed_by=actor.id and operation.quantity=p_quantity and operation.odometer is not distinct from p_odometer and operation.receipt_number=trim(p_receipt_number) and operation.evidence_path=p_evidence_path then
 return query select operation.total_cost,operation.unit_price,operation.protocol; return;
 end if;
 raise exception 'Operação já concluída com outros dados';
 end if;
 if operation.status<>'autorizado' then raise exception 'Autorização não está aberta'; end if;
 perform 1 from public.fuel_stations where id=actor.station_id and tenant_id=actor.tenant_id and is_active for share;
 if not found then raise exception 'Posto inativo'; end if;
 if p_odometer is null or p_odometer<=0 then raise exception 'Hodômetro inválido'; end if;
 if coalesce(length(trim(p_receipt_number)),0) not between 1 and 100 then raise exception 'Informe o número do comprovante'; end if;
 if p_evidence_path is null or p_evidence_path not like 'tenant/'||actor.tenant_id||'/stations/'||actor.station_id||'/operations/'||operation.id||'/%' or p_evidence_path like '%..%' then raise exception 'Evidência não pertence à autorização'; end if;
 if not exists(select 1 from storage.objects obj where bucket_id='fotos' and name=p_evidence_path and coalesce(to_jsonb(obj)->>'owner_id',to_jsonb(obj)->>'owner')=actor.id::text) then raise exception 'Evidência não encontrada ou enviada por outro usuário'; end if;
 update public.station_operations set status='concluido',quantity=p_quantity,total_cost=round(p_quantity*operation.unit_price,2),odometer=p_odometer,receipt_number=trim(p_receipt_number),evidence_path=p_evidence_path,executed_by=actor.id,executed_at=now(),updated_at=now() where id=operation.id returning * into operation;
 return query select operation.total_cost,operation.unit_price,operation.protocol;
end $$;
revoke all on function sgf_private.complete_station_operation_router(uuid,numeric,integer,text,text) from public,anon,authenticated;
grant execute on function sgf_private.complete_station_operation_router(uuid,numeric,integer,text,text) to authenticated;
create function public.partner_complete_station_operation(p_operation_id uuid,p_quantity numeric,p_odometer integer,p_receipt_number text,p_evidence_path text)
returns table(total_cost numeric,unit_price numeric,protocol text)
language sql security invoker set search_path='' as $$select * from sgf_private.complete_station_operation_router(p_operation_id,p_quantity,p_odometer,p_receipt_number,p_evidence_path)$$;
revoke all on function public.partner_complete_station_operation(uuid,numeric,integer,text,text) from public,anon,authenticated;
grant execute on function public.partner_complete_station_operation(uuid,numeric,integer,text,text) to authenticated;

alter function sgf_private.resource_modules(text,boolean) rename to resource_modules_before_procurement_station_workflow;
create function sgf_private.resource_modules(p_resource text,p_write boolean) returns text[]
language sql immutable set search_path='' as $$select case when p_resource in ('issue_procurement_station_operation','has_procurement_station_binding','cancel_procurement_station_operation') then array['procurement','budgets','stations'] else sgf_private.resource_modules_before_procurement_station_workflow(p_resource,p_write) end$$;
revoke all on function sgf_private.resource_modules(text,boolean) from public,anon,authenticated;
notify pgrst,'reload schema';

create function sgf_private.procurement_station_binding(p_operation uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles;
begin
 actor:=sgf_private.procurement_actor();
 if not coalesce('budgets'=any(actor.allowed_modules),false) or not coalesce('stations'=any(actor.allowed_modules),false) then raise exception 'Acesso a limites e postos obrigatório' using errcode='42501'; end if;
 return exists(select 1 from public.procurement_station_reservations where operation_id=p_operation and tenant_id=actor.tenant_id);
end $$;
revoke all on function sgf_private.procurement_station_binding(uuid) from public,anon,authenticated;
grant execute on function sgf_private.procurement_station_binding(uuid) to authenticated;
create function public.has_procurement_station_binding(p_operation uuid) returns boolean
language sql stable security invoker set search_path='' as $$select sgf_private.procurement_station_binding(p_operation)$$;
revoke all on function public.has_procurement_station_binding(uuid) from public,anon,authenticated;
grant execute on function public.has_procurement_station_binding(uuid) to authenticated;

create function sgf_private.cancel_procurement_station_operation(p_operation uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; operation public.station_operations;
begin
 actor:=sgf_private.procurement_actor();
 if not sgf_private.procurement_station_binding(p_operation) then raise exception 'Operação não pertence ao controle contratual desta prefeitura'; end if;
 if coalesce(length(trim(p_reason)),0) not between 3 and 1000 then raise exception 'Informe o motivo do cancelamento (3 a 1000 caracteres)'; end if;
 perform 1 from public.tenants where id=actor.tenant_id for update;
 select * into operation from public.station_operations where id=p_operation and tenant_id=actor.tenant_id for update;
 if not found then raise exception 'Operação não encontrada'; end if;
 if operation.status='cancelado' then return; end if;
 if operation.status<>'autorizado' or operation.executed_at is not null then raise exception 'Somente autorização não executada pode ser cancelada'; end if;
 update public.station_operations set status='cancelado',rejection_reason=trim(p_reason),updated_at=now() where id=p_operation;
 update public.procurement_registry_events set reason='Cancelamento da operação: '||trim(p_reason)
 where id=(select max(id) from public.procurement_registry_events where record_id=p_operation and kind='budget');
end $$;
revoke all on function sgf_private.cancel_procurement_station_operation(uuid,text) from public,anon,authenticated;
grant execute on function sgf_private.cancel_procurement_station_operation(uuid,text) to authenticated;
create function public.cancel_procurement_station_operation(p_operation uuid,p_reason text) returns void
language sql security invoker set search_path='' as $$select sgf_private.cancel_procurement_station_operation(p_operation,p_reason)$$;
revoke all on function public.cancel_procurement_station_operation(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_procurement_station_operation(uuid,text) to authenticated;
notify pgrst,'reload schema';
