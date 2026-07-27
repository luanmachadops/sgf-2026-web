-- ============================================================================
-- FASE 8 — Fechamento mensal da oficina
-- STATUS: *** APLICADA em 2026-07-27 ***
--
-- O posto já tinha `get_station_monthly_summary`; a oficina não tinha
-- equivalente e precisava pedir os números à prefeitura para conferir o que
-- tem a receber.
--
-- Competência = mês do RECEBIMENTO do veículo (`received_at`), não o da
-- abertura da OS: é quando o serviço foi entregue e passa a ser faturável.
-- Uma OS aberta em março e entregue em abril pertence ao fechamento de abril,
-- que é como a prefeitura empenha e paga.
--
-- Verificada em transação revertida (5/5):
--   • traz só a OS do mês e da própria oficina
--   • orçado/faturado/atestado/pago/saldo corretos (400/400/400/150/250)
--   • competência segue o recebimento, não a abertura
--   • oficina B não vê a OS da oficina A
--   • posto é barrado (a função é exclusiva de oficina)
-- ============================================================================

create or replace function public.get_workshop_monthly_summary(p_month date default current_date)
returns table (
  order_id uuid, plate text, category text, received_at timestamptz,
  quoted_amount numeric, invoiced_amount numeric, attested_amount numeric,
  paid_amount numeric, balance numeric, financial_status text
)
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare ctx record; v_start timestamptz; v_end timestamptz;
begin
  select * into ctx from public.partner_read_context();
  if ctx.kind <> 'oficina' then raise exception 'Somente oficinas'; end if;
  if p_month is null then raise exception 'Informe o mês do fechamento'; end if;

  v_start := date_trunc('month', p_month::timestamp) at time zone 'America/Sao_Paulo';
  v_end := (date_trunc('month', p_month::timestamp) + interval '1 month') at time zone 'America/Sao_Paulo';

  return query
  select so.id, v.plate, so.category, so.received_at,
    coalesce((select q.total from public.service_order_quotes q
               where q.service_order_id = so.id and q.status = 'aprovado'
               order by q.version desc limit 1), 0)::numeric,
    coalesce((select sum(i.amount) from public.service_order_invoices i
               where i.service_order_id = so.id), 0)::numeric,
    coalesce((select sum(i.amount) from public.service_order_invoices i
               where i.service_order_id = so.id and i.attested_at is not null), 0)::numeric,
    coalesce((select sum(pg.amount) from public.service_order_payments pg
               where pg.service_order_id = so.id), 0)::numeric,
    (coalesce((select sum(i.amount) from public.service_order_invoices i
                where i.service_order_id = so.id), 0)
     - coalesce((select sum(pg.amount) from public.service_order_payments pg
                  where pg.service_order_id = so.id), 0))::numeric,
    so.financial_status::text
  from public.service_orders so
  join public.vehicles v on v.id = so.vehicle_id
  where so.tenant_id = ctx.tenant_id
    and so.repair_shop_id = ctx.partner_id
    and so.received_at >= v_start
    and so.received_at <  v_end
  order by so.received_at desc;
end;
$function$;

revoke all on function public.get_workshop_monthly_summary(date) from public, anon;
grant execute on function public.get_workshop_monthly_summary(date) to authenticated;
