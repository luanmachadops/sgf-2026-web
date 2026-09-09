-- Apply after department_budget_control. Existing row/tenant permissions remain.
alter table public.profiles add column session_revoked_at timestamptz;

create function sgf_private.session_allowed(p_user uuid,p_session uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.profiles p join auth.sessions s on s.user_id=p.id
    join public.tenants t on t.id=p.tenant_id
    where p.id=p_user and s.id=p_session
      and not coalesce(p.access_blocked,false)
      and coalesce(p.driver_status::text,'ativo') not in ('inativo','suspenso')
      and (p.role='superadmin' or t.status::text<>'suspended')
      and (s.not_after is null or s.not_after>now())
      and (p.session_revoked_at is null or s.created_at>p.session_revoked_at)
  );
$$;
revoke all on function sgf_private.session_allowed(uuid,uuid) from public,anon,authenticated;

create function sgf_private.current_session_allowed()
returns boolean language plpgsql stable security definer set search_path='' as $$
declare claims jsonb:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
begin
  return sgf_private.session_allowed(auth.uid(),nullif(claims->>'session_id','')::uuid);
exception when invalid_text_representation then return false;
end $$;
revoke all on function sgf_private.current_session_allowed() from public,anon;
grant execute on function sgf_private.current_session_allowed() to authenticated;

-- Watermark cannot be cleared by a user; unblocking requires a fresh login.
create function sgf_private.revoke_profile_sessions()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.session_revoked_at is distinct from old.session_revoked_at then
    raise exception 'A revogação de sessões é controlada pelo sistema' using errcode='42501';
  end if;
  if new.access_blocked is distinct from old.access_blocked
    or new.driver_status is distinct from old.driver_status
    or new.role is distinct from old.role or new.tenant_id is distinct from old.tenant_id
    or new.department_id is distinct from old.department_id
    or new.allowed_modules is distinct from old.allowed_modules then
    new.session_revoked_at:=clock_timestamp();
  end if;
  return new;
end $$;
revoke all on function sgf_private.revoke_profile_sessions() from public,anon,authenticated;
create trigger zz_revoke_profile_sessions before update on public.profiles for each row execute function sgf_private.revoke_profile_sessions();

-- Tenant watermark separately avoids touching profiles/privilege triggers.
alter table public.tenants add column sessions_revoked_at timestamptz;
create function sgf_private.revoke_tenant_sessions()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.sessions_revoked_at is distinct from old.sessions_revoked_at then
    raise exception 'A revogação de sessões é controlada pelo sistema' using errcode='42501';
  end if;
  if new.status is distinct from old.status then new.sessions_revoked_at:=clock_timestamp(); end if;
  return new;
end $$;
revoke all on function sgf_private.revoke_tenant_sessions() from public,anon,authenticated;
create trigger zz_revoke_tenant_sessions before update on public.tenants for each row execute function sgf_private.revoke_tenant_sessions();
create or replace function sgf_private.session_allowed(p_user uuid,p_session uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.profiles p join auth.sessions s on s.user_id=p.id
    join public.tenants t on t.id=p.tenant_id
    where p.id=p_user and s.id=p_session and not coalesce(p.access_blocked,false)
      and coalesce(p.driver_status::text,'ativo') not in ('inativo','suspenso')
      and (p.role='superadmin' or (t.status::text<>'suspended' and (t.sessions_revoked_at is null or s.created_at>t.sessions_revoked_at)))
      and (s.not_after is null or s.not_after>now())
      and (p.session_revoked_at is null or s.created_at>p.session_revoked_at)
  );
$$;

