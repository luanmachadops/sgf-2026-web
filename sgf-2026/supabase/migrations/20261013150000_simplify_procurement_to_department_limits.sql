-- T10 fase 2 — licitação reduzida ao limite por secretaria (2026-10-13).
--
-- Licitação, contrato, empenho, nota fiscal, ateste e pagamento ficam com as
-- secretarias e a contabilidade. O único controle que o sistema mantém é o teto
-- de consumo de cada secretaria em cada licitação (budget_contracts /
-- budget_allocations / budget_entries), aplicado por sgf_private.budget_operation_trigger.
--
-- Esta migration:
--   1. tira do abastecimento a exigência de saldo de empenho do posto (sem nenhum
--      empenho cadastrado, ela recusava toda autorização em posto);
--   2. tira o teto e a vigência do contrato cadastrados no posto e na oficina
--      (o teto passa a ser só o da licitação, por secretaria);
--   3. aprovar o orçamento da OS deixa de exigir o vínculo de cada item a um item
--      de licitação e libera a oficina para executar, sem a etapa de empenho.
--
-- Nada é apagado: tabelas e funções antigas ficam no banco, sem uso. A reversão
-- está em docs/rollback/20261013150000_simplify_procurement_to_department_limits.sql.

-- 1 e 2. Travas de empenho do posto e de contrato do fornecedor.
drop trigger if exists trg_fuelings_require_commitment on public.fuelings;
drop trigger if exists trg_station_operations_require_commitment on public.station_operations;
drop trigger if exists trg_enforce_station_contract_budget on public.fuelings;
drop trigger if exists trg_enforce_repair_shop_contract_budget on public.service_order_quotes;

-- 3a. A aprovação do orçamento passa direto para a checagem de acesso e a regra
-- original, sem as camadas de vínculo/reserva do módulo de licitações.
create or replace function public.manager_review_service_order_quote(p_quote_id uuid, p_approved boolean, p_note text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform public.manager_review_service_order_quote_before_procurement_links(p_quote_id, p_approved, p_note);
end $function$;

-- 3b. Orçamento aprovado = liberado para execução. O status financeiro vai direto
-- para 'committed' (o que a oficina e o recebimento já exigem), e a cota da
-- secretaria é reservada pelo budget_operation_trigger nesse mesmo update.
create or replace function sgf_private.rpc_original__manager_review_service_order_quote(p_quote_id uuid, p_approved boolean, p_note text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
       set financial_status = 'committed',
           budget = q.total
     where id = so.id;

    insert into public.service_order_events (
      tenant_id, service_order_id, axis, from_state, to_state,
      actor_id, actor_role, note
    )
    values (
      so.tenant_id, so.id, 'financial', 'not_started', 'committed',
      ctx.profile_id, 'gestao',
      format('Orçamento v%s aprovado — R$ %s. Oficina liberada para executar.', q.version, q.total)
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
$function$;

-- 3c. OS já aprovadas e paradas esperando empenho seguem para execução.
with liberadas as (
  update public.service_orders
     set financial_status = 'committed'
   where financial_status = 'awaiting_commitment'
     and operational_status <> 'cancelled'
  returning id, tenant_id
)
insert into public.service_order_events (tenant_id, service_order_id, axis, from_state, to_state, actor_role, note)
select tenant_id, id, 'financial', 'awaiting_commitment', 'committed', 'sistema',
       'Etapa de empenho removida do sistema: oficina liberada para executar.'
  from liberadas;

-- 4. Número do(s) empenho(s) de cada secretaria, só como referência para a
-- conferência com a contabilidade. O limite da secretaria representa o valor
-- empenhado; o número não trava nenhum fluxo. Fica em budget_contracts.reporting
-- (chave "empenhos": {department_id: texto}), já auditado em budget_events.
create or replace function public.save_department_budget(p_payload jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_id uuid; r jsonb:=p_payload->'reporting'; k text; v text; before_reporting jsonb;
begin
  if r is not null then
    if jsonb_typeof(r)<>'object' or octet_length(r::text)>100000 then raise exception 'Referências SIM-AM inválidas'; end if;
    for k,v in select key,value from jsonb_each_text(r) where key not in ('dotacoes','empenhos') loop
      if k not in ('idPessoa','nrLicitacao','nrAnoLicitacao','idTipoInstrumentoConvocatorio','idModalidadeLicitacao','idTipoDocOrigemLicitacao','nrDocOrigemLicitacao') then raise exception 'Campo SIM-AM desconhecido: %',k; end if;
      if jsonb_typeof(r->k)<>'string' then raise exception 'Informe os códigos SIM-AM como texto'; end if;
      if v<>'' then
        if k='nrDocOrigemLicitacao' then
          if v!~'^[A-Za-z0-9]{14,15}$' then raise exception 'Documento de origem inválido'; end if;
        elsif k='nrAnoLicitacao' then
          if v!~'^[0-9]{4}$' then raise exception 'Ano da licitação inválido'; end if;
        elsif v!~'^[0-9]+$' or length(v)>(case when k='idPessoa' then 7 when k='nrLicitacao' then 9 else 2 end) then
          raise exception 'Código SIM-AM inválido: %',k;
        end if;
      end if;
    end loop;
    if r ? 'dotacoes' then
      if jsonb_typeof(r->'dotacoes')<>'object' then raise exception 'Dotações SIM-AM inválidas'; end if;
      for k,v in select key,value from jsonb_each_text(r->'dotacoes') loop
        if jsonb_typeof(r->'dotacoes'->k)<>'string' or (v<>'' and v!~'^[0-9]{28}$') then raise exception 'A dotação SIM-AM deve ter 28 dígitos'; end if;
        if not exists(select 1 from jsonb_array_elements(p_payload->'allocations') a where a->>'department_id'=k) then
          raise exception 'Dotação sem secretaria na distribuição'; end if;
      end loop;
    end if;
    if r ? 'empenhos' then
      if jsonb_typeof(r->'empenhos')<>'object' then raise exception 'Empenhos inválidos'; end if;
      for k,v in select key,value from jsonb_each_text(r->'empenhos') loop
        if jsonb_typeof(r->'empenhos'->k)<>'string' or length(v)>200 then raise exception 'Informe o número do empenho como texto de até 200 caracteres'; end if;
        if not exists(select 1 from jsonb_array_elements(p_payload->'allocations') a where a->>'department_id'=k) then
          raise exception 'Empenho de secretaria fora da distribuição'; end if;
      end loop;
    end if;
  end if;
  v_id:=sgf_private.save_department_budget_core(p_payload);
  if r is not null then
    select reporting into before_reporting from public.budget_contracts where id=v_id;
    update public.budget_contracts set reporting=r where id=v_id;
    if r is distinct from before_reporting then
      insert into public.budget_events(contract_id,actor_id,event_type,reason,before_value,after_value)
      values(v_id,auth.uid(),'reporting_references',trim(p_payload->>'reason'),before_reporting,r);
    end if;
  end if;
  return v_id;
end $function$;
