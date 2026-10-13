-- Exportada de produção em 2026-10-13 (supabase_migrations.schema_migrations,
-- versão 20261009211827). Já aplicada; o SQL abaixo é o registrado no banco, sem alterações.

-- =====================================================================
-- P1.7 (Prompt E): autenticidade verificavel dos relatorios de prestacao de contas.
-- NAO APLICADA. Depende de: get_user_tenant_id, is_admin_or_manager,
-- is_secretario, is_superadmin, check_current_access, tf_activity_log,
-- sgf_private.resource_allowed / current_session_allowed, pgcrypto (schema extensions).
--
-- Modelo: o painel calcula o SHA-256 do conteudo canonico do relatorio e chama
-- register_report_snapshot(); o banco devolve um codigo curto de verificacao
-- (impresso/QR no PDF). Qualquer pessoa confere em /verificar/:codigo, que chama
-- verify_report() (anon). O banco NAO guarda o conteudo do relatorio, apenas o
-- hash + metadados: para auditar, recalcula-se o hash a partir do CSV/PDF.
--
-- PENDENCIA FORA DESTA MIGRATION (sgf_private.resource_modules, nao alterada aqui):
--   report_snapshots, register_report_snapshot, sign_report_snapshot -> {'reports'}
--   verify_report -> anon retorna cedo em check_api_access (nao precisa); se
--   chamada por usuario logado (authenticated) precisa de mapeamento -> {'reports'}
--   (ou nenhum modulo especifico, ver relatorio).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabela
-- ---------------------------------------------------------------------
create table if not exists public.report_snapshots (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default public.get_user_tenant_id() references public.tenants(id),
  report_type       text not null check (length(btrim(report_type)) between 1 and 80),
  title             text not null check (length(btrim(title)) between 1 and 200),
  period_start      date,
  period_end        date,
  filters           jsonb not null default '{}'::jsonb,
  content_hash      text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  row_count         integer check (row_count is null or row_count >= 0),
  generated_by      uuid default auth.uid() references public.profiles(id),
  generated_at      timestamptz not null default now(),
  signed_by         uuid references public.profiles(id),
  signed_at         timestamptz,
  signature_note    text check (signature_note is null or length(signature_note) <= 500),
  verification_code text not null unique check (verification_code ~ '^[A-HJ-KM-NP-Z2-9]{12}$'),
  file_path         text,   -- PDF no bucket 'documentos' (opcional; acesso por URL assinada)
  constraint report_snapshots_period_chk check (period_start is null or period_end is null or period_end >= period_start),
  constraint report_snapshots_sign_chk check ((signed_by is null) = (signed_at is null))
);

create index if not exists report_snapshots_tenant_idx on public.report_snapshots (tenant_id, generated_at desc);
create index if not exists report_snapshots_hash_idx   on public.report_snapshots (content_hash);

comment on table public.report_snapshots is
  'Registro imutavel (hash SHA-256 + metadados) de cada relatorio de prestacao de contas emitido. Permite verificacao publica de autenticidade pelo codigo curto. Nao guarda o conteudo do relatorio.';
comment on column public.report_snapshots.content_hash is
  'SHA-256 (hex minusculo, 64 caracteres) do conteudo canonico do relatorio, calculado no painel.';
comment on column public.report_snapshots.verification_code is
  'Codigo curto de 12 caracteres (alfabeto sem ambiguos: sem 0,O,1,I,L), gerado no banco; exibido como XXXX-XXXX-XXXX.';
comment on column public.report_snapshots.filters is
  'Filtros aplicados na emissao (periodo, secretaria, veiculo, condutor...). Nao e exposto na verificacao publica.';
comment on column public.report_snapshots.signed_by is
  'Responsavel (admin/gestor) que assinou eletronicamente o relatorio. Preenchido uma unica vez por sign_report_snapshot.';
comment on column public.report_snapshots.signed_at is 'Momento da assinatura eletronica simples (uma unica vez).';
comment on column public.report_snapshots.signature_note is 'Observacao opcional do signatario (ex.: cargo/portaria de designacao).';
comment on column public.report_snapshots.file_path is 'Caminho opcional do PDF no bucket privado documentos.';

-- ---------------------------------------------------------------------
-- 2) Imutabilidade: DELETE sempre bloqueado; UPDATE so para assinar, uma vez, via RPC
-- ---------------------------------------------------------------------
create or replace function public.tf_report_snapshots_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'REPORT_IMMUTABLE: registros de relatorio nao podem ser apagados.' using errcode = 'P0001';
  end if;

  -- UPDATE: somente a assinatura, uma unica vez, e somente pela RPC (GUC local).
  if coalesce(current_setting('app.report_sign', true), '') <> 'on' then
    raise exception 'REPORT_IMMUTABLE: use sign_report_snapshot para assinar; demais campos sao imutaveis.' using errcode = 'P0001';
  end if;
  if old.signed_at is not null then
    raise exception 'REPORT_IMMUTABLE: relatorio ja assinado.' using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - 'signed_by' - 'signed_at' - 'signature_note')
     is distinct from (to_jsonb(old) - 'signed_by' - 'signed_at' - 'signature_note') then
    raise exception 'REPORT_IMMUTABLE: so signed_by, signed_at e signature_note podem ser preenchidos.' using errcode = 'P0001';
  end if;
  return new;
