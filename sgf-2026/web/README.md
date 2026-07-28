# Exattus Rotta — Painel Web

Sistema de Gestão de Frotas Municipal - Painel de Gestão Web

## 🚀 Tecnologias

- **React 18** - Framework UI
- **TypeScript** - Tipagem estática
- **Vite** - Build tool e dev server
- **TailwindCSS** - Estilização
- **React Router v6** - Roteamento
- **React Query** - Gerenciamento de estado e cache
- **Axios** - Cliente HTTP
- **Recharts** - Gráficos
- **React Leaflet** - Mapas
- **Lucide React** - Ícones
- **date-fns** - Manipulação de datas
- **Zod** - Validação de schemas

## 📁 Estrutura do Projeto

```
src/
├── components/
│   ├── ui/              # Componentes reutilizáveis (Button, Input, Card, etc.)
│   ├── layout/          # Layout components (Sidebar, Header, MainLayout)
│   └── auth/            # Componentes de autenticação
├── pages/               # Páginas da aplicação
├── contexts/            # React contexts (AuthContext)
├── lib/                 # Utilitários e configurações
│   ├── api.ts          # Cliente HTTP e endpoints
│   └── utils.ts        # Funções utilitárias
├── types/              # TypeScript types
├── App.tsx             # Componente principal
└── main.tsx            # Entry point
```

## 🎨 Paleta de Cores

- **Primária Escura**: `#0F2B2F` (HSL 188°, 49%, 12%)
- **Primária Verde**: `#00A86B` (HSL 160°, 100%, 33%)
- **Secundária Menta**: `#70C4A8` (HSL 161°, 33%, 60%)

## 🛠️ Desenvolvimento

### Pré-requisitos

- Node.js 18+
- npm ou yarn

### Instalação

```bash
# Instalar dependências
npm install

# Copiar arquivo de variáveis de ambiente
cp .env.example .env
```

### Executar

```bash
# Modo desenvolvimento
npm run dev

# Build para produção
npm run build

# Preview do build
npm run preview
```

## 🔌 Configuração da API

Configure a URL do backend no arquivo `.env`:

```env
VITE_API_URL=http://localhost:3000
```

## 📋 Funcionalidades Implementadas

### ✅ Setup e Configuração
- Projeto Vite + React + TypeScript
- TailwindCSS com paleta customizada
- Sistema de rotas com React Router
- Autenticação com Context API
- Cliente HTTP com interceptors

### ✅ Design System
- Button (variants, sizes, loading state)
- Input (label, error, icons)
- Card (Header, Title, Content, Footer)
- Badge (status indicators)
- Modal (backdrop, sizes)
- StatsCard (KPIs com trends)

### ✅ Layout
- Sidebar responsiva com menu
- Header com notificações e perfil
- MainLayout combinando componentes

### ✅ Autenticação
- Login page
- PrivateRoute para rotas protegidas
- AuthContext para gerenciamento de sessão

### ✅ Dashboard
- 4 KPI cards principais
- Gráfico de evolução de gastos
- Gráfico de distribuição por secretaria
- Lista de alertas ativos
- Atividade recente

### 🚧 Em Desenvolvimento
- Mapa de rastreamento em tempo real
- CRUD de Veículos
- CRUD de Motoristas
- Visualização de Viagens
- Visualização de Abastecimentos
- Gestão de Manutenções
- Sistema de Relatórios

## 📱 Responsividade

O painel é totalmente responsivo e funciona em:
- Desktop (1920x1080+)
- Laptop (1366x768+)
- Tablet (768x1024+)

## 🔐 Autenticação

O sistema utiliza JWT (JSON Web Tokens) para autenticação. O token é armazenado no localStorage e automaticamente incluído em todas as requisições através de interceptors do Axios.

## 📄 Licença

© 2026 Prefeitura Municipal - Setor de Obras e Garagem
