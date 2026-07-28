-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoria 2026-07 · Correção ALTA #5 — motorista com viagens simultâneas
--
-- Problema: só existia índice único parcial por VEÍCULO
-- (`uniq_active_trip_per_vehicle`, WHERE status='andamento'). Nada impedia o
-- mesmo motorista abrir viagem 'andamento' em dois veículos ao mesmo tempo.
--
-- Verificado antes de aplicar (SELECT, projeto kgxdrgbxpfoebzrphtqg):
--   select driver_id, count(*) from trips where status='andamento' group by driver_id;
-- Resultado: NENHUMA linha com status='andamento' hoje (as 4 viagens existentes
-- estão todas 'concluida'). Portanto o índice único pode ser criado sem
-- conflito de dados.
--
-- Não quebra as RPCs SECURITY DEFINER:
--   - takeover_vehicle encerra (status='concluida') a viagem ativa do motorista
--     anterior ANTES de qualquer novo insert acontecer no fluxo do app —
--     ela não insere uma segunda linha 'andamento' para o mesmo motorista.
--   - release_stale_trip / auto_close_abandoned_trips apenas fazem UPDATE
--     (encerram viagens), nunca INSERT — o índice único só é testado em
--     INSERT ou em UPDATE que resulte em (driver_id, 'andamento') duplicado,
--     o que essas funções nunca produzem (elas sempre mudam para 'concluida').
--
-- O app (src/lib/data.ts → startTrip) já trata o 23505 do índice por veículo
-- com mensagem amigável; foi ajustado para reconhecer também este índice
-- (uniq_active_trip_per_driver) e apresentar mensagem distinta.
-- ─────────────────────────────────────────────────────────────────────────────

create unique index uniq_active_trip_per_driver
  on public.trips (driver_id)
  where status = 'andamento';
