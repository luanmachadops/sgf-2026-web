-- ============================================================================
-- FASE 7 — Portal da oficina: RPCs validadas
--
-- STATUS: *** APLICADA em 2026-07-26 ***
--   Versão registrada no banco: 20260726031428.
--
-- A fronteira de `storage.objects` fica na migration seguinte porque a tabela
-- pertence a `supabase_storage_admin` e precisa ser criada pelo dashboard.
-- ============================================================================

-- Valida cada item antes de chamar a implementação atômica já testada.
create or replace function public.repair_shop_submit_quote_v2(
  p_order_id uuid,
  p_items jsonb,
  p_valid_until date default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  it jsonb;
  v_qty numeric;
  v_price numeric;
begin
  perform public.partner_context();
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Inclua ao menos um item no orçamento';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'O orçamento aceita no máximo 100 itens';
  end if;
  if p_valid_until is not null and p_valid_until < current_date then
    raise exception 'A validade do orçamento não pode estar no passado';
  end if;
  if length(coalesce(p_note, '')) > 2000 then
    raise exception 'Observação muito longa';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce(it->>'kind', '') not in ('peca', 'mao_de_obra') then
      raise exception 'Tipo de item inválido';
    end if;
    if nullif(trim(it->>'description'), '') is null then
      raise exception 'Todo item precisa de descrição';
    end if;
    if length(trim(it->>'description')) > 500 then
      raise exception 'Descrição de item muito longa';
    end if;
    begin
      v_qty := (it->>'qty')::numeric;
      v_price := (it->>'unit_price')::numeric;
    exception when invalid_text_representation then
      raise exception 'Quantidade ou preço inválido';
    end;
    if v_qty is null or v_qty <= 0 or v_qty > 100000 then
      raise exception 'Quantidade inválida';
    end if;
    if v_price is null or v_price < 0 or v_price > 100000000 then
      raise exception 'Preço unitário inválido';
    end if;
  end loop;

  return public.repair_shop_submit_quote(
    p_order_id,
    p_items,
    p_valid_until,
    nullif(trim(p_note), '')
  );
end
$$;

-- Conclusão exige ao menos uma evidência fotográfica no diretório da própria
-- oficina. Cada foto vira evento append-only; repetição da RPC não duplica.
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
  photo_url text;
  expected_fragment text;
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

  expected_fragment := format(
    '/storage/v1/object/public/fotos/tenant/%s/repair_shops/%s/service_orders/%s/',
    ctx.tenant_id,
    ctx.partner_id,
    p_order_id
  );
  foreach photo_url in array p_photo_urls loop
    if nullif(trim(photo_url), '') is null
       or strpos(photo_url, expected_fragment) = 0 then
      raise exception 'Uma das fotos não pertence a esta ordem de serviço';
    end if;
  end loop;

  perform public.repair_shop_finish_service(p_order_id, trim(p_note));

  foreach photo_url in array p_photo_urls loop
    insert into public.service_order_events
      (tenant_id, service_order_id, axis, actor_id, actor_role, note, attachment_path)
    select ctx.tenant_id, p_order_id, 'note', ctx.profile_id, 'oficina',
           'Foto do serviço concluído', trim(photo_url)
    where not exists (
      select 1
      from public.service_order_events e
      where e.service_order_id = p_order_id
        and e.attachment_path = trim(photo_url)
    );
  end loop;
end
$$;

-- NF fica no bucket privado e obrigatoriamente no diretório desta oficina/OS.
create or replace function public.repair_shop_submit_invoice_v2(
  p_order_id uuid,
  p_invoice_number text,
  p_amount numeric,
  p_file_path text,
  p_issued_at date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  expected_prefix text;
begin
  select * into ctx from public.partner_context();
  if ctx.kind <> 'oficina' then raise exception 'Somente oficinas'; end if;
  if nullif(trim(p_file_path), '') is null then
    raise exception 'Anexe a nota fiscal';
  end if;
  expected_prefix := format(
    'repair_shops/%s/%s/service_orders/%s/invoices/',
    ctx.tenant_id,
    ctx.partner_id,
    p_order_id
  );
  if strpos(trim(p_file_path), expected_prefix) <> 1 or strpos(p_file_path, '..') > 0 then
    raise exception 'O arquivo da nota não pertence a esta ordem de serviço';
  end if;

  return public.repair_shop_submit_invoice(
    p_order_id,
    p_invoice_number,
    p_amount,
    trim(p_file_path),
    p_issued_at
  );
end
$$;

-- Fecha os endpoints antigos que permitiam pular as validações da fase 7.
revoke execute on function public.repair_shop_submit_quote(uuid,jsonb,date,text)
  from public, anon, authenticated;
revoke execute on function public.repair_shop_finish_service(uuid,text)
  from public, anon, authenticated;
revoke execute on function public.repair_shop_submit_invoice(uuid,text,numeric,text,date)
  from public, anon, authenticated;

revoke all on function public.repair_shop_submit_quote_v2(uuid,jsonb,date,text)
  from public, anon;
revoke all on function public.repair_shop_finish_service_v2(uuid,text,text[])
  from public, anon;
revoke all on function public.repair_shop_submit_invoice_v2(uuid,text,numeric,text,date)
  from public, anon;

grant execute on function public.repair_shop_submit_quote_v2(uuid,jsonb,date,text)
  to authenticated;
grant execute on function public.repair_shop_finish_service_v2(uuid,text,text[])
  to authenticated;
grant execute on function public.repair_shop_submit_invoice_v2(uuid,text,numeric,text,date)
  to authenticated;
