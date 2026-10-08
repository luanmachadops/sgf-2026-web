-- Correções encontradas no teste ponta a ponta dos portais do posto e da oficina.
--
-- 1. Conclusão de abastecimento pelo posto: o painel grava o PATH da foto
--    (tenant/<tenant>/stations/<posto>/fuelings/<id>/...), mas a checagem
--    exigia a URL pública antiga (/storage/v1/object/public/fotos/...). Todo
--    abastecimento concluído pelo posto era recusado com "A foto não pertence
--    a esta autorização". A checagem passa a aceitar o path (que também está
--    contido na URL antiga, então os dois formatos continuam válidos).
--
-- 2. Ano dos veículos: uma importação antiga juntou fabricação e modelo
--    (2020/2021 -> 20202021). Fica o ano do modelo, como na importação atual.
--
-- 3. Autorização de 20/07 sem combustível e sem validade, que travava a lista
--    do posto: cancelada com motivo registrado.

create or replace function sgf_private.rpc_original__partner_complete_fueling_v2(p_fueling_id uuid, p_liters numeric, p_odometer integer, p_receipt_no text, p_photo_url text)
 returns table(fueling_id uuid, total_cost numeric, price_per_liter numeric)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  ctx record;
  expected_fragment text;
begin
  select * into ctx from public.partner_context();
  if ctx.kind <> 'posto' then
    raise exception 'Somente postos podem registrar abastecimento';
  end if;
  if nullif(trim(p_receipt_no), '') is null then
    raise exception 'Informe o número do cupom';
  end if;
  if length(trim(p_receipt_no)) > 100 then
    raise exception 'Número do cupom muito longo';
  end if;
  if nullif(trim(p_photo_url), '') is null then
    raise exception 'Envie a foto do bico da bomba';
  end if;

  expected_fragment := format(
    'tenant/%s/stations/%s/fuelings/%s/',
    ctx.tenant_id,
    ctx.partner_id,
    p_fueling_id
  );
  if strpos(p_photo_url, expected_fragment) = 0 then
    raise exception 'A foto não pertence a esta autorização';
  end if;

  return query
    select *
    from public.partner_complete_fueling(
      p_fueling_id,
      p_liters,
      p_odometer,
      trim(p_receipt_no),
      trim(p_photo_url)
    );
end
$function$;

update public.vehicles
   set year = right(year::text, 4)::integer
 where year > 9999
   and right(year::text, 4)::integer between 1950 and 2100;

update public.fuelings
   set workflow_status = 'rejeitado_admin',
       cancelled_at = now(),
       cancellation_reason = 'Autorização antiga sem combustível e sem validade (limpeza automática).'
 where id = 'fcfecd25-3547-4a2f-bc8b-a10253a70a44'
   and workflow_status::text = 'autorizado'
   and cancelled_at is null;
