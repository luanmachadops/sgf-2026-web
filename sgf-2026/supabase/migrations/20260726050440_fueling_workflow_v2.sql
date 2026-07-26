-- ============================================================================
-- ABASTECIMENTO V2
--
-- Gestor autoriza → posto executa com preço do contrato → gestor valida.
-- Lançamento direto continua existindo para contingência, mas exige motorista
-- real, comprovantes e cálculo financeiro no servidor.
-- ============================================================================

create or replace function public.manager_create_fueling_authorization(
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_station_id uuid,
  p_fuel_type text,
  p_max_liters numeric default null,
  p_expires_at timestamptz default (now() + interval '1 day'),
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  vehicle record;
  station record;
  v_fuel_key text;
  v_fuel_label text;
  v_price numeric;
  v_id uuid;
begin
  select * into ctx from public.service_order_manager_context();

  select * into vehicle
    from public.vehicles
   where id = p_vehicle_id
     and (ctx.superadmin or tenant_id = ctx.tenant_id);
  if vehicle.id is null then raise exception 'Veículo não encontrado nesta prefeitura'; end if;
  if vehicle.status = 'bloqueado' then raise exception 'Veículo bloqueado não pode receber autorização'; end if;

  if not exists (
    select 1
      from public.profiles p
     where p.id = p_driver_id
       and p.tenant_id = vehicle.tenant_id
       and p.role = 'motorista'
       and coalesce(p.driver_status, 'ativo') = 'ativo'
       and not coalesce(p.access_blocked, false)
  ) then
    raise exception 'Motorista ativo não encontrado nesta prefeitura';
  end if;

  select * into station
    from public.fuel_stations
   where id = p_station_id
     and tenant_id = vehicle.tenant_id;
  if station.id is null or not station.is_active then
    raise exception 'Posto ativo não encontrado nesta prefeitura';
  end if;
  if station.contract_start is not null and station.contract_start > current_date then
    raise exception 'O contrato do posto ainda não iniciou';
  end if;
  if station.contract_end is not null and station.contract_end < current_date then
    raise exception 'O contrato do posto está vencido';
  end if;

  v_fuel_key := lower(trim(coalesce(p_fuel_type, '')));
  v_fuel_key := case v_fuel_key
    when 'gasoline' then 'gasolina'
    when 'gasolina' then 'gasolina'
    when 'ethanol' then 'etanol'
    when 'álcool' then 'etanol'
    when 'alcool' then 'etanol'
    else v_fuel_key
  end;
  if v_fuel_key not in ('diesel', 'gasolina', 'etanol') then
    raise exception 'Combustível inválido';
  end if;
  if vehicle.fuel_type is not null
     and vehicle.fuel_type <> 'flex'
     and vehicle.fuel_type::text <> v_fuel_key then
    raise exception 'Combustível incompatível com o veículo';
  end if;
  if vehicle.fuel_type = 'flex' and v_fuel_key not in ('gasolina', 'etanol') then
    raise exception 'Veículo flex deve usar gasolina ou etanol';
  end if;
  if station.fuel_types is not null
     and cardinality(station.fuel_types) > 0
     and not exists (
       select 1 from unnest(station.fuel_types) item
        where lower(item) = v_fuel_key
     ) then
    raise exception 'O posto não fornece este combustível';
  end if;

  select nullif(value, '')::numeric into v_price
    from jsonb_each_text(coalesce(station.fuel_prices, '{}'::jsonb))
   where lower(key) = v_fuel_key
   limit 1;
  if v_price is null or v_price <= 0 then
    raise exception 'Preço de % não cadastrado no contrato deste posto',
      initcap(v_fuel_key);
  end if;

  if p_max_liters is not null and p_max_liters <= 0 then
    raise exception 'O limite de litros deve ser positivo';
  end if;
  if p_max_liters is not null
     and vehicle.tank_capacity is not null
     and p_max_liters > vehicle.tank_capacity * 1.1 then
    raise exception 'O limite ultrapassa a tolerância da capacidade do tanque';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'Informe uma validade futura para a autorização';
  end if;
  if p_expires_at > now() + interval '7 days' then
    raise exception 'A autorização pode valer por no máximo 7 dias';
  end if;
  if length(trim(coalesce(p_note, ''))) > 1000 then
    raise exception 'Observação muito longa';
  end if;

  if exists (
    select 1
      from public.fuelings f
     where f.vehicle_id = vehicle.id
       and f.workflow_status = 'autorizado'
       and f.cancelled_at is null
       and (f.expires_at is null or f.expires_at > now())
  ) then
    raise exception 'Este veículo já possui uma autorização de abastecimento aberta';
  end if;

  v_fuel_label := case v_fuel_key
    when 'gasolina' then 'Gasolina'
    when 'etanol' then 'Etanol'
    else 'Diesel'
  end;

  insert into public.fuelings (
    tenant_id,
    vehicle_id,
    driver_id,
    station_id,
    fuel_type,
    max_liters,
    liters,
    total_cost,
    workflow_status,
    authorized_by,
    authorized_at,
    expires_at,
    authorization_note
  )
  values (
    vehicle.tenant_id,
    vehicle.id,
    p_driver_id,
    station.id,
    v_fuel_label,
    p_max_liters,
    0,
    null,
    'autorizado',
    ctx.profile_id,
    now(),
    p_expires_at,
    nullif(trim(p_note), '')
  )
  returning id into v_id;

  return v_id;
end
$$;

create or replace function public.manager_cancel_fueling_authorization(
  p_fueling_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  fueling record;
begin
  select * into ctx from public.service_order_manager_context();
  if nullif(trim(p_reason), '') is null then raise exception 'Informe o motivo do cancelamento'; end if;

  select * into fueling
    from public.fuelings
   where id = p_fueling_id
     and (ctx.superadmin or tenant_id = ctx.tenant_id)
   for update;
  if fueling.id is null then raise exception 'Autorização não encontrada'; end if;
  if fueling.workflow_status <> 'autorizado' then
    raise exception 'Somente autorizações ainda abertas podem ser canceladas';
  end if;

  update public.fuelings
     set workflow_status = 'rejeitado_admin',
         cancelled_at = now(),
         cancelled_by = ctx.profile_id,
         cancellation_reason = trim(p_reason)
   where id = fueling.id;
end
$$;

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

create or replace function public.manager_create_direct_fueling(
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_fuel_type text,
  p_liters numeric,
  p_price_per_liter numeric,
  p_odometer integer,
  p_station_id uuid default null,
  p_station_name text default null,
  p_occurred_on date default current_date,
  p_photo_requisition_url text default null,
  p_photo_dashboard_url text default null,
  p_full_tank boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  vehicle record;
  station record;
  v_fuel_key text;
  v_fuel_label text;
  v_contract_price numeric;
  v_price numeric;
  v_previous_odometer integer;
  v_km_per_liter numeric;
  v_anomaly boolean := false;
  v_anomaly_note text;
  v_id uuid;
begin
  select * into ctx from public.service_order_manager_context();

  select * into vehicle
    from public.vehicles
   where id = p_vehicle_id
     and (ctx.superadmin or tenant_id = ctx.tenant_id)
   for update;
  if vehicle.id is null then raise exception 'Veículo não encontrado nesta prefeitura'; end if;

  if not exists (
    select 1 from public.profiles p
     where p.id = p_driver_id
       and p.tenant_id = vehicle.tenant_id
       and p.role = 'motorista'
       and coalesce(p.driver_status, 'ativo') = 'ativo'
       and not coalesce(p.access_blocked, false)
  ) then
    raise exception 'Motorista ativo não encontrado nesta prefeitura';
  end if;

  v_fuel_key := lower(trim(coalesce(p_fuel_type, '')));
  v_fuel_key := case v_fuel_key
    when 'gasoline' then 'gasolina'
    when 'ethanol' then 'etanol'
    when 'álcool' then 'etanol'
    when 'alcool' then 'etanol'
    else v_fuel_key
  end;
  if v_fuel_key not in ('diesel', 'gasolina', 'etanol') then
    raise exception 'Combustível inválido';
  end if;
  if vehicle.fuel_type is not null
     and vehicle.fuel_type <> 'flex'
     and vehicle.fuel_type::text <> v_fuel_key then
    raise exception 'Combustível incompatível com o veículo';
  end if;
  if vehicle.fuel_type = 'flex' and v_fuel_key not in ('gasolina', 'etanol') then
    raise exception 'Veículo flex deve usar gasolina ou etanol';
  end if;

  if p_liters is null or p_liters <= 0 then raise exception 'Informe os litros abastecidos'; end if;
  if p_odometer is null or p_odometer <= 0 then raise exception 'Informe o hodômetro'; end if;
  if p_occurred_on is null or p_occurred_on > current_date then raise exception 'Data do abastecimento inválida'; end if;
  if nullif(trim(p_photo_requisition_url), '') is null
     or nullif(trim(p_photo_dashboard_url), '') is null then
    raise exception 'Anexe a requisição e a foto do hodômetro';
  end if;

  select * into station
    from public.fuel_stations
   where id = p_station_id
     and tenant_id = vehicle.tenant_id;

  if p_station_id is not null then
    if station.id is null or not station.is_active then
      raise exception 'Posto ativo não encontrado nesta prefeitura';
    end if;
    if station.contract_start is not null and station.contract_start > current_date then
      raise exception 'O contrato do posto ainda não iniciou';
    end if;
    if station.contract_end is not null and station.contract_end < current_date then
      raise exception 'O contrato do posto está vencido';
    end if;
    select nullif(value, '')::numeric into v_contract_price
      from jsonb_each_text(coalesce(station.fuel_prices, '{}'::jsonb))
     where lower(key) = v_fuel_key
     limit 1;
    if v_contract_price is null or v_contract_price <= 0 then
      raise exception 'Preço deste combustível não cadastrado no contrato do posto';
    end if;
    v_price := v_contract_price;
  else
    if p_price_per_liter is null or p_price_per_liter <= 0 then
      raise exception 'Informe um preço por litro válido';
    end if;
    v_price := p_price_per_liter;
  end if;

  if vehicle.tank_capacity is not null and p_liters > vehicle.tank_capacity * 1.1 then
    v_anomaly := true;
    v_anomaly_note := format(
      'Volume de %s L acima da tolerância do tanque de %s L',
      p_liters,
      vehicle.tank_capacity
    );
  end if;

  select f.odometer into v_previous_odometer
    from public.fuelings f
   where f.vehicle_id = vehicle.id
     and f.workflow_status in ('validado', 'lancado_direto')
     and f.odometer is not null
   order by coalesce(f.filled_at, f.created_at) desc
   limit 1;

  if v_previous_odometer is not null and p_odometer < v_previous_odometer then
    v_anomaly := true;
    v_anomaly_note := concat_ws(
      '; ',
      v_anomaly_note,
      format('Hodômetro regrediu de %s para %s km', v_previous_odometer, p_odometer)
    );
  elsif v_previous_odometer is not null and p_odometer > v_previous_odometer then
    v_km_per_liter := round((p_odometer - v_previous_odometer)::numeric / p_liters, 2);
  end if;

  v_fuel_label := case v_fuel_key
    when 'gasolina' then 'Gasolina'
    when 'etanol' then 'Etanol'
    else 'Diesel'
  end;

  insert into public.fuelings (
    tenant_id,
    vehicle_id,
    driver_id,
    station_id,
    station,
    fuel_type,
    liters,
    price_per_liter,
    total_cost,
    odometer,
    full_tank,
    workflow_status,
    validated_at,
    validated_by,
    authorized_by,
    authorized_at,
    filled_by,
    filled_at,
    photo_requisition_url,
    photo_dashboard_url,
    km_per_liter,
    has_anomaly,
    anomaly_type,
    created_at
  )
  values (
    vehicle.tenant_id,
    vehicle.id,
    p_driver_id,
    station.id,
    coalesce(station.name, nullif(trim(p_station_name), '')),
    v_fuel_label,
    p_liters,
    v_price,
    round(p_liters * v_price, 2),
    p_odometer,
    p_full_tank,
    'lancado_direto',
    now(),
    ctx.profile_id,
    ctx.profile_id,
    now(),
    ctx.profile_id,
    p_occurred_on::timestamp at time zone 'America/Sao_Paulo',
    trim(p_photo_requisition_url),
    trim(p_photo_dashboard_url),
    v_km_per_liter,
    v_anomaly,
    v_anomaly_note,
    p_occurred_on::timestamp at time zone 'America/Sao_Paulo'
  )
  returning id into v_id;

  update public.vehicles
     set current_odometer = greatest(current_odometer, p_odometer)
   where id = vehicle.id;

  return v_id;
end
$$;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'manager_create_fueling_authorization(uuid,uuid,uuid,text,numeric,timestamptz,text)',
    'manager_cancel_fueling_authorization(uuid,text)',
    'manager_review_fueling(uuid,boolean,text)',
    'manager_create_direct_fueling(uuid,uuid,text,numeric,numeric,integer,uuid,text,date,text,text,boolean)'
  ]
  loop
    execute format(
      'revoke all on function public.%s from public, anon; grant execute on function public.%s to authenticated',
      signature,
      signature
    );
  end loop;
end
$$;

comment on function public.manager_create_fueling_authorization(uuid,uuid,uuid,text,numeric,timestamptz,text) is
  'Gestor autoriza abastecimento em posto contratado para veículo e motorista reais.';
comment on function public.manager_review_fueling(uuid,boolean,text) is
  'Gestor valida ou rejeita a execução do posto e atualiza hodômetro/consumo atomicamente.';
comment on function public.manager_create_direct_fueling(uuid,uuid,text,numeric,numeric,integer,uuid,text,date,text,text,boolean) is
  'Lançamento de contingência do gestor com motorista, provas e cálculos validados no servidor.';
