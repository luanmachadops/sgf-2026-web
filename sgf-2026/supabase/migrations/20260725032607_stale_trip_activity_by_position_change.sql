-- Correção do critério de "viagem abandonada".
--
-- O sync do rastreador (IOPGPS, cron de 1 min) reinsere o último payload a cada
-- minuto: mesma lat/lng e velocidade congelada. Por isso nem "recebeu ponto"
-- nem "speed > 0" servem como sinal de vida — uma viagem esquecida com o
-- veículo na garagem parecia ativa para sempre.
--
-- Sinal confiável: a última vez que a POSIÇÃO mudou (arredondada a ~11 m).
drop function if exists public.trip_moving_speed_kmh();

create or replace function public.trip_last_activity_at(p_trip_id uuid, p_start_at timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ultimo as (
    select round(lat::numeric, 4) as lat, round(lng::numeric, 4) as lng
      from public.trip_locations
     where trip_id = p_trip_id
     order by recorded_at desc
     limit 1
  )
  select greatest(
    p_start_at,
    coalesce(
      (select max(tl.recorded_at)
         from public.trip_locations tl, ultimo u
        where tl.trip_id = p_trip_id
          and (round(tl.lat::numeric, 4), round(tl.lng::numeric, 4)) is distinct from (u.lat, u.lng)),
      p_start_at)
  );
$$;
