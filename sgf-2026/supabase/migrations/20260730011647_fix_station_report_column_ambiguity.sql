-- Corrige colisão entre o nome do campo retornado `station_id` e a coluna
-- homônima de profiles em funções TABLE já aplicadas.
do $$
declare
  fn regprocedure;
  ddl text;
begin
  foreach fn in array array[
    'public.get_station_closing_register(date,date,uuid)'::regprocedure,
    'public.get_station_fiscal_dashboard(uuid,integer)'::regprocedure
  ] loop
    ddl := pg_get_functiondef(fn);
    ddl := replace(
      ddl,
      'select role,tenant_id,station_id,(role=''superadmin'')',
      'select p.role,p.tenant_id,p.station_id,(p.role=''superadmin'')'
    );
    ddl := replace(
      ddl,
      'from public.profiles where id=uid and not coalesce(access_blocked,false);',
      'from public.profiles p where p.id=uid and not coalesce(p.access_blocked,false);'
    );
    execute ddl;
  end loop;
end $$;
