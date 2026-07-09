# CLAUDE.md — SGF 2026

> **Este arquivo é a fonte da verdade do projeto.**
> Leia-o completamente antes de qualquer ação.
> Para o estado atual das tarefas de produção (o que falta, prompts prontos,
> decisões pendentes), leia também `sgf-2026/PRODUCAO.md`.

---

## 🎯 VISÃO GERAL DO PROJETO

**SGF 2026** (Sistema de Gestão de Frotas Municipal) é uma plataforma para
controle de frotas de prefeituras. **Não há backend próprio (NestJS) nem app
mobile em Flutter** — essa era uma arquitetura antiga, abandonada.

### Componentes reais do sistema

| Componente | Onde | Stack |
|---|---|---|
| Painel do gestor | `sgf-2026/web` | React + Vite + TypeScript, Tailwind puro. Fala direto com o Supabase (client) + algumas rotas serverless da Vercel em `sgf-2026/web/api` |
| Painel superadmin | `sgf-2026/admin` | React + Vite + TypeScript, serverless em `sgf-2026/admin/api` |
| App do motorista | Repo separado: https://github.com/luanmachadops/appFrota | **React Native / Expo** (não é Flutter) |
| Banco | Supabase (projeto `kgxdrgbxpfoebzrphtqg`, `FrotaMunicipal`, sa-east-1) | Postgres 17, multi-tenant via RLS (tabela `tenants`, coluna `tenant_id` em praticamente todas as tabelas) |
| Edge functions | `sgf-2026/supabase/functions` | Ex.: `iopgps-command`, `iopgps-history`, `iopgps-sync` (integração com rastreadores IOPGPS). Outras podem existir só deployadas — conferir `supabase/functions/README.md` e o painel do Supabase antes de assumir que uma function não existe |

Não confie de olho neste documento sozinho para saber o que está deployado —
edge functions podem ter sido criadas direto no painel do Supabase sem passar
pelo repo. Sempre confirme com `supabase functions list` ou pelo MCP do
Supabase antes de assumir que uma function existe (ou não existe).

### Estrutura de pastas (real)

```
AppFrota-web/               # monorepo (branch main)
├── CLAUDE.md                # ← você está aqui
├── sgf-2026/
│   ├── PRODUCAO.md          # plano de go-live: tarefas, prompts prontos, decisões pendentes
│   ├── web/                 # painel do gestor
│   │   ├── src/
│   │   │   ├── pages/       # uma página por rota (Dashboard, Vehicles, Drivers, Trips, ...)
│   │   │   ├── components/  # componentes de UI (prefixo SGF*) e por domínio (drivers/, settings/, ...)
│   │   │   ├── contexts/    # AuthContext, HeaderContext
│   │   │   ├── hooks/       # ex.: useDrivers, useRealtimeSync
│   │   │   ├── lib/         # supabase.ts (client), supabase-api.ts (queries), backend-api.ts (chama web/api)
│   │   │   └── types/       # database.types.ts gerado do Supabase
│   │   └── api/             # funções serverless da Vercel (ex.: drivers/pre-register.ts)
│   ├── admin/                # painel superadmin (mesma stack de web/)
│   │   ├── src/
│   │   └── api/
│   ├── supabase/
│   │   ├── functions/        # edge functions versionadas
│   │   └── migrations/       # migrations SQL aplicadas em produção
│   └── database/             # scripts/schema de referência (se houver)
└── (app do motorista fica em repo separado: appFrota)
```

Não existe `sgf-2026/backend/` (era um NestJS morto, removido). Não existe
diretório `mobile/` em Flutter — o app do motorista é Expo/React Native, em
repositório próprio.

---

## 🎨 DESIGN SYSTEM

### Cores (NUNCA MUDE)

