-- O frontend passou a persistir somente o path do bucket privado `fotos`
-- (`tenant/<tenant>/...`) quando o bucket deixou de ser público. A versão
-- anterior desta RPC ainda validava uma URL `/object/public/`, então todo
-- serviço concluído depois do fechamento do bucket era recusado com 400.
create or replace function public.repair_shop_finish_service_v2(
  p_order_id uuid,
  p_note text,
  p_photo_urls text[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  photo_path text;
  expected_prefix text;
begin
  select * into ctx from public.partner_context();
  if ctx.kind <> 'oficina' then raise exception 'Somente oficinas'; end if;
  if nullif(trim(p_note), '') is null then
    raise exception 'Descreva o serviço realizado';
  end if;
  if length(trim(p_note)) > 2000 then raise exception 'Descrição muito longa'; end if;
  if p_photo_urls is null or cardinality(p_photo_urls) = 0 then
    raise exception 'Envie ao menos uma foto do serviço concluído';
  end if;
  if cardinality(p_photo_urls) > 10 then
    raise exception 'Envie no máximo 10 fotos';
  end if;

  expected_prefix := format(
    'tenant/%s/repair_shops/%s/service_orders/%s/completion/',
    ctx.tenant_id,
    ctx.partner_id,
    p_order_id
  );

  foreach photo_path in array p_photo_urls loop
    photo_path := trim(photo_path);
    if nullif(photo_path, '') is null
       or strpos(photo_path, expected_prefix) <> 1
       or strpos(photo_path, '..') > 0 then
      raise exception 'Uma das fotos não pertence a esta ordem de serviço';
    end if;
    if not exists (
      select 1
        from storage.objects o
       where o.bucket_id = 'fotos'
         and o.name = photo_path
    ) then
      raise exception 'Uma das fotos enviadas não foi localizada';
    end if;
  end loop;

  perform public.repair_shop_finish_service(p_order_id, trim(p_note));

  foreach photo_path in array p_photo_urls loop
    photo_path := trim(photo_path);
    insert into public.service_order_events
      (tenant_id, service_order_id, axis, actor_id, actor_role, note, attachment_path)
    select ctx.tenant_id, p_order_id, 'note', ctx.profile_id, 'oficina',
           'Foto do serviço concluído', photo_path
    where not exists (
      select 1
        from public.service_order_events e
       where e.service_order_id = p_order_id
         and e.attachment_path = photo_path
    );
  end loop;
end
$$;

revoke all on function public.repair_shop_finish_service_v2(uuid, text, text[])
  from public, anon;
grant execute on function public.repair_shop_finish_service_v2(uuid, text, text[])
  to authenticated;

comment on function public.repair_shop_finish_service_v2(uuid, text, text[]) is
  'Conclui serviço da oficina e valida fotos pelo path privado, escopado por tenant, oficina e OS.';
