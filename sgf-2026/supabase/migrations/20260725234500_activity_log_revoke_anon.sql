-- ============================================================================
-- activity_log: fecha a execução das funções internas
--
-- STATUS: *** APLICADA em 2026-07-25 ***
--
-- Achado pelo advisor logo após aplicar 20260724000001_activity_log: as
-- funções ficaram com EXECUTE para `anon`, e portanto acessíveis sem login
-- via /rest/v1/rpc/<nome>. A mais grave é `activity_log_purge()`, que APAGA
-- registros — qualquer pessoa com a anon key (que vai no bundle JS) poderia
-- limpar a trilha de auditoria.
--
-- `tf_activity_log` é função de trigger e nunca deve ser chamada direto.
-- `log_login` é legítima para usuário logado, então mantém `authenticated`.
-- ============================================================================

revoke all on function public.activity_log_purge()          from public, anon, authenticated;
revoke all on function public.activity_log_retention_warn()  from public, anon, authenticated;
revoke all on function public.tf_activity_log()              from public, anon, authenticated;
revoke all on function public.log_login(text)                from public, anon;
grant execute on function public.log_login(text) to authenticated;

-- search_path mutável em função criada em 20260725032443
alter function public.trip_stale_after_hours() set search_path = public, pg_temp;
