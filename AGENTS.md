# AGENTS.md — SGF 2026

> **Este arquivo é a fonte da verdade do projeto.**
> Leia-o completamente antes de qualquer ação.
> Consulte-o sempre que tiver dúvidas sobre arquitetura, padrões ou decisões.

---

## 🎯 VISÃO GERAL DO PROJETO

**SGF 2026** (Sistema de Gestão de Frotas Municipal) é uma plataforma para controle de frotas de prefeituras, focado no setor de obras/garagem.

### Componentes do Sistema

| Componente | Tecnologia | Porta | Descrição |
|------------|------------|-------|-----------|
| `backend/` | NestJS + TypeScript | 3000 | API REST |
| `web/` | React + Vite + TypeScript | 5173 | Painel do Gestor |
| `mobile/` | Flutter | - | App do Motorista |
| `database` | PostgreSQL + PostGIS | 5432 | Banco de dados |

### Estrutura de Pastas

```
sgf-2026/
├── AGENTS.md            # ← VOCÊ ESTÁ AQUI
├── README.md
├── docker-compose.yml
├── backend/
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── config/
│   │   ├── common/
│   │   │   ├── decorators/
│   │   │   ├── filters/
│   │   │   ├── guards/
│   │   │   └── interceptors/
│   │   └── modules/
│   │       ├── auth/
│   │       ├── users/
│   │       ├── drivers/
│   │       ├── vehicles/
│   │       ├── trips/
│   │       ├── refuelings/
│   │       ├── maintenances/
│   │       ├── checklists/
│   │       ├── departments/
│   │       └── dashboard/
│   ├── prisma/          # ou typeorm/
│   └── test/
├── web/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   ├── layout/
│   │   │   └── features/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── stores/
│   │   └── types/
│   └── public/
└── mobile/
    └── lib/
        ├── main.dart
        ├── app/
        ├── core/
        ├── features/
        └── shared/
```

---

## 🎨 DESIGN SYSTEM

### Cores (padrão do produto — o tenant pode sobrescrever 3)

> **Atenção:** as três cores de MARCA (`--sgf-primary`, `--sgf-dark`,
> `--sgf-light`) são sobrescritas por prefeitura em tempo de execução, por
> `applyBrandingColors()` em `web/src/lib/tenantBranding.ts`, a partir de
> `tenants.primary_color/dark_color/accent_color`. Isso é intencional: o sistema
> é white-label e cada município aparece com a própria identidade.
>
> O que NÃO muda: os valores abaixo como **padrão** (quando o tenant não define
> cor) e as cores **semânticas** — sucesso, erro, aviso, informação e status de
> veículo. Essas continuam fixas, porque significam a mesma coisa em qualquer
> prefeitura.

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

### Aplicação das Cores

| Elemento | Cor | Código |
|----------|-----|--------|
| Sidebar/Header | Primary Dark | `#0F2B2F` |
| Botões primários | Primary Green | `#00A86B` |
| Botões hover | Light Accent | `#70C4A8` |
| Background página | Surface | `#F5F7F9` |
| Cards | White | `#FFFFFF` |
| Botão secundário | Borda Primary Green | `border: #00A86B` |
| Links | Primary Green | `#00A86B` |
| Ícones ativos | Primary Green | `#00A86B` |
| Ícones inativos | Text Secondary | `#6B7280` |

---

## 🗄️ BANCO DE DADOS

### Entidades e Relacionamentos

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ departments │────<│   vehicles  │────<│    trips    │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │            ┌──────┴──────┐           │
       │            │             │           │
       ▼            ▼             ▼           ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   drivers   │  │ refuelings  │  │ checklists  │
└─────────────┘  └─────────────┘  └─────────────┘
       │                │
       │                │
       ▼                ▼
┌─────────────┐  ┌─────────────┐
│    users    │  │maintenances │
│   (painel)  │  └─────────────┘
└─────────────┘
```

### Schema Principal

```sql
-- DEPARTMENTS (Secretarias)
departments (
  id UUID PK,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) UNIQUE,
  created_at TIMESTAMP
)

