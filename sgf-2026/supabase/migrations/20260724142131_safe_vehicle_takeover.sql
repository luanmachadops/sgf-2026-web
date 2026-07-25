-- Encerra a viagem anterior e transfere o veículo em uma única transação.
-- A função não confia em IDs de motorista/tenant enviados pelo cliente:
-- ambos são obtidos da sessão autenticada.
create or replace function public.takeover_vehicle(p_vehicle_id uuid)
returns table (
  success boolean,
  ended_trip_id uuid,
  previous_driver_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  caller_tenant_id uuid;
  active_trip_id uuid;
  active_driver_id uuid;
  active_driver_name text;
begin
  if caller_id is null then
    raise exception 'Não autenticado';
  end if;

  select p.tenant_id
    into caller_tenant_id
    from public.profiles p
   where p.id = caller_id
     and p.role::text = 'motorista';

  if caller_tenant_id is null then
    raise exception 'Apenas motoristas autenticados podem assumir um veículo';
  end if;

  if not exists (
    select 1
      from public.vehicles v
     where v.id = p_vehicle_id
       and v.tenant_id = caller_tenant_id
  ) then
    raise exception 'Veículo não encontrado para esta organização';
  end if;

  select t.id, t.driver_id, p.full_name
    into active_trip_id, active_driver_id, active_driver_name
    from public.trips t
    join public.profiles p on p.id = t.driver_id
   where t.vehicle_id = p_vehicle_id
     and t.tenant_id = caller_tenant_id
     and t.status = 'andamento'
   order by t.start_at desc
   limit 1
   for update of t;

  if active_trip_id is null then
    update public.profiles
       set current_vehicle_id = p_vehicle_id
     where id = caller_id
       and tenant_id = caller_tenant_id;
    return query select true, null::uuid, null::text;
    return;
  end if;

  if active_driver_id = caller_id then
    raise exception 'Você já possui uma viagem ativa com este veículo';
  end if;

  update public.trips
     set end_at = now(),
         status = 'concluida',
         notes = concat_ws(
           E'\n',
           nullif(notes, ''),
           'Viagem encerrada automaticamente após confirmação de takeover por outro motorista.'
         )
   where id = active_trip_id
     and status = 'andamento';

  update public.live_positions
     set is_active = false,
         updated_at = now()
   where driver_id = active_driver_id
     and trip_id = active_trip_id;

  update public.profiles
     set current_vehicle_id = null
   where tenant_id = caller_tenant_id
     and current_vehicle_id = p_vehicle_id
     and id <> caller_id;

  update public.profiles
     set current_vehicle_id = p_vehicle_id
   where id = caller_id
     and tenant_id = caller_tenant_id;

  return query select true, active_trip_id, active_driver_name;
end;
$$;

revoke all on function public.takeover_vehicle(uuid) from public;
revoke all on function public.takeover_vehicle(uuid) from anon;
grant execute on function public.takeover_vehicle(uuid) to authenticated;
