-- ============================================================================
-- FASE 5 — Portal do posto: histórico paginado + identidade do hostname
--
-- STATUS: *** APLICADA em 2026-07-26 ***
--   Versão registrada no banco: 20260726030059.
--   Antes da aplicação, a migration inteira executou contra o schema real
--   em transação encerrada por sentinela (rollback). Em seguida, a suíte de
--   isolamento passou 15/15, também com rollback automático.
--
-- O histórico é exposto por RPC para não dar ao parceiro acesso à tabela de
-- veículos. O tenant e o posto são sempre derivados de auth.uid() por
-- partner_context(); nenhum identificador de parceiro vem do cliente.
--
-- resolve_tenant_host corrige o guard hostname × tenant: a RPC pública de
-- branding não devolve o UUID e, portanto, não permitia comprovar a divergência.
-- Ela expõe somente id/nome/slug de tenants ativos, dados já públicos na tela
-- de login.
-- ============================================================================

create or replace function public.get_station_history(
  p_from date default (current_date - 90),
  p_to date default current_date,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  fueling_id uuid,
  plate text,
  brand text,
  model text,
  fuel_type text,
  liters numeric,
  odometer int,
  price_per_liter numeric,
  total_cost numeric,
  receipt_no text,
  photo_url text,
  filled_at timestamptz,
  workflow_status text,
  rejection_reason text,
  has_anomaly boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  v_from date := coalesce(p_from, current_date - 90);
  v_to date := coalesce(p_to, current_date);
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  select * into ctx from public.partner_context();
  if ctx.kind <> 'posto' then
    raise exception 'Somente postos';
  end if;
  if v_from > v_to then
    raise exception 'Período inválido';
  end if;

  return query
    select
      f.id,
      v.plate,
      v.brand,
      v.model,
      f.fuel_type,
      f.liters,
      f.odometer,
      f.price_per_liter,
      f.total_cost,
      f.pump_receipt_number,
      f.photo_pump_url,
      f.filled_at,
      f.workflow_status::text,
      case when f.workflow_status = 'rejeitado_admin' then f.anomaly_type else null end,
      coalesce(f.has_anomaly, false),
      count(*) over ()
    from public.fuelings f
    join public.vehicles v on v.id = f.vehicle_id
    where f.tenant_id = ctx.tenant_id
      and f.station_id = ctx.partner_id
      and f.filled_at is not null
      and f.filled_at >= v_from::timestamptz
      and f.filled_at < (v_to + 1)::timestamptz
    order by f.filled_at desc
    limit v_limit
    offset v_offset;
end
$$;

create or replace function public.resolve_tenant_host(p_slug text)
returns table (id uuid, slug text, name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id, t.slug, t.name
  from public.tenants t
  where t.slug = lower(trim(p_slug))
    and coalesce(t.status, 'active') = 'active'
  limit 1
$$;

/**
 * Entrada pública usada pela fase 5. A RPC original aceitava cupom e foto
 * nulos, o que permitiria contornar a validação da tela chamando o PostgREST
 * diretamente. Esta versão valida os dois campos e também garante que a URL
 * aponta para o diretório do tenant/posto/autorização autenticados.
 */
create or replace function public.partner_complete_fueling_v2(
  p_fueling_id uuid,
  p_liters numeric,
  p_odometer int,
  p_receipt_no text,
  p_photo_url text
)
returns table (fueling_id uuid, total_cost numeric, price_per_liter numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
    '/storage/v1/object/public/fotos/tenant/%s/stations/%s/fuelings/%s/',
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
$$;

revoke all on function public.get_station_history(date,date,int,int) from public, anon;
grant execute on function public.get_station_history(date,date,int,int) to authenticated;

revoke all on function public.resolve_tenant_host(text) from public;
grant execute on function public.resolve_tenant_host(text) to anon, authenticated;

-- A versão antiga fica interna; sem isto o cliente poderia pular as validações
-- obrigatórias de cupom/foto chamando-a pelo Data API.
revoke execute on function public.partner_complete_fueling(uuid,numeric,int,text,text)
  from public, anon, authenticated;
revoke all on function public.partner_complete_fueling_v2(uuid,numeric,int,text,text)
  from public, anon;
grant execute on function public.partner_complete_fueling_v2(uuid,numeric,int,text,text)
  to authenticated;

comment on function public.get_station_history(date,date,int,int) is
  'Histórico paginado do posto autenticado; tenant/parceiro derivados de auth.uid().';
comment on function public.resolve_tenant_host(text) is
  'Identidade pública mínima de tenant ativo para validar hostname × sessão.';
comment on function public.partner_complete_fueling_v2(uuid,numeric,int,text,text) is
  'Completa autorização do posto exigindo cupom e foto no caminho do parceiro autenticado.';
