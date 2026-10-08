-- Histórico do posto: abastecimento concluído pelo motorista no app não tem
-- foto da bomba (photo_pump_url), só recibo/painel/requisição. O posto passa a
-- ver a foto do recibo (ou do painel) nesses casos.

create or replace function sgf_private.rpc_original__get_station_history(p_from date DEFAULT (CURRENT_DATE - 90), p_to date DEFAULT CURRENT_DATE, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 returns table(fueling_id uuid, plate text, brand text, model text, fuel_type text, liters numeric, odometer integer, price_per_liter numeric, total_cost numeric, receipt_no text, photo_url text, filled_at timestamptz, workflow_status text, rejection_reason text, has_anomaly boolean, total_count bigint)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  ctx record;
  v_from date := coalesce(p_from, current_date - 90);
  v_to date := coalesce(p_to, current_date);
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  select * into ctx from public.partner_read_context();
  if ctx.kind <> 'posto' then raise exception 'Somente postos'; end if;
  if v_from > v_to then raise exception 'Período inválido'; end if;

  return query
    select f.id, v.plate, v.brand, v.model, f.fuel_type, f.liters,
           f.odometer, f.price_per_liter, f.total_cost,
           f.pump_receipt_number,
           coalesce(f.photo_pump_url, f.photo_receipt_url, f.photo_dashboard_url),
           f.filled_at,
           f.workflow_status::text,
           case when f.workflow_status::text = 'rejeitado_admin'
             then f.anomaly_type else null end,
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
$function$;

create or replace function sgf_private.rpc_original__get_station_history_item(p_fueling_id uuid)
 returns table(fueling_id uuid, plate text, brand text, model text, fuel_type text, liters numeric, odometer integer, price_per_liter numeric, total_cost numeric, receipt_no text, photo_url text, filled_at timestamptz, workflow_status text, rejection_reason text, has_anomaly boolean)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
           f.pump_receipt_number,
           coalesce(f.photo_pump_url, f.photo_receipt_url, f.photo_dashboard_url),
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
$function$;
