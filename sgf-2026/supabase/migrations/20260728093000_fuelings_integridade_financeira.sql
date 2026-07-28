-- ============================================================================
-- ABASTECIMENTOS — INTEGRIDADE FINANCEIRA E AUTORIZAÇÃO
--
-- Auditoria 2026-07. `public.fuelings` não possuía NENHUM CHECK constraint e
-- nenhum trigger de validação de valor/autorização. As policies do motorista
-- restringiam apenas a IDENTIDADE (`auth.uid() = driver_id`), nunca o VALOR
-- nem o ESTADO do registro.
--
-- Vetor de fraude confirmado: com o próprio token e a API REST, um motorista
-- fazia INSERT com litros/valor arbitrários e `workflow_status` já efetivo,
-- sem posto, sem gestor e sem passar pela RPC `manager_review_fueling` (onde
-- vive a exigência de foto do bico e cupom).
--
-- Agravante encontrado na auditoria: o DEFAULT da coluna já é
-- 'lancado_direto' — um estado que o resto do sistema trata como despesa
-- efetivada (entra no histórico de hodômetro e no empenho da licitação).
-- O motorista nem precisava informar o estado: bastava inserir.
--
-- ESTRATÉGIA (ver relatório para justificativa completa):
--   • CHECK     → invariantes de valor que valem para QUALQUER origem.
--   • POLICY    → o que é decidível olhando só a linha final (RLS não vê OLD).
--   • TRIGGER   → transição de estado e imutabilidade de coluna (exigem
--                 comparar OLD vs NEW, algo que RLS não consegue fazer).
--
-- COMPATIBILIDADE: as RPCs de gestor/posto são SECURITY DEFINER (owner
-- `postgres`) e portanto ignoram RLS, mas DISPARAM triggers. As regras rígidas
-- abaixo foram calibradas contra o código real de
-- `manager_create_fueling_authorization`, `manager_create_direct_fueling`,
-- `partner_complete_fueling(_v2)` e `manager_review_fueling`.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CHECK CONSTRAINTS
--
-- Os valores NÃO podem ser exigidos de forma incondicional. Verificado no banco:
-- `manager_create_fueling_authorization` insere, por design, a autorização
-- ANTES do abastecimento acontecer, com `liters = 0` e `total_cost = NULL`
-- (os litros só são conhecidos quando o posto conclui). Um CHECK
-- `liters > 0` global quebraria o fluxo legítimo do gestor.
--
-- Por isso o rigor é condicionado ao estado FINANCEIRAMENTE EFETIVO —
-- 'validado' e 'lancado_direto' — que é exatamente o conjunto que o resto do
-- sistema usa como despesa real (ver `station_contract_committed` e as
-- consultas de hodômetro anterior nas RPCs).
--
-- Os 8 registros existentes foram conferidos um a um e TODOS passam nos três
-- constraints, portanto são criados VALID (sem NOT VALID).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. Estados efetivos exigem dinheiro completo e coerente.
alter table public.fuelings
  add constraint chk_fuelings_valores_efetivos
  check (
    workflow_status not in ('validado', 'lancado_direto')
    or (
          liters          is not null and liters          > 0
      and price_per_liter is not null and price_per_liter > 0
      and total_cost      is not null and total_cost      > 0
      and abs(total_cost - liters * price_per_liter) < 0.05
    )
  );

-- 1b. Sinais válidos em qualquer estado. `liters >= 0` (e não > 0) porque a
--     autorização do gestor nasce legitimamente com 0 litros.
--     NOTA sobre NULL: um CHECK com NULL resulta em UNKNOWN e PASSA. Isso é
--     intencional aqui — as colunas são nullable e os estados não-efetivos
--     realmente não têm valor ainda. O rigor sobre NULL está em 1a.
alter table public.fuelings
  add constraint chk_fuelings_valores_sinal
  check (
        (liters          is null or liters          >= 0)
    and (price_per_liter is null or price_per_liter >  0)
    and (total_cost      is null or total_cost      >= 0)
    and (odometer        is null or odometer        >= 0)
    and (max_liters      is null or max_liters      >  0)
  );

