-- 5D4: itemized workshop invoices and controlled attestation.
-- A reservation realized at vehicle receipt is the fiscal ceiling: an invoice
-- may consume it in one or more itemized submissions, but cannot create new
-- quantity or price outside the approved quote.
alter table public.service_order_invoices
  add column if not exists attested_amount numeric(14,2),
  add column if not exists glosa_amount numeric(14,2) not null default 0,
  add column if not exists attestation_note text;

update public.service_order_invoices
   set attested_amount = amount
 where attested_at is not null and attested_amount is null;

alter table public.service_order_invoices
  add constraint service_order_invoices_glosa_amount_ck
  check (glosa_amount >= 0 and glosa_amount <= amount and glosa_amount <> 'NaN'::numeric);

create table public.service_order_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.service_order_invoices(id) on delete restrict,
  quote_item_id uuid not null references public.service_order_quote_items(id) on delete restrict,
  reservation_quantity numeric(16,2) not null check(reservation_quantity > 0 and reservation_quantity <> 'NaN'::numeric),
  delivered_quantity numeric(16,2) not null check(delivered_quantity > 0 and delivered_quantity <> 'NaN'::numeric),
  unit_price numeric(16,6) not null check(unit_price >= 0 and unit_price <> 'NaN'::numeric),
  line_amount numeric(14,2) not null check(line_amount >= 0 and line_amount <> 'NaN'::numeric),
  created_at timestamptz not null default now(),
  unique(invoice_id, quote_item_id)
);
create index service_order_invoice_items_quote_item on public.service_order_invoice_items(quote_item_id);
alter table public.service_order_invoice_items enable row level security;
revoke all on public.service_order_invoice_items from public, anon, authenticated;

create function sgf_private.validate_workshop_invoice_lineage(p_invoice_id uuid)
returns void
language plpgsql security definer set search_path=''
as $$
declare
  invoice_row public.service_order_invoices;
  line record;
  reservation public.service_order_quote_procurement_reservations;
  consumed numeric;
  line_total numeric;
begin
  select * into invoice_row from public.service_order_invoices where id=p_invoice_id;
  if not found then raise exception 'Nota fiscal não encontrada'; end if;
  if not exists(
    select 1 from public.service_order_quote_procurement_reservations r
     where r.service_order_id=invoice_row.service_order_id and r.state='realized'
  ) then
    return;
  end if;
  if not exists(select 1 from public.service_order_invoice_items where invoice_id=p_invoice_id) then
    raise exception 'A nota fiscal contratual precisa informar os itens entregues';
  end if;
  select coalesce(sum(line_amount),0) into line_total
    from public.service_order_invoice_items where invoice_id=p_invoice_id;
  if line_total <> invoice_row.amount then
    raise exception 'A soma dos itens da nota não corresponde ao valor da nota fiscal';
  end if;
  for line in select * from public.service_order_invoice_items where invoice_id=p_invoice_id for update loop
    select r.* into reservation
      from public.service_order_quote_procurement_reservations r
     where r.quote_item_id=line.quote_item_id and r.service_order_id=invoice_row.service_order_id and r.state='realized'
     for update;
    if not found then raise exception 'Item da nota não possui reserva realizada'; end if;
    if line.reservation_quantity <> reservation.committed_quantity
       or line.unit_price <> reservation.reserved_unit_price
       or line.delivered_quantity > reservation.committed_quantity then
      raise exception 'A linha da nota diverge da reserva contratual';
    end if;
    select coalesce(sum(other_line.delivered_quantity),0) into consumed
      from public.service_order_invoice_items other_line
      join public.service_order_invoices other_invoice on other_invoice.id=other_line.invoice_id
     where other_line.quote_item_id=line.quote_item_id
       and other_invoice.service_order_id=invoice_row.service_order_id
       and other_line.invoice_id<>p_invoice_id;
    if consumed + line.delivered_quantity > reservation.committed_quantity then
      raise exception 'A quantidade faturada excede a reserva realizada do item';
    end if;
    if round(line.delivered_quantity * line.unit_price,2) <> line.line_amount then
      raise exception 'Valor da linha da nota é incompatível com quantidade e preço';
    end if;
  end loop;
