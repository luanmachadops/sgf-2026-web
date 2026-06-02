# 🎨 SGF 2026 - Guia Visual Rápido

Referência visual rápida do Design System SGF 2026.

---

## 🎨 Paleta de Cores

```
┌─────────────────────────────────────────────────────┐
│                  CORES PRINCIPAIS                    │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ████████  SGF DARK      #0F2B2F  Deep Ocean        │
│  ████████  SGF PRIMARY   #00A86B  Emerald Green     │
│  ████████  SGF LIGHT     #70C4A8  Mint Accent       │
│                                                      │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│               STATUS DE VEÍCULOS                     │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ████████  MOVING      #22C55E  Em Movimento        │
│  ████████  IDLE        #3B82F6  Parado/Ligado       │
│  ████████  STOPPED     #9CA3AF  Desligado           │
│  ████████  ALERT       #EF4444  Alerta/Emergência   │
│                                                      │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                CORES SEMÂNTICAS                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ████████  SUCCESS     #22C55E  Sucesso             │
│  ████████  ERROR       #DC2626  Erro                │
│  ████████  WARNING     #F59E0B  Aviso               │
│  ████████  INFO        #3B82F6  Informação          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 🔘 Componentes de Botão

```
┌──────────────────────────────────────────┐
│            VARIANTES                      │
├──────────────────────────────────────────┤
│                                           │
│  [ PRIMARY ]    Verde principal          │
│  [ SECONDARY ]  Azul escuro              │
│  [ OUTLINE ]    Borda verde              │
│  [ GHOST ]      Transparente             │
│  [ DANGER ]     Vermelho                 │
│                                           │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│            TAMANHOS                       │
├──────────────────────────────────────────┤
│                                           │
│  [ sm ]   Pequeno   12px padding         │
│  [ md ]   Médio     16px padding         │
│  [ lg ]   Grande    20px padding         │
│  [ xl ]   XL        24px padding         │
│                                           │
└──────────────────────────────────────────┘
```

---

## 📦 Cards

```
┌───────────────────────────────────────┐
│ DEFAULT CARD                          │
│ Borda sutil, sombra leve              │
│ Uso: Conteúdo geral                   │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ ELEVATED CARD                         │
│ Sombra pronunciada                    │
│ Uso: Destaque, modais                 │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ BORDERED CARD                         │
│ Borda colorida (verde)                │
│ Uso: Ênfase, CTAs                     │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ GLASS CARD                            │
│ Efeito glassmorphism                  │
│ Uso: Overlays, headers                │
└───────────────────────────────────────┘
```

---

## 🏷️ Badges

```
STATUS VEÍCULOS:
┌────────┬────────┬────────┬────────┐
│ MOVING │  IDLE  │STOPPED │ ALERT  │
│   🟢   │   🔵   │   ⚪   │   🔴   │
└────────┴────────┴────────┴────────┘

PADRÃO:
┌────────┬────────┬────────┬────────┐
│DEFAULT │SUCCESS │WARNING │ ERROR  │
│   ⚪   │   🟢   │   🟡   │   🔴   │
└────────┴────────┴────────┴────────┘
```

---

## 📊 KPI Card

```
┌─────────────────────────────────────┐
│  [🚛]                      ↗ 8.2%  │
│                                     │
│  Veículos Ativos                    │
│  128                                │
└─────────────────────────────────────┘

Elementos:
• Ícone colorido (topo esquerda)
• Trend indicator (topo direita)
• Label (descrição)
• Valor (número grande)
```

---

## 📝 Formulários

```
INPUT:
┌─────────────────────────────────────┐
│ Nome                                │
│ ┌─────────────────────────────────┐ │
│ │ 🔍 Digite seu nome...           │ │
│ └─────────────────────────────────┘ │
│ Use seu nome completo               │
└─────────────────────────────────────┘

SELECT:
┌─────────────────────────────────────┐
│ Secretaria                          │
│ ┌─────────────────────────────────┐ │
│ │ Obras                        ▼ │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘

TEXTAREA:
┌─────────────────────────────────────┐
│ Observações             150/200     │
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## 🚨 Alertas

```
ℹ️ INFO
┌─────────────────────────────────────┐
│ ℹ  Informação                   [×] │
│    Tudo funcionando normalmente     │
└─────────────────────────────────────┘

✅ SUCCESS
┌─────────────────────────────────────┐
│ ✓  Sucesso                      [×] │
│    Dados salvos com sucesso!        │
└─────────────────────────────────────┘

⚠️ WARNING
┌─────────────────────────────────────┐
│ ⚠  Atenção                      [×] │
│    3 veículos pendentes             │
└─────────────────────────────────────┘

❌ ERROR
┌─────────────────────────────────────┐
│ ✕  Erro                         [×] │
│    Não foi possível conectar        │
└─────────────────────────────────────┘
```

---

## 📈 Progress Bar

