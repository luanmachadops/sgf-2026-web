# SGF 2026 - Design System

## 📐 Visão Geral

O Design System do SGF 2026 foi desenvolvido para criar interfaces consistentes, acessíveis e profissionais para o Sistema de Gestão de Frotas Municipal.

---

## 🎨 Fundamentos de Design

### Paleta de Cores

#### Cores Primárias

```css
--sgf-dark: hsl(188, 49%, 12%)     /* #0F2B2F - Deep Ocean (Backgrounds, Headers) */
--sgf-primary: hsl(160, 100%, 33%) /* #00A86B - Emerald Green (CTAs, Success) */
--sgf-light: hsl(161, 33%, 60%)    /* #70C4A8 - Mint Accent (Highlights, Hover) */
```

#### Cores de Superfície

```css
--sgf-surface: #F8FAFC            /* Light gray background */
--sgf-surface-elevated: #FFFFFF   /* White cards and panels */
```

#### Cores de Texto

```css
--sgf-text-primary: #1F2937       /* Dark gray - Primary text */
--sgf-text-secondary: #6B7280     /* Medium gray - Secondary text */
--sgf-text-tertiary: #9CA3AF      /* Light gray - Tertiary text */
```

#### Cores de Status (Veículos)

```css
--sgf-status-moving: #22C55E      /* Green - Vehicle in movement */
--sgf-status-idle: #3B82F6        /* Blue - Vehicle idle/engine on */
--sgf-status-stopped: #9CA3AF     /* Gray - Vehicle stopped */
--sgf-status-alert: #EF4444       /* Red - Alert/Emergency */
--sgf-status-warning: #F59E0B     /* Amber - Warning */
```

#### Cores Semânticas

```css
--sgf-success: #22C55E
--sgf-error: #DC2626
--sgf-warning: #F59E0B
--sgf-info: #3B82F6
```

---

### Tipografia

**Fonte:** Inter (Google Fonts)
**Pesos:** 400 (Regular), 500 (Medium), 600 (Semibold), 700 (Bold), 800 (Extrabold), 900 (Black)

#### Hierarquia de Texto

- **H1**: 32px, Semibold
- **H2**: 24px, Semibold
- **H3**: 20px, Semibold
- **H4**: 16px, Semibold
- **Body**: 14-16px, Regular
- **Caption**: 12px, Medium
- **Label**: 10px, Bold, Uppercase, Letter-spacing: 0.15em

---

### Border Radius (Arredondamento)

```css
--radius-sm: 0.75rem   /* 12px - Small elements */
--radius-md: 1rem      /* 16px - Medium elements */
--radius-lg: 1.25rem   /* 20px - Large elements */
--radius-xl: 1.5rem    /* 24px - XL elements */
--radius-2xl: 2rem     /* 32px - Cards */
--radius-3xl: 2.5rem   /* 40px - Large cards */
--radius-full: 9999px  /* Pills, badges */
```

---

### Sombras

```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05)
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1)
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1)
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1)
--shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25)
```

---

### Espaçamento

Escala baseada em 4px:

```css
--space-1: 0.25rem   /* 4px */
--space-2: 0.5rem    /* 8px */
--space-3: 0.75rem   /* 12px */
--space-4: 1rem      /* 16px */
--space-5: 1.25rem   /* 20px */
--space-6: 1.5rem    /* 24px */
--space-8: 2rem      /* 32px */
--space-10: 2.5rem   /* 40px */
--space-12: 3rem     /* 48px */
--space-16: 4rem     /* 64px */
--space-20: 5rem     /* 80px */
```

---

## 🧩 Componentes

### SGFButton

Botão principal do sistema com variantes e tamanhos.

**Uso:**
```tsx
import { SGFButton } from '@/app/components/sgf';
import { Save } from 'lucide-react';

<SGFButton variant="primary" size="md" icon={Save}>
  Salvar Dados
</SGFButton>
```

**Variantes:**
- `primary` - Ação principal (verde emerald)
- `secondary` - Ação secundária (azul escuro)
- `outline` - Botão com borda
- `ghost` - Botão transparente
- `danger` - Ações destrutivas (vermelho)

