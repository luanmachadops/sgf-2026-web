-- ============================================================================
-- ETAPA 6 — Consultas fiscais e relatórios auditáveis dos postos
-- ============================================================================

create or replace function public.get_station_closing_register(
  p_from date default (current_date-interval '12 months')::date,
  p_to date default current_date,
  p_station_id uuid default null
)
returns table (
  closing_id uuid,protocol text,station_id uuid,station_name text,station_cnpj text,
  contract_number text,competence date,closing_status text,fiscal_status text,
  record_count integer,total_quantity numeric,total_amount numeric,snapshot_hash text,
  submitted_at timestamptz,reviewed_at timestamptz,commitment_number text,nad_number text,
  commitment_amount numeric,invoice_id uuid,invoice_number text,invoice_amount numeric,
  invoice_issued_on date,invoice_status text,invoice_attested_at timestamptz,
  scheduled_amount numeric,paid_amount numeric,next_payment_date date,last_payment_date date
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare uid uuid:=auth.uid();role_name text;tenant uuid;partner uuid;super boolean:=false;
begin
  select role,tenant_id,station_id,(role='superadmin') into role_name,tenant,partner,super
  from public.profiles where id=uid and not coalesce(access_blocked,false);
  if role_name not in ('posto','admin','gestor','secretario','superadmin') then
    raise exception 'Acesso não autorizado'; end if;
  return query
  select c.id,c.protocol,c.station_id,s.name,s.cnpj,s.contract_number,c.competence,
    c.status,c.fiscal_status,c.record_count,c.total_quantity,c.total_amount,c.snapshot_hash,
    c.submitted_at,c.reviewed_at,e.commitment_number,e.nad_number,a.amount,
    i.id,i.invoice_number,i.amount,i.issued_on,i.status,i.attested_at,
    coalesce(sum(p.amount),0),
    coalesce(sum(p.amount) filter(where p.paid_on is not null),0),
    min(p.scheduled_on) filter(where p.paid_on is null),max(p.paid_on)
  from public.station_monthly_closings c
  join public.fuel_stations s on s.id=c.station_id
  left join public.station_closing_commitments a on a.closing_id=c.id
  left join public.station_commitments e on e.id=a.commitment_id
  left join public.station_closing_invoices i on i.closing_id=c.id
  left join public.station_closing_payments p on p.closing_id=c.id
  where (super or c.tenant_id=tenant)
    and (role_name<>'posto' or c.station_id=partner)
    and (p_station_id is null or c.station_id=p_station_id)
    and c.competence between date_trunc('month',coalesce(p_from,current_date-interval '12 months'))::date
      and date_trunc('month',coalesce(p_to,current_date))::date
  group by c.id,s.id,e.id,a.amount,i.id
  order by c.competence desc,s.name,c.protocol;
end $$;

create or replace function public.get_station_closing_audit_report(p_closing_id uuid)
returns table (
  closing_id uuid,closing_protocol text,competence date,station_name text,station_cnpj text,
  contract_number text,closing_status text,fiscal_status text,snapshot_hash text,
  source_kind text,source_protocol text,executed_at timestamptz,plate text,
  vehicle_name text,department_name text,driver_name text,authorizer_name text,
  item_kind text,item_name text,unit text,quantity numeric,unit_price numeric,
  total_cost numeric,previous_odometer integer,odometer integer,distance_km integer,
  efficiency numeric,receipt_number text,evidence_count integer,has_anomaly boolean,
  anomaly_note text
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare uid uuid:=auth.uid();role_name text;tenant uuid;partner uuid;super boolean:=false;
begin
  select role,tenant_id,station_id,(role='superadmin') into role_name,tenant,partner,super
  from public.profiles where id=uid and not coalesce(access_blocked,false);
  if role_name not in ('posto','admin','gestor','secretario','superadmin') then
    raise exception 'Acesso não autorizado'; end if;
  return query
  select c.id,c.protocol,c.competence,s.name,s.cnpj,s.contract_number,c.status,
    c.fiscal_status,c.snapshot_hash,i.source_kind,i.source_protocol,i.executed_at,
    i.plate,i.vehicle_name,i.department_name,i.driver_name,i.authorizer_name,
    i.item_kind,i.item_name,i.unit,i.quantity,i.unit_price,i.total_cost,
    i.previous_odometer,i.odometer,i.distance_km,i.efficiency,i.receipt_number,
    jsonb_array_length(i.evidence_paths),i.has_anomaly,i.anomaly_note
  from public.station_monthly_closings c
  join public.fuel_stations s on s.id=c.station_id
  join public.station_monthly_closing_items i on i.closing_id=c.id
  where c.id=p_closing_id and (super or c.tenant_id=tenant)
    and (role_name<>'posto' or c.station_id=partner)
  order by i.executed_at,i.source_kind,i.source_id;
end $$;

create or replace function public.get_station_closing_events(p_closing_id uuid)
returns table (
  event_id bigint,from_status text,to_status text,actor_name text,
  actor_role text,note text,created_at timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare uid uuid:=auth.uid();role_name text;tenant uuid;partner uuid;super boolean:=false;
begin
  select role,tenant_id,station_id,(role='superadmin') into role_name,tenant,partner,super
  from public.profiles where id=uid and not coalesce(access_blocked,false);
  if role_name not in ('posto','admin','gestor','secretario','superadmin') then
    raise exception 'Acesso não autorizado'; end if;
  return query select e.id,e.from_status,e.to_status,p.full_name,e.actor_role,e.note,e.created_at
  from public.station_monthly_closing_events e
  join public.station_monthly_closings c on c.id=e.closing_id
  join public.profiles p on p.id=e.actor_id
  where c.id=p_closing_id and (super or c.tenant_id=tenant)
    and (role_name<>'posto' or c.station_id=partner)
  order by e.created_at,e.id;
end $$;

create or replace function public.get_station_fiscal_dashboard(
  p_station_id uuid default null,p_months integer default 12
)
returns table (
  station_id uuid,station_name text,total_closings bigint,pending_review bigint,
  pending_commitment bigint,pending_invoice bigint,pending_attestation bigint,
  pending_payment bigint,paid_closings bigint,closed_amount numeric,
  invoiced_amount numeric,paid_amount numeric,open_amount numeric,
  integrity_failures bigint
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare uid uuid:=auth.uid();role_name text;tenant uuid;partner uuid;super boolean:=false;
begin
  select role,tenant_id,station_id,(role='superadmin') into role_name,tenant,partner,super
  from public.profiles where id=uid and not coalesce(access_blocked,false);
  if role_name not in ('posto','admin','gestor','secretario','superadmin') then
    raise exception 'Acesso não autorizado'; end if;
  return query
  select s.id,s.name,count(c.id),
    count(c.id) filter(where c.status='enviado'),
    count(c.id) filter(where c.status='aprovado' and c.fiscal_status='aguardando_empenho'),
    count(c.id) filter(where c.fiscal_status='coberto'),
    count(c.id) filter(where c.fiscal_status='nota_enviada'),
    count(c.id) filter(where c.fiscal_status in ('atestado','pagamento_programado')),
    count(c.id) filter(where c.fiscal_status='pago'),
    coalesce(sum(c.total_amount),0),coalesce(sum(i.amount),0),
    coalesce(sum(pay.paid),0),
    greatest(coalesce(sum(i.amount),0)-coalesce(sum(pay.paid),0),0),
    count(c.id) filter(where c.snapshot_hash<>public.station_closing_calculate_hash(c.id))
  from public.fuel_stations s
  left join public.station_monthly_closings c on c.station_id=s.id
    and c.competence>=date_trunc('month',current_date)-(greatest(coalesce(p_months,12),1)-1)*interval '1 month'
    and c.status<>'cancelado'
  left join public.station_closing_invoices i on i.closing_id=c.id and i.status<>'rejeitada'
  left join lateral (
    select coalesce(sum(p.amount) filter(where p.paid_on is not null),0) paid
    from public.station_closing_payments p where p.closing_id=c.id
  ) pay on true
  where (super or s.tenant_id=tenant)
    and (role_name<>'posto' or s.id=partner)
    and (p_station_id is null or s.id=p_station_id)
  group by s.id
  order by s.name;
end $$;

-- O painel contratual agora exibe fatos fiscais reais dos postos.
create or replace function public.get_partner_contract_usage()
returns table (
  partner_kind text,partner_id uuid,partner_name text,contract_number text,
  contract_start date,contract_end date,contract_value numeric,reserved_value numeric,
  realized_value numeric,disputed_value numeric,consumed_value numeric,
  invoiced_value numeric,paid_value numeric,remaining_value numeric,
  consumed_percent numeric,month_realized_value numeric,month_contract_percent numeric,
  days_remaining integer,is_active boolean,can_create_new boolean
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare ctx record;
begin
  select * into ctx from public.partner_read_context();
  if ctx.kind='posto' then
    return query select 'posto'::text,s.id,s.name,s.contract_number,s.contract_start,s.contract_end,
      s.contract_value,u.reserved_value,u.realized_value,u.disputed_value,u.consumed_value,
      coalesce(f.invoiced,0),coalesce(f.paid,0),
      case when s.contract_value is null then null else greatest(s.contract_value-u.consumed_value,0) end,
      case when coalesce(s.contract_value,0)<=0 then null else round(u.consumed_value/s.contract_value*100,2) end,
      u.month_realized_value,
      case when coalesce(s.contract_value,0)<=0 then null else round(u.month_realized_value/s.contract_value*100,2) end,
      case when s.contract_end is null then null else s.contract_end-current_date end,s.is_active,
      s.is_active and (s.contract_start is null or s.contract_start<=current_date)
        and (s.contract_end is null or s.contract_end>=current_date)
        and (s.contract_value is null or u.consumed_value<s.contract_value)
        and public.station_commitment_total_available(s.id,current_date)>0
    from public.fuel_stations s
    cross join lateral public.station_contract_usage(s.id) u
    left join lateral (
      select coalesce(sum(i.amount) filter(where i.status<>'rejeitada'),0) invoiced,
        coalesce(sum(p.amount) filter(where p.paid_on is not null),0) paid
      from public.station_monthly_closings c
      left join public.station_closing_invoices i on i.closing_id=c.id
      left join public.station_closing_payments p on p.closing_id=c.id
      where c.station_id=s.id
    ) f on true
    where s.id=ctx.partner_id and s.tenant_id=ctx.tenant_id;
  else
    return query select 'oficina'::text,o.id,o.name,o.contract_number,o.contract_start,o.contract_end,
      o.contract_value,u.reserved_value,u.realized_value,u.disputed_value,u.consumed_value,
      u.invoiced_value,u.paid_value,
      case when o.contract_value is null then null else greatest(o.contract_value-u.consumed_value,0) end,
      case when coalesce(o.contract_value,0)<=0 then null else round(u.consumed_value/o.contract_value*100,2) end,
      u.month_realized_value,
      case when coalesce(o.contract_value,0)<=0 then null else round(u.month_realized_value/o.contract_value*100,2) end,
      case when o.contract_end is null then null else o.contract_end-current_date end,o.is_active,
      o.is_active and (o.contract_start is null or o.contract_start<=current_date)
        and (o.contract_end is null or o.contract_end>=current_date)
        and (o.contract_value is null or u.consumed_value<o.contract_value)
    from public.repair_shops o cross join lateral public.repair_shop_contract_usage(o.id) u
    where o.id=ctx.partner_id and o.tenant_id=ctx.tenant_id;
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'get_station_closing_register(date,date,uuid)',
    'get_station_closing_audit_report(uuid)',
    'get_station_closing_events(uuid)',
    'get_station_fiscal_dashboard(uuid,integer)'
  ] loop
    execute format('revoke all on function public.%s from public,anon',f);
    execute format('grant execute on function public.%s to authenticated',f);
  end loop;
end $$;

revoke all on function public.get_partner_contract_usage() from public,anon;
grant execute on function public.get_partner_contract_usage() to authenticated;
