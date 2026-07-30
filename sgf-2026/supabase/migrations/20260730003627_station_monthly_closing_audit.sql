-- ============================================================================
-- ETAPA 4 — Fechamento mensal auditável dos postos
-- O envio congela uma fotografia dos registros e gera protocolo + SHA-256.
-- ============================================================================

create extension if not exists pgcrypto;

create table public.station_monthly_closings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  station_id uuid not null references public.fuel_stations(id) on delete restrict,
  competence date not null,
  protocol text not null unique,
  status text not null default 'rascunho'
    check (status in ('rascunho','enviado','devolvido','aprovado','cancelado')),
  record_count integer not null default 0,
  total_quantity numeric(14,3) not null default 0,
  total_amount numeric(14,2) not null default 0,
  snapshot_hash text,
  submitted_by uuid references public.profiles(id) on delete restrict,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint station_closing_competence_first_day
    check (competence = date_trunc('month', competence)::date),
  constraint station_closing_snapshot_required check (
    status in ('rascunho','cancelado')
    or (record_count > 0 and total_amount > 0 and snapshot_hash is not null
        and submitted_by is not null and submitted_at is not null)
  )
);

create unique index station_monthly_closings_station_competence_active_uidx
  on public.station_monthly_closings (station_id, competence)
  where status <> 'cancelado';
create index station_monthly_closings_tenant_status_idx
  on public.station_monthly_closings (tenant_id, status, competence desc);

