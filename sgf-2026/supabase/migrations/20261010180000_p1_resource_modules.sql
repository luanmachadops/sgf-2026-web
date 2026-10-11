-- P1: mapeia no filtro de API (sgf_private.check_api_access -> resource_allowed)
-- as tabelas, views e RPCs novas do P1. Sem isso, admin/gestor recebem
-- "Modulo nao autorizado" (recurso sem mapeamento = negado). So acrescenta casos.
create or replace function sgf_private.resource_modules(p_resource text, p_write boolean)
returns text[]
language sql
immutable
set search_path to ''
as $function$
select case
  when p_resource='get_trip_timeline' then array['trips']::text[]
  when p_resource='reconcile_procurement_legacy_entry' then array['procurement','budgets','reports']::text[]
  when p_resource='get_procurement_reconciled_legacy_totals' then array['budgets','reports']::text[]
  -- P0 (2026-10-09): viagem imutavel, retificacoes, paradas e auditoria.
  when p_resource in ('manager_cancel_trip','manager_correct_trip','trip_corrections','trip_stops') then array['trips']::text[]
  when p_resource='verify_activity_chain' then array['settings','reports']::text[]
  -- P1 (2026-10-09): expediente, autorizacoes, prestacao de contas, frota e preventiva.
  when p_resource in ('work_schedules','holidays') then array['settings']::text[]
  when p_resource='off_hours_authorizations' then array['settings','trips']::text[]
  when p_resource in ('report_snapshots','register_report_snapshot','sign_report_snapshot','verify_report') then array['reports']::text[]
  when p_resource in ('maintenance_plans','maintenance_plan_status','maintenance_plan_eval') then array['maintenances']::text[]
  when p_resource='cost_centers' then array['fleet','departments']::text[]
  when p_resource='vehicle_rental_contracts' then array['fleet']::text[]
  else sgf_private.resource_modules_before_procurement_legacy_reconciliation(p_resource,p_write)
end
$function$;
