-- Fase 2a do modo offline do app do motorista
-- (sgf-2026/docs/plano-offline-app-motorista.md, §7 e §8.1).
--
-- Somente ADITIVA: colunas novas com default ou nulas, índices, triggers de
-- carimbo e uma tabela nova. Nenhuma linha existente é alterada e nenhuma
-- regra de acesso existente é afrouxada. As RPCs de pull/push vêm nas fases
-- seguintes, junto com o app que as usa.

-- ---------------------------------------------------------------------------
-- 1. updated_at para sincronização incremental ("o que mudou desde X")
-- ---------------------------------------------------------------------------
-- Reaproveita public.touch_updated_at() (já usada em fuel_stations).
--
-- O trigger se chama zzz_* de propósito: triggers BEFORE disparam em ordem
-- alfabética, então ele roda por ÚLTIMO. Assim as travas que comparam OLD x
-- NEW coluna a coluna (ex.: tf_service_order_guard_driver_update, que só
-- deixa o motorista mudar 4 campos da O.S.) não enxergam o carimbo como uma
-- alteração do usuário. tf_activity_log já ignora updated_at.
--
-- Linhas existentes recebem now() (default não volátil: sem reescrever a
-- tabela). O primeiro pull de cada aparelho é completo, então isso não importa.
do $$
declare
  t text;
begin
  foreach t in array array[
    'trips', 'fuelings', 'checklists', 'issues',
    'service_orders', 'notifications', 'profiles', 'vehicles'
  ] loop
    execute format(
      'alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('drop trigger if exists zzz_touch_updated_at on public.%I', t);
    execute format(
      'create trigger zzz_touch_updated_at before update on public.%I
         for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- Índices do delta por motorista.
create index if not exists trips_driver_updated_idx         on public.trips (driver_id, updated_at);
create index if not exists fuelings_driver_updated_idx      on public.fuelings (driver_id, updated_at);
create index if not exists checklists_driver_updated_idx    on public.checklists (driver_id, updated_at);
create index if not exists issues_driver_updated_idx        on public.issues (driver_id, updated_at);
create index if not exists service_orders_driver_updated_idx on public.service_orders (driver_id, updated_at);
create index if not exists notifications_driver_updated_idx on public.notifications (driver_id, updated_at);

-- ---------------------------------------------------------------------------
-- 2. client_id: ID gerado no celular, para reenvio sem duplicar
-- ---------------------------------------------------------------------------
-- Nulo nos registros antigos e nos criados pelo painel (NULLs não colidem num
-- índice único). Escopo pela prefeitura.
alter table public.trips      add column if not exists client_id uuid;
alter table public.fuelings   add column if not exists client_id uuid;
alter table public.checklists add column if not exists client_id uuid;
alter table public.issues     add column if not exists client_id uuid;

create unique index if not exists trips_tenant_client_id_key      on public.trips (tenant_id, client_id);
create unique index if not exists fuelings_tenant_client_id_key   on public.fuelings (tenant_id, client_id);
create unique index if not exists checklists_tenant_client_id_key on public.checklists (tenant_id, client_id);
create unique index if not exists issues_tenant_client_id_key     on public.issues (tenant_id, client_id);

-- ---------------------------------------------------------------------------
-- 3. trip_locations.client_point_id: buffer de GPS sem duplicar
-- ---------------------------------------------------------------------------
-- O app gera um UUID por ponto e envia com "ON CONFLICT DO NOTHING". Não usa
-- (trip_id, recorded_at) porque já existe 1 par repetido em produção e as
-- linhas desta tabela não podem ser apagadas (tf_block_trip_delete).
alter table public.trip_locations add column if not exists client_point_id uuid;
create unique index if not exists trip_locations_client_point_id_key
  on public.trip_locations (client_point_id);

-- ---------------------------------------------------------------------------
-- 4. sync_receipts: recibo durável por evento enviado pelo app
-- ---------------------------------------------------------------------------
-- Gravado pela RPC de envio (fase 4) na MESMA transação do efeito. Mesmo
-- evento + mesmo hash = devolve o resultado anterior; mesmo evento + hash
-- diferente = conflito auditável.
--
-- Chave (driver_id, event_id): um motorista não consegue "colidir" com o
-- evento de outro escolhendo o mesmo UUID.
create table if not exists public.sync_receipts (
  driver_id    uuid not null references public.profiles(id) on delete cascade,
  event_id     uuid not null,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  event_type   text not null check (char_length(event_type) between 1 and 64),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status       text not null check (status in ('ok', 'ok_needs_review', 'rejected', 'conflict')),
  result       jsonb not null default '{}'::jsonb,
  occurred_at  timestamptz,
  received_at  timestamptz not null default now(),
  primary key (driver_id, event_id)
);

create index if not exists sync_receipts_tenant_received_idx
  on public.sync_receipts (tenant_id, received_at);

alter table public.sync_receipts enable row level security;

-- Ninguém escreve direto: só funções SECURITY DEFINER (RPC de envio).
revoke all on public.sync_receipts from anon, authenticated;
grant select on public.sync_receipts to authenticated;

drop policy if exists sync_receipts_select_own on public.sync_receipts;
create policy sync_receipts_select_own on public.sync_receipts
  for select to authenticated
  using (driver_id = (select auth.uid()));

-- Mesma trava de sessão ativa das demais tabelas (bloqueio, sessão revogada,
-- prefeitura suspensa). Sem mapeamento em resource_modules, admin/gestor não
-- leem os recibos — é intencional: eles são do aparelho do motorista.
drop policy if exists active_session_read on public.sync_receipts;
create policy active_session_read on public.sync_receipts
  as restrictive for select to authenticated
  using ((select sgf_private.resource_allowed('sync_receipts'::text, false)));
