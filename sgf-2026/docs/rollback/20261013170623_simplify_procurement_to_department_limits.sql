-- Reversão de 20261013170623_simplify_procurement_to_department_limits.sql.
-- Definições copiadas da produção em 2026-10-13, antes da mudança.
-- Não reverte o passo 3c (OS que já foram liberadas continuam liberadas).

create trigger trg_fuelings_require_commitment before insert on public.fuelings
  for each row execute function public.tg_require_station_commitment();
create trigger trg_station_operations_require_commitment before insert on public.station_operations
  for each row execute function public.tg_require_station_commitment();
create trigger trg_enforce_station_contract_budget before insert on public.fuelings
  for each row execute function public.enforce_station_contract_budget();
create trigger trg_enforce_repair_shop_contract_budget before update of status on public.service_order_quotes
  for each row execute function public.enforce_repair_shop_contract_budget();

create or replace function public.manager_review_service_order_quote(p_quote_id uuid, p_approved boolean, p_note text default null::text)
 returns void language plpgsql security definer set search_path to ''
as $function$
begin
  if p_approved then perform sgf_private.reserve_workshop_quote(p_quote_id); end if;
  perform public.manager_review_service_order_quote_before_workshop_reservation(p_quote_id,p_approved,p_note);
end $function$;

-- Na regra original, a aprovação ia para 'awaiting_commitment' (empenho antes da execução).
create or replace function sgf_private.rpc_original__manager_review_service_order_quote(p_quote_id uuid, p_approved boolean, p_note text default null::text)
 returns void language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare ctx record; q record; so record;
begin
  select * into ctx from public.service_order_manager_context();
  select * into q from public.service_order_quotes where id = p_quote_id for update;
  if q.id is null then raise exception 'Orçamento não encontrado'; end if;
  if q.status <> 'enviado' then raise exception 'Este orçamento já foi analisado'; end if;
  if not p_approved and nullif(trim(p_note), '') is null then
    raise exception 'Informe o motivo da devolução do orçamento';
  end if;
  select * into so from public.service_orders
   where id = q.service_order_id and tenant_id = q.tenant_id and (ctx.superadmin or tenant_id = ctx.tenant_id) for update;
  if so.id is null then raise exception 'Ordem de serviço não encontrada'; end if;
  if so.operational_status <> 'awaiting_quote_approval' or so.financial_status <> 'not_started' then
    raise exception 'A ordem de serviço não está aguardando análise do orçamento';
  end if;
  if p_approved then
    if q.valid_until is not null and q.valid_until < current_date then raise exception 'O orçamento está vencido'; end if;
    update public.service_order_quotes set status = 'aprovado', reviewed_by = ctx.profile_id, reviewed_at = now(), review_note = nullif(trim(p_note), '') where id = q.id;
    update public.service_orders set financial_status = 'awaiting_commitment', budget = q.total where id = so.id;
    insert into public.service_order_events (tenant_id, service_order_id, axis, from_state, to_state, actor_id, actor_role, note)
    values (so.tenant_id, so.id, 'financial', 'not_started', 'awaiting_commitment', ctx.profile_id, 'gestao', format('Orçamento v%s aprovado — R$ %s', q.version, q.total));
  else
    update public.service_order_quotes set status = 'rejeitado', reviewed_by = ctx.profile_id, reviewed_at = now(), review_note = trim(p_note) where id = q.id;
    update public.service_orders set operational_status = 'at_shop' where id = so.id;
    insert into public.service_order_events (tenant_id, service_order_id, axis, actor_id, actor_role, note)
    values (so.tenant_id, so.id, 'note', ctx.profile_id, 'gestao', format('Orçamento v%s devolvido: %s', q.version, trim(p_note)));
  end if;
end
$function$;