```
┌─────────────────────────────────────────────────────────────┐
│  CORES OBRIGATÓRIAS — USE EXATAMENTE ESTES VALORES         │
├─────────────────────────────────────────────────────────────┤
│  Primary Dark    │ #0F2B2F │ HSL(188, 49%, 12%)            │
│  Primary Green   │ #00A86B │ HSL(160, 100%, 33%)           │
│  Light Accent    │ #70C4A8 │ HSL(161, 33%, 60%)            │
├─────────────────────────────────────────────────────────────┤
│  Surface         │ #F5F7F9 │ Backgrounds claros            │
│  White           │ #FFFFFF │ Cards, modais                 │
│  Text Primary    │ #1F2937 │ Textos principais             │
│  Text Secondary  │ #6B7280 │ Textos secundários            │
├─────────────────────────────────────────────────────────────┤
│  Success         │ #22C55E │ Confirmações                  │
│  Error           │ #DC2626 │ Erros, exclusões              │
│  Warning         │ #F59E0B │ Alertas                       │
│  Info            │ #3B82F6 │ Informações                   │
├─────────────────────────────────────────────────────────────┤
│  Status Moving   │ #22C55E │ Veículo em movimento          │
│  Status Idle     │ #3B82F6 │ Veículo parado/ligado         │
│  Status Stopped  │ #9CA3AF │ Veículo desligado             │
│  Status Alert    │ #EF4444 │ Veículo com problema          │
└─────────────────────────────────────────────────────────────┘
```

### Tipografia

- **Fonte:** Inter (Google Fonts)
- **Headings:** Bold, 24-32px
- **Body:** Regular, 14-16px
- **Labels:** Medium, 12px
- **Mobile mínimo:** 16px

### Regras de UI

- Tailwind puro — **não usar** bibliotecas de componentes prontas (Material UI, Chakra, etc.).
- Componentes reutilizáveis do painel usam o prefixo `SGF*` (`SGFButton`, `SGFCard`, `SGFTable`, `SGFInput`, `SGFSelect`, `SGFBadge`, `SGFKPICard`, `SGFToolbar`, ícones em `@/components/sgf/icons`).

---

## 🗄️ BANCO DE DADOS

- Postgres via Supabase, **multi-tenant por RLS**: quase toda tabela tem
  `tenant_id`, resolvido no banco por `get_user_tenant_id()`. Nunca escreva
  queries que ignorem RLS assumindo que o cliente vai filtrar por tenant.
- Papéis (`profiles.role`): `superadmin`, `admin`, `gestor`, `secretario`,
  `motorista`.
- Storage: bucket `fotos` (público, sem listagem) e `documentos` (privado,
  acesso via URL assinada — usar o padrão de `web/src/lib/docStorage.ts`).
- Fluxo real de manutenção usa a tabela `service_orders` (criadas a partir de
  checklist crítico ou solicitação manual). A tabela `maintenances` existe no
  schema mas está morta (0 rows) — não assuma que é a fonte de manutenções
  reais sem checar `PRODUCAO.md`.
- Tipos TypeScript do banco: gerados em `web/src/types/database.types.ts` via
  `npx supabase gen types typescript --project-id kgxdrgbxpfoebzrphtqg --schema public`.
  Rode esse comando (documentado em `PRODUCAO.md`) sempre que o schema mudar,
  em vez de editar o arquivo à mão.

Antes de propor uma migration (DDL), leia `sgf-2026/PRODUCAO.md` —
mudanças de schema em produção exigem aprovação explícita do usuário.

---

## 🔌 ACESSO A DADOS

Não há uma API REST própria com rotas fixas (`/api/vehicles`, `/api/drivers`,
etc.) como em versões antigas deste documento. Os dois padrões reais são:

1. **Client Supabase direto** (a maioria das leituras/escritas): queries e
   mutations centralizadas em `web/src/lib/supabase-api.ts` (e equivalente em
   `admin/src/lib/`), respeitando RLS.
2. **Serverless functions da Vercel**, para operações que precisam de
   `service_role` ou lógica que não pode rodar no client (ex.: pré-cadastro de
   motorista com senha provisória): `web/api/**` e `admin/api/**`, chamadas
   pelo client via `web/src/lib/backend-api.ts`.

Edge functions do Supabase (`supabase/functions/`) cobrem integrações
externas (IOPGPS) e tarefas que precisam rodar fora do Vercel/client, alcançáveis
via `supabase.functions.invoke(...)`. Antes de adicionar uma chamada a uma edge
function, confirme que ela existe e está deployada — várias já foram removidas
por não terem consumidor real (ver T5 em `PRODUCAO.md`).

---

## 📱 APP DO MOTORISTA

