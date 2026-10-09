-- Aplicada em 2026-10-09. Correcao do P0: o filtro de API
-- (sgf_private.check_api_access -> resource_allowed) nega por padrao todo
-- recurso sem mapeamento (resource_modules devolve array vazio). As RPCs e
-- tabelas novas do P0 ficavam bloqueadas para admin/gestor em sessao real
-- ("Modulo nao autorizado para este acesso"). Apenas acrescenta casos.
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
  else sgf_private.resource_modules_before_procurement_legacy_reconciliation(p_resource,p_write)
end
$function$;
