-- Avisos entre gestor, posto e oficina + expiração automática de autorizações.
--
-- Antes: o gestor só sabia que a oficina enviou orçamento, concluiu o serviço
-- ou mandou nota fiscal, e que o posto enviou fechamento/nota ou executou uma
-- operação complementar, se abrisse a tela. O posto não era avisado de nova
-- operação complementar nem do andamento do fechamento. Autorizações vencidas
-- ficavam "autorizado" para sempre (somem para posto e motorista, mas seguiam
-- reservando saldo do contrato até o gestor cancelar).
--
-- Só gatilhos de aviso (AFTER) e uma rotina de expiração: nenhuma regra de
-- negócio existente muda.

-- ─── Oficina → gestor ────────────────────────────────────────────────────────
create or replace function public.tg_notify_manager_workshop_quote()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_plate text; v_shop text;
begin
  if new.status <> 'enviado' then return new; end if;
  select v.plate into v_plate from public.service_orders so join public.vehicles v on v.id = so.vehicle_id where so.id = new.service_order_id;
  select name into v_shop from public.repair_shops where id = new.repair_shop_id;
  perform public.notify_admins('warning', 'Orçamento aguardando aprovação',
    format('%s · %s · R$ %s', coalesce(v_plate, 'Veículo'), coalesce(v_shop, 'Oficina'), translate(to_char(coalesce(new.total, 0), 'FM999,999,990.00'), ',.', '.,')),
    '/manutencoes', 'service_order', new.service_order_id, new.tenant_id);
  return new;
end $$;
drop trigger if exists trg_notify_manager_workshop_quote on public.service_order_quotes;
create trigger trg_notify_manager_workshop_quote after insert on public.service_order_quotes
  for each row execute function public.tg_notify_manager_workshop_quote();

create or replace function public.tg_notify_manager_workshop_ready()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_plate text; v_shop text;
begin
  if new.operational_status::text <> 'ready' or old.operational_status is not distinct from new.operational_status then return new; end if;
  select plate into v_plate from public.vehicles where id = new.vehicle_id;
  select name into v_shop from public.repair_shops where id = new.repair_shop_id;
  perform public.notify_admins('success', 'Serviço concluído pela oficina',
    format('%s · %s · confira e receba o veículo', coalesce(v_plate, 'Veículo'), coalesce(v_shop, 'Oficina')),
    '/manutencoes', 'service_order', new.id, new.tenant_id);
  return new;
end $$;
drop trigger if exists trg_notify_manager_workshop_ready on public.service_orders;
create trigger trg_notify_manager_workshop_ready after update of operational_status on public.service_orders
  for each row execute function public.tg_notify_manager_workshop_ready();

create or replace function public.tg_notify_manager_workshop_invoice()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_plate text; v_shop text;
begin
  select v.plate into v_plate from public.service_orders so join public.vehicles v on v.id = so.vehicle_id where so.id = new.service_order_id;
  select name into v_shop from public.repair_shops where id = new.repair_shop_id;
  perform public.notify_admins('warning', 'Nota fiscal da oficina para atestar',
    format('%s · %s · NF %s · R$ %s', coalesce(v_plate, 'Veículo'), coalesce(v_shop, 'Oficina'), new.invoice_number, translate(to_char(new.amount, 'FM999,999,990.00'), ',.', '.,')),
    '/manutencoes', 'service_order', new.service_order_id, new.tenant_id);
  return new;
end $$;
drop trigger if exists trg_notify_manager_workshop_invoice on public.service_order_invoices;
create trigger trg_notify_manager_workshop_invoice after insert on public.service_order_invoices
  for each row execute function public.tg_notify_manager_workshop_invoice();

