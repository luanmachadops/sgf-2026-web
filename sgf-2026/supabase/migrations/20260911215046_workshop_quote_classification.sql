-- 5D1: explicit quote units/categories; old quotes remain unclassified.
alter table public.service_order_quote_items
 add column unit text,
 add column category text,
 alter column unit_price type numeric(16,6),
 add constraint quote_item_classification check (
  (unit is null and category is null) or
  (unit is not null and category is not null and unit in ('L','UN','H','KM','KG','SERV') and
   ((kind='peca' and category in ('parts','tires','lubricant','arla','other')) or
    (kind='mao_de_obra' and category in ('labor','tire_service','other'))))
 );

create function sgf_private.submit_classified_workshop_quote(
  p_order_id uuid,
  p_items jsonb,
  p_valid_until date default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  so record;
  v_quote_id uuid;
  v_version integer;
  v_total numeric := 0;
  it jsonb;
  qty numeric; price numeric;
begin
  if not sgf_private.current_session_allowed() then raise exception 'Sessão inválida ou revogada' using errcode='42501'; end if;
  select * into ctx from public.partner_context();
  if ctx.kind is distinct from 'oficina' then raise exception 'Somente oficinas'; end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Orçamento sem itens'; end if;
  if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Informe entre 1 e 100 itens'; end if;
  if p_valid_until is null or not isfinite(p_valid_until) or p_valid_until < (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Informe uma validade vigente'; end if;
  if length(coalesce(p_note,''))>2000 then raise exception 'Observação muito longa'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(it) is distinct from 'object' then raise exception 'Item inválido'; end if;
    if exists(select 1 from jsonb_object_keys(it) k where k not in ('kind','description','qty','unit_price','unit','category')) then raise exception 'Campo de item não permitido'; end if;
    if coalesce(it->>'kind','') not in ('peca','mao_de_obra') then raise exception 'Tipo de item inválido'; end if;
    if coalesce(length(trim(it->>'description')),0) not between 1 and 500 then raise exception 'Confira a descrição do item'; end if;
    if coalesce(it->>'unit','') not in ('L','UN','H','KM','KG','SERV') then raise exception 'Informe a unidade do item'; end if;
    if (it->>'kind'='peca' and coalesce(it->>'category','') not in ('parts','tires','lubricant','arla','other')) or (it->>'kind'='mao_de_obra' and coalesce(it->>'category','') not in ('labor','tire_service','other')) then raise exception 'Categoria incompatível com o tipo de item'; end if;
    qty:=(it->>'qty')::numeric; price:=(it->>'unit_price')::numeric;
    if qty is null or qty<=0 or qty>100000 or qty in ('NaN'::numeric,'Infinity'::numeric) or qty<>round(qty,2) then raise exception 'Quantidade inválida; use até duas casas decimais'; end if;
    if price is null or price<0 or price>100000000 or price in ('NaN'::numeric,'Infinity'::numeric) or price<>round(price,6) then raise exception 'Preço inválido; use até seis casas decimais'; end if;
  end loop;

  select * into so
    from public.service_orders
   where id = p_order_id
     and tenant_id = ctx.tenant_id
     and repair_shop_id = ctx.partner_id
   for update;

  if so.id is null then raise exception 'OS não encontrada para esta oficina'; end if;
  if so.operational_status not in ('at_shop', 'awaiting_quote_approval') then
    raise exception 'O veículo precisa estar na oficina para receber orçamento'; end if;
  if so.financial_status <> 'not_started' then
    raise exception 'O orçamento desta OS já foi aprovado'; end if;

  select coalesce(max(version), 0) + 1 into v_version
    from public.service_order_quotes
   where service_order_id = p_order_id;

  update public.service_order_quotes
     set status = 'substituido'
   where service_order_id = p_order_id
     and status = 'enviado';

  insert into public.service_order_quotes (
    tenant_id, service_order_id, repair_shop_id, version, valid_until, note
  )
  values (
    ctx.tenant_id, p_order_id, ctx.partner_id, v_version, p_valid_until, p_note
  )
  returning id into v_quote_id;

  for it in select * from jsonb_array_elements(p_items) loop
    if (it->>'kind') not in ('peca', 'mao_de_obra') then
      raise exception 'Tipo de item inválido';
    end if;
    insert into public.service_order_quote_items (
      quote_id, kind, description, qty, unit_price, unit, category
    )
    values (
      v_quote_id,
      it->>'kind',
      trim(it->>'description'),
      (it->>'qty')::numeric,
      (it->>'unit_price')::numeric,
      it->>'unit',
      it->>'category'
    );
    v_total := v_total + (it->>'qty')::numeric * (it->>'unit_price')::numeric;
  end loop;

  update public.service_order_quotes
     set total = round(v_total, 2)
   where id = v_quote_id;
  update public.service_orders
     set operational_status = 'awaiting_quote_approval'
   where id = p_order_id;

  insert into public.service_order_events (
    tenant_id, service_order_id, from_state, to_state,
    actor_id, actor_role, note
  )
  values (
    ctx.tenant_id, p_order_id, so.operational_status::text, 'awaiting_quote_approval',
    ctx.profile_id, 'oficina',
    format('Orçamento v%s enviado: R$ %s', v_version, round(v_total, 2))
  );

  return v_quote_id;
end
$$;

revoke all on function sgf_private.submit_classified_workshop_quote(uuid,jsonb,date,text) from public,anon,authenticated;
grant execute on function sgf_private.submit_classified_workshop_quote(uuid,jsonb,date,text) to authenticated;
create function public.repair_shop_submit_quote_v3(p_order_id uuid,p_items jsonb,p_valid_until date default null,p_note text default null)
returns uuid language sql security invoker set search_path='' as $$select sgf_private.submit_classified_workshop_quote(p_order_id,p_items,p_valid_until,p_note)$$;
revoke all on function public.repair_shop_submit_quote_v3(uuid,jsonb,date,text) from public,anon,authenticated;
grant execute on function public.repair_shop_submit_quote_v3(uuid,jsonb,date,text) to authenticated;

create function sgf_private.preserve_quote_classification() returns trigger
language plpgsql set search_path='' as $$begin
 if (new.unit,new.category) is distinct from (old.unit,old.category) then raise exception 'Envie uma nova versão do orçamento para alterar unidade ou categoria'; end if;
 return new;
end $$;
revoke all on function sgf_private.preserve_quote_classification() from public,anon,authenticated;
create trigger preserve_quote_classification before update on public.service_order_quote_items for each row execute function sgf_private.preserve_quote_classification();
alter function sgf_private.resource_modules(text,boolean) rename to resource_modules_before_quote_classification;
create function sgf_private.resource_modules(p_resource text,p_write boolean) returns text[]
language sql immutable set search_path='' as $$select case when p_resource='repair_shop_submit_quote_v3' then array['maintenances','repair_shops'] else sgf_private.resource_modules_before_quote_classification(p_resource,p_write) end$$;
revoke all on function sgf_private.resource_modules(text,boolean) from public,anon,authenticated;
notify pgrst,'reload schema';
