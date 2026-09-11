-- Stage 5a: read-only preflight against draft planning, never an authorization/reservation.
create function sgf_private.procurement_preflight(p_payload jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 actor public.profiles; item public.procurement_items; instrument public.procurement_instruments;
 allocation public.instrument_budget_allocations; plan public.instrument_budget_plans;
 price public.procurement_item_prices; operation_date date; quantity numeric; base_price numeric;
 unit_price numeric; estimated numeric; issues text[]:='{}';
begin
 actor:=sgf_private.procurement_actor();
 if not coalesce('budgets'=any(actor.allowed_modules),false) then raise exception 'Sem permissão para consultar limites' using errcode='42501'; end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Simulação inválida'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('item_id','allocation_id','operation_date','quantity','base_price','table_reference')) then raise exception 'Campo não permitido'; end if;
 select i.* into item from public.procurement_items i join public.procurement_instruments ins on ins.id=i.instrument_id where i.id=(p_payload->>'item_id')::uuid and ins.tenant_id=actor.tenant_id;
 if not found then raise exception 'Item não encontrado'; end if;
 select * into instrument from public.procurement_instruments where id=item.instrument_id;
 select a.* into allocation from public.instrument_budget_allocations a join public.instrument_budget_plans b on b.id=a.plan_id where a.id=(p_payload->>'allocation_id')::uuid and b.instrument_id=instrument.id;
 if not found then raise exception 'Dotação não pertence ao instrumento'; end if;
 select * into plan from public.instrument_budget_plans where id=allocation.plan_id;
 operation_date:=(p_payload->>'operation_date')::date; quantity:=(p_payload->>'quantity')::numeric;
 if operation_date is null or not isfinite(operation_date) then raise exception 'Data inválida'; end if;
 if quantity is null or quantity<=0 or quantity in ('NaN'::numeric,'Infinity'::numeric) or quantity<>round(quantity,3) then raise exception 'Quantidade inválida; use até três casas decimais'; end if;
 if instrument.kind<>'contract' then issues:=array_append(issues,'Selecione um contrato; a ata é origem da distribuição.'); end if;
 if operation_date not between instrument.starts_on and instrument.ends_on then issues:=array_append(issues,'Data fora da vigência do instrumento.'); end if;
 if extract(year from operation_date)<>plan.fiscal_year then issues:=array_append(issues,'Data fora do exercício da dotação.'); end if;
 if allocation.category<>item.category then issues:=array_append(issues,'Categoria do item diferente da dotação.'); end if;
 if quantity>item.quantity then issues:=array_append(issues,'Quantidade superior à quantidade cadastrada no item.'); end if;
 select * into price from public.procurement_item_prices where item_id=item.id and effective_on<=operation_date order by effective_on desc,revision desc limit 1;
 if not found then
 issues:=array_append(issues,'Nenhuma condição de preço aplicável à data.');
 elsif price.pricing_mode='unit' then
 if p_payload->>'base_price' is not null or p_payload->>'table_reference' is not null then raise exception 'Preço fixo não admite base de tabela'; end if;
 unit_price:=price.unit_price;
 else
 base_price:=(p_payload->>'base_price')::numeric;
 if base_price is null then
 issues:=array_append(issues,'Informe o preço-base da tabela para simular o desconto.');
 elsif base_price<0 or base_price in ('NaN'::numeric,'Infinity'::numeric) or base_price<>round(base_price,6) or base_price>9999999999.999999 then
 raise exception 'Preço-base inválido';
 elsif (p_payload->>'table_reference') is distinct from price.table_reference then
 issues:=array_append(issues,'A referência da tabela mudou; recarregue os itens.');
 else
 unit_price:=base_price*(1-price.discount_percent/100);
 end if;
 end if;
 -- Round only the extended total; do not prematurely round discounted unit values.
 if unit_price is not null then
 estimated:=round(quantity*unit_price,2);
 if estimated>allocation.spending_limit then issues:=array_append(issues,'Valor superior ao teto planejado desta dotação.'); end if;
 end if;
 return jsonb_build_object('planning_compatible',cardinality(issues)=0,'issues',to_jsonb(issues),'estimated_total',estimated,'calculated_unit_price',unit_price,
 'allocation_limit',allocation.spending_limit,'item_quantity',item.quantity,'unit',item.unit,'price_id',price.id,
 'price_revision',price.revision,'item_version',item.version,'plan_version',plan.version,'instrument_version',instrument.version,
 'operation_date',operation_date,'quantity',quantity,'reserved',false,'operational_balance_checked',false);
end $$;
revoke all on function sgf_private.procurement_preflight(jsonb) from public,anon,authenticated;
grant execute on function sgf_private.procurement_preflight(jsonb) to authenticated;
create function public.preview_procurement_operation(p_payload jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$select sgf_private.procurement_preflight(p_payload)$$;
revoke all on function public.preview_procurement_operation(jsonb) from public,anon,authenticated;
grant execute on function public.preview_procurement_operation(jsonb) to authenticated;
alter function sgf_private.resource_modules(text,boolean) rename to resource_modules_before_procurement_preflight;
create function sgf_private.resource_modules(p_resource text,p_write boolean) returns text[]
language sql immutable set search_path='' as $$select case when p_resource='preview_procurement_operation' then array['procurement','budgets'] else sgf_private.resource_modules_before_procurement_preflight(p_resource,p_write) end$$;
revoke all on function sgf_private.resource_modules(text,boolean) from public,anon,authenticated;
notify pgrst,'reload schema';
