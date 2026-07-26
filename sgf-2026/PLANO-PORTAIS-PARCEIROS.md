# Plano — Portais de Parceiros (Postos e Oficinas)

> Status (2026-07-26): **fases −1 a 4 e 6 concluídas**. As implementações das
> fases 5, 7 e 8 estão prontas; faltam apenas os pilotos autenticados com
> parceiros reais.
> Este arquivo é a fonte da verdade das etapas — ver "Fases de entrega" (seção 6)
> e "Estado da execução" logo abaixo.
> Escopo: dois portais externos dentro do mesmo produto — **Sistema de
> Abastecimento** (postos) e **Sistema de Manutenção** (oficinas mecânicas),
> com login próprio, dados restritos ao parceiro e isolamento por prefeitura.
>
> **Revisão 2 (2026-07-25):** incorpora auditoria de segunda opinião. Mudanças
> principais: parceiros passam a escrever **só via RPC** (não `UPDATE` direto),
> as views de leitura foram substituídas por RPC, o status da OS foi dividido em
> operacional × financeiro, e foi criada uma **fase −1** obrigatória — o bucket
> `fotos` aceita escrita anônima em produção *hoje*, e o repositório tem 12
> migrations contra 85 aplicadas no banco.

---

## Decisões tomadas (2026-07-25)

| Questão | Decisão | Consequência |
|---|---|---|
| Logins por parceiro | **Um login** | `profiles.station_id`/`repair_shop_id` + índice único parcial. Senha compartilhada no balcão. |
| NF e pagamento | **Múltiplos (1:N)** | `service_order_invoices` + `service_order_payments` desde já. |
| Quem cria acesso | **Só `admin`** | Mesma regra de `api/managers`. |

## Estado da execução

| Item | Estado |
|---|---|
| Bucket `fotos`: escrita anônima | ✅ **fechada** — policies `fotos_auth_*` só para `authenticated`; verificado: upload anônimo → 403, leitura pública → 200 |
| Limites de MIME/tamanho | ✅ `fotos` 10 MB e só imagens; `documentos` 20 MB |
| Fallback de `user_metadata` | ✅ removido; allowlist `PANEL_ROLES` no `AuthContext` |
| Senha mínima 6 → 8 | ✅ 7 arquivos (UI + `api/_lib`) |
| Reconciliar migrations (85 × 12) | ✅ **feito** — 86 versões em sincronia, 0 órfãs. Ver "Como o histórico foi reconciliado" abaixo |
| `fotos` com caminho por tenant | ⛔ **pendente** — hoje qualquer autenticado lista fotos de todas as prefeituras |
| Fase 1 — DDL | ✅ **aplicada** — `20260725204942_partner_portals_schema` e `20260725205042_partner_portals_rpc`. 6 tabelas, 2 enums, 12 RPCs, 8 policies de parceiro, backfill das 4 OS existentes |
| Tipos do banco | ✅ `database.types.ts` regenerado; `tsc` limpo em `web` e `admin` |
| `20260724000001_activity_log` | ✅ **aplicada** — o código em produção já chamava `log_manual_activity` (driver-access.ts:275) a cada reset de senha e bloqueio; a auditoria vinha falhando em silêncio |
| Deploy do painel | ✅ `856d4ca` → produção READY, `frota-web-tap.vercel.app` HTTP 200 |
| Fase 2 — testes de isolamento | ✅ **15/15** em `supabase/tests/rls_partner_isolation.sql` |
| `fotos` escopado por tenant — leitura | ✅ **aplicada** — enumeração cross-tenant fechada, verificada 3/3 |
| `fotos` escopado por tenant — escrita | ✅ **aplicada** (2026-07-26) — verificada 4/4 em transação revertida |
| Fase 3 — aba Oficinas + `repair_shop_id` na OS | ✅ concluída |
| Fase 4 — criação de acesso + allowlist + guard hostname×tenant | ✅ concluída |
| Fase 6 — fluxo fiscal da OS no painel | ✅ concluída (orçamento, empenho, NF, ateste, pagamento, timeline das 12 etapas) |
| OTA (`expo-updates`) no app | ✅ configurado — correção de JS passa a chegar por `eas update`, sem loja |
| Build EAS do app | ✅ disparada (perfil production, runtime 1.0.1) |
| Proteção contra senha vazada (Supabase) | ⛔ **indisponível no plano gratuito** — senha mínima de 8 no código segue valendo |
| Regra de cores no AGENTS.md/CLAUDE.md | ✅ corrigida — marca é sobrescrita por prefeitura; semântica é fixa |
| Notificações (bug reportado 2026-07-26) | ✅ ver "Notificações" no fim deste arquivo |
| Fase 5 — Portal do Posto (código) | ✅ concluída — login próprio, autorizações, registro com cupom/foto, preço contratual, histórico paginado e dados do contrato |
| Fase 5 — migration do histórico/guard | ✅ **aplicada** — `20260726030059_station_portal_history`; migration completa validada em rollback + isolamento 15/15 |
| Fase 5 — piloto autenticado | ⛔ **pendente** — consulta em 2026-07-26 encontrou 0 perfis `role='posto'`; criar o primeiro acesso pelo card do posto e executar o roteiro abaixo |
| Fase 7 — Portal da Oficina (código/RPCs) | ✅ concluída — OS agrupadas, orçamento, execução com fotos, NF, timeline e contrato |
| Fase 7 — policy de documentos | ✅ **aplicada pelo dashboard do Storage** — `USING` e `WITH CHECK` verificadas; suíte de isolamento 20/20 |
| Fase 7 — piloto autenticado | ⛔ **pendente** — existem 0 perfis `role='oficina'` |
| Fase 8 — fechamento, relatórios e avisos | ✅ código e migration aplicados; falta validação visual nos pilotos |

