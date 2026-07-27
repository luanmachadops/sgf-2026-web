-- Permite que uma notificação do posto abra um abastecimento específico,
-- independentemente do filtro de datas/paginação do histórico.
create or replace function public.get_station_history_item(
  p_fueling_id uuid
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
  has_anomaly boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
begin
  if p_fueling_id is null then
    raise exception 'Abastecimento não informado';
  end if;

  select * into ctx from public.partner_read_context();
  if ctx.kind <> 'posto' then
    raise exception 'Somente postos';
  end if;

  return query
    select f.id, v.plate, v.brand, v.model, f.fuel_type, f.liters,
           f.odometer, f.price_per_liter, f.total_cost,
           f.pump_receipt_number, f.photo_pump_url,
           coalesce(f.filled_at, f.created_at), f.workflow_status::text,
           case when f.workflow_status::text = 'rejeitado_admin'
             then f.anomaly_type else null end,
           coalesce(f.has_anomaly, false)
    from public.fuelings f
    join public.vehicles v on v.id = f.vehicle_id
    where f.id = p_fueling_id
      and f.tenant_id = ctx.tenant_id
      and f.station_id = ctx.partner_id;
end
$$;

revoke all on function public.get_station_history_item(uuid) from public, anon;
grant execute on function public.get_station_history_item(uuid) to authenticated;

comment on function public.get_station_history_item(uuid) is
  'Retorna ao posto autenticado um abastecimento específico do próprio vínculo para abertura por notificação.';