-- 1c. Coerência aritmética sempre que os três valores estiverem preenchidos.
--     Pega a fraude clássica "1 litro, R$ 5.000" mesmo em 'concluido'
--     (registro ainda pendente de validação do gestor).
alter table public.fuelings
  add constraint chk_fuelings_coerencia_valor
  check (
    liters is null or price_per_liter is null or total_cost is null
    or liters <= 0
    or abs(total_cost - liters * price_per_liter) < 0.05
  );

comment on constraint chk_fuelings_valores_efetivos on public.fuelings is
  'Despesa efetivada (validado/lancado_direto) exige litros, preço e total positivos e aritmeticamente coerentes.';
comment on constraint chk_fuelings_coerencia_valor on public.fuelings is
  'total_cost deve bater com liters * price_per_liter (tolerância de R$ 0,05 para arredondamento).';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DETECÇÃO DE CONTEXTO
--
-- As RPCs legítimas são SECURITY DEFINER com owner `postgres`; dentro delas
-- `current_user` = 'postgres'. Uma escrita direta via PostgREST roda com
-- `current_user` = 'authenticated'.
--
-- A função é SECURITY INVOKER (padrão) DE PROPÓSITO: se fosse DEFINER,
-- `current_user` viraria o owner e a detecção sempre diria "confiável".
--
-- Escopo deliberadamente estreito (motorista via REST): o portal web do gestor
-- foi auditado e escreve em fuelings EXCLUSIVAMENTE via RPC
-- (web/src/lib/supabase-api.ts), mas as policies de admin/gestor/secretário
-- ainda permitem escrita direta. Restringir a checagem ao motorista evita
-- quebrar esses caminhos administrativos.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.fueling_escrita_direta_motorista()
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  -- Fail-open para papéis inesperados: só tratamos como não-confiável o que
  -- comprovadamente vem de sessão PostgREST. Preferimos não bloquear um fluxo
  -- legítimo desconhecido — as invariantes de dinheiro (seção 1) valem para
  -- todas as origens de qualquer forma.
  if current_user not in ('authenticated', 'anon') then
    return false;
  end if;
  return public.is_motorista();
end
$$;

comment on function public.fueling_escrita_direta_motorista() is
  'True quando a escrita em fuelings vem de um motorista direto na API REST (fora das RPCs SECURITY DEFINER).';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TRIGGER DE GUARDA
--
-- Faz o que RLS estruturalmente NÃO consegue: comparar OLD com NEW.
-- Uma policy só enxerga a linha original no USING e a linha final no
-- WITH CHECK; ela nunca vê a TRANSIÇÃO. Logo, "não pode ir de pendente para
-- validado" e "não pode alterar total_cost" são necessariamente trigger.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_fuelings_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_direto        boolean;
  v_veh_fuel      text;
  v_fuel          text;
  v_ref_odometer  integer;
  v_prev_fueling  integer;