### Verificação da fase 1 (2026-07-25)

Antes de aplicar: as duas migrations rodaram **inteiras** contra o schema real
dentro de uma transação encerrada por sentinela que força rollback — 6 tabelas,
2 enums, 13 policies, 12 funções e os grants executaram sem erro, sem persistir.

Depois de aplicar, o trigger de sincronia foi testado com escrita real (também
revertida). Os quatro casos que importam:

| Teste | Resultado |
|---|---|
| Painel escreve `status='aprovada'` (como faz hoje) | → `operational_status='authorized'` ✅ |
| Portal escreve `operational_status='ready'` | → `status='em_execucao'` ✅ |
| Painel reescreve `status='em_execucao'` com op já em `ready` | **não rebaixa**: continua `ready` ✅ |
| `operational_status='received'` | → `status='concluida'`, libera o veículo ✅ |

Confirmado também: `anon` **não** tem EXECUTE nas RPCs de parceiro.

### Como o histórico foi reconciliado (2026-07-25)

O `supabase db pull` recusou e sugeriu marcar **82 migrations reais como
`reverted`** e as duas da fase 1 como `applied`. **Não siga essa sugestão**:

- `reverted` **apaga a linha** de `supabase_migrations.schema_migrations` — e
  essa tabela guarda o SQL de cada migration (93 linhas, 184 KB). Para 82 delas
  era a **única cópia existente**: nunca estiveram no repositório.
- marcar `20260725000003/000004` como `applied` congelaria a fase 1 sem nunca
  ter rodado.
- a lista incluía `20260724000001_activity_log`, que **nunca foi aplicada** —
  verificado: nem a tabela `activity_log` nem `tf_activity_log`/`log_login`
  existem. Seria marcada como aplicada e nunca mais rodaria.

O que foi feito no lugar, sem apagar nada:

1. **7 arquivos locais eram cópias de dev** aplicadas com outro timestamp
   (ex.: `20260707000001_security_hardening` = `20260708010912_security_hardening_20260707`).
   Renomeados para a versão real, preservando o SQL local.
2. **5 migrations vinham do repo do app do motorista** (`appFrota`), que
   compartilha o mesmo banco. Copiadas para cá com a versão real.
   → **Decisão pendente:** dois repositórios versionando migrations do mesmo
   banco garante divergência permanente. `AppFrota-web` deveria ser o dono; o
   `appFrota` para de ter `supabase/migrations`.
3. **71 versões sem arquivo** ganharam um stub que registra a versão e ensina a
   recuperar o SQL original (`select unnest(statements) …`). O SQL segue no
   banco, intacto. Materializar o conteúdo real nos arquivos é possível a
   qualquer momento — são 184 KB.

Resultado: **86 em sincronia, 0 órfãs**, `db push` funcional. Faltam aplicar só
`20260724000001_activity_log` (decisão à parte) e as duas da fase 1.

### Pendência de storage multi-tenant

O aviso do dashboard ("Clients can list all files in this bucket") é legítimo: a
policy `fotos_auth_select` é ampla (`bucket_id = 'fotos'`), então **qualquer
autenticado de qualquer prefeitura lista todos os arquivos** — e como o bucket é
público, listar equivale a acessar. A causa é o caminho não ter tenant
(`drivers/…` em vez de `tenant/{id}/drivers/…`), diferente de `documentos`, que
já escopa por `foldername[2]`.

**Não remova a policy** (é o que faz `upsert` e delete funcionarem). O conserto é
padronizar os caminhos com `tenant_id` e escopar a policy — 13 pontos de upload,
os leitores de `getPublicUrl` e a migração dos 120 objetos existentes. É
pré-requisito dos portais: parceiro não pode enxergar foto de outra prefeitura.

## 0. Fase −1 — a base precisa ser consertada antes

Verificado no banco `kgxdrgbxpfoebzrphtqg` em 2026-07-25. **Não são riscos
teóricos, são o estado atual de produção:**

### 0.1 Bucket `fotos` aceita escrita anônima 🔴

```
bucket fotos: public=true, file_size_limit=null, allowed_mime_types=null
policy fotos_public_insert | INSERT | roles={public} | bucket_id='fotos'
policy fotos_public_update | UPDATE | roles={public} | bucket_id='fotos'
policy fotos_public_delete | DELETE | roles={public} | bucket_id='fotos'
```

No Postgres, o papel `public` inclui `anon`. A anon key vai no bundle JS do
site. Ou seja: **qualquer pessoa na internet pode enviar, sobrescrever e apagar
qualquer arquivo do bucket**, sem limite de tamanho nem de MIME type — incluindo
as fotos de hodômetro que sustentam a prestação de contas de abastecimento.

A correção já está escrita em
`supabase/migrations/20260725_000001_fix_fotos_storage_rls.sql`, mas **não consta
na lista de migrations aplicadas**. Aplicar é a primeira coisa a fazer, antes e
independentemente dos portais.

### 0.2 Repositório divergente do banco 🔴

```
migrations aplicadas em produção: 85
arquivos em sgf-2026/supabase/migrations: 12
```

Escrever DDL novo lendo apenas o repositório é trabalhar com uma visão parcial do
schema real. Antes da fase 1: puxar o schema canônico (`supabase db pull`),
versionar o histórico, e validar que uma aplicação do zero reproduz produção.

### 0.3 Demais itens da fase −1

