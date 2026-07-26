-- ============================================================================
-- FLUXO DE MANUTENÇÃO V2
--
-- Motorista relata → gestor autoriza e acompanha → oficina orça/executa →
-- gestor recebe/atesta → financeiro paga.
--
-- Todas as transições gerenciais que alteram mais de uma tabela são atômicas
-- e derivam o ator de auth.uid(). O cliente não informa tenant nem usuário.
-- ============================================================================

alter table public.service_orders
  add column if not exists opened_by uuid references public.profiles(id),
  add column if not exists origin text not null default 'driver';

update public.service_orders
   set opened_by = coalesce(opened_by, driver_id),
       origin = case when checklist_id is null then 'driver' else 'checklist' end
 where opened_by is null
    or origin not in ('driver', 'checklist', 'manager');

alter table public.service_orders
  alter column opened_by set default auth.uid(),
  alter column opened_by set not null;

do $$
begin
  alter table public.service_orders
    add constraint service_orders_origin_check
    check (origin in ('driver', 'checklist', 'manager'));
exception
  when duplicate_object then null;
end
$$;

-- Um veículo não pode estar em duas OS abertas ao mesmo tempo.
create unique index if not exists uq_service_orders_open_vehicle
  on public.service_orders (vehicle_id)
  where vehicle_id is not null
    and operational_status not in ('received', 'cancelled');

