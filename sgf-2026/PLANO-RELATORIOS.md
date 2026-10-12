# Plano — Relatórios (impressão, tabelas, design e catálogo)

> Status: **plano**, nada implementado.
> Base: leitura de `web/src/pages/Reports.tsx`, `components/reports/ReportViewerModal.tsx`,
> `lib/reportExport.ts` (motor de PDF/Excel) e `lib/reportData.ts` (14 datasets),
> e do schema em `web/src/types/database.types.ts`, em 2026-10-12.

---

## 1. Por que a impressão fica minúscula (causa raiz)

O problema não é a fonte escolhida: é o motor de impressão que **encolhe a
tabela inteira** para caber na folha.

| # | Defeito | Onde | Efeito |
|---|---|---|---|
| 1 | A largura de cada coluna é fixa em px (`minWidth`, 85–300px) e somada. A tabela recebe `zoom = largura disponível / largura total` (700px retrato, 1000px paisagem) | `reportExport.ts:331-334, 378` | 14 colunas ≈ 1.700px → zoom 0,41 em retrato. A "fonte 9px" vira ~3,7px impressos |
| 2 | O seletor "Fonte" (7–13px) não tem piso real — o zoom aplica depois | `reportExport.ts:378` | O usuário aumenta a fonte e a tabela encolhe de novo |
| 3 | Linhas por página são **chutadas** (24 retrato / 30 paisagem ± ajuste) em vez de medidas | `reportExport.ts:265-271` | Descrição longa quebra linha → página estoura e corta, ou sobra meia folha em branco |
| 4 | Orientação padrão é **retrato** para todo relatório, inclusive os de 14 colunas | `ReportViewerModal.tsx:308` | O caso pior é o padrão |
| 5 | Colunas de UUID com 280px no relatório de legado (`Fornecedor`, `Veículo`, `Registro legado`) | `reportData.ts:1299-1306` | Coluna larga mostrando `3f2a…` — ocupa espaço e não informa nada |
| 6 | Só o 1º gráfico vai para o PDF; a tela mostra 2 | `reportExport.ts:312` | Tela e impresso divergem |
| 7 | Excel grava datas como **texto** (`fmtDate` já formata antes) | `reportData.ts` (todos) | Não ordena nem filtra por data no Excel |
| 8 | Sem linha de **totais** na tabela (só nos KPIs) | todos | Relatório oficial sem "Total geral" no rodapé da tabela |
| 9 | `departmentAggregates` baixa **todos** os abastecimentos (sem filtro de data) e filtra no navegador | `reportData.ts:373-381` | Cresce com o histórico; mesma classe de problema do Dashboard #7 |

---

## 2. Solução proposta para tabelas largas

Regra de ouro: **a fonte impressa nunca fica abaixo de 8pt.** Se não cabe, o
sistema muda o *layout*, não o tamanho da letra.

### 2.1 Novo modelo de coluna

```ts
interface ReportColumn {
  key: string;
  label: string;            // cabeçalho completo (tela/Excel)
  shortLabel?: string;      // cabeçalho curto para impressão ("Preço unit.")
  format?: 'text'|'integer'|'decimal'|'currency'|'percent'|'date'|'datetime';
  align?: 'left'|'right'|'center';
  priority: 1 | 2 | 3;      // 1 = essencial (sempre impresso), 3 = só Excel por padrão
  width: number;            // largura em mm na impressão (não px)
  wrap?: boolean;           // texto longo pode quebrar linha (descrição, destino)
  stackUnder?: string;      // imprime como 2ª linha da coluna indicada (ex.: modelo sob placa)
  total?: 'sum' | 'avg' | 'count';   // entra na linha de totais
}
```

