-- ============================================================================
-- Auditoria 2026-07 · Médio — nenhuma rota de escrita tinha rate limit.
--
-- STATUS: *** NÃO APLICADA *** — aguardando revisão e aprovação do usuário
-- (mesma convenção de 20260724000001_activity_log.sql). NÃO rodar em produção
-- sem revisão explícita.
--
-- Problema:
--   Pré-cadastro de motorista, reset de senha e reset de acesso de parceiro
--   (web/api/drivers/pre-register.ts, web/api/drivers/[id]/reset-password.ts,
--   web/api/partners/index.ts) não tinham nenhum freio. Um token de gestor
--   válido — ou vazado — poluía o diretório de identidade e gerava custo de
--   faturamento (auth.admin.createUser/updateUserById), sem alerta.
--
-- Por que Postgres e não Redis/Upstash/Vercel KV:
--   As rotas são funções serverless (Vercel) sem estado compartilhado entre
--   invocações — um contador em memória do processo não sobrevive de uma
--   chamada para a próxima, e não seria confiável nem dentro da mesma
--   invocação em ambiente com múltiplas instâncias atrás do mesmo domínio.
--   O projeto já paga por um Postgres (Supabase) e já tem o padrão de RPC
--   SECURITY DEFINER chamado a partir do service_role (ver `log_manual_activity`
--   em 20260724000001_activity_log.sql). Reaproveitar essa infra evita
--   introduzir uma dependência nova e um serviço que exigiria contratação
--   (Upstash, Vercel KV pago) só para isto. O trade-off aceito: cada chamada
--   de rota grava uma linha em Postgres (INSERT ... ON CONFLICT), que é mais
--   lento que um Redis dedicado, mas a volumetria destas rotas (cadastro e
--   reset de senha, não tráfego de leitura) não justifica o custo/operação
--   extra de um serviço de estado dedicado.
--
-- O que isto NÃO resolve sozinho:
--   Esta migration cria a tabela e a função. Ela só produz efeito quando
--   aplicada ao banco (`supabase db push` / painel) — não incluída aqui por
--   instrução explícita de não mexer em banco/deploy nesta tarefa. O código
--   das rotas (web/api/_lib/rate-limit.ts e admin/api/_lib/rate-limit.ts) já
--   chama `rl_check_and_hit` via RPC; enquanto a função não existir no banco,
--   o helper trata o erro do RPC como "permitir" (fail-open) e apenas loga —
--   ou seja, o rate limit fica inerte, não quebra a aplicação, até esta
--   migration ser revisada e aplicada.
-- ============================================================================

create table if not exists public.api_rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        int not null default 0,
  updated_at   timestamptz not null default now()
);

comment on table public.api_rate_limits is
  'Contadores de rate limit por chave (ação:caller:ip, ou ação:tenant:dia). '
  'Só a service_role escreve/lê — chamado pelas serverless via rl_check_and_hit.';

-- RLS ligada e forçada por padrão de defesa em profundidade (mesmo raciocínio
-- de activity_log): não muda o comportamento de authenticated/anon, que já
-- não têm GRANT nenhum aqui, mas barra qualquer policy futura desavisada.
alter table public.api_rate_limits enable row level security;
alter table public.api_rate_limits force row level security;
revoke all on public.api_rate_limits from authenticated, anon;
-- Nenhuma policy: authenticated/anon nunca devem tocar nesta tabela
-- diretamente. service_role tem BYPASSRLS e não precisa de policy.


-- ── Função atômica de check-and-increment ───────────────────────────────────
-- Uma única sentença INSERT ... ON CONFLICT DO UPDATE: o Postgres serializa
-- concorrência na mesma chave via lock de linha, então duas chamadas
-- simultâneas para a mesma `key` não conseguem "passar" as duas quando só uma
-- deveria. Janela deslizante simples (reinicia quando `window_start` já
-- expirou), suficiente para o caso de uso (não é um limitador de tráfego de
-- alta precisão, é um freio de abuso).
create or replace function public.rl_check_and_hit(
  p_key            text,
  p_window_seconds int,
  p_max_hits       int,
  p_increment      int default 1
) returns table (
  allowed             boolean,
  current_count       int,
  retry_after_seconds int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now   timestamptz := now();
  v_row   public.api_rate_limits;
begin
  insert into public.api_rate_limits as t (key, window_start, count, updated_at)
  values (p_key, v_now, greatest(p_increment, 0), v_now)
  on conflict (key) do update
    set count = case
                  when t.window_start <= v_now - make_interval(secs => p_window_seconds)
                    then greatest(p_increment, 0)
                  else t.count + greatest(p_increment, 0)
                end,
        window_start = case
                  when t.window_start <= v_now - make_interval(secs => p_window_seconds)
                    then v_now
                  else t.window_start
                end,
        updated_at = v_now
  returning t.* into v_row;

  allowed := v_row.count <= p_max_hits;
  current_count := v_row.count;
  retry_after_seconds := greatest(
    0,
    p_window_seconds - floor(extract(epoch from (v_now - v_row.window_start)))::int
  );
  return next;
end;
$$;

comment on function public.rl_check_and_hit(text, int, int, int) is
  'Rate limit genérico por chave livre. Chamado pelas serverless (service_role) '
  'antes de operações de escrita sensíveis. Fail-open é responsabilidade do '
  'chamador (helper TS), não desta função.';

revoke all on function public.rl_check_and_hit(text, int, int, int) from public, authenticated, anon;
grant execute on function public.rl_check_and_hit(text, int, int, int) to service_role;


-- ── Limpeza best-effort de linhas antigas ───────────────────────────────────
-- Sem isto a tabela cresce para sempre (uma linha por chave já vista). Como
-- as chaves têm o dia embutido nos contadores diários e um TTL curto nos
-- contadores por minuto, uma linha "velha" (sem updated_at recente) nunca
-- mais vai importar para nenhuma janela futura das mesmas rotas — pode sumir.
-- Agendado no mesmo padrão de activity_log_purge (cron do pg_cron).
create or replace function public.api_rate_limits_cleanup()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.api_rate_limits where updated_at < now() - interval '30 days';
$$;

revoke all on function public.api_rate_limits_cleanup() from public, authenticated, anon;
grant execute on function public.api_rate_limits_cleanup() to service_role;

select cron.schedule('api-rate-limits-cleanup', '30 3 * * *',
                     $$select public.api_rate_limits_cleanup();$$);