Vive em repositório separado (https://github.com/luanmachadops/appFrota),
**Expo/React Native**, não Flutter. Se for necessário alterar o app, clone
esse repo à parte; ele tem seu próprio `CLAUDE.md`.

Fluxo resumido (para contexto ao mexer no painel/backend que o afeta):
login por CPF → seleciona veículo (QR/placa) → checklist pré-viagem → viagem
com rastreamento GPS → encerramento. Itens críticos do checklist (freios,
pneus, luzes) bloqueiam a viagem e geram `service_order`.

---

## 🖥️ TELAS DO PAINEL WEB (`sgf-2026/web`)

Páginas reais em `web/src/pages/`: `Dashboard`, `Map`, `Vehicles`,
`VehicleDetails`, `Drivers`, `DriverDetails`, `Trips`, `Refuelings`,
`Maintenances`, `Infracoes`, `Departments`, `Stations`, `Reports`,
`Configuracoes`, `Perfil`, `Login`. A lista de rotas ativas está em
`web/src/App.tsx` — confira lá antes de assumir uma rota deste documento
como existente; páginas podem ser adicionadas/removidas sem que este arquivo
seja atualizado no mesmo commit.

---

## ✅ REGRAS DE NEGÓCIO

### Vinculação de veículo / conflito

- Motorista escaneia QR Code ou busca por placa/código.
- RPC `check_vehicle_conflict(uuid)` detecta se outro motorista já está em
  viagem com o veículo; app oferece confirmação/takeover.

### Checklist

```
ITENS DO TEMPLATE ATUAL: óleo, pneus, água, freios, luzes, condições gerais
ITENS CRÍTICOS (bloqueiam viagem): freios, pneus, luzes
  (não há item "direção" hoje — avaliar adicionar, ver T3 em PRODUCAO.md)

SE item crítico = "atenção":
  → Bloquear início de viagem
  → Gerar service_order automática (priority alta)
  → Notificar gestor (trigger trg_notify_service_order)
```

### Abastecimento

- Registro com fotos (requisição, dashboard, recibo, opcional) e workflow de
  aprovação pelo gestor no painel.

### Alertas / notificações

- CNH vencendo/vencida, veículo com problema, viagem em andamento fora do
  padrão, etc. — verifique o estado real em `web/src/lib/supabase-api.ts`
  (seção NOTIFICATIONS) e nas triggers do banco antes de assumir um alerta
  como implementado; regras específicas evoluem rápido e este documento não
  tenta listá-las todas.

---

## 🚨 CUIDADOS E ARMADILHAS

### NÃO FAÇA

```
❌ Mudar as cores do design system
❌ Usar bibliotecas de UI prontas (Material UI, Chakra) — use Tailwind puro
❌ Assumir que existe uma API REST própria (não existe — ver "Acesso a dados")
❌ Aplicar DDL em produção sem aprovação explícita do usuário
❌ Revogar EXECUTE das funções helper de RLS (is_admin, get_user_tenant_id, sgf_role, ...) de `authenticated` — as policies dependem delas
❌ Ignorar RLS / multi-tenant ao escrever queries novas
❌ Fazer upload sem validar tipo de arquivo
❌ Deixar console.log em produção
❌ Commitar/pushar/abrir PR sem o usuário pedir explicitamente
```

### SEMPRE FAÇA

```
✅ Ler sgf-2026/PRODUCAO.md antes de tarefas de produção — é o registro vivo do que falta e do que já foi feito
✅ Validar entrada em todas as rotas serverless (web/api, admin/api)
✅ Tratar loading e error states no frontend
✅ Rodar `npx tsc --noEmit` em web (e admin, se tocado) depois de mudanças
✅ Confirmar com grep que algo não tem chamadores antes de remover
✅ Usar tipos TypeScript (nunca `any` sem necessidade real)
✅ Fazer commits separados por mudança lógica, com mensagem descritiva
```

---

## 📞 COMANDOS ÚTEIS

```bash
# Web (painel do gestor)
cd sgf-2026/web
npm run dev
npx tsc --noEmit -p tsconfig.app.json

# Admin (superadmin)
cd sgf-2026/admin
npm run dev
npx tsc --noEmit

# Tipos do banco
npx supabase gen types typescript --project-id kgxdrgbxpfoebzrphtqg --schema public > sgf-2026/web/src/types/database.types.ts

# Edge functions (deploy manual)
supabase functions deploy <slug> --project-ref kgxdrgbxpfoebzrphtqg

# App mobile (repo separado)
git clone https://github.com/luanmachadops/appFrota && cd appFrota && npm i && npx expo start
```

---

**Última atualização:** 2026-07-08 (reescrito para refletir a arquitetura real — ver `sgf-2026/PRODUCAO.md` T5).
