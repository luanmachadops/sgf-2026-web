-- Fase 4 do modo offline do app do motorista — início e fim de viagem pela
-- fila do aparelho (sgf-2026/docs/plano-offline-app-motorista.md, §6.2/§6.3).
--
-- Dois eventos novos em driver_sync_push:
--   trip.start → cria a viagem com start_at = hora do fato, ligada ao checklist
--                informado (fim do "pega o mais recente");
--   trip.end   → encerra com end_at = hora do fato; server_ended_at continua
--                sendo do servidor.
--
-- Regra central: viagem feita sem internet é um FATO. O servidor não recusa
-- por regra de negócio (CNH vencida, veículo em manutenção, checklist ausente,
-- sobreposição com outro motorista...) — recusar apagaria um deslocamento real
-- e esconderia o problema. Ele grava e devolve "ok_needs_review" com os
-- motivos, para o gestor conferir (fase 5). Só é recusado o que está
-- malformado ou fora do alcance do motorista (veículo de outra prefeitura,
-- viagem de outro motorista, foto fora da pasta da prefeitura).
--
-- Partes:
--   A. tf_trip_insert_guard: com app.offline_sync = 'on' (só a RPC liga) as
--      regras são avaliadas pela RPC na data do fato, não por now().
--   B. CORREÇÃO DE BUG EXISTENTE (online): o "dia de hoje" das travas usava
--      date_trunc('day', now()) com o banco em UTC. Das 21h às 23h59 (Brasília)
--      o checklist feito de manhã contava como "ontem" e a viagem era barrada
--      (TRIP_GUARD_CHECKLIST_MISSING). Passa a usar o dia de America/Sao_Paulo,
--      o mesmo fuso de tf_trip_alerts_mark. Idem em link_checklist_to_trip e na
--      validade da CNH.
--   C. Funções internas sync_apply_trip_start / sync_apply_trip_end.
--   D. driver_sync_push com os eventos novos, dependência dentro do lote e
--      "ok_needs_review" quando houver motivo de revisão.

