-- Stage 2: independent draft register. No operational activation or legacy migration.
alter table public.profiles drop constraint profiles_allowed_modules_check;
alter table public.profiles add constraint profiles_allowed_modules_check check(allowed_modules <@ array[
'dashboard','map','notifications','fleet','drivers','trips','refuelings','stations','maintenances',
'repair_shops','checklists','infractions','departments','reports','settings','budgets','procurement']::text[]);
-- Existing users receive no additional permissions automatically.
alter function sgf_private.resource_modules(text,boolean) rename to resource_modules_before_procurement_registry;
create function sgf_private.resource_modules(p_resource text,p_write boolean) returns text[]
language sql immutable set search_path='' as $$
select case when p_resource in ('get_procurement_registry','save_procurement_registry','get_procurement_registry_events','get_procurement_registry_partners')
then array['procurement'] else sgf_private.resource_modules_before_procurement_registry(p_resource,p_write) end;
$$;
revoke all on function sgf_private.resource_modules(text,boolean) from public,anon,authenticated;

create table public.procurement_processes (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 reference text not null check(length(trim(reference)) between 1 and 100),
 year integer not null check(year between 1900 and 2200),
 object text not null check(length(trim(object)) between 3 and 3000),
 modality text not null check(length(trim(modality)) between 2 and 120),
 legal_basis text not null check(length(trim(legal_basis)) between 2 and 300),
 documents jsonb not null default '[]',
 status text not null default 'draft' check(status='draft'),
 version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,tenant_id)
);
create unique index procurement_process_reference on public.procurement_processes(tenant_id,year,lower(trim(reference)));
create table public.procurement_instruments (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 process_id uuid not null, kind text not null check(kind in ('ata','contract')),
 reference text not null check(length(trim(reference)) between 1 and 100), year integer not null check(year between 1900 and 2200),
 starts_on date not null check(isfinite(starts_on)), ends_on date not null check(isfinite(ends_on) and ends_on>=starts_on),
 declared_value numeric(14,2) check(declared_value>=0 and declared_value<>'NaN'::numeric),
 origin_ata_id uuid,
 documents jsonb not null default '[]', status text not null default 'draft' check(status='draft'),
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,tenant_id), foreign key(process_id,tenant_id) references public.procurement_processes(id,tenant_id),
 foreign key(origin_ata_id,tenant_id) references public.procurement_instruments(id,tenant_id),
 check(origin_ata_id is null or (kind='contract' and origin_ata_id<>id))
);
create unique index procurement_instrument_reference on public.procurement_instruments(tenant_id,kind,year,lower(trim(reference)));
create index procurement_instrument_process on public.procurement_instruments(process_id,tenant_id);
create index procurement_instrument_origin on public.procurement_instruments(origin_ata_id,tenant_id);
create table public.procurement_instrument_partners (
 instrument_id uuid not null references public.procurement_instruments(id),
 partner_kind text not null check(partner_kind in ('posto','oficina')), partner_id uuid not null,
 primary key(instrument_id,partner_kind,partner_id)
);
create index procurement_partner_lookup on public.procurement_instrument_partners(partner_kind,partner_id);
create table public.procurement_registry_events (
 id bigint generated always as identity primary key, tenant_id uuid not null references public.tenants(id),
 process_id uuid not null, record_id uuid not null, kind text not null,
 actor_id uuid not null references public.profiles(id), actor_name text not null, reason text not null,
 before_value jsonb, after_value jsonb not null, occurred_at timestamptz not null default now(),
 foreign key(process_id,tenant_id) references public.procurement_processes(id,tenant_id)
);
create index procurement_event_process on public.procurement_registry_events(tenant_id,process_id,id desc);
do $$ declare n text; begin
 foreach n in array array['procurement_processes','procurement_instruments','procurement_instrument_partners','procurement_registry_events'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on table public.%I from public,anon,authenticated',n);
 end loop;
end $$;
revoke all on sequence public.procurement_registry_events_id_seq from public,anon,authenticated;

create function sgf_private.procurement_actor() returns public.profiles
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles;
begin
 if auth.uid() is null or not sgf_private.current_session_allowed() then
 raise exception 'Sessão inválida ou revogada' using errcode='42501'; end if;
 select * into p from public.profiles where id=auth.uid();
 if p.role not in ('admin','gestor','superadmin') or not coalesce('procurement'=any(p.allowed_modules),false) then
 raise exception 'Sem permissão para gestão de licitações' using errcode='42501'; end if;
 return p;
end $$;
revoke all on function sgf_private.procurement_actor() from public,anon,authenticated;

create function sgf_private.procurement_registry_read(p_kind text,p_process uuid,p_offset integer,p_search text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; result jsonb;
begin
 p:=sgf_private.procurement_actor();
 if p_kind is null or p_kind not in ('process','instrument') or p_offset is null or p_offset<0 or p_offset>100000 or p_search is null or length(p_search)>100 then
 raise exception 'Filtro inválido'; end if;
 if p_kind='process' then
 select jsonb_build_object('total',count(*),'items',coalesce((select jsonb_agg(to_jsonb(x)) from (
 select r.* from public.procurement_processes r where r.tenant_id=p.tenant_id
 and (r.reference ilike '%'||p_search||'%' or r.object ilike '%'||p_search||'%')
 order by r.year desc,r.reference,r.id limit 20 offset p_offset) x),'[]'::jsonb)) into result
 from public.procurement_processes r where r.tenant_id=p.tenant_id and (r.reference ilike '%'||p_search||'%' or r.object ilike '%'||p_search||'%');
 else
 select jsonb_build_object('total',count(*),'items',coalesce((select jsonb_agg(to_jsonb(x)) from (
 select r.*,coalesce((select jsonb_agg(ip.partner_kind||':'||ip.partner_id::text order by ip.partner_kind,ip.partner_id)
 from public.procurement_instrument_partners ip where ip.instrument_id=r.id),'[]'::jsonb) partners
 from public.procurement_instruments r where r.tenant_id=p.tenant_id and r.process_id=p_process
 and r.reference ilike '%'||p_search||'%' order by r.year desc,r.reference,r.id limit 20 offset p_offset) x),'[]'::jsonb)) into result
 from public.procurement_instruments r where r.tenant_id=p.tenant_id and r.process_id=p_process and r.reference ilike '%'||p_search||'%';
 end if;
 return result;
end $$;

create function sgf_private.procurement_registry_save(p_kind text,p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.profiles; v_id uuid; v_process uuid; v_before jsonb; v_after jsonb; v_docs jsonb;
 v_doc jsonb; v_key text; v_partner uuid; v_partner_kind text; v_origin uuid; v_reason text; v_previous public.procurement_instruments;
begin
 p:=sgf_private.procurement_actor();
 if p_kind is null or p_kind not in ('process','instrument') or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Cadastro inválido'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('id','version','reference','year','object','modality','legal_basis','documents','reason','process_id','kind','starts_on','ends_on','declared_value','origin_ata_id','partners')) then raise exception 'Campo não permitido'; end if;
 v_id:=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
 v_reason:=trim(p_payload->>'reason');
 if v_reason is null or length(v_reason) not between 3 and 1000 then raise exception 'Informe a justificativa (3 a 1000 caracteres)'; end if;
 v_docs:=coalesce(p_payload->'documents','[]'::jsonb);
 if jsonb_typeof(v_docs) is distinct from 'array' then raise exception 'Documentos inválidos'; end if;
 if jsonb_array_length(v_docs)>20 then raise exception 'Limite de 20 referências documentais'; end if;
 for v_doc in select value from jsonb_array_elements(v_docs) loop
 if jsonb_typeof(v_doc) is distinct from 'object' or jsonb_typeof(v_doc->'label') is distinct from 'string' or jsonb_typeof(v_doc->'url') is distinct from 'string' or coalesce(length(trim(v_doc->>'label')),0) not between 1 and 120
 or coalesce(v_doc->>'url','') !~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?([/:?#][^[:space:]]*)?$'
 or length(v_doc->>'url')>2000 or v_doc->>'url' ~ '^https://[^/]*@' then raise exception 'Documento exige título e endereço HTTPS válido'; end if;
 if exists(select 1 from jsonb_object_keys(v_doc) k where k not in ('label','url')) then raise exception 'Campo documental não permitido'; end if;
 end loop;
 if p_kind='process' then
 if p_payload->>'id' is not null then
 select to_jsonb(r) into v_before from public.procurement_processes r where id=v_id and tenant_id=p.tenant_id for update;
 if v_before is null then raise exception 'Processo não encontrado'; end if;
 if p_payload->>'version' is null or (v_before->>'version')::int<>(p_payload->>'version')::int then raise exception 'Registro foi alterado; recarregue antes de salvar'; end if;
 end if;
 insert into public.procurement_processes(id,tenant_id,reference,year,object,modality,legal_basis,documents)
 values(v_id,p.tenant_id,trim(p_payload->>'reference'),(p_payload->>'year')::int,trim(p_payload->>'object'),trim(p_payload->>'modality'),trim(p_payload->>'legal_basis'),v_docs)
 on conflict(id) do update set reference=excluded.reference,year=excluded.year,object=excluded.object,modality=excluded.modality,
 legal_basis=excluded.legal_basis,documents=excluded.documents,version=procurement_processes.version+1,updated_at=now();
 v_process:=v_id;
 select to_jsonb(r) into v_after from public.procurement_processes r where id=v_id;
 else
 v_process:=(p_payload->>'process_id')::uuid;
 perform 1 from public.procurement_processes where id=v_process and tenant_id=p.tenant_id for update;
 if not found then raise exception 'Processo não encontrado'; end if;
 if p_payload->>'id' is not null then
 select * into v_previous from public.procurement_instruments where id=v_id and tenant_id=p.tenant_id for update;
 if not found then raise exception 'Instrumento não encontrado'; end if;
 if p_payload->>'version' is null or v_previous.version<>(p_payload->>'version')::int then raise exception 'Registro foi alterado; recarregue antes de salvar'; end if;
 if v_previous.process_id<>v_process or v_previous.kind is distinct from p_payload->>'kind' then raise exception 'Processo e tipo do instrumento não podem ser trocados'; end if;
 select to_jsonb(v_previous)||jsonb_build_object('partners',coalesce(jsonb_agg(partner_kind||':'||partner_id::text order by partner_kind,partner_id),'[]'::jsonb)) into v_before from public.procurement_instrument_partners where instrument_id=v_id;
 end if;
 if jsonb_typeof(p_payload->'partners') is distinct from 'array' then raise exception 'Selecione os fornecedores'; end if;
 if jsonb_array_length(p_payload->'partners') not between 1 and 100 then raise exception 'Selecione de 1 a 100 fornecedores'; end if;
 v_origin:=nullif(p_payload->>'origin_ata_id','')::uuid;
 if v_origin is not null then
 perform 1 from public.procurement_instruments where id=v_origin and tenant_id=p.tenant_id and process_id=v_process and kind='ata';
 if not found then raise exception 'Ata de origem incompatível'; end if;
 end if;
 for v_key in select jsonb_array_elements_text(p_payload->'partners') loop
 if v_key is null or v_key !~ '^(posto|oficina):[0-9a-fA-F-]{36}$' then raise exception 'Fornecedor inválido'; end if;
 v_partner_kind:=split_part(v_key,':',1); v_partner:=split_part(v_key,':',2)::uuid;
 if v_partner_kind='posto' then
 perform 1 from public.fuel_stations where id=v_partner and tenant_id=p.tenant_id;
 elsif v_partner_kind='oficina' then
 perform 1 from public.repair_shops where id=v_partner and tenant_id=p.tenant_id;
 else raise exception 'Tipo de fornecedor inválido'; end if;
 if not found then raise exception 'Fornecedor fora da prefeitura'; end if;
 if v_origin is not null and not exists(select 1 from public.procurement_instrument_partners where instrument_id=v_origin and partner_kind=v_partner_kind and partner_id=v_partner) then raise exception 'Fornecedor não pertence à ata de origem'; end if;
 end loop;
 if exists(select 1 from public.procurement_instruments child join public.procurement_instrument_partners cp on cp.instrument_id=child.id
 where child.origin_ata_id=v_id and not (p_payload->'partners' ? (cp.partner_kind||':'||cp.partner_id::text))) then raise exception 'Fornecedor possui contrato derivado desta ata'; end if;
 insert into public.procurement_instruments(id,tenant_id,process_id,kind,reference,year,starts_on,ends_on,declared_value,origin_ata_id,documents)
 values(v_id,p.tenant_id,v_process,p_payload->>'kind',trim(p_payload->>'reference'),(p_payload->>'year')::int,
 (p_payload->>'starts_on')::date,(p_payload->>'ends_on')::date,nullif(p_payload->>'declared_value','')::numeric,v_origin,v_docs)
 on conflict(id) do update set reference=excluded.reference,year=excluded.year,starts_on=excluded.starts_on,ends_on=excluded.ends_on,
 declared_value=excluded.declared_value,origin_ata_id=excluded.origin_ata_id,documents=excluded.documents,version=procurement_instruments.version+1,updated_at=now();
 delete from public.procurement_instrument_partners where instrument_id=v_id;
 insert into public.procurement_instrument_partners select v_id,split_part(k,':',1),split_part(k,':',2)::uuid from (select distinct jsonb_array_elements_text(p_payload->'partners') k) s;
 select to_jsonb(r)||jsonb_build_object('partners',(select jsonb_agg(ip.partner_kind||':'||ip.partner_id::text order by ip.partner_kind,ip.partner_id) from public.procurement_instrument_partners ip where ip.instrument_id=v_id)) into v_after from public.procurement_instruments r where id=v_id;
 end if;
 insert into public.procurement_registry_events(tenant_id,process_id,record_id,kind,actor_id,actor_name,reason,before_value,after_value)
 values(p.tenant_id,v_process,v_id,p_kind,p.id,coalesce(nullif(trim(p.full_name),''),'Gestor'),v_reason,v_before,v_after);
 return v_id;
end $$;

create function sgf_private.procurement_registry_events_read(p_process uuid,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; result jsonb;
begin
 p:=sgf_private.procurement_actor();
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Página inválida'; end if;
 select jsonb_build_object('total',count(*),'items',coalesce((select jsonb_agg(to_jsonb(x)) from (
 select id,record_id,kind,actor_id,actor_name,reason,before_value,after_value,occurred_at from public.procurement_registry_events
 where tenant_id=p.tenant_id and process_id=p_process order by id desc limit 20 offset p_offset) x),'[]'::jsonb)) into result
 from public.procurement_registry_events where tenant_id=p.tenant_id and process_id=p_process;
 return result;
end $$;
create function sgf_private.procurement_registry_partners_read() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; result jsonb;
begin
 p:=sgf_private.procurement_actor();
 select coalesce(jsonb_agg(to_jsonb(x) order by name),'[]'::jsonb) into result from (
 select 'posto:'||id::text id,name from public.fuel_stations where tenant_id=p.tenant_id
 union all select 'oficina:'||id::text,name from public.repair_shops where tenant_id=p.tenant_id) x;
 return result;
end $$;

create function public.get_procurement_registry(p_kind text,p_process uuid default null,p_offset integer default 0,p_search text default '') returns jsonb
language sql stable security invoker set search_path='' as $$select sgf_private.procurement_registry_read(p_kind,p_process,p_offset,p_search)$$;
create function public.save_procurement_registry(p_kind text,p_payload jsonb) returns uuid
language sql security invoker set search_path='' as $$select sgf_private.procurement_registry_save(p_kind,p_payload)$$;
create function public.get_procurement_registry_events(p_process uuid,p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path='' as $$select sgf_private.procurement_registry_events_read(p_process,p_offset)$$;
create function public.get_procurement_registry_partners() returns jsonb
language sql stable security invoker set search_path='' as $$select sgf_private.procurement_registry_partners_read()$$;
do $$ declare f record; begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='sgf_private' and p.proname in ('procurement_registry_read','procurement_registry_save','procurement_registry_events_read','procurement_registry_partners_read'))
 or (n.nspname='public' and p.proname in ('get_procurement_registry','save_procurement_registry','get_procurement_registry_events','get_procurement_registry_partners')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 execute format('grant execute on function %s to authenticated',f.sig);
 end loop;
end $$;
notify pgrst,'reload schema';
