-- ARLA/lubrificante (insumos de posto) também aceitam "sem motorista definido",
-- como abastecimento e manutenção em 20261002120000.
do $$
declare
  f1 regprocedure := 'sgf_private.rpc_original__manager_create_station_operation(uuid,uuid,uuid,uuid,numeric,timestamp with time zone,text)';
  f2 regprocedure := 'sgf_private.issue_procurement_station_operation(uuid,jsonb)';
  b text;
  o1 text := E'  if not exists (\n    select 1 from public.profiles p\n    where p.id = p_driver_id and p.tenant_id = v.tenant_id';
  o2a text := 'perform 1 from public.profiles where id=driver and';
  o2b text := 'if not found then raise exception ''Motorista ativo não encontrado''; end if;';
begin
  b := pg_get_functiondef(f1);
  if strpos(b, o1) = 0 then raise exception 'Trecho não encontrado em %', f1; end if;
  execute replace(b, o1, E'  if p_driver_id is not null and not exists (\n    select 1 from public.profiles p\n    where p.id = p_driver_id and p.tenant_id = v.tenant_id');

  b := pg_get_functiondef(f2);
  if strpos(b, o2a) = 0 or strpos(b, o2b) = 0 then raise exception 'Trecho não encontrado em %', f2; end if;
  if (length(b) - length(replace(b, o2b, ''))) / length(o2b) <> 1 then raise exception 'Trecho ambíguo em %', f2; end if;
  b := replace(b, o2a, 'if driver is not null then perform 1 from public.profiles where id=driver and');
  b := replace(b, o2b, o2b || ' end if;');
  execute b;
end $$;