begin
  v_direto := public.fueling_escrita_direta_motorista();

  -- ══════════════════════════════════════════════════════════════════════════
  -- A. COMPATIBILIDADE DE COMBUSTÍVEL — vale para TODAS as origens.
  --
  -- Seguro para as RPCs: todas elas já validam compatibilidade e levantam
  -- exceção antes de inserir, então aqui a regra é redundante para o fluxo
  -- legítimo e só morde a escrita direta.
  -- ══════════════════════════════════════════════════════════════════════════
  if new.fuel_type is not null and new.vehicle_id is not null
     and (tg_op = 'INSERT'
          or new.fuel_type  is distinct from old.fuel_type
          or new.vehicle_id is distinct from old.vehicle_id) then

    select v.fuel_type::text into v_veh_fuel
      from public.vehicles v where v.id = new.vehicle_id;

    v_fuel := lower(trim(new.fuel_type));
    -- Normalização alinhada às RPCs, MAIS os rótulos que o app realmente
    -- oferece (src/lib/types.ts: FUEL_TYPES inclui 'Diesel S-10' e 'GNV').
    v_fuel := case
      when v_fuel in ('gasoline')                 then 'gasolina'
      when v_fuel in ('ethanol', 'álcool', 'alcool') then 'etanol'
      when v_fuel like 'diesel%'                  then 'diesel'
      else v_fuel
    end;

    -- Só julgamos quando o combustível informado é representável no enum
    -- `fuel_type_enum` do veículo. 'GNV', por exemplo, não é — o cadastro do
    -- veículo não consegue expressá-lo, então bloquear seria falso positivo.
    if v_veh_fuel is not null and v_fuel in ('diesel', 'gasolina', 'etanol') then
      if v_veh_fuel = 'flex' and v_fuel not in ('gasolina', 'etanol') then
        raise exception 'Veículo flex aceita apenas gasolina ou etanol (informado: %)', new.fuel_type
          using errcode = 'check_violation';
      elsif v_veh_fuel <> 'flex' and v_veh_fuel <> v_fuel then
        raise exception 'Combustível % incompatível com o veículo (cadastrado: %)', new.fuel_type, v_veh_fuel
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  -- Daqui para baixo: apenas escrita direta de motorista.
  if not v_direto then
    return new;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- B. INSERT DIRETO DE MOTORISTA
  --
  -- Coerção em vez de exceção: o app (app/(tabs)/fuel.tsx → createFueling)
  -- NÃO envia workflow_status, então o DEFAULT 'lancado_direto' entrava como
  -- despesa efetivada sem revisão. Levantar exceção quebraria a tela; a
  -- coerção mantém o app funcionando e joga o registro para 'concluido'
  -- (aguardando validação do gestor), que é o estado inicial legítimo de uma
  -- submissão de motorista.
  -- ══════════════════════════════════════════════════════════════════════════
  if tg_op = 'INSERT' then
    new.workflow_status     := 'concluido';
    new.validated_at        := null;
    new.validated_by        := null;
    new.authorized_by       := null;
    new.authorized_at       := null;
    new.filled_by           := null;
    new.filled_at           := null;
    new.cancelled_at        := null;
    new.cancelled_by        := null;
    new.cancellation_reason := null;
    new.expires_at          := null;
    new.max_liters          := null;
    -- km/L é derivado pelo gestor na validação; motorista não declara.
    new.km_per_liter        := null;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- C. UPDATE DIRETO DE MOTORISTA — transição de estado e imutabilidade.
  -- ══════════════════════════════════════════════════════════════════════════
  if tg_op = 'UPDATE' then

    -- C1. Linha já validada / encerrada é intocável pelo motorista.
    if old.validated_at is not null
       or old.workflow_status in ('validado', 'lancado_direto', 'rejeitado_admin') then
      raise exception 'Abastecimento já validado ou encerrado não pode ser alterado pelo motorista'
        using errcode = 'insufficient_privilege';
    end if;

    -- C2. Transições permitidas: somente a partir de uma autorização aberta.
    if not (old.workflow_status = 'autorizado'
            and new.workflow_status in ('concluido', 'rejeitado_motorista')) then
      raise exception 'Transição de % para % não permitida ao motorista',
        old.workflow_status, new.workflow_status
        using errcode = 'insufficient_privilege';
    end if;

    -- C3. Colunas de autorização/validação são imutáveis para o motorista.
    --     É AQUI que se impede "carimbar-se como validado" — RLS não veria.
    if new.validated_at  is distinct from old.validated_at
       or new.validated_by  is distinct from old.validated_by
       or new.authorized_by is distinct from old.authorized_by
       or new.authorized_at is distinct from old.authorized_at
       or new.station_id    is distinct from old.station_id
       or new.tenant_id     is distinct from old.tenant_id
       or new.vehicle_id    is distinct from old.vehicle_id
       or new.max_liters    is distinct from old.max_liters
       or new.expires_at    is distinct from old.expires_at
       or new.filled_by     is distinct from old.filled_by
       or new.cancelled_by  is distinct from old.cancelled_by then
      raise exception 'Motorista não pode alterar dados de autorização ou validação do abastecimento'
        using errcode = 'insufficient_privilege';
    end if;

    -- C4. Respeita o teto de litros da autorização do gestor.
    if new.liters is not null and old.max_liters is not null
       and new.liters > old.max_liters then
      raise exception 'Litros acima do autorizado (máximo % L)', old.max_liters
        using errcode = 'check_violation';
    end if;

    new.km_per_liter := old.km_per_liter;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- D. HODÔMETRO NÃO-DECRESCENTE — apenas escrita direta de motorista.
  --
  -- POR QUE NÃO PARA TODAS AS ORIGENS: os três fluxos legítimos tratam
  -- regressão de hodômetro como ANOMALIA A SINALIZAR, não como erro:
  --   • manager_create_direct_fueling  → lançamento RETROATIVO (p_occurred_on
  --     no passado); marca has_anomaly e segue.
  --   • partner_complete_fueling       → odômetro digitado pelo frentista;
  --     marca has_anomaly e segue.
  --   • manager_review_fueling         → idem na aprovação.
  -- Um bloqueio rígido global quebraria os três. Mantemos a semântica deles e
  -- endurecemos só a porta que estava aberta.
  --
  -- Usa >= (não >) para não rejeitar complemento de tanque no mesmo hodômetro.
  -- ══════════════════════════════════════════════════════════════════════════
  if new.odometer is not null and new.odometer > 0 and new.vehicle_id is not null
     and (tg_op = 'INSERT' or new.odometer is distinct from old.odometer) then

    select v.current_odometer into v_ref_odometer
      from public.vehicles v where v.id = new.vehicle_id;

    select f.odometer into v_prev_fueling
      from public.fuelings f
     where f.vehicle_id = new.vehicle_id
       and f.id <> new.id
       and f.workflow_status in ('validado', 'lancado_direto')
       and f.odometer is not null
     order by coalesce(f.filled_at, f.created_at) desc
     limit 1;

    v_ref_odometer := greatest(coalesce(v_ref_odometer, 0), coalesce(v_prev_fueling, 0));

    if v_ref_odometer > 0 and new.odometer < v_ref_odometer then
      raise exception 'Hodômetro informado (% km) é menor que o último registrado (% km)',
        new.odometer, v_ref_odometer
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end
$$;

