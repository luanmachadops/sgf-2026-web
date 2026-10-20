-- Fase 2b do modo offline do app do motorista
-- (sgf-2026/docs/plano-offline-app-motorista.md, §6.1).
--
-- driver_sync_pull: catálogo de veículos da prefeitura para o app achar o
-- veículo pelo QR/placa sem internet, mais a hora do servidor.
--
-- Segurança:
-- - SECURITY INVOKER: roda com as permissões do próprio motorista. A RLS de
--   vehicles (vehicles_select_scoped) e as travas RESTRICTIVE de sessão ativa
--   continuam valendo — sessão revogada/bloqueada não enxerga o próprio
--   perfil e recebe 42501.
-- - Só papel motorista.
-- - Minimização: só colunas operacionais. Nada de RENAVAM, chassi, documento,
--   seguro, foto ou centro de custo.
-- - Versão do catálogo (md5 do conteúdo): se o app já tem a mesma versão, o
--   catálogo não é reenviado.
create or replace function public.driver_sync_pull(p_catalog_version text default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_role text;
  v_vehicles jsonb;
  v_version text;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre novamente.' using errcode = '42501';
  end if;

  select p.tenant_id, p.role into v_tenant, v_role
    from public.profiles p
   where p.id = v_uid;
  if v_tenant is null or v_role is distinct from 'motorista' then
    raise exception 'Acesso não autorizado.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id,
           'unit_code', v.unit_code,
           'qr_code', v.qr_code,
           'name', v.name,
           'plate', v.plate,
           'brand', v.brand,
           'model', v.model,
           'year', v.year,
           'color', v.color,
           'department', v.department,
           'department_id', v.department_id,
           'vehicle_type', v.vehicle_type,
           'current_odometer', v.current_odometer,
           'fuel_type', v.fuel_type,
           'tank_capacity', v.tank_capacity,
           'status', v.status
         ) order by v.plate, v.id), '[]'::jsonb)
    into v_vehicles
    from public.vehicles v
   where v.tenant_id = v_tenant;

  v_version := md5(v_vehicles::text);

  return jsonb_build_object(
    'server_time', now(),
    'catalog_version', v_version,
    'vehicles', case when v_version = p_catalog_version then null else v_vehicles end
  );
end;
$$;

revoke all on function public.driver_sync_pull(text) from public, anon;
grant execute on function public.driver_sync_pull(text) to authenticated;
