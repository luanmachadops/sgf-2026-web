-- Configurações globais da plataforma (uma linha só), mantidas pelo superadmin.
create table if not exists public.platform_settings (
  id boolean primary key default true check (id),
  ai_document_model text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.platform_settings (id) values (true) on conflict do nothing;
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon;
grant select, insert, update on public.platform_settings to authenticated;
create policy platform_settings_superadmin_read on public.platform_settings
  for select to authenticated using (is_superadmin());
create policy platform_settings_superadmin_write on public.platform_settings
  for update to authenticated using (is_superadmin()) with check (is_superadmin());
