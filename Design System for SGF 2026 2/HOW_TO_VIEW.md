# 👀 Como Visualizar o Design System SGF 2026

Este guia mostra como visualizar todos os componentes e exemplos criados.

---

## 🚀 Opção 1: Ver o Showcase Completo (Recomendado)

### Passo 1: Atualizar o App.tsx

Abra `/src/app/App.tsx` e substitua o conteúdo por:

```tsx
import React, { useState } from 'react';
import { DesignSystemShowcase } from './components/examples/DesignSystemShowcase';
import { IconsShowcase } from './components/examples/IconsShowcase';
import { DashboardExample } from './components/examples/DashboardExample';
import { SGFButton } from './components/sgf';

export default function App() {
  const [view, setView] = useState<'components' | 'icons' | 'dashboard'>('components');

  return (
    <div>
      {/* Navigation Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[var(--sgf-dark)] p-4 shadow-2xl">
        <div className="max-w-7xl mx-auto flex gap-4">
          <SGFButton
            variant={view === 'components' ? 'primary' : 'ghost'}
            onClick={() => setView('components')}
            size="sm"
          >
            Componentes
          </SGFButton>
          <SGFButton
            variant={view === 'icons' ? 'primary' : 'ghost'}
            onClick={() => setView('icons')}
            size="sm"
          >
            Ícones
          </SGFButton>
          <SGFButton
            variant={view === 'dashboard' ? 'primary' : 'ghost'}
            onClick={() => setView('dashboard')}
            size="sm"
          >
            Dashboard
          </SGFButton>
        </div>
      </div>

      {/* Content */}
      <div className="pt-20">
        {view === 'components' && <DesignSystemShowcase />}
        {view === 'icons' && <IconsShowcase />}
        {view === 'dashboard' && <DashboardExample />}
      </div>
    </div>
  );
}
```

### Passo 2: Iniciar o Servidor

```bash
npm run dev
# ou
yarn dev
```

### Passo 3: Abrir no Navegador

Acesse: `http://localhost:5173` (ou a porta indicada)

Você verá 3 abas:
- **Componentes**: Todos os componentes do design system
- **Ícones**: Biblioteca de ícones recomendados
- **Dashboard**: Exemplo completo de aplicação

---

## 🎨 Opção 2: Ver Apenas Componentes

Substitua o conteúdo do `/src/app/App.tsx` por:

```tsx
import { DesignSystemShowcase } from './components/examples/DesignSystemShowcase';

export default function App() {
  return <DesignSystemShowcase />;
}
```

---

## 🗺️ Opção 3: Ver Dashboard Completo

Substitua o conteúdo do `/src/app/App.tsx` por:

```tsx
import { DashboardExample } from './components/examples/DashboardExample';

export default function App() {
  return <DashboardExample />;
}
```

---

## 🔍 Opção 4: Ver Ícones

Substitua o conteúdo do `/src/app/App.tsx` por:

```tsx
import { IconsShowcase } from './components/examples/IconsShowcase';

export default function App() {
  return <IconsShowcase />;
}
```

---

## 📱 Opção 5: Exemplo de Página Individual

Para ver o exemplo de gestão de veículos:

```tsx
import { VehicleManagement } from './components/examples/VehicleManagement';

export default function App() {
  return <VehicleManagement />;
}
```

---

## 🧪 Testar Componentes Individuais

Você pode criar seu próprio arquivo de teste:

```tsx
// src/app/Test.tsx
import {
  SGFButton,
  SGFCard,
  SGFInput,
  SGFKPICard,
} from './components/sgf';
import { Truck } from 'lucide-react';

export default function Test() {
  return (
    <div className="min-h-screen bg-[var(--sgf-surface)] p-10">
      <h1 className="text-4xl font-black mb-8">Meu Teste</h1>

      <SGFCard padding="lg" className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Testando Componentes</h2>

        <div className="space-y-4">
          <SGFInput
            label="Nome"
            placeholder="Digite seu nome..."
            fullWidth
          />

          <SGFButton variant="primary">
            Clique Aqui
          </SGFButton>
        </div>
      </SGFCard>

      <div className="grid grid-cols-3 gap-6">
        <SGFKPICard
          title="Total"
          value="100"
          icon={Truck}
          iconColor="text-emerald-600"
        />
      </div>
    </div>
  );
}
```

