-- Corrige a criação de usuários bloqueada desde 20260908235823.
--
-- O GoTrue (POST /auth/v1/admin/users) insere a linha em auth.users ANTES de
-- gravar o app_metadata recebido; o tenant_id chega num UPDATE logo em seguida.
-- O handle_new_user (AFTER INSERT) via o tenant vazio e abortava com
-- "Cadastro permitido apenas por convite ou pela administração" — nenhum
-- motorista, gestor, parceiro ou prefeitura foi criado desde 2026-09-08.
--
-- Como profiles.tenant_id é NOT NULL, o perfil só nasce quando a prefeitura
-- existe: no INSERT (se já vier) ou no UPDATE que grava o app_metadata.
-- Segurança mantida: o tenant vem SÓ de app_metadata (que apenas a service_role
-- grava); auto-cadastro sem ele fica sem perfil e, portanto, sem acesso a nada.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if nullif(new.raw_app_meta_data->>'tenant_id', '') is not null then
    insert into public.profiles(id, full_name, tenant_id)
    values(new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), (new.raw_app_meta_data->>'tenant_id')::uuid)
    on conflict (id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.sync_profile_tenant_from_app_metadata()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if nullif(new.raw_app_meta_data->>'tenant_id', '') is not null
     and nullif(old.raw_app_meta_data->>'tenant_id', '') is null then
    insert into public.profiles(id, full_name, tenant_id)
    values(new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), (new.raw_app_meta_data->>'tenant_id')::uuid)
    on conflict (id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.sync_profile_tenant_from_app_metadata() from public, anon, authenticated;

drop trigger if exists on_auth_user_app_metadata_tenant on auth.users;
create trigger on_auth_user_app_metadata_tenant
after update of raw_app_meta_data on auth.users
for each row execute function public.sync_profile_tenant_from_app_metadata();