-- VEHICLES (Veículos)
vehicles (
  id UUID PK,
  plate VARCHAR(10) UNIQUE NOT NULL,      -- ABC-1234 ou ABC1D23
  renavam VARCHAR(11),
  chassis VARCHAR(17),
  brand VARCHAR(50) NOT NULL,
  model VARCHAR(50) NOT NULL,
  year INTEGER NOT NULL,
  color VARCHAR(30),
  fuel_type ENUM('DIESEL','GASOLINE','ETHANOL','FLEX') NOT NULL,
  tank_capacity DECIMAL(5,2) NOT NULL,    -- Litros
  current_odometer INTEGER NOT NULL DEFAULT 0,
  expected_km_per_liter DECIMAL(4,2),     -- Para validação
  department_id UUID FK,
  status ENUM('AVAILABLE','IN_USE','MAINTENANCE','INACTIVE') DEFAULT 'AVAILABLE',
  qr_code_hash VARCHAR(64) UNIQUE NOT NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- DRIVERS (Motoristas)
drivers (
  id UUID PK,
  cpf VARCHAR(11) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  registration_number VARCHAR(20),         -- Matrícula
  cnh_number VARCHAR(11) NOT NULL,
  cnh_category VARCHAR(5) NOT NULL,        -- A, B, C, D, E, AB...
  cnh_expiry_date DATE NOT NULL,
  department_id UUID FK,
  phone VARCHAR(20),
  email VARCHAR(100),
  password_hash VARCHAR(255) NOT NULL,
  score DECIMAL(3,2) DEFAULT 5.00,         -- 0.00 a 5.00
  status ENUM('ACTIVE','INACTIVE','SUSPENDED') DEFAULT 'ACTIVE',
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- TRIPS (Viagens)
trips (
  id UUID PK,
  vehicle_id UUID FK NOT NULL,
  driver_id UUID FK NOT NULL,
  destination TEXT NOT NULL,
  estimated_distance_km DECIMAL(8,2),
  actual_distance_km DECIMAL(8,2),
  estimated_duration_min INTEGER,
  actual_duration_min INTEGER,
  start_odometer INTEGER NOT NULL,
  end_odometer INTEGER,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  start_lat DECIMAL(10,8),
  start_lng DECIMAL(11,8),
  end_lat DECIMAL(10,8),
  end_lng DECIMAL(11,8),
  status ENUM('IN_PROGRESS','COMPLETED','CANCELLED') DEFAULT 'IN_PROGRESS',
  has_anomaly BOOLEAN DEFAULT FALSE,
  anomaly_reason TEXT,
  created_at TIMESTAMP
)

-- REFUELINGS (Abastecimentos)
refuelings (
  id UUID PK,
  vehicle_id UUID FK NOT NULL,
  driver_id UUID FK NOT NULL,
  trip_id UUID FK,                         -- NULL se fora de viagem
  liters DECIMAL(6,2) NOT NULL,
  total_cost DECIMAL(10,2) NOT NULL,
  price_per_liter DECIMAL(5,3),            -- Calculado
  odometer INTEGER NOT NULL,
  fuel_type VARCHAR(20) NOT NULL,
  supplier_name VARCHAR(100),
  photo_dashboard_url TEXT NOT NULL,
  photo_receipt_url TEXT NOT NULL,
  lat DECIMAL(10,8),
  lng DECIMAL(11,8),
  km_per_liter DECIMAL(5,2),               -- Calculado
  has_anomaly BOOLEAN DEFAULT FALSE,
  anomaly_type ENUM('ODOMETER_REGRESSION','EXCESSIVE_CONSUMPTION','CAPACITY_EXCEEDED','LOCATION_MISMATCH'),
  validated_at TIMESTAMP,
  validated_by UUID FK,
  created_at TIMESTAMP
)

-- MAINTENANCES (Manutenções)
maintenances (
  id UUID PK,
  vehicle_id UUID FK NOT NULL,
  requested_by UUID FK,                    -- Driver
  type ENUM('PREVENTIVE','CORRECTIVE','EMERGENCY') NOT NULL,
  category ENUM('MECHANICAL','ELECTRICAL','TIRES','BODY') NOT NULL,
  description TEXT NOT NULL,
  urgency INTEGER CHECK(1-5) DEFAULT 3,
  status ENUM('PENDING','APPROVED','REJECTED','IN_PROGRESS','AWAITING_PARTS','COMPLETED') DEFAULT 'PENDING',
  estimated_cost DECIMAL(10,2),
  actual_cost DECIMAL(10,2),
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  service_provider VARCHAR(100),
  notes TEXT,
  photos JSON,                             -- Array de URLs
  approved_by UUID FK,
  approved_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- CHECKLISTS
checklists (
  id UUID PK,
  vehicle_id UUID FK NOT NULL,
  driver_id UUID FK NOT NULL,
  trip_id UUID FK,
  type ENUM('PRE_TRIP','POST_TRIP') NOT NULL,
  has_issues BOOLEAN DEFAULT FALSE,
  blocked_trip BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP NOT NULL,
  items JSON NOT NULL,                     -- Array de {item, status, notes, photo}
  created_at TIMESTAMP
)

-- USERS (Usuários do Painel)
users (
  id UUID PK,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  role ENUM('ADMIN','MANAGER','VIEWER') NOT NULL,
  department_id UUID FK,
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- POSITION_LOGS (Rastreamento GPS)
position_logs (
  id BIGSERIAL PK,
  trip_id UUID FK NOT NULL,
  vehicle_id UUID FK NOT NULL,
  lat DECIMAL(10,8) NOT NULL,
  lng DECIMAL(11,8) NOT NULL,
  speed_kmh DECIMAL(5,2),
  heading DECIMAL(5,2),
  accuracy_meters DECIMAL(6,2),
  recorded_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP
)

-- TRIP_STOPS (Paradas durante viagem)
trip_stops (
  id UUID PK,
  trip_id UUID FK NOT NULL,
  type ENUM('MEAL','LOADING','EMERGENCY','PERSONAL') NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  lat DECIMAL(10,8),
  lng DECIMAL(11,8),
  notes TEXT,
  created_at TIMESTAMP
)
```

### Índices Importantes

```sql
CREATE INDEX idx_vehicles_department ON vehicles(department_id);
CREATE INDEX idx_vehicles_status ON vehicles(status);
CREATE INDEX idx_drivers_department ON drivers(department_id);
CREATE INDEX idx_drivers_cpf ON drivers(cpf);
CREATE INDEX idx_trips_vehicle ON trips(vehicle_id);
CREATE INDEX idx_trips_driver ON trips(driver_id);
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_dates ON trips(start_time, end_time);
CREATE INDEX idx_refuelings_vehicle ON refuelings(vehicle_id);
CREATE INDEX idx_refuelings_anomaly ON refuelings(has_anomaly);
CREATE INDEX idx_maintenances_vehicle ON maintenances(vehicle_id);
CREATE INDEX idx_maintenances_status ON maintenances(status);
CREATE INDEX idx_position_logs_trip ON position_logs(trip_id, recorded_at);
```

---

## 🔌 API ENDPOINTS

### Autenticação

```
POST   /api/auth/login              # Login usuário painel
POST   /api/auth/driver/login       # Login motorista
POST   /api/auth/refresh            # Renovar token
POST   /api/auth/logout             # Invalidar sessão
```

### Veículos

```
GET    /api/vehicles                # Listar (paginado, filtros)
GET    /api/vehicles/:id            # Detalhes
POST   /api/vehicles                # Criar
PUT    /api/vehicles/:id            # Atualizar
DELETE /api/vehicles/:id            # Soft delete
POST   /api/vehicles/scan           # Buscar por QR Code hash
GET    /api/vehicles/:id/history    # Histórico completo
GET    /api/vehicles/:id/stats      # Estatísticas
```

### Motoristas

```
GET    /api/drivers                 # Listar
GET    /api/drivers/:id             # Detalhes
POST   /api/drivers                 # Criar
PUT    /api/drivers/:id             # Atualizar
DELETE /api/drivers/:id             # Soft delete
GET    /api/drivers/:id/trips       # Viagens do motorista
GET    /api/drivers/:id/stats       # Estatísticas
GET    /api/drivers/expiring-cnh    # CNHs vencendo
```

### Viagens

```
GET    /api/trips                   # Listar
GET    /api/trips/:id               # Detalhes
POST   /api/trips/start             # Iniciar viagem
PUT    /api/trips/:id/stop          # Registrar parada
PUT    /api/trips/:id/resume        # Retomar viagem
PUT    /api/trips/:id/finish        # Finalizar viagem
GET    /api/trips/:id/route         # Rota percorrida (GPS points)
GET    /api/trips/active            # Viagens em andamento
```

### Abastecimentos

```
GET    /api/refuelings              # Listar
GET    /api/refuelings/:id          # Detalhes
POST   /api/refuelings              # Registrar
PUT    /api/refuelings/:id/validate # Validar (gestor)
PUT    /api/refuelings/:id/reject   # Rejeitar (gestor)
GET    /api/refuelings/anomalies    # Listar anomalias
GET    /api/refuelings/pending      # Pendentes validação
```

### Manutenções

```
GET    /api/maintenances            # Listar
GET    /api/maintenances/:id        # Detalhes
POST   /api/maintenances            # Solicitar
PUT    /api/maintenances/:id        # Atualizar
PUT    /api/maintenances/:id/approve    # Aprovar
PUT    /api/maintenances/:id/reject     # Rejeitar
PUT    /api/maintenances/:id/start      # Iniciar serviço
PUT    /api/maintenances/:id/complete   # Concluir
GET    /api/maintenances/pending    # Pendentes
```

### Checklists

```
GET    /api/checklists/templates    # Templates por tipo de veículo
POST   /api/checklists              # Submeter checklist
GET    /api/checklists/:id          # Detalhes
GET    /api/checklists/vehicle/:id  # Por veículo
```

### Dashboard

```
GET    /api/dashboard/kpis          # KPIs principais
GET    /api/dashboard/map-data      # Dados do mapa (posições)
GET    /api/dashboard/alerts        # Alertas ativos
GET    /api/dashboard/recent-activity   # Atividade recente
GET    /api/dashboard/charts/fuel   # Dados gráfico combustível
GET    /api/dashboard/charts/departments  # Dados por secretaria
```

### Relatórios

```
GET    /api/reports/fuel            # Relatório combustível
GET    /api/reports/trips           # Relatório viagens
GET    /api/reports/maintenances    # Relatório manutenções
GET    /api/reports/anomalies       # Relatório anomalias
POST   /api/reports/export          # Exportar (PDF/Excel)
```

### Upload

```
POST   /api/upload/image            # Upload de imagem
DELETE /api/upload/:filename        # Remover arquivo
```

---

## 📱 TELAS DO APP MOBILE

### Navegação Principal

```
BottomNavigationBar (4 tabs):
├── 🏠 Home (index 0)
├── 🚗 Viagens (index 1)
├── ⛽ Serviços (index 2)
└── 👤 Perfil (index 3)
```

### Árvore de Telas

```
App
├── SplashScreen
├── LoginScreen
│
├── MainShell (com BottomNav)
│   │
│   ├── HomeTab
│   │   ├── HomeScreen
│   │   │   ├── → ScanQRScreen
│   │   │   │   └── → ManualSearchScreen (fallback)
│   │   │   ├── → ChecklistScreen
│   │   │   │   └── → ChecklistItemDetail (se problema)
│   │   │   ├── → DestinationScreen
│   │   │   └── → TripInProgressScreen
│   │   │       ├── → StopModal
│   │   │       └── → TripSummaryScreen
│   │   │
│   │   └── Atalhos para:
│   │       ├── → RefuelingScreen
│   │       ├── → MaintenanceRequestScreen
│   │       └── → TripHistoryScreen
│   │
│   ├── TripsTab
│   │   ├── TripListScreen
│   │   └── → TripDetailScreen
│   │
│   ├── ServicesTab
│   │   ├── ServicesMenuScreen
│   │   ├── → RefuelingScreen (3 steps)
│   │   │   ├── Step1: RefuelingDataScreen
│   │   │   ├── Step2: DashboardPhotoScreen
│   │   │   ├── Step3: ReceiptPhotoScreen
│   │   │   └── Step4: RefuelingConfirmScreen
│   │   ├── → MaintenanceRequestScreen
│   │   └── → ServiceHistoryScreen
│   │
│   └── ProfileTab
│       ├── ProfileScreen
│       ├── → EditProfileScreen
│       ├── → CNHDetailScreen
│       └── → SettingsScreen
│
└── Modals/Dialogs
    ├── ConfirmationDialog
    ├── ErrorDialog
    ├── SuccessDialog
    └── LoadingOverlay
```

### Estados das Telas

```dart
// HomeScreen estados
enum HomeState {
  noVehicle,      // Mostrar botão "Vincular Veículo"
  vehicleLinked,  // Mostrar info do veículo + "Iniciar Viagem"
  tripInProgress, // Mostrar "Ver Viagem Atual"
}

// TripInProgressScreen estados
enum TripState {
  moving,         // Em movimento
  stopped,        // Parada registrada
}
```

---

## 🖥️ TELAS DO PAINEL WEB

### Menu da Sidebar

```
📊 Dashboard        /dashboard
🗺️ Mapa            /map
─────────────────
🚗 Veículos        /vehicles
👤 Motoristas      /drivers
─────────────────
🛣️ Viagens         /trips
⛽ Abastecimentos  /refuelings
🔧 Manutenções     /maintenances
─────────────────
📈 Relatórios      /reports
⚙️ Configurações   /settings
```

### Árvore de Rotas

```
/
├── /login
│
├── /dashboard
│
├── /map
│
├── /vehicles
│   ├── /vehicles (lista)
│   ├── /vehicles/new (modal ou página)
│   ├── /vehicles/:id (detalhes)
│   └── /vehicles/:id/edit (modal)
│
├── /drivers
│   ├── /drivers (lista)
│   ├── /drivers/new
│   ├── /drivers/:id (detalhes)
│   └── /drivers/:id/edit
│
├── /trips
│   ├── /trips (lista)
│   └── /trips/:id (detalhes com mapa)
│
├── /refuelings
│   ├── /refuelings (lista)
│   └── /refuelings/:id (detalhes + validação)
│
├── /maintenances
│   ├── /maintenances (kanban ou lista)
│   └── /maintenances/:id (detalhes + ações)
│
├── /reports
│   └── /reports (grid de tipos)
│
└── /settings
    ├── /settings/general
    ├── /settings/maintenance
    ├── /settings/alerts
    ├── /settings/checklists
    └── /settings/users
```

### Componentes Compartilhados

```
components/
├── ui/
│   ├── Button.tsx          # Variantes: primary, secondary, danger, ghost
│   ├── Input.tsx           # Com label, error, helper text
│   ├── Select.tsx
│   ├── Checkbox.tsx
│   ├── Card.tsx
│   ├── Modal.tsx
│   ├── Table.tsx           # Com sorting, pagination
│   ├── Badge.tsx           # Status badges
│   ├── Avatar.tsx
│   ├── Tooltip.tsx
│   ├── Toast.tsx
│   ├── Spinner.tsx
│   ├── EmptyState.tsx
│   └── Skeleton.tsx
│
├── layout/
│   ├── Sidebar.tsx
│   ├── Header.tsx
│   ├── PageContainer.tsx
│   └── Breadcrumb.tsx
│
└── features/
    ├── KPICard.tsx
    ├── DataTable.tsx       # Tabela genérica com filtros
    ├── VehicleMarker.tsx
    ├── StatusBadge.tsx
    └── PhotoViewer.tsx
```

---

## ✅ REGRAS DE NEGÓCIO

### Vinculação de Veículo

```
1. Motorista escaneia QR Code
2. Sistema verifica se veículo está AVAILABLE
3. Se sim: vincula e muda status para IN_USE
4. Se não: mostra erro com motivo
5. Apenas 1 motorista pode estar vinculado por vez
6. Gestor pode forçar desvinculação (emergência)
```

### Checklist

```
ITENS CRÍTICOS (bloqueiam viagem):
- Freios
- Pneus
- Direção
- Luzes obrigatórias

SE item crítico = PROBLEMA:
  → Bloquear início de viagem
  → Gerar O.S. automática
  → Notificar gestor
```

### Abastecimento — Validações

```python
# Regra 1: Odômetro não pode regredir
if novo_odometro < ultimo_odometro:
    anomaly = "ODOMETER_REGRESSION"

# Regra 2: Litros não podem exceder tanque
if litros > veiculo.tank_capacity * 1.1:  # 10% tolerância
    anomaly = "CAPACITY_EXCEEDED"

# Regra 3: Consumo dentro da faixa
km_desde_ultimo = novo_odometro - ultimo_odometro_abastecimento
km_por_litro = km_desde_ultimo / litros
esperado = veiculo.expected_km_per_liter

if km_por_litro < esperado * 0.7 or km_por_litro > esperado * 1.3:
    anomaly = "EXCESSIVE_CONSUMPTION"

# Regra 4: Localização compatível (se em viagem)
if em_viagem and distancia_da_rota > 5km:
    anomaly = "LOCATION_MISMATCH"
```

### Viagem — Anomalias

```python
# Desvio de distância
desvio = abs(distancia_real - distancia_estimada) / distancia_estimada
if desvio > 0.20:  # 20%
    flag_anomaly = True
    reason = f"Desvio de {desvio*100:.0f}% da rota estimada"
```

### Alertas Automáticos

```
| Tipo                    | Condição                  | Ação                    |
|-------------------------|---------------------------|-------------------------|
| CNH_EXPIRING            | 30 dias antes             | Notificar motorista     |
| CNH_EXPIRED             | Data passou               | Bloquear motorista      |
| MAINTENANCE_DUE         | Km ou tempo atingido      | Gerar O.S. preventiva   |
| VEHICLE_IDLE            | Parado > 30min ligado     | Notificar gestor        |
| ANOMALY_DETECTED        | Qualquer anomalia         | Flag + notificar gestor |
| TRIP_DEVIATION          | Fora da rota > 5km        | Notificar gestor        |
```

---

## 🧪 DADOS DE TESTE

### Seeds Padrão

```
DEPARTMENTS:
- Secretaria de Obras
- Secretaria de Saúde
- Secretaria de Educação
- Gabinete do Prefeito

VEHICLES (10):
- ABC-1234, Fiat Strada, 2022, Diesel, Obras
- DEF-5678, VW Saveiro, 2021, Flex, Obras
- GHI-9012, Ford Ranger, 2023, Diesel, Obras
- ... (mais 7)

DRIVERS (5):
- João Silva, CPF 12345678901, CNH C
- Maria Santos, CPF 23456789012, CNH B
- Pedro Lima, CPF 34567890123, CNH D
- ... (mais 2)

USERS (3):
- admin@prefeitura.gov.br, ADMIN
- gestor@obras.gov.br, MANAGER
- viewer@obras.gov.br, VIEWER
```

---

## 🚨 CUIDADOS E ARMADILHAS

### NÃO FAÇA

```
❌ Mudar as cores SEMÂNTICAS (sucesso/erro/aviso/status) ou os valores padrão do design system — as 3 cores de marca são sobrescritas por prefeitura de propósito, ver "Cores"
❌ Usar bibliotecas de UI prontas (Material UI, Chakra) — use Tailwind puro
❌ Criar rotas fora do padrão estabelecido
❌ Ignorar validações de negócio
❌ Salvar senhas sem hash
❌ Expor dados sensíveis na API
❌ Fazer upload sem validar tipo de arquivo
❌ Permitir SQL injection (use sempre ORM)
❌ Esquecer paginação em listagens
❌ Deixar console.log em produção
```

### SEMPRE FAÇA

```
✅ Validar entrada em TODOS os endpoints
✅ Retornar erros padronizados (código, mensagem)
✅ Usar transações para operações múltiplas
✅ Logar ações importantes (audit)
✅ Tratar loading e error states no frontend
✅ Testar fluxos críticos manualmente
✅ Manter consistência de nomenclatura
✅ Documentar decisões não óbvias
✅ Usar tipos TypeScript (nunca `any`)
✅ Fazer commit após cada feature funcional
```

---

## 📝 PADRÕES DE CÓDIGO

### Backend (NestJS)

```typescript
// Controllers: sempre validar DTO
@Post()
async create(@Body() dto: CreateVehicleDto) {
  return this.vehiclesService.create(dto);
}

// Services: lógica de negócio aqui
async create(dto: CreateVehicleDto): Promise<Vehicle> {
  // Validações de negócio
  // Operações de banco
  // Retorno tipado
}

// DTOs: sempre com class-validator
export class CreateVehicleDto {
  @IsString()
  @Length(7, 8)
  plate: string;

  @IsEnum(FuelType)
  fuelType: FuelType;
}

// Responses padronizadas
{
  success: true,
  data: { ... },
  meta: { total, page, limit }
}

// Errors padronizados
{
  success: false,
  error: {
    code: "VEHICLE_NOT_FOUND",
    message: "Veículo não encontrado"
  }
}
```

### Frontend (React)

```typescript
// Componentes: sempre tipados
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export function Button({ variant = 'primary', ...props }: ButtonProps) {
  // ...
}

// Hooks customizados para lógica
function useVehicles(filters: VehicleFilters) {
  return useQuery({
    queryKey: ['vehicles', filters],
    queryFn: () => api.vehicles.list(filters),
  });
}

// Stores com Zustand
interface AuthStore {
  user: User | null;
  token: string | null;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => void;
}
```

### Mobile (Flutter)

```dart
// Widgets: sempre const quando possível
class VehicleCard extends StatelessWidget {
  const VehicleCard({
    super.key,
    required this.vehicle,
    this.onTap,
  });

  final Vehicle vehicle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    // ...
  }
}

// Models: com fromJson/toJson
class Vehicle {
  final String id;
  final String plate;
  // ...

  factory Vehicle.fromJson(Map<String, dynamic> json) {
    return Vehicle(
      id: json['id'],
      plate: json['plate'],
    );
  }
}

// Providers: separar estado da UI
class TripProvider extends ChangeNotifier {
  Trip? _currentTrip;
  bool _isLoading = false;

  Trip? get currentTrip => _currentTrip;
  bool get isLoading => _isLoading;

  Future<void> startTrip(StartTripDto dto) async {
    _isLoading = true;
    notifyListeners();
    // ...
  }
}
```

---

## 🔄 FLUXO DE DESENVOLVIMENTO

```
1. Ler este AGENTS.md completamente
2. Verificar o que já foi implementado
3. Implementar uma feature por vez
4. Testar manualmente
5. Commitar com mensagem descritiva
6. Passar para próxima feature

ORDEM SUGERIDA:
Backend  → Auth → Vehicles → Drivers → Trips → Refuelings → Maintenances → Dashboard
Web      → Layout → Auth → Dashboard → Vehicles → Drivers → (resto)
Mobile   → Auth → Home → QR/Checklist → Trip → Refueling → (resto)
```

---

## 📞 COMANDOS ÚTEIS

```bash
# Backend
cd backend
npm run start:dev          # Rodar em dev
npm run migration:generate # Gerar migration
npm run migration:run      # Rodar migrations
npm run seed               # Popular banco

# Web
cd web
npm run dev                # Rodar em dev
npm run build              # Build produção

# Mobile
cd mobile
flutter run                # Rodar em device/emulador
flutter build apk          # Build Android

# Docker
docker-compose up -d       # Subir tudo
docker-compose logs -f     # Ver logs
docker-compose down        # Parar tudo
```

---

**Última atualização:** Janeiro 2026
**Mantenedor:** Equipe SGF