Datas passam a ser `Date`/ISO no dataset e são formatadas só na saída
(corrige o #7 do Excel).

### 2.2 Algoritmo de encaixe (antes de imprimir)

1. Largura útil: retrato **190mm**, paisagem **277mm** (A4, margens 10mm).
2. Soma as larguras das colunas visíveis.
3. Se não cabe em retrato → **muda para paisagem automaticamente** (o usuário
   ainda pode forçar).
4. Se não cabe em paisagem → **empilha** colunas com `stackUnder`
   (placa + modelo numa célula, motorista + secretaria noutra). Ganha 30–40%.
5. Se ainda não cabe → oferece duas saídas explícitas, nunca zoom:
   - **Remover colunas de prioridade 3** (um clique, mostra quais);
   - **Dividir em blocos de colunas** (paginação horizontal): as colunas-chave
     (data/placa) se repetem em cada bloco, como "Imprimir títulos" do Excel.
6. Excel continua sempre com **todas** as colunas — é o formato para dado largo.

Na tela, um **medidor de encaixe** mostra o estado em tempo real:
`✓ Cabe em A4 retrato` · `↻ Paisagem automática` · `⚠ 118% da folha — remova 2 colunas ou divida em blocos`.

### 2.3 Requisito: PDF vetorial e leve (vale para todo PDF do sistema)

Regra: **nada vira bitmap a não ser foto de verdade.**

- **Texto:** texto real do PDF (selecionável, pesquisável, copiável), nunca
  desenho do texto.
- **Tabelas, linhas, fundos e gráficos:** desenhados como vetor (retângulos,
  linhas, arcos). Proibido `html2canvas`, `canvas.toDataURL` ou imagem de
  gráfico do Recharts.
- **Fontes:** as fontes padrão do PDF (Helvetica, já usada em `ficiPdf.ts` e
  `pdfDossierBuilder.ts`) pesam **0 KB**, porque não são embutidas, e a
  codificação WinAnsi cobre todos os acentos do português. Para usar Inter,
  embutir **só os caracteres usados** (subset via `@pdf-lib/fontkit`,
  `subset: true`), o que dá ~20–40 KB em vez de ~300 KB.
- **Brasão e logo:** em SVG, desenhar como vetor. Em PNG/JPG, embutir **uma
  vez** e reaproveitar em todas as páginas, reduzido a ~300 dpi no tamanho
  impresso (brasão de 20mm ≈ 240px).
- **QR Code:** em vetor (módulos como retângulos), nunca PNG.
- **Fotos** (dossiê, comprovantes): continuam imagem, mas reduzidas a ~150–200
  dpi no tamanho impresso e em JPEG ~0,8.
- **PDF anexado** (NF, empenho): copiado com `copyPages`, sem rasterizar, como
  já é feito hoje.
- **Meta de tamanho:** relatório de 10 páginas só com texto e tabelas abaixo de
  **150 KB**. Teste automatizado: gera o PDF, confere que não há imagem fora
  do brasão e que o texto é extraível.

### 2.4 Paginação real e gerador de PDF

Hoje o HTML adivinha quantas linhas cabem. Opções (**decisão D1**):

| | A) pdf-lib + motor de tabela próprio (recomendado) | B) jsPDF + jspdf-autotable | C) HTML medido + imprimir do navegador |
|---|---|---|---|
| Saída | Arquivo PDF de verdade | Arquivo PDF de verdade | Diálogo de impressão; o resultado depende do navegador e da impressora escolhida |
| Vetorial | Sim, controle total | Sim | Sim no "Salvar como PDF" do Chrome; alguns drivers de impressora rasterizam |
| Peso | Mínimo: fontes padrão sem embutir ou subset; já é dependência do projeto | +~350 KB no app; fonte customizada embutida quase inteira | Depende do navegador |
| Paginação horizontal | Implementação nossa (o `layout.ts` já calcula os blocos) | Nativa | Implementação nossa |
| Esforço | Maior: desenhar tabela, quebra de linha e gráficos | Menor | Médio |

Recomendação: **A**. O `pdf-lib` já está no projeto (FICI e dossiê), gera o
arquivo mais leve e dá controle total de que nada vira bitmap. O algoritmo
de encaixe (§2.2) já mede larguras em mm, então desenhar a tabela é a parte
que falta. O botão vira "Baixar PDF" + "Imprimir" (que abre o próprio PDF).

### 2.5 O que muda no papel

- Cabeçalho institucional só na **1ª página**; nas seguintes, faixa fina
  (brasão pequeno + título + "continuação"). Hoje o cabeçalho cheio se repete
  em todas as folhas e rouba ~25% da área útil.
- Cabeçalho da tabela **cinza-claro com texto escuro** (hoje é faixa escura
  cheia — gasta toner e piora a leitura em impressora P&B).
- Linha de **totais** ao fim da tabela e **subtotais por grupo** (por veículo,
  secretaria, posto) quando o relatório for agrupado.
- **Bloco de assinaturas** opcional (Responsável pela frota / Secretário /
  Controle interno), com nome e cargo — documento de prestação de contas.
- **Código de verificação** no rodapé (hash curto do conteúdo + data/hora +
  usuário emissor), aproveitando a trilha de auditoria existente.
- Números com `tabular-nums`, alinhados à direita; status como texto
  (badges coloridas só na tela).

---

## 3. Design da tela do relatório (visualizador)

