-- A linha do tempo da viagem é uma RPC nova: o pré-request (check_api_access)
-- nega a gestores qualquer RPC sem módulo registrado. Fica no módulo de viagens.
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
    else sgf_private.resource_modules_before_procurement_legacy_reconciliation(p_resource,p_write)
  end
$function$;