**Tamanhos:**
- `sm` - Pequeno (12px padding)
- `md` - Médio (16px padding)
- `lg` - Grande (20px padding)
- `xl` - Extra grande (24px padding)

**Props:**
```typescript
interface SGFButtonProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  loading?: boolean;
}
```

---

### SGFCard

Container para agrupar conteúdo relacionado.

**Uso:**
```tsx
import { SGFCard } from '@/app/components/sgf';

<SGFCard variant="elevated" padding="lg" hover>
  <h3>Conteúdo do Card</h3>
  <p>Informações importantes...</p>
</SGFCard>
```

**Variantes:**
- `default` - Card padrão com borda
- `elevated` - Card com sombra elevada
- `bordered` - Card com borda colorida
- `glass` - Card com efeito glassmorphism

**Padding:**
- `none`, `sm`, `md`, `lg`, `xl`

**Props:**
```typescript
interface SGFCardProps {
  variant?: 'default' | 'elevated' | 'bordered' | 'glass';
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  hover?: boolean; // Efeito hover com elevação
}
```

---

### SGFInput

Campo de entrada de texto com label e validação.

**Uso:**
```tsx
import { SGFInput } from '@/app/components/sgf';
import { Search } from 'lucide-react';

<SGFInput
  label="Pesquisar Veículo"
  placeholder="Digite a placa..."
  icon={Search}
  error={errors.plate}
  hint="Formato: ABC-1234"
/>
```

**Props:**
```typescript
interface SGFInputProps {
  label?: string;
  error?: string;
  hint?: string;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}
```

---

### SGFBadge

Badge para status e categorias.

**Uso:**
```tsx
import { SGFBadge } from '@/app/components/sgf';

<SGFBadge variant="moving" dot>Em Movimento</SGFBadge>
<SGFBadge variant="alert" size="sm">3</SGFBadge>
```

**Variantes:**
- `default`, `success`, `warning`, `error`, `info`
- `moving`, `idle`, `stopped`, `alert` (específicos para veículos)

**Tamanhos:**
- `sm`, `md`, `lg`

---

### SGFKPICard

Card especializado para exibir KPIs (Key Performance Indicators).

**Uso:**
```tsx
import { SGFKPICard } from '@/app/components/sgf';
import { Truck } from 'lucide-react';

<SGFKPICard
  title="Veículos Ativos"
  value="128"
  percentage={8.2}
  trend="up"
  icon={Truck}
  iconColor="text-emerald-600"
/>
```

**Props:**
```typescript
interface SGFKPICardProps {
  title: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  percentage?: number;
  icon: LucideIcon;
  iconColor?: string;
  loading?: boolean;
  onClick?: () => void;
}
```

---

### SGFTable

Tabela responsiva com tipagem genérica.

**Uso:**
```tsx
import { SGFTable } from '@/app/components/sgf';

interface Vehicle {
  id: string;
  plate: string;
  model: string;
  status: string;
}

const columns = [
  { header: 'Placa', accessor: 'plate' },
  { header: 'Modelo', accessor: 'model' },
  { 
    header: 'Status', 
    accessor: (row) => <SGFBadge variant={row.status}>{row.status}</SGFBadge>
  },
];

<SGFTable
  columns={columns}
  data={vehicles}
  keyExtractor={(row) => row.id}
  onRowClick={(row) => navigate(`/vehicle/${row.id}`)}
/>
```

---

### SGFAlert

Mensagens de feedback para o usuário.

**Uso:**
```tsx
import { SGFAlert } from '@/app/components/sgf';

<SGFAlert
  variant="warning"
  title="Atenção"
  message="Veículo com manutenção pendente"
  dismissible
  onDismiss={() => setShowAlert(false)}
/>
```

**Variantes:**
- `info`, `success`, `warning`, `error`

---

### SGFProgressBar

Barra de progresso com variantes.

