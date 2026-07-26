-- ============================================================================
-- Notificações em escala: índices, paginação por cursor e retenção
-- STATUS: *** APLICADA em 2026-07-26 ***
--
-- POR QUE
--   Cada prefeitura gera notificação por veículo, viagem, abastecimento e
--   alerta de frota. Com dezenas de municípios isso vira milhões de linhas, e
--   duas consultas passam a doer: a lista e a contagem do badge.
--
-- O índice que existia era (driver_id, read, created_at DESC). Com `read` NO
-- MEIO, uma consulta que filtra só por driver_id e ordena por created_at não
-- aproveita a ordem do índice — o Postgres lê tudo do usuário e ORDENA.
-- Verificado com EXPLAIN: com idx_notifications_feed o plano vira
-- "Index Scan ... sem Sort", então cada página custa o mesmo, não importa a
-- profundidade.
--
-- Limpeza pontual feita junto (autorizada pelo usuário): removidas 1.611
-- notificações de 'movimento_sem_viagem' e 'Motor ligado com veículo parado',
-- acumuladas pelo dedup furado corrigido em 20260726001500.
-- ============================================================================

create index if not exists idx_notifications_feed
  on public.notifications (driver_id, created_at desc);

-- Parcial: indexa só as não lidas, que são poucas por natureza. O badge lê um
-- índice minúsculo em vez de varrer o histórico inteiro do usuário.
create index if not exists idx_notifications_unread
  on public.notifications (driver_id)
  where read = false;

create or replace function public.purge_old_notifications(
  p_days_read int default 90,
  p_days_all  int default 365
)
returns table (removidas_lidas int, removidas_antigas int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_lidas int; v_antigas int;
begin
  with del as (
    delete from public.notifications
     where read = true
       and created_at < now() - make_interval(days => p_days_read)
    returning 1
  ) select count(*) into v_lidas from del;

  with del as (
    delete from public.notifications
     where created_at < now() - make_interval(days => p_days_all)
    returning 1
  ) select count(*) into v_antigas from del;

  return query select v_lidas, v_antigas;
end;
$$;

revoke all on function public.purge_old_notifications(int, int) from public, anon, authenticated;

select cron.unschedule('purge-old-notifications')
 where exists (select 1 from cron.job where jobname = 'purge-old-notifications');

select cron.schedule('purge-old-notifications', '20 4 * * *',
  $cron$ select public.purge_old_notifications(90, 365); $cron$);
