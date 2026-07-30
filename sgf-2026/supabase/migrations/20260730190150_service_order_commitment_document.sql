-- Documento do empenho/NAD da ordem de serviço.
-- O arquivo fica no bucket privado `documentos`; a tabela guarda somente o path.
alter table public.service_orders
  add column if not exists commitment_document_path text;

create or replace function public.manager_register_service_order_commitment(
  p_order_id uuid,
  p_commitment_number text,
  p_nad_number text,
  p_document_path text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  so record;
begin
  select * into ctx from public.service_order_manager_context();
  if nullif(trim(p_commitment_number), '') is null then
    raise exception 'Informe o número do empenho';
  end if;
  if nullif(trim(p_document_path), '') is null then
    raise exception 'Anexe o documento do empenho ou da NAD';
  end if;

  select * into so
    from public.service_orders
   where id = p_order_id
     and (ctx.superadmin or tenant_id = ctx.tenant_id)
   for update;

  if so.id is null then raise exception 'Ordem de serviço não encontrada'; end if;
  if so.operational_status <> 'awaiting_quote_approval'
     or so.financial_status <> 'awaiting_commitment' then
    raise exception 'A ordem de serviço não está aguardando empenho';
  end if;
  if not exists (
    select 1 from public.service_order_quotes q
     where q.service_order_id = so.id and q.status = 'aprovado'
  ) then
    raise exception 'Nenhum orçamento aprovado foi encontrado';
  end if;

  -- O path deve seguir `service_orders/<tenant>/...`. O upload em si também é
  -- protegido pelas policies do bucket, mas a checagem aqui impede armazenar
  -- referência arbitrária em uma RPC SECURITY DEFINER.
  if split_part(p_document_path, '/', 1) <> 'service_orders'
     or split_part(p_document_path, '/', 2) <> so.tenant_id::text then
    raise exception 'Documento do empenho fora do escopo da prefeitura';
  end if;

  update public.service_orders
     set commitment_number = trim(p_commitment_number),
         nad_number = nullif(trim(p_nad_number), ''),
         commitment_document_path = trim(p_document_path),
         financial_status = 'committed'
   where id = so.id;

  insert into public.service_order_events (
    tenant_id, service_order_id, axis, from_state, to_state,
    actor_id, actor_role, note
  )
  values (
    so.tenant_id, so.id, 'financial', 'awaiting_commitment', 'committed',
    ctx.profile_id, 'gestao',
    format('Empenho %s registrado com documento', trim(p_commitment_number))
  );
end
$$;

revoke all on function public.manager_register_service_order_commitment(uuid, text, text, text)
  from public, anon;
grant execute on function public.manager_register_service_order_commitment(uuid, text, text, text)
  to authenticated;

comment on column public.service_orders.commitment_document_path is
  'Path privado do documento de empenho/NAD no bucket documentos.';
