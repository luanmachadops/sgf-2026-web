-- Remove a carga de demonstração criada por seed_tapejara_demo_6m.sql.
-- Identificação: veículos DEMO-TAP-*, marcador [DEMO-SEED-6M] e números DEMO-*.
-- Nada fora dessas marcas é tocado. Ordem: filhos antes dos pais (há FKs RESTRICT).

create temporary table _demo_log (step text, n bigint) on commit drop;
create temporary table _v on commit drop as select id from public.vehicles where unit_code like 'DEMO-TAP-%';
create temporary table _trips on commit drop as select id from public.trips where vehicle_id in (select id from _v) or notes like '[DEMO-SEED-6M]%';
create temporary table _so on commit drop as select id from public.service_orders where vehicle_id in (select id from _v) or admin_note like '[DEMO-SEED-6M]%' or description like '[DEMO-SEED-6M]%';
create temporary table _fuel on commit drop as select id from public.fuelings where vehicle_id in (select id from _v) or pump_receipt_number like 'DEMO-%';
create temporary table _ops on commit drop as select id from public.station_operations where vehicle_id in (select id from _v) or protocol like 'DEMO-OP-%';
create temporary table _closings on commit drop as select id from public.station_monthly_closings where protocol like 'DEMO-FECH-%';
create temporary table _issues on commit drop as select id from public.issues where vehicle_id in (select id from _v) or trip_id in (select id from _trips) or description like '[DEMO-SEED-6M]%';
create temporary table _checks on commit drop as select id from public.checklists where vehicle_id in (select id from _v) or trip_id in (select id from _trips) or notes like '[DEMO-SEED-6M]%';

-- Fechamentos mensais do posto
with d as (delete from public.station_closing_payments where closing_id in (select id from _closings) returning 1) insert into _demo_log select 'station_closing_payments', count(*) from d;
with d as (delete from public.station_closing_invoices where closing_id in (select id from _closings) returning 1) insert into _demo_log select 'station_closing_invoices', count(*) from d;
with d as (delete from public.station_closing_commitments where closing_id in (select id from _closings) returning 1) insert into _demo_log select 'station_closing_commitments', count(*) from d;
with d as (delete from public.station_monthly_closings where id in (select id from _closings) returning 1) insert into _demo_log select 'station_monthly_closings', count(*) from d;

-- Ordens de serviço (pagamentos e itens de nota antes)
with d as (delete from public.service_order_payments where service_order_id in (select id from _so) returning 1) insert into _demo_log select 'service_order_payments', count(*) from d;
with d as (delete from public.service_order_invoice_items where invoice_id in (select id from public.service_order_invoices where service_order_id in (select id from _so)) returning 1) insert into _demo_log select 'service_order_invoice_items', count(*) from d;
with d as (delete from public.service_order_quote_procurement_reservations where service_order_id in (select id from _so) returning 1) insert into _demo_log select 'so_quote_reservations', count(*) from d;
with d as (delete from public.service_orders where id in (select id from _so) returning 1) insert into _demo_log select 'service_orders', count(*) from d;

-- Ocorrências, infrações, checklists
with d as (delete from public.issues where id in (select id from _issues) returning 1) insert into _demo_log select 'issues', count(*) from d;
with d as (delete from public.infractions where vehicle_id in (select id from _v) or indicated_trip_id in (select id from _trips) or ait like 'DEMO-AIT-%' returning 1) insert into _demo_log select 'infractions', count(*) from d;
with d as (delete from public.checklists where id in (select id from _checks) returning 1) insert into _demo_log select 'checklists', count(*) from d;

-- Abastecimentos e operações do posto
with d as (delete from public.procurement_fuel_reservations where fueling_id in (select id from _fuel) or vehicle_id in (select id from _v) returning 1) insert into _demo_log select 'procurement_fuel_reservations', count(*) from d;
with d as (delete from public.fuelings where id in (select id from _fuel) returning 1) insert into _demo_log select 'fuelings', count(*) from d;
with d as (delete from public.procurement_station_reservations where operation_id in (select id from _ops) or vehicle_id in (select id from _v) returning 1) insert into _demo_log select 'procurement_station_reservations', count(*) from d;
with d as (delete from public.station_operations where id in (select id from _ops) returning 1) insert into _demo_log select 'station_operations', count(*) from d;

-- Viagens
with d as (delete from public.live_positions where trip_id in (select id from _trips) or vehicle_id in (select id from _v) returning 1) insert into _demo_log select 'live_positions', count(*) from d;
with d as (delete from public.trips where id in (select id from _trips) returning 1) insert into _demo_log select 'trips', count(*) from d;

-- Empenho e item de catálogo fictícios
with d as (delete from public.station_commitments where commitment_number like 'DEMO-EMP-%' returning 1) insert into _demo_log select 'station_commitments', count(*) from d;
with d as (delete from public.station_catalog_items where code like 'DEMO-%' returning 1) insert into _demo_log select 'station_catalog_items', count(*) from d;

-- Avisos que apontam para registros removidos
with d as (delete from public.notifications where entity_id in (
    select id from _v union all select id from _trips union all select id from _so union all select id from _fuel
    union all select id from _ops union all select id from _closings union all select id from _issues union all select id from _checks)
  returning 1) insert into _demo_log select 'notifications', count(*) from d;

-- Veículos
update public.profiles set current_vehicle_id = null where current_vehicle_id in (select id from _v);
with d as (delete from public.device_alarms where vehicle_id in (select id from _v) returning 1) insert into _demo_log select 'device_alarms', count(*) from d;
with d as (delete from public.vehicles where id in (select id from _v) returning 1) insert into _demo_log select 'vehicles', count(*) from d;
