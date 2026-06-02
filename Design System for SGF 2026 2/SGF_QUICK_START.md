# 🚀 SGF 2026 - Quick Start Guide

Guia rápido para começar a desenvolver com o Design System SGF 2026.

---

## 📦 Componentes Disponíveis

### Importação

```tsx
import {
  SGFButton,
  SGFCard,
  SGFInput,
  SGFSelect,
  SGFTextarea,
  SGFBadge,
  SGFKPICard,
  SGFTable,
  SGFAlert,
  SGFProgressBar,
} from '@/app/components/sgf';
```

---

## 🎨 Exemplos Rápidos

### 1. Criar um Formulário Simples

```tsx
import { SGFCard, SGFInput, SGFSelect, SGFButton } from '@/app/components/sgf';
import { Save } from 'lucide-react';

export function VehicleForm() {
  return (
    <SGFCard padding="lg">
      <h2 className="text-2xl font-bold mb-6">Cadastrar Veículo</h2>
      
      <div className="space-y-4">
        <SGFInput
          label="Placa"
          placeholder="ABC-1234"
          fullWidth
        />
        
        <SGFInput
          label="Modelo"
          placeholder="Ex: Toyota Hilux"
          fullWidth
        />
        
        <SGFSelect
          label="Secretaria"
          options={[
            { value: 'obras', label: 'Obras' },
            { value: 'saude', label: 'Saúde' },
          ]}
          fullWidth
        />
        
        <div className="flex justify-end gap-3 mt-6">
          <SGFButton variant="ghost">Cancelar</SGFButton>
          <SGFButton variant="primary" icon={Save}>
            Salvar Veículo
          </SGFButton>
        </div>
      </div>
    </SGFCard>
  );
}
```

---

### 2. Exibir KPIs no Dashboard

```tsx
import { SGFKPICard } from '@/app/components/sgf';
import { Truck, Activity, Fuel, Wrench } from 'lucide-react';

export function DashboardKPIs() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
      <SGFKPICard
        title="Total de Veículos"
        value="128"
        percentage={8.2}
        trend="up"
        icon={Truck}
        iconColor="text-emerald-600"
      />
      
      <SGFKPICard
        title="Em Movimento"
        value="42"
        percentage={12.5}
        trend="up"
        icon={Activity}
        iconColor="text-blue-600"
      />
      
      <SGFKPICard
        title="Gasto Combustível"
        value="15.420 L"
        percentage={3.1}
        trend="down"
        icon={Fuel}
        iconColor="text-amber-600"
      />
      
      <SGFKPICard
        title="Em Manutenção"
        value="8"
        percentage={15}
        trend="down"
        icon={Wrench}
        iconColor="text-purple-600"
      />
    </div>
  );
}
```

---

### 3. Criar uma Tabela de Dados

```tsx
import { SGFTable, SGFBadge } from '@/app/components/sgf';
import { Truck } from 'lucide-react';

interface Vehicle {
  id: string;
  plate: string;
  model: string;
  status: 'moving' | 'idle' | 'stopped';
}

export function VehicleTable() {
  const vehicles: Vehicle[] = [
    { id: '1', plate: 'ABC-1234', model: 'VW Constellation', status: 'moving' },
    { id: '2', plate: 'SGF-2026', model: 'Toyota Hilux', status: 'idle' },
  ];
  
  const columns = [
    {
      header: 'Veículo',
      accessor: (row: Vehicle) => (
        <div className="flex items-center gap-3">
          <Truck size={20} />
          <div>
            <p className="font-bold">{row.plate}</p>
            <p className="text-xs text-slate-400">{row.model}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (row: Vehicle) => (
        <SGFBadge variant={row.status} dot>
          {row.status}
        </SGFBadge>
      ),
    },
  ];
  
  return (
    <SGFTable
      columns={columns}
      data={vehicles}
      keyExtractor={(row) => row.id}
      onRowClick={(row) => console.log('Clicked:', row)}
    />
  );
}
```

---

### 4. Exibir Alertas

```tsx
import { SGFAlert } from '@/app/components/sgf';
import { useState } from 'react';

export function Alerts() {
  const [showAlert, setShowAlert] = useState(true);
  
  return (
    <div className="space-y-4">
      <SGFAlert
        variant="info"
        message="Sistema funcionando normalmente"
      />
      
      <SGFAlert
        variant="success"
        title="Sucesso"
        message="Dados salvos com sucesso!"
      />
      
      <SGFAlert
        variant="warning"
        title="Atenção"
        message="3 veículos com manutenção pendente"
        dismissible
        onDismiss={() => setShowAlert(false)}
      />
      
      <SGFAlert
        variant="error"
        title="Erro"
        message="Não foi possível conectar ao servidor"
      />
    </div>
  );
}
```

---

### 5. Usar Barras de Progresso

```tsx
import { SGFProgressBar } from '@/app/components/sgf';

export function FuelGauge({ fuelLevel }: { fuelLevel: number }) {
  const getVariant = (level: number) => {
    if (level < 20) return 'error';
    if (level < 50) return 'warning';
    return 'success';
  };
  
  return (
    <div>
      <SGFProgressBar
        value={fuelLevel}
        max={100}
        label="Nível de Combustível"
        showPercentage
        variant={getVariant(fuelLevel)}
        size="md"
      />
    </div>
  );
}
```

