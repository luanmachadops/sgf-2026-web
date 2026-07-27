# Plano — Dashboard do gestor

> Status: **plano**, nada implementado.
> Base: leitura de `web/src/pages/Dashboard.tsx`, `dashboardApi.getKPIs/getKpiTrends`
> em `supabase-api.ts`, e conferência dos dados reais no banco em 2026-07-26.

## Volume de dados hoje (do banco, não estimado)

```
vehicles 94 · departments 18 · infractions 31 · trip_locations 2.720
trips 3 · fuelings 7 · checklists 5 · service_orders 0 · trackers 1
```

Isso importa para o plano: há **cadastro** (94 veículos, 18 secretarias), mas
quase nenhum **movimento**. Qualquer indicador de eficiência (R$/km, km/L,
tempo de processo) vai aparecer vazio ou instável até haver operação real — e
uma IA analisando 3 viagens produz afirmação sem base. Ver "gate de dados".

---

## 1. O que está errado hoje

Não são opiniões de layout; são defeitos verificados no código.

| # | Problema | Onde | Impacto |
|---|---|---|---|
| 1 | **"Frota ativa" mostra o total da frota**, não a ativa (`kpis.fleet.totalVehicles`). O campo `activeNow` é calculado e ignorado | `Dashboard.tsx:86` | O gestor lê 94 "ativos" com 3 viagens no mês |
| 2 | **"Manutenção Prev." mostra veículos com status `manutencao`** — nada de preventiva | `Dashboard.tsx:104` | Rótulo promete uma coisa, número é outra |
| 3 | `avgResolutionDays: 0` e `preventiveCompliance: 0` **fixos no código** | `supabase-api.ts:1981` | Métricas mortas; hoje já dá para calcular de verdade (ver §2.7) |
| 4 | `idle7Days` é a contagem de veículos `liberado` — **não mede ociosidade** | `supabase-api.ts:1962` | Nome engana quem for usar |
| 5 | A busca do header é **no-op** (`setSearchHandler(() => {})`), mas o placeholder promete "Pesquisar veículo, condutor ou secretaria" | `Dashboard.tsx:51` | O gestor digita e nada acontece |
| 6 | A descrição diz "indicadores **e alertas** da frota" — **não existe painel de alertas** | `Dashboard.tsx:49` | A tela não entrega o que anuncia |
| 7 | `getKPIs` puxa **`service_orders` inteira sem filtro de data**, mais `vehicles` e `profiles` completos, e agrega no **navegador** | `supabase-api.ts:1897` | Com 94 veículos passa; com 50 municípios e anos de OS, o dashboard baixa a base toda |
| 8 | Km do mês filtra por `start_at`: viagem iniciada em junho e concluída em julho **não entra** | `supabase-api.ts:1899` | Viés no fechamento do mês |
| 9 | Sem estado de erro para os KPIs (só o gráfico de gastos trata) | `Dashboard.tsx:89` | Falha de rede vira "0", que é indistinguível de "não houve" |
| 10 | Sparkline sem **delta %** vs. mês anterior | `Dashboard.tsx` | O gestor vê a curva mas não sabe se subiu ou caiu |

**O #7 é o mais grave a médio prazo** e a correção é a mesma coisa que
destrava a IA: mover a agregação para o Postgres numa RPC (`dashboard_summary`)
e trafegar números, não tabelas.

---

## 2. Dados que já existem e não aparecem

Cada linha aqui é dado gravado, sem uso na tela:

| Fonte | O que dá para mostrar | Por que interessa ao gestor |
|---|---|---|
| `infractions` (31 registros) | Infrações por motorista, tipo e custo; reincidência | É dinheiro saindo e responsabilidade administrativa |
| `checklists` + `checklist_items` | Itens críticos reprovados por veículo; recorrência | Antecipa a quebra e prova diligência |
| `device_status.idle_since`, `ignition` | **Motor ligado com veículo parado** — horas/dia | Diesel queimado sem rodar; economia imediata |
| `trip_locations` (2.720 pontos) | Velocidade máxima e média, excesso por trecho | Risco, multa e desgaste |
| `fuelings.has_anomaly`, `km_per_liter` | Anomalias de abastecimento; consumo fora do padrão | Furto de combustível e mau uso |
| `profiles.cnh_expiry` | CNH vencendo em 30 dias (já calculado, **não exibido**) | Motorista dirigindo com CNH vencida é risco jurídico |
| `fuel_stations`/`repair_shops.contract_end` | Contrato vencendo | Compra sem cobertura contratual |
| Fase 6: `quotes`/`invoices`/`payments`/`events` | Custo real, tempo por etapa, oficina mais caro | Onde o processo trava e onde o dinheiro vai |
| `fleet.availabilityRate` | Disponibilidade da frota (%) — já calculada, **não exibida** | Indicador-síntese de operação |

### Indicadores propostos, em ordem de valor

