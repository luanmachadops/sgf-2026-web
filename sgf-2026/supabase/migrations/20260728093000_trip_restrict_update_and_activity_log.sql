-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoria 2026-07 · Correção ALTA #6 — viagem concluída editável e sem
-- auditoria.
--
-- Problema:
--   - `trips_update_own` era `USING/WITH CHECK (auth.uid() = driver_id)`, sem
--     filtro de status: o motorista podia editar uma viagem já 'concluida'
--     (odômetro, notas, fotos) a qualquer momento depois do fato.
--   - Não existia trigger de activity_log em `trips` (só há em `checklists`,
--     via `trg_activity_checklists ... execute function tf_activity_log('checklist')`,
--     confirmado por pg_get_triggerdef antes de escrever esta migration).
--
-- Solução:
--   1. Restringe `trips_update_own` a linhas cujo status ATUAL é 'andamento'
--      (USING) — o motorista só consegue mexer numa viagem enquanto ela está
--      em curso. O próprio update que a encerra (endTrip: status→'concluida')
--      ainda passa, porque o USING é avaliado sobre a linha ANTES do update
--      (que está 'andamento'). Depois de concluída, nenhum update do dono
--      passa mais pela policy.
--   2. Cria `trg_activity_trips`, no mesmo padrão de `trg_activity_checklists`
--      (AFTER INSERT OR UPDATE OR DELETE, tf_activity_log('trip')).
--
-- Por que não quebra as RPCs SECURITY DEFINER (takeover_vehicle,
-- release_stale_trip, auto_close_abandoned_trips):
--   As três rodam como SECURITY DEFINER e não passam pela policy
--   `trips_update_own` (RLS de UPDATE só é avaliada para o papel que faz a
--   operação; essas funções operam com os privilégios de quem as definiu,
--   fora do contexto "sou o driver_id da linha"). O que elas SEMPRE disparam
--   são os TRIGGERS da tabela (BEFORE/AFTER), independente de RLS — por isso
--   `trg_activity_trips` é AFTER INSERT/UPDATE/DELETE (sem condição de
--   driver), e vai registrar no activity_log tanto os updates de
--   `startTrip`/`endTrip` quanto os das RPCs — o que é o comportamento
--   desejado (auditoria completa, não só do motorista).
--
-- tf_activity_log('trip') cai no ramo genérico da função (não é 'user',
-- 'driver', 'vehicle' nem 'station'): resolve secretaria/label pelo
-- vehicle_id da própria linha de trips, igual já faz para fueling/checklist/
-- service_order. Função lida com tenant_id ausente devolvendo sem logar —
-- não é o caso aqui, pois `trg_tenant` (BEFORE INSERT) sempre preenche
-- tenant_id antes do INSERT completar, e updates preservam o valor.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists trips_update_own on public.trips;

create policy trips_update_own on public.trips
  for update
  using (auth.uid() = driver_id and status = 'andamento')
  with check (auth.uid() = driver_id);

create trigger trg_activity_trips
  after insert or update or delete on public.trips
  for each row execute function public.tf_activity_log('trip');