-- Shared reads are necessary for selectors and reports. Writes require the
-- owning module. This supplements, never replaces, existing tenant/role RLS.
create function sgf_private.resource_modules(p_resource text,p_write boolean)
returns text[] language plpgsql immutable set search_path='' as $$
begin
  if p_resource in ('profiles','tenants','notifications','push_tokens','log_login','register_push_token','unregister_push_token','check_current_access','get_tenant_branding','resolve_tenant_host','partner_context','partner_read_context','get_partner_contract_status','get_partner_dashboard','get_partner_contract_usage','delete_own_account','activity_log_ignored_cols','trip_stale_after_hours','fueling_escrita_direta_motorista','sgf_role','sgf_tenant')
    or p_resource like 'is\_%' escape '\' or p_resource like 'get_user\_%' escape '\' then return null; end if;
  if p_resource like '%department_budget%' or p_resource like 'budget\_%' escape '\' then return array['budgets']; end if;
  if p_resource in ('get_dashboard_summary','get_dashboard_alerts') then return array['dashboard']; end if;
  if p_resource in ('get_procurement_alerts','get_procurement_contract_usage') then return array['stations','repair_shops','reports']; end if;
  if p_resource='departments' then
    return case when p_write then array['departments'] else array['departments','fleet','drivers','trips','refuelings','maintenances','budgets','reports'] end;
  end if;
  if p_resource in ('vehicles','vehicle_documents','trackers','manager_delete_vehicle') then
    return case when p_write then array['fleet'] else array['fleet','map','trips','refuelings','maintenances','checklists','infractions','reports'] end;
  end if;
  if p_resource in ('live_positions','device_status','device_alarms','device_commands','trip_locations') then return array['map','trips']; end if;
  if p_resource in ('trips','takeover_vehicle','release_stale_trip','check_vehicle_conflict','driver_release_current_vehicle') then return array['trips']; end if;
  if p_resource in ('driver_registration_invites','driver_registration_requests') then return array['drivers']; end if;
  if p_resource in ('checklists','checklist_items','issues') then return array['checklists','maintenances']; end if;
  if p_resource='infractions' then return array['infractions']; end if;
  if p_resource in ('fuel_stations','station_catalog_items','manager_list_station_catalog','manager_upsert_station_catalog_item') then
    return case when p_write then array['stations'] else array['stations','refuelings','budgets','reports'] end;
  end if;
  if p_resource='repair_shops' then
    return case when p_write then array['repair_shops'] else array['repair_shops','maintenances','budgets','reports'] end;
  end if;
  if p_resource='maintenances' or p_resource like '%service_order%' or p_resource like '%shop%' then return array['maintenances']; end if;
  if p_resource like '%fueling%' or p_resource like '%station%' then return array['refuelings','stations']; end if;
  if p_resource in ('app_settings','activity_log','activity_log_retention') then return array['settings']; end if;
  -- Unclassified privileged resources are not implicitly opened by new code.
  return array[]::text[];
end $$;
revoke all on function sgf_private.resource_modules(text,boolean) from public,anon,authenticated;

create function sgf_private.resource_allowed(p_resource text,p_write boolean default false)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; required text[];
begin
  if not sgf_private.current_session_allowed() then return false; end if;
  select * into p from public.profiles where id=auth.uid();
  -- Operational users retain their existing narrowly scoped RLS/RPC rules.
  if p.role in ('superadmin','motorista','posto','oficina') then return true; end if;
  required:=sgf_private.resource_modules(p_resource,p_write);
  return required is null or p.allowed_modules && required
    or (not p_write and 'reports'=any(p.allowed_modules) and cardinality(required)>0);
end $$;
revoke all on function sgf_private.resource_allowed(text,boolean) from public,anon;
grant execute on function sgf_private.resource_allowed(text,boolean) to authenticated;

-- Restrictive policies combine with every permissive policy using AND.
do $$ declare r record; begin
  for r in select schemaname,tablename from pg_tables where schemaname='public' or (schemaname='storage' and tablename='objects') loop
    execute format('alter table %I.%I enable row level security',r.schemaname,r.tablename);
    if r.schemaname='storage' then
      execute format('create policy active_session_only on %I.%I as restrictive for all to authenticated using ((select sgf_private.current_session_allowed())) with check ((select sgf_private.current_session_allowed()))',r.schemaname,r.tablename);
    else
      execute format('create policy active_session_read on %I.%I as restrictive for select to authenticated using ((select sgf_private.resource_allowed(%L,false)))',r.schemaname,r.tablename,r.tablename);
      execute format('create policy active_session_insert on %I.%I as restrictive for insert to authenticated with check ((select sgf_private.resource_allowed(%L,true)))',r.schemaname,r.tablename,r.tablename);
      execute format('create policy active_session_update on %I.%I as restrictive for update to authenticated using ((select sgf_private.resource_allowed(%L,true))) with check ((select sgf_private.resource_allowed(%L,true)))',r.schemaname,r.tablename,r.tablename,r.tablename);
      execute format('create policy active_session_delete on %I.%I as restrictive for delete to authenticated using ((select sgf_private.resource_allowed(%L,true)))',r.schemaname,r.tablename,r.tablename);
    end if;
  end loop;
end $$;

create function public.check_current_access()
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if not sgf_private.current_session_allowed() then
    raise exception 'Sessão revogada ou acesso bloqueado. Entre novamente.' using errcode='42501';
  end if;
end $$;
revoke all on function public.check_current_access() from public,anon;
grant execute on function public.check_current_access() to authenticated;

