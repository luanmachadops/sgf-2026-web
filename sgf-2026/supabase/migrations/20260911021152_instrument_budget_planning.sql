-- Stage 4: draft annual planning. Does not feed the legacy operational budget ledger.
create table public.instrument_budget_plans (
 id uuid primary key default gen_random_uuid(), instrument_id uuid not null references public.procurement_instruments(id),
 fiscal_year integer not null check(fiscal_year between 1900 and 2200),
 total_limit numeric(14,2) not null check(total_limit>=0 and total_limit<>'NaN'::numeric),
 status text not null default 'draft' check(status='draft'), version integer not null default 1,
 document_reference text not null check(length(trim(document_reference)) between 3 and 500),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(instrument_id,fiscal_year)
);
create table public.instrument_budget_allocations (
 id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.instrument_budget_plans(id),
 department_id uuid not null references public.departments(id),
 category text not null check(category in ('fuel','arla','lubricant','parts','labor','tires','tire_service','other')),
 spending_limit numeric(14,2) not null check(spending_limit>=0 and spending_limit<>'NaN'::numeric),
 appropriation text not null check(length(trim(appropriation)) between 1 and 150),
 funding_source text not null check(length(trim(funding_source)) between 1 and 30),
 simam_code text not null default '' check(simam_code='' or simam_code ~ '^[0-9]{28}$'),
 unique(plan_id,department_id,category,appropriation,funding_source)
);
create index instrument_budget_department on public.instrument_budget_allocations(department_id,plan_id);
alter table public.instrument_budget_plans enable row level security;
alter table public.instrument_budget_allocations enable row level security;
revoke all on public.instrument_budget_plans,public.instrument_budget_allocations from public,anon,authenticated;

create function sgf_private.instrument_budget_actor(p_write boolean default false) returns public.profiles
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles;
begin
 if auth.uid() is null or not sgf_private.current_session_allowed() then raise exception 'Sessão inválida ou revogada' using errcode='42501'; end if;
 select * into p from public.profiles where id=auth.uid();
 if p.role not in ('admin','gestor','superadmin','secretario') or not coalesce('budgets'=any(p.allowed_modules),false) then raise exception 'Sem permissão para consultar limites' using errcode='42501'; end if;
 if p_write and (p.role not in ('admin','superadmin') or not coalesce('procurement'=any(p.allowed_modules),false)) then raise exception 'A edição exige administrador com acesso a limites e licitações' using errcode='42501'; end if;
 return p;
end $$;
revoke all on function sgf_private.instrument_budget_actor(boolean) from public,anon,authenticated;

