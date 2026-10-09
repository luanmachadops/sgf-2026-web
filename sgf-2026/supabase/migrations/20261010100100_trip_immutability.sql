-- =====================================================================
-- Viagens imutaveis: nunca apagadas; canceladas ou retificadas com motivo.
-- Depende de 20261010100000_trip_status_cancelada.sql (enum ja commitado).
-- Auditoria previa: nenhuma funcao, cron ou codigo (web, admin, app) apaga
-- trips/checklists/checklist_items/fuelings/trip_locations. FKs: vehicles ->
-- trips e SET NULL (UPDATE, nao DELETE); profiles -> trips e RESTRICT;
-- tenants -> trips nao tem cascade. Unica via de DELETE em cascata e
-- trips -> trip_locations / checklists -> checklist_items, tambem barrada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Colunas de cancelamento + CHECK (0 linhas 'cancelada' hoje: valida direto)
-- ---------------------------------------------------------------------
alter table public.trips
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancelled_by  uuid references public.profiles(id),
  add column if not exists cancel_reason text;

alter table public.trips drop constraint if exists trips_cancel_reason_chk;
alter table public.trips add constraint trips_cancel_reason_chk check (
  status <> 'cancelada'::public.trip_status
  or (cancelled_at is not null
      and cancel_reason is not null
      and length(btrim(cancel_reason)) >= 10)
);

-- ---------------------------------------------------------------------
-- 2) Remove as policies PERMISSIVE de DELETE (sem policy permissive, o RLS
--    nega DELETE a qualquer usuario authenticated).
--    As 'active_session_delete' sao RESTRICTIVE: so restringem (AND) as
--    permissivas, nunca concedem acesso. Sem permissiva elas ficam inertes;
--    mantidas de proposito (padrao do projeto, nao reabrem nada).
--    checklists, checklist_items e trip_locations ja nao tem DELETE permissivo.
-- ---------------------------------------------------------------------
drop policy if exists trips_admin_delete    on public.trips;
drop policy if exists fuelings_admin_delete on public.fuelings;

-- ---------------------------------------------------------------------
-- 3) Trigger BEFORE DELETE bloqueando exclusao (vale tambem p/ service_role
--    e para DELETE em cascata). Excecao controlada: sessao com
--    set_config('app.allow_hard_delete','on', true) -- uso exclusivo de
--    manutencao/funcao de exclusao de tenant (hoje inexistente).
-- ---------------------------------------------------------------------
create or replace function public.tf_block_trip_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.allow_hard_delete', true), '') = 'on' then
    return old;
  end if;
  raise exception 'TRIP_IMMUTABLE: registros de viagem (%) nao podem ser apagados. Cancele a viagem ou registre uma retificacao com motivo.', tg_table_name
    using errcode = 'P0001';
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['trips','checklists','checklist_items','fuelings','trip_locations'] loop
    execute format('drop trigger if exists trg_block_delete on public.%I', t);
    execute format('create trigger trg_block_delete before delete on public.%I
                    for each row execute function public.tf_block_trip_delete()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4) Guarda de UPDATE: status 'cancelada' so via RPC (GUC app.trip_rpc) e
--    viagem cancelada fica congelada. vehicle_id e ignorado na comparacao
--    porque a FK vehicles ON DELETE SET NULL precisa continuar funcionando.
-- ---------------------------------------------------------------------
create or replace function public.tf_trip_cancel_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_rpc boolean := coalesce(current_setting('app.trip_rpc', true), '') = 'on';
begin
  if v_rpc then
    return new;
  end if;
  if new.status = 'cancelada'::public.trip_status
     and old.status is distinct from 'cancelada'::public.trip_status then
    raise exception 'TRIP_IMMUTABLE: use manager_cancel_trip para cancelar viagens.' using errcode = 'P0001';
  end if;
  if old.status = 'cancelada'::public.trip_status
     and (to_jsonb(new) - 'vehicle_id' - 'updated_at') is distinct from (to_jsonb(old) - 'vehicle_id' - 'updated_at') then
    raise exception 'TRIP_IMMUTABLE: viagem cancelada nao pode ser alterada.' using errcode = 'P0001';
  end if;
  -- Viagem concluida tambem congela: correcoes so via manager_correct_trip
  -- (com motivo em trip_corrections). Todos os UPDATEs legitimos atuais
  -- (endTrip/forceEndTrip no app, takeover, release_stale_trip,
  -- auto_close_abandoned_trips) partem de status 'andamento'.
  if old.status = 'concluida'::public.trip_status
     and (to_jsonb(new) - 'vehicle_id' - 'updated_at') is distinct from (to_jsonb(old) - 'vehicle_id' - 'updated_at') then
    raise exception 'TRIP_IMMUTABLE: viagem concluida so pode ser alterada por retificacao (manager_correct_trip).' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trip_cancel_guard on public.trips;