- **Fallback de papel por `user_metadata`** em `AuthContext.tsx:124` — se o perfil não é encontrado no banco, o papel e o tenant saem de `user_metadata`, que é **editável pelo próprio usuário** via `auth.updateUser`. Isso é escalada de privilégio. Sem perfil válido no banco → negar acesso, ponto.
- **Senha mínima de 6 caracteres** em `manager-access.ts:24`. Subir para 8+ e ativar a proteção contra senhas vazadas do Supabase (advisor aponta desabilitada).
- **`documentos`** já é privado e escopado por tenant (`foldername[2] = get_user_tenant_id()`) — é o padrão a seguir para os anexos fiscais dos parceiros.

---

## 1. Decisão de arquitetura: caminho, não subdomínio

O multi-tenant **já usa o subdomínio para identificar a prefeitura**
(`getSlugFromHost()` em `web/src/lib/tenantBranding.ts`: `tapejara.dominio.com`
→ slug `tapejara`, que resolve logo, cores e nome do município antes do login).

Um subdomínio por portal exigiria `posto.tapejara.dominio.com` (3 níveis). A
Vercel **suporta** wildcards aninhados, mas cada `*.tapejara.dominio.com` é um
domínio wildcard distinto, que precisa ser cadastrado e ter DNS configurado
**por prefeitura** — o custo não é impossibilidade técnica, é trabalho manual
recorrente a cada município novo, multiplicado por portal.

**Recomendação: manter o subdomínio como identidade da prefeitura e separar os
portais por rota.**

```
tapejara.dominio.com/            → painel do gestor        (admin, gestor, secretario)
tapejara.dominio.com/posto       → Sistema de Abastecimento (role posto)
tapejara.dominio.com/oficina     → Sistema de Manutenção    (role oficina)
```

Vantagens: zero DNS por município novo, branding já resolvido pelo slug, um
único deploy, reuso de `supabase.ts`, `AuthContext`, `BrandingContext` e dos
componentes `SGF*`.

**Mesmo app Vite, não um projeto separado**, com rotas em `React.lazy` — o
parceiro não baixa o bundle do painel do gestor. O isolamento que importa é o do
banco (seção 4), não o do bundle.

### 1.1 O tenant do hostname precisa bater com o tenant do perfil

Hoje o branding vem do hostname, mas o usuário autenticado pode ser de outro
tenant: um posto da Prefeitura B logando em `prefeitura-a.dominio.com/posto`
veria a marca de A. A RLS protegeria os dados, mas a tela mentiria — confusão
operacional e vetor de phishing.

Depois de carregar o perfil: comparar `tenant do perfil` × `tenant do hostname`;
divergiu, redirecionar para o hostname canônico do tenant do perfil. O override
`?tenant=` de `getSlugFromHost()` deve ser restrito a desenvolvimento.

### 1.2 Identidade visual

Cada portal usa a **logo e as cores da prefeitura** (de `tenants`, via
`BrandingContext`) com um rótulo fixo de sistema:

| Portal | Rótulo | Acento sugerido |
|---|---|---|
| Posto | `Sistema de Abastecimento` + município | âmbar `#F59E0B` |
| Oficina | `Sistema de Manutenção` + município | azul `#3B82F6` |

> **Conflito documental a resolver:** `AGENTS.md:79` diz "Cores (NUNCA MUDE)" e
> `AGENTS.md:763` proíbe mudar as cores do design system, mas `tenantBranding.ts`
> sobrescreve `--sgf-primary/dark/light` por prefeitura e está em produção.
> A prática venceu a regra; o documento precisa ser corrigido para "a paleta é o
> *default*; o tenant pode sobrescrever as três variáveis de marca".

---

## 2. O que já existe e será reaproveitado

| Peça | Onde | Uso no plano |
|---|---|---|
| `fuel_stations` (6 registros) | banco | Cadastro do posto — titular do login |
| `fuelings` + `fueling_workflow_status` | banco | Fluxo já modela `autorizado → concluido → validado` |
| `service_orders` + `service_order_status` | banco | Base da OS |
| `Stations.tsx` (lista + detalhe) | web | Recebe o card "Acesso ao sistema" |
| `api/managers/index.ts` + `_lib/manager-access.ts` | web/api | Padrão a copiar para o login de parceiro |
| `profiles.must_change_password`, `access_blocked` | banco | Colunas existem — mas exigem código, ver 4.3 |
| `documentos` (bucket privado por tenant) | storage | Padrão para NF, orçamento e contratos |

**O que não existe:** cadastro de oficinas. `service_orders.repair_shop` é
**texto livre** — não dá para vincular login. Precisa de tabela própria.

---

## 3. Banco de dados

### 3.1 Ordem de execução

`repair_shops` **antes** da FK em `profiles` — a ordem da revisão 1 falharia se
executada literalmente.

### 3.2 Tabela `repair_shops` (espelho de `fuel_stations`)

```
id, tenant_id, name, code, cnpj, address, city, phone,
contract_number, contract_start, contract_end,
specialties text[], is_active, notes, photo_url, documents jsonb,
created_at, updated_at
```

```sql
alter table service_orders add column repair_shop_id uuid references repair_shops(id);
-- `repair_shop` (texto) permanece para o histórico, preenchido por trigger a partir do id.
```

### 3.3 Papéis e vínculo do parceiro

