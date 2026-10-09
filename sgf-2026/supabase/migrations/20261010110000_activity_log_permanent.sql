-- =====================================================================
-- Trilha de auditoria PERMANENTE (activity_log): IP, user-agent e
-- encadeamento de hash (cada linha referencia o hash da anterior do tenant).
--
-- NAO APLICADA AINDA - aguardando aprovacao (DDL em producao).
--
-- Decisoes:
--  * O expurgo (activity_log_purge) apagava, por (tenant, ano), TODAS as
--    linhas do ano cuja purge_date (ano+6) ja passou. Como os entity_types
--    existentes sao quase todos de frota (trip, fueling, checklist, vehicle,
--    service_order, driver, user, station), sobraria quase nada para expurgar,
--    e apagar QUALQUER linha do meio da cadeia a quebra. Logo a solucao mais
--    simples e correta e: a trilha inteira e permanente, os dois crons sao
--    removidos e as funcoes viram no-op. Sem checkpoint, sem bypass de DELETE.
--  * Hash calculado por funcao unica (activity_log_compute_hash), usada pelo
--    trigger, pelo backfill e pela verificacao - evita divergencia.
--  * created_at entra no hash em UTC com microssegundos (independe de
--    TimeZone/DateStyle da sessao).
-- =====================================================================

-- Bloqueia escritas durante a migration (backfill + criacao dos triggers
-- precisam ser atomicos; nenhuma linha pode entrar sem hash).
lock table public.activity_log in exclusive mode;

-- 1) Novas colunas ------------------------------------------------------
alter table public.activity_log
  add column if not exists ip         inet,
  add column if not exists user_agent text,
  add column if not exists prev_hash  text,
  add column if not exists row_hash   text,
  add column if not exists chain_seq  bigint;

comment on column public.activity_log.ip         is 'IP de origem da requisicao (cf-connecting-ip ou 1o x-forwarded-for). Nulo em linhas antigas, cron e chamadas internas.';
comment on column public.activity_log.user_agent is 'User-Agent da requisicao, quando disponivel.';
comment on column public.activity_log.prev_hash  is 'row_hash da linha anterior do mesmo tenant (nulo na primeira).';
comment on column public.activity_log.row_hash   is 'SHA-256 hex do conteudo da linha + prev_hash. Qualquer alteracao quebra a cadeia.';
comment on column public.activity_log.chain_seq  is 'Sequencia 1..N por tenant; lacunas indicam linha removida.';

-- 2) Funcao unica de hash ----------------------------------------------
create or replace function public.activity_log_compute_hash(
  p_prev_hash   text,
  p_id          uuid,
  p_tenant_id   uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_action      text,
  p_changes     jsonb,
  p_snapshot    jsonb,
  p_actor_id    uuid,
  p_created_at  timestamptz
) returns text
language sql
immutable
set search_path to 'public'
as $$
  select encode(
    sha256(convert_to(
      concat_ws('|',
        coalesce(p_prev_hash, ''),
        p_id::text,
        coalesce(p_tenant_id::text, ''),
        coalesce(p_entity_type, ''),
        coalesce(p_entity_id::text, ''),
        coalesce(p_action, ''),
        coalesce(p_changes::text, ''),
        coalesce(p_snapshot::text, ''),
        coalesce(p_actor_id::text, ''),
        to_char(p_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
      ), 'UTF8')),
    'hex');
$$;

revoke all on function public.activity_log_compute_hash(text, uuid, uuid, text, uuid, text, jsonb, jsonb, uuid, timestamptz) from public, anon, authenticated;

-- 3) Backfill em ordem (created_at, id) por tenant ----------------------
-- ~2.350 linhas: laco simples e suficiente. Os triggers de bloqueio ainda
-- nao existem neste ponto, entao o UPDATE e permitido.
do $$
declare
  r        record;
  v_tenant uuid := null;
  v_seq    bigint := 0;
  v_prev   text := null;
  v_hash   text;
begin
  for r in
    select id, tenant_id, entity_type, entity_id, action, changes, snapshot, actor_id, created_at
      from public.activity_log
     order by tenant_id, created_at, id
  loop
    if v_tenant is distinct from r.tenant_id then
      v_tenant := r.tenant_id;
      v_seq := 0;
      v_prev := null;
    end if;
    v_seq := v_seq + 1;
    v_hash := public.activity_log_compute_hash(
      v_prev, r.id, r.tenant_id, r.entity_type, r.entity_id, r.action,
      r.changes, r.snapshot, r.actor_id, r.created_at);
    update public.activity_log
       set chain_seq = v_seq, prev_hash = v_prev, row_hash = v_hash
     where id = r.id;
    v_prev := v_hash;
  end loop;
end $$;

alter table public.activity_log
  alter column chain_seq set not null,
  alter column row_hash  set not null;

-- 4) Indice (unico: impede dois elos com a mesma posicao = bifurcacao) --
create unique index if not exists uq_activity_log_tenant_chain_seq
  on public.activity_log (tenant_id, chain_seq);

-- 5) Trigger BEFORE INSERT: IP, user-agent e encadeamento ---------------
-- Separado de tf_activity_log para valer para qualquer origem de INSERT
-- (tf_activity_log, log_manual_activity, rpc de login, service_role...).
create or replace function public.tf_activity_log_chain()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_headers  json;
  v_raw      text;
  v_last     record;
