-- Complemento de 20261002120000: editar uma OS também aceita "sem motorista definido"
-- (antes a edição exigia motorista e falhava em OS criadas para "quem estiver com o veículo").
do $$
declare fn regprocedure := 'sgf_private.rpc_original__manager_update_service_order_request(uuid,uuid,uuid,text,text,text,integer)';
        body text := pg_get_functiondef(fn);
        old_t text := E'  if not exists (\n    select 1 from public.profiles p\n     where p.id = p_driver_id';
begin
  if strpos(body, old_t) = 0 then raise exception 'Trecho não encontrado em %', fn; end if;
  execute replace(body, old_t, E'  if p_driver_id is not null and not exists (\n    select 1 from public.profiles p\n     where p.id = p_driver_id');
end $$;
