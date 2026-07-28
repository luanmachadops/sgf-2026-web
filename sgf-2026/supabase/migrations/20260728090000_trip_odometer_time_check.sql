-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoria 2026-07 · Correção ALTA #4 — trips sem CHECK de odômetro/hora
--
-- Problema: `trips` não tinha nenhum CHECK constraint. Nada impedia gravar
-- end_odometer < start_odometer (hodômetro andando pra trás) ou end_at < start_at
-- (viagem terminando antes de começar).
--
-- Verificado antes de aplicar (SELECT, projeto kgxdrgbxpfoebzrphtqg):
--   select id, start_at, end_at, start_odometer, end_odometer from trips order by start_at;
-- As 4 viagens existentes satisfazem ambas as condições:
--   - end_odometer null OU end_odometer >= start_odometer (5600/null, 5296/5296, 5296/5298, 5298/5298)
--   - end_at null OU end_at >= start_at (todas concluídas com end_at >= start_at)
-- Portanto os CHECKs abaixo podem ser criados sem violar dados existentes.
--
-- Não quebra as RPCs SECURITY DEFINER que fazem UPDATE em trips:
--   - release_stale_trip / auto_close_abandoned_trips: end_at = trip_last_activity_at(...),
--     que é `greatest(start_at, ...)` — por construção sempre >= start_at.
--   - takeover_vehicle: end_at = now(), e a viagem já estava em andamento (start_at no passado).
--   Nenhuma dessas altera odômetro, então o CHECK de odômetro não as afeta.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.trips
  add constraint trips_odometer_order_chk
  check (end_odometer is null or start_odometer is null or end_odometer >= start_odometer);

alter table public.trips
  add constraint trips_time_order_chk
  check (end_at is null or end_at >= start_at);
