-- =============================================================
-- T3.1 — Conflito de vínculo de veículo (auditoria 2026-07-07)
-- A policy trips_select_own impede o motorista de ver viagens de OUTROS
-- motoristas, então o app não detecta veículo já em uso. Esta RPC
-- SECURITY DEFINER responde só "há conflito? de quem?" dentro do tenant.
-- enum trip_status = (andamento, concluida, problema)
-- =============================================================

create or replace function public.check_vehicle_conflict(p_vehicle_id uuid)
returns table(in_use boolean, driver_name text)
language sql
security definer
set search_path = public
as $$
  select true, p.full_name
  from trips t
  join profiles p on p.id = t.driver_id
  where t.vehicle_id = p_vehicle_id
    and t.status = 'andamento'
    and t.driver_id <> auth.uid()
    and t.tenant_id = get_user_tenant_id()
  order by t.start_at desc
  limit 1;
$$;

revoke execute on function public.check_vehicle_conflict(uuid) from public, anon;
grant execute on function public.check_vehicle_conflict(uuid) to authenticated;
