-- Linha do tempo: traduz também os códigos de alarme que a sincronização do
-- rastreador grava (speeding, low_battery, power_cut, vibration, tow, sos,
-- idle, parking_timeout, cerca virtual), além dos já tratados.

create or replace function public.get_trip_timeline(p_trip_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  t record;
  v_end timestamptz;
  v_events jsonb := '[]'::jsonb;
  p record;
  a_lat double precision;
  a_lng double precision;
  a_at timestamptz;
  last_at timestamptz;
  v_stop_end timestamptz;
  v_min integer;
  v_engine text;
  v_stop_total integer := 0;
  v_idle_total integer := 0;
  v_on integer := 0;
  v_off integer := 0;
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role' is distinct from 'service_role' then
    perform public.check_current_access();
  end if;

  select tr.*, v.plate, coalesce(nullif(trim(concat_ws(' ', v.brand, v.model)), ''), 'Veículo') as vehicle_name
    into t
    from public.trips tr
    left join public.vehicles v on v.id = tr.vehicle_id
   where tr.id = p_trip_id;
  if not found then
    raise exception 'Viagem não encontrada' using errcode = 'P0002';
  end if;
  if not (
    t.driver_id = auth.uid()
    or public.is_superadmin()
    or (public.is_admin_or_manager() and t.tenant_id = public.get_user_tenant_id())
  ) then
    raise exception 'Sem acesso a esta viagem' using errcode = '42501';
  end if;

  v_end := coalesce(t.end_at, now());

  -- Início e fim.
  v_events := v_events || jsonb_build_object(
    'at', t.start_at, 'kind', 'trip_start', 'severity', 'info', 'source', 'driver',
    'title', 'Viagem iniciada',
    'detail', concat_ws(' · ', nullif(t.destination, ''), case when t.start_odometer is not null then 'hodômetro ' || replace(to_char(t.start_odometer, 'FM999,999,999'), ',', '.') || ' km' end));
  if t.end_at is not null then
    v_events := v_events || jsonb_build_object(
      'at', t.end_at, 'kind', 'trip_end', 'severity', 'info', 'source', 'driver',
      'title', case when t.status::text = 'cancelada' then 'Viagem cancelada' else 'Viagem encerrada' end,
      'detail', case when t.end_odometer is not null then 'hodômetro ' || replace(to_char(t.end_odometer, 'FM999,999,999'), ',', '.') || ' km' end);
  end if;

  -- Checklist e ocorrências do motorista.
  v_events := v_events || coalesce((
    select jsonb_agg(jsonb_build_object(
      'at', c.created_at, 'kind', 'checklist', 'severity', 'info', 'source', 'driver',
      'title', 'Checklist realizado', 'detail', nullif(c.notes, '')))
      from public.checklists c where c.trip_id = t.id), '[]'::jsonb);
  v_events := v_events || coalesce((
    select jsonb_agg(jsonb_build_object(
      'at', i.created_at, 'kind', 'issue',
      'severity', case when i.severity::text in ('alta', 'critica', 'high', 'critical') then 'critical' else 'warning' end,
      'source', 'driver', 'title', 'Ocorrência: ' || coalesce(nullif(i.title, ''), 'sem título'), 'detail', nullif(i.description, '')))
      from public.issues i where i.trip_id = t.id), '[]'::jsonb);

  -- Abastecimentos durante a viagem.
  v_events := v_events || coalesce((
    select jsonb_agg(jsonb_build_object(
      'at', coalesce(f.filled_at, f.created_at), 'kind', 'fueling', 'severity', 'info', 'source', 'driver',
      'title', 'Abastecimento',
      'detail', concat_ws(' · ', nullif(f.station, ''),
                          case when f.liters > 0 then replace(f.liters::text, '.', ',') || ' L' end,
                          nullif(f.fuel_type, ''))))
      from public.fuelings f
     where f.cancelled_at is null
       and f.filled_at is not null
       and (f.trip_id = t.id
            or (f.trip_id is null and f.vehicle_id = t.vehicle_id and f.filled_at between t.start_at and v_end))), '[]'::jsonb);

  -- Alarmes do rastreador do veículo no intervalo da viagem.
  if t.vehicle_id is not null then
    v_events := v_events || coalesce((
      select jsonb_agg(jsonb_build_object(
        'at', coalesce(a.gps_time, a.created_at), 'kind', 'alarm_' || a.alarm_type, 'source', 'tracker',
        'lat', a.lat, 'lng', a.lng,
        'severity', case a.alarm_type
            when 'crash' then 'critical' when 'turnover' then 'critical' when 'remove' then 'critical'
            when 'shake' then 'warning' when 'fastacceleration' then 'warning' when 'fastdeceleration' then 'warning'
            when 'overspeed' then 'warning' when 'lowvoltage' then 'warning' when 'poweroff' then 'warning'
            when 'sos' then 'critical' when 'tow' then 'critical' when 'power_cut' then 'critical'
            when 'speeding' then 'warning' when 'vibration' then 'warning' when 'low_battery' then 'warning'
            when 'idle' then 'warning' when 'parking_timeout' then 'warning'
            else 'info' end,
        'title', case a.alarm_type
            when 'crash' then 'Colisão detectada'
            when 'turnover' then 'Capotamento detectado'
            when 'shake' then 'Impacto / vibração forte'
            when 'fastacceleration' then 'Aceleração brusca'
            when 'fastdeceleration' then 'Frenagem brusca'
            when 'overspeed' then 'Excesso de velocidade'
            when 'acc_on' then 'Motor ligado'
            when 'acc_off' then 'Motor desligado'
            when 'remove' then 'Rastreador removido / violado'
            when 'lowvoltage' then 'Bateria baixa'
            when 'poweroff' then 'Rastreador sem energia'
            when 'power_cut' then 'Alimentação do rastreador cortada'
            when 'sos' then 'Botão de pânico (SOS)'
            when 'tow' then 'Veículo rebocado / movido desligado'
            when 'speeding' then 'Excesso de velocidade'
            when 'vibration' then 'Impacto / vibração forte'
            when 'low_battery' then 'Bateria baixa'
            when 'idle' then 'Motor ligado com veículo parado'
            when 'parking_timeout' then 'Estacionado além do tempo'
            when 'geofence_in' then 'Entrou em cerca virtual'
            when 'geofence_out' then 'Saiu de cerca virtual'
            else 'Alarme do rastreador (' || a.alarm_type || ')' end,
        'detail', case when a.speed is not null and a.speed > 0 then round(a.speed)::text || ' km/h' end))
        from public.device_alarms a
       where a.vehicle_id = t.vehicle_id
         and coalesce(a.gps_time, a.created_at) between t.start_at and v_end), '[]'::jsonb);
  end if;

  -- Paradas pelos pontos de GPS (rastreador ou celular).
  for p in
    select l.lat, l.lng, l.recorded_at, l.ignition
      from public.trip_locations l
     where l.trip_id = t.id and l.lat is not null and l.lng is not null
     order by l.recorded_at
  loop
    if a_at is null then
      a_lat := p.lat; a_lng := p.lng; a_at := p.recorded_at;
    elsif public.approx_distance_m(a_lat, a_lng, p.lat, p.lng) > 150 then
      -- O celular economiza bateria e quase não manda ponto com o veículo
      -- parado: um silêncio longo seguido de um ponto distante é parada, não
      -- deslocamento lento. Desconta o tempo de ir até o novo ponto (30 km/h).
      v_stop_end := greatest(last_at, p.recorded_at - make_interval(secs => public.approx_distance_m(a_lat, a_lng, p.lat, p.lng) / 8.3));
      v_min := floor(extract(epoch from (v_stop_end - a_at)) / 60);
      if v_min >= 5 then
        v_engine := case
          when v_on + v_off = 0 then sgf_private.trip_engine_state(t.vehicle_id, a_at, v_stop_end)
          when v_on >= v_off then 'on' else 'off' end;
        v_events := v_events || jsonb_build_object(
          'at', a_at, 'ended_at', v_stop_end, 'duration_min', v_min, 'kind', 'stop', 'lat', a_lat, 'lng', a_lng,
          'source', 'gps', 'engine', v_engine,
          'severity', case when v_engine = 'on' and v_min >= 10 then 'warning' else 'info' end,
          'title', case v_engine when 'on' then 'Parado com motor ligado' when 'off' then 'Parado com motor desligado' else 'Parado' end);
        v_stop_total := v_stop_total + v_min;
        if v_engine = 'on' then v_idle_total := v_idle_total + v_min; end if;
      end if;
      a_lat := p.lat; a_lng := p.lng; a_at := p.recorded_at;
      v_on := 0; v_off := 0;
    end if;
    -- Ignição dos pontos do rastreador dentro da parada atual.
    if p.ignition is true then v_on := v_on + 1; elsif p.ignition is false then v_off := v_off + 1; end if;
    last_at := p.recorded_at;
  end loop;

  -- Última parada: do último deslocamento até o fim (ou até agora, se aberta).
  -- O celular economiza bateria e para de mandar pontos quando o veículo não
  -- anda, então o silêncio no fim também conta como parado.
  if a_at is not null then
    v_min := floor(extract(epoch from (v_end - a_at)) / 60);
    if v_min >= 5 then
      v_engine := case
        when v_on + v_off = 0 then sgf_private.trip_engine_state(t.vehicle_id, a_at, v_end)
        when v_on >= v_off then 'on' else 'off' end;
      v_events := v_events || jsonb_build_object(
        'at', a_at, 'ended_at', case when t.end_at is not null then v_end end, 'duration_min', v_min,
        'kind', 'stop', 'lat', a_lat, 'lng', a_lng, 'source', 'gps', 'engine', v_engine, 'ongoing', t.end_at is null,
        'severity', case when v_min >= 30 or (v_engine = 'on' and v_min >= 10) then 'warning' else 'info' end,
        'title', case
          when t.end_at is null then 'Parado agora, com a viagem aberta'
          else case v_engine when 'on' then 'Parado com motor ligado' when 'off' then 'Parado com motor desligado' else 'Parado com a viagem aberta' end
        end);
      v_stop_total := v_stop_total + v_min;
      if v_engine = 'on' then v_idle_total := v_idle_total + v_min; end if;
    end if;
  end if;

  -- Lembretes enviados pelo vigia de viagem ao motorista.
  v_events := v_events || coalesce((
    select jsonb_agg(jsonb_build_object(
      'at', n.created_at, 'kind', 'reminder', 'source', 'system',
      'severity', case when n.type = 'alert' then 'warning' else 'info' end,
      'title', 'Lembrete enviado: ' || n.title, 'detail', n.body))
      from public.notifications n
     where n.entity_id = t.id and n.entity_type = 'trip_close' and n.driver_id = t.driver_id), '[]'::jsonb);

  -- Alertas de motor ligado com veículo parado, gerados pela sincronização do
  -- rastreador (iopgps-sync) durante a viagem.
  v_events := v_events || coalesce((
    select jsonb_agg(jsonb_build_object(
      'at', n.created_at, 'kind', 'idle_alert', 'source', 'tracker', 'severity', 'warning',
      'title', n.title, 'detail', n.body))
      from public.notifications n
     where n.entity_type = 'vehicle' and n.entity_id = t.vehicle_id
       and n.driver_id = t.driver_id
       and n.title = 'Motor ligado com veículo parado'
       and n.created_at between t.start_at and v_end), '[]'::jsonb);

  return jsonb_build_object(
    'trip_id', t.id,
    'stopped_minutes', v_stop_total,
    'idle_engine_minutes', v_idle_total,
    'has_tracker_data', exists (select 1 from public.trip_locations l where l.trip_id = t.id and l.ignition is not null)
                        or exists (select 1 from public.device_alarms a where a.vehicle_id = t.vehicle_id and coalesce(a.gps_time, a.created_at) between t.start_at and v_end),
    'events', coalesce((select jsonb_agg(e order by (e->>'at')::timestamptz) from jsonb_array_elements(v_events) e), '[]'::jsonb)
  );
end;
$$;
