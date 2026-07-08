# SGF 2026 — Plano de Produção (Auditoria 2026-07-07)

> **Documento mestre do go-live.** Legível por humanos e por agentes de IA.
> Cada tarefa pendente tem: contexto, arquivos exatos, comandos e um **prompt pronto**
> para executar em uma sessão nova do Claude Code (ou outro agente) sem depender
> desta conversa.
>
> **Regra para agentes:** leia este arquivo inteiro antes de agir. Ao concluir uma
> tarefa, marque-a como ✅ aqui, com a hash do commit. Nunca aplique DDL em produção
> sem aprovação explícita do usuário.

---

## Contexto do sistema

| Componente | Onde | Stack |
|---|---|---|
| Painel do gestor | `sgf-2026/web` (este repo) | React + Vite + TS, Supabase direto + serverless Vercel em `web/api` |
| Painel superadmin | `sgf-2026/admin` | React + Vite + TS, serverless em `admin/api` |
| App do motorista | https://github.com/luanmachadops/appFrota (repo separado) | **React Native / Expo** (o CLAUDE.md antigo dizia Flutter — está errado) |
| Banco | Supabase `kgxdrgbxpfoebzrphtqg` (FrotaMunicipal, sa-east-1) | Postgres 17, RLS multi-tenant (tabela `tenants`, coluna `tenant_id` em tudo) |
| Edge functions | `sgf-2026/supabase/functions` | vehicle-ai-extract, driver-cnh-extract, send-push, notify-push, iopgps-* |
| Rastreadores | Integração IOPGPS (cron + edge functions) | Status: não testada em campo |

- Papéis em `profiles.role`: `superadmin`, `admin`, `gestor`, `secretario`, `motorista`.
- Storage: bucket `fotos` (público, sem listagem desde 2026-07-07) e `documentos` (privado, URL assinada).
- Fluxo de manutenção real usa `service_orders`; a tabela `maintenances` está morta (0 rows).
- Auditoria completa: relatórios de mobile, web e banco resumidos nas seções abaixo.

---

## ✅ FEITO

### T1 — Hardening de segurança no banco (2026-07-07, commit `8a9a7a6`, migration aplicada em produção)

- `app_settings`: PK migrou de `id boolean` (singleton global — quebrava multi-tenant) para `tenant_id`; `tenant_id` agora tem default `get_user_tenant_id()`. Código do painel ajustado (`web/src/lib/supabase-api.ts` → `settingsApi` upsert por `tenant_id`).
- REVOKE EXECUTE de 22 funções trigger/internas que estavam expostas via `/rest/v1/rpc` para `anon`+`authenticated` (ex.: `handle_new_user`, `tf_tenant_from_*`, `notify_admins`).
- Helpers de RLS (`is_admin`, `get_user_tenant_id`, `sgf_role`, ...) mantidos com EXECUTE **apenas** para `authenticated` — **atenção: nunca revogar de `authenticated`, as policies RLS dependem deles**.
- `get_tenant_branding` mantida para `anon` (tela de login).
- Nova policy `device_alarms_admin_manager_update` (reconhecer alarmes no painel).
- Removida a policy `fotos_public_select` (listagem pública do bucket `fotos`).
- `touch_updated_at` com `search_path = public`.
- As 4 edge functions que só existiam deployadas foram resgatadas e versionadas em `supabase/functions/` (+ README com mapa de chamadores).
- Arquivo: `supabase/migrations/20260707_000001_security_hardening.sql`.

### Manual (dashboard) — parcialmente pendente
- [ ] Authentication → Sign In/Providers → Email: **Minimum password length = 8** e **Password requirements** (letras+dígitos).
- [ ] **Prevent use of leaked passwords** — requer plano Pro; ativar no upgrade.

---

## ✅ T2 — Correções nos endpoints (concluída em 2026-07-08)

Todos os 4 itens implementados (typecheck web+admin ok). O que foi feito além do plano:
o modal de pré-cadastro agora exibe as senhas provisórias UMA vez, com botões
Copiar/Baixar CSV; o gate de motorista foi posto no `AuthContext.fetchUserProfile`
(cobre login E restauração de sessão, inclusive o fallback sem profile row).
**Pendência operacional:** redeploy da edge function alterada —
`supabase functions deploy iopgps-sync --no-verify-jwt --project-ref kgxdrgbxpfoebzrphtqg`
(aguardando aprovação do usuário). **Atenção mobile (T4):** a tela de primeiro acesso
do app pode instruir "senha = CPF" — atualizar o texto para "senha provisória entregue
pelo gestor".

