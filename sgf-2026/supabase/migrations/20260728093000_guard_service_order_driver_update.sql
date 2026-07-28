-- ============================================================================
-- FIX DE SEGURANÇA: motorista concluía a própria O.S. e devolvia o veículo
-- defeituoso para circulação
--
-- VULNERABILIDADE
--   A policy `service_orders_owner_update` restringe QUAL LINHA pode ser
--   tocada, mas não o CONTEÚDO do novo registro:
--
--     USING      ((auth.uid() = driver_id) AND (status = 'pendente'))
--     WITH CHECK  (auth.uid() = driver_id)
--
--   O GRANT de UPDATE para `authenticated` cobre TODAS as colunas da tabela.
--   Como a linha ainda está `pendente`, ela passa no USING; e como o WITH CHECK
--   só cobra a titularidade, o novo valor de `status`, `cost`, `budget`,
--   `approved_by`, `financial_status`, `operational_status` e `repair_shop_id`
--   passa livre. Num único UPDATE o motorista faz:
--
--     update public.service_orders
--        set status = 'concluida', cost = 0, approved_by = auth.uid()
--      where id = <a própria O.S.>;   -- ainda 'pendente' no momento do UPDATE
--
--   O trigger `tf_service_order_vehicle_status` então faz corretamente o que
--   lhe cabe: status 'concluida' => devolve o veículo para 'liberado'.
--
--   Impacto: (a) fraude no custo de manutenção — o motorista carimba o valor da
--   O.S.; (b) mais grave, um veículo com defeito REAL relatado por ele mesmo é
--   liberado para circulação sem que oficina ou gestor tenham visto o problema.
--   A frota inclui ambulâncias e ônibus escolares.
--
-- POR QUE POLICY **E** TRIGGER
--   RLS não compara OLD com NEW: o WITH CHECK só enxerga a linha final. Exigir
--   `status = 'pendente'` no WITH CHECK barra a transição de estado (que é o
--   vetor de liberação do veículo), mas NÃO barra o motorista de gravar
--   `cost`/`budget`/`approved_by`/`repair_shop_id` numa linha que segue
--   'pendente' — nem de zerar um valor que já existia. Regra que depende de
--   comparar antes/depois é trabalho de trigger. Por isso:
--
--     • POLICY  -> qual linha ele alcança e em que estado a linha pode ficar
--                  (titularidade + os três eixos de status travados em aberto).
--     • TRIGGER -> quais COLUNAS ele pode ter mudado (whitelist, fail-closed).
--
--   As duas camadas se sobrepõem de propósito: se uma policy for reescrita sem
--   cuidado no futuro, o trigger continua barrando; e vice-versa.
--
-- POR QUE NÃO REVOGAR O GRANT DE COLUNA
--   `authenticated` é o MESMO role de banco para motorista, gestor, secretário
--   e oficina — a separação é feita por policy, não por GRANT. Revogar UPDATE
--   em `status`/`cost` para `authenticated` derrubaria junto qualquer escrita
--   direta de gestão. A trava tem que ser por identidade, não por GRANT.
--
-- O QUE CONTINUA FUNCIONANDO (verificado antes de endurecer, não presumido)
--   • Fluxo gerencial e da oficina: TODAS as transições passam por RPCs
--     SECURITY DEFINER cujo dono é `postgres`, que também é dono da tabela
--     (`service_orders`.relowner = postgres, relforcerowsecurity = false) —
--     logo essas RPCs não são avaliadas por RLS. Dentro delas `current_user` é
--     'postgres', então o trigger abaixo também sai sem tocar em nada. Lidas:
--     manager_create_service_order, manager_update_service_order_request,
--     manager_authorize_service_order, manager_confirm_shop_delivery,
--     manager_review_service_order_quote, manager_register_service_order_commitment,
--     manager_receive_service_order_vehicle, manager_attest_service_order_invoice,
--     manager_register_service_order_payment, manager_cancel_service_order,
--     repair_shop_submit_quote(_v2), repair_shop_start_service,
--     repair_shop_finish_service(_v2), repair_shop_submit_invoice(_v2).
--   • Portal da oficina (web/src/lib/workshop-portal-api.ts) e painel de gestão
--     (web/src/lib/supabase-api.ts): não há UM `.update()` direto em
--     `service_orders` no código web — só `.select()`. Toda escrita é `.rpc()`.
--   • Triggers internos `tf_service_order_sync_status` (deriva status <->
--     operational_status) e `tf_service_order_vehicle_status` (libera/prende o
--     veículo): inalterados. O guard roda ANTES dos dois (ordem alfabética dos
--     BEFORE triggers: guard_driver_update < sync_status < vehicle_status), de
--     modo que ele compara o payload do cliente com OLD, sem enxergar as
--     colunas derivadas pelos triggers internos.
--   • App do motorista: `updateServiceOrder()` (src/lib/data.ts) envia apenas
--     `description` e `priority`; a tela só oferece editar/excluir quando
--     `status === 'pendente'`. Nada no app é bloqueado por esta migration.
-- ============================================================================

-- ─── 1. UPDATE do motorista ─────────────────────────────────────────────────
-- USING: linha própria e ainda intocada pela gestão (os três eixos em aberto).
-- WITH CHECK: a linha tem que CONTINUAR nesse estado depois do UPDATE. É isto
-- que impede `status = 'concluida'` e, por tabela, a liberação do veículo.
-- Os três eixos aparecem juntos porque `tf_service_order_sync_status` deriva um
-- do outro: travar só `status` deixaria a porta aberta por `operational_status`.

