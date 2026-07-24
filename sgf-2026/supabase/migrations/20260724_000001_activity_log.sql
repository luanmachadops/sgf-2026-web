-- ============================================================================
-- FASE 1 — Trilha de auditoria (activity_log)
--
-- STATUS: *** NÃO APLICADA *** — aguardando revisão e aprovação do usuário.
--
-- Registra as movimentações do painel do gestor e do app do motorista numa
-- tabela append-only, para fins de auditoria (TCE / controle interno).
--
-- Decisões fechadas com o usuário:
--   • Grava daqui pra frente — sem backfill do histórico.
--   • Entidades: usuário, motorista, veículo, abastecimento, checklist,
--     O.S. e posto. Viagem fica de fora (já coberta pelo histórico de viagens).
--   • Retenção de 5 anos completos, com aviso ao gestor/superadmin a 90/30/7
--     dias do expurgo; expurgo bloqueado se o aviso de 90 dias não constar.
--   • Identificação por CPF + snapshot de nome e secretaria (ator e entidade).
--   • Acesso por sensibilidade: 'operacional' o gestor vê (e o motorista vê as
--     próprias); 'sensivel' (exclusões, mudanças de usuário/permissão, login,
--     edição retroativa de abastecimento) só o superadmin.
-- ============================================================================


-- ── Passo 0: CPF não-duplicado ──────────────────────────────────────────────
-- `cpf` e `department_id` já existem em profiles. O que falta é impedir
-- duplicata. NÃO usamos NOT NULL: a conta técnica de superadmin não tem CPF
-- e um NOT NULL quebraria o cadastro dela. A obrigatoriedade para pessoas
-- reais fica no formulário do painel (fora desta migration).
create unique index if not exists uq_profiles_tenant_cpf
  on public.profiles (tenant_id, cpf)
  where cpf is not null and cpf <> '';

-- Autoria nas operações que rodam com service_role. O cadastro de motorista e
-- de usuário do painel acontece nas serverless (web/api), que usam service_role
-- — ali `auth.uid()` é NULL e o ator se perderia. A identidade já é conhecida
-- na serverless (getCaller); estas colunas a trazem para dentro do banco, onde
-- a trigger a lê.
-- Optamos por carimbar na linha em vez de GUC de sessão (set_config): o pooler
-- do Supabase não garante que o RPC que seta a variável e o INSERT caiam na
-- mesma conexão — seria intermitente, e log intermitente é pior que log ausente.
alter table public.profiles
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

comment on column public.profiles.created_by is
  'Quem criou este perfil, quando a criação passou por serverless com service_role (auth.uid() nulo).';
comment on column public.profiles.updated_by is
  'Quem alterou este perfil por último via serverless com service_role.';


-- ── Tabela principal ────────────────────────────────────────────────────────
create table if not exists public.activity_log (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  created_at    timestamptz not null default now(),

  -- QUEM fez (snapshots: precisam sobreviver à exclusão do usuário)
  actor_id              uuid,
  actor_name            text,
  actor_cpf             text,
  actor_role            text,
  actor_department_id   uuid,
  actor_department_name text,
  -- true quando não foi possível identificar plenamente o ator (ex.: sem CPF).
  -- Deixa a lacuna visível no relatório em vez de silenciosa.
  actor_incomplete      boolean not null default false,

  -- SOBRE QUEM / o quê
  entity_type            text not null,  -- user|driver|vehicle|fueling|checklist|service_order|station
  entity_id              uuid,
  entity_label           text,           -- placa, nome, nº da O.S. — snapshot legível
  entity_cpf             text,           -- nulo quando a entidade não é pessoa
  entity_department_id   uuid,
  entity_department_name text,

  action      text not null,  -- create|update|delete|approve|reject|login|purge
  source      text not null default 'web_gestor',  -- web_gestor|app_motorista|sistema
  sensitivity text not null default 'operacional', -- operacional|sensivel

  changes  jsonb,  -- { campo: {"de": ..., "para": ...} } — só o que mudou
  snapshot jsonb,  -- linha inteira, gravada apenas em delete

  constraint activity_log_action_chk
    check (action in ('create','update','delete','approve','reject','login',
                      'purge','reset_password','block_access')),
  constraint activity_log_sensitivity_chk
    check (sensitivity in ('operacional','sensivel')),
  constraint activity_log_source_chk
    check (source in ('web_gestor','app_motorista','sistema'))
);

