-- Integration remains disabled until controlled homologation enables a contract.
create table public.procurement_fuel_rollouts (
 instrument_id uuid primary key references public.procurement_instruments(id),
 enabled boolean not null default false,
 document_reference text not null check(length(trim(document_reference))>=3)
);
alter table public.procurement_fuel_rollouts enable row level security;
revoke all on public.procurement_fuel_rollouts from public,anon,authenticated;
alter table public.procurement_fuel_reservations add column issuance_payload jsonb;
-- Preserve six-decimal item prices throughout the fueling record.
alter table public.fuelings alter column price_per_liter type numeric(16,6);

create function sgf_private.issue_procurement_fueling(p_request uuid,p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; item public.procurement_items; vehicle public.vehicles;
 existing public.procurement_fuel_reservations; reserved public.procurement_fuel_reservations;
 driver uuid; station uuid; expires timestamptz; qty numeric; fuel text;
begin
 actor:=sgf_private.procurement_actor();
 if not coalesce('budgets'=any(actor.allowed_modules),false) or not coalesce('refuelings'=any(actor.allowed_modules),false) then raise exception 'Acesso a limites e abastecimentos obrigatório' using errcode='42501'; end if;
 if p_request is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Solicitação inválida'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('item_id','allocation_id','vehicle_id','driver_id','quantity','expires_at','note')) then raise exception 'Campo não permitido'; end if;
 perform 1 from public.tenants where id=actor.tenant_id for update;
 select * into existing from public.procurement_fuel_reservations where fueling_id=p_request;
 if found then
 if existing.tenant_id is distinct from actor.tenant_id or existing.created_by<>actor.id or existing.issuance_payload is distinct from p_payload then raise exception 'Solicitação já utilizada'; end if;
 return p_request;
 end if;
 select i.* into item from public.procurement_items i join public.procurement_instruments ins on ins.id=i.instrument_id where i.id=(p_payload->>'item_id')::uuid and ins.tenant_id=actor.tenant_id;
 if not found then raise exception 'Item não encontrado'; end if;
 perform 1 from public.procurement_processes where id=(select process_id from public.procurement_instruments where id=item.instrument_id) for update;
 if not exists(select 1 from public.procurement_fuel_rollouts where instrument_id=item.instrument_id and enabled) then raise exception 'Contrato aguarda habilitação após homologação'; end if;
 select * into item from public.procurement_items where id=item.id;
 fuel:=initcap(item.fuel_code);station:=item.partner_id;driver:=(p_payload->>'driver_id')::uuid;
 if fuel is null then raise exception 'Classifique o combustível antes de emitir'; end if;
 select * into vehicle from public.vehicles where id=(p_payload->>'vehicle_id')::uuid and tenant_id=actor.tenant_id for update;
 if not found or vehicle.status::text in ('bloqueado','inativo') then raise exception 'Veículo indisponível'; end if;
 if lower(vehicle.fuel_type::text) is null or (lower(vehicle.fuel_type::text)<>'flex' and lower(vehicle.fuel_type::text)<>item.fuel_code) or (lower(vehicle.fuel_type::text)='flex' and item.fuel_code not in ('gasolina','etanol')) then raise exception 'Combustível incompatível com o veículo'; end if;
 if not exists(select 1 from public.profiles where id=driver and tenant_id=actor.tenant_id and role='motorista' and driver_status='ativo' and not coalesce(access_blocked,false)) then raise exception 'Motorista ativo não encontrado'; end if;
 if not exists(select 1 from public.fuel_stations s where id=station and tenant_id=actor.tenant_id and is_active and (s.fuel_types is null or cardinality(s.fuel_types)=0 or exists(select 1 from unnest(s.fuel_types) f where lower(f)=item.fuel_code))) then raise exception 'Posto ativo compatível não encontrado'; end if;
 if exists(select 1 from public.fuelings where vehicle_id=vehicle.id and workflow_status='autorizado' and cancelled_at is null and (expires_at is null or expires_at>now())) then raise exception 'Veículo já possui autorização aberta'; end if;
 if length(coalesce(p_payload->>'note',''))>1000 then raise exception 'Observação muito longa'; end if;
 qty:=(p_payload->>'quantity')::numeric;expires:=(p_payload->>'expires_at')::timestamptz;
 perform sgf_private.reserve_procurement_fueling(p_request,item.id,(p_payload->>'allocation_id')::uuid,jsonb_build_object('vehicle_id',vehicle.id,'station_id',station,'fuel_type',fuel,'max_liters',qty,'expires_at',expires));
 update public.procurement_fuel_reservations set issuance_payload=p_payload where fueling_id=p_request returning * into reserved;
 -- Existing fiscal trigger still requires commitment coverage; it receives the reserved price.
 insert into public.fuelings(id,tenant_id,vehicle_id,driver_id,station_id,fuel_type,max_liters,liters,total_cost,price_per_liter,workflow_status,authorized_by,authorized_at,expires_at,authorization_note)
 values(p_request,actor.tenant_id,vehicle.id,driver,station,fuel,qty,0,null,reserved.unit_price,'autorizado',actor.id,now(),expires,nullif(trim(p_payload->>'note'),''));
 return p_request;
end $$;
revoke all on function sgf_private.issue_procurement_fueling(uuid,jsonb) from public,anon,authenticated;
grant execute on function sgf_private.issue_procurement_fueling(uuid,jsonb) to authenticated;
create function public.issue_procurement_fueling(p_request uuid,p_payload jsonb) returns uuid
language sql security invoker set search_path='' as $$select sgf_private.issue_procurement_fueling(p_request,p_payload)$$;
revoke all on function public.issue_procurement_fueling(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.issue_procurement_fueling(uuid,jsonb) to authenticated;

create function sgf_private.complete_procurement_fueling(p_fueling uuid,p_liters numeric,p_odometer integer,p_receipt text,p_photo text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; f public.fuelings; r public.procurement_fuel_reservations; vehicle public.vehicles; result jsonb;
begin
 if not sgf_private.current_session_allowed() then raise exception 'Sessão inválida ou revogada' using errcode='42501'; end if;
 select * into actor from public.profiles where id=auth.uid();
 if actor.role is distinct from 'posto' then raise exception 'Acesso restrito ao posto' using errcode='42501'; end if;
 if not exists(select 1 from public.procurement_fuel_reservations where fueling_id=p_fueling) then
 select to_jsonb(x) into result from public.partner_complete_fueling_v2(p_fueling,p_liters,p_odometer,p_receipt,p_photo) x;
 return result;
 end if;
 select * into f from public.fuelings where id=p_fueling and tenant_id=actor.tenant_id and station_id=actor.station_id for update;
 if not found then raise exception 'Autorização não encontrada para este posto'; end if;
 select * into r from public.procurement_fuel_reservations where fueling_id=p_fueling;
 if f.filled_at is not null then
 if f.filled_by=actor.id and f.liters=p_liters and f.odometer=p_odometer and f.pump_receipt_number=trim(p_receipt) then return jsonb_build_object('fueling_id',f.id,'total_cost',f.total_cost,'price_per_liter',f.price_per_liter); end if;
 raise exception 'Abastecimento já concluído com outros dados';
 end if;
 if f.workflow_status<>'autorizado' or f.cancelled_at is not null or r.state<>'reserved' then raise exception 'Autorização não está aberta'; end if;
 if not exists(select 1 from public.fuel_stations where id=actor.station_id and tenant_id=actor.tenant_id and is_active) then raise exception 'Posto inativo'; end if;
 if p_odometer is null or p_odometer<=0 then raise exception 'Hodômetro inválido'; end if;
 if coalesce(length(trim(p_receipt)),0) not between 1 and 100 then raise exception 'Informe o número do cupom'; end if;
 -- Accept only a stored object path, scoped to this exact authorization.
 if p_photo is null or p_photo not like 'tenant/'||actor.tenant_id||'/stations/'||actor.station_id||'/fuelings/'||f.id||'/%' or p_photo like '%..%' then raise exception 'Foto não pertence à autorização'; end if;
 if not exists(select 1 from storage.objects where bucket_id='fotos' and name=p_photo) then raise exception 'Foto não encontrada no armazenamento'; end if;
 select * into vehicle from public.vehicles where id=f.vehicle_id;
 if p_liters is null or p_liters<=0 or p_liters>vehicle.tank_capacity then raise exception 'Litros inválidos para o tanque'; end if;
 update public.fuelings set liters=p_liters,odometer=p_odometer,price_per_liter=r.unit_price,total_cost=round(p_liters*r.unit_price,2),pump_receipt_number=trim(p_receipt),photo_pump_url=p_photo,filled_by=actor.id,filled_at=now(),workflow_status='concluido',has_anomaly=p_odometer<coalesce(vehicle.current_odometer,0),anomaly_type=case when p_odometer<coalesce(vehicle.current_odometer,0) then 'Hodômetro inferior ao registrado' end where id=f.id returning * into f;
 return jsonb_build_object('fueling_id',f.id,'total_cost',f.total_cost,'price_per_liter',f.price_per_liter);
end $$;
revoke all on function sgf_private.complete_procurement_fueling(uuid,numeric,integer,text,text) from public,anon,authenticated;
grant execute on function sgf_private.complete_procurement_fueling(uuid,numeric,integer,text,text) to authenticated;
create function public.complete_procurement_fueling(p_fueling uuid,p_liters numeric,p_odometer integer,p_receipt text,p_photo text) returns jsonb
language sql security invoker set search_path='' as $$select sgf_private.complete_procurement_fueling(p_fueling,p_liters,p_odometer,p_receipt,p_photo)$$;
revoke all on function public.complete_procurement_fueling(uuid,numeric,integer,text,text) from public,anon,authenticated;
grant execute on function public.complete_procurement_fueling(uuid,numeric,integer,text,text) to authenticated;

-- Serialize commitment checks for both old and new operations before supplier row locks.
create function sgf_private.fuel_commitment_mutex() returns trigger
language plpgsql security definer set search_path='' as $$begin perform 1 from public.tenants where id=new.tenant_id for update; return new; end$$;
revoke all on function sgf_private.fuel_commitment_mutex() from public,anon,authenticated;
create trigger a0_fuel_commitment_mutex before insert on public.fuelings for each row execute function sgf_private.fuel_commitment_mutex();
create trigger a0_station_commitment_mutex before insert on public.station_operations for each row execute function sgf_private.fuel_commitment_mutex();

-- Preserve supplier-wide fiscal usage, but remove new contract consumption from the old global ceiling.
create or replace function public.station_contract_committed(p_station_id uuid) returns numeric
language sql stable security definer set search_path='' as $$
 select greatest(coalesce((select consumed_value from public.station_contract_usage(p_station_id)),0)
 - (select coalesce(sum(case when f.workflow_status='autorizado' and f.cancelled_at is null and (f.expires_at is null or f.expires_at>now()) then round(f.max_liters*r.unit_price,2) when f.filled_at is not null and f.workflow_status in ('concluido','validado','lancado_direto','rejeitado_admin') then coalesce(f.total_cost,0) else 0 end),0)
 from public.procurement_fuel_reservations r join public.fuelings f on f.id=r.fueling_id where r.station_id=p_station_id),0)
$$;
revoke all on function public.station_contract_committed(uuid) from public,anon,authenticated;

do $$declare body text; replacement text;
begin
 body:=pg_get_functiondef('public.enforce_station_contract_budget()'::regprocedure);
 replacement:=replace(body,'if new.station_id is null', 'if exists(select 1 from public.procurement_fuel_reservations where fueling_id=new.id) then return new; end if; if new.station_id is null');
 if replacement=body then raise exception 'Verifique a versão do controle global do posto'; end if;
 execute replacement;
end $$;
-- Public pending-authorizations wrapper retains its existing security gate.
do $$declare signature regprocedure; body text; replacement text;
begin
 signature:=to_regprocedure('sgf_private.rpc_original__get_station_pending_authorizations()');
 if signature is null then signature:='public.get_station_pending_authorizations()'::regprocedure; end if;
 body:=pg_get_functiondef(signature);
 replacement:=regexp_replace(body, 'f\.authorization_note,\s*\(', 'f.authorization_note, coalesce(f.price_per_liter,(');
 replacement:=regexp_replace(replacement, 'limit 1\s*\)', 'limit 1))');
 if replacement=body or strpos(replacement,'coalesce(f.price_per_liter,(')=0 then raise exception 'Verifique a versão da consulta de autorizações'; end if;
 execute replacement;
end $$;
alter function sgf_private.resource_modules(text,boolean) rename to resource_modules_before_procurement_workflow;
create function sgf_private.resource_modules(p_resource text,p_write boolean) returns text[]
language sql immutable set search_path='' as $$select case when p_resource='issue_procurement_fueling' then array['procurement','budgets','refuelings'] when p_resource='complete_procurement_fueling' then array['refuelings','stations'] else sgf_private.resource_modules_before_procurement_workflow(p_resource,p_write) end$$;
revoke all on function sgf_private.resource_modules(text,boolean) from public,anon,authenticated;
notify pgrst,'reload schema';

-- Old clients must take the same protected completion path for bound records.
alter function public.partner_complete_fueling_v2(uuid,numeric,integer,text,text) set schema sgf_private;
alter function sgf_private.partner_complete_fueling_v2(uuid,numeric,integer,text,text) rename to complete_fueling_v2_before_procurement;
revoke all on function sgf_private.complete_fueling_v2_before_procurement(uuid,numeric,integer,text,text) from public,anon,authenticated;
create function sgf_private.complete_fueling_router(p_fueling_id uuid,p_liters numeric,p_odometer integer,p_receipt_no text,p_photo_url text)
returns table(fueling_id uuid,total_cost numeric,price_per_liter numeric)
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if exists(select 1 from public.procurement_fuel_reservations where procurement_fuel_reservations.fueling_id=p_fueling_id) then
 result:=sgf_private.complete_procurement_fueling(p_fueling_id,p_liters,p_odometer,p_receipt_no,p_photo_url);
 return query select (result->>'fueling_id')::uuid,(result->>'total_cost')::numeric,(result->>'price_per_liter')::numeric;
 else
 return query select * from sgf_private.complete_fueling_v2_before_procurement(p_fueling_id,p_liters,p_odometer,p_receipt_no,p_photo_url);
 end if;
end $$;
revoke all on function sgf_private.complete_fueling_router(uuid,numeric,integer,text,text) from public,anon,authenticated;
grant execute on function sgf_private.complete_fueling_router(uuid,numeric,integer,text,text) to authenticated;
create function public.partner_complete_fueling_v2(p_fueling_id uuid,p_liters numeric,p_odometer integer,p_receipt_no text,p_photo_url text)
returns table(fueling_id uuid,total_cost numeric,price_per_liter numeric)
language sql security invoker set search_path='' as $$select * from sgf_private.complete_fueling_router(p_fueling_id,p_liters,p_odometer,p_receipt_no,p_photo_url)$$;
revoke all on function public.partner_complete_fueling_v2(uuid,numeric,integer,text,text) from public,anon,authenticated;
grant execute on function public.partner_complete_fueling_v2(uuid,numeric,integer,text,text) to authenticated;

create function sgf_private.station_authorizations_with_contracts() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not sgf_private.current_session_allowed() or not exists(select 1 from public.profiles where id=auth.uid() and role='posto') then raise exception 'Acesso restrito ao posto' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('contract_managed',exists(select 1 from public.procurement_fuel_reservations r where r.fueling_id=x.fueling_id))),'[]'::jsonb) from public.get_station_pending_authorizations() x);
end $$;
revoke all on function sgf_private.station_authorizations_with_contracts() from public,anon,authenticated;
grant execute on function sgf_private.station_authorizations_with_contracts() to authenticated;
create function public.get_station_authorizations_with_contracts() returns jsonb
language sql stable security invoker set search_path='' as $$select sgf_private.station_authorizations_with_contracts()$$;
revoke all on function public.get_station_authorizations_with_contracts() from public,anon,authenticated;
grant execute on function public.get_station_authorizations_with_contracts() to authenticated;
notify pgrst,'reload schema';
