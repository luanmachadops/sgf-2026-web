-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoria 2026-07 · Correções CRÍTICO #1, CRÍTICO #2, ALTO #3 e reforço da
-- ALTO #7 (checklist crítico) — tudo aplicado como TRIGGER BEFORE INSERT em
-- `trips`, com mensagens de erro distintas por motivo (prefixo reconhecível
-- pelo app em src/lib/data.ts → startTrip).
--
-- Por que trigger e não CHECK/WITH CHECK: as regras precisam consultar outras
-- tabelas (profiles, vehicles, checklists, checklist_items), o que CHECK
-- constraints não suportam. Um único WITH CHECK também não permite distinguir
-- POR QUE a operação foi negada — aqui cada motivo levanta uma exceção com
-- mensagem própria, que o app traduz para o motorista.
--
-- Guardas implementadas (nesta ordem):
--   1. Motorista bloqueado (profiles.access_blocked = true)              → TRIP_GUARD_DRIVER_BLOCKED
--   2. Motorista inativo (profiles.driver_status <> 'ativo')             → TRIP_GUARD_DRIVER_STATUS
--   3. CNH vencida OU sem data cadastrada (profiles.cnh_expiry)          → TRIP_GUARD_CNH_EXPIRED
--   4. Veículo não liberado (vehicles.status <> 'liberado')              → TRIP_GUARD_VEHICLE_STATUS
--   5. Sem checklist do dia para o par motorista/veículo                 → TRIP_GUARD_CHECKLIST_MISSING
--   6. Checklist crítico (freios/pneus/luzes) reprovado em aberto        → TRIP_GUARD_CHECKLIST_CRITICAL
--
-- Decisão documentada — CNH sem data cadastrada (cnh_expiry IS NULL):
--   BLOQUEIA a viagem. Justificativa: a ausência do dado é, do ponto de vista
--   de compliance, equivalente a não poder comprovar habilitação válida. Isso
--   força o cadastro a ser completado (tela de perfil/first-access) antes do
--   motorista rodar. Verificado por SELECT que os 3 perfis com role='motorista'
--   hoje têm cnh_expiry preenchida e futura (2026-09-02, 2026-07-30,
--   2034-06-04) — nenhum motorista real é bloqueado por esta migration no
--   momento em que ela é aplicada.
--
-- Verificado antes de aplicar (SELECT, projeto kgxdrgbxpfoebzrphtqg):
--   - vehicles.status é enum vehicle_status ('liberado','manutencao','bloqueado');
--     hoje 100% das linhas (94) estão 'liberado' — nenhum veículo é bloqueado
--     retroativamente por esta migration (ela só atua em INSERT futuro).
--   - profiles: todos os motoristas ativos, access_blocked=false hoje.
--   - checklist_items: nenhuma linha com state='atencao' hoje — não há
--     checklist crítico "preso" em aberto que bloquearia uma viagem legítima
--     assim que esta migration for aplicada.
--
-- Não quebra as RPCs SECURITY DEFINER (takeover_vehicle, release_stale_trip,
-- auto_close_abandoned_trips): a trigger é BEFORE INSERT apenas. As três RPCs
-- só fazem UPDATE em trips (nunca INSERT) — a guarda não é executada por elas.
-- O único caminho de INSERT em `trips` é `startTrip` (src/lib/data.ts), que é
-- exatamente onde essas regras de negócio devem valer.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tf_trip_insert_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_driver        record;
  v_vehicle       record;
  v_today_start   timestamptz := date_trunc('day', now());
  v_has_pair      boolean;
  v_latest_full   uuid;
  v_has_critical  boolean;
begin
  -- ── Guarda 2: motorista bloqueado / inativo / CNH vencida ────────────────
  select p.access_blocked, p.driver_status, p.cnh_expiry
    into v_driver
    from public.profiles p
   where p.id = new.driver_id;

  if not found then
    raise exception 'TRIP_GUARD_DRIVER_NOT_FOUND: motorista não encontrado.'
      using errcode = 'TR001';
  end if;

  if coalesce(v_driver.access_blocked, false) then
    raise exception 'TRIP_GUARD_DRIVER_BLOCKED: seu acesso está bloqueado. Procure a administração.'
      using errcode = 'TR002';
  end if;

  if coalesce(v_driver.driver_status, 'ativo') <> 'ativo' then
    raise exception 'TRIP_GUARD_DRIVER_STATUS: seu cadastro não está ativo (status: %). Procure a administração.', v_driver.driver_status
      using errcode = 'TR003';
  end if;

  -- CNH nula é tratada como vencida (decisão documentada no cabeçalho desta migration).
  if v_driver.cnh_expiry is null or v_driver.cnh_expiry < current_date then
    raise exception 'TRIP_GUARD_CNH_EXPIRED: sua CNH está vencida ou sem data cadastrada. Atualize seu cadastro antes de iniciar uma viagem.'
      using errcode = 'TR004';
  end if;

  -- ── Guarda 3: veículo precisa estar liberado ─────────────────────────────
  select v.status into v_vehicle
    from public.vehicles v
   where v.id = new.vehicle_id;

  if not found then
    raise exception 'TRIP_GUARD_VEHICLE_NOT_FOUND: veículo não encontrado.'
      using errcode = 'TR005';
  end if;

  if v_vehicle.status <> 'liberado' then
    raise exception 'TRIP_GUARD_VEHICLE_STATUS: veículo indisponível (status atual: %). Não é possível iniciar viagem.', v_vehicle.status
      using errcode = 'TR006';
  end if;

  -- ── Guarda 1: checklist do dia obrigatório para o par motorista/veículo ──
  select exists (
    select 1
      from public.checklists c
     where c.driver_id = new.driver_id
       and c.vehicle_id = new.vehicle_id
       and c.created_at >= v_today_start
  ) into v_has_pair;

  if not v_has_pair then
    raise exception 'TRIP_GUARD_CHECKLIST_MISSING: é necessário registrar o checklist de hoje para este veículo antes de iniciar a viagem.'
      using errcode = 'TR007';
  end if;

  -- ── Guarda 7 (reforço no banco): item crítico reprovado em aberto ────────
  -- Considera o checklist COMPLETO (quick_confirm = false) mais recente feito
  -- HOJE para este veículo, por qualquer motorista — é o mesmo critério usado
  -- por getTodayChecklist() no app (src/lib/data.ts) para oferecer o atalho
  -- de confirmação rápida. Itens críticos: freios, pneus, luzes
  -- (CHECKLIST_TEMPLATE em src/lib/types.ts).
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
      raise exception 'TRIP_GUARD_CHECKLIST_CRITICAL: o checklist de hoje deste veículo reprovou um item crítico (freios, pneus ou luzes). A viagem não pode ser iniciada até a correção.'
        using errcode = 'TR008';
    end if;
  end if;

  return new;
end;
$function$;

create trigger trg_trip_insert_guard
  before insert on public.trips
  for each row execute function public.tf_trip_insert_guard();