```sql
alter table profiles drop constraint <check_role>;
alter table profiles add constraint profiles_role_check
  check (role in ('admin','gestor','secretario','motorista','superadmin','posto','oficina'));

-- RESTRICT, nunca CASCADE: com CASCADE, apagar um posto apaga o `profile` mas
-- NÃO o usuário em auth.users — sobra identidade autenticável órfã, que somada
-- ao fallback de user_metadata (0.3) vira acesso sem perfil.
alter table profiles add column station_id     uuid references fuel_stations(id) on delete restrict;
alter table profiles add column repair_shop_id uuid references repair_shops(id)  on delete restrict;

alter table profiles add constraint profiles_partner_link_chk check (
  (role = 'posto'   and station_id is not null and repair_shop_id is null) or
  (role = 'oficina' and repair_shop_id is not null and station_id is null) or
  (role not in ('posto','oficina') and station_id is null and repair_shop_id is null)
);
```

Desativar parceiro = `is_active = false` + `access_blocked = true` + revogar
sessões. Nunca `delete`.

**Decisão pendente (trava a fase 1):** um login por parceiro, ou vários
atendentes? Um login → índice único parcial em `profiles(station_id) where role='posto'`.
Vários → tabela `partner_memberships (partner_type, partner_id, profile_id)` e
os helpers passam a resolver por ela. Migrar de um para o outro depois é caro
porque muda a assinatura de todos os helpers de RLS.

### 3.4 Status da OS: operacional × financeiro

**A revisão 1 estava errada ao usar um único enum.** O trigger
`tf_service_order_vehicle_status` (verificado em produção) libera o veículo
apenas quando o status vira `concluida`:

```sql
if new.status in ('aprovada','em_execucao') then  -- veículo → manutencao
elsif new.status in ('concluida','rejeitada') then -- veículo → liberado
```

Com status fiscais no mesmo enum, o veículo ficaria **preso em `manutencao` até a
contabilidade pagar** — semanas depois de ter voltado a rodar. Dois eixos:

```sql
operational_status: pending | authorized | at_shop | awaiting_quote_approval
                  | in_progress | ready | received | cancelled
financial_status:   not_started | awaiting_commitment | committed
                  | invoiced | attested | paid
```

O trigger passa a olhar **só o eixo operacional** (`received`/`cancelled`
liberam o veículo). As 12 etapas da planilha viram uma projeção dos dois eixos +
`service_order_events`, não uma coluna:

| # planilha | Quem | Operacional | Financeiro |
|---|---|---|---|
| 1 Motorista identifica avaria | motorista (app) | `pending` | `not_started` |
| 2 Gestor abre OS, autoriza deslocamento | gestor | `authorized` | `not_started` |
| 3 Motorista leva o veículo | motorista | `at_shop` | `not_started` |
| 4 Oficina orça | **portal oficina** | `awaiting_quote_approval` | `not_started` |
| 5 Gestor aprova, pede reserva | gestor | `awaiting_quote_approval` | `awaiting_commitment` |
| 6 Contabilidade emite NAD/Empenho | gestor | `awaiting_quote_approval` | `committed` |
| 7 Gestor autoriza execução | gestor | `in_progress` | `committed` |
| 8 Oficina executa | **portal oficina** | `ready` | `committed` |
| 9 Motorista/Gestor confere e retira | gestor | `received` ← *veículo liberado aqui* | `committed` |
| 10 Oficina emite NF | **portal oficina** | `received` | `invoiced` |
| 11 Gestor atesta (liquidação) | gestor | `received` | `attested` |
| 12 Contabilidade paga e arquiva | gestor/financeiro | `received` | `paid` |

Migração dos dados atuais: `pendente→pending`, `aprovada→authorized`,
`em_execucao→in_progress`, `concluida→received/paid`, `rejeitada→cancelled`. O
enum antigo permanece durante a transição; o app do motorista precisa tratar
status desconhecido como "em andamento" — **conferir antes de aplicar**.

Tabelas de apoio:

- **`service_order_quotes`** (cabeçalho: `version`, `total`, `status`, `valid_until`) + **`service_order_quote_items`** (`kind` peça/mão de obra, `description`, `qty`, `unit_price`). Separar cabeçalho de itens permite validar total no servidor e versionar reenvio após recusa.
- **`service_order_events`** — append-only: `from_state`, `to_state`, `actor_id`, `actor_role`, `note`, `attachment_path`, `created_at`. É a defesa em processo administrativo.
- Fiscal: começar 1:1 (`commitment_number`, `invoice_number`, `invoice_path`, `attested_at/by`, `paid_at`) e **decidir na fase 0** se o município aceita NF múltipla ou pagamento parcial — se aceitar, vira tabela `service_order_invoices` desde já.
- `service_orders.budget` e `cost` já existem: definir se viram derivados do orçamento aprovado (recomendado) ou são depreciados. Três fontes de valor é o caminho para divergência.

### 3.5 Fluxo do posto

Encaixa no workflow existente sem enum novo:

```
gestor cria autorização        → workflow_status = 'autorizado'   (já implementado)
motorista chega ao posto       → app mostra a autorização         (já implementado)
POSTO registra o abastecimento → 'concluido' + litros, foto do bico   ← NOVO (via RPC)
gestor valida                  → 'validado'                        (já implementado)
```

Lacunas do modelo atual a fechar:

| Lacuna | Correção |
|---|---|
| Autorização não expira | `expires_at` (default: fim do dia seguinte); RPC recusa expirada |
| `station_id` pode ser nulo | Obrigatório quando a autorização vai para o portal |
| `anomaly_type` acumula observação, cancelamento e anomalia | Separar: `authorization_note`, `cancelled_at/by/reason` |
| Preço, total e odômetro vêm do cliente | `total` calculado no banco; preço vem do contrato (`fuel_prices`), divergência marca `has_anomaly` e cai na fila do gestor |
| Sem registro de quem abasteceu | `filled_by := auth.uid()`, `filled_at := now()` — no banco, não no payload |
| Envio duplo | RPC idempotente com `FOR UPDATE` + comparação de status |

