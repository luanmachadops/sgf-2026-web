-- ============================================================================
-- ABASTECIMENTO V2 — aprovação exige evidência do posto
--
-- A validação visual encontrou lançamentos legados em `concluido` sem foto do
-- bico/cupom. Eles podem ser rejeitados com justificativa, mas nunca aprovados.
-- ============================================================================

create or replace function public.manager_review_fueling(
  p_fueling_id uuid,
  p_approved boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  fueling record;
  vehicle record;
  v_previous_odometer integer;
  v_km_per_liter numeric;
  v_anomaly boolean;
  v_anomaly_note text;
begin
  select * into ctx from public.service_order_manager_context();
  if not p_approved and nullif(trim(p_note), '') is null then
    raise exception 'Informe o motivo da rejeição';
  end if;

  select * into fueling
    from public.fuelings
   where id = p_fueling_id
     and (ctx.superadmin or tenant_id = ctx.tenant_id)
   for update;
  if fueling.id is null then raise exception 'Abastecimento não encontrado'; end if;
  if fueling.workflow_status <> 'concluido' then
    raise exception 'O abastecimento não está aguardando validação';
  end if;

  select * into vehicle from public.vehicles where id = fueling.vehicle_id for update;
  if vehicle.id is null then raise exception 'Veículo do abastecimento não encontrado'; end if;

  if not p_approved then
    update public.fuelings
       set workflow_status = 'rejeitado_admin',
           cancelled_at = now(),
           cancelled_by = ctx.profile_id,
           cancellation_reason = trim(p_note),
           has_anomaly = true,
           anomaly_type = trim(p_note)
     where id = fueling.id;
    return;
  end if;

  if nullif(trim(fueling.photo_pump_url), '') is null
     or nullif(trim(fueling.pump_receipt_number), '') is null then
    raise exception 'Não é possível aprovar sem foto do bico e número do cupom';
  end if;

  if fueling.liters is null or fueling.liters <= 0
     or fueling.odometer is null or fueling.odometer <= 0
     or fueling.total_cost is null or fueling.total_cost <= 0
     or fueling.price_per_liter is null or fueling.price_per_liter <= 0 then
    raise exception 'O abastecimento está incompleto';
  end if;

  select f.odometer into v_previous_odometer
    from public.fuelings f
   where f.vehicle_id = fueling.vehicle_id
     and f.id <> fueling.id
     and f.workflow_status in ('validado', 'lancado_direto')
     and f.odometer is not null
   order by coalesce(f.filled_at, f.created_at) desc
   limit 1;

  v_anomaly := coalesce(fueling.has_anomaly, false);
  v_anomaly_note := nullif(trim(coalesce(fueling.anomaly_type, '')), '');
  if v_previous_odometer is not null and fueling.odometer < v_previous_odometer then
    v_anomaly := true;
    v_anomaly_note := concat_ws(
      '; ',
      v_anomaly_note,
      format('Hodômetro regrediu de %s para %s km', v_previous_odometer, fueling.odometer)
    );
  elsif v_previous_odometer is not null and fueling.odometer > v_previous_odometer then
    v_km_per_liter := round(
      (fueling.odometer - v_previous_odometer)::numeric / fueling.liters,
      2
    );
  end if;

  update public.fuelings
     set workflow_status = 'validado',
         validated_at = now(),
         validated_by = ctx.profile_id,
         km_per_liter = v_km_per_liter,
         has_anomaly = v_anomaly,
         anomaly_type = v_anomaly_note,
         cancellation_reason = null
   where id = fueling.id;

  update public.vehicles
     set current_odometer = greatest(current_odometer, fueling.odometer)
   where id = vehicle.id;
end
$$;

revoke all on function public.manager_review_fueling(uuid,boolean,text)
  from public, anon;
grant execute on function public.manager_review_fueling(uuid,boolean,text)
  to authenticated;

comment on function public.manager_review_fueling(uuid,boolean,text) is
  'Gestor valida execução do posto somente com foto do bico e cupom; rejeição exige motivo.';