comment on function public.tg_fuelings_guard() is
  'Guarda de fuelings: compatibilidade de combustível (toda origem) e, para escrita direta de motorista, estado inicial, imutabilidade de colunas de validação e hodômetro não-decrescente.';

drop trigger if exists trg_fuelings_guard on public.fuelings;
create trigger trg_fuelings_guard
  before insert or update on public.fuelings
  for each row execute function public.tg_fuelings_guard();


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

-- 4a. INSERT do motorista: identidade + estado inicial + nenhum carimbo de
--     autorização/validação. A coerção do trigger (seção B) roda ANTES do
--     WITH CHECK, então o app continua passando sem alteração de código.
drop policy if exists fuelings_insert_own on public.fuelings;
create policy fuelings_insert_own on public.fuelings
  for insert
  with check (
    auth.uid() = driver_id
    and workflow_status = 'concluido'
    and validated_at  is null
    and validated_by  is null
    and authorized_by is null
    and authorized_at is null
    and filled_by     is null
    and cancelled_at  is null
    and cancelled_by  is null
  );

-- 4b. UPDATE do motorista sobre autorização do gestor.
--     USING  → barra linha já validada/encerrada (decidível na linha original).
--     CHECK  → barra estado final validado (decidível na linha final).
--     A proibição de MUDAR total_cost/liters/validated_by fica no trigger,
--     porque depende de OLD vs NEW.
drop policy if exists fuelings_motorista_vehicle_auth_update on public.fuelings;
create policy fuelings_motorista_vehicle_auth_update on public.fuelings
  for update
  using (
    is_motorista()
    and vehicle_id = get_user_current_vehicle_id()
    and (driver_id is null or driver_id = auth.uid())
    and workflow_status = 'autorizado'
    and validated_at is null
    and cancelled_at is null
  )
  with check (
    is_motorista()
    and vehicle_id = get_user_current_vehicle_id()
    and driver_id = auth.uid()
    and workflow_status in ('concluido', 'rejeitado_motorista')
    and validated_at is null
    and validated_by is null
  );

comment on policy fuelings_insert_own on public.fuelings is
  'Motorista registra abastecimento apenas como próprio e em estado inicial concluido (aguardando validação).';
comment on policy fuelings_motorista_vehicle_auth_update on public.fuelings is
  'Motorista só movimenta autorização aberta do seu veículo para concluido/rejeitado_motorista; nunca para estado validado.';

commit;