end $$;

comment on function public.tf_report_snapshots_immutable() is
  'Bloqueia DELETE em report_snapshots e permite UPDATE apenas para preencher a assinatura uma unica vez, dentro de sign_report_snapshot.';

drop trigger if exists trg_report_snapshots_immutable on public.report_snapshots;
create trigger trg_report_snapshots_immutable before update or delete on public.report_snapshots
  for each row execute function public.tf_report_snapshots_immutable();

drop trigger if exists trg_report_snapshots_no_truncate on public.report_snapshots;
create trigger trg_report_snapshots_no_truncate before truncate on public.report_snapshots
  for each statement execute function public.tf_report_snapshots_immutable();

-- Auditoria permanente (activity_log): emissao e assinatura.
drop trigger if exists trg_activity_report_snapshots on public.report_snapshots;
create trigger trg_activity_report_snapshots after insert or update on public.report_snapshots
  for each row execute function public.tf_activity_log('report_snapshot');

-- ---------------------------------------------------------------------
-- 3) RLS: leitura por tenant (admin/gestor tudo; secretario so os proprios); escrita so via RPC
-- ---------------------------------------------------------------------
alter table public.report_snapshots enable row level security;

drop policy if exists report_snapshots_manager_select on public.report_snapshots;
create policy report_snapshots_manager_select on public.report_snapshots
  for select to authenticated
  using (public.is_superadmin() or (public.is_admin_or_manager() and tenant_id = public.get_user_tenant_id()));

drop policy if exists report_snapshots_secretario_select on public.report_snapshots;
create policy report_snapshots_secretario_select on public.report_snapshots
  for select to authenticated
  using (public.is_secretario() and tenant_id = public.get_user_tenant_id() and generated_by = auth.uid());

-- Restritivas do filtro de sessao ativa/modulo (padrao active_session_* do projeto).
drop policy if exists active_session_only on public.report_snapshots;
create policy active_session_only on public.report_snapshots as restrictive for all to authenticated
  using ((select sgf_private.current_session_allowed()))
  with check ((select sgf_private.current_session_allowed()));

drop policy if exists active_session_read on public.report_snapshots;
create policy active_session_read on public.report_snapshots as restrictive for select to authenticated
  using ((select sgf_private.resource_allowed('report_snapshots', false)));

revoke all on public.report_snapshots from anon, authenticated;
grant select on public.report_snapshots to authenticated;

-- ---------------------------------------------------------------------
-- 4) Gerador de codigo de verificacao (12 chars, sem ambiguos)
-- ---------------------------------------------------------------------
create or replace function public.gen_report_verification_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  c_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 simbolos
  v_bytes bytea := extensions.gen_random_bytes(12);
  v_code  text := '';
  i int;
begin
  for i in 0..11 loop
    -- leve vies de modulo (256 mod 31): irrelevante para um identificador publico nao secreto.
    v_code := v_code || substr(c_alphabet, (get_byte(v_bytes, i) % 31) + 1, 1);
  end loop;
  return v_code;
end $$;

comment on function public.gen_report_verification_code() is
  'Gera codigo aleatorio de 12 caracteres para verificacao publica de relatorios (alfabeto sem 0,O,1,I,L).';