end $$;
revoke all on function sgf_private.validate_workshop_invoice_lineage(uuid) from public, anon, authenticated;

create function sgf_private.workshop_invoice_item_guard() returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    raise exception 'Itens da nota fiscal são imutáveis após o envio';
  end if;
  return new;
end $$;
revoke all on function sgf_private.workshop_invoice_item_guard() from public, anon, authenticated;
create trigger workshop_invoice_item_guard
before update or delete on public.service_order_invoice_items
for each row execute function sgf_private.workshop_invoice_item_guard();

create function public.repair_shop_submit_invoice_v3(
  p_order_id uuid,
  p_invoice_number text,
  p_amount numeric,
  p_file_path text,
  p_issued_at date,
  p_lines jsonb
)
returns uuid
language plpgsql security definer set search_path=public, pg_temp
as $$
declare
  ctx record; so record; existing record; reservation record; raw record; v_id uuid;
  expected_prefix text; total_amount numeric; line_amount numeric; consumed numeric;
begin
  select * into ctx from public.partner_context();
  if ctx.kind <> 'oficina' then raise exception 'Somente oficinas'; end if;
  if nullif(trim(p_invoice_number),'') is null then raise exception 'Informe o número da nota fiscal'; end if;
  if p_amount is null or p_amount <= 0 or p_amount='NaN'::numeric then raise exception 'Informe o valor da nota fiscal'; end if;
  if p_issued_at is null or p_issued_at > current_date then raise exception 'Data de emissão inválida'; end if;
  if nullif(trim(p_file_path),'') is null then raise exception 'Anexe a nota fiscal'; end if;
  expected_prefix := format('repair_shops/%s/%s/service_orders/%s/invoices/',ctx.tenant_id,ctx.partner_id,p_order_id);
  if strpos(trim(p_file_path),expected_prefix)<>1 or strpos(p_file_path,'..')>0 then raise exception 'O arquivo da nota não pertence a esta ordem de serviço'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)=0 or jsonb_array_length(p_lines)>100 then raise exception 'Informe os itens entregues na nota fiscal'; end if;
  if exists(select 1 from jsonb_array_elements(p_lines) element where jsonb_typeof(element) is distinct from 'object' or exists(select 1 from jsonb_object_keys(element) key where key not in ('quote_item_id','quantity'))) then raise exception 'Linha de nota fiscal inválida'; end if;
  select * into so from public.service_orders where id=p_order_id and tenant_id=ctx.tenant_id and repair_shop_id=ctx.partner_id for update;
  if so.id is null then raise exception 'OS não encontrada para esta oficina'; end if;
  if so.operational_status<>'received' then raise exception 'A nota só pode ser emitida após a prefeitura receber o veículo'; end if;
  if so.financial_status not in ('committed','invoiced') then raise exception 'O processo não está aberto para faturamento'; end if;
  select id,service_order_id,amount into existing from public.service_order_invoices where tenant_id=ctx.tenant_id and repair_shop_id=ctx.partner_id and invoice_number=trim(p_invoice_number) for update;
  if existing.id is not null then
    if existing.service_order_id<>p_order_id or existing.amount<>p_amount then raise exception 'Número de nota já utilizado com outros dados'; end if;
    return existing.id;
  end if;
  if not exists(select 1 from public.service_order_quote_procurement_reservations where service_order_id=p_order_id and state='realized') then
    raise exception 'A OS ainda não possui reserva contratual realizada';
  end if;
  create temporary table if not exists pg_temp.workshop_invoice_lines(
    quote_item_id uuid primary key, quantity numeric(16,2) not null, reservation_quantity numeric(16,2) not null,
    unit_price numeric(16,6) not null, line_amount numeric(14,2) not null
  ) on commit drop;
  truncate pg_temp.workshop_invoice_lines;
  for raw in select * from jsonb_to_recordset(p_lines) as x(quote_item_id uuid,quantity numeric) loop
    if raw.quote_item_id is null or raw.quantity is null or raw.quantity<=0 or raw.quantity<>round(raw.quantity,2) then raise exception 'Quantidade entregue inválida'; end if;
    select r.* into reservation from public.service_order_quote_procurement_reservations r where r.quote_item_id=raw.quote_item_id and r.service_order_id=p_order_id and r.state='realized' for update;
    if not found then raise exception 'Item da nota não possui reserva realizada'; end if;
    select coalesce(sum(other_line.delivered_quantity),0) into consumed
      from public.service_order_invoice_items other_line join public.service_order_invoices other_invoice on other_invoice.id=other_line.invoice_id
     where other_line.quote_item_id=raw.quote_item_id and other_invoice.service_order_id=p_order_id;
    if consumed+raw.quantity>reservation.committed_quantity then raise exception 'Quantidade entregue excede a reserva restante do item'; end if;
    line_amount:=round(raw.quantity*reservation.reserved_unit_price,2);
    insert into pg_temp.workshop_invoice_lines values(raw.quote_item_id,raw.quantity,reservation.committed_quantity,reservation.reserved_unit_price,line_amount);
  end loop;
  select coalesce(sum(wil.line_amount),0) into total_amount from pg_temp.workshop_invoice_lines wil;
  if total_amount<>round(p_amount,2) then raise exception 'A soma dos itens da nota não corresponde ao valor informado'; end if;
  insert into public.service_order_invoices(tenant_id,service_order_id,repair_shop_id,invoice_number,amount,issued_at,file_path,commitment_number)
    values(ctx.tenant_id,p_order_id,ctx.partner_id,trim(p_invoice_number),round(p_amount,2),p_issued_at,trim(p_file_path),so.commitment_number) returning id into v_id;
  insert into public.service_order_invoice_items(invoice_id,quote_item_id,reservation_quantity,delivered_quantity,unit_price,line_amount)
    select v_id,wil.quote_item_id,wil.reservation_quantity,wil.quantity,wil.unit_price,wil.line_amount from pg_temp.workshop_invoice_lines wil;
  update public.service_orders set financial_status='invoiced' where id=p_order_id;
  insert into public.service_order_events(tenant_id,service_order_id,from_state,to_state,axis,actor_id,actor_role,note,attachment_path)
    values(ctx.tenant_id,p_order_id,so.financial_status::text,'invoiced','financial',ctx.profile_id,'oficina',format('NF %s — R$ %s com itens entregues',trim(p_invoice_number),round(p_amount,2)),trim(p_file_path));
  insert into public.procurement_registry_events(tenant_id,process_id,record_id,kind,actor_id,actor_name,reason,after_value)
    select ctx.tenant_id,ins.process_id,v_id,'workshop_invoice',ctx.profile_id,coalesce(nullif(trim(ctx.partner_name),''),'Oficina'),'Nota fiscal itemizada enviada',to_jsonb(i)
      from public.service_order_invoice_items i join public.service_order_quote_procurement_reservations r on r.quote_item_id=i.quote_item_id
      join public.procurement_items pi on pi.id=r.procurement_item_id join public.procurement_instruments ins on ins.id=pi.instrument_id where i.invoice_id=v_id;
  return v_id;
