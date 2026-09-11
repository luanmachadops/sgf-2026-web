-- Stage 3: draft awarded items, lot grouping and append-only price conditions.
-- Quantities on derived contracts are allocations from the source ata, not operational consumption.
create table public.procurement_items (
 id uuid primary key default gen_random_uuid(),
 instrument_id uuid not null references public.procurement_instruments(id),
 reference text not null check(length(trim(reference)) between 1 and 100),
 lot_reference text not null default '' check(length(lot_reference)<=100),
 description text not null check(length(trim(description)) between 3 and 2000),
 category text not null check(category in ('fuel','arla','lubricant','parts','labor','tires','tire_service','other')),
 unit text not null check(unit in ('L','UN','H','KM','KG','SERV')),
 quantity numeric(16,3) not null check(quantity>0 and quantity<>'NaN'::numeric),
 partner_kind text not null check(partner_kind in ('posto','oficina')), partner_id uuid not null,
 origin_item_id uuid references public.procurement_items(id),
 version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(instrument_id,partner_kind,partner_id) references public.procurement_instrument_partners(instrument_id,partner_kind,partner_id) deferrable initially deferred,
 check(origin_item_id is null or origin_item_id<>id)
);
create unique index procurement_item_reference on public.procurement_items(instrument_id,lower(trim(reference)));
create index procurement_item_partner on public.procurement_items(instrument_id,partner_kind,partner_id);
create index procurement_item_origin on public.procurement_items(origin_item_id);
create table public.procurement_item_prices (
 id uuid primary key default gen_random_uuid(), item_id uuid not null references public.procurement_items(id),
 effective_on date not null check(isfinite(effective_on)),
 pricing_mode text not null check(pricing_mode in ('unit','discount')),
 unit_price numeric(16,6), discount_percent numeric(7,4), table_reference text,
 document_reference text not null check(length(trim(document_reference)) between 3 and 500),
 revision integer not null, created_at timestamptz not null default now(),
 check((pricing_mode='unit' and unit_price>=0 and unit_price<>'NaN'::numeric and unit_price is not null and discount_percent is null and table_reference is null)
 or (pricing_mode='discount' and unit_price is null and discount_percent between 0 and 100 and discount_percent is not null and length(trim(table_reference)) between 3 and 500 and table_reference is not null)),
 unique(item_id,revision)
);
create index procurement_price_effective on public.procurement_item_prices(item_id,effective_on desc,revision desc);
alter table public.procurement_items enable row level security;
alter table public.procurement_item_prices enable row level security;
revoke all on public.procurement_items,public.procurement_item_prices from public,anon,authenticated;

-- Keep the stage 2 editing endpoint from invalidating established item associations or dates.
create function sgf_private.procurement_instrument_items_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.origin_ata_id is distinct from old.origin_ata_id and exists(select 1 from public.procurement_items where instrument_id=old.id) then
 raise exception 'Ata de origem não pode mudar enquanto houver itens vinculados'; end if;
 if exists(select 1 from public.procurement_items i join public.procurement_item_prices c on c.item_id=i.id
 where i.instrument_id=old.id and (c.effective_on<new.starts_on or c.effective_on>new.ends_on)) then
 raise exception 'Vigência excluiria uma condição de preço registrada'; end if;
 return new;
end $$;
revoke all on function sgf_private.procurement_instrument_items_guard() from public,anon,authenticated;
create trigger procurement_instrument_items_guard before update on public.procurement_instruments
for each row execute function sgf_private.procurement_instrument_items_guard();