Validações no servidor: litros ≤ `max_liters`, litros ≤ capacidade do tanque,
combustível ∈ `fuel_types` do posto e compatível com o veículo.

### 3.6 RLS — parceiro não recebe DML direto

**Correção importante da revisão 1.** O plano anterior dava `UPDATE` em
`fuelings` ao posto "só de `autorizado → concluido` e só das colunas de
execução". Isso não é implementável com RLS:

- uma policy filtra **linhas**, não colunas — nada impediria o posto de alterar `total_cost`, `validated_by`, `has_anomaly` ou `tenant_id` da mesma linha;
- `GRANT UPDATE(col)` existe no Postgres, mas **todo usuário do app compartilha o mesmo papel `authenticated`** — um grant de coluna atingiria gestor e posto igualmente;
- `WITH CHECK` valida o estado final, não a transição: nada garante que o valor anterior era `autorizado`.

**Parceiro escreve exclusivamente por RPC `SECURITY DEFINER`:**

```
partner_complete_fueling(p_fueling_id, p_liters, p_odometer, p_receipt_no, p_photo_path)
repair_shop_submit_quote(p_order_id, p_items jsonb, p_valid_until)
repair_shop_start_service(p_order_id)
repair_shop_finish_service(p_order_id, p_note, p_photo_paths)
repair_shop_submit_invoice(p_order_id, p_invoice_no, p_invoice_path)
```

Toda RPC: deriva usuário/tenant/parceiro de `auth.uid()` (nunca do payload) →
recusa parceiro inativo, bloqueado ou com contrato vencido → `SELECT … FOR UPDATE`
→ valida o status **anterior** → valida os valores → grava → registra
`service_order_events` → idempotente.

**Leitura também por RPC, não por view.** A revisão 1 propunha views
`security_invoker` sobre `vehicles`/`profiles` — que não funcionariam: uma view
`security_invoker` herda a RLS das tabelas-base, e como o parceiro não pode
selecionar `vehicles`, a view voltaria vazia. A alternativa (view `definer`)
ignoraria RLS e viraria justamente o vazamento que se quer evitar.

```
get_station_pending_authorizations()  → id, placa, marca/modelo, combustível, teto, expira_em
get_station_history(p_from, p_to)     → execuções do próprio posto + status de validação
get_repair_shop_orders()              → id, placa, marca/modelo, ano, km, descrição, estado
```

**`partner_driver_view` foi removida do plano** — nem o posto nem a oficina
precisam saber quem é o motorista. Placa e dados mínimos do veículo bastam, e o
que não trafega não vaza (LGPD: necessidade).

Policies de tabela para o parceiro ficam **somente `SELECT`**, sempre com
`tenant_id = get_user_tenant_id()` **e** vínculo (`station_id = get_user_station_id()`).
Nenhum `INSERT`/`UPDATE`/`DELETE` direto. Nenhum acesso a `vehicles`,
`profiles`, `trips`.

### 3.7 Grants explícitos e índices

Tabelas novas precisam de `GRANT`/`REVOKE` explícitos — o Supabase deixou de
expor tabelas novas na Data API automaticamente, e grants são camada separada da
RLS. Nas RPCs: `revoke all from public, anon` + `grant execute to authenticated`.

```sql
create index on fuelings (tenant_id, station_id, workflow_status, authorized_at);
create index on service_orders (tenant_id, repair_shop_id, operational_status);
create index on repair_shops (tenant_id, is_active);
create index on service_order_quotes (service_order_id, version);
create index on service_order_events (service_order_id, created_at);
create unique index on profiles (station_id) where role = 'posto';      -- se 1 login/parceiro
create unique index on profiles (repair_shop_id) where role = 'oficina';
```

### 3.8 Storage dos anexos

- **NF, orçamento e contrato → bucket `documentos` (privado)**, nunca `fotos`. Nota fiscal em bucket público é exposição de dado fiscal de terceiro.
- Caminho: `documentos/tenant/{tenant_id}/stations/{station_id}/…` e `…/repair_shops/{repair_shop_id}/…`, seguindo o padrão já validado (`foldername[2] = get_user_tenant_id()`).
- Policy adicional exigindo o vínculo do parceiro no segmento correspondente.
- Definir `file_size_limit` e `allowed_mime_types` nos dois buckets (hoje ambos `null`).
- Leitura por **URL assinada curta**, padrão de `web/src/lib/docStorage.ts`.
- Upload com `upsert` exige `SELECT` + `UPDATE` na policy — considerar ao escrever.

---

## 4. Autenticação e criação de acesso

**Mesmo Supabase Auth, e-mail/senha.** O isolamento vem do papel + RLS + RPC.

### 4.1 Onde o login é criado

Dentro da **página de detalhes do posto** (`/postos/:id`) e da nova
**página de detalhes da oficina** (`/oficinas/:id`), num card **"Acesso ao sistema"**:
vazio → *Criar acesso*; existente → e-mail, último login, *Resetar senha*, *Bloquear*.

### 4.2 Rotas serverless (espelham `api/managers/index.ts`)

`web/api/partners/` — a UI precisa de mais que `POST`:

| Método/rota | Ação |
|---|---|
| `POST /api/partners` | criar acesso |
| `PATCH /api/partners/[id]` | bloquear / desbloquear |
| `POST /api/partners/[id]/reset-password` | nova senha provisória |
| `GET /api/partners/[id]` | e-mail, último login, estado |