Depois importe no App.tsx:

```tsx
import Test from './Test';

export default function App() {
  return <Test />;
}
```

---

## 📚 Estrutura de Navegação Sugerida

Para um app real com rotas, você pode estruturar assim:

```tsx
import { useState } from 'react';
import { DashboardLayout } from './components/templates/DashboardLayout';
import { DesignSystemShowcase } from './components/examples/DesignSystemShowcase';
import { VehicleManagement } from './components/examples/VehicleManagement';

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <h1>Dashboard Content Here</h1>;
      case 'vehicles':
        return <VehicleManagement />;
      case 'showcase':
        return <DesignSystemShowcase />;
      default:
        return <h1>Page Not Found</h1>;
    }
  };

  return (
    <DashboardLayout activeTab={currentPage} onTabChange={setCurrentPage}>
      {renderPage()}
    </DashboardLayout>
  );
}
```

---

## 🎯 Checklist de Visualização

Após configurar, você deve conseguir ver:

### Showcase de Componentes
- [ ] Paleta de cores completa
- [ ] Todos os botões (5 variantes, 4 tamanhos)
- [ ] Campos de formulário (Input, Select, Textarea)
- [ ] Badges em todas as variantes
- [ ] KPI Cards funcionais
- [ ] Alertas coloridos
- [ ] Progress bars
- [ ] Cards com diferentes estilos

### Showcase de Ícones
- [ ] 60+ ícones categorizados
- [ ] Click to copy funcionando
- [ ] Exemplos de uso
- [ ] Guia de cores para ícones

### Dashboard Exemplo
- [ ] Sidebar navegável
- [ ] Header com busca
- [ ] 4 KPI Cards
- [ ] Gráfico de barras
- [ ] Lista de alertas
- [ ] Tabela de veículos
- [ ] Botão flutuante

---

## 🛠️ Troubleshooting

### Componentes não aparecem?

1. Verifique se os imports estão corretos:
   ```tsx
   import { SGFButton } from '@/app/components/sgf';
   ```

2. Confirme que o alias `@` está configurado no `vite.config.ts`

### Estilos não aplicados?

1. Verifique se `/src/styles/theme.css` está sendo importado
2. Certifique-se que TailwindCSS está configurado
3. Limpe o cache: `rm -rf node_modules/.vite`

### Erros de TypeScript?

1. Os tipos estão em `/src/types/sgf.ts`
2. Certifique-se de importar os tipos corretos
3. Execute: `npx tsc --noEmit` para verificar erros

---

## 📸 Screenshots Esperados

Ao visualizar o showcase, você deve ver:

### Tela 1: Paleta de Cores
- 5 blocos coloridos com códigos hex

### Tela 2: Botões
- Grid de botões em diferentes cores e tamanhos
- Botões com ícones à esquerda e direita
- Botão com loading state

### Tela 3: Formulários
- Inputs com ícones
- Inputs com erro/sucesso
- Select dropdown
- Textarea com contador

### Tela 4: Dashboard
- 4 KPIs no topo
- Gráfico de barras colorido
- Tabela de veículos
- Sidebar escura à esquerda

---

## 💡 Dicas

1. **Use DevTools**: Inspecione os elementos para ver as classes aplicadas
2. **Modo Responsivo**: Teste redimensionando a janela
3. **Interatividade**: Clique nos elementos para ver estados hover/active
4. **Console**: Abra o console do navegador para ver logs de cliques

---

## 🎓 Próximos Passos

Depois de visualizar tudo:

1. ✅ Entender como cada componente funciona
2. ✅ Ler a documentação completa em `/DESIGN_SYSTEM.md`
3. ✅ Consultar o guia rápido em `/SGF_QUICK_START.md`
4. ✅ Começar a criar suas próprias telas
5. ✅ Implementar rotas com React Router
6. ✅ Integrar com backend/API

---

## 📞 Ajuda

Se algo não funcionar:

1. Verifique os imports
2. Confirme que todas as dependências estão instaladas
3. Limpe o cache e reinicie o servidor
4. Revise a documentação

---

**Desenvolvido para SGF 2026 - Sistema de Gestão de Frotas Municipal**

Bom desenvolvimento! 🚀
