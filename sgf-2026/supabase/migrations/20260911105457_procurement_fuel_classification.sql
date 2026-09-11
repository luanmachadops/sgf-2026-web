-- Explicit fuel identity, never inferred from description.
alter table public.procurement_items add column fuel_code text check(fuel_code in ('diesel','gasolina','etanol'));
alter function sgf_private.procurement_item_save(jsonb) rename to procurement_item_save_before_fuel_code;
revoke all on function sgf_private.procurement_item_save_before_fuel_code(jsonb) from public,anon,authenticated;
create function sgf_private.procurement_item_save(p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_code text; v_item public.procurement_items;
begin
 v_id:=sgf_private.procurement_item_save_before_fuel_code(p_payload-'fuel_code');
 select * into v_item from public.procurement_items where id=v_id;
 v_code:=nullif(p_payload->>'fuel_code','');
 if v_item.category='fuel' and (v_code is null or v_code not in ('diesel','gasolina','etanol')) then raise exception 'Classifique o combustível do item'; end if;
 if v_item.category<>'fuel' and v_code is not null then raise exception 'Classificação de combustível exclusiva para itens de combustível'; end if;
 if v_item.origin_item_id is not null and (select fuel_code from public.procurement_items where id=v_item.origin_item_id) is distinct from v_code then raise exception 'Combustível diferente do item da ata'; end if;
 if exists(select 1 from public.procurement_items where origin_item_id=v_id and fuel_code is not null and fuel_code is distinct from v_code) then raise exception 'Combustível diverge dos contratos derivados'; end if;
 if v_item.fuel_code is distinct from v_code and exists(select 1 from public.procurement_fuel_reservations where item_id=v_id) then raise exception 'Combustível possui histórico de reservas'; end if;
 update public.procurement_items set fuel_code=v_code where id=v_id;
 -- Amend the event written by the base operation within this same transaction.
 update public.procurement_registry_events set after_value=after_value||jsonb_build_object('fuel_code',v_code)
 where id=(select max(id) from public.procurement_registry_events where record_id=v_id and kind='item');
 return v_id;
end $$;
revoke all on function sgf_private.procurement_item_save(jsonb) from public,anon,authenticated;
grant execute on function sgf_private.procurement_item_save(jsonb) to authenticated;
alter function sgf_private.reserve_procurement_fueling(uuid,uuid,uuid,jsonb) rename to reserve_procurement_fueling_before_classification;
create function sgf_private.reserve_procurement_fueling(p_fueling uuid,p_item uuid,p_allocation uuid,p_row jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform sgf_private.reserve_procurement_fueling_before_classification(p_fueling,p_item,p_allocation,p_row);
 if (select fuel_code from public.procurement_items where id=p_item) is distinct from lower(p_row->>'fuel_type') then raise exception 'Combustível da autorização diferente da classificação do item'; end if;
end $$;
revoke all on function sgf_private.reserve_procurement_fueling(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