create function sgf_private.instrument_budget_read(p_year integer,p_instrument uuid,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; result jsonb; rows jsonb; total integer;
begin
 p:=sgf_private.instrument_budget_actor();
 if p_year is null or p_year not between 1900 and 2200 or p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Filtro inválido'; end if;
 select count(*) into total from public.instrument_budget_plans b join public.procurement_instruments i on i.id=b.instrument_id
 where i.tenant_id=p.tenant_id and b.fiscal_year=p_year and (p_instrument is null or i.id=p_instrument)
 and (p.role<>'secretario' or exists(select 1 from public.instrument_budget_allocations a where a.plan_id=b.id and a.department_id=p.department_id));
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into rows from (
 select b.id,b.instrument_id,b.fiscal_year,b.version,b.status,b.document_reference,i.reference,i.kind,i.origin_ata_id,
 case when p.role<>'secretario' then b.total_limit end total_limit,
 case when p.role<>'secretario' then i.declared_value end declared_value,
 (select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('department_name',d.name) order by d.name,a.category,a.id),'[]'::jsonb)
 from public.instrument_budget_allocations a join public.departments d on d.id=a.department_id where a.plan_id=b.id and (p.role<>'secretario' or a.department_id=p.department_id)) allocations
 from public.instrument_budget_plans b join public.procurement_instruments i on i.id=b.instrument_id
 where i.tenant_id=p.tenant_id and b.fiscal_year=p_year and (p_instrument is null or i.id=p_instrument)
 and (p.role<>'secretario' or exists(select 1 from public.instrument_budget_allocations a where a.plan_id=b.id and a.department_id=p.department_id))
 order by i.reference,b.id limit 10 offset p_offset) x;
 select jsonb_build_object('items',rows,'total',total,'departments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.departments where tenant_id=p.tenant_id and (p.role<>'secretario' or id=p.department_id)),'[]'::jsonb)) into result;
 return result;
end $$;

create function sgf_private.instrument_budget_save(p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.profiles; ins public.procurement_instruments; old_plan public.instrument_budget_plans;
 v_id uuid; v_line uuid; v_ids uuid[]:='{}'; a jsonb; v_year integer; v_limit numeric; v_amount numeric;
 v_reason text; v_before jsonb; v_after jsonb;
begin
 p:=sgf_private.instrument_budget_actor(true);
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Planejamento inválido'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('id','version','instrument_id','fiscal_year','total_limit','document_reference','reason','allocations')) then raise exception 'Campo não permitido'; end if;
 v_reason:=trim(p_payload->>'reason');
 if coalesce(length(v_reason),0) not between 3 and 1000 then raise exception 'Informe a justificativa do cadastro ou remanejamento'; end if;
 select * into ins from public.procurement_instruments where id=(p_payload->>'instrument_id')::uuid and tenant_id=p.tenant_id;
 if not found then raise exception 'Instrumento não encontrado'; end if;
 perform 1 from public.procurement_processes where id=ins.process_id for update;
 select * into ins from public.procurement_instruments where id=ins.id for update;
 if ins.status<>'draft' then raise exception 'Instrumento não está em rascunho'; end if;
 if ins.declared_value is null then raise exception 'Confira primeiro o valor registrado ou contratado do instrumento'; end if;
 v_year:=(p_payload->>'fiscal_year')::int; v_limit:=(p_payload->>'total_limit')::numeric;
 if v_year is null or v_year<extract(year from ins.starts_on) or v_year>extract(year from ins.ends_on) then raise exception 'Exercício fora da vigência do instrumento'; end if;
 if v_limit is null or v_limit<0 or v_limit='NaN'::numeric or v_limit<>round(v_limit,2) then raise exception 'Teto inválido; use até duas casas decimais'; end if;
 v_id:=coalesce((p_payload->>'id')::uuid,gen_random_uuid());
 if p_payload->>'id' is not null then
 select * into old_plan from public.instrument_budget_plans where id=v_id and instrument_id=ins.id for update;
 if not found then raise exception 'Planejamento não encontrado'; end if;
 if old_plan.fiscal_year<>v_year then raise exception 'Exercício não pode ser trocado'; end if;
 if p_payload->>'version' is null or old_plan.version<>(p_payload->>'version')::int then raise exception 'Registro foi alterado; recarregue antes de salvar'; end if;
 select to_jsonb(old_plan)||jsonb_build_object('allocations',coalesce(jsonb_agg(to_jsonb(l)||jsonb_build_object('department_name',d.name) order by l.id),'[]'::jsonb)) into v_before from public.instrument_budget_allocations l join public.departments d on d.id=l.department_id where l.plan_id=v_id;
 end if;
 if v_limit+(select coalesce(sum(total_limit),0) from public.instrument_budget_plans where instrument_id=ins.id and id<>v_id)>ins.declared_value then raise exception 'A soma dos exercícios ultrapassa o valor do instrumento'; end if;
 if jsonb_typeof(p_payload->'allocations') is distinct from 'array' then raise exception 'Distribuição inválida'; end if;
 if jsonb_array_length(p_payload->'allocations') not between 1 and 200 then raise exception 'Informe de 1 a 200 dotações'; end if;
 insert into public.instrument_budget_plans(id,instrument_id,fiscal_year,total_limit,document_reference)
 values(v_id,ins.id,v_year,v_limit,trim(p_payload->>'document_reference'))
 on conflict(id) do update set total_limit=excluded.total_limit,document_reference=excluded.document_reference,version=instrument_budget_plans.version+1,updated_at=now();
 for a in select value from jsonb_array_elements(p_payload->'allocations') loop
 if jsonb_typeof(a) is distinct from 'object' then raise exception 'Dotação inválida'; end if;
 if exists(select 1 from jsonb_object_keys(a) k where k not in ('id','department_id','category','spending_limit','appropriation','funding_source','simam_code')) then raise exception 'Campo da dotação não permitido'; end if;
 if not exists(select 1 from public.departments where id=(a->>'department_id')::uuid and tenant_id=p.tenant_id) then raise exception 'Secretaria fora da prefeitura'; end if;
 v_amount:=(a->>'spending_limit')::numeric;
 if v_amount is null or v_amount<0 or v_amount='NaN'::numeric or v_amount<>round(v_amount,2) then raise exception 'Valor da dotação inválido'; end if;
 if jsonb_typeof(a->'appropriation') is distinct from 'string' or jsonb_typeof(a->'funding_source') is distinct from 'string' or (a ? 'simam_code' and jsonb_typeof(a->'simam_code') is distinct from 'string') then raise exception 'Informe dotação e fonte como texto para preservar os códigos'; end if;
 v_line:=(a->>'id')::uuid;
 if v_line is null then
 select id into v_line from public.instrument_budget_allocations where plan_id=v_id and department_id=(a->>'department_id')::uuid
 and category=a->>'category' and appropriation=trim(a->>'appropriation') and funding_source=trim(a->>'funding_source');
 v_line:=coalesce(v_line,gen_random_uuid());
 end if;
 if v_line=any(v_ids) then raise exception 'Dotação repetida'; end if;
 if a->>'id' is not null and not exists(select 1 from public.instrument_budget_allocations where id=v_line and plan_id=v_id) then raise exception 'Dotação não pertence ao planejamento'; end if;
 v_ids:=array_append(v_ids,v_line);
 insert into public.instrument_budget_allocations(id,plan_id,department_id,category,spending_limit,appropriation,funding_source,simam_code)
 values(v_line,v_id,(a->>'department_id')::uuid,a->>'category',v_amount,trim(a->>'appropriation'),trim(a->>'funding_source'),coalesce(a->>'simam_code',''))
 on conflict(id) do update set department_id=excluded.department_id,category=excluded.category,spending_limit=excluded.spending_limit,appropriation=excluded.appropriation,funding_source=excluded.funding_source,simam_code=excluded.simam_code;
 end loop;
 delete from public.instrument_budget_allocations where plan_id=v_id and not(id=any(v_ids));
 if (select sum(spending_limit) from public.instrument_budget_allocations where plan_id=v_id)>v_limit then raise exception 'A soma das dotações ultrapassa o teto do exercício'; end if;
 -- Validate the entire family, including parent revisions that would strand child plans.
 if exists(select 1 from public.instrument_budget_plans child join public.procurement_instruments ci on ci.id=child.instrument_id
 left join public.instrument_budget_plans parent on parent.instrument_id=ci.origin_ata_id and parent.fiscal_year=child.fiscal_year
 where ci.process_id=ins.process_id and ci.origin_ata_id is not null and parent.id is null) then raise exception 'Defina primeiro o planejamento da ata no mesmo exercício'; end if;
 if exists(select 1 from public.instrument_budget_plans parent join public.procurement_instruments pi on pi.id=parent.instrument_id
 where pi.process_id=ins.process_id and (select coalesce(sum(child.total_limit),0) from public.instrument_budget_plans child join public.procurement_instruments ci on ci.id=child.instrument_id where ci.origin_ata_id=pi.id and child.fiscal_year=parent.fiscal_year)>parent.total_limit) then raise exception 'Tetos dos contratos ultrapassam o planejamento da ata'; end if;
 if exists(select 1 from public.instrument_budget_allocations ca join public.instrument_budget_plans cb on cb.id=ca.plan_id
 join public.procurement_instruments ci on ci.id=cb.instrument_id
 where ci.process_id=ins.process_id and ci.origin_ata_id is not null
 group by ci.origin_ata_id,cb.fiscal_year,ca.department_id,ca.category
 having sum(ca.spending_limit)>(select coalesce(sum(pa.spending_limit),0) from public.instrument_budget_allocations pa join public.instrument_budget_plans pb on pb.id=pa.plan_id where pb.instrument_id=ci.origin_ata_id and pb.fiscal_year=cb.fiscal_year and pa.department_id=ca.department_id and pa.category=ca.category)) then raise exception 'Cotas dos contratos ultrapassam a distribuição da ata para a secretaria e categoria'; end if;
 select to_jsonb(b)||jsonb_build_object('reference',ins.reference,'allocations',(select jsonb_agg(to_jsonb(l)||jsonb_build_object('department_name',d.name) order by l.id) from public.instrument_budget_allocations l join public.departments d on d.id=l.department_id where l.plan_id=b.id)) into v_after from public.instrument_budget_plans b where b.id=v_id;
 insert into public.procurement_registry_events(tenant_id,process_id,record_id,kind,actor_id,actor_name,reason,before_value,after_value)
 values(p.tenant_id,ins.process_id,v_id,'budget',p.id,coalesce(nullif(trim(p.full_name),''),'Gestor'),v_reason,v_before,v_after);
 return v_id;
end $$;

create function sgf_private.instrument_budget_events(p_plan uuid,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; result jsonb;
begin
 p:=sgf_private.instrument_budget_actor();
 if p.role='secretario' then raise exception 'Histórico global restrito à gestão' using errcode='42501'; end if;
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Página inválida'; end if;
 select jsonb_build_object('total',count(*),'items',coalesce((select jsonb_agg(to_jsonb(x)) from (
 select actor_name,reason,occurred_at,before_value,after_value,id from public.procurement_registry_events where tenant_id=p.tenant_id and kind='budget' and record_id=p_plan order by id desc limit 20 offset p_offset) x),'[]'::jsonb)) into result
 from public.procurement_registry_events where tenant_id=p.tenant_id and kind='budget' and record_id=p_plan;
 return result;
end $$;
create function sgf_private.instrument_budget_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.instrument_budget_plans where instrument_id=old.id) then
 if new.origin_ata_id is distinct from old.origin_ata_id then raise exception 'Ata de origem possui planejamento vinculado'; end if;
 if new.declared_value is null or new.declared_value<(select sum(total_limit) from public.instrument_budget_plans where instrument_id=old.id) then raise exception 'Valor do instrumento inferior aos tetos planejados'; end if;
 if exists(select 1 from public.instrument_budget_plans where instrument_id=old.id and (fiscal_year<extract(year from new.starts_on) or fiscal_year>extract(year from new.ends_on))) then raise exception 'Vigência exclui um exercício planejado'; end if;
 end if;
 return new;
end $$;
revoke all on function sgf_private.instrument_budget_guard() from public,anon,authenticated;
create trigger instrument_budget_guard before update on public.procurement_instruments for each row execute function sgf_private.instrument_budget_guard();
create function public.get_instrument_budgets(p_year integer,p_instrument uuid default null,p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path='' as $$select sgf_private.instrument_budget_read(p_year,p_instrument,p_offset)$$;
create function public.save_instrument_budget(p_payload jsonb) returns uuid
language sql security invoker set search_path='' as $$select sgf_private.instrument_budget_save(p_payload)$$;
create function public.get_instrument_budget_events(p_plan uuid,p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path='' as $$select sgf_private.instrument_budget_events(p_plan,p_offset)$$;
alter function sgf_private.resource_modules(text,boolean) rename to resource_modules_before_instrument_budgets;
create function sgf_private.resource_modules(p_resource text,p_write boolean) returns text[]
language sql immutable set search_path='' as $$select case when p_resource in ('get_instrument_budgets','get_instrument_budget_events','save_instrument_budget') then array['budgets'] else sgf_private.resource_modules_before_instrument_budgets(p_resource,p_write) end$$;
revoke all on function sgf_private.resource_modules(text,boolean) from public,anon,authenticated;
do $$ declare f record; begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='sgf_private' and p.proname in ('instrument_budget_read','instrument_budget_save','instrument_budget_events')) or
 (n.nspname='public' and p.proname in ('get_instrument_budgets','save_instrument_budget','get_instrument_budget_events')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig); execute format('grant execute on function %s to authenticated',f.sig);
 end loop;
end $$;
notify pgrst,'reload schema';

-- Registry readers without the budgets module must not receive budget snapshots.
create or replace function sgf_private.procurement_registry_events_read(p_process uuid,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; result jsonb;
begin
 p:=sgf_private.procurement_actor();
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Página inválida'; end if;
 select jsonb_build_object('total',count(*),'items',coalesce((select jsonb_agg(to_jsonb(x)) from (
 select id,record_id,kind,actor_id,actor_name,reason,before_value,after_value,occurred_at from public.procurement_registry_events
 where tenant_id=p.tenant_id and process_id=p_process and (kind<>'budget' or coalesce('budgets'=any(p.allowed_modules),false)) order by id desc limit 20 offset p_offset) x),'[]'::jsonb)) into result
 from public.procurement_registry_events where tenant_id=p.tenant_id and process_id=p_process and (kind<>'budget' or coalesce('budgets'=any(p.allowed_modules),false));
 return result;
end $$;