-- ─── A + B. Trava de inserção de viagem ────────────────────────────────────
create or replace function public.tf_trip_insert_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_driver        record;
  v_vehicle       record;
  -- Dia local (Brasília). Antes: date_trunc('day', now()) em UTC.
  v_today         date := (now() at time zone 'America/Sao_Paulo')::date;
  v_today_start   timestamptz := ((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo';
  v_has_pair      boolean;
  v_latest_full   uuid;
  v_has_critical  boolean;
  v_require_purpose boolean;
  v_retroactive   boolean := coalesce(current_setting('app.retroactive_trip', true), '') = 'on';
  v_offline_sync  boolean := coalesce(current_setting('app.offline_sync', true), '') = 'on';
begin
  select p.access_blocked, p.driver_status, p.cnh_expiry
    into v_driver
    from public.profiles p
   where p.id = new.driver_id;

  if not found then
    raise exception 'TRIP_GUARD_DRIVER_NOT_FOUND: motorista nao encontrado.'
      using errcode = 'TR001';
  end if;

  if v_retroactive then
    select v.status into v_vehicle from public.vehicles v where v.id = new.vehicle_id;
    if not found then
      raise exception 'TRIP_GUARD_VEHICLE_NOT_FOUND: veiculo nao encontrado.'
        using errcode = 'TR005';
    end if;
    return new;
  end if;

  -- Viagem feita sem internet (driver_sync_push): as regras abaixo já foram
  -- avaliadas na data do fato pela RPC, que grava e marca para revisão.
  if v_offline_sync then
    return new;
  end if;

  if coalesce(v_driver.access_blocked, false) then
    raise exception 'TRIP_GUARD_DRIVER_BLOCKED: seu acesso esta bloqueado. Procure a administracao.'
      using errcode = 'TR002';
  end if;

  if coalesce(v_driver.driver_status, 'ativo') <> 'ativo' then
    raise exception 'TRIP_GUARD_DRIVER_STATUS: seu cadastro nao esta ativo (status: %). Procure a administracao.', v_driver.driver_status
      using errcode = 'TR003';
  end if;

  if v_driver.cnh_expiry is null or v_driver.cnh_expiry < v_today then
    raise exception 'TRIP_GUARD_CNH_EXPIRED: sua CNH esta vencida ou sem data cadastrada. Atualize seu cadastro antes de iniciar uma viagem.'
      using errcode = 'TR004';
  end if;

  select v.status into v_vehicle
    from public.vehicles v
   where v.id = new.vehicle_id;

  if not found then
    raise exception 'TRIP_GUARD_VEHICLE_NOT_FOUND: veiculo nao encontrado.'
      using errcode = 'TR005';
  end if;

  if v_vehicle.status <> 'liberado' then
    raise exception 'TRIP_GUARD_VEHICLE_STATUS: veiculo indisponivel (status atual: %). Nao e possivel iniciar viagem.', v_vehicle.status
      using errcode = 'TR006';
  end if;

  select exists (
    select 1
      from public.checklists c
     where c.driver_id = new.driver_id
       and c.vehicle_id = new.vehicle_id
       and c.created_at >= v_today_start
  ) into v_has_pair;

  if not v_has_pair then
    raise exception 'TRIP_GUARD_CHECKLIST_MISSING: e necessario registrar o checklist de hoje para este veiculo antes de iniciar a viagem.'
      using errcode = 'TR007';
  end if;

  select c.id into v_latest_full
    from public.checklists c
   where c.vehicle_id = new.vehicle_id
     and c.quick_confirm = false
     and c.created_at >= v_today_start
   order by c.created_at desc
   limit 1;

  if v_latest_full is not null then
    select exists (
      select 1
        from public.checklist_items ci
       where ci.checklist_id = v_latest_full
         and ci.item_key in ('freios', 'pneus', 'luzes')
         and ci.state = 'atencao'
    ) into v_has_critical;

    if v_has_critical then
      raise exception 'TRIP_GUARD_CHECKLIST_CRITICAL: o checklist de hoje deste veiculo reprovou um item critico (freios, pneus ou luzes). A viagem nao pode ser iniciada ate a correcao.'
        using errcode = 'TR008';
    end if;
  end if;

  select t.require_trip_purpose
    into v_require_purpose
    from public.tenants t
   where t.id = coalesce(
           new.tenant_id,
           (select v.tenant_id from public.vehicles v where v.id = new.vehicle_id)
         );

  if coalesce(v_require_purpose, false) then
    if nullif(btrim(coalesce(new.origin, '')), '') is null
       or length(btrim(coalesce(new.purpose, ''))) < 10
       or new.purpose_category is null then
      raise exception 'TRIP_GUARD_PURPOSE_MISSING: informe origem, finalidade (minimo 10 caracteres) e categoria da finalidade do deslocamento.'
        using errcode = 'TR009';
    end if;
  end if;

  return new;
end;
$function$;

-- B. Vínculo checklist → viagem (online): mesmo dia local da viagem.
create or replace function public.link_checklist_to_trip(p_trip_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
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

  select c.id
    into v_checklist
    from public.checklists c
   where c.driver_id = v_trip.driver_id
     and c.vehicle_id = v_trip.vehicle_id
     and c.trip_id is null
     and c.created_at >= ((v_trip.start_at at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo'
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
$function$;

-- ─── C. Funções internas (chamadas só por driver_sync_push) ────────────────

-- Caminho de foto enviado pelo app: só dentro da pasta da prefeitura.
create or replace function sgf_private.sync_photo_ok(p_tenant uuid, p_path text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_path is not null
     and length(p_path) <= 500
     and strpos(p_path, '..') = 0
     and strpos(p_path, format('tenant/%s/', p_tenant)) = 1;
$$;

-- Valida e normaliza os dados de encerramento (usado pelo trip.end e pelo
-- trip.start que já chega com o fim no mesmo lote).
create or replace function sgf_private.sync_trip_end_values(
  p_tenant uuid, p_start_at timestamptz, p_start_odometer integer,
  p_occurred timestamptz, p jsonb
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_num numeric;
  v_end integer;
  v_notes text;
  v_photo text;
  v_end_at timestamptz;
  v_review text[] := '{}';
begin
  if p_occurred is null or jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Encerramento malformado.' using errcode = 'SY001';
  end if;
  if jsonb_typeof(p->'end_odometer') is distinct from 'number' then
    raise exception 'Hodômetro final ausente.' using errcode = 'SY001';
  end if;
  v_num := (p->>'end_odometer')::numeric;
  if v_num <> trunc(v_num) or v_num < 0 or v_num > 9999999 then
    raise exception 'Hodômetro final inválido.' using errcode = 'SY001';
  end if;
  v_end := v_num::integer;
  if p_start_odometer is not null and v_end < p_start_odometer then
    raise exception 'Hodômetro final menor que o inicial.' using errcode = 'SY001';
  end if;

  v_notes := nullif(btrim(p->>'notes'), '');
  if length(v_notes) > 4000 then
    raise exception 'Observações longas demais.' using errcode = 'SY001';
  end if;

  v_photo := nullif(p->>'end_odometer_photo_url', '');
  if v_photo is null then
    v_review := v_review || 'sem_foto_hodometro_final'::text;
  elsif not sgf_private.sync_photo_ok(p_tenant, v_photo) then
    raise exception 'Foto fora da pasta da prefeitura.' using errcode = 'SY001';
  end if;

  v_end_at := least(p_occurred, now());
  if v_end_at < p_start_at then
    -- Relógio do celular andou para trás entre o início e o fim.
    v_end_at := p_start_at;
    v_review := v_review || 'relogio_inconsistente'::text;
  end if;

  return jsonb_build_object(
    'end_odometer', v_end, 'end_at', v_end_at, 'notes', v_notes,
    'photo', v_photo, 'review', to_jsonb(v_review));
end;
$$;

create or replace function sgf_private.sync_apply_trip_start(
  p_driver uuid, p_tenant uuid, p_occurred timestamptz, p jsonb,
  p_end jsonb default null, p_end_occurred timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_existing record;
  v_vehicle record;
  v_driver record;
  v_start_at timestamptz := least(p_occurred, now());
  v_day date := (least(p_occurred, now()) at time zone 'America/Sao_Paulo')::date;
  v_day_start timestamptz;
  v_checklist_ref uuid;
  v_checklist uuid;
  v_latest_full uuid;
  v_review text[] := '{}';
  v_num numeric;
  v_odo integer;
  v_photo text;
  v_dest text;
  v_origin text;
  v_purpose text;
  v_cat public.trip_purpose_category;
  v_pcount integer;
  v_passengers jsonb := '[]'::jsonb;
  v_p jsonb;
  v_cargo text;
  v_require_purpose boolean;
  v_busy_vehicle boolean;
  v_busy_driver boolean;
  v_end jsonb;
  v_status public.trip_status := 'andamento';
begin
  v_day_start := v_day::timestamp at time zone 'America/Sao_Paulo';

  begin
    v_trip_id := (p->>'trip_id')::uuid;
  exception when others then
    raise exception 'Identificador da viagem inválido.' using errcode = 'SY001';
  end;
  if v_trip_id is null then
    raise exception 'Identificador da viagem ausente.' using errcode = 'SY001';
  end if;

  -- Já existe (recibo perdido, reenvio)? Mesma viagem do mesmo motorista = devolve.
  select t.id, t.driver_id, t.tenant_id, t.status into v_existing
    from public.trips t where t.id = v_trip_id;
  if found then
    if v_existing.driver_id = p_driver and v_existing.tenant_id = p_tenant then
      return jsonb_build_object('trip_id', v_trip_id, 'status', v_existing.status, 'already_existed', true);
    end if;
    raise exception 'Identificador de viagem já usado.' using errcode = 'SY001';
  end if;

  select v.id, v.status into v_vehicle
    from public.vehicles v
   where v.id = (p->>'vehicle_id')::uuid and v.tenant_id = p_tenant;
  if not found then
    raise exception 'Veículo não encontrado nesta prefeitura.' using errcode = 'SY001';
  end if;

  -- Campos (mesmos limites do formulário do app).
  if jsonb_typeof(p->'start_odometer') is distinct from 'number' then
    raise exception 'Hodômetro inicial ausente.' using errcode = 'SY001';
  end if;
  v_num := (p->>'start_odometer')::numeric;
  if v_num <> trunc(v_num) or v_num < 0 or v_num > 9999999 then
    raise exception 'Hodômetro inicial inválido.' using errcode = 'SY001';
  end if;
  v_odo := v_num::integer;

  v_dest := nullif(btrim(p->>'destination'), '');
  if v_dest is null then
    raise exception 'Destino ausente.' using errcode = 'SY001';
  end if;
  v_origin := nullif(btrim(p->>'origin'), '');
  v_purpose := nullif(btrim(p->>'purpose'), '');
  v_cargo := nullif(btrim(p->>'cargo_description'), '');
  if length(v_dest) > 300 or length(v_origin) > 300 or length(v_purpose) > 1000 or length(v_cargo) > 1000 then
    raise exception 'Texto longo demais.' using errcode = 'SY001';
  end if;

  if nullif(p->>'purpose_category', '') is not null then
    begin
      v_cat := (p->>'purpose_category')::public.trip_purpose_category;
    exception when others then
      raise exception 'Categoria da finalidade inválida.' using errcode = 'SY001';
    end;
  end if;

  if p->'passenger_count' is not null and jsonb_typeof(p->'passenger_count') <> 'null' then
    if jsonb_typeof(p->'passenger_count') <> 'number' then
      raise exception 'Número de passageiros inválido.' using errcode = 'SY001';
    end if;
    v_num := (p->>'passenger_count')::numeric;
    if v_num <> trunc(v_num) or v_num < 0 or v_num > 500 then
      raise exception 'Número de passageiros inválido.' using errcode = 'SY001';
    end if;
    v_pcount := v_num::integer;
  end if;

  if p->'passengers' is not null and jsonb_typeof(p->'passengers') <> 'null' then
    if jsonb_typeof(p->'passengers') <> 'array' or jsonb_array_length(p->'passengers') > 100 then
      raise exception 'Lista de passageiros inválida.' using errcode = 'SY001';
    end if;
    -- Reconstrói só com os campos conhecidos (nada extra do app vai para o banco).
    for v_p in select value from jsonb_array_elements(p->'passengers') loop
      if jsonb_typeof(v_p) <> 'object'
         or nullif(btrim(v_p->>'nome'), '') is null
         or length(v_p->>'nome') > 120
         or length(v_p->>'documento') > 40 then
        raise exception 'Passageiro inválido.' using errcode = 'SY001';
      end if;
      v_passengers := v_passengers || jsonb_strip_nulls(jsonb_build_object(
        'nome', btrim(v_p->>'nome'),
        'documento', nullif(btrim(v_p->>'documento'), '')));
    end loop;
  end if;

  v_photo := nullif(p->>'start_odometer_photo_url', '');
  if v_photo is null then
    v_review := v_review || 'sem_foto_hodometro'::text;
  elsif not sgf_private.sync_photo_ok(p_tenant, v_photo) then
    raise exception 'Foto fora da pasta da prefeitura.' using errcode = 'SY001';
  end if;

  -- Regras de negócio na DATA DO FATO: viram motivo de revisão, não recusa.
  select pr.cnh_expiry into v_driver from public.profiles pr where pr.id = p_driver;
  if v_driver.cnh_expiry is null or v_driver.cnh_expiry < v_day then
    v_review := v_review || 'cnh_vencida'::text;
  end if;
  if v_vehicle.status <> 'liberado' then
    -- Status de AGORA: o veículo pode ter ido para a oficina depois da viagem.
    v_review := v_review || 'veiculo_indisponivel'::text;
  end if;

  -- Checklist: o informado pelo app (id do servidor ou do aparelho), se for do
  -- mesmo motorista e veículo no dia da viagem; senão, o mais recente do dia.
  if nullif(p->>'checklist_id', '') is not null then
    begin
      v_checklist_ref := (p->>'checklist_id')::uuid;
    exception when others then
      raise exception 'Identificador do checklist inválido.' using errcode = 'SY001';
    end;
    select c.id into v_checklist
      from public.checklists c
     where (c.id = v_checklist_ref or c.client_id = v_checklist_ref)
       and c.tenant_id = p_tenant
       and c.driver_id = p_driver
       and c.vehicle_id = v_vehicle.id
       and c.created_at >= v_day_start
       and c.created_at <= v_start_at + interval '5 minutes'
     limit 1;
  end if;
  if v_checklist is null then
    select c.id into v_checklist
      from public.checklists c
     where c.driver_id = p_driver
       and c.vehicle_id = v_vehicle.id
       and c.created_at >= v_day_start
       and c.created_at <= v_start_at + interval '5 minutes'
     order by c.created_at desc
     limit 1;
  end if;
  if v_checklist is null then
    v_review := v_review || 'sem_checklist_do_dia'::text;
  end if;

  select c.id into v_latest_full
    from public.checklists c
   where c.vehicle_id = v_vehicle.id
     and c.quick_confirm = false
     and c.created_at >= v_day_start
     and c.created_at <= v_start_at + interval '5 minutes'
   order by c.created_at desc
   limit 1;
  if v_latest_full is not null and exists (
       select 1 from public.checklist_items ci
        where ci.checklist_id = v_latest_full
          and ci.item_key in ('freios', 'pneus', 'luzes')
          and ci.state = 'atencao') then
    v_review := v_review || 'checklist_critico'::text;
  end if;

  select te.require_trip_purpose into v_require_purpose from public.tenants te where te.id = p_tenant;
  if coalesce(v_require_purpose, false)
     and (v_origin is null or length(coalesce(v_purpose, '')) < 10 or v_cat is null) then
    v_review := v_review || 'finalidade_incompleta'::text;
  end if;

  -- Viagem em andamento no servidor para o veículo ou para o motorista: o
  -- índice único não deixa abrir outra. Se o fim desta viagem veio no mesmo
  -- lote, ela entra já encerrada (fato completo) e fica marcada; senão espera.
  select exists (select 1 from public.trips t
                  where t.vehicle_id = v_vehicle.id and t.status = 'andamento')
    into v_busy_vehicle;
  select exists (select 1 from public.trips t
                  where t.driver_id = p_driver and t.status = 'andamento')
    into v_busy_driver;
  if v_busy_vehicle or v_busy_driver then
    if p_end is null then
      raise exception '%', case when v_busy_driver
          then 'Há outra viagem sua em andamento no servidor. Esta será enviada quando ela for encerrada.'
          else 'O veículo está em viagem de outro motorista no servidor. Esta será enviada quando ela for encerrada.' end
        using errcode = 'SR002';
    end if;
  end if;
  if p_end is not null and (v_busy_vehicle or v_busy_driver) then
    begin
      v_end := sgf_private.sync_trip_end_values(p_tenant, v_start_at, v_odo, p_end_occurred, p_end);
    exception when others then
      -- Fim inválido não derruba o início: este espera; o fim é recusado no próprio evento.
      raise exception 'Viagem em andamento no servidor para este veículo ou motorista. Esta será enviada quando ela for encerrada.'
        using errcode = 'SR002';
    end;
    v_status := 'concluida';
    v_review := v_review || array(select jsonb_array_elements_text(v_end->'review'));
  end if;

  -- Sobreposição de horário com viagem de outro motorista no mesmo veículo, ou
  -- com outra viagem do mesmo motorista (sem rede não dá para impedir).
  if exists (select 1 from public.trips t
              where t.vehicle_id = v_vehicle.id and t.driver_id <> p_driver
                and t.status <> 'cancelada'
                and t.start_at < coalesce((v_end->>'end_at')::timestamptz, now())
                and coalesce(t.end_at, now()) > v_start_at) then
    v_review := v_review || 'sobreposicao_veiculo'::text;
  end if;
  if exists (select 1 from public.trips t
              where t.driver_id = p_driver
                and t.status <> 'cancelada'
                and t.start_at < coalesce((v_end->>'end_at')::timestamptz, now())
                and coalesce(t.end_at, now()) > v_start_at) then
    v_review := v_review || 'sobreposicao_motorista'::text;
  end if;

  perform set_config('app.offline_sync', 'on', true);
  insert into public.trips (
    id, client_id, driver_id, vehicle_id, tenant_id, status,
    destination, origin, purpose, purpose_category, passenger_count, passengers, cargo_description,
    start_odometer, start_odometer_photo_url, start_at,
    end_odometer, end_odometer_photo_url, end_at, distance_km, notes, server_ended_at
  ) values (
    v_trip_id, v_trip_id, p_driver, v_vehicle.id, p_tenant, v_status,
    v_dest, v_origin, v_purpose, v_cat, v_pcount, v_passengers, v_cargo,
    v_odo, v_photo, v_start_at,
    (v_end->>'end_odometer')::integer, v_end->>'photo', (v_end->>'end_at')::timestamptz,
    (v_end->>'end_odometer')::integer - v_odo, v_end->>'notes',
    case when v_end is not null then now() end
  );
  perform set_config('app.offline_sync', 'off', true);

  if v_checklist is not null then
    update public.checklists set trip_id = v_trip_id
     where id = v_checklist and trip_id is null;
  end if;

  return jsonb_build_object(
    'trip_id', v_trip_id,
    'status', v_status,
    'checklist_id', v_checklist,
    'review', to_jsonb(v_review));
end;
$$;

create or replace function sgf_private.sync_apply_trip_end(
  p_driver uuid, p_tenant uuid, p_occurred timestamptz, p jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_reason constant text :=
    'Encerramento feito no app sem internet e recebido depois que a viagem já tinha sido encerrada automaticamente.';
  v_trip_id uuid;
  v_trip public.trips%rowtype;
  v_vals jsonb;
  v_review text[];
  v_end integer;
  v_end_at timestamptz;
  v_notes text;
begin
  begin
    v_trip_id := (p->>'trip_id')::uuid;
  exception when others then
    raise exception 'Identificador da viagem inválido.' using errcode = 'SY001';
  end;
  if v_trip_id is null then
    raise exception 'Identificador da viagem ausente.' using errcode = 'SY001';
  end if;

  select * into v_trip from public.trips t where t.id = v_trip_id for update;
  if not found then
    -- O início ainda não chegou (fila fora de ordem ou falha passageira).
    raise exception 'A viagem ainda não chegou ao servidor.' using errcode = 'SR001';
  end if;
  if v_trip.driver_id <> p_driver or v_trip.tenant_id <> p_tenant then
    raise exception 'Viagem de outro motorista.' using errcode = 'SY001';
  end if;

  v_vals := sgf_private.sync_trip_end_values(p_tenant, v_trip.start_at, v_trip.start_odometer, p_occurred, p);
  v_review := array(select jsonb_array_elements_text(v_vals->'review'));
  v_end := (v_vals->>'end_odometer')::integer;
  v_end_at := (v_vals->>'end_at')::timestamptz;

  if v_trip.status = 'andamento' then
    update public.trips
       set end_odometer = v_end,
           distance_km = greatest(0, v_end - coalesce(start_odometer, v_end)),
           notes = v_vals->>'notes',
           end_odometer_photo_url = v_vals->>'photo',
           end_at = v_end_at,
           status = 'concluida'
     where id = v_trip_id;
    update public.live_positions set is_active = false, updated_at = now()
     where trip_id = v_trip_id and is_active;
    return jsonb_build_object('trip_id', v_trip_id, 'status', 'concluida', 'review', to_jsonb(v_review));
  end if;

  if v_trip.status = 'concluida' then
    -- Já encerrada com estes mesmos dados (o início veio com o fim no lote).
    if v_trip.end_odometer is not distinct from v_end and v_trip.end_at = v_end_at then
      return jsonb_build_object('trip_id', v_trip_id, 'status', 'concluida', 'already_applied', true,
                                'review', '[]'::jsonb);
    end if;

    -- Fechada pelo servidor por inatividade (sem hodômetro final): completa com
    -- os dados do motorista e registra a retificação (trip_corrections).
    if v_trip.end_odometer is null then
      v_notes := concat_ws(E'\n', nullif(v_trip.notes, ''), v_vals->>'notes');
      insert into public.trip_corrections (tenant_id, trip_id, field, old_value, new_value, reason, corrected_by)
      select v_trip.tenant_id, v_trip_id, c.field, c.old_v, c.new_v, c_reason, p_driver
        from (values
          ('end_odometer', null::text,       v_end::text),
          ('end_at',       v_trip.end_at::text, v_end_at::text),
          ('notes',        v_trip.notes,      v_notes)
        ) as c(field, old_v, new_v)
       where c.old_v is distinct from c.new_v;

      perform set_config('app.trip_rpc', 'on', true);
      update public.trips
         set end_odometer = v_end,
             distance_km = greatest(0, v_end - coalesce(start_odometer, v_end)),
             end_at = v_end_at,
             notes = v_notes,
             end_odometer_photo_url = coalesce(v_vals->>'photo', end_odometer_photo_url)
       where id = v_trip_id;
      perform set_config('app.trip_rpc', 'off', true);

      return jsonb_build_object('trip_id', v_trip_id, 'status', 'concluida',
        'review', to_jsonb(v_review || 'encerramento_corrigido'::text));
    end if;
  end if;

  -- Encerrada por outro caminho (troca de motorista, gestor) ou cancelada:
  -- não sobrescreve. Os dados do motorista ficam no recibo para o gestor.
  return jsonb_build_object(
    'trip_id', v_trip_id, 'status', v_trip.status, 'not_applied', true,
    'driver_end', v_vals - 'review',
    'review', to_jsonb(v_review || case when v_trip.status = 'cancelada'
                                        then 'viagem_cancelada' else 'ja_encerrada' end));
end;
$$;

-- ─── D. driver_sync_push com viagem ────────────────────────────────────────
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
  -- Ids (checklist/viagem) de eventos deste lote que ficaram para depois:
  -- quem depende deles também espera, para nunca aplicar fora de ordem.
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

      elsif v_type = 'trip.start' then
        if v_event->'payload'->>'checklist_id' = any(v_waiting) then
          raise exception 'Aguardando o envio do checklist.' using errcode = 'SR003';
        end if;
        -- O fim da mesma viagem veio no lote? (usado só se o veículo/motorista
        -- estiver com outra viagem em andamento no servidor)
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
        -- Recusa definitiva (dado inválido): recibo para não reprocessar.
        begin
          insert into public.sync_receipts (driver_id, event_id, tenant_id, event_type, payload_hash, status, result, occurred_at)
          values (v_uid, v_event_id, v_profile.tenant_id, left(v_type, 64), v_hash, 'rejected',
                  jsonb_build_object('error', left(v_msg, 300)), v_occurred);
        exception when others then null;
        end;
        v_results := v_results || jsonb_build_object('event_id', v_event_id, 'status', 'rejected', 'error', left(v_msg, 300));
      else
        -- Falha passageira ou dependência ainda não atendida (SR*): sem recibo,
        -- o app tenta de novo. Quem depende deste evento no lote também espera.
        v_waiting := v_waiting || array_remove(array[
          v_event->'payload'->>'checklist_id', v_event->'payload'->>'trip_id'], null);
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
revoke all on function sgf_private.sync_photo_ok(uuid, text) from public, anon, authenticated;
revoke all on function sgf_private.sync_trip_end_values(uuid, timestamptz, integer, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function sgf_private.sync_apply_trip_start(uuid, uuid, timestamptz, jsonb, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function sgf_private.sync_apply_trip_end(uuid, uuid, timestamptz, jsonb) from public, anon, authenticated;
