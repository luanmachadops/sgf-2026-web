-- Vincula o checklist do dia à viagem recém-iniciada pelo motorista.
--
-- O app fazia `UPDATE checklists SET trip_id = ...` direto, mas `checklists`
-- não tem política PERMISSIVE de UPDATE para o motorista (só as RESTRICTIVE
-- active_session_*). O UPDATE afetava 0 linhas em silêncio: nenhum checklist
-- de produção tinha trip_id. Em vez de abrir UPDATE na tabela (o motorista
-- poderia reescrever itens/estado do checklist), uma RPC que só preenche o
-- trip_id do checklist certo.

create or replace function public.link_checklist_to_trip(p_trip_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_trip record;
  v_checklist uuid;
begin
  select t.id, t.driver_id, t.vehicle_id, t.start_at
    into v_trip
    from public.trips t
   where t.id = p_trip_id
     and t.driver_id = auth.uid();

  if not found then
    raise exception 'Viagem não encontrada para este motorista.' using errcode = '42501';
  end if;

  -- Checklist do mesmo motorista e veículo, do dia da viagem, feito antes do
  -- início e ainda sem viagem — o mesmo critério que a guarda TR007 usa.
  select c.id
    into v_checklist
    from public.checklists c
   where c.driver_id = v_trip.driver_id
     and c.vehicle_id = v_trip.vehicle_id
     and c.trip_id is null
     and c.created_at >= date_trunc('day', v_trip.start_at)
     and c.created_at <= v_trip.start_at
   order by c.created_at desc
   limit 1;

  if v_checklist is null then
    return null;
  end if;

  update public.checklists
     set trip_id = p_trip_id
   where id = v_checklist;

  return v_checklist;
end;
$$;

revoke all on function public.link_checklist_to_trip(uuid) from public, anon;
grant execute on function public.link_checklist_to_trip(uuid) to authenticated;

comment on function public.link_checklist_to_trip(uuid) is
  'Motorista vincula o checklist do dia (feito antes do início) à viagem que acabou de iniciar. Só preenche checklists.trip_id.';