create trigger trg_trip_cancel_guard before update on public.trips
  for each row execute function public.tf_trip_cancel_guard();

-- ---------------------------------------------------------------------
-- 5) Tabela de retificacoes (somente leitura para clientes; escrita so via RPC)
-- ---------------------------------------------------------------------
create table if not exists public.trip_corrections (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default public.get_user_tenant_id() references public.tenants(id),
  trip_id      uuid not null references public.trips(id),
  field        text not null,
  old_value    text,
  new_value    text,
  reason       text not null check (length(btrim(reason)) >= 10),
  corrected_by uuid default auth.uid() references public.profiles(id),
  corrected_at timestamptz not null default now()
);
create index if not exists trip_corrections_trip_idx   on public.trip_corrections (trip_id, corrected_at desc);
create index if not exists trip_corrections_tenant_idx on public.trip_corrections (tenant_id, corrected_at desc);

alter table public.trip_corrections enable row level security;

drop policy if exists trip_corrections_manager_select on public.trip_corrections;
create policy trip_corrections_manager_select on public.trip_corrections
  for select to authenticated
  using (public.is_superadmin() or (public.is_admin_or_manager() and tenant_id = public.get_user_tenant_id()));

drop policy if exists trip_corrections_secretario_select on public.trip_corrections;
create policy trip_corrections_secretario_select on public.trip_corrections
  for select to authenticated
  using (
    public.is_secretario() and tenant_id = public.get_user_tenant_id()
    and exists (select 1 from public.trips t join public.vehicles v on v.id = t.vehicle_id
                where t.id = trip_corrections.trip_id and v.department_id = public.get_user_department_id())
  );

revoke all on public.trip_corrections from anon, authenticated;
grant select on public.trip_corrections to authenticated;

-- Correcoes tambem sao imutaveis (nem o dono apaga/edita por engano).
create or replace function public.tf_trip_corrections_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('app.allow_hard_delete', true), '') = 'on' then
    return old;
  end if;
  raise exception 'TRIP_IMMUTABLE: retificacoes nao podem ser alteradas nem apagadas.' using errcode = 'P0001';
end $$;
drop trigger if exists trg_trip_corrections_immutable on public.trip_corrections;
create trigger trg_trip_corrections_immutable before update or delete on public.trip_corrections
  for each row execute function public.tf_trip_corrections_immutable();

-- Auditoria no activity_log (mesmo padrao dos demais; tenant vem da linha).
drop trigger if exists trg_activity_trip_corrections on public.trip_corrections;
create trigger trg_activity_trip_corrections after insert on public.trip_corrections
  for each row execute function public.tf_activity_log('trip_correction');