end $$;
revoke all on function public.repair_shop_submit_invoice_v3(uuid,text,numeric,text,date,jsonb) from public, anon, authenticated;
grant execute on function public.repair_shop_submit_invoice_v3(uuid,text,numeric,text,date,jsonb) to authenticated;

alter function public.repair_shop_submit_invoice_v2(uuid,text,numeric,text,date) rename to repair_shop_submit_invoice_v2_before_workshop_attestation;
create function public.repair_shop_submit_invoice_v2(p_order_id uuid,p_invoice_number text,p_amount numeric,p_file_path text,p_issued_at date default current_date)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare ctx record; line_payload jsonb;
begin
  select * into ctx from public.partner_context();
  if exists(select 1 from public.service_order_quote_procurement_reservations where service_order_id=p_order_id and state='realized') then
    select jsonb_agg(jsonb_build_object('quote_item_id',r.quote_item_id,'quantity',r.committed_quantity) order by r.quote_item_id)
      into line_payload from public.service_order_quote_procurement_reservations r where r.service_order_id=p_order_id and r.state='realized';
    return public.repair_shop_submit_invoice_v3(p_order_id,p_invoice_number,p_amount,p_file_path,p_issued_at,line_payload);
  end if;
  return public.repair_shop_submit_invoice_v2_before_workshop_attestation(p_order_id,p_invoice_number,p_amount,p_file_path,p_issued_at);