1. **Painel "Precisa da sua atenção"** (topo, acima dos KPIs). Lista priorizada, cada item com link para a tela e o número que o gerou: CNH vencendo, contrato vencendo, OS aguardando empenho, abastecimento com anomalia, checklist crítico reprovado, veículo em movimento sem viagem. **Tudo isso já existe no banco** — é o item de maior valor e menor custo.
2. **Custo por km (R$/km)** por veículo e por secretaria — combustível + manutenção ÷ km rodado. É a métrica que gestor de frota usa para decidir.
3. **Consumo (km/L) com desvio vs. a média da mesma categoria** — flagra furto e mau uso melhor que o valor absoluto.
4. **Disponibilidade da frota (%)** — já calculada; só falta exibir, com meta.
5. **Motor ligado parado** — horas/dia por veículo, de `device_status.idle_since`.
6. **Top 10 veículos por custo de manutenção em 12 meses** — sustenta a decisão "consertar ou renovar".
7. **Tempo médio por etapa do processo de manutenção** (de `service_order_events`) — mostra se trava no orçamento, no empenho ou no pagamento. Só faz sentido depois da fase 7, quando a oficina alimentar o fluxo.
8. **Projeção de gasto do mês** (ritmo atual até o fechamento) vs. mês anterior.
9. **Delta % em cada KPI**, ao lado da sparkline.

---

## 3. IA analisando e conversando com o gestor

A ideia é boa e o projeto **já tem a infraestrutura**: `driver-cnh-extract` e
`vehicle-ai-extract` usam **Gemini** por edge function, com teto de custo em
`tenant_ai_limits.monthly_cap_usd` e contabilidade em `ai_usage`
(`feature`, `model`, `tokens_in/out`, `cost_usd`). O caminho é reusar esse
padrão, não criar outro.

### Desenho proposto

```
RPC dashboard_summary(tenant)      → números agregados no Postgres
        ↓ (JSON pequeno, ~2 KB)
edge function fleet-insights       → checa cap, chama Gemini, grava ai_usage
        ↓
tabela fleet_insights              → 1 análise por tenant por dia (cache)
        ↓
card "Análise da frota" no topo do dashboard
```

### As cinco decisões que fazem isso dar certo

**1. A IA interpreta números, não lê o banco.** O cálculo é SQL; o modelo
recebe um resumo agregado e devolve leitura e prioridade. Isso derruba custo,
latência e o risco de alucinar dado que não existe.

**2. Nada de dado pessoal no prompt.** Motorista vai como "Motorista A", veículo
como placa (que é dado público) — nunca CPF, CNH, telefone ou nome. O prompt sai
do país para um serviço externo; enviar o mínimo é obrigação de LGPD, não zelo.

**3. Cache diário obrigatório.** Uma análise por prefeitura por dia, guardada em
`fleet_insights`. Sem cache, o custo escala com cada F5 no dashboard — e o
conteúdo não muda de minuto em minuto.

**4. Todo insight cita o número e leva para a tela.** "O posto X está 12% acima
do preço de contrato — ver 3 abastecimentos" com link. IA que só conversa gera
desconfiança na primeira vez que erra; IA que aponta o registro é verificável.

**5. A IA sugere, nunca age.** Não aprova OS, não valida abastecimento, não
bloqueia motorista. Sugestão com link para a ação que o gestor executa.

### Gate de dados (o ponto que eu não deixaria passar)

Com 3 viagens e 7 abastecimentos, qualquer análise vira invenção convincente. A
função deve **recusar-se a opinar** abaixo de um mínimo (sugestão: 30 dias de
operação com ≥ 20 viagens e ≥ 10 abastecimentos) e, nesse caso, mostrar as
**regras determinísticas** do §2.1. Isso protege a credibilidade do recurso na
primeira impressão — que é a que fica.

### Fallback

Se o cap estourar, o modelo falhar ou o gate barrar, o card mostra o painel
determinístico. Nunca uma tela vazia nem um erro técnico.

### Custo estimado

~2 KB de entrada e ~500 tokens de saída por análise diária. Com Gemini Flash,
fica na casa de **centavos por prefeitura por mês** — cabe no cap atual.

---

## 4. Ordem sugerida

| Etapa | Entrega | Por quê primeiro |
|---|---|---|
| **A** | Corrigir os rótulos errados (#1, #2, #4), exibir `activeNow`, disponibilidade e CNH vencendo | Bug de leitura em produção; custa pouco |
| **B** | RPC `dashboard_summary` agregando no Postgres + delta % | Corrige o #7 (escala) e é pré-requisito da IA |
| **C** | Painel "Precisa da sua atenção" (regras determinísticas) | Maior valor por esforço; entrega o "alertas" que a tela já promete |
| **D** | Custo por km, km/L com desvio, motor ligado parado, top manutenção | Indicadores de decisão, sobre a RPC do B |
| **E** | Ligar a busca do header ou remover o placeholder | Pequeno, mas hoje é promessa falsa |
| **F** | IA `fleet-insights` sobre o B e o C | Camada de interpretação, com fallback pronto |
| **G** | Tempo por etapa do processo de manutenção | Depende da fase 7 alimentar os eventos |

**Recomendação:** A + B + C juntos. A IA (F) depois — ela fica muito melhor
quando existe a RPC agregada e as regras determinísticas para servir de
fallback e de base factual, e quando houver operação real para analisar.