Toda rota: `getCaller(req)` → só `admin` (decisão pendente: `gestor` também?) →
**valida que o `station_id`/`repair_shop_id` pertence ao tenant do chamador**
(sem isso, um admin cria login para posto de outra prefeitura) → `tenant_id`
sempre do chamador, nunca do body → rollback (`deleteUser`) se o update falhar.

### 4.3 Gate de acesso — três correções no frontend

1. **Denylist → allowlist.** `AuthContext.fetchUserProfile` hoje derruba só `motorista` (`AuthContext.tsx:100`); papéis novos entrariam no painel do gestor por omissão. Painel: `admin|gestor|secretario|superadmin`. Portal do posto: `posto`. Portal da oficina: `oficina`. Quem erra a URL é redirecionado ao seu portal, não deslogado.
2. **`access_blocked` exige código** — a revisão 1 dizia "sem código novo", o que estava errado: `fetchUserProfile` nem seleciona a coluna (`AuthContext.tsx:93`). Precisa ser checado em três camadas: frontend (UX), helpers/RPCs do banco (autoridade), e rotas serverless (um token já emitido continua chamando a API mesmo com a tela escondida).
3. **Remover o fallback de `user_metadata`** (ver 0.3).

---

## 5. Telas dos portais

### Sistema de Abastecimento (posto)

1. **Autorizações pendentes** (home) — placa, veículo, combustível, teto, **expira em**. Ação: registrar abastecimento (litros, odômetro, foto do bico, nº do cupom). Preço e total vêm do contrato, exibidos como leitura.
2. **Histórico** — execuções do posto com status de validação (validado / rejeitado + motivo).
3. **Fechamento do mês** — litros e valor por período para conferir com a NF. *(fase 6)*
4. **Meus dados** — contrato, vencimento, preços vigentes; atualização de preço é **solicitação** sujeita a aprovação do gestor.

### Sistema de Manutenção (oficina)

1. **OS recebidas** (home) — agrupadas por estado operacional.
2. **Enviar orçamento** — itens de peça e mão de obra; total conferido no servidor.
3. **Execução** — início/fim, fotos do serviço.
4. **Faturamento** — após `received`, anexar NF citando o número do empenho (que a oficina vê) — evita devolução do processo pela contabilidade.
5. **Meus dados** — contrato, especialidades, documentos.

Em ambos: header com logo do município + rótulo do sistema, e timeline por
registro mostrando etapa atual e de quem é a bola — o que hoje se resolve por telefone.

### No painel do gestor

- Nova aba **Oficinas** (`/oficinas`, `/oficinas/:id`) espelhando `Stations.tsx`;
- **Manutenções**: oficina por FK, aprovação de orçamento, campos de empenho/NF/ateste, timeline dos dois eixos;
- **Postos**: card de acesso + fila de validação.

---

## 6. Fases de entrega

| Fase | Entrega | Depende de |
|---|---|---|
| **−1** ✅ | Aplicar fix do bucket `fotos`; reconciliar 85 migrations; remover fallback de metadata; senha 8+ e proteção de senha vazada; limites de MIME/tamanho | — (independe dos portais) |
| **0** ✅ | Decisões de domínio: 1 login ou N por parceiro; fiscal 1:1 ou 1:N; quem cria acesso; preço contratual; expiração | −1 |
| **1** ✅ | Primitivas: `repair_shops`, papéis, constraints, índices, **grants explícitos**, buckets/paths, helpers e **RPCs atômicas**. Sem portal. | 0 |
| **2** ✅ | **Suíte de testes de isolamento** — parceiro × parceiro (mesmo tenant), tenant × tenant, parceiro bloqueado, contrato vencido, mutação indevida, envio duplo concorrente, storage cross-tenant | 1 |
| **3** ✅ | Aba Oficinas no painel + `repair_shop_id` na OS | 1 |
| **4** ✅ | Criação de acesso (card + `api/partners`) + allowlist + `PrivateRoute allow` + check hostname×tenant | 1 |
| **5** 🟡 | Portal do Posto — **implementação concluída**; falta piloto com uma prefeitura e um posto real, monitorando eventos e falhas | 2, 4 |
| **6** ✅ | Dois eixos de status + quotes/events + telas fiscais no painel | 3 |
| **7** 🟡 | Portal da Oficina — implementação, RPCs e policy do Storage concluídas; falta piloto autenticado | 4, 6 |
| **8** 🟡 | Fechamento mensal, relatórios por parceiro e notificações — implementação concluída; falta piloto autenticado | — |

A suíte SQL automatizada de RLS/integração está em
`supabase/tests/rls_partner_isolation.sql`. Ela é obrigatória antes de liberar
cada portal: é o mecanismo que impede um vazamento entre parceiros ou entre
prefeituras de passar despercebido.

---

## 7. Riscos e decisões pendentes

1. **Vazamento entre parceiros/prefeituras** — risco central. Mitigação: vínculo sempre resolvido por função `SECURITY DEFINER` a partir de `auth.uid()`, nunca por parâmetro; escrita só por RPC; suíte da fase 2 antes de liberar cada portal.
2. **Um login ou vários por parceiro** — trava a fase 1 (muda a assinatura de todos os helpers de RLS).
3. **Modelo fiscal 1:1 ou 1:N** — o município aceita NF múltipla ou pagamento parcial numa OS? Decidir antes de criar as colunas.
4. **Enum antigo da OS** é compartilhado com o app do motorista — só adicionar, e confirmar que o app trata status desconhecido antes de aplicar.
5. **Parceiro que atende várias prefeituras** — no modelo proposto recebe **um login por prefeitura** (`profiles` tem um único `tenant_id`). Login único com troca de prefeitura exige vínculo N:N e muda toda a RLS.
6. **Quem cria o acesso**: só `admin` ou `gestor` também?
7. **`budget`/`cost` vs. orçamento aprovado** — evitar três fontes de valor.
8. **CORS das edge functions** — pendência já registrada em `PRODUCAO.md`; revisar quando os domínios finais existirem.

