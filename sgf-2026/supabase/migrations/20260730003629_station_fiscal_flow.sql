-- ============================================================================
-- ETAPA 5 — Empenho prévio, nota fiscal, ateste e pagamento
-- Lei 4.320/1964, arts. 58-64: a despesa nasce coberta por empenho; fechamento
-- e NF documentam a liquidação, que precede o pagamento.
-- ============================================================================

create table public.station_commitments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  station_id uuid not null references public.fuel_stations(id) on delete restrict,
  commitment_number text not null,
  nad_number text,
  amount numeric(14,2) not null check (amount > 0),
  issued_on date not null,
  valid_from date not null,
  valid_until date not null,
  document_path text not null,
  status text not null default 'ativo' check (status in ('ativo','esgotado','cancelado')),
  registered_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, station_id, commitment_number),
  check (valid_until >= valid_from),
  check (issued_on <= valid_from)
);
create index station_commitments_station_validity_idx
  on public.station_commitments (station_id, status, valid_from, valid_until);

alter table public.station_monthly_closings
  add column fiscal_status text not null default 'aguardando_empenho'
    check (fiscal_status in (
      'aguardando_empenho','coberto','nota_enviada','atestado',
      'pagamento_programado','pago'
    ));

create table public.station_closing_commitments (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null unique references public.station_monthly_closings(id) on delete restrict,
  commitment_id uuid not null references public.station_commitments(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  linked_by uuid not null references public.profiles(id) on delete restrict,
  linked_at timestamptz not null default now()
);
create index station_closing_commitments_commitment_idx
  on public.station_closing_commitments (commitment_id);

create table public.station_closing_invoices (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null unique references public.station_monthly_closings(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  station_id uuid not null references public.fuel_stations(id) on delete restrict,
  invoice_number text not null,
  amount numeric(14,2) not null check (amount > 0),
  issued_on date not null,
  document_path text not null,
  status text not null default 'enviada' check (status in ('enviada','atestada','rejeitada')),
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  attested_by uuid references public.profiles(id) on delete restrict,
  attested_at timestamptz,
  attestation_note text,
  unique (tenant_id, station_id, invoice_number)
);

create table public.station_closing_payments (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.station_monthly_closings(id) on delete restrict,
  invoice_id uuid not null references public.station_closing_invoices(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  scheduled_on date not null,
  paid_on date,
  payment_reference text,
  receipt_path text,
  note text,
  registered_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (paid_on is null or paid_on >= scheduled_on)
);
create index station_closing_payments_closing_idx
  on public.station_closing_payments (closing_id, scheduled_on, paid_on);

alter table public.station_commitments enable row level security;
alter table public.station_closing_commitments enable row level security;
alter table public.station_closing_invoices enable row level security;
alter table public.station_closing_payments enable row level security;
revoke all on public.station_commitments,public.station_closing_commitments,
  public.station_closing_invoices,public.station_closing_payments
  from public,anon,authenticated;
grant all on public.station_commitments,public.station_closing_commitments,
  public.station_closing_invoices,public.station_closing_payments to service_role;

create or replace function public.station_commitment_available(p_commitment_id uuid)
returns numeric
language sql stable security definer set search_path = public, pg_temp
as $$
  select greatest(c.amount-coalesce(sum(a.amount),0),0)
  from public.station_commitments c
  left join public.station_closing_commitments a on a.commitment_id=c.id
  where c.id=p_commitment_id
  group by c.id,c.amount
$$;
revoke all on function public.station_commitment_available(uuid)
  from public,anon,authenticated;

create or replace function public.station_commitment_total_available(p_station_id uuid,p_on date)
returns numeric
language sql stable security definer set search_path = public, pg_temp
as $$
  select greatest(
    coalesce(sum(c.amount),0)
    - coalesce((select u.consumed_value from public.station_contract_usage(p_station_id) u),0),
    0
  )
  from public.station_commitments c
  where c.station_id=p_station_id and c.status in ('ativo','esgotado')
    and p_on between c.valid_from and c.valid_until and c.issued_on<=p_on
$$;
revoke all on function public.station_commitment_total_available(uuid,date)
  from public,anon,authenticated;

create or replace function public.manager_register_station_commitment(
  p_station_id uuid,p_commitment_number text,p_nad_number text,p_amount numeric,
  p_issued_on date,p_valid_from date,p_valid_until date,p_document_path text
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare ctx record;s record;v_id uuid;
begin
  select * into ctx from public.service_order_manager_context();
  select * into s from public.fuel_stations
   where id=p_station_id and (ctx.superadmin or tenant_id=ctx.tenant_id);
  if s.id is null then raise exception 'Posto não encontrado'; end if;
  if nullif(trim(p_commitment_number),'') is null then raise exception 'Informe o número do empenho'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Informe o valor do empenho'; end if;
  if p_issued_on is null or p_issued_on>current_date then raise exception 'Data de emissão inválida'; end if;
  if p_valid_from is null or p_valid_until is null or p_valid_until<p_valid_from then
    raise exception 'Vigência inválida'; end if;
  if p_issued_on>p_valid_from then raise exception 'O empenho deve ser prévio ao início da cobertura'; end if;
  if nullif(trim(p_document_path),'') is null then raise exception 'Anexe a nota de empenho'; end if;
  if s.contract_value is not null and p_amount>s.contract_value then
    raise exception 'O empenho excede o valor total da licitação'; end if;
  insert into public.station_commitments (
    tenant_id,station_id,commitment_number,nad_number,amount,issued_on,
    valid_from,valid_until,document_path,registered_by
  ) values (
    s.tenant_id,s.id,trim(p_commitment_number),nullif(trim(p_nad_number),''),
    p_amount,p_issued_on,p_valid_from,p_valid_until,trim(p_document_path),ctx.profile_id
  ) returning id into v_id;
  return v_id;
end $$;

create or replace function public.manager_list_station_commitments(p_station_id uuid default null)
returns table (
  commitment_id uuid,station_id uuid,station_name text,commitment_number text,
  nad_number text,amount numeric,allocated_amount numeric,available_amount numeric,
  issued_on date,valid_from date,valid_until date,document_path text,status text
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare ctx record;
begin
  select * into ctx from public.service_order_manager_context();
  return query select c.id,c.station_id,s.name,c.commitment_number,c.nad_number,c.amount,
    c.amount-public.station_commitment_available(c.id),public.station_commitment_available(c.id),
    c.issued_on,c.valid_from,c.valid_until,c.document_path,c.status
  from public.station_commitments c join public.fuel_stations s on s.id=c.station_id
  where (ctx.superadmin or c.tenant_id=ctx.tenant_id)
    and (p_station_id is null or c.station_id=p_station_id)
  order by c.issued_on desc,c.commitment_number;
end $$;

-- Trava novas despesas sem saldo de empenho previamente emitido.
create or replace function public.tg_require_station_commitment()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_new numeric:=0;v_available numeric;
begin
  if tg_table_name='fuelings' then
    if new.station_id is null then return new; end if;
    if new.workflow_status::text='autorizado' then
      select round(coalesce(new.max_liters,v.tank_capacity,0)*coalesce(
        new.price_per_liter,(select nullif(fp.value,'')::numeric
          from public.fuel_stations s
          cross join lateral jsonb_each_text(coalesce(s.fuel_prices,'{}'::jsonb)) fp
          where s.id=new.station_id and lower(fp.key)=lower(new.fuel_type) limit 1),0),2)
      into v_new from public.vehicles v where v.id=new.vehicle_id;
    elsif new.workflow_status::text='lancado_direto' then v_new:=coalesce(new.total_cost,0);
    else return new; end if;
  else
    v_new:=round(new.authorized_quantity*new.unit_price,2);
  end if;
  v_available:=public.station_commitment_total_available(new.station_id,current_date);
  if v_available<v_new then
    raise exception 'Saldo de empenho insuficiente: disponível R$ %, necessário R$ %',v_available,v_new;
  end if;
  return new;
end $$;
revoke all on function public.tg_require_station_commitment()
  from public,anon,authenticated;
drop trigger if exists trg_fuelings_require_commitment on public.fuelings;
create trigger trg_fuelings_require_commitment
  before insert on public.fuelings for each row execute function public.tg_require_station_commitment();
drop trigger if exists trg_station_operations_require_commitment on public.station_operations;
create trigger trg_station_operations_require_commitment
  before insert on public.station_operations for each row execute function public.tg_require_station_commitment();

create or replace function public.manager_link_station_closing_commitment(
  p_closing_id uuid,p_commitment_id uuid
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare ctx record;c record;e record;v_first date;v_available numeric;
begin
  select * into ctx from public.service_order_manager_context();
  select * into c from public.station_monthly_closings
   where id=p_closing_id and (ctx.superadmin or tenant_id=ctx.tenant_id) for update;
  if c.id is null or c.status<>'aprovado' then raise exception 'Fechamento aprovado não encontrado'; end if;
  if c.fiscal_status<>'aguardando_empenho' then raise exception 'Fechamento já possui cobertura fiscal'; end if;
  select * into e from public.station_commitments
   where id=p_commitment_id and station_id=c.station_id and tenant_id=c.tenant_id and status='ativo'
   for update;
  if e.id is null then raise exception 'Empenho ativo não encontrado para este posto'; end if;
  select min(executed_at)::date into v_first from public.station_monthly_closing_items where closing_id=c.id;
  if e.issued_on>v_first or v_first not between e.valid_from and e.valid_until then
    raise exception 'O empenho não é prévio ou não cobre a data do primeiro fornecimento'; end if;
  v_available:=public.station_commitment_available(e.id);
  if v_available<c.total_amount then raise exception 'Saldo do empenho insuficiente: R$ %',v_available; end if;
  insert into public.station_closing_commitments
    (closing_id,commitment_id,tenant_id,amount,linked_by)
  values (c.id,e.id,c.tenant_id,c.total_amount,ctx.profile_id);
  update public.station_monthly_closings set fiscal_status='coberto',updated_at=now() where id=c.id;
  insert into public.station_monthly_closing_events
    (closing_id,tenant_id,from_status,to_status,actor_id,actor_role,note)
  values (c.id,c.tenant_id,'aguardando_empenho','coberto',ctx.profile_id,'gestao',
    format('Empenho %s vinculado',e.commitment_number));
end $$;

create or replace function public.partner_submit_station_closing_invoice(
  p_closing_id uuid,p_invoice_number text,p_amount numeric,p_issued_on date,p_document_path text
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare ctx record;c record;v_id uuid;
begin
  select * into ctx from public.partner_context();
  if ctx.kind<>'posto' then raise exception 'Somente postos'; end if;
  select * into c from public.station_monthly_closings
   where id=p_closing_id and tenant_id=ctx.tenant_id and station_id=ctx.partner_id for update;
  if c.id is null or c.status<>'aprovado' or c.fiscal_status<>'coberto' then
    raise exception 'A nota só pode ser enviada após conferência e vínculo do empenho prévio'; end if;
  if p_amount<>c.total_amount then raise exception 'A nota deve corresponder ao total do fechamento: R$ %',c.total_amount; end if;
  if nullif(trim(p_invoice_number),'') is null or nullif(trim(p_document_path),'') is null then
    raise exception 'Informe a nota fiscal e anexe o documento'; end if;
  if p_issued_on is null or p_issued_on<c.reviewed_at::date or p_issued_on>current_date then
    raise exception 'A nota deve ser emitida após a aprovação do fechamento'; end if;
  insert into public.station_closing_invoices (
    closing_id,tenant_id,station_id,invoice_number,amount,issued_on,
    document_path,submitted_by
  ) values (
    c.id,c.tenant_id,c.station_id,trim(p_invoice_number),p_amount,p_issued_on,
    trim(p_document_path),ctx.profile_id
  ) returning id into v_id;
  update public.station_monthly_closings set fiscal_status='nota_enviada',updated_at=now() where id=c.id;
  insert into public.station_monthly_closing_events
    (closing_id,tenant_id,from_status,to_status,actor_id,actor_role,note)
  values (c.id,c.tenant_id,'coberto','nota_enviada',ctx.profile_id,'posto',
    format('NF %s enviada',trim(p_invoice_number)));
  return v_id;
end $$;

create or replace function public.manager_attest_station_closing_invoice(
  p_invoice_id uuid,p_note text default null
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare ctx record;i record;c record;
begin
  select * into ctx from public.service_order_manager_context();
  select * into i from public.station_closing_invoices
   where id=p_invoice_id and (ctx.superadmin or tenant_id=ctx.tenant_id) for update;
  if i.id is null or i.status<>'enviada' then raise exception 'Nota pendente não encontrada'; end if;
  select * into c from public.station_monthly_closings where id=i.closing_id for update;
  if i.amount<>c.total_amount then raise exception 'Valor da nota diverge do fechamento'; end if;
  update public.station_closing_invoices set status='atestada',attested_by=ctx.profile_id,
    attested_at=now(),attestation_note=nullif(trim(p_note),'') where id=i.id;
  update public.station_monthly_closings set fiscal_status='atestado',updated_at=now() where id=c.id;
  insert into public.station_monthly_closing_events
    (closing_id,tenant_id,from_status,to_status,actor_id,actor_role,note)
  values (c.id,c.tenant_id,'nota_enviada','atestado',ctx.profile_id,'gestao',
    coalesce(nullif(trim(p_note),''),'Nota fiscal atestada para liquidação'));
end $$;

create or replace function public.manager_schedule_station_closing_payment(
  p_closing_id uuid,p_amount numeric,p_scheduled_on date,p_note text default null
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare ctx record;c record;i record;v_paid numeric;v_id uuid;
begin
  select * into ctx from public.service_order_manager_context();
  select * into c from public.station_monthly_closings
   where id=p_closing_id and (ctx.superadmin or tenant_id=ctx.tenant_id) for update;
  if c.id is null or c.fiscal_status not in ('atestado','pagamento_programado') then
    raise exception 'O pagamento exige nota fiscal atestada'; end if;
  select * into i from public.station_closing_invoices where closing_id=c.id and status='atestada';
  select coalesce(sum(amount),0) into v_paid from public.station_closing_payments where closing_id=c.id;
  if p_amount is null or p_amount<=0 or v_paid+p_amount>i.amount then
    raise exception 'Valor excede o saldo da nota fiscal'; end if;
  if p_scheduled_on is null or p_scheduled_on<current_date then raise exception 'Data programada inválida'; end if;
  insert into public.station_closing_payments
    (closing_id,invoice_id,tenant_id,amount,scheduled_on,note,registered_by)
  values (c.id,i.id,c.tenant_id,p_amount,p_scheduled_on,nullif(trim(p_note),''),ctx.profile_id)
  returning id into v_id;
  update public.station_monthly_closings set fiscal_status='pagamento_programado',updated_at=now() where id=c.id;
  return v_id;
end $$;

create or replace function public.manager_confirm_station_closing_payment(
  p_payment_id uuid,p_paid_on date,p_reference text,p_receipt_path text default null
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare ctx record;p record;c record;i record;v_paid numeric;
begin
  select * into ctx from public.service_order_manager_context();
  select * into p from public.station_closing_payments
   where id=p_payment_id and (ctx.superadmin or tenant_id=ctx.tenant_id) for update;
  if p.id is null or p.paid_on is not null then raise exception 'Pagamento pendente não encontrado'; end if;
  if p_paid_on is null or p_paid_on<p.scheduled_on or p_paid_on>current_date then raise exception 'Data de pagamento inválida'; end if;
  update public.station_closing_payments set paid_on=p_paid_on,
    payment_reference=nullif(trim(p_reference),''),
    receipt_path=nullif(trim(p_receipt_path),'') where id=p.id;
  select * into c from public.station_monthly_closings where id=p.closing_id for update;
  select * into i from public.station_closing_invoices where id=p.invoice_id;
  select coalesce(sum(amount),0) into v_paid from public.station_closing_payments
   where closing_id=c.id and paid_on is not null;
  if v_paid>=i.amount then
    update public.station_monthly_closings set fiscal_status='pago',updated_at=now() where id=c.id;
  end if;
  insert into public.station_monthly_closing_events
    (closing_id,tenant_id,from_status,to_status,actor_id,actor_role,note)
  values (c.id,c.tenant_id,'pagamento_programado',
    case when v_paid>=i.amount then 'pago' else 'pagamento_programado' end,
    ctx.profile_id,'gestao',format('Pagamento de R$ %s confirmado',p.amount));
end $$;

create or replace function public.get_station_closing_fiscal_details(p_closing_id uuid)
returns table (
  closing_id uuid,fiscal_status text,commitment_id uuid,commitment_number text,
  nad_number text,commitment_amount numeric,commitment_document_path text,
  invoice_id uuid,invoice_number text,invoice_amount numeric,invoice_issued_on date,
  invoice_document_path text,invoice_status text,invoice_attested_at timestamptz,
  payment_id uuid,payment_amount numeric,scheduled_on date,paid_on date,
  payment_reference text,payment_receipt_path text
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare uid uuid:=auth.uid();role_name text;tenant uuid;partner uuid;super boolean:=false;
begin
  select p.role,p.tenant_id,p.station_id,(p.role='superadmin') into role_name,tenant,partner,super
  from public.profiles p where p.id=uid and not coalesce(p.access_blocked,false);
  if role_name not in ('posto','admin','gestor','secretario','superadmin') then raise exception 'Acesso não autorizado'; end if;
  return query
  select c.id,c.fiscal_status,e.id,e.commitment_number,e.nad_number,a.amount,e.document_path,
    i.id,i.invoice_number,i.amount,i.issued_on,i.document_path,i.status,i.attested_at,
    p.id,p.amount,p.scheduled_on,p.paid_on,p.payment_reference,p.receipt_path
  from public.station_monthly_closings c
  left join public.station_closing_commitments a on a.closing_id=c.id
  left join public.station_commitments e on e.id=a.commitment_id
  left join public.station_closing_invoices i on i.closing_id=c.id
  left join public.station_closing_payments p on p.closing_id=c.id
  where c.id=p_closing_id and (super or c.tenant_id=tenant)
    and (role_name<>'posto' or c.station_id=partner)
  order by p.scheduled_on,p.id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'manager_register_station_commitment(uuid,text,text,numeric,date,date,date,text)',
    'manager_list_station_commitments(uuid)',
    'manager_link_station_closing_commitment(uuid,uuid)',
    'partner_submit_station_closing_invoice(uuid,text,numeric,date,text)',
    'manager_attest_station_closing_invoice(uuid,text)',
    'manager_schedule_station_closing_payment(uuid,numeric,date,text)',
    'manager_confirm_station_closing_payment(uuid,date,text,text)',
    'get_station_closing_fiscal_details(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public,anon',f);
    execute format('grant execute on function public.%s to authenticated',f);
  end loop;
end $$;
