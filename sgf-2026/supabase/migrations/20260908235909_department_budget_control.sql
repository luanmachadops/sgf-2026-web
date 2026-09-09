-- Controle gerencial por contrato/exercício. Não substitui empenho contábil.
create schema if not exists sgf_private;
revoke all on schema sgf_private from public, anon, authenticated;

create table public.budget_contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  category text not null check(category in ('fuel','maintenance')),
  reference text not null check(length(trim(reference)) between 2 and 160),
  fiscal_year integer not null check(fiscal_year between 2020 and 2200),
  starts_on date not null,
  ends_on date not null,
  total_limit numeric(14,2) not null check(total_limit >= 0 and total_limit <> 'NaN'::numeric),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  unique(id,tenant_id),
  unique(tenant_id,category,reference,fiscal_year),
  check(starts_on <= ends_on and extract(year from starts_on)=fiscal_year and extract(year from ends_on)=fiscal_year)
);
create table public.budget_allocations (
  contract_id uuid not null references public.budget_contracts(id),
  department_id uuid not null references public.departments(id),
  spending_limit numeric(14,2) not null check(spending_limit >= 0 and spending_limit <> 'NaN'::numeric),
  appropriation text not null check(length(trim(appropriation)) between 1 and 200),
  funding_source text not null check(length(trim(funding_source)) between 1 and 200),
  primary key(contract_id,department_id)
);
create table public.budget_partners (
  contract_id uuid not null references public.budget_contracts(id),
  partner_id uuid not null,
  primary key(contract_id,partner_id)
);
create index budget_partners_partner_idx on public.budget_partners(partner_id,contract_id);
create table public.budget_entries (
  source_type text not null check(source_type in ('fuelings','service_orders','station_operations')),
  source_id uuid not null,
  contract_id uuid not null references public.budget_contracts(id),
  department_id uuid not null,
  partner_id uuid not null,
  vehicle_id uuid,
  reserved_unit_price numeric(14,4),
  reserved numeric(14,2) not null default 0 check(reserved >= 0 and reserved <> 'NaN'::numeric),
  realized numeric(14,2) not null default 0 check(realized >= 0 and realized <> 'NaN'::numeric),
  disputed numeric(14,2) not null default 0 check(disputed >= 0 and disputed <> 'NaN'::numeric),
  source_status text not null,
  updated_at timestamptz not null default now(),
  primary key(source_type,source_id),
  foreign key(contract_id,department_id) references public.budget_allocations(contract_id,department_id)
);
create index budget_entries_allocation_idx on public.budget_entries(contract_id,department_id);
create table public.budget_events (
  id bigint generated always as identity primary key,
  contract_id uuid not null references public.budget_contracts(id),
  department_id uuid,
  actor_id uuid,
  event_type text not null,
  reason text not null,
  before_value jsonb,
  after_value jsonb not null,
  occurred_at timestamptz not null default now()
);
create index budget_events_contract_idx on public.budget_events(contract_id,id desc);

-- Allowlist, server-enforced for every budget RPC and table.
alter table public.profiles drop constraint profiles_allowed_modules_check;
alter table public.profiles add constraint profiles_allowed_modules_check check(allowed_modules <@ array[
  'dashboard','map','notifications','fleet','drivers','trips','refuelings','stations',
  'maintenances','repair_shops','checklists','infractions','departments','reports','settings','budgets']::text[]);
alter table public.profiles alter column allowed_modules set default array[
  'dashboard','map','notifications','fleet','drivers','trips','refuelings','stations',
  'maintenances','repair_shops','checklists','infractions','departments','reports','settings','budgets']::text[];
update public.profiles set allowed_modules=array_append(allowed_modules,'budgets')
where role in ('admin','gestor','secretario') and 'departments'=any(allowed_modules) and not 'budgets'=any(allowed_modules);

create function sgf_private.budget_reader(p_tenant uuid, p_department uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p join public.tenants t on t.id=p.tenant_id
    where p.id=auth.uid() and p.tenant_id=p_tenant and not coalesce(p.access_blocked,false)
      and t.status::text <> 'suspended' and 'budgets'=any(p.allowed_modules)
      and (p.role in ('admin','gestor') or (p.role='secretario' and p_department=p.department_id)));
$$;
-- Policy helper needs EXECUTE, but sgf_private is not exposed through PostgREST.
grant usage on schema sgf_private to authenticated;
grant execute on function sgf_private.budget_reader(uuid,uuid) to authenticated;
revoke all on function sgf_private.budget_reader(uuid,uuid) from public, anon;