---

## 8. Notificações (bug reportado em 2026-07-26)

**Sintoma:** o app do motorista listava tudo e travava, e "notificação do gestor
caía no motorista".

**Causa:** a conta usada no app era a de **admin** (863 notificações), e o app
não tinha gate de papel — então uma conta de gestão entrava e via os alertas de
frota, que nascem endereçados a ela. O motorista de verdade tinha 3. Junto
disso, `getNotifications` não tinha limite: a home e a tela carregavam todas as
linhas do usuário.

**Corrigido**

| Camada | O que mudou |
|---|---|
| App | Gate de papel: só `motorista` entra. Conta de gestão vê tela explicando que deve usar o painel |
| App e painel | Modal do sino: 15 itens + "Mostrar mais" |
| App e painel | Histórico: seletor 25/50/100, padrão 50 |
| App e painel | Badge usa contagem no servidor, não o tamanho do array carregado |
| Banco | `notify_fleet_managers` mirava `('admin','manager','superadmin')` — **`manager` não existe** no check de `profiles.role`, então **gestor nunca recebeu alerta de frota**. Passou a `('admin','gestor')`, pulando perfis bloqueados |
| Banco | Dedup de "movimento sem viagem" só olhava notificação **não lida** em 30 min: ao ler, o alerta renascia no ping seguinte do rastreador (~94/dia). Agora ignora o estado de leitura e a janela é de 2 h |
| Banco | Paginação por **cursor** no lugar de OFFSET (a página 50 custava 50× a primeira) |
| Banco | Índice `(driver_id, created_at desc)` — o que existia tinha `read` no meio e forçava **Sort**. Confirmado por `EXPLAIN`: agora é Index Scan sem Sort. Mais um índice parcial para o badge |
| Banco | `purge_old_notifications` no pg_cron: lidas > 90 dias e qualquer uma > 365 dias |

**Limpeza autorizada:** 1.611 notificações de alerta de frota removidas
(restaram 26).

**Pendência:** o índice `idx_notifications_recipient` virou quase redundante.
Todo índice custa escrita, mas remover índice em produção é decisão à parte.

---

## 9. Fase 5 — Portal do Posto (implementação de 2026-07-26)

### O que entrou

- `/posto/login` com identidade da prefeitura e rótulo “Sistema de
  Abastecimento”;
- fronteiras explícitas de papel: painel, posto e oficina não entram nas rotas
  uns dos outros; perfil bloqueado é recusado também no frontend;
- `/posto` em `React.lazy`, sem carregar o bundle do painel: autorizações com
  atualização a cada 30 s, limite/expiração, preço contratual somente leitura;
- registro exige litros, hodômetro inteiro, número do cupom e foto do bico. A
  imagem é otimizada e gravada em
  `tenant/{tenant}/stations/{station}/fuelings/{authorization}/…`;
- `partner_complete_fueling_v2` valida cupom e caminho da foto no banco. O
  `EXECUTE` da RPC antiga, que aceitava foto/cupom nulos, foi revogado de
  `authenticated`;
- histórico com período e paginação de 25 itens, mostrando aguardando
  validação, validado ou rejeitado com motivo;
- “Meus dados” com contrato, vencimento e preços vigentes;
- `resolve_tenant_host` fecha uma lacuna da fase 4: o branding público não
  devolvia o UUID do tenant, portanto o guard anterior nunca conseguia provar
  hostname × tenant divergentes. O override `?tenant=` agora só existe em dev.

### Evidências

| Verificação | Resultado |
|---|---|
| Migration inteira contra schema real, com sentinela de rollback | ✅ |
| Suíte `rls_partner_isolation.sql` atualizada para a RPC v2 | ✅ 15/15, rollback automático |
| Permissões | ✅ `anon`: sem histórico/registro; `authenticated`: somente histórico + RPC v2 |
| TypeScript | ✅ `tsc -b` |
| Lint direcionado aos arquivos alterados | ✅ zero achados |
| Build Vite de produção | ✅ portal em chunk separado: 24,68 kB (6,99 kB gzip) |
| Login `/posto/login` desktop | ✅ conteúdo, campos e rótulo; sem overlay/console error |
| Login 390 × 844 | ✅ sem overflow horizontal |
| `/posto` sem sessão | ✅ redireciona para `/posto/login` |
| Fluxo logado ponta a ponta | ⛔ não executado: existem 0 perfis `posto` no banco |

### Roteiro obrigatório do piloto

1. No painel, abrir um posto ativo com contrato/preço vigente e criar o acesso
   pelo card “Acesso ao sistema”.
2. Fazer o primeiro login em `/posto/login` e trocar a senha provisória.
3. No painel, criar uma autorização para esse posto.
4. No portal, confirmar que só essa autorização aparece e registrar um
   abastecimento com foto/cupom.
5. Confirmar no painel que o valor veio do contrato, validar o lançamento e
   conferir o status “Validado” no histórico do posto.
6. Repetir os testes negativos: litros acima do teto, autorização expirada,
   envio duplicado e bloqueio do acesso.

---

