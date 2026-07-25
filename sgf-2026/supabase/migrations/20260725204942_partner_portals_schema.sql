-- ============================================================================
-- FASE 1 (a) — Portais de parceiros: schema
--
-- Decisões tomadas em 2026-07-25 (ver PLANO-PORTAIS-PARCEIROS.md):
--   • UM login por parceiro  → índice único parcial em profiles
--   • NF/pagamento MÚLTIPLOS → service_order_invoices + service_order_payments
--   • Só `admin` cria acesso → validado na rota serverless, não aqui
--
-- STATUS: *** APLICADA em 2026-07-25 *** (versão registrada: 20260725204942)
--   Validada antes por execução completa em transação com rollback, e depois
--   por teste do trigger de sincronia nos dois sentidos.
--
-- NOTA SOBRE O ENUM DA OS: este arquivo NÃO altera `service_order_status`.
-- O eixo operacional/financeiro entra em colunas novas e a coluna `status`
-- antiga passa a ser mantida em sincronia por trigger — assim o app do
-- motorista, que lê `status`, continua funcionando sem release.
-- ============================================================================

-- ─── 1. Oficinas ────────────────────────────────────────────────────────────
create table if not exists public.repair_shops (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default get_user_tenant_id() references public.tenants(id),
  name             text not null,
  code             text,
  cnpj             text,
  address          text,
  city             text,
  phone            text,
  contract_number  text,
  contract_start   date,
  contract_end     date,
  specialties      text[] default '{}',
  is_active        boolean not null default true,
  notes            text,
  photo_url        text,
  documents        jsonb default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_repair_shops_tenant_active
  on public.repair_shops (tenant_id, is_active);

alter table public.repair_shops enable row level security;

create policy repair_shops_select_auth on public.repair_shops
  for select to authenticated
  using (is_superadmin() or tenant_id = get_user_tenant_id());

create policy repair_shops_admin_manager_all on public.repair_shops
  for all to authenticated
  using (is_superadmin() or (is_admin_or_manager() and tenant_id = get_user_tenant_id()))
  with check (is_superadmin() or (is_admin_or_manager() and tenant_id = get_user_tenant_id()));

-- Vínculo da OS com a oficina (hoje `repair_shop` é texto livre e permanece
-- para o histórico; passa a ser espelho do nome quando houver FK).
alter table public.service_orders
  add column if not exists repair_shop_id uuid references public.repair_shops(id);

-- ─── 2. Papéis de parceiro em profiles ──────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (
  role in ('admin','gestor','secretario','motorista','superadmin','posto','oficina')
);

-- RESTRICT, nunca CASCADE: apagar o parceiro apagaria o profile mas NÃO o
-- usuário em auth.users, deixando identidade autenticável órfã.
-- Desativar parceiro = is_active=false + access_blocked=true.
alter table public.profiles
  add column if not exists station_id     uuid references public.fuel_stations(id) on delete restrict,
  add column if not exists repair_shop_id uuid references public.repair_shops(id)  on delete restrict;

alter table public.profiles drop constraint if exists profiles_partner_link_chk;
alter table public.profiles add constraint profiles_partner_link_chk check (
  (role = 'posto'   and station_id is not null and repair_shop_id is null) or
  (role = 'oficina' and repair_shop_id is not null and station_id is null) or
  (role not in ('posto','oficina') and station_id is null and repair_shop_id is null)
);

-- Decisão: UM login por parceiro.
create unique index if not exists uniq_profile_por_posto
  on public.profiles (station_id) where role = 'posto';
create unique index if not exists uniq_profile_por_oficina
  on public.profiles (repair_shop_id) where role = 'oficina';

-- ─── 3. OS: eixo operacional × financeiro ───────────────────────────────────
-- Misturar os dois num enum só prenderia o veículo em `manutencao` até a
-- contabilidade pagar (o trigger de status do veículo só libera em 'concluida').
do $$ begin
  create type public.service_order_op_status as enum (
    'pending','authorized','at_shop','awaiting_quote_approval',
    'in_progress','ready','received','cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.service_order_fin_status as enum (
    'not_started','awaiting_commitment','committed','invoiced','attested','paid'
  );
exception when duplicate_object then null; end $$;

alter table public.service_orders
  add column if not exists operational_status public.service_order_op_status,
  add column if not exists financial_status   public.service_order_fin_status not null default 'not_started',
  add column if not exists commitment_number  text,   -- empenho / NAD
  add column if not exists nad_number         text,
  add column if not exists at_shop_at         timestamptz,
  add column if not exists received_at        timestamptz;

-- Backfill a partir do status atual.
update public.service_orders set operational_status = case status
  when 'pendente'    then 'pending'
  when 'aprovada'    then 'authorized'
  when 'em_execucao' then 'in_progress'
  when 'concluida'   then 'received'
  when 'rejeitada'   then 'cancelled'
end::public.service_order_op_status
where operational_status is null;

alter table public.service_orders
  alter column operational_status set default 'pending',
  alter column operational_status set not null;

create index if not exists idx_service_orders_tenant_shop_op
  on public.service_orders (tenant_id, repair_shop_id, operational_status);

-- Sincronia BIDIRECIONAL entre `status` (enum antigo) e `operational_status`.
--
-- Os dois sentidos são necessários durante a transição:
--   • app do motorista e telas antigas continuam LENDO `status`;
--   • o painel do gestor ainda ESCREVE `status` direto (supabase-api
--     `maintenancesApi.approve` grava status='aprovada'), e sem o sentido
--     inverso a primeira aprovação deixaria os eixos dessincronizados.
-- Quando o painel migrar para `operational_status`, o sentido inverso vira
-- inofensivo e pode ser removido.
create or replace function public.tf_service_order_sync_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  op_changed  boolean := tg_op = 'INSERT' or new.operational_status is distinct from old.operational_status;
  leg_changed boolean := tg_op = 'UPDATE' and new.status is distinct from old.status;
begin
  -- Sentido canônico: operacional → legado.
  if op_changed then
    new.status := case new.operational_status
      when 'pending'                 then 'pendente'
      when 'authorized'              then 'aprovada'
      when 'at_shop'                 then 'aprovada'
      when 'awaiting_quote_approval' then 'aprovada'
      when 'in_progress'             then 'em_execucao'
      when 'ready'                   then 'em_execucao'
      when 'received'                then 'concluida'
      when 'cancelled'               then 'rejeitada'
    end::public.service_order_status;
    return new;
  end if;

  -- Sentido de compatibilidade: legado → operacional. Preserva o estado fino
  -- quando ele já é compatível (não rebaixa `ready` para `in_progress`).
  if leg_changed then
    new.operational_status := case new.status
      when 'pendente'    then 'pending'
      when 'aprovada'    then case when old.operational_status in ('authorized','at_shop','awaiting_quote_approval')
                                   then old.operational_status else 'authorized' end
      when 'em_execucao' then case when old.operational_status in ('in_progress','ready')
                                   then old.operational_status else 'in_progress' end
      when 'concluida'   then 'received'
      when 'rejeitada'   then 'cancelled'
    end::public.service_order_op_status;
  end if;

  return new;
end $$;

drop trigger if exists trg_service_order_sync_legacy_status on public.service_orders;
drop trigger if exists trg_service_order_sync_status on public.service_orders;
create trigger trg_service_order_sync_status
  before insert or update on public.service_orders
  for each row execute function public.tf_service_order_sync_status();

-- O trigger de status do veículo continua reagindo a `status`, que agora é
-- derivado — o veículo é liberado em `received`, não no pagamento.

-- ─── 4. Orçamento ───────────────────────────────────────────────────────────
create table if not exists public.service_order_quotes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default get_user_tenant_id() references public.tenants(id),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  repair_shop_id   uuid not null references public.repair_shops(id),
  version          int  not null default 1,
  total            numeric(12,2) not null default 0,
  status           text not null default 'enviado'
                   check (status in ('enviado','aprovado','rejeitado','substituido')),
  valid_until      date,
  note             text,
  reviewed_by      uuid references public.profiles(id),
  reviewed_at      timestamptz,
  review_note      text,
  created_at       timestamptz not null default now(),
  unique (service_order_id, version)
);

