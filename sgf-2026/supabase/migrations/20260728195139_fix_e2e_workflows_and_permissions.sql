-- Correções confirmadas pela auditoria E2E de 2026-07-28.
-- Mantém compatibilidade entre o app do motorista e os portais de parceiros.

-- ---------------------------------------------------------------------------
-- 1. Abastecimento: cada origem tem seu próprio conjunto de evidências.
-- ---------------------------------------------------------------------------
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

  -- Execução pelo portal do posto: foto do bico e cupom são obrigatórios.
  if fueling.filled_by is not null
     and (
       nullif(trim(fueling.photo_pump_url), '') is null
       or nullif(trim(fueling.pump_receipt_number), '') is null
     ) then
    raise exception 'Não é possível aprovar o abastecimento do posto sem foto do bico e número do cupom';
  end if;

  -- Registro pelo app: aceita a nota do lançamento direto ou as fotos de
  -- requisição/painel do fluxo autorizado. Assim o gestor consegue revisar o
  -- que o app realmente coleta, sem afrouxar a exigência do portal do posto.
  if fueling.filled_by is null
     and nullif(trim(fueling.photo_url), '') is null
     and nullif(trim(fueling.photo_dashboard_url), '') is null
     and nullif(trim(fueling.photo_requisition_url), '') is null then
    raise exception 'Não é possível aprovar um abastecimento sem evidência fotográfica';
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
  'Gestor valida abastecimento com evidências compatíveis com a origem: portal do posto ou app do motorista.';


-- ---------------------------------------------------------------------------
-- 2. Liberação do veículo após concluir uma viagem.
-- ---------------------------------------------------------------------------
create or replace function public.driver_release_current_vehicle(
  p_vehicle_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_profile record;
begin
  if v_uid is null then
    raise exception 'Sessão inválida' using errcode = '28000';
  end if;

  select id, role, current_vehicle_id, tenant_id
    into v_profile
    from public.profiles
   where id = v_uid
   for update;

  if v_profile.id is null or v_profile.role <> 'motorista' then
    raise exception 'Apenas o motorista pode liberar o próprio veículo'
      using errcode = '42501';
  end if;

  if p_vehicle_id is not null
     and v_profile.current_vehicle_id is distinct from p_vehicle_id then
    raise exception 'O veículo selecionado mudou. Atualize a tela e tente novamente';
  end if;

  if v_profile.current_vehicle_id is not null and exists (
    select 1
      from public.trips t
     where t.driver_id = v_uid
       and t.vehicle_id = v_profile.current_vehicle_id
       and t.status = 'andamento'
  ) then
    raise exception 'Finalize a viagem em andamento antes de liberar o veículo';
  end if;

  update public.profiles
     set current_vehicle_id = null,
         updated_by = v_uid
   where id = v_uid;
  return found;
end
$$;

revoke all on function public.driver_release_current_vehicle(uuid)
  from public, anon;
grant execute on function public.driver_release_current_vehicle(uuid)
  to authenticated;


-- ---------------------------------------------------------------------------
-- 3. Ocorrência do motorista passa a abrir uma OS rastreável.
-- ---------------------------------------------------------------------------
alter table public.service_orders
  add column if not exists issue_id uuid
    references public.issues(id) on delete set null;

create unique index if not exists service_orders_issue_id_key
  on public.service_orders(issue_id)
  where issue_id is not null;

alter table public.service_orders
  drop constraint if exists service_orders_origin_check;
alter table public.service_orders
  add constraint service_orders_origin_check
  check (origin = any (array['driver', 'checklist', 'manager', 'issue']));

create or replace function public.create_service_order_from_issue()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.vehicle_id is null then
    return new;
  end if;

  insert into public.service_orders (
    vehicle_id,
    driver_id,
    category,
    description,
    priority,
    status,
    tenant_id,
    opened_by,
    origin,
    issue_id
  )
  values (
    new.vehicle_id,
    new.driver_id,
    'outro',
    concat_ws(E'\n\n', new.title, nullif(trim(new.description), '')),
    new.severity,
    'pendente',
    new.tenant_id,
    new.driver_id,
    'issue',
    new.id
  )
  on conflict (issue_id) where issue_id is not null do nothing;

  return new;
end
$$;

drop trigger if exists trg_issue_create_service_order on public.issues;
create trigger trg_issue_create_service_order
  after insert on public.issues
  for each row execute function public.create_service_order_from_issue();

comment on column public.service_orders.issue_id is
  'Ocorrência do motorista que originou a OS; evita duplicidade e mantém rastreabilidade.';


-- ---------------------------------------------------------------------------
-- 4. Evidências do bucket privado: parceiro/motorista não apaga nem substitui.
-- ---------------------------------------------------------------------------
drop policy if exists fotos_auth_delete on storage.objects;
drop policy if exists fotos_auth_update on storage.objects;

create policy fotos_management_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'fotos'
  and (
    public.is_superadmin()
    or public.sgf_role() in ('admin', 'gestor')
  )
);

create policy fotos_management_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'fotos'
  and (
    public.is_superadmin()
    or public.sgf_role() in ('admin', 'gestor')
  )
)
with check (
  bucket_id = 'fotos'
  and (
    public.is_superadmin()
    or public.sgf_role() in ('admin', 'gestor')
  )
);


-- ---------------------------------------------------------------------------
-- 5. Contato de suporte configurável por prefeitura.
-- ---------------------------------------------------------------------------
alter table public.tenants
  add column if not exists support_phone text,
  add column if not exists support_email text;

alter table public.tenants
  drop constraint if exists tenants_support_email_format,
  add constraint tenants_support_email_format
    check (
      support_email is null
      or support_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
    );