create function sgf_private.procurement_items_read(p_instrument uuid,p_offset integer,p_search text,p_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; result jsonb;
begin
 p:=sgf_private.procurement_actor();
 if p_offset is null or p_offset<0 or p_offset>100000 or p_search is null or length(p_search)>100 or p_date is null or not isfinite(p_date) then raise exception 'Filtro inválido'; end if;
 select jsonb_build_object('total',count(*),'items',coalesce((select jsonb_agg(to_jsonb(x)) from (
 select i.*,coalesce(s.name,w.name,'Fornecedor indisponível') partner_name,
 (select to_jsonb(c) from public.procurement_item_prices c where c.item_id=i.id and c.effective_on<=p_date and p_date between ins.starts_on and ins.ends_on order by c.effective_on desc,c.revision desc limit 1) price
 from public.procurement_items i join public.procurement_instruments ins on ins.id=i.instrument_id
 left join public.fuel_stations s on i.partner_kind='posto' and s.id=i.partner_id and s.tenant_id=p.tenant_id
 left join public.repair_shops w on i.partner_kind='oficina' and w.id=i.partner_id and w.tenant_id=p.tenant_id
 where ins.tenant_id=p.tenant_id and i.instrument_id=p_instrument
 and concat_ws(' ',i.reference,i.lot_reference,i.description) ilike '%'||p_search||'%'
 order by i.lot_reference,i.reference,i.id limit 20 offset p_offset) x),'[]'::jsonb)) into result
 from public.procurement_items i join public.procurement_instruments ins on ins.id=i.instrument_id
 where ins.tenant_id=p.tenant_id and i.instrument_id=p_instrument and concat_ws(' ',i.reference,i.lot_reference,i.description) ilike '%'||p_search||'%';
 return result;
end $$;
create function sgf_private.procurement_prices_read(p_item uuid,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; result jsonb;
begin
 p:=sgf_private.procurement_actor();
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Página inválida'; end if;
 if not exists(select 1 from public.procurement_items i join public.procurement_instruments ins on ins.id=i.instrument_id where i.id=p_item and ins.tenant_id=p.tenant_id) then raise exception 'Item não encontrado'; end if;
 select jsonb_build_object('total',count(*),'items',coalesce((select jsonb_agg(to_jsonb(x)) from (
 select * from public.procurement_item_prices where item_id=p_item order by effective_on desc,revision desc limit 20 offset p_offset) x),'[]'::jsonb)) into result
 from public.procurement_item_prices where item_id=p_item;
 return result;
end $$;

create function sgf_private.procurement_item_save(p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.profiles; ins public.procurement_instruments; old_item public.procurement_items; source public.procurement_items;
 v_id uuid; v_origin uuid; v_quantity numeric; v_partner uuid; v_kind text; v_before jsonb; v_after jsonb; v_reason text;
begin
 p:=sgf_private.procurement_actor();
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Item inválido'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('id','version','instrument_id','reference','lot_reference','description','category','unit','quantity','partner_kind','partner_id','origin_item_id','reason')) then raise exception 'Campo não permitido'; end if;
 v_reason:=trim(p_payload->>'reason');
 if coalesce(length(v_reason),0) not between 3 and 1000 then raise exception 'Informe a justificativa'; end if;
 select * into ins from public.procurement_instruments where id=(p_payload->>'instrument_id')::uuid and tenant_id=p.tenant_id;
 if not found then raise exception 'Instrumento não encontrado'; end if;
 -- Same lock order as the registry writer; serializes source and derived quantity edits.
 perform 1 from public.procurement_processes where id=ins.process_id for update;
 select * into ins from public.procurement_instruments where id=ins.id for update;
 if ins.status<>'draft' then raise exception 'Instrumento não está em rascunho'; end if;
 v_id:=coalesce((p_payload->>'id')::uuid,gen_random_uuid());
 v_origin:=(p_payload->>'origin_item_id')::uuid; v_quantity:=(p_payload->>'quantity')::numeric;
 v_partner:=(p_payload->>'partner_id')::uuid; v_kind:=p_payload->>'partner_kind';
 if not exists(select 1 from public.procurement_instrument_partners where instrument_id=ins.id and partner_id=v_partner and partner_kind=v_kind) then raise exception 'Fornecedor não vinculado ao instrumento'; end if;
 if ins.origin_ata_id is not null then
 select * into source from public.procurement_items where id=v_origin and instrument_id=ins.origin_ata_id;
 if not found or source.partner_id<>v_partner or source.partner_kind is distinct from v_kind or source.unit is distinct from p_payload->>'unit' or source.category is distinct from p_payload->>'category' then raise exception 'Item de origem incompatível com a ata, fornecedor, unidade ou categoria'; end if;
 if v_quantity+(select coalesce(sum(quantity),0) from public.procurement_items where origin_item_id=v_origin and id<>v_id)>source.quantity then raise exception 'Quantidade excede o disponível para contratos derivados da ata'; end if;
 elsif v_origin is not null then raise exception 'Este instrumento não possui ata de origem'; end if;
 if p_payload->>'id' is not null then
 select * into old_item from public.procurement_items where id=v_id and instrument_id=ins.id for update;
 if not found then raise exception 'Item não encontrado'; end if;
 if p_payload->>'version' is null or old_item.version<>(p_payload->>'version')::int then raise exception 'Registro foi alterado; recarregue antes de salvar'; end if;
 if old_item.origin_item_id is distinct from v_origin then raise exception 'Item de origem não pode ser trocado'; end if;
 if exists(select 1 from public.procurement_item_prices where item_id=v_id) or exists(select 1 from public.procurement_items where origin_item_id=v_id) then
 if old_item.partner_id<>v_partner or old_item.partner_kind is distinct from v_kind or old_item.unit is distinct from p_payload->>'unit' or old_item.category is distinct from p_payload->>'category' then raise exception 'Fornecedor, unidade e categoria possuem histórico e não podem ser trocados'; end if;
 end if;
 if v_quantity<(select coalesce(sum(quantity),0) from public.procurement_items where origin_item_id=v_id) then raise exception 'Quantidade inferior à distribuída em contratos derivados'; end if;
 v_before:=to_jsonb(old_item);
 end if;
 insert into public.procurement_items(id,instrument_id,reference,lot_reference,description,category,unit,quantity,partner_kind,partner_id,origin_item_id)
 values(v_id,ins.id,trim(p_payload->>'reference'),trim(coalesce(p_payload->>'lot_reference','')),trim(p_payload->>'description'),p_payload->>'category',p_payload->>'unit',v_quantity,v_kind,v_partner,v_origin)
 on conflict(id) do update set reference=excluded.reference,lot_reference=excluded.lot_reference,description=excluded.description,category=excluded.category,
 unit=excluded.unit,quantity=excluded.quantity,partner_kind=excluded.partner_kind,partner_id=excluded.partner_id,version=procurement_items.version+1,updated_at=now();
 select to_jsonb(i) into v_after from public.procurement_items i where id=v_id;
 insert into public.procurement_registry_events(tenant_id,process_id,record_id,kind,actor_id,actor_name,reason,before_value,after_value)
 values(p.tenant_id,ins.process_id,v_id,'item',p.id,coalesce(nullif(trim(p.full_name),''),'Gestor'),v_reason,v_before,v_after);
 return v_id;
end $$;

create function sgf_private.procurement_price_save(p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.profiles; ins public.procurement_instruments; item public.procurement_items; v_id uuid; v_date date; v_reason text; v_after jsonb;
begin
 p:=sgf_private.procurement_actor();
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Condição inválida'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('item_id','version','effective_on','pricing_mode','unit_price','discount_percent','table_reference','document_reference','reason')) then raise exception 'Campo não permitido'; end if;
 v_reason:=trim(p_payload->>'reason');
 if coalesce(length(v_reason),0) not between 3 and 1000 then raise exception 'Informe a justificativa'; end if;
 select a.* into ins from public.procurement_instruments a join public.procurement_items i on i.instrument_id=a.id where i.id=(p_payload->>'item_id')::uuid and a.tenant_id=p.tenant_id;
 if not found then raise exception 'Item não encontrado'; end if;
 perform 1 from public.procurement_processes where id=ins.process_id for update;
 select * into ins from public.procurement_instruments where id=ins.id for update;
 select * into item from public.procurement_items where id=(p_payload->>'item_id')::uuid for update;
 if ins.status<>'draft' then raise exception 'Instrumento não está em rascunho'; end if;
 if p_payload->>'version' is null or item.version<>(p_payload->>'version')::int then raise exception 'Registro foi alterado; recarregue antes de salvar'; end if;
 v_date:=(p_payload->>'effective_on')::date;
 if v_date is null or not isfinite(v_date) or v_date<ins.starts_on or v_date>ins.ends_on then raise exception 'Data de efeito deve estar dentro da vigência'; end if;
 insert into public.procurement_item_prices(item_id,effective_on,pricing_mode,unit_price,discount_percent,table_reference,document_reference,revision)
 values(item.id,v_date,p_payload->>'pricing_mode',(p_payload->>'unit_price')::numeric,(p_payload->>'discount_percent')::numeric,
 nullif(trim(p_payload->>'table_reference'),''),trim(p_payload->>'document_reference'),item.version+1) returning id into v_id;
 update public.procurement_items set version=version+1,updated_at=now() where id=item.id;
 select to_jsonb(c)||jsonb_build_object('reference',item.reference,'version',item.version+1) into v_after from public.procurement_item_prices c where id=v_id;
 insert into public.procurement_registry_events(tenant_id,process_id,record_id,kind,actor_id,actor_name,reason,before_value,after_value)
 values(p.tenant_id,ins.process_id,v_id,'price',p.id,coalesce(nullif(trim(p.full_name),''),'Gestor'),v_reason,null,v_after);
 return v_id;
end $$;

create function public.get_procurement_items(p_instrument uuid,p_offset integer default 0,p_search text default '',p_date date default current_date) returns jsonb
language sql stable security invoker set search_path='' as $$select sgf_private.procurement_items_read(p_instrument,p_offset,p_search,p_date)$$;
create function public.get_procurement_prices(p_item uuid,p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path='' as $$select sgf_private.procurement_prices_read(p_item,p_offset)$$;
create function public.save_procurement_item(p_payload jsonb) returns uuid
language sql security invoker set search_path='' as $$select sgf_private.procurement_item_save(p_payload)$$;
create function public.save_procurement_price(p_payload jsonb) returns uuid
language sql security invoker set search_path='' as $$select sgf_private.procurement_price_save(p_payload)$$;
alter function sgf_private.resource_modules(text,boolean) rename to resource_modules_before_procurement_items;
create function sgf_private.resource_modules(p_resource text,p_write boolean) returns text[]
language sql immutable set search_path='' as $$select case when p_resource in ('get_procurement_items','get_procurement_prices','save_procurement_item','save_procurement_price') then array['procurement'] else sgf_private.resource_modules_before_procurement_items(p_resource,p_write) end$$;
revoke all on function sgf_private.resource_modules(text,boolean) from public,anon,authenticated;
do $$ declare f record; begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='sgf_private' and p.proname in ('procurement_items_read','procurement_prices_read','procurement_item_save','procurement_price_save'))
 or (n.nspname='public' and p.proname in ('get_procurement_items','get_procurement_prices','save_procurement_item','save_procurement_price')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 execute format('grant execute on function %s to authenticated',f.sig);
 end loop;
end $$;
notify pgrst,'reload schema';