end $$;
revoke all on function public.repair_shop_submit_invoice_v2(uuid,text,numeric,text,date), public.repair_shop_submit_invoice_v2_before_workshop_attestation(uuid,text,numeric,text,date) from public, anon, authenticated;
grant execute on function public.repair_shop_submit_invoice_v2(uuid,text,numeric,text,date) to authenticated;

create function public.manager_attest_service_order_invoice_v2(p_invoice_id uuid,p_glosa_amount numeric default 0,p_note text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor public.profiles; inv record;
begin
  actor:=sgf_private.quote_procurement_actor();
  select * into inv from public.service_order_invoices where id=p_invoice_id for update;
  if inv.id is null then raise exception 'Nota fiscal não encontrada'; end if;
  if p_glosa_amount is null or p_glosa_amount<0 or p_glosa_amount>inv.amount then raise exception 'Glosa inválida'; end if;
  perform sgf_private.validate_workshop_invoice_lineage(p_invoice_id);
  if inv.attested_at is not null then
    if coalesce(inv.glosa_amount,0)<>round(p_glosa_amount,2) then raise exception 'A nota já foi atestada com outra glosa'; end if;
    return;
  end if;
  perform public.manager_attest_service_order_invoice_before_workshop_attestation(p_invoice_id);
  update public.service_order_invoices set attested_amount=round(amount-p_glosa_amount,2),glosa_amount=round(p_glosa_amount,2),attestation_note=nullif(trim(p_note),'') where id=p_invoice_id;
  if p_glosa_amount>0 or nullif(trim(p_note),'') is not null then
    insert into public.service_order_events(tenant_id,service_order_id,axis,actor_id,actor_role,note)
      values(inv.tenant_id,inv.service_order_id,'note',actor.id,'gestao',format('NF %s atestada com glosa de R$ %s%s',inv.invoice_number,round(p_glosa_amount,2),case when nullif(trim(p_note),'') is null then '' else ' — '||trim(p_note) end));
  end if;
end $$;
revoke all on function public.manager_attest_service_order_invoice_v2(uuid,numeric,text) from public, anon, authenticated;
grant execute on function public.manager_attest_service_order_invoice_v2(uuid,numeric,text) to authenticated;

alter function public.manager_attest_service_order_invoice(uuid) rename to manager_attest_service_order_invoice_before_workshop_attestation;
create function public.manager_attest_service_order_invoice(p_invoice_id uuid)
returns void language sql security definer set search_path=public,pg_temp as $$
  select public.manager_attest_service_order_invoice_v2(p_invoice_id,0,null)
$$;
revoke all on function public.manager_attest_service_order_invoice(uuid), public.manager_attest_service_order_invoice_before_workshop_attestation(uuid) from public, anon, authenticated;
grant execute on function public.manager_attest_service_order_invoice(uuid) to authenticated;

alter function public.manager_register_service_order_payment(uuid,numeric,uuid,date,text)
  rename to manager_register_service_order_payment_before_workshop_invoice_attestation;
create function public.manager_register_service_order_payment(
  p_order_id uuid, p_amount numeric, p_invoice_id uuid default null,
  p_paid_at date default current_date, p_note text default null
)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare ctx record; so record; total_attested numeric; total_paid numeric; remaining numeric; fully_paid boolean;
begin
  perform sgf_private.quote_procurement_actor();
  select * into ctx from public.service_order_manager_context();
  if p_amount is null or p_amount<=0 then raise exception 'Informe um valor de pagamento válido'; end if;
  if p_paid_at is null or p_paid_at>current_date then raise exception 'Data de pagamento inválida'; end if;
  select * into so from public.service_orders where id=p_order_id and (ctx.superadmin or tenant_id=ctx.tenant_id) for update;
  if so.id is null then raise exception 'Ordem de serviço não encontrada'; end if;
  if so.operational_status<>'received' or so.financial_status<>'attested' then raise exception 'O pagamento só pode ser registrado após o recebimento e o ateste de todas as notas'; end if;
  if exists(select 1 from public.service_order_invoices i where i.service_order_id=so.id and i.attested_at is null) then raise exception 'Ainda existem notas fiscais sem ateste'; end if;
  if p_invoice_id is not null and not exists(select 1 from public.service_order_invoices i where i.id=p_invoice_id and i.service_order_id=so.id) then raise exception 'A nota fiscal informada não pertence a esta ordem de serviço'; end if;
  select coalesce(sum(coalesce(i.attested_amount,i.amount)),0) into total_attested from public.service_order_invoices i where i.service_order_id=so.id;
  select coalesce(sum(p.amount),0) into total_paid from public.service_order_payments p where p.service_order_id=so.id;
  if total_attested<=0 then raise exception 'Nenhuma nota fiscal atestada foi encontrada'; end if;
  remaining:=total_attested-total_paid;
  if p_amount>remaining then raise exception 'O pagamento excede o saldo atestado restante de R$ %',remaining; end if;
  insert into public.service_order_payments(tenant_id,service_order_id,invoice_id,amount,paid_at,note,registered_by)
    values(so.tenant_id,so.id,p_invoice_id,p_amount,p_paid_at,nullif(trim(p_note),''),ctx.profile_id);
  total_paid:=total_paid+p_amount; fully_paid:=total_paid>=total_attested;
  if fully_paid then update public.service_orders set financial_status='paid',cost=total_attested where id=so.id; end if;
  insert into public.service_order_events(tenant_id,service_order_id,axis,from_state,to_state,actor_id,actor_role,note)
    values(so.tenant_id,so.id,'financial','attested',case when fully_paid then 'paid' else 'attested' end,ctx.profile_id,'gestao',case when fully_paid then format('Pagamento de R$ %s — processo quitado',p_amount) else format('Pagamento parcial de R$ %s — saldo atestado R$ %s',p_amount,total_attested-total_paid) end);
  return fully_paid;
end $$;
revoke all on function public.manager_register_service_order_payment(uuid,numeric,uuid,date,text), public.manager_register_service_order_payment_before_workshop_invoice_attestation(uuid,numeric,uuid,date,text) from public, anon, authenticated;
grant execute on function public.manager_register_service_order_payment(uuid,numeric,uuid,date,text) to authenticated;

alter function sgf_private.resource_modules(text,boolean) rename to resource_modules_before_workshop_invoice_attestation;
create function sgf_private.resource_modules(p_resource text,p_write boolean) returns text[] language sql immutable set search_path='' as $$
select case when p_resource in ('repair_shop_submit_invoice_v3','repair_shop_submit_invoice_v2','manager_attest_service_order_invoice','manager_attest_service_order_invoice_v2','manager_register_service_order_payment') then array['maintenances','procurement','budgets'] else sgf_private.resource_modules_before_workshop_invoice_attestation(p_resource,p_write) end
$$;
revoke all on function sgf_private.resource_modules(text,boolean) from public, anon, authenticated;
notify pgrst,'reload schema';
