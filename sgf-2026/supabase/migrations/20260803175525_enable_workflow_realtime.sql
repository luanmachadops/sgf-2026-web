-- Habilita CDC dos fluxos que precisam atualizar prefeitura, parceiros e app
-- do motorista sem polling. O bloco e idempotente para funcionar tanto em
-- projetos novos quanto nos ambientes que ja publicaram alguma destas tabelas.
do $migration$
declare
  v_table text;
begin
  foreach v_table in array array[
    'notifications',
    'profiles',
    'vehicles',
    'trips',
    'checklists',
    'issues',
    'app_settings',
    'vehicle_documents',
    'fuelings',
    'fuel_stations',
    'station_catalog_items',
    'station_operations',
    'service_orders',
    'service_order_quotes',
    'service_order_invoices',
    'service_order_events',
    'service_order_payments',
    'repair_shops',
    'station_monthly_closings',
    'station_closing_invoices',
    'station_closing_payments',
    'station_monthly_closing_events'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is not null
       and not exists (
         select 1
           from pg_publication_tables
          where pubname = 'supabase_realtime'
            and schemaname = 'public'
            and tablename = v_table
       ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        v_table
      );
    end if;
  end loop;
end
$migration$;

comment on publication supabase_realtime is
  'CDC usado pelo SGF para sincronizar prefeitura, posto, oficina e app do motorista em tempo real.';