begin
  -- Cabecalhos da requisicao PostgREST (ausentes em cron/SQL direto).
  begin
    v_raw := nullif(current_setting('request.headers', true), '');
    v_headers := case when v_raw is null then null else v_raw::json end;
  exception when others then
    v_headers := null;
  end;

  -- IP: cf-connecting-ip (quando atras do Cloudflare) ou 1o IP do x-forwarded-for.
  begin
    new.ip := nullif(trim(split_part(
      coalesce(v_headers ->> 'cf-connecting-ip', v_headers ->> 'x-forwarded-for', ''),
      ',', 1)), '')::inet;
  exception when others then
    new.ip := null;  -- valor malformado nunca pode impedir a gravacao da auditoria
  end;
  new.user_agent := left(v_headers ->> 'user-agent', 500);

  -- created_at precisa estar definido antes do hash.
  new.created_at := coalesce(new.created_at, now());
  new.id := coalesce(new.id, gen_random_uuid());

  -- Serializa a cadeia por tenant (cadeia global se tenant_id for nulo).
  perform pg_advisory_xact_lock(hashtext('activity_log:' || coalesce(new.tenant_id::text, 'global')));

  select chain_seq, row_hash
    into v_last
    from public.activity_log
   where tenant_id is not distinct from new.tenant_id
   order by chain_seq desc
   limit 1;

  new.chain_seq := coalesce(v_last.chain_seq, 0) + 1;
  new.prev_hash := v_last.row_hash;  -- nulo no primeiro elo
  new.row_hash  := public.activity_log_compute_hash(
    new.prev_hash, new.id, new.tenant_id, new.entity_type, new.entity_id,
    new.action, new.changes, new.snapshot, new.actor_id, new.created_at);

  return new;
end $$;

revoke all on function public.tf_activity_log_chain() from public, anon, authenticated;

drop trigger if exists trg_activity_log_chain on public.activity_log;
create trigger trg_activity_log_chain
  before insert on public.activity_log
  for each row execute function public.tf_activity_log_chain();

-- 6) Imutabilidade: bloqueia UPDATE, DELETE e TRUNCATE ------------------
create or replace function public.tf_activity_log_immutable()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  raise exception 'activity_log e imutavel: % nao permitido', tg_op
    using errcode = 'insufficient_privilege';
end $$;

drop trigger if exists trg_activity_log_no_update_delete on public.activity_log;
create trigger trg_activity_log_no_update_delete
  before update or delete on public.activity_log
  for each row execute function public.tf_activity_log_immutable();

drop trigger if exists trg_activity_log_no_truncate on public.activity_log;
create trigger trg_activity_log_no_truncate
  before truncate on public.activity_log
  for each statement execute function public.tf_activity_log_immutable();

-- 7) Fim do expurgo ------------------------------------------------------
-- Remove os agendamentos e neutraliza as funcoes (mantidas como no-op para
-- nao quebrar eventuais chamadas manuais). Qualquer delete seria barrado
-- pelo trigger acima de qualquer forma.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job
     where jobname in ('activity-log-purge', 'activity-log-purge-warning');
  end if;
end $$;

create or replace function public.activity_log_purge()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Trilha permanente: nada e expurgado (apagar quebraria a cadeia de hash).
  return;
end $$;

create or replace function public.activity_log_retention_warn()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Sem expurgo, nao ha o que avisar.
  return;
end $$;

comment on table public.activity_log_retention is
  'LEGADO: controle do antigo expurgo de 6 anos. A trilha agora e permanente; tabela mantida apenas como historico.';

-- 8) Verificacao da cadeia ----------------------------------------------
-- Restrita a admin/gestor do proprio tenant. Percorre por chain_seq, checando
-- (a) continuidade da sequencia, (b) prev_hash = row_hash do elo anterior,
-- (c) row_hash recalculado. O intervalo filtra por created_at, mas o primeiro
-- elo do intervalo e conferido contra seu antecessor real.
create or replace function public.verify_activity_chain(
  p_from timestamptz default null,
  p_to   timestamptz default null
) returns table (ok boolean, checked bigint, first_broken_id uuid, first_broken_seq bigint)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tenant   uuid := public.get_user_tenant_id();
  r          record;
  v_count    bigint := 0;
  v_exp_seq  bigint;
  v_exp_prev text;
  v_first    boolean := true;
begin
  if auth.uid() is null or v_tenant is null or not public.is_admin_or_manager() then
    raise exception 'acesso negado' using errcode = 'insufficient_privilege';
  end if;

  for r in
    select * from public.activity_log
     where tenant_id = v_tenant
       and (p_from is null or created_at >= p_from)
       and (p_to   is null or created_at <= p_to)
     order by chain_seq
  loop
    if v_first then
      v_first := false;
      v_exp_seq := r.chain_seq;
      -- Antecessor real (fora do intervalo, se for o caso).
      if r.chain_seq = 1 then
        v_exp_prev := null;
      else
        select l.row_hash into v_exp_prev
          from public.activity_log l
         where l.tenant_id = v_tenant and l.chain_seq = r.chain_seq - 1;
        if not found then
          return query select false, v_count, r.id, r.chain_seq;
          return;
        end if;
      end if;
    end if;

    if r.chain_seq is distinct from v_exp_seq
       or r.prev_hash is distinct from v_exp_prev
       or r.row_hash is distinct from public.activity_log_compute_hash(
            r.prev_hash, r.id, r.tenant_id, r.entity_type, r.entity_id, r.action,
            r.changes, r.snapshot, r.actor_id, r.created_at)
    then
      return query select false, v_count, r.id, r.chain_seq;
      return;
    end if;

    v_count := v_count + 1;
    v_exp_seq := r.chain_seq + 1;
    v_exp_prev := r.row_hash;
  end loop;

  return query select true, v_count, null::uuid, null::bigint;
end $$;

revoke all on function public.verify_activity_chain(timestamptz, timestamptz) from public, anon;
grant execute on function public.verify_activity_chain(timestamptz, timestamptz) to authenticated;