create table public.station_monthly_closing_items (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.station_monthly_closings(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  station_id uuid not null references public.fuel_stations(id) on delete restrict,
  source_kind text not null check (source_kind in ('abastecimento','operacao')),
  source_id uuid not null,
  source_protocol text not null,
  vehicle_id uuid not null,
  plate text not null,
  vehicle_name text,
  department_name text,
  driver_name text,
  authorizer_name text,
  item_kind text not null,
  item_name text not null,
  unit text not null,
  quantity numeric(14,3) not null,
  unit_price numeric(14,4) not null,
  total_cost numeric(14,2) not null,
  odometer integer,
  previous_odometer integer,
  distance_km integer,
  efficiency numeric(10,2),
  receipt_number text,
  evidence_paths jsonb not null default '[]'::jsonb,
  has_anomaly boolean not null default false,
  anomaly_note text,
  executed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (closing_id, source_kind, source_id)
);

create index station_closing_items_closing_idx
  on public.station_monthly_closing_items (closing_id, executed_at, source_id);
create index station_closing_items_vehicle_idx
  on public.station_monthly_closing_items (vehicle_id, executed_at);

create table public.station_monthly_closing_events (
  id bigint generated always as identity primary key,
  closing_id uuid not null references public.station_monthly_closings(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  actor_role text not null,
  note text,
  created_at timestamptz not null default now()
);
create index station_closing_events_closing_idx
  on public.station_monthly_closing_events (closing_id, created_at, id);

alter table public.station_monthly_closings enable row level security;
alter table public.station_monthly_closing_items enable row level security;
alter table public.station_monthly_closing_events enable row level security;
revoke all on public.station_monthly_closings,
  public.station_monthly_closing_items,
  public.station_monthly_closing_events from public, anon, authenticated;
grant all on public.station_monthly_closings,
  public.station_monthly_closing_items,
  public.station_monthly_closing_events to service_role;

create or replace function public.station_closing_calculate_hash(p_closing_id uuid)
returns text
language sql stable security definer set search_path = public, pg_temp
as $$
  select encode(extensions.digest(coalesce(jsonb_agg(
    jsonb_build_object(
      'kind', i.source_kind, 'id', i.source_id, 'protocol', i.source_protocol,
      'plate', i.plate, 'department', i.department_name, 'driver', i.driver_name,
      'authorizer', i.authorizer_name, 'item', i.item_name, 'unit', i.unit,
      'quantity', i.quantity, 'unit_price', i.unit_price, 'total', i.total_cost,
      'odometer', i.odometer, 'previous_odometer', i.previous_odometer,
      'distance', i.distance_km, 'efficiency', i.efficiency,
      'receipt', i.receipt_number, 'evidence', i.evidence_paths,
      'anomaly', i.has_anomaly, 'anomaly_note', i.anomaly_note,
      'executed_at', i.executed_at
    ) order by i.executed_at, i.source_kind, i.source_id
  )::text, '[]'), 'sha256'), 'hex')
  from public.station_monthly_closing_items i
  where i.closing_id = p_closing_id
$$;
revoke all on function public.station_closing_calculate_hash(uuid)
  from public, anon, authenticated;

create or replace function public.partner_submit_station_monthly_closing(p_month date)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  ctx record; c record; v_id uuid; v_start timestamptz; v_end timestamptz;
  v_count integer; v_quantity numeric; v_total numeric; v_hash text;
begin
  select * into ctx from public.partner_context();
  if ctx.kind <> 'posto' then raise exception 'Somente postos'; end if;
  if p_month is null then raise exception 'Informe a competência'; end if;
  p_month := date_trunc('month', p_month)::date;
  if p_month > date_trunc('month', current_date)::date then
    raise exception 'Não é possível fechar uma competência futura'; end if;
  v_start := p_month::timestamp at time zone 'America/Sao_Paulo';
  v_end := (p_month + interval '1 month')::timestamp at time zone 'America/Sao_Paulo';

  if exists (
    select 1 from public.fuelings f
    where f.tenant_id=ctx.tenant_id and f.station_id=ctx.partner_id
      and f.filled_at>=v_start and f.filled_at<v_end and f.workflow_status::text='concluido'
  ) or exists (
    select 1 from public.station_operations o
    where o.tenant_id=ctx.tenant_id and o.station_id=ctx.partner_id
      and o.executed_at>=v_start and o.executed_at<v_end and o.status='concluido'
  ) then raise exception 'Existem registros aguardando validação da prefeitura'; end if;

  select * into c from public.station_monthly_closings
   where station_id=ctx.partner_id and competence=p_month and status<>'cancelado'
   for update;
  if c.id is not null and c.status not in ('rascunho','devolvido') then
    raise exception 'Esta competência já foi enviada no protocolo %', c.protocol; end if;
  if c.id is null then
    insert into public.station_monthly_closings
      (tenant_id,station_id,competence,protocol,status)
    values (
      ctx.tenant_id,ctx.partner_id,p_month,
      'FEC-'||to_char(p_month,'YYYYMM')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
      'rascunho'
    ) returning id into v_id;
  else
    v_id := c.id;
    delete from public.station_monthly_closing_items where closing_id=v_id;
  end if;

  insert into public.station_monthly_closing_items (
    closing_id,tenant_id,station_id,source_kind,source_id,source_protocol,
    vehicle_id,plate,vehicle_name,department_name,driver_name,authorizer_name,
    item_kind,item_name,unit,quantity,unit_price,total_cost,odometer,
    previous_odometer,distance_km,efficiency,receipt_number,evidence_paths,
    has_anomaly,anomaly_note,executed_at
  )
  with valid_fuel as (
    select f.*,
      lag(f.odometer) over (
        partition by f.vehicle_id
        order by coalesce(f.filled_at,f.created_at), f.id
      ) previous_odo
    from public.fuelings f
    where f.tenant_id=ctx.tenant_id and f.station_id=ctx.partner_id
      and f.workflow_status::text='validado'
      and f.filled_at < v_end
  )
  select v_id,ctx.tenant_id,ctx.partner_id,'abastecimento',f.id,
    'ABT-'||upper(substr(replace(f.id::text,'-',''),1,12)),
    f.vehicle_id,coalesce(v.plate,v.unit_code),concat_ws(' ',v.brand,v.model),
    dep.name,d.full_name,a.full_name,'combustivel',initcap(f.fuel_type),'L',
    f.liters,f.price_per_liter,f.total_cost,f.odometer,f.previous_odo,
    case when f.previous_odo is null then null else f.odometer-f.previous_odo end,
    f.km_per_liter,f.pump_receipt_number,
    jsonb_strip_nulls(jsonb_build_array(
      f.photo_pump_url,f.photo_receipt_url,f.photo_dashboard_url,f.photo_requisition_url
    )),
    coalesce(f.has_anomaly,false),f.anomaly_type,f.filled_at
  from valid_fuel f
  join public.vehicles v on v.id=f.vehicle_id
  left join public.departments dep on dep.id=v.department_id
  left join public.profiles d on d.id=f.driver_id
  left join public.profiles a on a.id=f.authorized_by
  where f.filled_at>=v_start and f.filled_at<v_end;

  insert into public.station_monthly_closing_items (
    closing_id,tenant_id,station_id,source_kind,source_id,source_protocol,
    vehicle_id,plate,vehicle_name,department_name,driver_name,authorizer_name,
    item_kind,item_name,unit,quantity,unit_price,total_cost,odometer,
    previous_odometer,distance_km,efficiency,receipt_number,evidence_paths,
    has_anomaly,anomaly_note,executed_at
  )
  select v_id,ctx.tenant_id,ctx.partner_id,'operacao',o.id,o.protocol,
    o.vehicle_id,coalesce(v.plate,v.unit_code),concat_ws(' ',v.brand,v.model),
    dep.name,d.full_name,a.full_name,o.item_kind,o.item_name,o.unit,
    o.quantity,o.unit_price,o.total_cost,o.odometer,null,null,null,
    o.receipt_number,jsonb_build_array(o.evidence_path),false,null,o.executed_at
  from public.station_operations o
  join public.vehicles v on v.id=o.vehicle_id
  left join public.departments dep on dep.id=o.department_id
  left join public.profiles d on d.id=o.driver_id
  left join public.profiles a on a.id=o.authorized_by
  where o.tenant_id=ctx.tenant_id and o.station_id=ctx.partner_id
    and o.status='validado' and o.executed_at>=v_start and o.executed_at<v_end;

  select count(*),coalesce(sum(quantity),0),coalesce(sum(total_cost),0)
    into v_count,v_quantity,v_total
  from public.station_monthly_closing_items where closing_id=v_id;
  if v_count=0 then raise exception 'Não há registros validados para esta competência'; end if;
  v_hash := public.station_closing_calculate_hash(v_id);

  update public.station_monthly_closings set
    status='enviado',record_count=v_count,total_quantity=v_quantity,
    total_amount=v_total,snapshot_hash=v_hash,submitted_by=ctx.profile_id,
    submitted_at=now(),reviewed_by=null,reviewed_at=null,review_note=null,
    updated_at=now()
  where id=v_id;
  insert into public.station_monthly_closing_events
    (closing_id,tenant_id,from_status,to_status,actor_id,actor_role,note)
  values (v_id,ctx.tenant_id,coalesce(c.status,'rascunho'),'enviado',
          ctx.profile_id,'posto','Fechamento mensal enviado para conferência');
  return v_id;
end $$;

create or replace function public.get_station_closings(
  p_month date default null, p_station_id uuid default null
)
returns table (
  closing_id uuid,protocol text,station_id uuid,station_name text,competence date,
  status text,record_count integer,total_quantity numeric,total_amount numeric,
  snapshot_hash text,submitted_at timestamptz,reviewed_at timestamptz,
  review_note text,submitted_by_name text,reviewed_by_name text
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare uid uuid:=auth.uid(); role_name text; tenant uuid; partner uuid; super boolean:=false;
begin
  select p.role,p.tenant_id,p.station_id,(p.role='superadmin')
    into role_name,tenant,partner,super from public.profiles p where p.id=uid;
  if role_name is null or coalesce((select access_blocked from public.profiles where id=uid),false) then
    raise exception 'Acesso não autorizado'; end if;
  if role_name not in ('posto','admin','gestor','secretario','superadmin') then
    raise exception 'Acesso não autorizado'; end if;
  return query
    select c.id,c.protocol,c.station_id,s.name,c.competence,c.status,
      c.record_count,c.total_quantity,c.total_amount,c.snapshot_hash,
      c.submitted_at,c.reviewed_at,c.review_note,sub.full_name,rev.full_name
    from public.station_monthly_closings c
    join public.fuel_stations s on s.id=c.station_id
    left join public.profiles sub on sub.id=c.submitted_by
    left join public.profiles rev on rev.id=c.reviewed_by
    where (super or c.tenant_id=tenant)
      and (role_name<>'posto' or c.station_id=partner)
      and (p_station_id is null or c.station_id=p_station_id)
      and (p_month is null or c.competence=date_trunc('month',p_month)::date)
    order by c.competence desc,s.name;
end $$;

create or replace function public.get_station_closing_items(p_closing_id uuid)
returns setof public.station_monthly_closing_items
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare uid uuid:=auth.uid(); role_name text; tenant uuid; partner uuid; super boolean:=false;
begin
  select role,tenant_id,station_id,(role='superadmin') into role_name,tenant,partner,super
  from public.profiles where id=uid and not coalesce(access_blocked,false);
  if role_name not in ('posto','admin','gestor','secretario','superadmin') then
    raise exception 'Acesso não autorizado'; end if;
  return query select i.* from public.station_monthly_closing_items i
  join public.station_monthly_closings c on c.id=i.closing_id
  where c.id=p_closing_id and (super or c.tenant_id=tenant)
    and (role_name<>'posto' or c.station_id=partner)
  order by i.executed_at,i.source_kind,i.source_id;
end $$;

create or replace function public.manager_review_station_closing(
  p_closing_id uuid,p_approved boolean,p_note text default null
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare ctx record;c record;v_hash text;
begin
  select * into ctx from public.service_order_manager_context();
  select * into c from public.station_monthly_closings
   where id=p_closing_id and (ctx.superadmin or tenant_id=ctx.tenant_id) for update;
  if c.id is null then raise exception 'Fechamento não encontrado'; end if;
  if c.status<>'enviado' then raise exception 'Fechamento não aguarda conferência'; end if;
  if not p_approved and nullif(trim(p_note),'') is null then
    raise exception 'Informe o motivo da devolução'; end if;
  v_hash:=public.station_closing_calculate_hash(c.id);
  if v_hash<>c.snapshot_hash then raise exception 'Falha de integridade: o conteúdo foi alterado'; end if;
  update public.station_monthly_closings set
    status=case when p_approved then 'aprovado' else 'devolvido' end,
    reviewed_by=ctx.profile_id,reviewed_at=now(),
    review_note=nullif(trim(p_note),''),updated_at=now()
  where id=c.id;
  insert into public.station_monthly_closing_events
    (closing_id,tenant_id,from_status,to_status,actor_id,actor_role,note)
  values (c.id,c.tenant_id,'enviado',
    case when p_approved then 'aprovado' else 'devolvido' end,
    ctx.profile_id,'gestao',nullif(trim(p_note),''));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'partner_submit_station_monthly_closing(date)',
    'get_station_closings(date,uuid)',
    'get_station_closing_items(uuid)',
    'manager_review_station_closing(uuid,boolean,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon',f);
    execute format('grant execute on function public.%s to authenticated',f);
  end loop;
end $$;
