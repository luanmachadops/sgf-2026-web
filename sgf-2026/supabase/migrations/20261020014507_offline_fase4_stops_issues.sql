-- Fase 4 do modo offline do app do motorista — paradas e ocorrências pela
-- fila do aparelho (sgf-2026/docs/plano-offline-app-motorista.md, §6.2).
--
-- Eventos novos em driver_sync_push:
--   stop.add     → parada declarada na viagem (chegada = hora do fato);
--   stop.leave   → saída da parada (hora do fato);
--   issue.create → ocorrência/defeito (criada na hora do fato). Os gatilhos de
--                  hoje continuam valendo: abre a O.S. e avisa o gestor.
--
-- Por que pela RPC e não pelos inserts diretos de hoje:
-- - A RLS de trip_stops só aceita parada em viagem "em andamento" NO SERVIDOR.
--   Viagem iniciada sem internet ainda não existe lá, e a que veio com início
--   e fim no mesmo lote já chega encerrada — as paradas dela se perdiam.
-- - Reenvio sem duplicar (recibo por evento) e o id gerado no aparelho vira o
--   id da parada/ocorrência.
--
-- Mesma regra da viagem: o que o motorista registrou é fato. Hora fora do
-- intervalo da viagem (relógio do celular) é ajustada para dentro e marcada
-- para revisão, não recusada. Só é recusado o que está malformado ou fora do
-- alcance do motorista (viagem de outro motorista, veículo de outra
-- prefeitura, foto fora da pasta da prefeitura).

