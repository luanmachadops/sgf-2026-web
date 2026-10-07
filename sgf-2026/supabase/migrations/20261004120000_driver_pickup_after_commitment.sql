-- Retirada do veículo pelo motorista: liberada com o empenho feito OU em
-- qualquer etapa financeira posterior (nota fiscal, atesto, pagamento).
--
-- Antes exigia financial_status = 'committed' exatamente. Se a gestão lançava
-- a nota fiscal antes de o motorista retirar, a OS ficava 'ready' para sempre:
-- o app mostrava "Retirar e conferir" e o banco respondia "A retirada ainda não
-- foi liberada pela gestão".

begin;

create or replace function pg_temp.patch_fn(p_fn regprocedure, p_old text, p_new text)
returns void language plpgsql as $$
declare body text := pg_get_functiondef(p_fn);
begin
  if strpos(body, p_old) = 0 then
    raise exception 'Trecho não encontrado em %: %', p_fn, left(p_old, 80);
  end if;
  execute replace(body, p_old, p_new);
end $$;

select pg_temp.patch_fn(
  'sgf_private.rpc_original__driver_update_service_order(uuid,text,text,text)',
  E'    if so.financial_status <> ''committed'' then',
  E'    if so.financial_status not in (''committed'', ''invoiced'', ''attested'', ''paid'') then');

commit;