-- Service-role backends must validate the verified JWT's session too.
create function public.assert_server_session(p_user_id uuid,p_session_id uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if not sgf_private.session_allowed(p_user_id,p_session_id) then
    raise exception 'Sessão revogada ou acesso bloqueado. Entre novamente.' using errcode='42501';
  end if;
end $$;
revoke all on function public.assert_server_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.assert_server_session(uuid,uuid) to service_role;

create function sgf_private.check_api_access()
returns void language plpgsql stable security definer set search_path='' as $$
declare
  claims jsonb:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
  path text:=trim(both '/' from coalesce(current_setting('request.path',true),''));
  resource text; writing boolean;
begin
  if claims->>'role'='service_role' then return; end if;
  -- Anonymous branding and public enrollment keep their existing grants/RLS.
  if coalesce(claims->>'role','anon')='anon' and auth.uid() is null then return; end if;
  perform public.check_current_access();
  resource:=case when path like 'rpc/%' then substr(path,5) else path end;
  writing:=coalesce(current_setting('request.method',true),'GET') not in ('GET','HEAD');
  if path like 'rpc/get_%' or path like 'rpc/manager_get_%' or path like 'rpc/manager_list_%' then writing:=false; end if;
  if resource<>'' and not sgf_private.resource_allowed(resource,writing) then
    raise exception 'Módulo não autorizado para este acesso' using errcode='42501';
  end if;
end $$;
revoke all on function sgf_private.check_api_access() from public;
grant usage on schema sgf_private to anon,service_role;
grant execute on function sgf_private.check_api_access() to anon,authenticated,service_role;
-- Refuse to silently overwrite an existing project-specific hook.
do $$ declare cfg text; begin
  select split_part(x,'=',2) into cfg from pg_roles r cross join lateral unnest(r.rolconfig) x
    where r.rolname='authenticator' and x like 'pgrst.db_pre_request=%';
  if cfg is not null and cfg<>'' and cfg<>'sgf_private.check_api_access' then
    raise exception 'Já existe pre-request: %. Integre-o antes de aplicar esta migration.',cfg;
  end if;
end $$;
alter role authenticator set pgrst.db_pre_request='sgf_private.check_api_access';
notify pgrst,'reload config';

-- Protect privileged RPCs themselves as well (including GraphQL/direct SQL
-- invocation), not just PostgREST. Original implementations become private.
-- Preserve OIDs of dependencies, overloads, defaults, set/scalar return types.
do $$ declare r record; original_name text; signature text; invocation text; body text; volatility text;
begin
  for r in select p.*,pg_get_function_identity_arguments(p.oid) identity_args,
      pg_get_function_arguments(p.oid) full_args,pg_get_function_result(p.oid) result_type
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and p.prorettype<>'trigger'::regtype
      and has_function_privilege('authenticated',p.oid,'execute')
      and p.proname not in ('check_current_access','assert_server_session','get_tenant_branding','resolve_tenant_host','sgf_role','sgf_tenant')
      and p.proname not like 'is\_%' escape '\' and p.proname not like 'get_user\_%' escape '\'
  loop
    original_name:='rpc_original__'||r.proname;
    signature:=format('public.%I(%s)',r.proname,r.identity_args);
    execute format('alter function %s set schema sgf_private',signature);
    execute format('alter function sgf_private.%I(%s) rename to %I',r.proname,r.identity_args,original_name);
    execute format('revoke all on function sgf_private.%I(%s) from public,anon,authenticated',original_name,r.identity_args);
    select string_agg('$'||i,',' order by i) into invocation from generate_series(1,r.pronargs) i;
    invocation:=format('sgf_private.%I(%s)',original_name,coalesce(invocation,''));
    body:=format('begin
      if coalesce(nullif(current_setting(''request.jwt.claims'',true),''''),''{}'')::jsonb->>''role'' is distinct from ''service_role'' then
        perform public.check_current_access();
        if not sgf_private.resource_allowed(%L,%L) then raise exception ''Módulo não autorizado para este acesso'' using errcode=''42501''; end if;
      end if;
      %s
    end',r.proname,not (r.proname like 'get\_%' escape '\' or r.proname like 'manager_get\_%' escape '\' or r.proname like 'manager_list\_%' escape '\'),
      case when r.proretset then 'return query select * from '||invocation||';'
        when r.prorettype='void'::regtype then 'perform '||invocation||'; return;'
        else 'return '||invocation||';' end);
    volatility:=case r.provolatile when 's' then 'stable' else 'volatile' end;
    execute format('create function public.%I(%s) returns %s language plpgsql %s security definer set search_path='''' as %L',r.proname,r.full_args,r.result_type,volatility,body);
    execute format('revoke all on function public.%I(%s) from public,anon',r.proname,r.identity_args);
    execute format('grant execute on function public.%I(%s) to authenticated,service_role',r.proname,r.identity_args);
  end loop;
end $$;
notify pgrst,'reload schema';
