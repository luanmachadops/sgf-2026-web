-- Visibilidade do motorista por contexto + autorizações sem motorista definido.
--
-- Regra ("veículo em mãos + direcionado a mim"):
--   1. Tudo do veículo que o motorista está usando (profiles.current_vehicle_id):
--      histórico de abastecimentos, viagens, OS (com linha do tempo), checklists e
--      ocorrências — somente leitura. Rotas GPS de terceiros (trip_locations) NÃO.
--   2. O que é direcionado a ele (driver_id = ele), em qualquer veículo (já existia).
--   3. OS e autorizações de abastecimento SEM motorista: quem estiver com o veículo
--      pode executar; ao agir, a OS fica registrada no nome de quem executou.
-- Ao liberar o veículo, o histórico dele deixa de aparecer.

begin;

-- Troca cirúrgica no corpo de uma função; aborta se o trecho esperado não existir.
create or replace function pg_temp.patch_fn(p_fn regprocedure, p_old text, p_new text)
returns void language plpgsql as $$
declare body text := pg_get_functiondef(p_fn); patched text;
begin
  if strpos(body, p_old) = 0 then
    raise exception 'Trecho não encontrado em %: %', p_fn, left(p_old, 80);
  end if;
  patched := replace(body, p_old, p_new);
  execute patched;
end $$;

-- ─── 1. OS pode existir sem motorista ───────────────────────────────────────
alter table public.service_orders alter column driver_id drop not null;

-- ─── 2. Criação pelo gestor aceita "sem motorista" ──────────────────────────
select pg_temp.patch_fn(
  'sgf_private.rpc_original__manager_create_service_order(uuid,uuid,text,text,text,integer,uuid)',
  E'  if not exists (\n    select 1\n      from public.profiles p\n     where p.id = p_driver_id',
  E'  if p_driver_id is not null and not exists (\n    select 1\n      from public.profiles p\n     where p.id = p_driver_id');
select pg_temp.patch_fn(
  'sgf_private.rpc_original__manager_create_service_order(uuid,uuid,text,text,text,integer,uuid)',
  E'       and c.driver_id = p_driver_id',
  E'       and (p_driver_id is null or c.driver_id = p_driver_id)');

select pg_temp.patch_fn(
  'sgf_private.rpc_original__manager_create_fueling_authorization(uuid,uuid,uuid,text,numeric,timestamp with time zone,text)',
  E'  if not exists (\n    select 1\n      from public.profiles p\n     where p.id = p_driver_id',
  E'  if p_driver_id is not null and not exists (\n    select 1\n      from public.profiles p\n     where p.id = p_driver_id');

select pg_temp.patch_fn(
  'sgf_private.issue_procurement_fueling(uuid,jsonb)',
  'if not exists(select 1 from public.profiles where id=driver and',
  'if driver is not null and not exists(select 1 from public.profiles where id=driver and');

-- ─── 3. Entrega/retirada: quem está com o veículo pode agir na OS sem motorista ──
select pg_temp.patch_fn(
  'sgf_private.rpc_original__driver_update_service_order(uuid,text,text,text)',
  E'     and so_row.driver_id = v_uid\n',
  E'     and (so_row.driver_id = v_uid\n          or (so_row.driver_id is null and so_row.vehicle_id = p.current_vehicle_id))\n');
select pg_temp.patch_fn(
  'sgf_private.rpc_original__driver_update_service_order(uuid,text,text,text)',
  E'    raise exception ''Ordem de serviço não encontrada para este motorista'';\n  end if;\n',
  E'    raise exception ''Ordem de serviço não encontrada para este motorista'';\n  end if;\n\n  -- OS sem motorista: quem executa assume a responsabilidade dali em diante.\n  if so.driver_id is null then\n    update public.service_orders set driver_id = v_uid where id = so.id;\n    so.driver_id := v_uid;\n  end if;\n');

-- ─── 4. Notificações: sem motorista definido → avisa quem está com o veículo ──
select pg_temp.patch_fn(
  'public.tg_notify_service_order()',
  E'    if new.driver_id is not null and new.opened_by is distinct from new.driver_id then',
  E'    if new.driver_id is null then\n      perform public.notify_users(\n        array(select p.id from public.profiles p\n               where p.current_vehicle_id = new.vehicle_id and p.role = ''motorista''\n                 and p.tenant_id = new.tenant_id),\n        ''warning'',\n        ''Manutenção para o veículo que está com você'',\n        v_body,\n        ''/manutencoes'',\n        ''service_order'',\n        new.id\n      );\n    elsif new.opened_by is distinct from new.driver_id then');