revoke all on function public.gen_report_verification_code() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) RPC: registrar snapshot
-- ---------------------------------------------------------------------
create or replace function public.register_report_snapshot(
  p_report_type  text,
  p_title        text,
  p_period_start date,
  p_period_end   date,
  p_filters      jsonb,
  p_content_hash text,
  p_row_count    integer
)
returns table (id uuid, verification_code text, generated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_hash   text := lower(btrim(coalesce(p_content_hash, '')));
  v_code   text;
  v_row    public.report_snapshots%rowtype;
  v_try    int := 0;
begin
  perform public.check_current_access();
  if not sgf_private.resource_allowed('report_snapshots', true) then
    raise exception 'Módulo não autorizado para este acesso' using errcode = '42501';
  end if;
  if not (public.is_admin_or_manager() or public.is_secretario()) then
    raise exception 'Apenas admin, gestor ou secretário pode registrar relatórios' using errcode = '42501';
  end if;
  v_tenant := public.get_user_tenant_id();
  if v_tenant is null then
    raise exception 'Usuário sem órgão (tenant) associado' using errcode = '42501';
  end if;
  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Hash inválido: informe SHA-256 em hexadecimal (64 caracteres)' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_report_type, ''))) = 0 or length(btrim(coalesce(p_title, ''))) = 0 then
    raise exception 'Tipo e título do relatório são obrigatórios' using errcode = '22023';
  end if;
  if p_period_start is not null and p_period_end is not null and p_period_end < p_period_start then
    raise exception 'Período inválido' using errcode = '22023';
  end if;

  loop
    v_try := v_try + 1;
    v_code := public.gen_report_verification_code();
    begin
      insert into public.report_snapshots
        (tenant_id, report_type, title, period_start, period_end, filters, content_hash, row_count, verification_code)
      values
        (v_tenant, btrim(p_report_type), btrim(p_title), p_period_start, p_period_end,
         coalesce(p_filters, '{}'::jsonb), v_hash, p_row_count, v_code)
      returning * into v_row;
      exit;
    exception when unique_violation then
      if v_try >= 5 then raise; end if;
    end;
  end loop;

  return query select v_row.id, v_row.verification_code, v_row.generated_at;
end $$;

comment on function public.register_report_snapshot(text, text, date, date, jsonb, text, integer) is
  'Registra o hash SHA-256 de um relatorio emitido e devolve o codigo de verificacao publico. Restrito a admin, gestor e secretario do proprio tenant.';

-- ---------------------------------------------------------------------
-- 6) RPC: assinatura eletronica simples (uma unica vez)
-- ---------------------------------------------------------------------
create or replace function public.sign_report_snapshot(p_id uuid, p_note text default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row  public.report_snapshots%rowtype;
  v_now  timestamptz := now();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.check_current_access();
  if not sgf_private.resource_allowed('report_snapshots', true) then
    raise exception 'Módulo não autorizado para este acesso' using errcode = '42501';
  end if;
  if not public.is_admin_or_manager() then
    raise exception 'Apenas admin ou gestor pode assinar relatórios' using errcode = '42501';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'Observação muito longa (máximo 500 caracteres)' using errcode = '22023';
  end if;

  select * into v_row from public.report_snapshots where id = p_id for update;
  if not found or v_row.tenant_id is distinct from public.get_user_tenant_id() then
    raise exception 'Relatório não encontrado' using errcode = 'P0002';
  end if;
  if v_row.signed_at is not null then
    raise exception 'Relatório já assinado' using errcode = '22023';
  end if;

  perform set_config('app.report_sign', 'on', true);
  update public.report_snapshots
     set signed_by = auth.uid(), signed_at = v_now, signature_note = v_note
   where id = p_id;
  perform set_config('app.report_sign', 'off', true);
  return v_now;
end $$;

comment on function public.sign_report_snapshot(uuid, text) is
  'Assinatura eletronica simples (Lei 14.063/2020, art. 4o, I) do responsavel (admin/gestor) sobre o snapshot; so uma vez. Nao e assinatura avancada nem qualificada (gov.br/ICP-Brasil).';

-- ---------------------------------------------------------------------
-- 7) RPC publica: verificar autenticidade (anon + authenticated)
--    LGPD: devolve apenas dados do ato administrativo (orgao, tipo, titulo,
--    periodo, datas, hash, nº de linhas) e, se assinado, NOME e PAPEL do
--    signatario (agente publico no exercicio da funcao; ato administrativo e
--    publico - Lei 12.527/2011). NUNCA CPF, e-mail, filtros, gerador, ids.
-- ---------------------------------------------------------------------
create or replace function public.verify_report(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  r record;
begin
  if v_code !~ '^[A-HJ-KM-NP-Z2-9]{12}$' then
    return jsonb_build_object('valid', false);
  end if;

  select s.report_type, s.title, s.period_start, s.period_end, s.generated_at,
         s.content_hash, s.row_count, s.signed_at, t.name as orgao,
         p.full_name as signatario, p.role::text as signatario_papel
    into r
    from public.report_snapshots s
    join public.tenants t on t.id = s.tenant_id
    left join public.profiles p on p.id = s.signed_by
   where s.verification_code = v_code;

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  return jsonb_build_object(
    'valid',        true,
    'orgao',        r.orgao,
    'report_type',  r.report_type,
    'title',        r.title,
    'period_start', r.period_start,
    'period_end',   r.period_end,
    'generated_at', r.generated_at,
    'content_hash', r.content_hash,
    'row_count',    r.row_count,
    'signed',       r.signed_at is not null,
    'signed_at',    r.signed_at,
    'signed_by_name', case when r.signed_at is not null then r.signatario end,
    'signed_by_role', case when r.signed_at is not null then r.signatario_papel end
  );
end $$;

comment on function public.verify_report(text) is
  'Verificacao publica de autenticidade de relatorio pelo codigo curto. Devolve apenas dados nao pessoais do ato (orgao, tipo, periodo, hash) e nome/papel do signatario; sem CPF/e-mail/filtros. Aceita anon. Sem rate limit no SQL: aplicar no servidor web.';

revoke all on function public.verify_report(text) from public;
grant execute on function public.verify_report(text) to anon, authenticated;

revoke all on function public.register_report_snapshot(text, text, date, date, jsonb, text, integer) from public, anon;
grant execute on function public.register_report_snapshot(text, text, date, date, jsonb, text, integer) to authenticated;
revoke all on function public.sign_report_snapshot(uuid, text) from public, anon;
grant execute on function public.sign_report_snapshot(uuid, text) to authenticated;