create table if not exists public.service_order_quote_items (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.service_order_quotes(id) on delete cascade,
  kind        text not null check (kind in ('peca','mao_de_obra')),
  description text not null,
  qty         numeric(10,2) not null default 1 check (qty > 0),
  unit_price  numeric(12,2) not null check (unit_price >= 0),
  created_at  timestamptz not null default now()
);

create index if not exists idx_quotes_order_version
  on public.service_order_quotes (service_order_id, version desc);
create index if not exists idx_quote_items_quote
  on public.service_order_quote_items (quote_id);

-- ─── 5. Notas fiscais e pagamentos (decisão: 1:N) ───────────────────────────
create table if not exists public.service_order_invoices (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default get_user_tenant_id() references public.tenants(id),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  repair_shop_id   uuid not null references public.repair_shops(id),
  invoice_number   text not null,
  amount           numeric(12,2) not null check (amount >= 0),
  issued_at        date not null default current_date,
  file_path        text,               -- bucket `documentos` (privado)
  commitment_number text,              -- empenho que a NF cita
  attested_by      uuid references public.profiles(id),
  attested_at      timestamptz,
  created_at       timestamptz not null default now(),
  unique (tenant_id, repair_shop_id, invoice_number)
);

create table if not exists public.service_order_payments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default get_user_tenant_id() references public.tenants(id),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  invoice_id       uuid references public.service_order_invoices(id) on delete set null,
  amount           numeric(12,2) not null check (amount > 0),
  paid_at          date not null default current_date,
  note             text,
  registered_by    uuid references public.profiles(id),
  created_at       timestamptz not null default now()
);

