-- ============================================================================
-- HASH DE FOTOS PROBATÓRIAS (ALT-009 — auditoria 2026-07)
--
-- Fotos são a única evidência de vários atos operacionais: hodômetro no
-- início/fim de viagem, requisição/painel/recibo do abastecimento e a foto da
-- ocorrência. Hoje não há como detectar se a MESMA foto foi reenviada em dois
-- registros diferentes (ex.: motorista reaproveita a foto do hodômetro de
-- ontem para "provar" a viagem de hoje).
--
-- Esta migration só ADICIONA as colunas de hash (nullable, sem backfill dos
-- registros existentes — não há como recalcular o hash de um arquivo já
-- comprimido/sobrescrito sem o binário original). O APP ainda não grava valor
-- nelas: falta uma dependência de hashing no cliente Expo (`expo-crypto`,
-- possivelmente também `expo-file-system` para ler o arquivo como base64) que
-- não existe no projeto hoje — ver relatório da tarefa. Esta migration deixa
-- o esquema pronto para quando essa dependência for adicionada e o app
-- passar a preencher o campo no upload.
--
-- Detecção de reaproveitamento: não é um UNIQUE constraint — duas fotos
-- diferentes podem colidir por acidente (SHA-256 é praticamente impossível,
-- mas não custa nada não travar o INSERT por causa disso) e o objetivo aqui é
-- AUDITORIA (o gestor consultar hashes repetidos), não bloqueio automático em
-- produção. Os índices abaixo existem para essa consulta ser rápida.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. trips — foto do hodômetro no início e no fim da viagem
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.trips
  add column if not exists start_odometer_photo_hash text,
  add column if not exists end_odometer_photo_hash   text;

comment on column public.trips.start_odometer_photo_hash is
  'SHA-256 (hex) do arquivo enviado em start_odometer_photo_url, calculado no app antes do upload. Nulo para fotos enviadas antes desta coluna existir. Usado para detectar reaproveitamento de foto entre viagens (ALT-009).';
comment on column public.trips.end_odometer_photo_hash is
  'SHA-256 (hex) do arquivo enviado em end_odometer_photo_url. Ver start_odometer_photo_hash.';

create index if not exists idx_trips_start_odometer_photo_hash
  on public.trips (start_odometer_photo_hash)
  where start_odometer_photo_hash is not null;

create index if not exists idx_trips_end_odometer_photo_hash
  on public.trips (end_odometer_photo_hash)
  where end_odometer_photo_hash is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. fuelings — requisição, painel e recibo do abastecimento
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.fuelings
  add column if not exists photo_hash              text,
  add column if not exists photo_requisition_hash   text,
  add column if not exists photo_dashboard_hash      text,
  add column if not exists photo_receipt_hash        text;

comment on column public.fuelings.photo_hash is
  'SHA-256 (hex) do arquivo em photo_url (nota fiscal do lançamento livre). Ver trips.start_odometer_photo_hash para o motivo de existir (ALT-009).';
comment on column public.fuelings.photo_requisition_hash is
  'SHA-256 (hex) do arquivo em photo_requisition_url.';
comment on column public.fuelings.photo_dashboard_hash is
  'SHA-256 (hex) do arquivo em photo_dashboard_url.';
comment on column public.fuelings.photo_receipt_hash is
  'SHA-256 (hex) do arquivo em photo_receipt_url.';

create index if not exists idx_fuelings_photo_hash
  on public.fuelings (photo_hash)
  where photo_hash is not null;

create index if not exists idx_fuelings_photo_requisition_hash
  on public.fuelings (photo_requisition_hash)
  where photo_requisition_hash is not null;

create index if not exists idx_fuelings_photo_dashboard_hash
  on public.fuelings (photo_dashboard_hash)
  where photo_dashboard_hash is not null;

create index if not exists idx_fuelings_photo_receipt_hash
  on public.fuelings (photo_receipt_hash)
  where photo_receipt_hash is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. issues — fotos da ocorrência (avaria), hoje um array (photo_urls)
--
-- Array paralelo em vez de tabela filha: mantém a simetria 1:1 por índice com
-- `photo_urls`, que é como o app já grava (ver `report-issue.tsx`/`createIssue`
-- em `src/lib/data.ts`). Normalizar em tabela própria é uma melhoria futura
-- independente deste achado.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.issues
  add column if not exists photo_hashes text[];

comment on column public.issues.photo_hashes is
  'SHA-256 (hex) de cada arquivo em photo_urls, no MESMO ÍNDICE (photo_hashes[i] é o hash de photo_urls[i]). Nulo/vazio para ocorrências registradas antes desta coluna existir (ALT-009).';

create index if not exists idx_issues_photo_hashes
  on public.issues using gin (photo_hashes);

commit;
