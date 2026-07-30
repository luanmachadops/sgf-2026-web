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

revoke all on function public.manager_confirm_station_closing_payment(uuid,date,text,text)
  from public,anon;
grant execute on function public.manager_confirm_station_closing_payment(uuid,date,text,text)
  to authenticated;
