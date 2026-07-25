-- =============================================================================
-- IOPGPS Integration — schema
-- Plataforma de rastreadores físicos (open.iopgps.com) → SGF.
-- Casa com o schema multi-tenant real (profiles / tenants / trackers / vehicles
-- / trips / live_positions). NÃO usar os database/*.sql legados (NestJS).
--
-- Aplicar via:  supabase db push   (ou MCP apply_migration)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers de papel/tenant (idempotentes). Espelham o uso de profiles.role.
-- ---------------------------------------------------------------------------
create or replace function public.sgf_role() returns text
language sql stable security definer set search_path = public as $$
  select role::text from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.sgf_tenant() returns uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from public.profiles where id = auth.uid() limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 1) Credenciais da conta IOPGPS (Open API) + cache de token. Server-side only.
--    Uma linha por tenant (cada prefeitura pode ter sua própria conta) OU
--    uma linha global (tenant_id NULL) reutilizada por todos.
-- ---------------------------------------------------------------------------
create table if not exists public.iopgps_credentials (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references public.tenants(id) on delete cascade,
  base_url      text not null default 'https://open.iopgps.com',
  appid         text not null,
  app_secret    text not null,                 -- "login secret key"
  access_token  text,
  token_expires_at timestamptz,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists iopgps_credentials_tenant_uniq
  on public.iopgps_credentials (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------------------------------------------------------------------------
-- 2) Último fix por rastreador (independe de viagem). Alimenta o painel admin
--    e o mapa "todos os veículos". PK = tracker_id (1 linha por device).
-- ---------------------------------------------------------------------------
create table if not exists public.device_status (
  tracker_id     uuid primary key references public.trackers(id) on delete cascade,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  vehicle_id     uuid references public.vehicles(id) on delete set null,
  imei           text not null,
  lat            double precision,
  lng            double precision,
  speed          double precision,
  course         double precision,
  ignition       boolean,                       -- accStatus
  online         boolean,
  voltage        double precision,              -- tensão externa (V) = extVoltage/10
  fix_source     text,                          -- 'gps' | 'lbs'
  gps_time       timestamptz,
  updated_at     timestamptz not null default now()
);
create index if not exists device_status_tenant_idx on public.device_status (tenant_id, updated_at desc);
create index if not exists device_status_vehicle_idx on public.device_status (vehicle_id);

-- ---------------------------------------------------------------------------
-- 3) Colunas auxiliares em live_positions (compatível com o app do motorista).
--    Defaults garantem que inserts do app Flutter continuam válidos.
-- ---------------------------------------------------------------------------
alter table public.live_positions add column if not exists source     text not null default 'driver_app';
alter table public.live_positions add column if not exists fix_source text;
alter table public.live_positions add column if not exists ignition   boolean;
alter table public.live_positions add column if not exists battery    double precision;
alter table public.live_positions add column if not exists online     boolean;
alter table public.live_positions add column if not exists course     double precision;
create index if not exists live_positions_tenant_vehicle_idx
  on public.live_positions (tenant_id, vehicle_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- 4) Alarmes do dispositivo (excesso de velocidade, ocioso, ignição, SOS…).
-- ---------------------------------------------------------------------------
create table if not exists public.device_alarms (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  tracker_id  uuid references public.trackers(id) on delete set null,
  vehicle_id  uuid references public.vehicles(id) on delete set null,
  imei        text not null,
  device_alarm_id text not null,                -- id único do alarme na IOPGPS
  alarm_type  text not null,                    -- ex.: 'speeding','idle','acc_off'
  alarm_code  text,                             -- código bruto (ex.: 'ACCOFF')
  lat         double precision,
  lng         double precision,
  speed       double precision,
  gps_time    timestamptz,
  raw         jsonb,
  acknowledged boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists device_alarms_tenant_idx on public.device_alarms (tenant_id, created_at desc);
create unique index if not exists device_alarms_dedupe_idx on public.device_alarms (device_alarm_id);

-- ---------------------------------------------------------------------------
-- 5) Comandos remotos (corte/retomada de combustível) com auditoria.
-- ---------------------------------------------------------------------------
create table if not exists public.device_commands (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  tracker_id   uuid references public.trackers(id) on delete set null,
  vehicle_id   uuid references public.vehicles(id) on delete set null,
  imei         text not null,
  command      text not null,                   -- 'FUEL_CUT' | 'FUEL_RESTORE'
  command_id   text,                            -- commandid devolvido pela IOPGPS
  status       text not null default 'pending', -- pending|sent|received|failed
  response     text,
  issued_by    uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);
create index if not exists device_commands_tenant_idx on public.device_commands (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS — service-role (edge functions) ignora RLS. Aqui cobrimos leitura no app.
-- ---------------------------------------------------------------------------
alter table public.iopgps_credentials enable row level security;
alter table public.device_status      enable row level security;
alter table public.device_alarms      enable row level security;
alter table public.device_commands    enable row level security;

-- Credenciais: nunca expostas ao cliente (sem policy de SELECT = ninguém lê via anon).
-- Só superadmin gerencia (e mesmo assim o ideal é via serverless service-role).

-- device_status: membros do tenant leem o seu; superadmin lê tudo.
drop policy if exists device_status_select on public.device_status;
create policy device_status_select on public.device_status for select
  using (public.sgf_role() = 'superadmin' or tenant_id = public.sgf_tenant());

drop policy if exists device_alarms_select on public.device_alarms;
create policy device_alarms_select on public.device_alarms for select
  using (public.sgf_role() = 'superadmin' or tenant_id = public.sgf_tenant());

drop policy if exists device_commands_select on public.device_commands;
create policy device_commands_select on public.device_commands for select
  using (public.sgf_role() = 'superadmin' or tenant_id = public.sgf_tenant());

-- ---------------------------------------------------------------------------
-- 6) pg_cron → chama a Edge Function iopgps-sync periodicamente.
--    Requer extensões pg_cron + pg_net (Dashboard → Database → Extensions).
--    Ajuste <PROJECT_REF> e o secret antes de habilitar.
-- ---------------------------------------------------------------------------
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule('iopgps-sync', '* * * * *', $$
--   select net.http_post(
--     url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/iopgps-sync',
--     headers := jsonb_build_object(
--       'Content-Type','application/json',
--       'Authorization','Bearer ' || current_setting('app.iopgps_cron_secret', true)
--     ),
--     body    := '{}'::jsonb
--   );
-- $$);