drop policy if exists service_orders_owner_update on public.service_orders;

create policy service_orders_owner_update
  on public.service_orders
  for update
  using (
    auth.uid() = driver_id
    and status = 'pendente'::public.service_order_status
    and operational_status = 'pending'::public.service_order_op_status
    and financial_status = 'not_started'::public.service_order_fin_status
  )
  with check (
    auth.uid() = driver_id
    and status = 'pendente'::public.service_order_status
    and operational_status = 'pending'::public.service_order_op_status
    and financial_status = 'not_started'::public.service_order_fin_status
  );

comment on policy service_orders_owner_update on public.service_orders is
  'Motorista edita a própria solicitação enquanto ela está pendente nos três eixos, e ela precisa continuar pendente depois do UPDATE (WITH CHECK). Quais colunas ele pode ter mudado é responsabilidade de tf_service_order_guard_driver_update — RLS não compara OLD com NEW.';

-- ─── 2. DELETE do motorista ─────────────────────────────────────────────────
-- Continua fazendo sentido: excluir uma O.S. 'pendente' não devolve veículo
-- nenhum para circulação (tf_service_order_vehicle_status só mexe em veículo a
-- partir de 'aprovada'), e a exclusão deixa trilha — trg_activity_service_orders
-- grava em activity_log com action='delete', sensitivity='sensivel' e snapshot
-- completo da linha, e tf_activity_log é SECURITY DEFINER (a gravação da trilha
-- não depende das permissões do motorista).
--
-- Duas travas novas:
--   • os mesmos três eixos do UPDATE, para não depender só de `status`;
--   • `opened_by = auth.uid()`: uma O.S. aberta PELA GESTÃO para este motorista
--     (manager_create_service_order, origin='manager') tem driver_id dele e
--     nasce 'pendente' — hoje ele apaga a solicitação do gestor. O.S. de origem
--     'driver' e 'checklist' têm opened_by = o próprio motorista, então a tela
--     de manutenção do app não muda de comportamento.

drop policy if exists service_orders_owner_delete on public.service_orders;

create policy service_orders_owner_delete
  on public.service_orders
  for delete
  using (
    auth.uid() = driver_id
    and auth.uid() = opened_by
    and status = 'pendente'::public.service_order_status
    and operational_status = 'pending'::public.service_order_op_status
    and financial_status = 'not_started'::public.service_order_fin_status
  );

comment on policy service_orders_owner_delete on public.service_orders is
  'Motorista exclui apenas a solicitação que ele mesmo abriu e que ninguém da gestão tocou. Não libera veículo (o veículo só vai para manutenção a partir de aprovada) e fica registrada em activity_log como exclusão sensível com snapshot.';

-- ─── 3. Trigger: quais colunas o motorista pode ter mudado ──────────────────
-- Whitelist fail-closed: qualquer coluna fora da lista — inclusive colunas que
-- venham a ser criadas depois desta migration — é imutável para o motorista.

create or replace function public.tf_service_order_guard_driver_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  -- Campos da solicitação que são do motorista: o mesmo conjunto que a gestão
  -- edita em manager_update_service_order_request, menos a reatribuição de
  -- veículo/motorista (que é ato de gestão).
  v_allowed constant text[] := array['category', 'description', 'priority', 'odometer'];
  v_old jsonb;
  v_new jsonb;
  v_key text;
begin
  -- Escrita que NÃO vem de um cliente PostgREST autenticado: RPCs
  -- SECURITY DEFINER (current_user = 'postgres', dono das funções e da
  -- tabela), service_role das rotas serverless, cron, psql de manutenção.
  -- Nenhuma delas é "o motorista editando a própria O.S.".
  if current_user not in ('authenticated', 'anon') then
    return NEW;
  end if;

  -- Papéis com policy própria de escrita seguem governados por ela.
  if public.is_superadmin()
     or public.is_admin_or_manager()
     or public.is_secretario()
     or public.is_oficina() then
    return NEW;
  end if;

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  for v_key in select jsonb_object_keys(v_new) loop
    if not (v_key = any(v_allowed))
       and (v_old -> v_key) is distinct from (v_new -> v_key) then
      raise exception
        'Motorista não pode alterar "%" de uma ordem de serviço. Edite apenas a descrição da solicitação; aprovação, custo, oficina e conclusão são da gestão.', v_key
        using errcode = '42501';
    end if;
  end loop;

  return NEW;
end;
$function$;

comment on function public.tf_service_order_guard_driver_update() is
  'Trava por COLUNA o UPDATE do motorista em service_orders (RLS não compara OLD com NEW): só category, description, priority e odometer podem mudar. Whitelist fail-closed — coluna nova nasce imutável para o motorista. Isenta escrita fora de PostgREST (RPCs SECURITY DEFINER, service_role) e os papéis de gestão/oficina, que têm policy própria.';

-- Nome escolhido para ordenar ANTES de trg_service_order_sync_status e
-- trg_service_order_vehicle_status (BEFORE triggers disparam em ordem
-- alfabética): o guard compara o payload do cliente com OLD, sem enxergar as
-- colunas que os triggers internos derivam depois.
drop trigger if exists trg_service_order_guard_driver_update on public.service_orders;

create trigger trg_service_order_guard_driver_update
  before update on public.service_orders
  for each row execute function public.tf_service_order_guard_driver_update();

revoke all on function public.tf_service_order_guard_driver_update() from public, anon, authenticated;