comment on table public.activity_log is
  'Trilha de auditoria append-only. Ninguém pode UPDATE/DELETE — apenas a função de expurgo (SECURITY DEFINER), que se auto-registra.';
comment on column public.activity_log.actor_incomplete is
  'Ator sem CPF cadastrado no momento do fato. Como o log é imutável, não pode ser corrigido depois.';
comment on column public.activity_log.sensitivity is
  'operacional = gestor vê; sensivel = só superadmin (exclusões, permissões, login, edição retroativa).';

create index if not exists idx_activity_log_tenant_date
  on public.activity_log (tenant_id, created_at desc);
create index if not exists idx_activity_log_entity
  on public.activity_log (tenant_id, entity_type, created_at desc);
create index if not exists idx_activity_log_actor
  on public.activity_log (tenant_id, actor_id, created_at desc);
-- Filtro por secretaria = ator OU entidade. Dois índices, um para cada lado.
create index if not exists idx_activity_log_actor_dept
  on public.activity_log (tenant_id, actor_department_id, created_at desc);
create index if not exists idx_activity_log_entity_dept
  on public.activity_log (tenant_id, entity_department_id, created_at desc);
create index if not exists idx_activity_log_sensitivity
  on public.activity_log (tenant_id, sensitivity, created_at desc);


-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.activity_log enable row level security;
-- FORCE remove o bypass automático do DONO da tabela. Atenção ao alcance real:
-- ele NÃO anula o atributo BYPASSRLS — `postgres` e `service_role` continuam
-- passando por cima da RLS. A trilha é imutável para todo acesso via app
-- (role `authenticated`: gestor, motorista, superadmin logado), não contra quem
-- detém a service_role key. Mitigação: a chave só existe no servidor e o
-- expurgo se auto-registra.
alter table public.activity_log force row level security;

-- Defesa em profundidade: o Supabase concede INSERT/UPDATE/DELETE/TRUNCATE a
-- `authenticated` e `anon` por padrão em toda tabela nova do schema public.
-- Hoje só a RLS segura; revogamos o privilégio para que um erro futuro de
-- policy não abra a escrita. A trigger é SECURITY DEFINER e não depende disto.
revoke all on public.activity_log from authenticated, anon;
grant select on public.activity_log to authenticated;

-- Superadmin: enxerga tudo, inclusive o que é sensível.
drop policy if exists activity_log_select_superadmin on public.activity_log;
create policy activity_log_select_superadmin on public.activity_log
  for select to authenticated
  using (public.is_superadmin());

-- Gestor/admin: só o operacional do próprio tenant. Não vê a trilha que
-- registra os atos dele — quem é auditado não controla a própria prova.
drop policy if exists activity_log_select_manager on public.activity_log;
create policy activity_log_select_manager on public.activity_log
  for select to authenticated
  using (
    tenant_id = public.get_user_tenant_id()
    and sensitivity = 'operacional'
    and public.is_admin_or_manager()
  );