do $$ declare v_table text; begin
  foreach v_table in array array['budget_contracts','budget_allocations','budget_partners','budget_entries','budget_events'] loop
    execute format('alter table public.%I enable row level security',v_table);
    execute format('revoke all on public.%I from public, anon, authenticated',v_table);
    execute format('grant select on public.%I to authenticated',v_table);
    execute format('grant all on public.%I to service_role',v_table);
  end loop;
end $$;
-- Raw tables are admin/manager only. Secretaries use the scoped summary RPC.
create policy budget_contracts_read on public.budget_contracts for select to authenticated
using(sgf_private.budget_reader(tenant_id));
create policy budget_allocations_read on public.budget_allocations for select to authenticated
using(exists(select 1 from public.budget_contracts c where c.id=contract_id));
create policy budget_partners_read on public.budget_partners for select to authenticated
using(exists(select 1 from public.budget_contracts c where c.id=contract_id));
create policy budget_entries_read on public.budget_entries for select to authenticated
using(exists(select 1 from public.budget_contracts c where c.id=contract_id));
create policy budget_events_read on public.budget_events for select to authenticated
using(exists(select 1 from public.budget_contracts c where c.id=contract_id));

create function sgf_private.budget_manager()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_tenant uuid;
begin
  select p.tenant_id into v_tenant from public.profiles p join public.tenants t on t.id=p.tenant_id
  where p.id=auth.uid() and p.role='admin' and not coalesce(p.access_blocked,false)
    and t.status::text <> 'suspended' and 'budgets'=any(p.allowed_modules);
  if v_tenant is null then raise exception 'Somente administradores habilitados podem definir limites' using errcode='42501'; end if;
  return v_tenant;
end $$;
revoke all on function sgf_private.budget_manager() from public, anon, authenticated;

