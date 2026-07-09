-- Workflow de manutenção no painel do gestor (APLICADA EM PRODUÇÃO 2026-07-09 via MCP):
-- oficina de destino + orçamento na aprovação, custo final na conclusão,
-- vínculo O.S. ↔ checklist, e status do veículo sincronizado automaticamente
-- (aprovada/em_execucao → manutencao; concluida/rejeitada → liberado se não
-- houver outra O.S. aberta; nunca mexe em veículo 'bloqueado').

alter table public.service_orders
  add column if not exists repair_shop text,
  add column if not exists budget numeric(12,2),
  add column if not exists completed_at timestamptz,
  add column if not exists checklist_id uuid references public.checklists(id) on delete set null;

comment on column public.service_orders.repair_shop is 'Oficina/local para onde o veículo foi enviado para o conserto';
comment on column public.service_orders.budget is 'Orçamento aprovado (R$)';
comment on column public.service_orders.completed_at is 'Quando o serviço foi concluído';
comment on column public.service_orders.checklist_id is 'Checklist que originou a O.S. (quando aberta a partir de um problema de checklist)';

create index if not exists idx_service_orders_checklist on public.service_orders(checklist_id) where checklist_id is not null;

create or replace function public.tf_service_order_vehicle_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'concluida' and new.completed_at is null then
    new.completed_at := now();
  end if;
  if new.vehicle_id is not null then
    if new.status in ('aprovada','em_execucao') then
      update public.vehicles set status = 'manutencao'
        where id = new.vehicle_id and status = 'liberado';
    elsif new.status in ('concluida','rejeitada') then
      if not exists (
        select 1 from public.service_orders so
        where so.vehicle_id = new.vehicle_id and so.id <> new.id
          and so.status in ('aprovada','em_execucao')
      ) then
        update public.vehicles set status = 'liberado'
          where id = new.vehicle_id and status = 'manutencao';
      end if;
    end if;
  end if;
  return new;
end $$;

revoke execute on function public.tf_service_order_vehicle_status() from public, anon, authenticated;

drop trigger if exists trg_service_order_vehicle_status on public.service_orders;
create trigger trg_service_order_vehicle_status
  before insert or update of status on public.service_orders
  for each row execute function public.tf_service_order_vehicle_status();