```
SUCESSO (Verde):
Combustível                        75%
████████████████████░░░░░░░░░░░░░

AVISO (Amarelo):
Manutenções                        45%
██████████████░░░░░░░░░░░░░░░░░░░

ERRO (Vermelho):
Nível Crítico                      15%
████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

---

## 📋 Tabela

```
┌────────────────────────────────────────────────────┐
│ VEÍCULO        │ DEPT  │ STATUS  │ COMBUSTÍVEL    │
├────────────────────────────────────────────────────┤
│ 🚛 ABC-1234    │ Obras │ 🟢      │ ████░ 75%      │
│    VW Const.   │       │ Moving  │                │
├────────────────────────────────────────────────────┤
│ 🚗 SGF-2026    │ Saúde │ 🔵      │ ████░ 42%      │
│    Toyota      │       │ Idle    │                │
└────────────────────────────────────────────────────┘
```

---

## 🗺️ Layout do Dashboard

```
┌────────┬──────────────────────────────────┐
│        │ HEADER                           │
│        │ [Search]  [🔔] [⚙]              │
│        ├──────────────────────────────────┤
│ SIDE   │                                  │
│ BAR    │ ┌──────┬──────┬──────┬──────┐   │
│        │ │ KPI  │ KPI  │ KPI  │ KPI  │   │
│ Nav    │ └──────┴──────┴──────┴──────┘   │
│ Items  │                                  │
│        │ ┌─────────────┬─────────────┐   │
│ User   │ │  Chart      │  Alerts     │   │
│ Profile│ │             │             │   │
│        │ └─────────────┴─────────────┘   │
│        │                                  │
│        │ ┌───────────────────────────┐   │
│        │ │  Table                    │   │
│        │ └───────────────────────────┘   │
└────────┴──────────────────────────────────┘
```

---

## 📏 Espaçamento

```
ESCALA (múltiplos de 4px):
─ space-1   4px   ▪
── space-2   8px   ▪▪
─── space-3  12px  ▪▪▪
──── space-4  16px  ▪▪▪▪
───── space-5  20px  ▪▪▪▪▪
────── space-6  24px  ▪▪▪▪▪▪
────────  space-8   32px  ▪▪▪▪▪▪▪▪
──────────  space-10  40px  ▪▪▪▪▪▪▪▪▪▪
```

---

## 🔲 Border Radius

```
┏━━━━━━━┓  sm    12px
┃       ┃
┗━━━━━━━┛

┏━━━━━━━┓  md    16px
┃       ┃
┗━━━━━━━┛

┏━━━━━━━┓  lg    20px
┃       ┃
┗━━━━━━━┛

┏━━━━━━━┓  xl    24px
┃       ┃
┗━━━━━━━┛

┏━━━━━━━┓  2xl   32px
┃       ┃
┗━━━━━━━┛

┏━━━━━━━┓  3xl   40px
┃       ┃
┗━━━━━━━┛

( ▁▁▁▁▁ )  full  9999px (pill)
```

---

## 🎯 Ícones Principais

```
NAVEGAÇÃO:
🏠 LayoutDashboard   📍 Map          📄 FileText
⚙️  Settings          🔔 Bell         🔍 Search

VEÍCULOS:
🚛 Truck             🚗 Car          🚌 Bus
🏍️  Bike              📍 MapPin       🧭 Navigation

PESSOAS:
👤 User              👥 Users        ✓ UserCheck
✕ UserX             🛡️  Shield

COMBUSTÍVEL/MANUTENÇÃO:
⛽ Fuel              🔧 Wrench       🛠️  Tool
⚠️  AlertTriangle    🔴 AlertCircle  ✅ CheckCircle

AÇÕES:
➕ Plus              ✏️  Edit         🗑️  Trash2
💾 Save              ⬆️  Upload       ⬇️  Download

STATUS:
📊 Activity          📈 TrendingUp   📉 TrendingDown
⬆️  ArrowUp          ⬇️  ArrowDown   ↗️  ArrowUpRight
```

---

## 🎨 Como Usar as Cores

```tsx
// Variáveis CSS (RECOMENDADO)
className="bg-[var(--sgf-primary)]"
className="text-[var(--sgf-text-primary)]"

// Tailwind direto (quando apropriado)
className="bg-emerald-600"  // Para override
className="text-slate-900"

// NUNCA use valores diretos
❌ style={{ color: '#00A86B' }}
```

---

## 📱 Responsividade

```
BREAKPOINTS:
sm   640px   Tablet small
md   768px   Tablet
lg   1024px  Desktop
xl   1280px  Desktop large

EXEMPLO:
className="
  p-4        /* Mobile: 16px */
  md:p-6     /* Tablet: 24px */
  lg:p-10    /* Desktop: 40px */
"
```

---

## ✅ Checklist de Uso

```
ANTES DE COMEÇAR:
☐ Importar componentes de @/app/components/sgf
☐ Usar variáveis CSS para cores
☐ Espaçamento em múltiplos de 4px
☐ Border radius das variáveis
☐ Ícones do Lucide React

DURANTE DESENVOLVIMENTO:
☐ TypeScript tipado
☐ Props documentadas
☐ Responsividade testada
☐ Estados de loading/error
☐ Acessibilidade validada

ANTES DE COMMIT:
☐ npm run lint
☐ npm run format
☐ npm run build
☐ Documentação atualizada
```

---

## 🚀 Links Rápidos

- **Componentes**: `/src/app/components/sgf/`
- **Exemplos**: `/src/app/components/examples/`
- **Utilitários**: `/src/lib/sgf-utils.ts`
- **Types**: `/src/types/sgf.ts`
- **Tema**: `/src/styles/theme.css`

---

## 📚 Documentação

1. **Completa**: `/DESIGN_SYSTEM.md`
2. **Quick Start**: `/SGF_QUICK_START.md`
3. **Como Ver**: `/HOW_TO_VIEW.md`
4. **Sumário**: `/DESIGN_SYSTEM_SUMMARY.md`
5. **Changelog**: `/CHANGELOG.md`
6. **Contribuir**: `/CONTRIBUTING.md`

---

**SGF 2026 - Sistema de Gestão de Frotas Municipal**  
Design System v1.0 | Janeiro 2026