-- Motorista: apenas as próprias atividades operacionais (tela "Minhas
-- atividades" no app).
drop policy if exists activity_log_select_own on public.activity_log;
create policy activity_log_select_own on public.activity_log
  for select to authenticated
  using (
    tenant_id = public.get_user_tenant_id()
    and sensitivity = 'operacional'
    and actor_id = auth.uid()
  );

-- Sem policy de INSERT: a escrita passa só pela trigger (SECURITY DEFINER).
-- Sem policy de UPDATE e DELETE: propositalmente. É o que torna a trilha prova.


-- ── Função de gravação (usada pelas triggers) ───────────────────────────────
-- Colunas ignoradas no diff: ruído que geraria evento sem significado.
create or replace function public.activity_log_ignored_cols()
returns text[] language sql immutable as $$
  select array[
    'updated_at','on_duty','current_vehicle_id','score',
    'last_seen_at','fuel_level',
    -- metadados de autoria: viram o ATOR do evento, não um campo alterado
    'created_by','updated_by'
  ];
$$;

create or replace function public.tf_activity_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_type text := tg_argv[0];
  v_row          jsonb;
  v_old          jsonb;
  v_changes      jsonb := '{}'::jsonb;
  v_key          text;
  v_action       text;
  v_tenant       uuid;
  v_actor_id     uuid;
  v_actor        record;
  v_label        text;
  v_cpf          text;
  v_dept_id      uuid;
  v_dept_name    text;
  v_sensitivity  text := 'operacional';
  v_source       text := 'web_gestor';
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
    v_action := 'delete';
  else
    v_row := to_jsonb(new);
    v_action := lower(tg_op);
    if tg_op = 'INSERT' then v_action := 'create'; end if;
  end if;

  -- Diff: só os campos que realmente mudaram, fora a lista de ruído.
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    for v_key in select jsonb_object_keys(v_row) loop
      if not (v_key = any(public.activity_log_ignored_cols()))
         and v_old -> v_key is distinct from v_row -> v_key then
        v_changes := v_changes || jsonb_build_object(
          v_key, jsonb_build_object('de', v_old -> v_key, 'para', v_row -> v_key)
        );
      end if;
    end loop;
    -- Update que só mexeu em ruído não vira evento.
    if v_changes = '{}'::jsonb then
      return coalesce(new, old);
    end if;
  end if;

  v_tenant := nullif(v_row ->> 'tenant_id','')::uuid;
  if v_tenant is null then
    v_tenant := public.get_user_tenant_id();
  end if;
  if v_tenant is null then
    return coalesce(new, old);  -- sem tenant não há o que auditar
  end if;

  -- Ator: auth.uid() no acesso normal; nas serverless com service_role ele é
  -- NULL e caímos no carimbo updated_by/created_by da própria linha.
  v_actor_id := coalesce(
    auth.uid(),
    nullif(v_row ->> 'updated_by','')::uuid,
    nullif(v_row ->> 'created_by','')::uuid
  );

  select p.id, p.full_name, p.cpf, p.role, p.department_id, d.name as dept_name
    into v_actor
    from public.profiles p
    left join public.departments d on d.id = p.department_id
   where p.id = v_actor_id;

  if v_actor.role = 'motorista' then
    v_source := 'app_motorista';
  elsif v_actor_id is null then
    v_source := 'sistema';
  end if;

  -- Entidade: rótulo, CPF e secretaria variam por tabela.
  if v_entity_type in ('user','driver') then
    v_label := v_row ->> 'full_name';
    v_cpf   := v_row ->> 'cpf';
    v_dept_id := nullif(v_row ->> 'department_id','')::uuid;
    -- Distingue usuário administrativo de motorista pelo papel real.
    if (v_row ->> 'role') = 'motorista' then
      v_entity_type := 'driver';
    else
      v_entity_type := 'user';
    end if;

  elsif v_entity_type = 'vehicle' then
    v_label := coalesce(v_row ->> 'plate', v_row ->> 'name');
    v_dept_id := nullif(v_row ->> 'department_id','')::uuid;

  elsif v_entity_type = 'station' then
    v_label := v_row ->> 'name';

  else
    -- fueling, checklist, service_order: secretaria herdada do veículo.
    select v.department_id,
           coalesce(v.plate, v.name)
      into v_dept_id, v_label
      from public.vehicles v
     where v.id = nullif(v_row ->> 'vehicle_id','')::uuid;

    if v_entity_type = 'service_order' then
      v_label := coalesce(v_label,'') || ' • ' || coalesce(v_row ->> 'category','O.S.');
    end if;
  end if;

  if v_dept_id is not null then
    select name into v_dept_name from public.departments where id = v_dept_id;
  end if;

  -- Sensibilidade
  if v_action = 'delete' then
    v_sensitivity := 'sensivel';                    -- toda exclusão
  elsif v_entity_type = 'user' then
    v_sensitivity := 'sensivel';                    -- usuário administrativo
  elsif tg_op = 'UPDATE' and v_entity_type = 'driver'
        and (v_changes ? 'role' or v_changes ? 'access_blocked'
             or v_changes ? 'cpf' or v_changes ? 'tenant_id') then
    v_sensitivity := 'sensivel';                    -- permissão / identidade
  elsif tg_op = 'UPDATE' and v_entity_type = 'fueling'
        and (v_old ->> 'validated_at') is not null then
    v_sensitivity := 'sensivel';                    -- edição retroativa
  end if;

  insert into public.activity_log (
    tenant_id,
    actor_id, actor_name, actor_cpf, actor_role,
    actor_department_id, actor_department_name, actor_incomplete,
    entity_type, entity_id, entity_label, entity_cpf,
    entity_department_id, entity_department_name,
    action, source, sensitivity, changes, snapshot
  ) values (
    v_tenant,
    v_actor.id, v_actor.full_name, v_actor.cpf, v_actor.role,
    v_actor.department_id, v_actor.dept_name,
    (v_actor_id is not null and coalesce(v_actor.cpf,'') = ''),
    v_entity_type, nullif(v_row ->> 'id','')::uuid, v_label, v_cpf,
    v_dept_id, v_dept_name,
    v_action, v_source, v_sensitivity,
    case when tg_op = 'UPDATE' then v_changes else null end,
    case when tg_op = 'DELETE' then v_row else null end
  );

  return coalesce(new, old);
end; $$;


-- ── Triggers (6 tabelas, uma função só) ─────────────────────────────────────
drop trigger if exists trg_activity_profiles on public.profiles;
create trigger trg_activity_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.tf_activity_log('user');

drop trigger if exists trg_activity_vehicles on public.vehicles;
create trigger trg_activity_vehicles
  after insert or update or delete on public.vehicles
  for each row execute function public.tf_activity_log('vehicle');

drop trigger if exists trg_activity_fuelings on public.fuelings;
create trigger trg_activity_fuelings
  after insert or update or delete on public.fuelings
  for each row execute function public.tf_activity_log('fueling');

drop trigger if exists trg_activity_checklists on public.checklists;
create trigger trg_activity_checklists
  after insert or update or delete on public.checklists
  for each row execute function public.tf_activity_log('checklist');

drop trigger if exists trg_activity_service_orders on public.service_orders;
create trigger trg_activity_service_orders
  after insert or update or delete on public.service_orders
  for each row execute function public.tf_activity_log('service_order');

drop trigger if exists trg_activity_stations on public.fuel_stations;
create trigger trg_activity_stations
  after insert or update or delete on public.fuel_stations
  for each row execute function public.tf_activity_log('station');


-- ── Login ───────────────────────────────────────────────────────────────────
-- Login não sai de trigger em tabela (o evento é do schema auth). O painel e o
-- app chamam este RPC logo após autenticar.
create or replace function public.log_login(p_source text default 'web_gestor')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_actor record;
begin
  select p.id, p.full_name, p.cpf, p.role, p.tenant_id, p.department_id,
         d.name as dept_name
    into v_actor
    from public.profiles p
    left join public.departments d on d.id = p.department_id
   where p.id = auth.uid();

  if v_actor.id is null then return; end if;

  insert into public.activity_log (
    tenant_id, actor_id, actor_name, actor_cpf, actor_role,
    actor_department_id, actor_department_name, actor_incomplete,
    entity_type, entity_id, entity_label,
    action, source, sensitivity
  ) values (
    v_actor.tenant_id, v_actor.id, v_actor.full_name, v_actor.cpf, v_actor.role,
    v_actor.department_id, v_actor.dept_name, coalesce(v_actor.cpf,'') = '',
    case when v_actor.role = 'motorista' then 'driver' else 'user' end,
    v_actor.id, v_actor.full_name,
    'login',
    case when p_source in ('web_gestor','app_motorista') then p_source else 'web_gestor' end,
    'sensivel'
  );
end; $$;

revoke all on function public.log_login(text) from public;
grant execute on function public.log_login(text) to authenticated;


-- ── Ações que não tocam em tabela auditada ──────────────────────────────────
-- Reset e provisionamento de senha mexem só no schema `auth` (via
-- auth.admin.updateUserById), então nenhuma trigger dispara. Sem isto, trocar a
-- senha de um motorista — ato sensível — não deixaria rastro nenhum.
-- Exclusivo do service_role: só as serverless chamam.
create or replace function public.log_manual_activity(
  p_actor_id    uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_action      text,
  p_note        text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_actor record; v_target record;
begin
  select p.id, p.full_name, p.cpf, p.role, p.tenant_id, p.department_id,
         d.name as dept_name
    into v_actor
    from public.profiles p
    left join public.departments d on d.id = p.department_id
   where p.id = p_actor_id;

  select p.full_name, p.cpf, p.department_id, d.name as dept_name
    into v_target
    from public.profiles p
    left join public.departments d on d.id = p.department_id
   where p.id = p_entity_id;

  if v_actor.tenant_id is null then return; end if;

  insert into public.activity_log (
    tenant_id, actor_id, actor_name, actor_cpf, actor_role,
    actor_department_id, actor_department_name, actor_incomplete,
    entity_type, entity_id, entity_label, entity_cpf,
    entity_department_id, entity_department_name,
    action, source, sensitivity, changes
  ) values (
    v_actor.tenant_id, v_actor.id, v_actor.full_name, v_actor.cpf, v_actor.role,
    v_actor.department_id, v_actor.dept_name, coalesce(v_actor.cpf,'') = '',
    p_entity_type, p_entity_id, v_target.full_name, v_target.cpf,
    v_target.department_id, v_target.dept_name,
    p_action, 'web_gestor', 'sensivel',
    case when p_note is null then null
         else jsonb_build_object('observacao', p_note) end
  );
end; $$;

revoke all on function public.log_manual_activity(uuid, text, uuid, text, text) from public, authenticated, anon;
grant execute on function public.log_manual_activity(uuid, text, uuid, text, text) to service_role;


-- ── Retenção: 5 anos, com aviso prévio ──────────────────────────────────────
-- Registros do ano Y são expurgados em 01/01/(Y+6) — 5 anos completos após o
-- encerramento do ano.
create table if not exists public.activity_log_retention (
  tenant_id   uuid not null,
  year        int  not null,
  event_count int,
  purge_date  date not null,
  warned_90_at timestamptz,
  warned_30_at timestamptz,
  warned_7_at  timestamptz,
  purged_at    timestamptz,
  purged_count int,
  primary key (tenant_id, year)
);

alter table public.activity_log_retention enable row level security;
revoke all on public.activity_log_retention from authenticated, anon;
grant select on public.activity_log_retention to authenticated;
drop policy if exists alr_select on public.activity_log_retention;
create policy alr_select on public.activity_log_retention
  for select to authenticated
  using (public.is_superadmin() or tenant_id = public.get_user_tenant_id());

comment on table public.activity_log_retention is
  'Controle do expurgo da trilha. O expurgo só roda se warned_90_at estiver preenchido — nada some em silêncio.';


create or replace function public.activity_log_retention_warn()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_ids uuid[]; v_days int; v_title text; v_body text;
begin
  -- Garante uma linha de controle por (tenant, ano) com registros.
  insert into public.activity_log_retention (tenant_id, year, event_count, purge_date)
  select l.tenant_id,
         extract(year from l.created_at)::int,
         count(*),
         make_date(extract(year from l.created_at)::int + 6, 1, 1)
    from public.activity_log l
   group by 1, 2
  on conflict (tenant_id, year) do update
     set event_count = excluded.event_count;

  for r in
    select * from public.activity_log_retention
     where purged_at is null
       and purge_date - current_date between 0 and 90
  loop
    v_days := r.purge_date - current_date;

    -- Um aviso por marco (90/30/7), sem repetir.
    if v_days <= 7 and r.warned_7_at is not null then continue;
    elsif v_days <= 30 and v_days > 7 and r.warned_30_at is not null then continue;
    elsif v_days > 30 and r.warned_90_at is not null then continue;
    end if;

    v_title := 'Expurgo da trilha de auditoria em ' || v_days || ' dias';
    v_body  := 'Os registros de auditoria de ' || r.year || ' (' ||
               coalesce(r.event_count, 0) || ' eventos) serão excluídos em ' ||
               to_char(r.purge_date, 'DD/MM/YYYY') || '. Exporte o que precisar guardar.';

    -- Superadmin (age) + admin/gestor do tenant (ciência).
    select array_agg(id) into v_ids
      from public.profiles
     where role = 'superadmin'
        or (role in ('admin','gestor') and tenant_id = r.tenant_id);

    if v_ids is not null then
      perform public.notify_users(v_ids, 'warning', v_title, v_body,
                                  '/auditoria?ano=' || r.year, 'activity_log', null::uuid);
    end if;

    update public.activity_log_retention
       set warned_7_at  = case when v_days <= 7  then now() else warned_7_at  end,
           warned_30_at = case when v_days <= 30 then now() else warned_30_at end,
           warned_90_at = coalesce(warned_90_at, now())
     where tenant_id = r.tenant_id and year = r.year;
  end loop;
end; $$;


create or replace function public.activity_log_purge()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_deleted int;
begin
  for r in
    select * from public.activity_log_retention
     where purged_at is null
       and purge_date <= current_date
  loop
    -- Trava de segurança: sem o aviso de 90 dias registrado, não expurga.
    -- Reagenda avisando, em vez de apagar em silêncio.
    if r.warned_90_at is null then
      update public.activity_log_retention
         set purge_date = current_date + 90
       where tenant_id = r.tenant_id and year = r.year;
      continue;
    end if;

    delete from public.activity_log
     where tenant_id = r.tenant_id
       and extract(year from created_at)::int = r.year
       and action <> 'purge';   -- o registro do próprio expurgo nunca é apagado
    get diagnostics v_deleted = row_count;

    update public.activity_log_retention
       set purged_at = now(), purged_count = v_deleted
     where tenant_id = r.tenant_id and year = r.year;

    -- O expurgo se auto-registra: mesmo depois dele, resta a prova de que foi
    -- legítimo e avisado.
    insert into public.activity_log (
      tenant_id, actor_name, actor_role, entity_type, entity_label,
      action, source, sensitivity, changes
    ) values (
      r.tenant_id, 'Sistema', 'sistema', 'activity_log',
      'Expurgo de ' || r.year,
      'purge', 'sistema', 'sensivel',
      jsonb_build_object('ano', r.year, 'eventos_excluidos', v_deleted,
                         'avisado_em', r.warned_90_at)
    );
  end loop;
end; $$;


-- ── Agendamento (mesmo padrão do cnh-expiry-daily) ──────────────────────────
select cron.schedule('activity-log-purge-warning', '0 7 1 * *',
                     $$select public.activity_log_retention_warn();$$);
select cron.schedule('activity-log-purge',         '0 8 1 * *',
                     $$select public.activity_log_purge();$$);
