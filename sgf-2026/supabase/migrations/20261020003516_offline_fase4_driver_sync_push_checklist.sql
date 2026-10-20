-- Fase 4 do modo offline do app do motorista — envio do que foi gravado no
-- aparelho (sgf-2026/docs/plano-offline-app-motorista.md, §6.2).
--
-- driver_sync_push(p_events jsonb): recebe uma lista de eventos que o app
-- gravou no banco local (cifrado) e devolve o resultado de cada um. Nesta
-- primeira versão só existe o evento `checklist.submit`; viagem e ocorrência
-- entram depois no mesmo formato.
--
-- Por que uma RPC e não os inserts diretos de hoje:
-- - Checklist + itens + O.S. do item crítico numa ÚNICA transação. Hoje são
--   três chamadas: cair a rede no meio deixava checklist sem itens, ou o app
--   dizia "O.S. aberta" mesmo quando a abertura falhava.
-- - Reenvio sem duplicar: recibo por evento em `sync_receipts` (fase 2a),
--   gravado na mesma transação do efeito. Mesmo evento + mesmo conteúdo =
--   devolve o resultado anterior; mesmo evento + conteúdo diferente = conflito.
-- - Hora do fato: o checklist feito offline às 7h e enviado às 15h fica com
--   7h — é o que vale para o "checklist de hoje" e para a trava de viagem.
--
-- Segurança:
-- - SECURITY DEFINER (precisa gravar recibo e O.S. numa transação só), então a
--   própria função faz o que a RLS faria: motorista = auth.uid(), prefeitura do
--   perfil, veículo da mesma prefeitura, sessão ativa (resource_allowed, que
--   recusa bloqueado/inativo/sessão revogada).
-- - Nada vindo do app é confiado sem conferir: rótulos dos itens, hodômetro e
--   categoria da O.S. vêm do servidor; só os 6 itens do modelo atual, todos
--   respondidos (ok/atenção); fotos só do prefixo da prefeitura; limites de
--   tamanho em tudo.
-- - Hora: no futuro (> 5 min) é recusado; mais de 7 dias de atraso entra como
--   "ok_needs_review" para o gestor conferir.
-- - search_path vazio; sem EXECUTE para anon.

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

    -- Hash do evento inteiro (o jsonb já é normalizado: ordem das chaves fixa).
    v_hash := encode(extensions.digest(convert_to(v_event::text, 'UTF8'), 'sha256'), 'hex');

    -- Idempotência: o mesmo evento já foi recebido?
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

    -- Cada evento numa subtransação: erro em um não desfaz os outros.
    begin
      if v_occurred > now() + interval '5 minutes' then
        raise exception 'A data do registro está no futuro. Confira o relógio do celular.' using errcode = 'SY001';
      end if;

      if v_type = 'checklist.submit' then
        v_result := sgf_private.sync_apply_checklist(v_uid, v_profile.tenant_id, v_occurred, v_event->'payload');
      else
        raise exception 'Tipo de registro desconhecido: %', left(v_type, 40) using errcode = 'SY001';
      end if;

      v_status := case when v_occurred < now() - interval '7 days' then 'ok_needs_review' else 'ok' end;

      insert into public.sync_receipts (driver_id, event_id, tenant_id, event_type, payload_hash, status, result, occurred_at)
      values (v_uid, v_event_id, v_profile.tenant_id, v_type, v_hash, v_status, v_result, v_occurred);

      v_results := v_results || jsonb_build_object('event_id', v_event_id, 'status', v_status, 'result', v_result);
    exception when others then
      get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text;
      if v_code like 'SY%' or v_code in ('22023', '22P02', '23502', '23514') then
        -- Recusa definitiva (dado inválido): recibo para não reprocessar.
        begin
          insert into public.sync_receipts (driver_id, event_id, tenant_id, event_type, payload_hash, status, result, occurred_at)
          values (v_uid, v_event_id, v_profile.tenant_id, left(v_type, 64), v_hash, 'rejected',
                  jsonb_build_object('error', left(v_msg, 300)), v_occurred);
        exception when others then null;
        end;
        v_results := v_results || jsonb_build_object('event_id', v_event_id, 'status', 'rejected', 'error', left(v_msg, 300));
      else
        -- Falha passageira (concorrência, banco ocupado): sem recibo, o app tenta de novo.
        v_results := v_results || jsonb_build_object('event_id', v_event_id, 'status', 'retry_later', 'code', v_code);
      end if;
    end;
  end loop;

  return jsonb_build_object('server_time', now(), 'results', v_results);