-- ─── Paradas ───────────────────────────────────────────────────────────────
create or replace function sgf_private.sync_apply_stop_add(
  p_driver uuid, p_tenant uuid, p_occurred timestamptz, p jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stop_id uuid;
  v_trip_id uuid;
  v_trip record;
  v_existing record;
  v_desc text;
  v_lat double precision;
  v_lng double precision;
  v_at timestamptz := least(p_occurred, now());
  v_seq integer;
  v_review text[] := '{}';
begin
  begin
    v_stop_id := (p->>'stop_id')::uuid;
    v_trip_id := (p->>'trip_id')::uuid;
  exception when others then
    raise exception 'Identificador da parada inválido.' using errcode = 'SY001';
  end;
  if v_stop_id is null or v_trip_id is null then
    raise exception 'Identificador da parada ausente.' using errcode = 'SY001';
  end if;

  select s.id, s.trip_id into v_existing from public.trip_stops s where s.id = v_stop_id;
  if found then
    if v_existing.trip_id = v_trip_id
       and exists (select 1 from public.trips t where t.id = v_trip_id and t.driver_id = p_driver) then
      return jsonb_build_object('stop_id', v_stop_id, 'already_existed', true);
    end if;
    raise exception 'Identificador de parada já usado.' using errcode = 'SY001';
  end if;

  select t.id, t.driver_id, t.tenant_id, t.status, t.start_at, t.end_at into v_trip
    from public.trips t where t.id = v_trip_id for update;
  if not found then
    raise exception 'A viagem ainda não chegou ao servidor.' using errcode = 'SR001';
  end if;
  if v_trip.driver_id <> p_driver or v_trip.tenant_id <> p_tenant then
    raise exception 'Viagem de outro motorista.' using errcode = 'SY001';
  end if;
  if v_trip.status = 'cancelada' then
    raise exception 'A viagem foi cancelada pelo gestor.' using errcode = 'SY001';
  end if;

  v_desc := nullif(btrim(p->>'description'), '');
  if length(v_desc) > 300 then
    raise exception 'Descrição da parada longa demais.' using errcode = 'SY001';
  end if;
  if (p->'lat' is not null and jsonb_typeof(p->'lat') <> 'null') or (p->'lng' is not null and jsonb_typeof(p->'lng') <> 'null') then
    if jsonb_typeof(p->'lat') <> 'number' or jsonb_typeof(p->'lng') <> 'number' then
      raise exception 'Coordenadas inválidas.' using errcode = 'SY001';
    end if;
    v_lat := (p->>'lat')::double precision;
    v_lng := (p->>'lng')::double precision;
    if v_lat not between -90 and 90 or v_lng not between -180 and 180 then
      raise exception 'Coordenadas inválidas.' using errcode = 'SY001';
    end if;
  end if;

  -- Relógio do celular fora do intervalo da viagem: ajusta para dentro e marca.
  if v_at < v_trip.start_at or (v_trip.end_at is not null and v_at > v_trip.end_at) then
    v_at := greatest(v_trip.start_at, least(v_at, coalesce(v_trip.end_at, v_at)));
    v_review := v_review || 'relogio_inconsistente'::text;
  end if;

  select coalesce(max(s.seq), 0) + 1 into v_seq from public.trip_stops s where s.trip_id = v_trip_id;

  insert into public.trip_stops (id, tenant_id, trip_id, seq, description, lat, lng, arrived_at, source, created_by)
  values (v_stop_id, p_tenant, v_trip_id, v_seq, v_desc, v_lat, v_lng, v_at, 'declarada', p_driver);

  return jsonb_build_object('stop_id', v_stop_id, 'seq', v_seq, 'review', to_jsonb(v_review));
end;
$$;

create or replace function sgf_private.sync_apply_stop_leave(
  p_driver uuid, p_tenant uuid, p_occurred timestamptz, p jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stop_id uuid;
  v_stop record;
  v_at timestamptz := least(p_occurred, now());
  v_review text[] := '{}';
begin
  begin
    v_stop_id := (p->>'stop_id')::uuid;
  exception when others then
    raise exception 'Identificador da parada inválido.' using errcode = 'SY001';
  end;
  if v_stop_id is null then
    raise exception 'Identificador da parada ausente.' using errcode = 'SY001';
  end if;

  select s.id, s.arrived_at, s.left_at, t.driver_id, t.tenant_id, t.end_at into v_stop
    from public.trip_stops s join public.trips t on t.id = s.trip_id
   where s.id = v_stop_id
     for update of s;
  if not found then
    raise exception 'A parada ainda não chegou ao servidor.' using errcode = 'SR001';
  end if;
  if v_stop.driver_id <> p_driver or v_stop.tenant_id <> p_tenant then
    raise exception 'Parada de outro motorista.' using errcode = 'SY001';
  end if;

  if v_at < v_stop.arrived_at or (v_stop.end_at is not null and v_at > v_stop.end_at) then
    v_at := greatest(v_stop.arrived_at, least(v_at, coalesce(v_stop.end_at, v_at)));
    v_review := v_review || 'relogio_inconsistente'::text;
  end if;

  if v_stop.left_at is not null then
    -- Já tem saída (reenvio ou outra fonte): não sobrescreve.
    return jsonb_build_object('stop_id', v_stop_id, 'already_applied', v_stop.left_at = v_at,
                              'review', case when v_stop.left_at = v_at then '[]'::jsonb
                                             else to_jsonb(v_review || 'saida_ja_registrada'::text) end);
  end if;

  update public.trip_stops set left_at = v_at where id = v_stop_id;
  return jsonb_build_object('stop_id', v_stop_id, 'review', to_jsonb(v_review));
end;
$$;

-- ─── Ocorrência ────────────────────────────────────────────────────────────
create or replace function sgf_private.sync_apply_issue(
  p_driver uuid, p_tenant uuid, p_occurred timestamptz, p jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issue_id uuid;
  v_existing record;
  v_vehicle_id uuid;
  v_trip_id uuid;
  v_title text;
  v_desc text;
  v_sev public.issue_severity;
  v_photos text[] := '{}';
  v_photo text;
  v_so uuid;
begin
  begin
    v_issue_id := (p->>'issue_id')::uuid;
    v_vehicle_id := nullif(p->>'vehicle_id', '')::uuid;
    v_trip_id := nullif(p->>'trip_id', '')::uuid;
  exception when others then
    raise exception 'Identificador da ocorrência inválido.' using errcode = 'SY001';
  end;
  if v_issue_id is null then
    raise exception 'Identificador da ocorrência ausente.' using errcode = 'SY001';
  end if;

  select i.id, i.driver_id into v_existing from public.issues i where i.id = v_issue_id;
  if found then
    if v_existing.driver_id = p_driver then
      return jsonb_build_object('issue_id', v_issue_id, 'already_existed', true);
    end if;
    raise exception 'Identificador de ocorrência já usado.' using errcode = 'SY001';
  end if;

  if v_vehicle_id is not null
     and not exists (select 1 from public.vehicles v where v.id = v_vehicle_id and v.tenant_id = p_tenant) then
    raise exception 'Veículo não encontrado nesta prefeitura.' using errcode = 'SY001';
  end if;
  -- Viagem informada que (ainda) não está no servidor: grava sem o vínculo.
  if v_trip_id is not null
     and not exists (select 1 from public.trips t where t.id = v_trip_id and t.driver_id = p_driver) then
    v_trip_id := null;
  end if;

  v_title := nullif(btrim(p->>'title'), '');
  if v_title is null then
    raise exception 'Título da ocorrência ausente.' using errcode = 'SY001';
  end if;
  v_desc := nullif(btrim(p->>'description'), '');
  if length(v_title) > 200 or length(v_desc) > 4000 then
    raise exception 'Texto longo demais.' using errcode = 'SY001';
  end if;
  begin
    v_sev := coalesce(nullif(p->>'severity', ''), 'media')::public.issue_severity;
  exception when others then
    raise exception 'Gravidade inválida.' using errcode = 'SY001';
  end;

  if p->'photo_urls' is not null and jsonb_typeof(p->'photo_urls') <> 'null' then
    if jsonb_typeof(p->'photo_urls') <> 'array' or jsonb_array_length(p->'photo_urls') > 10 then
      raise exception 'Fotos da ocorrência inválidas.' using errcode = 'SY001';
    end if;
    for v_photo in select value from jsonb_array_elements_text(p->'photo_urls') loop
      if not sgf_private.sync_photo_ok(p_tenant, v_photo) then
        raise exception 'Foto fora da pasta da prefeitura.' using errcode = 'SY001';
      end if;
      v_photos := v_photos || v_photo;
    end loop;
  end if;

  insert into public.issues (id, client_id, driver_id, vehicle_id, trip_id, tenant_id,
                             title, description, severity, photo_urls, created_at)
  values (v_issue_id, v_issue_id, p_driver, v_vehicle_id, v_trip_id, p_tenant,
          v_title, v_desc, v_sev, v_photos, least(p_occurred, now()));

  select so.id into v_so from public.service_orders so where so.issue_id = v_issue_id;
  return jsonb_build_object('issue_id', v_issue_id, 'service_order_id', v_so, 'review', '[]'::jsonb);
end;
$$;

-- ─── driver_sync_push com paradas e ocorrência ─────────────────────────────
-- Igual à versão 20261020010049, mais os três eventos e as dependências
-- (parada espera a viagem; saída espera a parada).
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
revoke all on function sgf_private.sync_apply_stop_add(uuid, uuid, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function sgf_private.sync_apply_stop_leave(uuid, uuid, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function sgf_private.sync_apply_issue(uuid, uuid, timestamptz, jsonb) from public, anon, authenticated;