create index if not exists idx_invoices_order on public.service_order_invoices (service_order_id);
create index if not exists idx_payments_order on public.service_order_payments (service_order_id);

-- ─── 6. Trilha de auditoria ─────────────────────────────────────────────────
create table if not exists public.service_order_events (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default get_user_tenant_id() references public.tenants(id),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  from_state       text,
  to_state         text,
  axis             text not null default 'operational' check (axis in ('operational','financial','note')),
  actor_id         uuid references public.profiles(id),
  actor_role       text,
  note             text,
  attachment_path  text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_so_events_order_created
  on public.service_order_events (service_order_id, created_at desc);

-- ─── 7. Abastecimento: lacunas do modelo atual ──────────────────────────────
alter table public.fuelings
  add column if not exists expires_at          timestamptz,
  add column if not exists authorization_note  text,
  add column if not exists cancelled_at        timestamptz,
  add column if not exists cancelled_by        uuid references public.profiles(id),
  add column if not exists cancellation_reason text,
  add column if not exists filled_by           uuid references public.profiles(id),
  add column if not exists filled_at           timestamptz,
  add column if not exists photo_pump_url      text,
  add column if not exists pump_receipt_number text;

create index if not exists idx_fuelings_station_workflow
  on public.fuelings (tenant_id, station_id, workflow_status, authorized_at);

-- ─── 8. RLS das tabelas novas (gestão; parceiro entra no arquivo (b)) ───────
alter table public.service_order_quotes      enable row level security;
alter table public.service_order_quote_items enable row level security;
alter table public.service_order_invoices    enable row level security;
alter table public.service_order_payments    enable row level security;
alter table public.service_order_events      enable row level security;

create policy quotes_manager_all on public.service_order_quotes
  for all to authenticated
  using (is_superadmin() or (is_admin_or_manager() and tenant_id = get_user_tenant_id()))
  with check (is_superadmin() or (is_admin_or_manager() and tenant_id = get_user_tenant_id()));

create policy quote_items_manager_all on public.service_order_quote_items
  for all to authenticated
  using (exists (select 1 from public.service_order_quotes q
                  where q.id = quote_id
                    and (is_superadmin() or (is_admin_or_manager() and q.tenant_id = get_user_tenant_id()))))
  with check (exists (select 1 from public.service_order_quotes q
                  where q.id = quote_id
                    and (is_superadmin() or (is_admin_or_manager() and q.tenant_id = get_user_tenant_id()))));

create policy invoices_manager_all on public.service_order_invoices
  for all to authenticated
  using (is_superadmin() or (is_admin_or_manager() and tenant_id = get_user_tenant_id()))
  with check (is_superadmin() or (is_admin_or_manager() and tenant_id = get_user_tenant_id()));

create policy payments_manager_all on public.service_order_payments
  for all to authenticated
  using (is_superadmin() or (is_admin_or_manager() and tenant_id = get_user_tenant_id()))
  with check (is_superadmin() or (is_admin_or_manager() and tenant_id = get_user_tenant_id()));

create policy events_manager_select on public.service_order_events
  for select to authenticated
  using (is_superadmin() or (is_admin_or_manager() and tenant_id = get_user_tenant_id()));

-- ─── 9. Grants explícitos ───────────────────────────────────────────────────
-- O Supabase não expõe mais tabelas novas na Data API automaticamente, e grant
-- é camada separada da RLS.
grant select, insert, update, delete on public.repair_shops              to authenticated;
grant select, insert, update, delete on public.service_order_quotes      to authenticated;
grant select, insert, update, delete on public.service_order_quote_items to authenticated;
grant select, insert, update, delete on public.service_order_invoices    to authenticated;
grant select, insert, update, delete on public.service_order_payments    to authenticated;
grant select                          on public.service_order_events      to authenticated;

revoke all on public.repair_shops, public.service_order_quotes, public.service_order_quote_items,
              public.service_order_invoices, public.service_order_payments, public.service_order_events
  from anon;
