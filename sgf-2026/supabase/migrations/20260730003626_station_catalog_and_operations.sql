-- ============================================================================
-- ETAPA 3 — Catálogo e operações complementares dos postos
-- ARLA é insumo, não combustível de propulsão. Lubrificantes e serviços
-- também possuem fluxo próprio, mas compartilham contrato e protocolo digital.
-- ============================================================================

create table public.station_catalog_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  station_id uuid not null references public.fuel_stations(id) on delete cascade,
  code text,
  kind text not null check (kind in ('combustivel','arla','lubrificante','servico')),
  name text not null check (length(trim(name)) between 2 and 120),
  unit text not null check (unit in ('L','UN','KG','SERVICO')),
  unit_price numeric(12,4),
  active boolean not null default true,
  requires_odometer boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint station_catalog_price_positive
    check (unit_price is null or unit_price > 0)
);

create unique index station_catalog_items_station_name_uidx
  on public.station_catalog_items (station_id, lower(name));
create index station_catalog_items_tenant_station_idx
  on public.station_catalog_items (tenant_id, station_id, active, kind);

comment on table public.station_catalog_items is
  'Itens contratados do posto. ARLA, lubrificantes e serviços não são gravados como combustível do veículo.';

create table public.station_operations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  station_id uuid not null references public.fuel_stations(id) on delete restrict,
  catalog_item_id uuid not null references public.station_catalog_items(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  driver_id uuid references public.profiles(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  protocol text not null unique,
  item_kind text not null check (item_kind in ('arla','lubrificante','servico')),
  item_name text not null,
  unit text not null check (unit in ('L','UN','KG','SERVICO')),
  status text not null default 'autorizado'
    check (status in ('autorizado','concluido','validado','rejeitado','cancelado')),
  authorized_quantity numeric(12,3) not null check (authorized_quantity > 0),
  quantity numeric(12,3),
  unit_price numeric(12,4) not null check (unit_price > 0),
  total_cost numeric(14,2),
  odometer integer,
  authorization_note text,
  authorized_by uuid not null references public.profiles(id) on delete restrict,
  authorized_at timestamptz not null default now(),
  expires_at timestamptz not null,
  executed_by uuid references public.profiles(id) on delete restrict,
  executed_at timestamptz,
  receipt_number text,
  evidence_path text,
  validated_by uuid references public.profiles(id) on delete restrict,
  validated_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint station_operation_execution_complete check (
    (status in ('autorizado','cancelado') and quantity is null and total_cost is null)
    or
    (status in ('concluido','validado','rejeitado')
      and quantity > 0 and total_cost > 0 and executed_at is not null
      and receipt_number is not null and evidence_path is not null)
  ),
  constraint station_operation_quantity_limit check (
    quantity is null or quantity <= authorized_quantity
  )
);

create index station_operations_station_status_idx
  on public.station_operations (station_id, status, authorized_at desc);
create index station_operations_tenant_executed_idx
  on public.station_operations (tenant_id, executed_at desc)
  where executed_at is not null;
create index station_operations_vehicle_idx
  on public.station_operations (vehicle_id, executed_at desc);
create index station_operations_department_idx
  on public.station_operations (department_id, executed_at desc);

alter table public.station_catalog_items enable row level security;
alter table public.station_operations enable row level security;
revoke all on public.station_catalog_items, public.station_operations
  from public, anon, authenticated;
grant all on public.station_catalog_items, public.station_operations to service_role;

-- Compatibilidade: transforma os preços atuais de combustível em catálogo.
insert into public.station_catalog_items
  (tenant_id, station_id, kind, name, unit, unit_price, active)
select s.tenant_id, s.id, 'combustivel',
       initcap(fp.key), 'L', nullif(fp.value, '')::numeric, true
from public.fuel_stations s
cross join lateral jsonb_each_text(coalesce(s.fuel_prices, '{}'::jsonb)) fp
where nullif(fp.value, '')::numeric > 0
on conflict do nothing;

-- ARLA fica visível no catálogo, mas inativo até a prefeitura informar o preço
-- do item da licitação. Assim não existe autorização sem preço contratual.
insert into public.station_catalog_items
  (tenant_id, station_id, code, kind, name, unit, active, requires_odometer)
select s.tenant_id, s.id, 'ARLA32', 'arla', 'ARLA 32', 'L', false, true
from public.fuel_stations s
on conflict do nothing;

create or replace function public.manager_list_station_catalog(
  p_station_id uuid default null,
  p_include_inactive boolean default false
)
returns table (
  item_id uuid, station_id uuid, station_name text, kind text, name text,
  unit text, unit_price numeric, active boolean, requires_odometer boolean
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare ctx record;
begin
  select * into ctx from public.service_order_manager_context();
  return query
    select i.id, i.station_id, s.name, i.kind, i.name, i.unit,
           i.unit_price, i.active, i.requires_odometer
    from public.station_catalog_items i
    join public.fuel_stations s on s.id = i.station_id
    where (ctx.superadmin or i.tenant_id = ctx.tenant_id)
      and (p_station_id is null or i.station_id = p_station_id)
      and (p_include_inactive or i.active)
    order by s.name, i.kind, i.name;
end $$;

create or replace function public.manager_upsert_station_catalog_item(
  p_station_id uuid,
  p_item_id uuid,
  p_kind text,
  p_name text,
  p_unit text,
  p_unit_price numeric,
  p_active boolean default true,
  p_requires_odometer boolean default true,
  p_code text default null
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare ctx record; s record; v_id uuid;
begin
  select * into ctx from public.service_order_manager_context();
  select * into s from public.fuel_stations
   where id = p_station_id and (ctx.superadmin or tenant_id = ctx.tenant_id);
  if s.id is null then raise exception 'Posto não encontrado'; end if;
  if p_kind not in ('combustivel','arla','lubrificante','servico') then
    raise exception 'Tipo de item inválido'; end if;
  if p_unit not in ('L','UN','KG','SERVICO') then
    raise exception 'Unidade inválida'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Informe o nome do item'; end if;
  if p_unit_price is null or p_unit_price <= 0 then
    raise exception 'Informe o preço contratual do item'; end if;

  if p_item_id is null then
    insert into public.station_catalog_items
      (tenant_id, station_id, code, kind, name, unit, unit_price, active, requires_odometer)
    values
      (s.tenant_id, s.id, nullif(trim(p_code), ''), p_kind, trim(p_name),
       p_unit, p_unit_price, coalesce(p_active, true), coalesce(p_requires_odometer, true))
    returning id into v_id;
  else
    update public.station_catalog_items
       set code = nullif(trim(p_code), ''), kind = p_kind, name = trim(p_name),
           unit = p_unit, unit_price = p_unit_price,
           active = coalesce(p_active, true),
           requires_odometer = coalesce(p_requires_odometer, true),
           updated_at = now()
     where id = p_item_id and station_id = s.id
     returning id into v_id;
    if v_id is null then raise exception 'Item contratual não encontrado'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.manager_create_station_operation(
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_station_id uuid,
  p_catalog_item_id uuid,
  p_quantity numeric,
  p_expires_at timestamptz default (now() + interval '1 day'),
  p_note text default null
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare ctx record; v record; s record; i record; v_id uuid; v_total numeric; v_consumed numeric;
begin
  select * into ctx from public.service_order_manager_context();
  select * into v from public.vehicles
   where id = p_vehicle_id and (ctx.superadmin or tenant_id = ctx.tenant_id);
  if v.id is null then raise exception 'Veículo não encontrado'; end if;
  if v.status::text = 'bloqueado' then raise exception 'Veículo bloqueado'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_driver_id and p.tenant_id = v.tenant_id
      and p.role = 'motorista' and coalesce(p.driver_status::text, 'ativo') = 'ativo'
      and not coalesce(p.access_blocked, false)
  ) then raise exception 'Motorista ativo não encontrado'; end if;

  select * into s from public.fuel_stations
   where id = p_station_id and tenant_id = v.tenant_id for update;
  if s.id is null or not s.is_active then raise exception 'Posto ativo não encontrado'; end if;
  if s.contract_start is not null and s.contract_start > current_date then
    raise exception 'O contrato do posto ainda não iniciou'; end if;
  if s.contract_end is not null and s.contract_end < current_date then
    raise exception 'O contrato do posto está vencido'; end if;

  select * into i from public.station_catalog_items
   where id = p_catalog_item_id and station_id = s.id and tenant_id = s.tenant_id;
  if i.id is null or not i.active or i.kind = 'combustivel' then
    raise exception 'Item complementar ativo não encontrado neste posto'; end if;
  if i.unit_price is null or i.unit_price <= 0 then
    raise exception 'Item sem preço contratual'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Informe uma quantidade válida'; end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '7 days' then
    raise exception 'A autorização deve vencer entre agora e 7 dias'; end if;

  v_total := round(p_quantity * i.unit_price, 2);
  select coalesce(public.station_contract_committed(s.id), 0) into v_consumed;
  if s.contract_value is not null and v_consumed + v_total > s.contract_value then
    raise exception 'A autorização de R$ % ultrapassa o saldo da licitação de R$ %',
      v_total, greatest(s.contract_value - v_consumed, 0); end if;

  insert into public.station_operations (
    tenant_id, station_id, catalog_item_id, vehicle_id, driver_id, department_id,
    protocol, item_kind, item_name, unit, authorized_quantity, unit_price,
    authorization_note, authorized_by, expires_at
  ) values (
    s.tenant_id, s.id, i.id, v.id, p_driver_id, v.department_id,
    'OPS-' || to_char(current_date, 'YYYYMM') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
    i.kind, i.name, i.unit, p_quantity, i.unit_price,
    nullif(trim(p_note), ''), ctx.profile_id, p_expires_at
  ) returning id into v_id;
  return v_id;
end $$;

create or replace function public.partner_get_pending_station_operations()
returns table (
  operation_id uuid, protocol text, plate text, brand text, model text,
  item_kind text, item_name text, unit text, authorized_quantity numeric,
  unit_price numeric, authorized_at timestamptz, expires_at timestamptz, note text
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare ctx record;
begin
  select * into ctx from public.partner_read_context();
  if ctx.kind <> 'posto' then raise exception 'Somente postos'; end if;
  return query
    select o.id, o.protocol, v.plate, v.brand, v.model, o.item_kind,
           o.item_name, o.unit, o.authorized_quantity, o.unit_price,
           o.authorized_at, o.expires_at, o.authorization_note
    from public.station_operations o
    join public.vehicles v on v.id = o.vehicle_id
    where o.tenant_id = ctx.tenant_id and o.station_id = ctx.partner_id
      and o.status = 'autorizado' and o.expires_at > now()
    order by o.authorized_at;
end $$;

create or replace function public.partner_complete_station_operation(
  p_operation_id uuid,
  p_quantity numeric,
  p_odometer integer,
  p_receipt_number text,
  p_evidence_path text
)
returns table (total_cost numeric, unit_price numeric, protocol text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare ctx record; o record; i record; v_total numeric;
begin
  select * into ctx from public.partner_context();
  if ctx.kind <> 'posto' then raise exception 'Somente postos'; end if;
  select * into o from public.station_operations
   where id = p_operation_id and tenant_id = ctx.tenant_id and station_id = ctx.partner_id
   for update;
  if o.id is null then raise exception 'Autorização não encontrada'; end if;
  if o.status <> 'autorizado' then raise exception 'Autorização já utilizada ou encerrada'; end if;
  if o.expires_at <= now() then raise exception 'Autorização vencida'; end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > o.authorized_quantity then
    raise exception 'Quantidade inválida ou acima do limite autorizado'; end if;
  if nullif(trim(p_receipt_number), '') is null then raise exception 'Informe o comprovante'; end if;
  if nullif(trim(p_evidence_path), '') is null then raise exception 'Anexe a evidência digital'; end if;
  select * into i from public.station_catalog_items where id = o.catalog_item_id;
  if i.requires_odometer and coalesce(p_odometer, 0) <= 0 then
    raise exception 'Informe o hodômetro'; end if;
  v_total := round(p_quantity * o.unit_price, 2);
  update public.station_operations set
    status = 'concluido', quantity = p_quantity, total_cost = v_total,
    odometer = p_odometer, receipt_number = trim(p_receipt_number),
    evidence_path = trim(p_evidence_path), executed_by = ctx.profile_id,
    executed_at = now(), updated_at = now()
  where id = o.id;
  return query select v_total, o.unit_price, o.protocol;
end $$;

create or replace function public.manager_get_station_operations(
  p_from date default (current_date - 90),
  p_to date default current_date,
  p_station_id uuid default null
)
returns table (
  operation_id uuid, protocol text, station_name text, plate text,
  vehicle_name text, driver_name text, department_name text, authorizer_name text,
  item_kind text, item_name text, unit text, quantity numeric, unit_price numeric,
  total_cost numeric, odometer integer, receipt_number text, evidence_path text,
  status text, authorized_at timestamptz, executed_at timestamptz, rejection_reason text
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare ctx record;
begin
  select * into ctx from public.service_order_manager_context();
  if coalesce(p_from, current_date - 90) > coalesce(p_to, current_date) then
    raise exception 'Período inválido'; end if;
  return query
    select o.id, o.protocol, s.name, v.plate,
           concat_ws(' ', v.brand, v.model), d.full_name, dep.name, a.full_name,
           o.item_kind, o.item_name, o.unit, o.quantity, o.unit_price,
           o.total_cost, o.odometer, o.receipt_number, o.evidence_path,
           o.status, o.authorized_at, o.executed_at, o.rejection_reason
    from public.station_operations o
    join public.fuel_stations s on s.id = o.station_id
    join public.vehicles v on v.id = o.vehicle_id
    left join public.profiles d on d.id = o.driver_id
    left join public.departments dep on dep.id = o.department_id
    left join public.profiles a on a.id = o.authorized_by
    where (ctx.superadmin or o.tenant_id = ctx.tenant_id)
      and (p_station_id is null or o.station_id = p_station_id)
      and o.authorized_at >= coalesce(p_from, current_date - 90)::timestamptz
      and o.authorized_at < (coalesce(p_to, current_date) + 1)::timestamptz
    order by o.authorized_at desc;
end $$;

create or replace function public.manager_review_station_operation(
  p_operation_id uuid, p_approved boolean, p_note text default null
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare ctx record; o record;
begin
  select * into ctx from public.service_order_manager_context();
  select * into o from public.station_operations
   where id = p_operation_id and (ctx.superadmin or tenant_id = ctx.tenant_id)
   for update;
  if o.id is null then raise exception 'Operação não encontrada'; end if;
  if o.status <> 'concluido' then raise exception 'Operação não aguarda validação'; end if;
  if not p_approved and nullif(trim(p_note), '') is null then
    raise exception 'Informe o motivo da rejeição'; end if;
  update public.station_operations set
    status = case when p_approved then 'validado' else 'rejeitado' end,
    validated_by = ctx.profile_id, validated_at = now(),
    rejection_reason = case when p_approved then null else trim(p_note) end,
    updated_at = now()
  where id = o.id;
end $$;

-- O teto do posto passa a considerar todos os itens, sem somar fases
-- financeiras cumulativas.
create or replace function public.station_contract_usage(p_station_id uuid)
returns table (
  reserved_value numeric, realized_value numeric, disputed_value numeric,
  consumed_value numeric, month_realized_value numeric
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with fuel as (
    select
      coalesce(sum(case when f.workflow_status::text = 'autorizado'
        and f.cancelled_at is null and (f.expires_at is null or f.expires_at > now())
        then round(coalesce(f.max_liters, v.tank_capacity, 0) *
          coalesce(f.price_per_liter, (
            select nullif(fp.value,'')::numeric
            from jsonb_each_text(coalesce(s.fuel_prices,'{}'::jsonb)) fp
            where lower(fp.key)=lower(f.fuel_type) limit 1), 0), 2) else 0 end),0) reserved,
      coalesce(sum(case when f.filled_at is not null and f.workflow_status::text in
        ('concluido','validado','lancado_direto') then coalesce(f.total_cost,0) else 0 end),0) realized,
      coalesce(sum(case when f.filled_at is not null and f.workflow_status::text='rejeitado_admin'
        then coalesce(f.total_cost,0) else 0 end),0) disputed,
      coalesce(sum(case when f.filled_at >= date_trunc('month',now())
        and f.workflow_status::text in ('concluido','validado','lancado_direto')
        then coalesce(f.total_cost,0) else 0 end),0) month_realized
    from public.fuel_stations s
    left join public.fuelings f on f.station_id=s.id
    left join public.vehicles v on v.id=f.vehicle_id
    where s.id=p_station_id
  ), ops as (
    select
      coalesce(sum(case when status='autorizado' and expires_at>now()
        then round(authorized_quantity*unit_price,2) else 0 end),0) reserved,
      coalesce(sum(case when status in ('concluido','validado')
        then coalesce(total_cost,0) else 0 end),0) realized,
      coalesce(sum(case when status='rejeitado' then coalesce(total_cost,0) else 0 end),0) disputed,
      coalesce(sum(case when executed_at>=date_trunc('month',now())
        and status in ('concluido','validado') then coalesce(total_cost,0) else 0 end),0) month_realized
    from public.station_operations where station_id=p_station_id
  )
  select f.reserved+o.reserved, f.realized+o.realized, f.disputed+o.disputed,
         f.reserved+o.reserved+f.realized+o.realized+f.disputed+o.disputed,
         f.month_realized+o.month_realized
  from fuel f cross join ops o
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'manager_list_station_catalog(uuid,boolean)',
    'manager_upsert_station_catalog_item(uuid,uuid,text,text,text,numeric,boolean,boolean,text)',
    'manager_create_station_operation(uuid,uuid,uuid,uuid,numeric,timestamptz,text)',
    'partner_get_pending_station_operations()',
    'partner_complete_station_operation(uuid,numeric,integer,text,text)',
    'manager_get_station_operations(date,date,uuid)',
    'manager_review_station_operation(uuid,boolean,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

revoke all on function public.station_contract_usage(uuid)
  from public, anon, authenticated;