-- Contexto interno das RPCs gerenciais. Não fica exposto ao cliente.
create or replace function public.service_order_manager_context()
returns table (
  profile_id uuid,
  tenant_id uuid,
  superadmin boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return query
    select p.id, p.tenant_id, p.role = 'superadmin'
      from public.profiles p
     where p.id = auth.uid()
       and p.role in ('admin', 'gestor', 'superadmin')
       and not coalesce(p.access_blocked, false);

  if not found then
    raise exception 'Ação restrita à gestão da frota';
  end if;
end
$$;

revoke all on function public.service_order_manager_context()
  from public, anon, authenticated;

-- Toda abertura ganha um primeiro evento, inclusive quando o motorista cria a
-- solicitação diretamente pela policy service_orders_insert_own.
create or replace function public.tf_service_order_open_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  select role into v_role
    from public.profiles
   where id = new.opened_by;

  insert into public.service_order_events (
    tenant_id,
    service_order_id,
    axis,
    from_state,
    to_state,
    actor_id,
    actor_role,
    note
  )
  values (
    new.tenant_id,
    new.id,
    'operational',
    null,
    'pending',
    new.opened_by,
    coalesce(v_role, 'sistema'),
    case new.origin
      when 'checklist' then 'Solicitação aberta a partir de checklist'
      when 'manager' then 'Solicitação aberta pela gestão'
      else 'Avaria relatada pelo motorista'
    end
  );

  return new;
end
$$;

drop trigger if exists trg_service_order_open_event on public.service_orders;
create trigger trg_service_order_open_event
  after insert on public.service_orders
  for each row execute function public.tf_service_order_open_event();

revoke all on function public.tf_service_order_open_event()
  from public, anon, authenticated;

-- ─── Solicitação e triagem ──────────────────────────────────────────────────

create or replace function public.manager_create_service_order(
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_category text,
  p_priority text,
  p_description text,
  p_odometer integer default null,
  p_checklist_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  v_tenant_id uuid;
  v_order_id uuid;
begin
  select * into ctx from public.service_order_manager_context();

  if nullif(trim(p_category), '') is null then
    raise exception 'Informe a categoria da manutenção';
  end if;
  if nullif(trim(p_description), '') is null or length(trim(p_description)) < 5 then
    raise exception 'Descreva o problema com pelo menos 5 caracteres';
  end if;
  if length(trim(p_description)) > 2000 then
    raise exception 'Descrição muito longa';
  end if;
  if p_priority not in ('baixa', 'media', 'alta') then
    raise exception 'Prioridade inválida';
  end if;
  if p_odometer is not null and p_odometer < 0 then
    raise exception 'Hodômetro inválido';
  end if;

  select v.tenant_id into v_tenant_id
    from public.vehicles v
   where v.id = p_vehicle_id;

  if v_tenant_id is null
     or (not ctx.superadmin and v_tenant_id <> ctx.tenant_id) then
    raise exception 'Veículo não encontrado nesta prefeitura';
  end if;

  if not exists (
    select 1
      from public.profiles p
     where p.id = p_driver_id
       and p.tenant_id = v_tenant_id
       and p.role = 'motorista'
       and coalesce(p.driver_status, 'ativo') = 'ativo'
       and not coalesce(p.access_blocked, false)
  ) then
    raise exception 'Motorista ativo não encontrado nesta prefeitura';
  end if;

  if p_checklist_id is not null and not exists (
    select 1
      from public.checklists c
     where c.id = p_checklist_id
       and c.tenant_id = v_tenant_id
       and c.vehicle_id = p_vehicle_id
       and c.driver_id = p_driver_id
  ) then
    raise exception 'Checklist incompatível com o veículo ou motorista';
  end if;

  if exists (
    select 1
      from public.service_orders so
     where so.vehicle_id = p_vehicle_id
       and so.operational_status not in ('received', 'cancelled')
  ) then
    raise exception 'Este veículo já possui uma ordem de serviço aberta';
  end if;

  insert into public.service_orders (
    tenant_id,
    vehicle_id,
    driver_id,
    checklist_id,
    category,
    priority,
    description,
    odometer,
    operational_status,
    financial_status,
    opened_by,
    origin
  )
  values (
    v_tenant_id,
    p_vehicle_id,
    p_driver_id,
    p_checklist_id,
    trim(p_category),
    p_priority::public.issue_severity,
    trim(p_description),
    p_odometer,
    'pending',
    'not_started',
    ctx.profile_id,
    case when p_checklist_id is null then 'manager' else 'checklist' end
  )
  returning id into v_order_id;

  return v_order_id;
end
$$;

create or replace function public.manager_update_service_order_request(
  p_order_id uuid,
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_category text,
  p_priority text,
  p_description text,
  p_odometer integer default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  so record;
begin
  select * into ctx from public.service_order_manager_context();

  select * into so
    from public.service_orders
   where id = p_order_id
     and (ctx.superadmin or tenant_id = ctx.tenant_id)
   for update;

  if so.id is null then raise exception 'Ordem de serviço não encontrada'; end if;
  if so.operational_status <> 'pending' or so.financial_status <> 'not_started' then
    raise exception 'Somente solicitações pendentes podem ser editadas';
  end if;
  if nullif(trim(p_category), '') is null then raise exception 'Informe a categoria'; end if;
  if nullif(trim(p_description), '') is null or length(trim(p_description)) < 5 then
    raise exception 'Descreva o problema com pelo menos 5 caracteres';
  end if;
  if p_priority not in ('baixa', 'media', 'alta') then raise exception 'Prioridade inválida'; end if;
  if p_odometer is not null and p_odometer < 0 then raise exception 'Hodômetro inválido'; end if;

  if not exists (
    select 1 from public.vehicles v
     where v.id = p_vehicle_id and v.tenant_id = so.tenant_id
  ) then
    raise exception 'Veículo não encontrado nesta prefeitura';
  end if;
  if not exists (
    select 1 from public.profiles p
     where p.id = p_driver_id
       and p.tenant_id = so.tenant_id
       and p.role = 'motorista'
       and coalesce(p.driver_status, 'ativo') = 'ativo'
       and not coalesce(p.access_blocked, false)
  ) then
    raise exception 'Motorista ativo não encontrado nesta prefeitura';
  end if;
  if exists (
    select 1 from public.service_orders other
     where other.id <> p_order_id
       and other.vehicle_id = p_vehicle_id
       and other.operational_status not in ('received', 'cancelled')
  ) then
    raise exception 'Este veículo já possui outra ordem de serviço aberta';
  end if;

  update public.service_orders
     set vehicle_id = p_vehicle_id,
         driver_id = p_driver_id,
         category = trim(p_category),
         priority = p_priority::public.issue_severity,
         description = trim(p_description),
         odometer = p_odometer
   where id = p_order_id;

  insert into public.service_order_events (
    tenant_id, service_order_id, axis, actor_id, actor_role, note
  )
  values (
    so.tenant_id, p_order_id, 'note', ctx.profile_id, 'gestao',
    'Dados da solicitação revisados pela gestão'
  );
end
$$;

create or replace function public.manager_authorize_service_order(
  p_order_id uuid,
  p_repair_shop_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  so record;
  shop record;
begin
  select * into ctx from public.service_order_manager_context();

  select * into so
    from public.service_orders
   where id = p_order_id
     and (ctx.superadmin or tenant_id = ctx.tenant_id)
   for update;

  if so.id is null then raise exception 'Ordem de serviço não encontrada'; end if;
  if so.operational_status <> 'pending' or so.financial_status <> 'not_started' then
    raise exception 'A ordem de serviço não está pendente de autorização';
  end if;

  select * into shop
    from public.repair_shops
   where id = p_repair_shop_id
     and tenant_id = so.tenant_id;

  if shop.id is null or not shop.is_active then
    raise exception 'Oficina ativa não encontrada nesta prefeitura';
  end if;
  if shop.contract_end is not null and shop.contract_end < current_date then
    raise exception 'O contrato da oficina está vencido';
  end if;

  update public.service_orders
     set repair_shop_id = shop.id,
         repair_shop = shop.name,
         operational_status = 'authorized',
         approved_by = ctx.profile_id,
         approved_at = now(),
         admin_note = nullif(trim(p_note), '')
   where id = p_order_id;

  insert into public.service_order_events (
    tenant_id, service_order_id, axis, from_state, to_state,
    actor_id, actor_role, note
  )
  values (
    so.tenant_id, p_order_id, 'operational', 'pending', 'authorized',
    ctx.profile_id, 'gestao',
    coalesce(nullif(trim(p_note), ''), format('OS autorizada para %s', shop.name))
  );
end
$$;

create or replace function public.manager_cancel_service_order(
  p_order_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  so record;
begin
  select * into ctx from public.service_order_manager_context();
  if nullif(trim(p_reason), '') is null then raise exception 'Informe o motivo do cancelamento'; end if;

  select * into so
    from public.service_orders
   where id = p_order_id
     and (ctx.superadmin or tenant_id = ctx.tenant_id)
   for update;

  if so.id is null then raise exception 'Ordem de serviço não encontrada'; end if;
  if so.operational_status not in ('pending', 'authorized', 'at_shop', 'awaiting_quote_approval') then
    raise exception 'A ordem de serviço não pode mais ser cancelada nesta etapa';
  end if;
  if so.financial_status not in ('not_started', 'awaiting_commitment') then
    raise exception 'Cancele o empenho antes de cancelar esta ordem de serviço';
  end if;

  update public.service_orders
     set operational_status = 'cancelled',
         admin_note = trim(p_reason),
         completed_at = now()
   where id = p_order_id;

  insert into public.service_order_events (
    tenant_id, service_order_id, axis, from_state, to_state,
    actor_id, actor_role, note
  )
  values (
    so.tenant_id, p_order_id, 'operational', so.operational_status::text, 'cancelled',
    ctx.profile_id, 'gestao', trim(p_reason)
  );
end
$$;

create or replace function public.manager_confirm_shop_delivery(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  so record;
begin
  select * into ctx from public.service_order_manager_context();
  select * into so
    from public.service_orders
   where id = p_order_id
     and (ctx.superadmin or tenant_id = ctx.tenant_id)
   for update;

  if so.id is null then raise exception 'Ordem de serviço não encontrada'; end if;
  if so.operational_status <> 'authorized' then
    raise exception 'A ordem de serviço não está aguardando entrega na oficina';
  end if;

  update public.service_orders
     set operational_status = 'at_shop',
         at_shop_at = now()
   where id = p_order_id;

  insert into public.service_order_events (
    tenant_id, service_order_id, axis, from_state, to_state,
    actor_id, actor_role, note
  )
  values (
    so.tenant_id, p_order_id, 'operational', 'authorized', 'at_shop',
    ctx.profile_id, 'gestao', 'Veículo entregue na oficina'
  );
end
$$;

-- ─── Orçamento e empenho ────────────────────────────────────────────────────

create or replace function public.manager_review_service_order_quote(
  p_quote_id uuid,
  p_approved boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  q record;
  so record;
begin
  select * into ctx from public.service_order_manager_context();

  select * into q
    from public.service_order_quotes
   where id = p_quote_id
   for update;

  if q.id is null then raise exception 'Orçamento não encontrado'; end if;
  if q.status <> 'enviado' then raise exception 'Este orçamento já foi analisado'; end if;
  if not p_approved and nullif(trim(p_note), '') is null then
    raise exception 'Informe o motivo da devolução do orçamento';
  end if;

  select * into so
    from public.service_orders
   where id = q.service_order_id
     and tenant_id = q.tenant_id
     and (ctx.superadmin or tenant_id = ctx.tenant_id)
   for update;

  if so.id is null then raise exception 'Ordem de serviço não encontrada'; end if;
  if so.operational_status <> 'awaiting_quote_approval'
     or so.financial_status <> 'not_started' then
    raise exception 'A ordem de serviço não está aguardando análise do orçamento';
  end if;

  if p_approved then
    if q.valid_until is not null and q.valid_until < current_date then
      raise exception 'O orçamento está vencido';
    end if;

    update public.service_order_quotes
       set status = 'aprovado',
           reviewed_by = ctx.profile_id,
           reviewed_at = now(),
           review_note = nullif(trim(p_note), '')
     where id = q.id;

    update public.service_orders
       set financial_status = 'awaiting_commitment',
           budget = q.total
     where id = so.id;

    insert into public.service_order_events (
      tenant_id, service_order_id, axis, from_state, to_state,
      actor_id, actor_role, note
    )
    values (
      so.tenant_id, so.id, 'financial', 'not_started', 'awaiting_commitment',
      ctx.profile_id, 'gestao',
      format('Orçamento v%s aprovado — R$ %s', q.version, q.total)
    );
  else
    update public.service_order_quotes
       set status = 'rejeitado',
           reviewed_by = ctx.profile_id,
           reviewed_at = now(),
           review_note = trim(p_note)
     where id = q.id;

    update public.service_orders
       set operational_status = 'at_shop'
     where id = so.id;

    insert into public.service_order_events (
      tenant_id, service_order_id, axis, actor_id, actor_role, note
    )
    values (
      so.tenant_id, so.id, 'note', ctx.profile_id, 'gestao',
      format('Orçamento v%s devolvido: %s', q.version, trim(p_note))
    );
  end if;
end
$$;

create or replace function public.manager_register_service_order_commitment(
  p_order_id uuid,
  p_commitment_number text,
  p_nad_number text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  so record;
begin
  select * into ctx from public.service_order_manager_context();
  if nullif(trim(p_commitment_number), '') is null then raise exception 'Informe o número do empenho'; end if;

  select * into so
    from public.service_orders
   where id = p_order_id
     and (ctx.superadmin or tenant_id = ctx.tenant_id)
   for update;

  if so.id is null then raise exception 'Ordem de serviço não encontrada'; end if;
  if so.operational_status <> 'awaiting_quote_approval'
     or so.financial_status <> 'awaiting_commitment' then
    raise exception 'A ordem de serviço não está aguardando empenho';
  end if;
  if not exists (
    select 1 from public.service_order_quotes q
     where q.service_order_id = so.id and q.status = 'aprovado'
  ) then
    raise exception 'Nenhum orçamento aprovado foi encontrado';
  end if;

  update public.service_orders
     set commitment_number = trim(p_commitment_number),
         nad_number = nullif(trim(p_nad_number), ''),
         financial_status = 'committed'
   where id = so.id;

  insert into public.service_order_events (
    tenant_id, service_order_id, axis, from_state, to_state,
    actor_id, actor_role, note
  )
  values (
    so.tenant_id, so.id, 'financial', 'awaiting_commitment', 'committed',
    ctx.profile_id, 'gestao', format('Empenho %s registrado', trim(p_commitment_number))
  );
end
$$;

-- ─── Recebimento, ateste e pagamento ────────────────────────────────────────

create or replace function public.manager_receive_service_order_vehicle(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  so record;
begin
  select * into ctx from public.service_order_manager_context();
  select * into so
    from public.service_orders
   where id = p_order_id
     and (ctx.superadmin or tenant_id = ctx.tenant_id)
   for update;

  if so.id is null then raise exception 'Ordem de serviço não encontrada'; end if;
  if so.operational_status <> 'ready' then
    raise exception 'A oficina ainda não concluiu o serviço';
  end if;
  if so.financial_status <> 'committed' then
    raise exception 'O processo financeiro não está empenhado';
  end if;

  update public.service_orders
     set operational_status = 'received',
         received_at = now(),
         completed_at = now()
   where id = so.id;

  insert into public.service_order_events (
    tenant_id, service_order_id, axis, from_state, to_state,
    actor_id, actor_role, note
  )
  values (
    so.tenant_id, so.id, 'operational', 'ready', 'received',
    ctx.profile_id, 'gestao', 'Veículo conferido, recebido e liberado'
  );
end
$$;

create or replace function public.manager_attest_service_order_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  inv record;
  so record;
  v_all_attested boolean;
begin
  select * into ctx from public.service_order_manager_context();

  select * into inv
    from public.service_order_invoices
   where id = p_invoice_id
   for update;

  if inv.id is null then raise exception 'Nota fiscal não encontrada'; end if;

  select * into so
    from public.service_orders
   where id = inv.service_order_id
     and tenant_id = inv.tenant_id
     and (ctx.superadmin or tenant_id = ctx.tenant_id)
   for update;

  if so.id is null then raise exception 'Ordem de serviço não encontrada'; end if;
  if so.operational_status <> 'received' then
    raise exception 'O veículo ainda não foi recebido pela prefeitura';
  end if;
  if so.financial_status not in ('invoiced', 'attested') then
    raise exception 'O processo não está aguardando ateste';
  end if;
  if inv.attested_at is not null then return; end if;

  update public.service_order_invoices
     set attested_by = ctx.profile_id,
         attested_at = now()
   where id = inv.id;

  select bool_and(attested_at is not null) into v_all_attested
    from public.service_order_invoices
   where service_order_id = so.id;

  update public.service_orders
     set financial_status = (
       case when v_all_attested then 'attested' else 'invoiced' end
     )::public.service_order_fin_status
   where id = so.id;

  insert into public.service_order_events (
    tenant_id, service_order_id, axis, from_state, to_state,
    actor_id, actor_role, note
  )
  values (
    so.tenant_id, so.id, 'financial', 'invoiced',
    case when v_all_attested then 'attested' else 'invoiced' end,
    ctx.profile_id, 'gestao',
    format('NF %s atestada%s', inv.invoice_number,
      case when v_all_attested then ' — todas as notas foram atestadas' else '' end)
  );
end
$$;

create or replace function public.manager_register_service_order_payment(
  p_order_id uuid,
  p_amount numeric,
  p_invoice_id uuid default null,
  p_paid_at date default current_date,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  so record;
  v_total_invoices numeric;
  v_total_paid numeric;
  v_remaining numeric;
  v_fully_paid boolean;
begin
  select * into ctx from public.service_order_manager_context();
  if p_amount is null or p_amount <= 0 then raise exception 'Informe um valor de pagamento válido'; end if;
  if p_paid_at is null or p_paid_at > current_date then raise exception 'Data de pagamento inválida'; end if;

  select * into so
    from public.service_orders
   where id = p_order_id
     and (ctx.superadmin or tenant_id = ctx.tenant_id)
   for update;

  if so.id is null then raise exception 'Ordem de serviço não encontrada'; end if;
  if so.operational_status <> 'received' or so.financial_status <> 'attested' then
    raise exception 'O pagamento só pode ser registrado após o recebimento e o ateste de todas as notas';
  end if;
  if exists (
    select 1 from public.service_order_invoices i
     where i.service_order_id = so.id and i.attested_at is null
  ) then
    raise exception 'Ainda existem notas fiscais sem ateste';
  end if;
  if p_invoice_id is not null and not exists (
    select 1 from public.service_order_invoices i
     where i.id = p_invoice_id and i.service_order_id = so.id
  ) then
    raise exception 'A nota fiscal informada não pertence a esta ordem de serviço';
  end if;

  select coalesce(sum(amount), 0) into v_total_invoices
    from public.service_order_invoices
   where service_order_id = so.id;
  select coalesce(sum(amount), 0) into v_total_paid
    from public.service_order_payments
   where service_order_id = so.id;

  if v_total_invoices <= 0 then raise exception 'Nenhuma nota fiscal foi encontrada'; end if;
  v_remaining := v_total_invoices - v_total_paid;
  if p_amount > v_remaining then
    raise exception 'O pagamento excede o saldo restante de R$ %', v_remaining;
  end if;

  insert into public.service_order_payments (
    tenant_id, service_order_id, invoice_id, amount, paid_at, note, registered_by
  )
  values (
    so.tenant_id, so.id, p_invoice_id, p_amount, p_paid_at,
    nullif(trim(p_note), ''), ctx.profile_id
  );

  v_total_paid := v_total_paid + p_amount;
  v_fully_paid := v_total_paid >= v_total_invoices;

  if v_fully_paid then
    update public.service_orders
       set financial_status = 'paid',
           cost = v_total_invoices
     where id = so.id;
  end if;

  insert into public.service_order_events (
    tenant_id, service_order_id, axis, from_state, to_state,
    actor_id, actor_role, note
  )
  values (
    so.tenant_id, so.id, 'financial', 'attested',
    case when v_fully_paid then 'paid' else 'attested' end,
    ctx.profile_id, 'gestao',
    case when v_fully_paid
      then format('Pagamento de R$ %s — processo quitado', p_amount)
      else format('Pagamento parcial de R$ %s — saldo R$ %s', p_amount, v_total_invoices - v_total_paid)
    end
  );

  return v_fully_paid;
end
$$;

-- ─── Regras da oficina endurecidas ──────────────────────────────────────────

-- Orçamento somente depois de o veículo chegar à oficina. Uma nova versão
-- pode substituir outra ainda em análise.
create or replace function public.repair_shop_submit_quote(
  p_order_id uuid,
  p_items jsonb,
  p_valid_until date default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  so record;
  v_quote_id uuid;
  v_version integer;
  v_total numeric := 0;
  it jsonb;
begin
  select * into ctx from public.partner_context();
  if ctx.kind <> 'oficina' then raise exception 'Somente oficinas'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Orçamento sem itens'; end if;

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
      quote_id, kind, description, qty, unit_price
    )
    values (
      v_quote_id,
      it->>'kind',
      trim(it->>'description'),
      (it->>'qty')::numeric,
      (it->>'unit_price')::numeric
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

create or replace function public.repair_shop_start_service(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  so record;
begin
  select * into ctx from public.partner_context();
  if ctx.kind <> 'oficina' then raise exception 'Somente oficinas'; end if;

  select * into so
    from public.service_orders
   where id = p_order_id
     and tenant_id = ctx.tenant_id
     and repair_shop_id = ctx.partner_id
   for update;

  if so.id is null then raise exception 'OS não encontrada para esta oficina'; end if;
  if so.operational_status = 'in_progress' then return; end if;
  if so.operational_status <> 'awaiting_quote_approval'
     or so.financial_status <> 'committed' then
    raise exception 'A execução só pode iniciar após orçamento aprovado e empenho'; end if;

  update public.service_orders
     set operational_status = 'in_progress'
   where id = p_order_id;

  insert into public.service_order_events (
    tenant_id, service_order_id, from_state, to_state,
    actor_id, actor_role, note
  )
  values (
    ctx.tenant_id, p_order_id, so.operational_status::text, 'in_progress',
    ctx.profile_id, 'oficina', 'Execução iniciada pela oficina'
  );
end
$$;

-- A NF só entra depois do recebimento e enquanto o processo estiver aberto
-- para faturamento. O total acumulado não pode ultrapassar o orçamento aprovado.
create or replace function public.repair_shop_submit_invoice(
  p_order_id uuid,
  p_invoice_number text,
  p_amount numeric,
  p_file_path text default null,
  p_issued_at date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  so record;
  v_id uuid;
  v_invoiced numeric;
begin
  select * into ctx from public.partner_context();
  if ctx.kind <> 'oficina' then raise exception 'Somente oficinas'; end if;
  if nullif(trim(p_invoice_number), '') is null then raise exception 'Informe o número da nota fiscal'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Informe o valor da nota fiscal'; end if;
  if p_issued_at is null or p_issued_at > current_date then raise exception 'Data de emissão inválida'; end if;

  select * into so
    from public.service_orders
   where id = p_order_id
     and tenant_id = ctx.tenant_id
     and repair_shop_id = ctx.partner_id
   for update;

  if so.id is null then raise exception 'OS não encontrada para esta oficina'; end if;
  if so.operational_status <> 'received' then
    raise exception 'A nota só pode ser emitida após a prefeitura receber o veículo'; end if;
  if so.financial_status not in ('committed', 'invoiced') then
    raise exception 'O processo não está aberto para faturamento'; end if;
  if so.budget is null or so.budget <= 0 then
    raise exception 'A OS não possui orçamento aprovado'; end if;

  select id into v_id
    from public.service_order_invoices
   where tenant_id = ctx.tenant_id
     and repair_shop_id = ctx.partner_id
     and invoice_number = trim(p_invoice_number);
  if v_id is not null then return v_id; end if;

  select coalesce(sum(amount), 0) into v_invoiced
    from public.service_order_invoices
   where service_order_id = p_order_id;
  if v_invoiced + p_amount > so.budget then
    raise exception 'O total das notas excede o orçamento aprovado de R$ %', so.budget;
  end if;

  insert into public.service_order_invoices (
    tenant_id, service_order_id, repair_shop_id, invoice_number,
    amount, issued_at, file_path, commitment_number
  )
  values (
    ctx.tenant_id, p_order_id, ctx.partner_id, trim(p_invoice_number),
    p_amount, p_issued_at, p_file_path, so.commitment_number
  )
  returning id into v_id;

  update public.service_orders
     set financial_status = 'invoiced'
   where id = p_order_id;

  insert into public.service_order_events (
    tenant_id, service_order_id, from_state, to_state, axis,
    actor_id, actor_role, note
  )
  values (
    ctx.tenant_id, p_order_id, so.financial_status::text, 'invoiced', 'financial',
    ctx.profile_id, 'oficina',
    format('NF %s — R$ %s', trim(p_invoice_number), p_amount)
  );

  return v_id;
end
$$;

-- Evita a notificação "veículo entregue" quando `at_shop` representa devolução
-- de orçamento para revisão.
create or replace function public.tg_notify_workshop_partner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plate text;
  v_title text;
  v_body text;
  v_type text := 'info';
begin
  if new.repair_shop_id is null then return new; end if;
  select plate into v_plate from public.vehicles where id = new.vehicle_id;

  if (
       tg_op = 'INSERT'
       or new.repair_shop_id is distinct from old.repair_shop_id
     ) and new.operational_status::text in ('authorized', 'at_shop') then
    v_title := 'Nova ordem de serviço';
    v_body := format('%s · %s', coalesce(v_plate, 'Veículo'), new.category);
  elsif tg_op = 'UPDATE'
        and new.operational_status is distinct from old.operational_status then
    case new.operational_status::text
      when 'at_shop' then
        if old.operational_status::text = 'authorized' then
          v_title := 'Veículo entregue na oficina';
          v_body := coalesce(v_plate, 'Veículo');
        end if;
      when 'received' then
        v_title := 'Veículo recebido pela prefeitura';
        v_body := format('%s · envie a nota fiscal citando o empenho', coalesce(v_plate, 'Veículo'));
      when 'cancelled' then
        v_title := 'Ordem de serviço cancelada';
        v_body := coalesce(v_plate, 'Veículo');
        v_type := 'alert';
      else null;
    end case;
  end if;

  if v_title is not null then
    perform public.notify_partner_profile(
      'oficina', new.repair_shop_id, new.tenant_id, v_type,
      v_title, v_body, '/oficina', 'service_order', new.id
    );
  end if;

  v_title := null;
  v_body := null;
  v_type := 'info';
  if tg_op = 'UPDATE'
     and new.financial_status is distinct from old.financial_status then
    case new.financial_status::text
      when 'awaiting_commitment' then
        v_title := 'Orçamento aprovado';
        v_body := format('%s · aguardando empenho', coalesce(v_plate, 'Veículo'));
      when 'committed' then
        v_title := 'Empenho emitido';
        v_body := format('%s · execução liberada · empenho %s',
          coalesce(v_plate, 'Veículo'), coalesce(new.commitment_number, 'informado'));
        v_type := 'success';
      when 'attested' then
        v_title := 'Nota fiscal atestada';
        v_body := format('%s · aguardando pagamento', coalesce(v_plate, 'Veículo'));
        v_type := 'success';
      when 'paid' then
        v_title := 'Pagamento registrado';
        v_body := format('%s · processo encerrado', coalesce(v_plate, 'Veículo'));
        v_type := 'success';
      else null;
    end case;
  end if;

  if v_title is not null then
    perform public.notify_partner_profile(
      'oficina', new.repair_shop_id, new.tenant_id, v_type,
      v_title, v_body, '/oficina', 'service_order', new.id
    );
  end if;

  return new;
end
$$;

-- Grants: as implementações internas antigas continuam revogadas; somente as
-- entradas validadas ficam disponíveis ao papel authenticated.
do $$
declare
  f text;
begin
  foreach f in array array[
    'manager_create_service_order(uuid,uuid,text,text,text,integer,uuid)',
    'manager_update_service_order_request(uuid,uuid,uuid,text,text,text,integer)',
    'manager_authorize_service_order(uuid,uuid,text)',
    'manager_cancel_service_order(uuid,text)',
    'manager_confirm_shop_delivery(uuid)',
    'manager_review_service_order_quote(uuid,boolean,text)',
    'manager_register_service_order_commitment(uuid,text,text)',
    'manager_receive_service_order_vehicle(uuid)',
    'manager_attest_service_order_invoice(uuid)',
    'manager_register_service_order_payment(uuid,numeric,uuid,date,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end
$$;

revoke all on function public.repair_shop_submit_quote(uuid,jsonb,date,text)
  from public, anon, authenticated;
revoke all on function public.repair_shop_start_service(uuid)
  from public, anon;
grant execute on function public.repair_shop_start_service(uuid)
  to authenticated;
revoke all on function public.repair_shop_submit_invoice(uuid,text,numeric,text,date)
  from public, anon, authenticated;

revoke all on function public.tg_notify_workshop_partner()
  from public, anon, authenticated;