**Objetivo original:** fechar os 4 buracos de autorização/autenticação dos endpoints.

**2.1 — IDOR cross-tenant nas credenciais IOPGPS** (`admin/api/iopgps-device.ts`)
- Problema: linhas ~60-65 aceitam `tenantId` do body; `assertRole` (linhas 16-24) valida só o papel, nunca o tenant do chamador. E há fallback (linha ~34) que, sem credencial do tenant, pega **qualquer** credencial ativa do sistema.
- Correção: derivar o tenant do perfil do chamador (padrão já correto em `supabase/functions/iopgps-command/index.ts` e `iopgps-history`): buscar `profiles.tenant_id` do usuário autenticado; só `superadmin` pode passar `tenantId` explícito. Remover o fallback de credencial global.

**2.2 — Senha inicial do motorista = CPF** (`web/api/_lib/driver-access.ts` linhas ~179-185)
- Problema: pré-cadastro cria usuário com `password = cpf`. Qualquer um que saiba o CPF loga antes do motorista.
- Correção: gerar senha aleatória (ex.: `crypto.randomBytes(9).toString('base64url')`), retornar UMA vez na resposta do endpoint para o gestor entregar ao motorista, manter `must_change_password = true`. Atualizar a UI que exibe a senha provisória (procurar quem chama o endpoint em `web/src/components/drivers/`).

**2.3 — `iopgps-sync` global acionável por qualquer gestor** (`supabase/functions/iopgps-sync/index.ts` linhas ~24-52)
- Problema: fora do cron (`x-cron-secret`), qualquer `gestor` autenticado dispara a sincronização de TODOS os tenants.
- Correção: quando a chamada não for cron nem superadmin, filtrar o loop para o `tenant_id` do chamador.

**2.4 — Painel não bloqueia o papel `motorista`** (`web/src/components/auth/PrivateRoute.tsx`, `web/src/contexts/AuthContext.tsx`, `web/src/App.tsx`)
- Problema: `PrivateRoute` só exige sessão; motorista logado no painel vê tudo que a RLS de leitura permite.
- Correção: se `role === 'motorista'`, deslogar com mensagem ("use o aplicativo do motorista") ou bloquear rotas. Cuidado: `AuthContext.tsx:61` mapeia papéis PT→EN (`motorista → VIEWER`) — tratar antes do mapeamento.

**Depois:** `cd sgf-2026/web && npx tsc --noEmit -p tsconfig.app.json` e commit.

**PROMPT PRONTO (T2):**
```
Leia sgf-2026/PRODUCAO.md (seção T2) e execute as 4 correções descritas:
(1) IDOR em admin/api/iopgps-device.ts — derive o tenant do perfil do chamador via
    supabase admin client (padrão de supabase/functions/iopgps-command/index.ts),
    permita tenantId explícito só para superadmin, remova o fallback de credencial global;
(2) web/api/_lib/driver-access.ts — substitua senha=CPF por senha aleatória
    (crypto.randomBytes(9).toString('base64url')), devolva-a na resposta e localize/ajuste
    a UI do painel que mostra a senha provisória ao gestor;
(3) supabase/functions/iopgps-sync/index.ts — quando não for cron nem superadmin,
    sincronize apenas o tenant do chamador;
(4) web/src/components/auth/PrivateRoute.tsx — bloqueie role motorista no painel com
    mensagem clara (ver mapeamento de papéis em AuthContext.tsx:61).
Rode npx tsc --noEmit em web e admin, commite com mensagem descritiva e atualize
PRODUCAO.md marcando T2 como ✅ com a hash. NÃO faça deploy das edge functions sem
o usuário aprovar (supabase functions deploy iopgps-sync --no-verify-jwt).
```

---

## ✅ T3 — Fluxos de negócio (concluída em 2026-07-08)