select pg_temp.patch_fn(
  'public.tg_notify_service_order()',
  E'    if new.driver_id is distinct from old.driver_id and new.driver_id is not null then',
  -- Quem assumiu a OS ao executar não recebe "direcionada para você" de si mesmo.
  E'    if new.driver_id is distinct from old.driver_id and new.driver_id is not null\n       and new.driver_id is distinct from auth.uid() then');
select pg_temp.patch_fn(
  'public.tg_notify_service_order()',
  E'    elsif new.operational_status is distinct from old.operational_status\n          and new.driver_id is not null then',
  E'    elsif new.operational_status is distinct from old.operational_status then');
select pg_temp.patch_fn(
  'public.tg_notify_service_order()',
  E'      perform public.notify_users(\n        array[new.driver_id],\n        v_type,',
  E'      perform public.notify_users(\n        case when new.driver_id is not null then array[new.driver_id]\n             else array(select p.id from public.profiles p\n                         where p.current_vehicle_id = new.vehicle_id and p.role = ''motorista''\n                           and p.tenant_id = new.tenant_id) end,\n        v_type,');

select pg_temp.patch_fn(
  'public.tg_notify_fueling()',
  E'    elsif new.workflow_status = ''concluido'' then\n      perform public.notify_admins(',
  E'    elsif new.workflow_status = ''autorizado'' and new.driver_id is null then\n      perform public.notify_users(\n        array(select p.id from public.profiles p\n               where p.current_vehicle_id = new.vehicle_id and p.role = ''motorista''\n                 and p.tenant_id = new.tenant_id),\n        ''warning'',\n        ''Abastecimento autorizado para o veículo'',\n        v_body,\n        ''/abastecimentos'',\n        ''fueling'',\n        new.id\n      );\n    elsif new.workflow_status = ''concluido'' then\n      perform public.notify_admins(');

-- ─── 5. Leitura por contexto: o veículo que o motorista está usando ─────────
-- (select …) faz o Postgres avaliar a função uma vez por consulta, não por linha.
create policy service_orders_motorista_current_vehicle_select on public.service_orders
  for select to authenticated
  using (is_motorista() and tenant_id = (select get_user_tenant_id())
         and vehicle_id = (select get_user_current_vehicle_id()));

create policy events_motorista_current_vehicle_select on public.service_order_events
  for select to authenticated
  using (is_motorista() and exists (
    select 1 from public.service_orders so
     where so.id = service_order_events.service_order_id
       and so.tenant_id = service_order_events.tenant_id
       and so.vehicle_id = (select get_user_current_vehicle_id())));

create policy fuelings_motorista_current_vehicle_select on public.fuelings
  for select to authenticated
  using (is_motorista() and tenant_id = (select get_user_tenant_id())
         and vehicle_id = (select get_user_current_vehicle_id()));

create policy trips_motorista_current_vehicle_select on public.trips
  for select to authenticated
  using (is_motorista() and tenant_id = (select get_user_tenant_id())
         and vehicle_id = (select get_user_current_vehicle_id()));

create policy checklists_motorista_current_vehicle_select on public.checklists
  for select to authenticated
  using (is_motorista() and tenant_id = (select get_user_tenant_id())
         and vehicle_id = (select get_user_current_vehicle_id()));

create policy checklist_items_motorista_current_vehicle_select on public.checklist_items
  for select to authenticated
  using (is_motorista() and exists (
    select 1 from public.checklists c
     where c.id = checklist_items.checklist_id
       and c.vehicle_id = (select get_user_current_vehicle_id())));

create policy issues_motorista_current_vehicle_select on public.issues
  for select to authenticated
  using (is_motorista() and tenant_id = (select get_user_tenant_id())
         and vehicle_id = (select get_user_current_vehicle_id()));

-- ─── 6. Nomes no histórico do veículo (só o nome; nada de CPF/telefone) ──────
create or replace function public.get_current_vehicle_people()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = '' as $$
  with me as (
    select p.tenant_id, p.current_vehicle_id
      from public.profiles p
     where p.id = auth.uid() and p.role = 'motorista' and p.current_vehicle_id is not null
  ), ids as (
    select driver_id from public.trips t, me where t.vehicle_id = me.current_vehicle_id
    union select driver_id from public.fuelings f, me where f.vehicle_id = me.current_vehicle_id
    union select driver_id from public.service_orders s, me where s.vehicle_id = me.current_vehicle_id
    union select driver_id from public.checklists c, me where c.vehicle_id = me.current_vehicle_id
  )
  select p.id, p.full_name
    from public.profiles p, me
   where p.id in (select driver_id from ids where driver_id is not null)
     and p.tenant_id = me.tenant_id;
$$;
revoke all on function public.get_current_vehicle_people() from public, anon;
grant execute on function public.get_current_vehicle_people() to authenticated;

commit;
