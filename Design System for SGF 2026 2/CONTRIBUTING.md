# 🤝 Guia de Contribuição - SGF 2026 Design System

Obrigado por contribuir com o Design System do SGF 2026! Este guia ajudará você a manter a consistência e qualidade do código.

---

## 📋 Índice

1. [Código de Conduta](#código-de-conduta)
2. [Como Contribuir](#como-contribuir)
3. [Padrões de Código](#padrões-de-código)
4. [Criando Componentes](#criando-componentes)
5. [Nomenclatura](#nomenclatura)
6. [TypeScript](#typescript)
7. [Testes](#testes)
8. [Documentação](#documentação)

---

## 📜 Código de Conduta

- Seja respeitoso e profissional
- Foco na qualidade do código
- Colaboração e comunicação clara
- Seguir os padrões estabelecidos

---

## 🚀 Como Contribuir

### 1. Entender o Design System

Antes de contribuir, familiarize-se com:
- `/DESIGN_SYSTEM.md` - Documentação completa
- `/SGF_QUICK_START.md` - Guia rápido
- Exemplos em `/src/app/components/examples/`

### 2. Tipos de Contribuição

- 🐛 **Bug Fixes** - Correções de bugs
- ✨ **Features** - Novos componentes ou utilitários
- 📚 **Documentação** - Melhorias na documentação
- 🎨 **Design** - Ajustes visuais e de UX
- ⚡ **Performance** - Otimizações

### 3. Workflow

```bash
# 1. Clone o repositório
git clone [repo-url]

# 2. Crie uma branch
git checkout -b feature/nome-da-feature

# 3. Faça suas alterações
# ...

# 4. Commit com mensagem descritiva
git commit -m "feat: adiciona componente SGFModal"

# 5. Push para o repositório
git push origin feature/nome-da-feature

# 6. Abra um Pull Request
```

---

## 📝 Padrões de Código

### Estilo de Código

- **Indentação**: 2 espaços
- **Aspas**: Simples para strings
- **Ponto e vírgula**: Obrigatório
- **Trailing comma**: Sempre quando multi-linha

### ESLint e Prettier

```bash
# Verificar código
npm run lint

# Formatar código
npm run format
```

### Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: adiciona novo componente
fix: corrige bug no SGFButton
docs: atualiza documentação do SGFCard
style: ajusta espaçamento no SGFInput
refactor: melhora performance do SGFTable
test: adiciona testes para SGFBadge
```

---

## 🧩 Criando Componentes

### Estrutura de Componente

```tsx
/**
 * SGF 2026 - [Nome do Componente]
 * [Descrição breve do componente]
 */

import React from 'react';

export interface SGF[Nome]Props {
  /** Descrição da prop */
  variant?: 'default' | 'primary';
  /** Descrição */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children?: React.ReactNode;
}

export const SGF[Nome] = React.forwardRef<
  HTMLDivElement,
  SGF[Nome]Props
>(
  (
    {
      variant = 'default',
      size = 'md',
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles = '...';
    const variantStyles = { ... };
    const sizeStyles = { ... };

    return (
      <div
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

SGF[Nome].displayName = 'SGF[Nome]';
```

### Checklist para Novo Componente

- [ ] Criar arquivo em `/src/app/components/sgf/SGF[Nome].tsx`
- [ ] Definir interface TypeScript com JSDoc
- [ ] Implementar com React.forwardRef
- [ ] Adicionar variantes (se aplicável)
- [ ] Adicionar tamanhos (se aplicável)
- [ ] Exportar em `/src/app/components/sgf/index.ts`
- [ ] Criar exemplo de uso
- [ ] Documentar em DESIGN_SYSTEM.md
- [ ] Adicionar ao Showcase
- [ ] Testar responsividade
- [ ] Validar acessibilidade

---

## 🏷️ Nomenclatura

### Componentes

- **Prefixo**: Sempre `SGF`
- **PascalCase**: `SGFButton`, `SGFKPICard`
- **Descritivo**: Nome deve indicar função

```tsx
✅ SGFButton
✅ SGFKPICard
✅ SGFProgressBar

❌ Button
❌ KPI
❌ Progress
```

### Props

- **camelCase**: `variant`, `onClick`, `isLoading`
- **Booleans**: Prefixo `is`, `has`, `should`
- **Callbacks**: Prefixo `on`

```tsx
interface Props {
  ✅ isLoading: boolean
  ✅ hasError: boolean
  ✅ onClick: () => void
  ✅ onSubmit: (data: FormData) => void
  
  ❌ loading: boolean
  ❌ error: boolean
  ❌ clickHandler: () => void
}
```

### Variantes

Use strings literais, não números:

```tsx
✅ variant?: 'primary' | 'secondary' | 'outline'
✅ size?: 'sm' | 'md' | 'lg'

❌ variant?: 1 | 2 | 3
❌ size?: number
```

---

## 📐 TypeScript

### Tipagem Forte

Sempre use tipagem explícita:

```tsx
✅ const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => { ... }
✅ const [count, setCount] = useState<number>(0)

❌ const handleClick = (event: any) => { ... }
❌ const [count, setCount] = useState(0) // Inferência ok, mas explícito é melhor
```

### Interfaces vs Types

- **Interface** para props de componentes
- **Type** para unions e utilities

```tsx
✅ export interface SGFButtonProps { ... }
✅ export type ButtonVariant = 'primary' | 'secondary'

❌ export type SGFButtonProps = { ... }  // Prefira interface
```

### Genéricos

Use genéricos para componentes reutilizáveis:

```tsx
export function SGFTable<T>({
  data,
  columns,
}: {
  data: T[];
  columns: Column<T>[];
}) { ... }
```

---

## 🧪 Testes

### Estrutura de Teste

```tsx
import { render, screen } from '@testing-library/react';
import { SGFButton } from './SGFButton';

describe('SGFButton', () => {
  it('renders with default props', () => {
    render(<SGFButton>Click me</SGFButton>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('applies variant class', () => {
    render(<SGFButton variant="primary">Button</SGFButton>);
    const button = screen.getByText('Button');
    expect(button).toHaveClass('bg-[var(--sgf-primary)]');
  });

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<SGFButton onClick={handleClick}>Button</SGFButton>);
    screen.getByText('Button').click();
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### O que Testar

- [ ] Renderização básica
- [ ] Props variantes
- [ ] Callbacks (onClick, onChange, etc.)
- [ ] Estados (loading, disabled, error)
- [ ] Acessibilidade (ARIA, roles)

---

## 📚 Documentação

### Comentários de Código

Use JSDoc para props:

```tsx
export interface SGFButtonProps {
  /**
   * Variante visual do botão
   * @default 'primary'
   */
  variant?: 'primary' | 'secondary' | 'outline';
  
  /**
   * Callback executado ao clicar
   */
  onClick?: () => void;
}
```

### README do Componente

Ao criar um componente complexo, adicione exemplo:

```tsx
/**
 * SGF 2026 - SGFButton
 * 
 * Botão principal do sistema com múltiplas variantes
 * 
 * @example
 * ```tsx
 * <SGFButton variant="primary" icon={Save}>
 *   Salvar Dados
 * </SGFButton>
 * ```
 */
```

### Atualizar Documentação

Ao adicionar componente:

1. Adicionar seção em `/DESIGN_SYSTEM.md`
2. Adicionar exemplo em `/SGF_QUICK_START.md`
3. Adicionar ao `DesignSystemShowcase.tsx`
4. Atualizar `CHANGELOG.md`

---

## 🎨 Padrões de Design

### Cores

Use sempre variáveis CSS:

```tsx
✅ className="bg-[var(--sgf-primary)]"
✅ className="text-[var(--sgf-text-primary)]"

❌ className="bg-emerald-600"
❌ style={{ color: '#00A86B' }}
```

### Espaçamento

Use múltiplos de 4px:

```tsx
✅ className="p-4 gap-6 mb-8"
✅ className="mt-10"

❌ className="p-3 gap-5 mb-7"  // Não múltiplos de 4
```

### Border Radius

Use variáveis definidas:

```tsx
✅ className="rounded-2xl"  // var(--radius-2xl)
✅ className="rounded-3xl"  // var(--radius-3xl)

❌ className="rounded-[15px]"  // Valor arbitrário
```

---

## ♿ Acessibilidade

### Checklist

- [ ] Labels em todos os inputs
- [ ] ARIA roles apropriados
- [ ] Navegação por teclado
- [ ] Contraste mínimo 4.5:1
- [ ] Foco visível
- [ ] Textos alternativos
- [ ] Tamanho mínimo de toque 44x44px

### Exemplo

```tsx
<button
  aria-label="Fechar modal"
  className="focus:ring-4 focus:ring-emerald-500/20"
  onClick={onClose}
>
  <X size={20} />
</button>
```

---

## 🚫 Anti-Patterns

### Evitar

```tsx
❌ Usar `any` type
❌ Estilos inline complexos
❌ Componentes sem displayName
❌ Props sem descrição
❌ Cores hardcoded
❌ Imports absolutos sem alias
❌ Criar novos componentes quando SGF já existe
```

### Preferir

```tsx
✅ Tipagem forte
✅ Tailwind classes
✅ React.forwardRef
✅ JSDoc completo
✅ Variáveis CSS
✅ Imports com @
✅ Reusar componentes SGF
```

---

## 📦 Pull Request

### Template

```markdown
## Descrição
[Descreva as mudanças]

## Tipo de Mudança
- [ ] Bug fix
- [ ] Nova feature
- [ ] Breaking change
- [ ] Documentação

## Checklist
- [ ] Código segue padrões do projeto
- [ ] Documentação atualizada
- [ ] Testes adicionados/atualizados
- [ ] Build local sem erros
- [ ] Responsivo testado
- [ ] Acessibilidade validada

## Screenshots
[Se aplicável]
```

---

## 🔍 Review Process

### O que Revisar

1. **Código**
   - Padrões seguidos?
   - Tipagem correta?
   - Performance ok?

2. **Design**
   - Consistente com design system?
   - Cores corretas?
   - Espaçamento apropriado?

3. **Documentação**
   - Props documentadas?
   - Exemplo adicionado?
   - CHANGELOG atualizado?

4. **Testes**
   - Cobertura adequada?
   - Casos edge cobertos?

---

## 💡 Dicas

### Performance

- Use `React.memo` para componentes pesados
- Evite re-renders desnecessários
- Lazy load quando apropriado

### Reutilização

- Sempre verificar se componente similar já existe
- Preferir composição ao invés de criar novo
- Extrair lógica comum para hooks

### Debugging

```tsx
// Adicione displayName
SGFButton.displayName = 'SGFButton';

// Use console.log strategicamente
if (process.env.NODE_ENV === 'development') {
  console.log('[SGFButton] props:', props);
}
```

---

## 📞 Ajuda

### Recursos

- **Documentação**: `/DESIGN_SYSTEM.md`
- **Guia Rápido**: `/SGF_QUICK_START.md`
- **Exemplos**: `/src/app/components/examples/`

### Dúvidas?

1. Consulte a documentação
2. Veja exemplos existentes
3. Pergunte ao time

---

## ✅ Checklist Final

Antes de submeter PR:

- [ ] Código lintado (`npm run lint`)
- [ ] Formatado (`npm run format`)
- [ ] Build sem erros (`npm run build`)
- [ ] Testes passando (`npm run test`)
- [ ] Documentação atualizada
- [ ] CHANGELOG atualizado
- [ ] Exemplo adicionado ao Showcase
- [ ] Screenshots no PR
- [ ] Revisão própria feita

---

**Obrigado por contribuir com o SGF 2026! 🚀**

Sua contribuição ajuda a melhorar a gestão de frotas municipais em todo o Brasil.