- **3.1** RPC `check_vehicle_conflict(uuid)` criada e **aplicada em produção** (migration `20260708_000001`); app passou a usá-la (PR appFrota #1). Detecção de conflito agora funciona sob RLS.
- **3.2** CNH e CRLV/placa/hodômetro migrados para o bucket privado `documentos` (upload temp + signed URL nas extrações puras, com delete em finally; slots sensíveis persistidos como path e resolvidos via `resolveDocUrl`). A foto do veículo (`foto`) segue pública. Policy `documentos_tenant_all` já cobre authenticated por tenant — verificado.
- **3.3** (app, PR #1) checklist agora grava `trip_id`; itens críticos **freios, pneus, luzes** em "atenção" bloqueiam a viagem e criam `service_order` (priority alta) — trigger `trg_notify_service_order` notifica o gestor. **Pendência de produto:** o template do app NÃO tem item "direção" (só oleo, pneus, agua, freios, luzes, geral); avaliar adicionar.
- **3.4** Nova aba "Checklists" no detalhe do veículo (`VehicleChecklistsTab.tsx`) + `checklistsApi.getItems`.
- **Pendências operacionais:** revisar/mergear o PR appFrota #1; redeploy das edge functions (`vehicle-ai-extract`/`driver-cnh-extract` não mudaram, mas `iopgps-sync` da T2 sim). Commit web: ver git log.

### (referência) T3 — plano original

**3.1 — Conflito de vínculo de veículo quebrado sob RLS** (repo appFrota: `src/lib/data.ts` ~435-479, 541-582)
- Problema: `checkVehicleConflict`/`getTodayChecklist` precisam ver viagens de OUTROS motoristas, mas a policy `trips_select_own` esconde. Dois motoristas assumem o mesmo veículo sem aviso.
- Correção (banco, DDL — **pedir aprovação antes de aplicar**): criar RPC `SECURITY DEFINER`:
```sql
create or replace function public.check_vehicle_conflict(p_vehicle_id uuid)
returns table(in_use boolean, driver_name text) language sql security definer
set search_path = public as $$
  select true, p.full_name
  from trips t join profiles p on p.id = t.driver_id
  where t.vehicle_id = p_vehicle_id and t.status = 'em_andamento'
    and t.driver_id <> auth.uid()
    and t.tenant_id = get_user_tenant_id()
  limit 1;
$$;
revoke execute on function public.check_vehicle_conflict(uuid) from public, anon;
grant execute on function public.check_vehicle_conflict(uuid) to authenticated;
```
  (conferir o literal do enum de status de trips antes: `select enum_range(null::trip_status)` — o nome do tipo pode variar; ver com `\dT` ou pg_type.)
- No app: substituir a lógica de leitura direta por `.rpc('check_vehicle_conflict', {...})`.

**3.2 — CNH/CRLV no bucket público** (`web/src/lib/driverAI.ts:24-31`, `web/src/lib/vehicleAI.ts:80-84,112-117`)
- Correção: usar o padrão de `web/src/lib/docStorage.ts` (bucket `documentos` privado + `createSignedUrl`). A edge function recebe URL assinada normalmente. Alternativa: apagar o objeto após a extração.

**3.3 — Checklist: vincular à viagem e bloquear item crítico** (repo appFrota: `app/checklist.tsx` ~96-123 + fluxo de start-trip)
- Hoje: 100% das checklists têm `trip_id` NULL; item crítico com estado "atenção" não bloqueia; não gera O.S.
- Correção: (a) gravar `trip_id` ao criar a viagem logo após o checklist (ou criar a trip antes e passar o id); (b) itens críticos (freios, pneus, direção, luzes) com problema → bloquear início e criar `service_orders` automática; (c) notificar gestor (insert em `notifications` via RPC `notify_fleet_managers` — atenção: EXECUTE foi revogado de authenticated; criar RPC própria ou trigger).

**3.4 — Tela de checklists no painel** (`web/src`)
- `checklistsApi` já existe em `supabase-api.ts:1229` mas nenhuma página o usa. Criar página/aba (ex.: dentro do detalhe do veículo ou menu próprio) listando checklists com itens e estados.

**PROMPT PRONTO (T3):**
```
Leia sgf-2026/PRODUCAO.md (seção T3). Execute na ordem:
(1) Prepare a migration da RPC check_vehicle_conflict (arquivo em supabase/migrations/),
    confirme o enum de status de trips no banco antes, e PEÇA APROVAÇÃO ao usuário
    antes de aplicar em produção (projeto kgxdrgbxpfoebzrphtqg via MCP do Supabase);
(2) Migre os uploads de driverAI.ts e vehicleAI.ts para o bucket privado 'documentos'
    seguindo o padrão de docStorage.ts (URL assinada);
(3) No repo appFrota (clonar de https://github.com/luanmachadops/appFrota), ajuste
    src/lib/data.ts para usar a RPC do item 1, e app/checklist.tsx para: gravar trip_id,
    bloquear viagem se item crítico (freios/pneus/direção/luzes) tiver problema e abrir
    service_order automática. Commite no repo do app em branch própria e abra PR;
(4) Crie a tela de checklists no painel web usando o checklistsApi existente
    (supabase-api.ts:1229), seguindo o design system do CLAUDE.md (cores fixas, Tailwind puro).
Typecheck em tudo, commits separados por item, atualize PRODUCAO.md.
```

---

## 🟠 T4 — Push notifications + produto

**4.1 — Push de ponta a ponta**
- Estado: `push_tokens` = 0 rows. No app falta `extra.eas.projectId` no `app.json` (e `eas.json` não existe) → `src/lib/notifications.ts:43-49` sempre retorna null. No backend, o trigger `tg_notifications_push` chama a function `send-push` (aberta, `verify_jwt=false`, sem secret!). A `notify-push` (melhor versão) está órfã.
- Correção:
  1. No app: `eas init` (cria projectId), incluir em `app.json → extra.eas.projectId`, testar `register_push_token`.
  2. Backend: escolher UMA function. Recomendado: manter `send-push` (o trigger já aponta para ela) e protegê-la: `supabase secrets set PUSH_WEBHOOK_SECRET=<valor>` + atualizar o trigger para enviar o header `x-webhook-secret` (DDL — aprovar antes):
```sql
create or replace function public.tg_notifications_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url     := 'https://kgxdrgbxpfoebzrphtqg.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'x-webhook-secret', '<MESMO_VALOR_DO_SECRET>'),
    body    := jsonb_build_object('record', to_jsonb(NEW))
  );
  return NEW;
exception when others then return NEW;
end $$;
```
  3. Apagar a function `notify-push` do deploy (ou documentar por quê fica).

**4.2 — App white-label vs. build por prefeitura (DECISÃO DO USUÁRIO)**
- Hoje: bundle `gov.tapejara.frotamunicipal` + textos "Prefeitura de Tapejara" hardcoded (`vehicle-details.tsx:106`, `privacy-policy.tsx`, `support.tsx:33-46`) num backend multi-tenant.
- Opções: (a) 1 app genérico ("SGF Frota") que usa `tenants.name/logo/cores` após login — 1 publicação nas lojas; (b) build por prefeitura via EAS build profiles. Recomendado: (a).
- Em qualquer caso: substituir os textos hardcoded por dados do tenant.

**4.3 — Mobile: pendências menores**
- `access_blocked` não checado (auth.tsx/_layout.tsx) → checar no login/refresh e mostrar tela de bloqueio.
- Injeção PostgREST em `findVehicleByCode` (`src/lib/data.ts:53-64`) → sanitizar entrada do `.or()`.
- Gráfico de manutenção com custos hardcoded (`app/(tabs)/maintenance.tsx:41-55`) → usar `service_orders` reais.
- Versão do app hardcoded → `Constants.expoConfig.version`.

**PROMPT PRONTO (T4):**
```
Leia sgf-2026/PRODUCAO.md (seção T4). Pergunte ao usuário a decisão white-label (4.2)
antes de mexer no app.json. Depois:
(1) Push: guie o usuário no `eas init` (precisa de conta Expo), adicione extra.eas.projectId,
    configure PUSH_WEBHOOK_SECRET via supabase secrets, prepare a migration do trigger
    tg_notifications_push com o header x-webhook-secret e PEÇA APROVAÇÃO antes de aplicar;
(2) No repo appFrota: cheque access_blocked no fluxo de auth com tela de bloqueio;
    sanitize a entrada do .or() em findVehicleByCode; troque os custos hardcoded do
    gráfico de manutenção por dados reais de service_orders; versão via Constants.
(3) Substitua textos 'Prefeitura de Tapejara' por dados do tenant carregado.
Commits separados, PR no repo do app, atualize PRODUCAO.md.
```

---

## 🟡 T5 — Limpeza e consistência (baixo risco, alto valor de manutenção)

- Remover `backend/` (NestJS morto — nada o referencia; `web/src/lib/backend-api.ts` usa as serverless da Vercel).
- Remover `edgeFunctionsApi` de `web/src/lib/supabase-api.ts:2308-2336` (chama functions `dashboard-kpis`, `validate-refueling`, `detect-trip-anomalies` que não existem; zero chamadores).
- Decidir: dropar tabela `maintenances` (0 rows) e o listener em `web/src/hooks/useRealtimeSync.ts:13-27`, ou implementar preventivas nela.
- Página para `issues` (2 rows gravadas pelo app, nenhuma página lê) — ou remover do app.
- `importFromDetran` é stub com throw (`supabase-api.ts:918-920`) — esconder o botão ou implementar.
- Campo de foto do `NewDriverForm.tsx:183-185` não salva (só toast) — implementar upload ou remover o campo.
- Reescrever `CLAUDE.md` (descreve NestJS ativo, Flutter, schema divergente do real — desinforma agentes).
- Decidir destino de `web/android/` (Capacitor) e `web/dist/` versionados.
- Habilitar `strict: true` em `web/tsconfig.app.json` (admin já é strict) — pode ser gradual.
- Mensagens de erro cruas do Postgres nos endpoints → mapear para mensagens genéricas.
- CORS `*` nas edge functions IOPGPS → restringir a domínios de produção.
- Limite no import em lote (`web/api/drivers/pre-register.ts:28-35`).
- Adicionar Sentry (web + app).

**PROMPT PRONTO (T5):**
```
Leia sgf-2026/PRODUCAO.md (seção T5) e execute os itens de limpeza um a um, em commits
separados. Para remoções (backend/, edgeFunctionsApi, tabela maintenances) confirme com
grep que não há referências antes de apagar; a remoção da TABELA maintenances é DDL —
pedir aprovação. Reescreva o CLAUDE.md refletindo a arquitetura real descrita no topo
do PRODUCAO.md. Typecheck após cada commit.
```

---

## Checklist final de go-live

- [ ] T2, T3, T4 concluídas e testadas manualmente (login gestor, login motorista, viagem completa com checklist, abastecimento com workflow, push recebido)
- [ ] Upgrade Supabase para Pro (leaked passwords, backups, sem pausa por inatividade)
- [ ] Deploy das edge functions alteradas (`supabase functions deploy <slug>`; `--no-verify-jwt` para send-push e iopgps-sync)
- [ ] Variáveis Vercel conferidas (web e admin) + domínios de produção no CORS
- [ ] `admin/.env.example` sem URL real do projeto
- [ ] Teste multi-tenant: gestor do tenant 2 salva configurações, não vê dados do tenant 1
- [ ] IOPGPS testado com rastreador físico (assinatura auth pendente de confirmação)
- [ ] Publicação do app (EAS build) conforme decisão white-label
- [ ] Monitoramento: Sentry + alertas de erro das edge functions

## Comandos úteis

```bash
# Typecheck
cd sgf-2026/web && npx tsc --noEmit -p tsconfig.app.json
cd sgf-2026/admin && npx tsc --noEmit

# Edge functions (deploy manual)
supabase functions deploy send-push --no-verify-jwt --project-ref kgxdrgbxpfoebzrphtqg
supabase functions deploy iopgps-sync --no-verify-jwt --project-ref kgxdrgbxpfoebzrphtqg
supabase functions deploy iopgps-command --project-ref kgxdrgbxpfoebzrphtqg
supabase secrets set PUSH_WEBHOOK_SECRET=<valor> --project-ref kgxdrgbxpfoebzrphtqg

# Tipos do banco atualizados (inclui device_status etc., elimina casts `as any`)
npx supabase gen types typescript --project-id kgxdrgbxpfoebzrphtqg --schema public > web/src/types/database.types.ts

# App mobile
git clone https://github.com/luanmachadops/appFrota && cd appFrota && npm i && npx expo start
```

---
*Gerado pela auditoria de 2026-07-07 (Claude Fable 5 orquestrando agentes Sonnet). Atualize este arquivo a cada tarefa concluída.*