**Uso:**
```tsx
import { SGFProgressBar } from '@/app/components/sgf';

<SGFProgressBar
  value={75}
  max={100}
  label="Combustível"
  showPercentage
  variant={fuel < 20 ? 'error' : 'success'}
/>
```

---

### SGFSelect

Dropdown select customizado.

**Uso:**
```tsx
import { SGFSelect } from '@/app/components/sgf';

const departments = [
  { value: 'obras', label: 'Obras' },
  { value: 'saude', label: 'Saúde' },
  { value: 'educacao', label: 'Educação' },
];

<SGFSelect
  label="Secretaria"
  options={departments}
  onChange={(value) => setDepartment(value)}
  error={errors.department}
/>
```

---

### SGFTextarea

Campo de texto multilinha.

**Uso:**
```tsx
import { SGFTextarea } from '@/app/components/sgf';

<SGFTextarea
  label="Descrição do Problema"
  placeholder="Descreva o problema encontrado..."
  maxLength={500}
  showCount
  rows={4}
/>
```

---

## 🎯 Princípios de Design

### 1. Clareza
- Informações críticas devem estar sempre visíveis
- Hierarquia visual clara usando tamanho, peso e cor
- Textos concisos e diretos

### 2. Consistência
- Usar sempre os componentes do design system
- Manter padrões de espaçamento e alinhamento
- Seguir convenções de cores (verde = sucesso, vermelho = erro, etc.)

### 3. Acessibilidade
- Contraste mínimo de 4.5:1 para textos
- Tamanhos de fonte nunca menores que 12px
- Estados de foco visíveis em todos os elementos interativos
- Suporte a navegação por teclado

### 4. Performance
- Animações suaves (200-300ms)
- Transições significativas, não decorativas
- Feedback imediato para ações do usuário

### 5. Responsividade
- Mobile-first quando apropriado
- Breakpoints: 640px (sm), 768px (md), 1024px (lg), 1280px (xl)
- Layouts fluidos com grid e flexbox

---

## 📱 Aplicação Mobile vs Desktop

### Mobile (Motoristas)
- Botões grandes (min 44x44px para toque)
- Texto mínimo de 16px
- Espaçamento generoso entre elementos
- Navegação simplificada
- Ações críticas sempre acessíveis

### Desktop (Gestores)
- Densidade de informação maior
- Dashboards com múltiplas colunas
- Atalhos de teclado
- Tabelas expansivas com filtros
- Múltiplas janelas/painéis

---

## 🔧 Uso do Design System

### Instalação

Os componentes SGF já estão disponíveis no projeto. Para usar:

```tsx
// Importação individual
import { SGFButton, SGFCard, SGFInput } from '@/app/components/sgf';

// Ou importar tudo
import * as SGF from '@/app/components/sgf';
```

### Customização de Cores

As cores do sistema podem ser sobrescritas no `theme.css`:

```css
:root {
  --sgf-primary: hsl(160, 100%, 33%);
  /* Altere para sua cor personalizada */
}
```

### Tailwind Classes Úteis

Use as classes Tailwind em conjunto com os componentes:

```tsx
<SGFButton className="mt-4 shadow-lg">
  Meu Botão
</SGFButton>
```

---

## 📚 Recursos Adicionais

- **Ícones**: [Lucide React](https://lucide.dev)
- **Fonte**: [Inter - Google Fonts](https://fonts.google.com/specimen/Inter)
- **Framework CSS**: Tailwind CSS v4

---

## ✅ Checklist de Implementação

Ao criar uma nova tela/feature:

- [ ] Usar componentes SGF ao invés de HTML puro
- [ ] Seguir paleta de cores do sistema
- [ ] Manter consistência de espaçamento (múltiplos de 4px)
- [ ] Testar estados de loading, erro e vazio
- [ ] Validar acessibilidade (contraste, foco)
- [ ] Testar responsividade em diferentes tamanhos
- [ ] Adicionar feedback visual para ações do usuário
- [ ] Documentar novos componentes criados

---

**Versão:** 1.0  
**Última Atualização:** Janeiro 2026  
**Mantido por:** Equipe SGF 2026