---

## 🎨 Usando Cores do Sistema

### CSS Custom Properties

```css
.meu-elemento {
  background-color: var(--sgf-primary);
  color: var(--sgf-text-primary);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
}
```

### Tailwind Classes

```tsx
<div className="bg-[var(--sgf-primary)] text-white rounded-3xl p-8">
  Conteúdo
</div>
```

---

## 🛠️ Utilitários

### Importação

```tsx
import {
  formatPlate,
  formatCPF,
  formatCurrency,
  formatDate,
  formatDateTime,
  timeAgo,
  isValidPlate,
  isValidCPF,
  exportToCSV,
} from '@/lib/sgf-utils';
```

### Exemplos de Uso

```tsx
// Formatação
const plate = formatPlate('ABC1234');        // "ABC-1234"
const cpf = formatCPF('12345678900');        // "123.456.789-00"
const price = formatCurrency(150.50);        // "R$ 150,50"
const date = formatDate(new Date());         // "02/01/2026"
const time = timeAgo(new Date());            // "2 min atrás"

// Validação
const isValid = isValidPlate('ABC-1234');    // true
const isCPFValid = isValidCPF('123.456.789-00'); // validação completa

// Exportação
const vehicles = [
  { plate: 'ABC-1234', model: 'Hilux', km: 50000 },
  { plate: 'XYZ-9876', model: 'Gol', km: 30000 },
];
exportToCSV(vehicles, 'veiculos-2026');
```

---

## 📐 Layout Patterns

### Dashboard Layout

```tsx
export function DashboardPage() {
  return (
    <div className="min-h-screen bg-[var(--sgf-surface)] p-10">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-4xl font-black text-slate-900">Dashboard</h1>
        <p className="text-slate-500">Visão geral do sistema</p>
      </div>
      
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
        {/* KPI Cards aqui */}
      </div>
      
      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2">
          {/* Gráficos ou tabelas */}
        </div>
        <div>
          {/* Sidebar com alertas */}
        </div>
      </div>
    </div>
  );
}
```

### Form Layout

```tsx
export function FormPage() {
  return (
    <div className="min-h-screen bg-[var(--sgf-surface)] p-10">
      <div className="max-w-3xl mx-auto">
        <SGFCard padding="lg">
          <h2 className="text-2xl font-bold mb-6">Formulário</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Campos do formulário */}
          </div>
          
          <div className="flex justify-end gap-3 mt-8 pt-6 border-t">
            <SGFButton variant="ghost">Cancelar</SGFButton>
            <SGFButton variant="primary">Salvar</SGFButton>
          </div>
        </SGFCard>
      </div>
    </div>
  );
}
```

---

## 🎯 Best Practices

### ✅ Fazer

- Usar sempre componentes SGF ao invés de HTML puro
- Manter consistência de espaçamento (múltiplos de 4px: p-4, mb-6, gap-8)
- Usar as variantes corretas (primary para ações principais, outline para secundárias)
- Adicionar labels descritivos em todos os inputs
- Fornecer feedback visual para ações do usuário
- Usar badges de status consistentes (moving, idle, stopped, alert)

### ❌ Evitar

- Criar componentes personalizados quando já existe equivalente no SGF
- Usar cores hardcoded ao invés das variáveis CSS
- Estilos inline complexos
- Botões sem ícones em ações importantes
- Formulários sem validação visual
- Tabelas sem estado de loading ou empty state

---

## 🔍 Debugging

### Ver Showcase Completo

Para visualizar todos os componentes disponíveis:

```tsx
import DesignSystemShowcase from '@/app/components/examples/DesignSystemShowcase';

// Use no seu App.tsx ou routes
<DesignSystemShowcase />
```

### Inspecionar Variáveis CSS

No DevTools do navegador:

```javascript
// Console
getComputedStyle(document.documentElement).getPropertyValue('--sgf-primary')
// Output: "hsl(160, 100%, 33%)"
```

---

## 📚 Recursos

- **Documentação Completa**: `/DESIGN_SYSTEM.md`
- **PRD do Projeto**: Ver documento fornecido
- **Ícones**: [Lucide React](https://lucide.dev)
- **Tailwind Docs**: [tailwindcss.com](https://tailwindcss.com)

---

## 🆘 Ajuda

### Componente não encontrado?

1. Verifique se está importando de `@/app/components/sgf`
2. Confira se o nome está correto (SGFButton, não SGFBtn)
3. Veja a lista completa em `/src/app/components/sgf/index.ts`

### Estilos não aplicados?

1. Verifique se `/src/styles/theme.css` está importado
2. Certifique-se que as classes Tailwind estão corretas
3. Use variáveis CSS: `var(--sgf-primary)` ao invés de valores diretos

### Performance?

1. Use `React.memo` em componentes pesados
2. Implemente virtualização em tabelas grandes
3. Lazy load de rotas/páginas

---

**Desenvolvido para SGF 2026 - Sistema de Gestão de Frotas Municipal**
