-- Deploy producers of app_metadata.tenant_id BEFORE applying this migration.
-- Signup cannot choose its own municipality through editable user_metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if nullif(new.raw_app_meta_data->>'tenant_id', '') is null then
    raise exception 'Cadastro permitido apenas por convite ou pela administração' using errcode = '42501';
  end if;
  insert into public.profiles(id, full_name, tenant_id)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name', ''),
         (new.raw_app_meta_data->>'tenant_id')::uuid);
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.guard_profile_access_modules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_superadmin() then
    if tg_op = 'INSERT' and new.role = 'superadmin' then
      raise exception 'Somente superadministradores podem conceder este papel' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.allowed_modules is distinct from old.allowed_modules
       and (old.id = auth.uid() or not public.is_admin()) then
      raise exception 'Outro administrador deve alterar as permissões de acesso' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_profile_access_modules() from public, anon, authenticated;
create trigger trg_guard_profile_access_modules before insert or update on public.profiles
for each row execute function public.guard_profile_access_modules();

-- Internal helpers are reached through guarded RPCs, never directly by clients.
revoke all on function public.trip_last_activity_at(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.tf_trip_insert_guard() from public, anon, authenticated;
revoke all on function public.create_service_order_from_issue() from public, anon, authenticated;
alter function public.activity_log_ignored_cols() set search_path = '';