| Hoje | Proposta |
|---|---|
| Tabela "solta" numa página longa | **Pré-visualização em folha A4** (retrato/paisagem) com quebras de página visíveis — o que se vê é o que imprime |
| "Personalizar" esconde campos, orientação, fonte e % de coluna (sliders técnicos) | Painel lateral "Layout de impressão": campos agrupados por prioridade, arrastar para reordenar, medidor de encaixe, orientação automática. Some o slider de % de coluna |
| Sem ordenação | Clique no cabeçalho ordena (tela e exportação) |
| Sem totais | Linha de totais fixa no rodapé da tabela |
| Sem agrupamento | "Agrupar por" (veículo, secretaria, posto, oficina, motorista) com subtotais |
| Configuração se perde ao fechar | **Modelos salvos** por relatório ("Prestação de contas mensal", "Conferência do posto") — localStorage na v1; tabela por tenant se quiserem compartilhar (decisão D3) |
| Catálogo: 14 cards iguais em grade | Catálogo por **assunto** (Frota, Uso e viagens, Combustível, Manutenção, Pessoas, Fiscal/Licitações, Controle interno), com "o que este relatório responde" e últimos usados |
| KPIs da página de Relatórios repetem o Dashboard | Remover os 4 KPIs do topo; o espaço vai para "Relatórios recentes / modelos salvos" |

Tudo em Tailwind + componentes `SGF*`, sem biblioteca de UI. Cores de marca
via `--sgf-*` (white-label); semânticas fixas.

---

## 4. Revisão do catálogo — o que faz sentido ter

Critério: cada relatório deve responder **uma pergunta que o gestor, o
controle interno ou o Tribunal de Contas faz**. Hoje há sobreposição (3
relatórios saem da mesma agregação) e faltam os documentos clássicos de frota
pública.

### 4.1 Manter (reconstruídos no motor novo)

| Atual | Ajuste |
|---|---|
| Resumo da Frota | Vira **Cadastro da frota**: + tipo, ano, combustível, RENAVAM, código interno, vencimento do seguro. Prioridades: placa/modelo/secretaria/status = 1 |
| Consumo de Combustível | Mantém (lançamentos). Agrupável por veículo com subtotais |
| Histórico de Manutenções | + **dias parado na oficina** (`at_shop_at` → `completed_at`), prioridade, origem (checklist/manual) |
| Infrações de Trânsito | + AIT, código, prazo de indicação, vencimento; destaque de prazo vencido |
| Fechamento por Posto, Fechamento Fiscal dos Postos, Manutenções por Oficina, Conciliação Fiscal das Licitações | Mantêm o conteúdo (fiscal, já validado). Só ganham o motor novo, prioridades e totais |

### 4.2 Fundir

| Atuais | Novo |
|---|---|
| Análise de Custos + Uso por Secretaria + Relatório de Eficiência (os três saem de `departmentAggregates`) | **Consolidado por secretaria**: veículos, viagens, km, combustível, manutenção, multas, custo total, **R$/km**, disponibilidade (rotulada "situação na emissão"). Uma tabela, não três |
| Desempenho de Motoristas | **Motoristas: atividade e habilitação** — viagens, km, infrações, pontos, categoria e validade da CNH. A "pontuação" atual é snapshot do cadastro e hoje é apresentada como desempenho do período |

### 4.3 Mover

- **Fila de Conciliação do Legado** é uma *fila de trabalho* (tem botão
  "Conciliar"), não um relatório. Vai para Licitações; o relatório fica só
  como versão impressa, **com nomes** de fornecedor/veículo em vez de UUID.

### 4.4 Novos (dados já existem no banco)

| Relatório | Pergunta que responde | Fonte |
|---|---|---|
| **Boletim de tráfego / controle de uso do veículo** | "Quem usou o veículo X, quando, de onde para onde, com que km e para quê?" — é o documento mais cobrado em auditoria de frota municipal | `trips`: `start_at`, `end_at`, `start_odometer`, `end_odometer`, `origin`, `destination`, `purpose`, `passenger_count`, motorista. Agrupado por veículo, com subtotal de km e assinaturas |
| **Custo por veículo** | "Quanto cada veículo custa por km e quais saem mais caros?" | combustível + manutenção + multas ÷ km do período |
| **Vencimentos** | "O que vence nos próximos 30/60/90 dias?" | `profiles.cnh_expiry`, `vehicles.insurance_expiry`, `vehicle_documents.expires_at`, contratos de postos/oficinas |
| **Abastecimentos com anomalia** | "Onde pode haver erro ou desvio de combustível?" | `fuelings.has_anomaly/anomaly_type`, consumo fora da média do veículo, abastecimento acima da capacidade do tanque (`tank_capacity`) |
| **Checklists e itens reprovados** | "Quais veículos estão sendo liberados com problema recorrente?" | `checklists` + `checklist_items.state`, OS geradas |
| **Veículos ociosos** | "Que veículos não rodaram no período?" (base para remanejar ou leiloar) | veículos sem viagem encerrada no período (seção do Custo por veículo ou relatório próprio — decisão D4) |