## 10. Fase 7 — Portal da Oficina (implementação de 2026-07-26)

### O que entrou

- `/oficina` em bundle separado, com OS agrupadas em “sua atenção”, “em
  execução” e “finalizadas”, atualização automática e indicação explícita da
  próxima etapa;
- detalhe da OS com os dois eixos de situação, descrição, empenho, versões de
  orçamento, notas fiscais e timeline append-only;
- envio de orçamento itemizado (peças e mão de obra), com quantidade, preço,
  validade e total recalculado no servidor;
- início do serviço somente depois do empenho; conclusão exige descrição e de
  uma a dez fotos no diretório da própria oficina/OS;
- faturamento somente depois do recebimento do veículo, exibindo o número do
  empenho e exigindo anexo privado da NF;
- “Meus dados” com cadastro, contrato e especialidades;
- RPCs `repair_shop_*_v2` com validação de conteúdo/caminho. O `EXECUTE` das
  versões antigas foi revogado de `authenticated`.

### Evidências

| Verificação | Resultado |
|---|---|
| Migration das RPCs em produção | ✅ `20260726031428_workshop_portal_security` |
| Permissões das RPCs | ✅ `anon`: nenhuma; `authenticated`: somente versões v2 |
| Suíte de isolamento ampliada | ✅ 20/20, rollback automático |
| Policy de documentos | ✅ `documentos_tenant_all` endurecida em `USING` e `WITH CHECK`; T16b bloqueia escrita cross-partner |
| TypeScript | ✅ `tsc -b` |
| Lint direcionado | ✅ zero achados |
| Build Vite de produção | ✅ portal em chunk separado: 36,80 kB (9,74 kB gzip) |
| Fluxo logado ponta a ponta | ⛔ existem 0 perfis `oficina` no banco |

**Policy aplicada:** `storage.objects` pertence a `supabase_storage_admin`, por
isso a conexão de migrations retornava `42501`. A policy existente
`documentos_tenant_all` foi editada em **Storage → Policies** para preservar o
escopo por tenant dos gestores e limitar postos/oficinas à pasta do próprio
vínculo. As expressões persistidas de `USING` e `WITH CHECK` foram conferidas
diretamente em `pg_policy`; a suíte completa passou 20/20.

### Roteiro obrigatório do piloto

1. Criar o acesso de uma oficina ativa e entrar por `/oficina/login`.
2. Vincular e autorizar uma OS, receber o veículo e enviar um orçamento com
   peças e mão de obra.
3. Aprovar o orçamento e informar o empenho pelo painel; iniciar e concluir o
   serviço no portal com foto.
4. Receber o veículo no painel e enviar a NF pelo portal; atestar e pagar no
   painel, conferindo os dois eixos e a timeline.
5. Repetir os testes negativos: outra oficina/tenant, acesso bloqueado,
   contrato vencido, orçamento duplicado, início sem empenho e NF antes do
   recebimento.

---

## 11. Fase 8 — Fechamento, relatórios e notificações (2026-07-26)

### O que entrou

- nova aba **Fechamento** no portal do posto, por competência mensal, separando
  valor apresentado, validado, aguardando conferência e rejeitado, com quebra
  por combustível;
- RPC `get_station_monthly_summary`: o parceiro é resolvido por
  `auth.uid()`/`partner_context`, sem receber `station_id` do cliente;
- relatórios gerenciais exportáveis **Fechamento por Posto** e **Manutenções
  por Oficina**, respeitando período e secretaria;
- sino nos dois portais, com oito avisos recentes, contagem no servidor,
  atualização a cada 30 segundos e marcação individual/em lote;
- avisos automáticos para o posto quando recebe uma autorização ou quando o
  lançamento é validado/rejeitado;
- avisos automáticos para a oficina em nova OS/entrega, devolução ou aprovação
  do orçamento, empenho, recebimento do veículo, ateste e pagamento;
- helper `notify_partner_profile` resolve o destinatário pelo vínculo do
  parceiro e ignora acessos bloqueados. Usuários autenticados não têm
  `EXECUTE` direto nesse helper nem nos gatilhos.

### Evidências

| Verificação | Resultado |
|---|---|
| Migration inteira no schema real com rollback por sentinela | ✅ |
| Migration em produção | ✅ `20260726033245_partner_closing_notifications` |
| Teste do fechamento isolado | ✅ T19: 10 L / R$ 60 apenas do posto A1 |
| Teste de destinatário da notificação | ✅ T20: posto A1 recebe 1; não vê A2/B1 |
| Permissões | ✅ fechamento só `authenticated`; helper/gatilhos sem `EXECUTE` para `anon` ou `authenticated` |
| Gatilhos em produção | ✅ ativos em `fuelings`, `service_orders` e `service_order_quotes` |
| Suíte completa | ✅ 20/20, rollback automático |
| TypeScript | ✅ `tsc -b` |
| Lint direcionado | ✅ zero achados |
| Build Vite de produção | ✅ posto 30,78 kB; oficina 36,97 kB; sino compartilhado 3,38 kB |
| Fluxo visual autenticado | ⛔ sem perfis `posto`/`oficina` para executar |

### Piloto

O roteiro das fases 5 e 7 cobre a origem dos eventos. Durante o piloto, conferir
também:

1. o aviso aparece no sino do parceiro correto e abre a rota do próprio portal;
2. marcar individualmente e “marcar todas” atualiza a contagem;
3. após validar/rejeitar abastecimentos, o fechamento do mês confere com o
   relatório gerencial por posto;
4. após pagar uma OS, o relatório por oficina reflete custo final e processo
   encerrado.
