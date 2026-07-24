-- Convites e solicitações de cadastro preenchidas pelo próprio motorista.
-- Os tokens nunca são persistidos em texto puro; somente SHA-256.

alter table public.profiles
  add column if not exists registration_status text not null default 'approved';

alter table public.profiles
  drop constraint if exists profiles_registration_status_check;

alter table public.profiles
  add constraint profiles_registration_status_check
  check (registration_status in ('pending', 'needs_correction', 'approved', 'rejected'));

create unique index if not exists profiles_tenant_cpf_unique
  on public.profiles (tenant_id, regexp_replace(cpf, '\D', '', 'g'))
  where cpf is not null and regexp_replace(cpf, '\D', '', 'g') <> '';

create table if not exists public.driver_registration_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  token_hash text not null unique,
  created_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null,
  max_uses integer not null default 1 check (max_uses between 1 and 500),
  use_count integer not null default 0 check (use_count >= 0),
  status text not null default 'active'
    check (status in ('active', 'revoked', 'exhausted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists driver_registration_invites_tenant_status_idx
  on public.driver_registration_invites (tenant_id, status, expires_at desc);

create table if not exists public.driver_registration_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invite_id uuid not null references public.driver_registration_invites(id) on delete restrict,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  tracking_token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'needs_correction', 'approved', 'rejected')),
  full_name text not null,
  cpf text not null,
  birth_date date,
  cnh_number text not null,
  cnh_category text not null,
  cnh_expiry date not null,
  registration_number text,
  email text not null,
  phone text,
  cnh_front_path text not null,
  cnh_back_path text,
  ai_confidence numeric(4,3),
  manager_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_registration_requests_cpf_format
    check (cpf ~ '^[0-9]{11}$'),
  constraint driver_registration_requests_email_format
    check (position('@' in email) > 1),
  constraint driver_registration_requests_ai_confidence
    check (ai_confidence is null or ai_confidence between 0 and 1)
);

create unique index if not exists driver_registration_requests_tenant_cpf_open_unique
  on public.driver_registration_requests (tenant_id, cpf)
  where status in ('pending', 'needs_correction', 'approved');

create index if not exists driver_registration_requests_review_queue_idx
  on public.driver_registration_requests (tenant_id, status, submitted_at desc);

create or replace function public.set_driver_registration_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_driver_registration_invites_updated_at
  on public.driver_registration_invites;
create trigger set_driver_registration_invites_updated_at
before update on public.driver_registration_invites
for each row execute function public.set_driver_registration_updated_at();

drop trigger if exists set_driver_registration_requests_updated_at
  on public.driver_registration_requests;
create trigger set_driver_registration_requests_updated_at
before update on public.driver_registration_requests
for each row execute function public.set_driver_registration_updated_at();

alter table public.driver_registration_invites enable row level security;
alter table public.driver_registration_requests enable row level security;

revoke all on public.driver_registration_invites from anon, authenticated;
revoke all on public.driver_registration_requests from anon, authenticated;
grant all on public.driver_registration_invites to service_role;
grant all on public.driver_registration_requests to service_role;

comment on table public.driver_registration_invites is
  'Convites criados por gestores para cadastro autônomo de motoristas; token armazenado somente como hash.';
comment on table public.driver_registration_requests is
  'Fila privada de solicitações de cadastro de motoristas, analisada pelo gestor.';