Resultado: **14 → 15 relatórios**, mas sem duplicatas e cobrindo uso,
custo, controle e fiscal. Etiquetas QR seguem como ferramenta à parte.

---

## 5. Arquitetura do código

```
web/src/lib/reports/
├── types.ts            # ReportColumn (novo), ReportDefinition, ReportDataset
├── registry.ts         # catálogo: id, título, assunto, pergunta, fetcher, presets
├── datasets/           # um arquivo por relatório (hoje é um reportData.ts de 1.360 linhas)
├── layout.ts           # algoritmo de encaixe (§2.2) — puro, testável
├── pdf.ts              # gerador PDF vetorial (pdf-lib): tabela, gráficos, brasão, QR
└── excel.ts            # ExcelJS (datas reais, totais com fórmula SUM, grupos)
web/src/components/reports/
├── ReportCatalog.tsx
├── ReportViewer.tsx    # substitui ReportViewerModal
├── ReportPagePreview.tsx
├── ReportTable.tsx     # ordenação, grupos, totais, colunas empilhadas
└── PrintLayoutPanel.tsx
```

- O catálogo deixa de ter dois mapas paralelos (`reports` em `Reports.tsx` +
  `contextKeyByReport` + `FETCHERS`) e passa a ter **um registro único**.
- Agregações pesadas (consolidado por secretaria, custo por veículo) vão para
  **RPCs no Postgres** respeitando RLS (decisão D2 — DDL exige aprovação).
- `layout.ts` ganha teste em `sgf-2026/tests/` (há `parana-report.test.mjs`
  como precedente): 14 colunas → paisagem; 20 colunas → empilha/blocos; fonte
  nunca < 8pt.

---

## 6. Fases

| Fase | Entrega | Depende de |
|---|---|---|
| **F1 — Motor de impressão** | Novo `ReportColumn`, algoritmo de encaixe, piso de 8pt, paisagem automática, empilhamento, paginação real, totais, cabeçalho só na 1ª página. Aplica aos 14 relatórios atuais sem mudar o conteúdo. **Resolve a reclamação principal** | D1 |
| **F2 — Visualizador** | Pré-visualização em folha, painel de layout com medidor, ordenação, agrupamento/subtotais, modelos salvos, catálogo por assunto | F1 |
| **F3 — Revisão do catálogo** | Fusões (§4.2), mover fila de legado, nomes no lugar de UUID, Excel com datas reais | F1 |
| **F4 — Novos relatórios** | Boletim de tráfego primeiro; depois Custo por veículo, Vencimentos, Anomalias, Checklists | F1, D2 |
| **F5 — Documento oficial** | Bloco de assinaturas, código de verificação | F1, D5 |
| **F6 — Outros PDFs do sistema** | Etiquetas QR em vetor (hoje PNG, `QrLabelGenerator.tsx:31`); dossiê de manutenção reduzindo fotos ao tamanho impresso (hoje embute na resolução original, `pdfDossierBuilder.ts:47-59`); impressão do detalhe de abastecimento (`RefuelingDetailsModal.tsx:370`, hoje imprime a tela do app) vira PDF próprio | F1 |

Cada fase fecha com `npx tsc --noEmit -p tsconfig.app.json`, os testes de
`sgf-2026/tests/` e conferência visual do PDF em retrato e paisagem com o
relatório mais largo (Conciliação Fiscal, 18 colunas).

---

## 7. Decisões pendentes

| # | Decisão | Recomendação |
|---|---|---|
| D1 | Gerador de PDF: pdf-lib próprio, jsPDF + autotable ou impressão HTML medida | pdf-lib (vetorial, mais leve, já no projeto) |
| D2 | Mover agregações para RPCs no Postgres (DDL em produção) | Sim, a partir da F4 |
| D3 | Modelos de layout salvos por usuário (localStorage) ou compartilhados por prefeitura (tabela nova) | localStorage na v1 |
| D4 | Veículos ociosos como relatório próprio ou seção do Custo por veículo | Seção do Custo por veículo |
| D5 | Assinaturas: quais cargos por padrão e se ficam configuráveis em Configurações | Configurável, padrão "Responsável pela frota" + "Secretário(a)" |
| D6 | Fusão dos 3 relatórios por secretaria — algum deles é usado isoladamente por alguma prefeitura? | Fundir |