end;
$$;

-- Aplicação do checklist (chamada só por driver_sync_push, já com o motorista
-- e a prefeitura conferidos). Erros de validação usam o SQLSTATE 'SY001'.
create or replace function sgf_private.sync_apply_checklist(
  p_driver uuid, p_tenant uuid, p_occurred timestamptz, p jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Modelo atual (app: CHECKLIST_TEMPLATE). Rótulos vêm daqui, não do app.
  c_template constant jsonb := '{
    "oleo": "Nível de óleo", "pneus": "Pressão dos pneus", "agua": "Água / arrefecimento",
    "freios": "Freios", "luzes": "Luzes e sinaleiras", "geral": "Condições gerais"}';
  c_critical constant text[] := array['freios', 'pneus', 'luzes'];
  v_client_id uuid;
  v_vehicle record;
  v_existing uuid;
  v_checklist uuid;
  v_item jsonb;
  v_key text;
  v_state text;
  v_keys text[] := '{}';
  v_failed text[] := '{}';
  v_photos jsonb;
  v_photo text;
  v_notes text;
  v_damage_notes text := '';
  v_safety jsonb;
  v_so uuid;
  v_category text;
  v_labels text;
begin
  begin
    v_client_id := (p->>'checklist_id')::uuid;
  exception when others then
    raise exception 'Identificador do checklist inválido.' using errcode = 'SY001';
  end;
  if v_client_id is null then
    raise exception 'Identificador do checklist ausente.' using errcode = 'SY001';
  end if;

  -- Já existe (ex.: recibo perdido em uma restauração)? Devolve o mesmo.
  select c.id into v_existing from public.checklists c
   where c.tenant_id = p_tenant and c.client_id = v_client_id;
  if found then
    return jsonb_build_object('checklist_id', v_existing, 'already_existed', true);
  end if;

  select v.id, v.tenant_id, v.current_odometer into v_vehicle
    from public.vehicles v
   where v.id = (p->>'vehicle_id')::uuid and v.tenant_id = p_tenant;
  if not found then
    raise exception 'Veículo não encontrado nesta prefeitura.' using errcode = 'SY001';
  end if;

  if p->>'fuel_level' is null
     or p->>'fuel_level' not in ('vazio', 'um_quarto', 'meio', 'tres_quartos', 'cheio') then
    raise exception 'Nível de combustível inválido.' using errcode = 'SY001';
  end if;
  if jsonb_typeof(p->'spare_tire_ok') is distinct from 'boolean' then
    raise exception 'Condição do estepe ausente.' using errcode = 'SY001';
  end if;
  v_safety := p->'safety_items';
  if jsonb_typeof(v_safety) is distinct from 'object'
     or jsonb_typeof(v_safety->'triangulo') is distinct from 'boolean'
     or jsonb_typeof(v_safety->'macaco') is distinct from 'boolean'
     or jsonb_typeof(v_safety->'chave_roda') is distinct from 'boolean'
     or jsonb_typeof(v_safety->'cintos') is distinct from 'boolean' then
    raise exception 'Itens de segurança incompletos.' using errcode = 'SY001';
  end if;
  v_safety := jsonb_build_object(
    'triangulo', v_safety->'triangulo', 'macaco', v_safety->'macaco',
    'chave_roda', v_safety->'chave_roda', 'cintos', v_safety->'cintos');

  v_notes := nullif(btrim(p->>'notes'), '');
  if length(v_notes) > 4000 then
    raise exception 'Observações longas demais.' using errcode = 'SY001';
  end if;

  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') <> 6 then
    raise exception 'O checklist precisa ter os 6 itens do modelo.' using errcode = 'SY001';
  end if;
  for v_item in select value from jsonb_array_elements(p->'items') loop
    v_key := v_item->>'key';
    v_state := v_item->>'state';
    if v_key is null or not (c_template ? v_key) or v_key = any(v_keys) then
      raise exception 'Item do checklist inválido ou repetido.' using errcode = 'SY001';
    end if;
    if v_state not in ('ok', 'atencao') then
      raise exception 'Todos os itens precisam estar marcados.' using errcode = 'SY001';
    end if;
    if length(v_item->>'damage_description') > 2000 then
      raise exception 'Descrição da avaria longa demais.' using errcode = 'SY001';
    end if;
    v_photos := coalesce(v_item->'photo_urls', '[]'::jsonb);
    if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 10 then
      raise exception 'Fotos da avaria inválidas.' using errcode = 'SY001';
    end if;
    for v_photo in select value from jsonb_array_elements_text(v_photos) loop
      if length(v_photo) > 500 or strpos(v_photo, '..') > 0
         or strpos(v_photo, format('tenant/%s/', p_tenant)) <> 1 then
        raise exception 'Foto fora da pasta da prefeitura.' using errcode = 'SY001';
      end if;
    end loop;
    v_keys := v_keys || v_key;
    if v_state = 'atencao' and v_key = any(c_critical) then
      v_failed := v_failed || v_key;
    end if;
    if v_state = 'atencao' and nullif(btrim(v_item->>'damage_description'), '') is not null then
      v_damage_notes := v_damage_notes || case when v_damage_notes = '' then '' else E'\n' end
        || format('[%s]: %s', c_template->>v_key, btrim(v_item->>'damage_description'));
    end if;
  end loop;

  insert into public.checklists (
    driver_id, vehicle_id, notes, fuel_level, spare_tire_ok, safety_items,
    client_id, created_at, quick_confirm
  ) values (
    p_driver, v_vehicle.id, v_notes, (p->>'fuel_level')::public.checklist_fuel_level,
    (p->>'spare_tire_ok')::boolean, v_safety, v_client_id, least(p_occurred, now()), false
  ) returning id into v_checklist;

  insert into public.checklist_items (checklist_id, item_key, label, state, damage_description, photo_urls, tenant_id)
  select v_checklist, i->>'key', c_template->>(i->>'key'), (i->>'state')::public.checklist_state,
         case when i->>'state' = 'atencao' then nullif(btrim(i->>'damage_description'), '') end,
         case when i->>'state' = 'atencao'
              then coalesce(array(select jsonb_array_elements_text(coalesce(i->'photo_urls', '[]'::jsonb))), '{}')
              else '{}' end,
         p_tenant
    from jsonb_array_elements(p->'items') i;

  -- Item crítico com problema: O.S. na MESMA transação (some junto se algo falhar).
  if array_length(v_failed, 1) > 0 then
    v_category := case when array_length(v_failed, 1) = 1
      then case v_failed[1] when 'freios' then 'freios' when 'pneus' then 'pneus' else 'eletrica' end
      else 'revisao' end;
    select string_agg(c_template->>k, ', ') into v_labels from unnest(v_failed) k;
    insert into public.service_orders (
      driver_id, vehicle_id, category, description, priority, odometer, status, checklist_id, tenant_id
    ) values (
      p_driver, v_vehicle.id, v_category,
      format('Checklist diário reprovado — item(ns) crítico(s) com problema: %s.', v_labels)
        || case when v_damage_notes <> '' or v_notes is not null
                then E'\n\n' || concat_ws(E'\n\n', nullif(v_damage_notes, ''), v_notes) else '' end,
      'alta', v_vehicle.current_odometer, 'pendente', v_checklist, p_tenant
    ) returning id into v_so;
  end if;

  return jsonb_build_object(
    'checklist_id', v_checklist,
    'critical_failed', to_jsonb(v_failed),
    'service_order_id', v_so
  );
end;
$$;

revoke all on function public.driver_sync_push(jsonb) from public, anon;
grant execute on function public.driver_sync_push(jsonb) to authenticated;
revoke all on function sgf_private.sync_apply_checklist(uuid, uuid, timestamptz, jsonb) from public, anon, authenticated;