-- ─── Posto ↔ gestor: operações complementares (arla, lubrificante, serviço) ──
create or replace function public.tg_notify_station_operation()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_plate text; v_station text;
begin
  select plate into v_plate from public.vehicles where id = new.vehicle_id;
  select name into v_station from public.fuel_stations where id = new.station_id;
  if new.status = 'autorizado' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.notify_partner_profile('posto', new.station_id, new.tenant_id, 'info', 'Nova autorização de produto/serviço',
      format('%s · %s · até %s %s', coalesce(v_plate, 'Veículo'), new.item_name, new.authorized_quantity, new.unit),
      '/posto/autorizacoes', 'station_operation', new.id);
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    if new.status = 'concluido' then
      perform public.notify_admins('warning', 'Operação do posto aguardando validação',
        format('%s · %s · %s', coalesce(v_plate, 'Veículo'), new.item_name, coalesce(v_station, 'Posto')),
        '/abastecimentos', 'station_operation', new.id, new.tenant_id);
    elsif new.status in ('validado', 'rejeitado') then
      perform public.notify_partner_profile('posto', new.station_id, new.tenant_id,
        case when new.status = 'validado' then 'success' else 'alert' end,
        case when new.status = 'validado' then 'Operação validada' else 'Operação rejeitada' end,
        format('%s · %s%s', coalesce(v_plate, 'Veículo'), new.item_name,
          case when new.status = 'rejeitado' and nullif(trim(new.rejection_reason), '') is not null then ' · ' || trim(new.rejection_reason) else '' end),
        '/posto/historico', 'station_operation', new.id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_station_operation on public.station_operations;
create trigger trg_notify_station_operation after insert or update of status on public.station_operations
  for each row execute function public.tg_notify_station_operation();

-- ─── Posto ↔ gestor: fechamento mensal ───────────────────────────────────────
create or replace function public.tg_notify_station_closing()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_station text; v_comp text;
begin
  select name into v_station from public.fuel_stations where id = new.station_id;
  v_comp := to_char(new.competence, 'MM/YYYY');
  -- Posto enviou (ou reenviou) o fechamento → gestor revisa.
  if new.status = 'enviado' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.notify_admins('warning', 'Fechamento mensal do posto para revisar',
      format('%s · %s · R$ %s', coalesce(v_station, 'Posto'), v_comp, translate(to_char(coalesce(new.total_amount, 0), 'FM999,999,990.00'), ',.', '.,')),
      '/abastecimentos', 'station_closing', new.id, new.tenant_id);
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status in ('aprovado', 'devolvido') then
    perform public.notify_partner_profile('posto', new.station_id, new.tenant_id,
      case when new.status = 'aprovado' then 'success' else 'alert' end,
      case when new.status = 'aprovado' then 'Fechamento aprovado' else 'Fechamento devolvido para correção' end,
      format('%s%s', v_comp, case when new.status = 'devolvido' and nullif(trim(new.review_note), '') is not null then ' · ' || trim(new.review_note) else '' end),
      '/posto/fechamento', 'station_closing', new.id);
  end if;
  -- Andamento fiscal → posto acompanha (empenho, ateste, pagamento).
  if tg_op = 'UPDATE' and old.fiscal_status is distinct from new.fiscal_status
     and new.fiscal_status in ('coberto', 'atestado', 'pagamento_programado', 'pago') then
    perform public.notify_partner_profile('posto', new.station_id, new.tenant_id, 'success',
      case new.fiscal_status
        when 'coberto' then 'Empenho vinculado ao fechamento'
        when 'atestado' then 'Nota fiscal atestada'
        when 'pagamento_programado' then 'Pagamento programado'
        else 'Pagamento realizado' end,
      case when new.fiscal_status = 'coberto' then format('%s · envie a nota fiscal', v_comp) else v_comp end,
      '/posto/fechamento', 'station_closing', new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_station_closing on public.station_monthly_closings;
create trigger trg_notify_station_closing after insert or update of status, fiscal_status on public.station_monthly_closings
  for each row execute function public.tg_notify_station_closing();

create or replace function public.tg_notify_manager_station_invoice()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_station text;
begin
  select name into v_station from public.fuel_stations where id = new.station_id;
  perform public.notify_admins('warning', 'Nota fiscal do posto para atestar',
    format('%s · NF %s · R$ %s', coalesce(v_station, 'Posto'), new.invoice_number, translate(to_char(new.amount, 'FM999,999,990.00'), ',.', '.,')),
    '/abastecimentos', 'station_closing', new.closing_id, new.tenant_id);
  return new;
end $$;
drop trigger if exists trg_notify_manager_station_invoice on public.station_closing_invoices;
create trigger trg_notify_manager_station_invoice after insert on public.station_closing_invoices
  for each row execute function public.tg_notify_manager_station_invoice();

-- ─── Expiração automática de autorizações ────────────────────────────────────
-- Vencida = posto e motorista já não veem; cancelar libera o saldo reservado.
create or replace function public.expire_open_authorizations()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer := 0; v_ops integer := 0; r record;
begin
  with expired as (
    update public.fuelings
       set workflow_status = 'rejeitado_admin', cancelled_at = now(), cancellation_reason = 'Autorização vencida'
     where workflow_status = 'autorizado' and cancelled_at is null and expires_at is not null and expires_at <= now()
    returning tenant_id
  )
  select count(*) into v_count from expired;

  for r in
    update public.station_operations
       set status = 'cancelado', rejection_reason = 'Autorização vencida', updated_at = now()
     where status = 'autorizado' and executed_at is null and expires_at is not null and expires_at <= now()
    returning tenant_id
  loop
    v_ops := v_ops + 1;
  end loop;

  return v_count + v_ops;
end $$;
revoke all on function public.expire_open_authorizations() from public, anon, authenticated;

-- Avisos de autorização vencida: o motorista e o posto recebem "vencida", não "rejeitado".
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.tg_notify_fueling()'::regprocedure);
  d := replace(d,
    $x$elsif new.workflow_status in ('validado', 'rejeitado_admin')$x$,
    $x$elsif new.workflow_status = 'rejeitado_admin' and new.cancellation_reason = 'Autorização vencida' then
        if new.driver_id is not null then
          perform public.notify_users(array[new.driver_id], 'info', 'Autorização de abastecimento vencida',
            coalesce(v_plate, 'Veículo'), '/abastecimentos', 'fueling', new.id);
        end if;
      elsif new.workflow_status in ('validado', 'rejeitado_admin')$x$);
  if strpos(d, 'Autorização de abastecimento vencida') = 0 then raise exception 'tg_notify_fueling: trecho não encontrado'; end if;
  execute d;

  d := pg_get_functiondef('public.tg_notify_station_partner()'::regprocedure);
  d := replace(d,
    $x$and new.workflow_status::text in ('validado', 'rejeitado_admin') then$x$,
    $x$and new.workflow_status::text in ('validado', 'rejeitado_admin') and coalesce(new.cancellation_reason, '') <> 'Autorização vencida' then$x$);
  if strpos(d, 'Autorização vencida') = 0 then raise exception 'tg_notify_station_partner: trecho não encontrado'; end if;
  execute d;
end
$do$;

select cron.schedule('expire-open-authorizations', '5 * * * *', $$ select public.expire_open_authorizations(); $$);
