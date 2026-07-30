-- Permissões operacionais por papel:
--   • admin/gestor: todo o tenant;
--   • secretário: somente veículos da própria secretaria;
--   • superadmin: acesso global.
--
-- As RPCs gerenciais são SECURITY DEFINER. Portanto, liberar o secretário no
-- contexto sem uma segunda trava permitiria operar uma linha de outra
-- secretaria informando um UUID conhecido. O trigger abaixo é essa defesa em
-- profundidade e vale para todas as RPCs atuais e futuras que alterem os dois
-- agregados operacionais centrais.

create or replace function public.service_order_manager_context()
returns table (
  profile_id uuid,
  tenant_id uuid,
  superadmin boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return query
    select p.id, p.tenant_id, p.role = 'superadmin'
      from public.profiles p
     where p.id = auth.uid()
       and p.role in ('admin', 'gestor', 'secretario', 'superadmin')
       and not coalesce(p.access_blocked, false);

  if not found then
    raise exception 'Ação restrita à gestão da frota';
  end if;
end
$$;

revoke all on function public.service_order_manager_context()
  from public, anon, authenticated;

create or replace function public.tf_guard_secretario_vehicle_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor record;
  target_vehicle_id uuid;
begin
  select p.tenant_id, p.department_id
    into actor
    from public.profiles p
   where p.id = auth.uid()
     and p.role = 'secretario'
     and not coalesce(p.access_blocked, false);

  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  target_vehicle_id := case when tg_op = 'DELETE' then old.vehicle_id else new.vehicle_id end;
  if target_vehicle_id is null
     or not exists (
       select 1
         from public.vehicles v
        where v.id = target_vehicle_id
          and v.tenant_id = actor.tenant_id
          and v.department_id = actor.department_id
     ) then
    raise exception 'Você só pode operar veículos da sua secretaria';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end
$$;

revoke all on function public.tf_guard_secretario_vehicle_scope()
  from public, anon, authenticated;

drop trigger if exists trg_fuelings_secretario_vehicle_scope on public.fuelings;
create trigger trg_fuelings_secretario_vehicle_scope
  before insert or update or delete on public.fuelings
  for each row execute function public.tf_guard_secretario_vehicle_scope();

drop trigger if exists trg_service_orders_secretario_vehicle_scope on public.service_orders;
create trigger trg_service_orders_secretario_vehicle_scope
  before insert or update or delete on public.service_orders
  for each row execute function public.tf_guard_secretario_vehicle_scope();

-- O modal fiscal lê tabelas filhas diretamente. O secretário ganha somente
-- SELECT e apenas quando a OS pertence a um veículo da sua secretaria; todas
-- as mutações continuam passando pelas RPCs atômicas.
create policy quotes_secretario_select
on public.service_order_quotes for select
to authenticated
using (
  is_secretario()
  and tenant_id = get_user_tenant_id()
  and exists (
    select 1
      from public.service_orders so
      join public.vehicles v on v.id = so.vehicle_id
     where so.id = service_order_quotes.service_order_id
       and so.tenant_id = get_user_tenant_id()
       and v.department_id = get_user_department_id()
  )
);

create policy quote_items_secretario_select
on public.service_order_quote_items for select
to authenticated
using (
  is_secretario()
  and exists (
    select 1
      from public.service_order_quotes q
      join public.service_orders so on so.id = q.service_order_id
      join public.vehicles v on v.id = so.vehicle_id
     where q.id = service_order_quote_items.quote_id
       and q.tenant_id = get_user_tenant_id()
       and v.department_id = get_user_department_id()
  )
);

create policy invoices_secretario_select
on public.service_order_invoices for select
to authenticated
using (
  is_secretario()
  and tenant_id = get_user_tenant_id()
  and exists (
    select 1
      from public.service_orders so
      join public.vehicles v on v.id = so.vehicle_id
     where so.id = service_order_invoices.service_order_id
       and v.department_id = get_user_department_id()
  )
);

create policy payments_secretario_select
on public.service_order_payments for select
to authenticated
using (
  is_secretario()
  and tenant_id = get_user_tenant_id()
  and exists (
    select 1
      from public.service_orders so
      join public.vehicles v on v.id = so.vehicle_id
     where so.id = service_order_payments.service_order_id
       and v.department_id = get_user_department_id()
  )
);

create policy events_secretario_select
on public.service_order_events for select
to authenticated
using (
  is_secretario()
  and tenant_id = get_user_tenant_id()
  and exists (
    select 1
      from public.service_orders so
      join public.vehicles v on v.id = so.vehicle_id
     where so.id = service_order_events.service_order_id
       and v.department_id = get_user_department_id()
  )
);

-- Exclusão confirmada no servidor. A placa não é só uma confirmação visual:
-- a RPC a compara novamente, impedindo que uma chamada direta burle o modal.
create or replace function public.manager_delete_vehicle(
  p_vehicle_id uuid,
  p_plate_confirmation text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor record;
  vehicle record;
begin
  select p.role, p.tenant_id
    into actor
    from public.profiles p
   where p.id = auth.uid()
     and p.role in ('admin', 'gestor', 'superadmin')
     and not coalesce(p.access_blocked, false);

  if not found then
    raise exception 'Apenas administradores, gestores e superadministradores podem excluir veículos';
  end if;

  select v.id, v.plate, v.tenant_id
    into vehicle
    from public.vehicles v
   where v.id = p_vehicle_id
     and (actor.role = 'superadmin' or v.tenant_id = actor.tenant_id)
   for update;

  if not found then
    raise exception 'Veículo não encontrado ou fora da sua prefeitura';
  end if;

  if regexp_replace(upper(coalesce(p_plate_confirmation, '')), '[^A-Z0-9]', '', 'g')
     <> regexp_replace(upper(coalesce(vehicle.plate, '')), '[^A-Z0-9]', '', 'g') then
    raise exception 'A placa informada não confere';
  end if;

  if exists (
    select 1 from public.profiles p where p.current_vehicle_id = vehicle.id
  ) or exists (
    select 1 from public.trips t where t.vehicle_id = vehicle.id and t.end_at is null
  ) then
    raise exception 'Desvincule o veículo e finalize a viagem ativa antes de excluí-lo';
  end if;

  delete from public.vehicles where id = vehicle.id;
exception
  when foreign_key_violation then
    raise exception 'Este veículo possui registros operacionais que exigem preservação e não pode ser excluído';
end
$$;

revoke all on function public.manager_delete_vehicle(uuid, text)
  from public, anon;
grant execute on function public.manager_delete_vehicle(uuid, text)
  to authenticated;

comment on function public.manager_delete_vehicle(uuid, text) is
  'Exclui veículo com confirmação de placa; permitido a admin/gestor no tenant e superadmin global.';
