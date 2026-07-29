-- Permissões por módulo para os usuários do painel, aceite LGPD no
-- auto-cadastro e atualização em tempo real da fila de solicitações.

alter table public.profiles
  add column if not exists allowed_modules text[] not null default array[
    'dashboard',
    'map',
    'notifications',
    'fleet',
    'drivers',
    'trips',
    'refuelings',
    'stations',
    'maintenances',
    'repair_shops',
    'checklists',
    'infractions',
    'departments',
    'reports',
    'settings'
  ]::text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_allowed_modules_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_allowed_modules_check
      check (
        allowed_modules <@ array[
          'dashboard',
          'map',
          'notifications',
          'fleet',
          'drivers',
          'trips',
          'refuelings',
          'stations',
          'maintenances',
          'repair_shops',
          'checklists',
          'infractions',
          'departments',
          'reports',
          'settings'
        ]::text[]
      );
  end if;
end
$$;

alter table public.driver_registration_requests
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists terms_version text;

create index if not exists driver_registration_requests_tenant_status_submitted_idx
  on public.driver_registration_requests (tenant_id, status, submitted_at desc);

drop policy if exists driver_registration_requests_manager_realtime
  on public.driver_registration_requests;

create policy driver_registration_requests_manager_realtime
  on public.driver_registration_requests
  for select
  to authenticated
  using (
    (
      (select public.is_admin_or_manager())
      and tenant_id = (select public.get_user_tenant_id())
    )
    or
    (
      (select public.is_secretario())
      and tenant_id = (select public.get_user_tenant_id())
      and department_id = (select public.get_user_department_id())
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'driver_registration_requests'
  ) then
    alter publication supabase_realtime
      add table public.driver_registration_requests;
  end if;
end
$$;
