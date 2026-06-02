# SGF 2026 - Documentação de Páginas

Sistema completo de gestão de frotas municipais com 8 páginas funcionais.

## 📊 Páginas Implementadas

### 1. **Visão Estratégica** (`/dashboard`)
Dashboard principal com KPIs e visão geral do sistema.

**Recursos:**
- 4 KPIs principais (Veículos Ativos, Em Movimento, Gasto Diesel, Alertas)
- Gráfico interativo de eficiência por secretaria (Recharts)
- Central de alertas em tempo real
- Tabela de monitoramento ativo da frota

---

### 2. **Centro de Comando** (`/map`)
Mapa de rastreamento em tempo real dos veículos.

**Recursos:**
- Visualização de veículos no mapa com marcadores coloridos por status
- Sidebar com lista de veículos ativos
- Detalhes do veículo selecionado
- Indicadores de velocidade e combustível
- Sistema de coordenadas GPS
- Legendas de status (Em movimento, Parado, Estacionado, Alerta)

---

### 3. **Telemetria Real** (`/telemetry`)
Monitoramento de telemetria em tempo real.

**Recursos:**
- 4 KPIs ao vivo (Velocidade, RPM, Temperatura, Combustível)
- 4 gráficos de linha/área em tempo real:
  - Velocidade
  - RPM do motor
  - Temperatura
  - Consumo de combustível
- Atualização automática a cada 3 segundos
- Log de eventos de telemetria
- Controle de pausa/retomar transmissão

---

### 4. **Frota Municipal** (`/fleet`)
Gestão completa de veículos da frota.

**Recursos:**
- 4 KPIs (Total, Ativos, Em Manutenção, Docs Vencidos)
- Filtros avançados (busca, departamento, status)
- Tabela completa com informações de veículos
- Detalhes: placa, modelo, tipo, quilometragem, documentação
- Alertas de documentos vencidos
- Distribuição por tipo e departamento
- Próximas manutenções programadas

---

### 5. **Motoristas** (`/drivers`)
Gestão completa de motoristas.

**Recursos:**
- 4 KPIs (Total, Ativos, Suspensos, Performance Média)
- Sistema de pontuação de performance (0-100)
- Controle de infrações
- Gestão de CNH (categoria, validade)
- Top 3 melhores condutores
- Alertas de CNH vencendo
- Ranking de infrações

---

### 6. **Abastecimentos** (`/fuel`)
Controle de combustível e custos.

**Recursos:**
- 4 KPIs (Custo Total, Litros, Preço Médio, Pendentes)
- Gráficos mensais:
  - Consumo em litros (barras)
  - Custo total (linha)
- Histórico detalhado de abastecimentos
- Validação de comprovantes
- Geolocalização dos postos
- Análise por tipo de combustível
- Ranking de postos e maiores consumidores

---

### 7. **Manutenção** (`/maintenance`)
Gestão de ordens de serviço.

**Recursos:**
- 5 KPIs (Total OS, Pendentes, Em Andamento, Concluídas, Custo Total)
- Tipos de manutenção: Preventiva, Corretiva, Emergencial
- Sistema de prioridades (Baixa, Média, Alta, Crítica)
- Gestão de mecânicos e disponibilidade
- Controle de custos estimados vs reais
- Lista de peças utilizadas
- Alertas de manutenções críticas

---

### 8. **Relatórios & Auditoria** (`/reports`)
Geração de relatórios e análises.

**Recursos:**
- 4 KPIs (Custo Total, Combustível, Manutenção, Relatórios)
- 4 gráficos analíticos:
  - Custos por departamento (barras)
  - Tendência mensal (linha)
  - Status da frota (pizza)
  - Ranking de custos
- Relatórios rápidos em PDF/Excel:
  - Abastecimentos
  - Manutenções
  - Viagens
  - Financeiro
- Histórico de relatórios gerados
- Filtros por período e departamento

---

## 🎨 Design System

Todas as páginas utilizam o **SGF Design System** com:
- 11 componentes customizados
- Paleta de cores específica (verde emerald #10b981)
- Tipografia consistente
- Animações suaves
- Responsividade completa
- Ícones do Lucide React

---

## 📈 Bibliotecas Utilizadas

- **Recharts**: Gráficos interativos
- **Lucide React**: Ícones
- **Tailwind CSS v4**: Estilização
- **React**: Framework base

---

## 🚀 Navegação

A navegação entre páginas é feita através do **DashboardLayout** com sidebar fixa contendo:

**Inteligência:**
1. Visão Estratégica
2. Centro de Comando
3. Telemetria Real

**Gestão de Ativos:**
4. Frota Municipal
5. Motoristas
6. Abastecimentos
7. Manutenção

**Análise:**
8. Relatórios & Auditoria

---

## 💡 Funcionalidades Principais

- ✅ Dados mockados realistas
- ✅ Filtros e buscas funcionais
- ✅ Tabelas interativas
- ✅ Gráficos em tempo real
- ✅ Sistema de alertas
- ✅ KPIs dinâmicos
- ✅ Badges de status
- ✅ Exportação de relatórios
- ✅ Responsivo mobile/desktop

---

## 📝 Próximos Passos Sugeridos

1. Integração com backend/API
2. Autenticação e permissões
3. Implementação de mapa real (Google Maps/Leaflet)
4. Sistema de notificações push
5. Geração real de PDFs
6. Upload de fotos/documentos
7. Modo offline com IndexedDB
8. WebSocket para dados em tempo real