-- Serializes configuration, initial reconciliation and operations per tenant.
-- Using the tenant row avoids lost reservations even across different suppliers.
create function sgf_private.book_budget(p_source text, p_row jsonb, p_initial_contract uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare
  c public.budget_contracts; e public.budget_entries; a public.budget_allocations;
  v_tenant uuid := (p_row->>'tenant_id')::uuid;
  v_id uuid := (p_row->>'id')::uuid;
  v_vehicle uuid := (p_row->>'vehicle_id')::uuid;
  v_partner uuid; v_department uuid; v_category text; v_status text;
  v_reserved numeric := 0; v_realized numeric := 0; v_disputed numeric := 0;
  v_amount numeric; v_price numeric; v_liters numeric; v_used numeric;
  v_before jsonb; v_after jsonb;
begin
  perform 1 from public.tenants where id=v_tenant for update;
  select * into e from public.budget_entries where source_type=p_source and source_id=v_id;
  v_partner := (p_row->>case when p_source='service_orders' then 'repair_shop_id' else 'station_id' end)::uuid;
  v_category := case when p_source='service_orders' then 'maintenance' else 'fuel' end;
  if e.source_id is not null then
    select * into c from public.budget_contracts where id=e.contract_id;
    if c.tenant_id is distinct from v_tenant or e.partner_id is distinct from v_partner or e.vehicle_id is distinct from v_vehicle then
      raise exception 'A despesa possui cota vinculada; fornecedor, prefeitura e veículo não podem ser trocados';
    end if;
    v_department := e.department_id;
  else
    if p_initial_contract is not null then
      select * into c from public.budget_contracts where id=p_initial_contract and tenant_id=v_tenant;
    else
      select bc.* into c from public.budget_contracts bc join public.budget_partners bp on bp.contract_id=bc.id
      where bc.tenant_id=v_tenant and bc.category=v_category and bp.partner_id=v_partner
        and (now() at time zone 'America/Sao_Paulo')::date between bc.starts_on and bc.ends_on;
    end if;
    select department_id into v_department from public.vehicles where id=v_vehicle and tenant_id=v_tenant;
  end if;

  if p_source='fuelings' then
    v_status := p_row->>'workflow_status';
    if v_status='autorizado' and p_row->>'cancelled_at' is null then
      v_liters := (p_row->>'max_liters')::numeric;
      if v_liters is null then select tank_capacity into v_liters from public.vehicles where id=v_vehicle; end if;
      -- Once reserved, keep the agreed price even if the supplier changes its catalog.
      v_price := coalesce(e.reserved_unit_price,(p_row->>'price_per_liter')::numeric);
      if v_price is null then
        select nullif(fp.value,'')::numeric into v_price from public.fuel_stations s,
          lateral jsonb_each_text(coalesce(s.fuel_prices,'{}'::jsonb)) fp
        where s.id=v_partner and lower(fp.key)=lower(p_row->>'fuel_type') limit 1;
      end if;
      v_reserved := round(coalesce(v_liters,0)*coalesce(v_price,0),2);
    elsif v_status in ('concluido','validado','lancado_direto','rejeitado_admin') then
      v_amount := coalesce((p_row->>'total_cost')::numeric,0);
      if v_status='rejeitado_admin' then v_disputed:=v_amount; else v_realized:=v_amount; end if;
    end if;
  elsif p_source='station_operations' then
    v_status := p_row->>'status';
    if v_status='autorizado' then v_reserved:=round((p_row->>'authorized_quantity')::numeric*(p_row->>'unit_price')::numeric,2);
    elsif v_status='rejeitado' then v_disputed:=coalesce((p_row->>'total_cost')::numeric,0);
    elsif v_status in ('concluido','validado') then v_realized:=coalesce((p_row->>'total_cost')::numeric,0); end if;
  else
    v_status := p_row->>'operational_status';
    if v_status <> 'cancelled' and p_row->>'financial_status' <> 'not_started' then
      if v_status='received' then v_realized:=coalesce(nullif((p_row->>'cost')::numeric,0),(p_row->>'budget')::numeric,0);
      else v_reserved:=coalesce((p_row->>'budget')::numeric,0); end if;
    end if;
  end if;
  v_amount:=v_reserved+v_realized+v_disputed;
  if c.id is not null and p_source in ('fuelings','station_operations') and v_status='autorizado' and v_amount<=0 then
    raise exception 'Informe litros/quantidade e preço positivos para reservar a cota';
  end if;
  if e.source_id is null and v_amount=0 then return; end if;
  if c.id is null then
    if exists(select 1 from public.budget_partners bp join public.budget_contracts bc on bc.id=bp.contract_id
      where bp.partner_id=v_partner and bc.tenant_id=v_tenant and bc.category=v_category) then
      raise exception 'Não há limite por secretaria vigente para este fornecedor. Configure o exercício antes de autorizar novas despesas.';
    end if;
    return; -- Suppliers not yet configured keep their existing global controls.
  end if;
  if v_amount <= 0 and e.source_id is null then raise exception 'Informe o valor da reserva'; end if;
  if v_department is null then raise exception 'Vincule o veículo a uma secretaria antes de consumir a cota'; end if;
  select * into a from public.budget_allocations where contract_id=c.id and department_id=v_department;
  if a.contract_id is null then raise exception 'Esta secretaria não possui cota nesta licitação'; end if;
  if p_initial_contract is null and not ((now() at time zone 'America/Sao_Paulo')::date between c.starts_on and c.ends_on)
    and v_amount>coalesce(e.reserved+e.realized+e.disputed,0) then
    raise exception 'A vigência desta cota terminou. Novas reservas e acréscimos estão bloqueados';
  end if;
  -- Cancellation cannot erase an executed expense, including a disputed one.
  if e.realized+e.disputed>0 and v_amount=0 then raise exception 'Uma despesa executada não pode liberar saldo por cancelamento'; end if;
  select coalesce(sum(reserved+realized+disputed),0) into v_used from public.budget_entries
    where contract_id=c.id and department_id=v_department and (source_type,source_id)<>(p_source,v_id);
  if v_used+v_amount>a.spending_limit then
    raise exception 'Saldo insuficiente da secretaria: disponível R$ %, operação R$ %',a.spending_limit-v_used,v_amount;
  end if;
  v_before:=case when e.source_id is null then null else to_jsonb(e) end;
  if e.source_id is not null and (e.reserved,e.realized,e.disputed,e.source_status)=(v_reserved,v_realized,v_disputed,v_status) then return; end if;
  insert into public.budget_entries(source_type,source_id,contract_id,department_id,partner_id,vehicle_id,reserved_unit_price,reserved,realized,disputed,source_status)
    values(p_source,v_id,c.id,v_department,v_partner,v_vehicle,coalesce(e.reserved_unit_price,v_price),v_reserved,v_realized,v_disputed,v_status)
  on conflict(source_type,source_id) do update set reserved=excluded.reserved,realized=excluded.realized,
    disputed=excluded.disputed,source_status=excluded.source_status,updated_at=now()
  returning to_jsonb(budget_entries.*) into v_after;
  insert into public.budget_events(contract_id,department_id,actor_id,event_type,reason,before_value,after_value)
  values(c.id,v_department,auth.uid(),case when p_initial_contract is null then 'operation' else 'opening_balance' end,
    case when p_initial_contract is null then 'Atualização da despesa vinculada' else 'Conciliação na implantação da cota' end,v_before,v_after);
end $$;
revoke all on function sgf_private.book_budget(text,jsonb,uuid) from public, anon, authenticated;

create function sgf_private.budget_operation_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_old jsonb; v_new jsonb; v_first_start date; v_executed date;
  v_old_status text; v_new_status text; v_terminal text[];
begin
  if tg_op='DELETE' then
    if exists(select 1 from public.budget_entries where source_type=tg_table_name and source_id=old.id) then
      raise exception 'Registro com cota vinculada não pode ser excluído. Utilize o cancelamento do fluxo.';
    end if;
    return old;
  end if;
  -- Closed records predating activation must not be charged to a later year
  -- merely because a manager validates them or edits an administrative note.
  if tg_op='UPDATE' and not exists(select 1 from public.budget_entries where source_type=tg_table_name and source_id=old.id) then
    v_old:=to_jsonb(old); v_new:=to_jsonb(new);
    if tg_table_name='fuelings' then
      v_old_status:=v_old->>'workflow_status'; v_new_status:=v_new->>'workflow_status';
      v_terminal:=array['concluido','validado','lancado_direto','rejeitado_admin'];
      v_executed:=(coalesce(v_old->>'filled_at',v_old->>'authorized_at',v_old->>'created_at')::timestamptz at time zone 'America/Sao_Paulo')::date;
    elsif tg_table_name='station_operations' then
      v_old_status:=v_old->>'status'; v_new_status:=v_new->>'status';
      v_terminal:=array['concluido','validado','rejeitado'];
      v_executed:=(coalesce(v_old->>'executed_at',v_old->>'authorized_at')::timestamptz at time zone 'America/Sao_Paulo')::date;
    else
      v_old_status:=v_old->>'operational_status'; v_new_status:=v_new->>'operational_status';
      v_terminal:=array['received'];
      v_executed:=(coalesce(v_old->>'received_at',v_old->>'approved_at',v_old->>'created_at')::timestamptz at time zone 'America/Sao_Paulo')::date;
    end if;
    select min(c.starts_on) into v_first_start from public.budget_contracts c
      join public.budget_partners p on p.contract_id=c.id
      where c.tenant_id=old.tenant_id and c.category=case when tg_table_name='service_orders' then 'maintenance' else 'fuel' end
        and p.partner_id=(v_old->>case when tg_table_name='service_orders' then 'repair_shop_id' else 'station_id' end)::uuid;
    if v_old_status=any(v_terminal) and v_executed<v_first_start then
      if not coalesce(v_new_status=any(v_terminal),false) or exists(
        select 1 from unnest(array['tenant_id','vehicle_id','station_id','repair_shop_id','total_cost','cost','budget','liters','price_per_liter','filled_at','executed_at','received_at','authorized_at','approved_at','created_at']) k
        where v_old->k is distinct from v_new->k
      ) then
        raise exception 'Despesa anterior à implantação: alteração financeira exige conciliação específica do exercício de origem';
      end if;
      return new;
    end if;
  end if;
  perform sgf_private.book_budget(tg_table_name,to_jsonb(new));
  return new;
end $$;
revoke all on function sgf_private.budget_operation_trigger() from public, anon, authenticated;
create trigger z_budget_fuelings after insert or update or delete on public.fuelings for each row execute function sgf_private.budget_operation_trigger();
create trigger z_budget_service_orders after insert or update or delete on public.service_orders for each row execute function sgf_private.budget_operation_trigger();
create trigger z_budget_station_operations after insert or update or delete on public.station_operations for each row execute function sgf_private.budget_operation_trigger();

create function public.save_department_budget(p_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_tenant uuid:=sgf_private.budget_manager(); c public.budget_contracts;
  v_id uuid:=nullif(p_payload->>'id','')::uuid; v_new boolean:=v_id is null;
  v_before jsonb; v_partner uuid; v_item jsonb; v_row record; v_used numeric;
  v_reason text:=trim(p_payload->>'reason');
begin
  if v_reason is null or length(v_reason)<10 or length(v_reason)>2000 then raise exception 'Informe justificativa com 10 a 2000 caracteres'; end if;
  if jsonb_typeof(p_payload->'allocations') is distinct from 'array' or jsonb_array_length(p_payload->'allocations') not between 1 and 500 then
    raise exception 'Defina de 1 a 500 cotas por secretaria'; end if;
  if (select count(*)<>count(distinct value->>'department_id') from jsonb_array_elements(p_payload->'allocations')) then
    raise exception 'Há secretarias duplicadas na distribuição'; end if;
  perform 1 from public.tenants where id=v_tenant for update;
  if v_new then
    if not ((now() at time zone 'America/Sao_Paulo')::date between (p_payload->>'starts_on')::date and (p_payload->>'ends_on')::date) then
      raise exception 'A implantação das cotas exige vigência atual. Consulte exercícios encerrados pelo filtro do painel.';
    end if;
    if jsonb_typeof(p_payload->'partner_ids') is distinct from 'array' or jsonb_array_length(p_payload->'partner_ids') not between 1 and 100 then
      raise exception 'Selecione de 1 a 100 fornecedores'; end if;
    insert into public.budget_contracts(tenant_id,category,reference,fiscal_year,starts_on,ends_on,total_limit)
    values(v_tenant,p_payload->>'category',trim(p_payload->>'reference'),(p_payload->>'fiscal_year')::int,
      (p_payload->>'starts_on')::date,(p_payload->>'ends_on')::date,(p_payload->>'total_limit')::numeric) returning * into c;
    v_id:=c.id;
    for v_partner in select value::uuid from jsonb_array_elements_text(p_payload->'partner_ids') loop
      if c.category='fuel' then
        if not exists(select 1 from public.fuel_stations where id=v_partner and tenant_id=v_tenant) then raise exception 'Posto fora da prefeitura'; end if;
      else
        if not exists(select 1 from public.repair_shops where id=v_partner and tenant_id=v_tenant) then raise exception 'Oficina fora da prefeitura'; end if;
      end if;
      if exists(select 1 from public.budget_partners bp join public.budget_contracts bc on bc.id=bp.contract_id
        where bp.partner_id=v_partner and bc.category=c.category and bc.tenant_id=v_tenant
        and daterange(bc.starts_on,bc.ends_on,'[]') && daterange(c.starts_on,c.ends_on,'[]')) then
        raise exception 'Fornecedor já vinculado a outra cota com vigência sobreposta'; end if;
      insert into public.budget_partners values(c.id,v_partner);
    end loop;
  else
    select * into c from public.budget_contracts where id=v_id and tenant_id=v_tenant for update;
    if c.id is null then raise exception 'Contrato não encontrado' using errcode='42501'; end if;
    if c.version is distinct from (p_payload->>'version')::int then raise exception 'O planejamento foi alterado. Atualize a página antes de salvar.'; end if;
    select jsonb_build_object('contract',to_jsonb(c),'allocations',(select jsonb_agg(to_jsonb(a)) from public.budget_allocations a where contract_id=c.id)) into v_before;
    update public.budget_contracts set total_limit=(p_payload->>'total_limit')::numeric,version=version+1 where id=c.id returning * into c;
  end if;
  for v_item in select value from jsonb_array_elements(p_payload->'allocations') loop
    if not exists(select 1 from public.departments where id=(v_item->>'department_id')::uuid and tenant_id=v_tenant) then
      raise exception 'Secretaria fora da prefeitura'; end if;
    select coalesce(sum(reserved+realized+disputed),0) into v_used from public.budget_entries
      where contract_id=c.id and department_id=(v_item->>'department_id')::uuid;
    if (v_item->>'spending_limit')::numeric<v_used then raise exception 'A cota não pode ser menor que o valor já comprometido (R$ %)',v_used; end if;
    insert into public.budget_allocations values(c.id,(v_item->>'department_id')::uuid,(v_item->>'spending_limit')::numeric,
      trim(v_item->>'appropriation'),trim(v_item->>'funding_source'))
    on conflict(contract_id,department_id) do update set spending_limit=excluded.spending_limit,
      appropriation=excluded.appropriation,funding_source=excluded.funding_source;
  end loop;
  if (select sum(spending_limit) from public.budget_allocations where contract_id=c.id)>c.total_limit then
    raise exception 'A soma das cotas ultrapassa o teto global da licitação'; end if;
  if v_new then
    -- Reconcile actual expenses in the fiscal period, plus outstanding commitments.
    -- Existing data is read only: no change to operational records or workflow.
    for v_row in
      select 'fuelings'::text source,to_jsonb(f) body from public.fuelings f
      where c.category='fuel' and f.tenant_id=v_tenant and f.station_id in(select partner_id from public.budget_partners where contract_id=c.id)
        and ((coalesce(f.filled_at,f.authorized_at,f.created_at) at time zone 'America/Sao_Paulo')::date between c.starts_on and c.ends_on
          or f.workflow_status::text='autorizado')
      union all
      select 'station_operations',to_jsonb(o) from public.station_operations o
      where c.category='fuel' and o.tenant_id=v_tenant and o.station_id in(select partner_id from public.budget_partners where contract_id=c.id)
        and ((coalesce(o.executed_at,o.authorized_at) at time zone 'America/Sao_Paulo')::date between c.starts_on and c.ends_on or o.status='autorizado')
      union all
      select 'service_orders',to_jsonb(o) from public.service_orders o
      where c.category='maintenance' and o.tenant_id=v_tenant and o.repair_shop_id in(select partner_id from public.budget_partners where contract_id=c.id)
        and ((coalesce(o.received_at,o.approved_at,o.created_at) at time zone 'America/Sao_Paulo')::date between c.starts_on and c.ends_on
          or o.operational_status::text not in ('received','cancelled'))
    loop
      if not exists(select 1 from public.budget_entries where source_type=v_row.source and source_id=(v_row.body->>'id')::uuid) then
        perform sgf_private.book_budget(v_row.source,v_row.body,c.id);
      end if;
    end loop;
  end if;
  insert into public.budget_events(contract_id,actor_id,event_type,reason,before_value,after_value)
  values(c.id,auth.uid(),case when v_new then 'created' else 'reallocated' end,v_reason,v_before,
    jsonb_build_object('contract',to_jsonb(c),'allocations',(select jsonb_agg(to_jsonb(a)) from public.budget_allocations a where contract_id=c.id)));
  return c.id;
end $$;
revoke all on function public.save_department_budget(jsonb) from public, anon;
grant execute on function public.save_department_budget(jsonb) to authenticated;

create function public.get_department_budgets(p_year integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; result jsonb;
begin
  select * into p from public.profiles where id=auth.uid();
  if not coalesce(sgf_private.budget_reader(p.tenant_id,p.department_id),false) then raise exception 'Sem permissão para consultar cotas' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.reference),'[]') into result from (
    select c.*, (select jsonb_agg(bp.partner_id) from public.budget_partners bp where bp.contract_id=c.id) partner_ids,
      (select coalesce(jsonb_agg(to_jsonb(a) order by a.department_name),'[]') from (
        select ba.*,d.name department_name,coalesce(sum(e.reserved),0) reserved,coalesce(sum(e.realized),0) realized,
          coalesce(sum(e.disputed),0) disputed,
          ba.spending_limit-coalesce(sum(e.reserved+e.realized+e.disputed),0) available
        from public.budget_allocations ba join public.departments d on d.id=ba.department_id
        left join public.budget_entries e on e.contract_id=ba.contract_id and e.department_id=ba.department_id
        where ba.contract_id=c.id and (p.role<>'secretario' or ba.department_id=p.department_id)
        group by ba.contract_id,ba.department_id,d.name
      ) a) allocations
    from public.budget_contracts c where c.tenant_id=p.tenant_id and c.fiscal_year=p_year
      and (p.role<>'secretario' or exists(select 1 from public.budget_allocations ba where ba.contract_id=c.id and ba.department_id=p.department_id))
  ) x;
  return result;
end $$;
revoke all on function public.get_department_budgets(integer) from public, anon;
grant execute on function public.get_department_budgets(integer) to authenticated;

create function public.get_department_budget_events(p_contract_id uuid,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.budget_contracts;
begin
  select * into c from public.budget_contracts where id=p_contract_id;
  if c.id is null or not sgf_private.budget_reader(c.tenant_id) then raise exception 'Sem permissão para consultar a auditoria' using errcode='42501'; end if;
  if p_offset<0 then raise exception 'Página inválida'; end if;
  return (select jsonb_build_object('total',(select count(*) from public.budget_events where contract_id=c.id),
    'items',coalesce(jsonb_agg(to_jsonb(x) order by x.id desc),'[]')) from (
      select e.*,p.full_name actor_name from public.budget_events e left join public.profiles p on p.id=e.actor_id
      where e.contract_id=c.id order by e.id desc limit 25 offset p_offset
    ) x);
end $$;
revoke all on function public.get_department_budget_events(uuid,integer) from public,anon;
grant execute on function public.get_department_budget_events(uuid,integer) to authenticated;
