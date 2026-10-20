-- Fase 4 do modo offline do app do motorista — confirmação rápida do
-- checklist pela fila do aparelho (sgf-2026/docs/plano-offline-app-motorista.md).
--
-- Confirmação rápida = o motorista pega um veículo que já teve o checklist
-- completo do dia feito (por ele ou por outro motorista) e só confirma que o
-- veículo segue em bom estado. Hoje é um insert direto em `checklists` com
-- quick_confirm = true e sem itens; ela é o "par motorista+veículo do dia"
-- que a trava de viagem exige.
--
-- Evento novo em driver_sync_push: checklist.quick_confirm.
-- Mesma regra dos outros eventos: é fato do motorista, gravado na hora do fato.
-- Se no dia do fato não havia checklist completo do veículo até aquela hora,
-- ou o último reprovou item crítico (o app avisou com dados velhos), grava e
-- marca para revisão — não recusa.

create or replace function sgf_private.sync_apply_quick_confirm(
  p_driver uuid, p_tenant uuid, p_occurred timestamptz, p jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_vehicle_id uuid;
  v_existing uuid;
  v_at timestamptz := least(p_occurred, now());
  v_day_start timestamptz;
  v_latest_full uuid;
  v_notes text;
  v_id uuid;
  v_review text[] := '{}';
begin
  begin
    v_client_id := (p->>'checklist_id')::uuid;
    v_vehicle_id := (p->>'vehicle_id')::uuid;
  exception when others then
    raise exception 'Identificador da confirmação inválido.' using errcode = 'SY001';
  end;
  if v_client_id is null or v_vehicle_id is null then
    raise exception 'Identificador da confirmação ausente.' using errcode = 'SY001';
  end if;

  select c.id into v_existing from public.checklists c
   where c.tenant_id = p_tenant and c.client_id = v_client_id;
  if found then
    return jsonb_build_object('checklist_id', v_existing, 'already_existed', true, 'review', '[]'::jsonb);
  end if;

  if not exists (select 1 from public.vehicles v where v.id = v_vehicle_id and v.tenant_id = p_tenant) then
    raise exception 'Veículo não encontrado nesta prefeitura.' using errcode = 'SY001';
  end if;

  v_notes := nullif(btrim(p->>'notes'), '');
  if length(v_notes) > 4000 then
    raise exception 'Observações longas demais.' using errcode = 'SY001';
  end if;

  -- Checklist completo do veículo no dia (Brasília), até a hora do fato.
  v_day_start := ((v_at at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo';
  select c.id into v_latest_full
    from public.checklists c
   where c.vehicle_id = v_vehicle_id
     and c.quick_confirm = false
     and c.created_at >= v_day_start
     and c.created_at <= v_at + interval '5 minutes'
   order by c.created_at desc
   limit 1;
  if v_latest_full is null then
    v_review := v_review || 'sem_checklist_completo_do_dia'::text;
  elsif exists (select 1 from public.checklist_items ci
                 where ci.checklist_id = v_latest_full
                   and ci.item_key in ('freios', 'pneus', 'luzes')
                   and ci.state = 'atencao') then
    v_review := v_review || 'checklist_critico'::text;
  end if;

  insert into public.checklists (driver_id, vehicle_id, notes, quick_confirm, client_id, created_at, tenant_id)
  values (p_driver, v_vehicle_id, v_notes, true, v_client_id, v_at, p_tenant)
  returning id into v_id;

  return jsonb_build_object('checklist_id', v_id, 'full_checklist_id', v_latest_full, 'review', to_jsonb(v_review));
end;
$$;

-- driver_sync_push: igual à versão 20261020014507, mais checklist.quick_confirm.
create or replace function public.driver_sync_push(p_events jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile record;
  v_event jsonb;
  v_event_id uuid;
  v_type text;
  v_occurred timestamptz;
  v_hash text;
  v_receipt record;
  v_status text;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_code text;
  v_msg text;
  -- Ids (checklist/viagem/parada) de eventos deste lote que ficaram para
  -- depois: quem depende deles também espera, para nunca aplicar fora de ordem.
  v_waiting text[] := '{}';
  v_end_event jsonb;
  v_end_occurred timestamptz;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre novamente.' using errcode = '42501';
  end if;
  if not sgf_private.resource_allowed('driver_sync_push', true) then
    raise exception 'Acesso não autorizado.' using errcode = '42501';
  end if;

  select p.id, p.tenant_id, p.role into v_profile
    from public.profiles p where p.id = v_uid;
  if v_profile.tenant_id is null or v_profile.role is distinct from 'motorista' then
    raise exception 'Acesso não autorizado.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_events) is distinct from 'array'
     or jsonb_array_length(p_events) not between 1 and 50
     or octet_length(p_events::text) > 500000 then
    raise exception 'Lote de envio inválido.' using errcode = '22023';
  end if;

  for v_event in select value from jsonb_array_elements(p_events) loop
    v_event_id := null;
    begin
      v_event_id := (v_event->>'event_id')::uuid;
      v_type := v_event->>'type';
      v_occurred := (v_event->>'occurred_at')::timestamptz;
    exception when others then
      v_results := v_results || jsonb_build_object(
        'event_id', v_event->>'event_id', 'status', 'rejected', 'error', 'Evento malformado.');
      continue;
    end;
    if v_event_id is null or v_type is null or v_occurred is null
       or jsonb_typeof(v_event->'payload') is distinct from 'object' then
      v_results := v_results || jsonb_build_object(
        'event_id', v_event->>'event_id', 'status', 'rejected', 'error', 'Evento malformado.');
      continue;
    end if;

    v_hash := encode(extensions.digest(convert_to(v_event::text, 'UTF8'), 'sha256'), 'hex');

    select r.status, r.result, r.payload_hash into v_receipt
      from public.sync_receipts r
     where r.driver_id = v_uid and r.event_id = v_event_id;
    if found then
      if v_receipt.payload_hash = v_hash then
        v_results := v_results || jsonb_build_object(
          'event_id', v_event_id, 'status', v_receipt.status, 'result', v_receipt.result, 'repeated', true);
      else
        v_results := v_results || jsonb_build_object(
          'event_id', v_event_id, 'status', 'conflict',
          'error', 'Este registro já foi enviado com outro conteúdo.');
      end if;
      continue;
    end if;

    begin
      if v_occurred > now() + interval '5 minutes' then
        raise exception 'A data do registro está no futuro. Confira o relógio do celular.' using errcode = 'SY001';
      end if;

      if v_type = 'checklist.submit' then
        v_result := sgf_private.sync_apply_checklist(v_uid, v_profile.tenant_id, v_occurred, v_event->'payload');

      elsif v_type = 'checklist.quick_confirm' then
        v_result := sgf_private.sync_apply_quick_confirm(v_uid, v_profile.tenant_id, v_occurred, v_event->'payload');

      elsif v_type = 'trip.start' then
        if v_event->'payload'->>'checklist_id' = any(v_waiting) then
          raise exception 'Aguardando o envio do checklist.' using errcode = 'SR003';
        end if;
        v_end_event := null;
        v_end_occurred := null;
        select x.value into v_end_event
          from jsonb_array_elements(p_events) as x(value)
         where x.value->>'type' = 'trip.end'
           and x.value->'payload'->>'trip_id' = v_event->'payload'->>'trip_id'
         limit 1;
        if v_end_event is not null then
          begin
            v_end_occurred := (v_end_event->>'occurred_at')::timestamptz;
          exception when others then
            v_end_event := null;
          end;
        end if;
        v_result := sgf_private.sync_apply_trip_start(
          v_uid, v_profile.tenant_id, v_occurred, v_event->'payload',
          v_end_event->'payload', v_end_occurred);

      elsif v_type = 'trip.end' then
        if v_event->'payload'->>'trip_id' = any(v_waiting) then
          raise exception 'Aguardando o envio do início da viagem.' using errcode = 'SR003';
        end if;
        v_result := sgf_private.sync_apply_trip_end(v_uid, v_profile.tenant_id, v_occurred, v_event->'payload');

      elsif v_type = 'stop.add' then
        if v_event->'payload'->>'trip_id' = any(v_waiting) then
          raise exception 'Aguardando o envio do início da viagem.' using errcode = 'SR003';
        end if;
        v_result := sgf_private.sync_apply_stop_add(v_uid, v_profile.tenant_id, v_occurred, v_event->'payload');

      elsif v_type = 'stop.leave' then
        if v_event->'payload'->>'stop_id' = any(v_waiting) then
          raise exception 'Aguardando o envio da parada.' using errcode = 'SR003';
        end if;
        v_result := sgf_private.sync_apply_stop_leave(v_uid, v_profile.tenant_id, v_occurred, v_event->'payload');

      elsif v_type = 'issue.create' then
        v_result := sgf_private.sync_apply_issue(v_uid, v_profile.tenant_id, v_occurred, v_event->'payload');

      else
        raise exception 'Tipo de registro desconhecido: %', left(v_type, 40) using errcode = 'SY001';
      end if;

      v_status := case
        when v_occurred < now() - interval '7 days'
          or jsonb_array_length(coalesce(v_result->'review', '[]'::jsonb)) > 0
        then 'ok_needs_review' else 'ok' end;

      insert into public.sync_receipts (driver_id, event_id, tenant_id, event_type, payload_hash, status, result, occurred_at)
      values (v_uid, v_event_id, v_profile.tenant_id, v_type, v_hash, v_status, v_result, v_occurred);

      v_results := v_results || jsonb_build_object('event_id', v_event_id, 'status', v_status, 'result', v_result);
    exception when others then
      get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text;
      if v_code like 'SY%' or v_code in ('22023', '22P02', '22003', '22007', '22008', '23502', '23514') then
        begin
          insert into public.sync_receipts (driver_id, event_id, tenant_id, event_type, payload_hash, status, result, occurred_at)
          values (v_uid, v_event_id, v_profile.tenant_id, left(v_type, 64), v_hash, 'rejected',
                  jsonb_build_object('error', left(v_msg, 300)), v_occurred);
        exception when others then null;
        end;
        v_results := v_results || jsonb_build_object('event_id', v_event_id, 'status', 'rejected', 'error', left(v_msg, 300));
      else
        -- Parada adiada só segura a própria saída (não a viagem inteira).
        v_waiting := v_waiting || array_remove(case when v_type in ('stop.add', 'stop.leave')
          then array[v_event->'payload'->>'stop_id']
          else array[v_event->'payload'->>'checklist_id', v_event->'payload'->>'trip_id'] end, null);
        v_results := v_results || jsonb_build_object(
          'event_id', v_event_id, 'status', 'retry_later', 'code', v_code,
          'error', case when v_code like 'SR%' then left(v_msg, 300) end);
      end if;
    end;
  end loop;

  return jsonb_build_object('server_time', now(), 'results', v_results);
end;
$$;

revoke all on function public.driver_sync_push(jsonb) from public, anon;
grant execute on function public.driver_sync_push(jsonb) to authenticated;
revoke all on function sgf_private.sync_apply_quick_confirm(uuid, uuid, timestamptz, jsonb) from public, anon, authenticated;