-- ---------------------------------------------------------------------
-- 6a) RPC: cancelar viagem (nunca apaga)
-- ---------------------------------------------------------------------
create or replace function public.manager_cancel_trip(p_trip_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform public.check_current_access();
  if not sgf_private.resource_allowed('trips', true) then
    raise exception 'Módulo não autorizado para este acesso' using errcode = '42501';
  end if;
  if not public.is_admin_or_manager() then
    raise exception 'Apenas admin ou gestor pode cancelar viagens' using errcode = '42501';
  end if;
  if length(v_reason) < 10 then
    raise exception 'Informe o motivo do cancelamento (mínimo 10 caracteres)' using errcode = '22023';
  end if;

  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found or v_trip.tenant_id is distinct from public.get_user_tenant_id() then
    raise exception 'Viagem não encontrada' using errcode = 'P0002';
  end if;
  if v_trip.status = 'cancelada'::public.trip_status then
    raise exception 'Viagem já está cancelada' using errcode = '22023';
  end if;

  perform set_config('app.trip_rpc', 'on', true);
  update public.trips
     set status = 'cancelada'::public.trip_status,
         cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = v_reason
   where id = p_trip_id;
  perform set_config('app.trip_rpc', 'off', true);

  -- Viagem em andamento: encerra rastreio e libera motorista/veiculo.
  if v_trip.status = 'andamento'::public.trip_status then
    update public.live_positions set is_active = false, updated_at = now() where trip_id = p_trip_id;
    delete from public.trip_watch where trip_id = p_trip_id;
    update public.profiles set current_vehicle_id = null
     where id = v_trip.driver_id and current_vehicle_id = v_trip.vehicle_id;
    insert into public.notifications (driver_id, tenant_id, type, title, body, entity_type, entity_id)
    values (v_trip.driver_id, v_trip.tenant_id, 'warning', 'Viagem cancelada pela gestão',
            'Sua viagem em andamento foi cancelada. Motivo: ' || v_reason, 'trip', p_trip_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 6b) RPC: retificar campos da viagem (uma linha em trip_corrections por campo)
-- ---------------------------------------------------------------------
create or replace function public.manager_correct_trip(p_trip_id uuid, p_patch jsonb, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_allowed constant text[] := array['start_odometer','end_odometer','destination','start_at','end_at','notes'];
  v_key text;
  v_so integer; v_eo integer; v_dest text; v_sa timestamptz; v_ea timestamptz; v_notes text;
begin
  perform public.check_current_access();
  if not sgf_private.resource_allowed('trips', true) then
    raise exception 'Módulo não autorizado para este acesso' using errcode = '42501';
  end if;
  if not public.is_admin_or_manager() then
    raise exception 'Apenas admin ou gestor pode retificar viagens' using errcode = '42501';
  end if;
  if length(v_reason) < 10 then
    raise exception 'Informe o motivo da retificação (mínimo 10 caracteres)' using errcode = '22023';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'Nenhum campo para retificar' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any(v_allowed)) then
      raise exception 'Campo não retificável: %', v_key using errcode = '22023';
    end if;
  end loop;

  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found or v_trip.tenant_id is distinct from public.get_user_tenant_id() then
    raise exception 'Viagem não encontrada' using errcode = 'P0002';
  end if;
  if v_trip.status = 'cancelada'::public.trip_status then
    raise exception 'Viagem cancelada não pode ser retificada' using errcode = '22023';
  end if;

  -- Valores finais: o que veio no patch, senão o atual.
  v_so    := case when p_patch ? 'start_odometer' then (p_patch->>'start_odometer')::integer     else v_trip.start_odometer end;
  v_eo    := case when p_patch ? 'end_odometer'   then (p_patch->>'end_odometer')::integer       else v_trip.end_odometer   end;
  v_dest  := case when p_patch ? 'destination'    then p_patch->>'destination'                   else v_trip.destination    end;
  v_sa    := case when p_patch ? 'start_at'       then (p_patch->>'start_at')::timestamptz       else v_trip.start_at       end;
  v_ea    := case when p_patch ? 'end_at'         then (p_patch->>'end_at')::timestamptz         else v_trip.end_at         end;
  v_notes := case when p_patch ? 'notes'          then p_patch->>'notes'                         else v_trip.notes          end;

  -- Mesmas regras de trips_odometer_order_chk / trips_time_order_chk, com mensagem amigavel.
  if v_so is not null and v_eo is not null and v_eo < v_so then
    raise exception 'Odômetro final não pode ser menor que o inicial' using errcode = '23514';
  end if;
  if v_sa is null then
    raise exception 'Data de início não pode ser vazia' using errcode = '23502';
  end if;
  if v_ea is not null and v_ea < v_sa then
    raise exception 'Data de fim não pode ser anterior ao início' using errcode = '23514';
  end if;

  -- Uma linha por campo realmente alterado, ANTES do update.
  insert into public.trip_corrections (tenant_id, trip_id, field, old_value, new_value, reason, corrected_by)
  select v_trip.tenant_id, p_trip_id, c.field, c.old_v, c.new_v, v_reason, auth.uid()
    from (values
      ('start_odometer', v_trip.start_odometer::text, v_so::text),
      ('end_odometer',   v_trip.end_odometer::text,   v_eo::text),
      ('destination',    v_trip.destination,          v_dest),
      ('start_at',       v_trip.start_at::text,       v_sa::text),
      ('end_at',         v_trip.end_at::text,         v_ea::text),
      ('notes',          v_trip.notes,                v_notes)
    ) as c(field, old_v, new_v)
   where p_patch ? c.field and c.old_v is distinct from c.new_v;

  if not found then
    raise exception 'Nenhuma alteração em relação aos valores atuais' using errcode = '22023';
  end if;

  perform set_config('app.trip_rpc', 'on', true);
  update public.trips
     set start_odometer = v_so, end_odometer = v_eo, destination = v_dest,
         start_at = v_sa, end_at = v_ea, notes = v_notes
   where id = p_trip_id;
  perform set_config('app.trip_rpc', 'off', true);
end;
$$;

revoke all on function public.manager_cancel_trip(uuid, text)        from public, anon;
revoke all on function public.manager_correct_trip(uuid, jsonb, text) from public, anon;
grant execute on function public.manager_cancel_trip(uuid, text)        to authenticated;
grant execute on function public.manager_correct_trip(uuid, jsonb, text) to authenticated;
