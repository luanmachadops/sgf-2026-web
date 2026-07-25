-- =============================================================
-- Segurança pré-produção (auditoria 2026-07-07)
-- 1) app_settings: PK por tenant (era id boolean = singleton global)
-- 2) REVOKE de funções internas/trigger expostas via RPC
-- 3) Policy de UPDATE em device_alarms (reconhecer alarmes)
-- 4) Remove listagem pública do bucket fotos
-- 5) touch_updated_at com search_path fixo
-- =============================================================

-- 1) app_settings multi-tenant -------------------------------------------
alter table public.app_settings drop constraint app_settings_pkey;
alter table public.app_settings add constraint app_settings_pkey primary key (tenant_id);
alter table public.app_settings alter column id set default true;
-- tenant_id preenchido a partir do JWT em inserts do painel
alter table public.app_settings alter column tenant_id set default public.get_user_tenant_id();

-- 2) Grants de funções ----------------------------------------------------
-- 2a. Funções de trigger e internas: ninguém chama via RPC
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        -- retornam trigger (não invocáveis via RPC, mas revogar limpa o advisor)
        'detect_movement_without_trip','guard_profile_privilege','handle_new_user',
        'notify_retroactive_trip','sync_vehicle_odometer',
        'tf_tenant_from_checklist','tf_tenant_from_department','tf_tenant_from_driver',
        'tf_tenant_from_trip','tf_tenant_from_user','tf_tenant_from_user_id','tf_tenant_from_vehicle',
        'tg_notifications_push','tg_notify_fueling','tg_notify_issue_created','tg_notify_service_order',
        'touch_updated_at',
        -- internas (chamadas por triggers/cron com service_role)
        'notify_admins','notify_fleet_managers','notify_users','notify_cnh_expiring',
        'get_unregistered_movements'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.sig);
  end loop;
end $$;

-- 2b. Helpers de RLS: precisam de EXECUTE para authenticated (as policies rodam como o usuário)
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'is_admin','is_admin_or_manager','is_manager','is_motorista','is_secretario','is_superadmin',
        'sgf_role','sgf_tenant','get_user_tenant_id','get_user_department_id','get_user_current_vehicle_id'
      )
  loop
    execute format('revoke execute on function %s from public, anon', fn.sig);
    execute format('grant execute on function %s to authenticated', fn.sig);
  end loop;
end $$;

-- 2c. RPCs de cliente: só authenticated (get_tenant_branding continua com anon — tela de login)
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('delete_own_account','register_push_token','unregister_push_token')
  loop
    execute format('revoke execute on function %s from public, anon', fn.sig);
    execute format('grant execute on function %s to authenticated', fn.sig);
  end loop;
end $$;

revoke execute on function public.get_tenant_branding(text) from public;
grant execute on function public.get_tenant_branding(text) to anon, authenticated;

-- 3) device_alarms: gestores/admins do tenant podem reconhecer alarmes ----
create policy device_alarms_admin_manager_update on public.device_alarms
  for update
  using (is_superadmin() or (is_admin_or_manager() and tenant_id = get_user_tenant_id()))
  with check (is_superadmin() or (is_admin_or_manager() and tenant_id = get_user_tenant_id()));

-- 4) Bucket fotos: remove listagem pública (URLs públicas continuam funcionando;
--    nenhum client usa .list() neste bucket — verificado por grep em web/admin/mobile)
drop policy if exists fotos_public_select on storage.objects;

-- 5) search_path fixo ------------------------------------------------------
alter function public.touch_updated_at() set search_path = public;
