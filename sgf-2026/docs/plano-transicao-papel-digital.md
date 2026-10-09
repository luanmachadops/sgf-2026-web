# Plano de transição papel → digital (SGF 2026)

> Gerado em 2026-10-09 a partir de um levantamento só de leitura do painel (`sgf-2026/web`),
> do banco Supabase (`kgxdrgbxpfoebzrphtqg`) e do app do motorista (`appFrota`).
> Os prompts da seção 4 foram escritos para modelos mais baratos (Sonnet/Haiku) executarem.
> Nenhuma DDL deve ser aplicada em produção sem aprovação explícita (ver CLAUDE.md).
> Isto não é parecer jurídico: valide prazos e formatos com o controle interno e a procuradoria do município.

---

## 1. O que já está pronto (não refazer)

- Login por CPF; bloqueio de viagem por CNH vencida ou sem data (trigger `tf_trip_insert_guard`); aviso de CNH vencendo (cron diário).
- QR/placa, conflito de veículo com takeover.
- Checklist obrigatório com itens críticos (freios, pneus, luzes) que bloqueiam a viagem e geram OS.
- Km inicial e final obrigatórios **com foto**; CHECK de km final ≥ inicial; comparação km × GPS.
- GPS em segundo plano (`trip_locations`), watchdog de viagem parada, fechamento automático de viagem abandonada, movimento sem viagem (IOPGPS).
- Abastecimento completo: tipo, litros, valor, hodômetro, nº do cupom (`pump_receipt_number`), 4 fotos, aprovação do gestor, km/L calculado, anomalia de odômetro regressivo e de litros acima do tanque.
- Trilha de auditoria `activity_log` com trigger em trips, fuelings, checklists, vehicles, profiles e service_orders (quem, quando, antes/depois).
- Relatórios em PDF (com hash SHA-256 do snapshot) e XLSX; layout TCE-PR para orçamento.
- Infrações com FICI, OS com cotação/NF/pagamento, empenhos, portais de posto e oficina.

---

## 2. Lacunas — priorizadas por risco jurídico/auditoria

### P0 — sem isso, o registro digital é frágil perante TCE / controle interno

| # | Lacuna | Situação hoje | Por que importa |
|---|---|---|---|
| P0.1 | **Viagem não pode ser apagada; só cancelada/retificada com motivo** | Admin tem policy DELETE em `trips` e `checklists`; enum `trip_status` não tem `cancelada`; não há `cancel_reason`; gestor não consegue corrigir viagem pelo painel | No papel a folha rasurada fica arquivada. No digital, apagar é desaparecer a prova. É o primeiro ponto que um auditor testa |
| P0.2 | **Auditoria não pode ser expurgada e precisa de IP** | Crons `activity-log-purge` (mensal) apagam o log; sem IP/user_agent; sem tela de consulta | Documento público tem prazo de guarda (tabela de temporalidade, Lei 8.159/1991). Log apagado = trilha sem valor. IP/dispositivo foi pedido explicitamente no requisito |
| P0.3 | **Log à prova de adulteração** | Linhas do log são editáveis por quem tem acesso ao banco | Encadear hash (cada linha guarda o hash da anterior) permite provar que nada foi alterado depois |
| P0.4 | **Campos obrigatórios da viagem** | Só existe `destination` (texto único "destino/finalidade"). Faltam origem, finalidade separada e obrigatória, paradas declaradas, passageiros, carga | Finalidade pública é o campo que evita apontamento por desvio de finalidade. É o coração do formulário de papel |
| P0.5 | **Base normativa municipal** (não é código) | — | Um decreto/portaria municipal instituindo o controle eletrônico como substituto do formulário em papel, definindo quem assina e o prazo de guarda, dá validade ao registro digital (Lei 14.129/2021 – Governo Digital; Lei 14.063/2020 – assinaturas eletrônicas no poder público) |
| P0.6 | **Termo de ciência do motorista (LGPD)** | Política de privacidade existe no app, mas sem aceite registrado | Para servidor público, a base legal do rastreamento é obrigação legal/execução de política pública (LGPD art. 7º II e III, art. 23), **não consentimento**. Mesmo assim, registrar a *ciência* (data, versão do termo, dispositivo) protege a prefeitura em disputa trabalhista |

### P1 — requisitos do documento que ainda faltam

| # | Lacuna | Situação hoje |
|---|---|---|
| P1.1 | **Offline-first no app** | Inexistente. Viagem não inicia sem rede; lote de GPS é perdido em falha. Há só a proposta em `docs/arquitetura-app-offline-ibutton.md`. É o maior trabalho e o maior risco de adesão (zona rural, transporte escolar) |
| P1.2 | **Checklist completo** | Sem nível de combustível, estepe, itens de segurança (triângulo, macaco, chave de roda, cintos), avarias com descrição e foto |
| P1.3 | **NF no app** | Painel tem `pump_receipt_number`, mas o app não pede. Sugestão: campo de nº + opção de ler o QR da NFC-e (chave de 44 dígitos), o que permite cruzar com a nota real |
| P1.4 | **Alerta de salto de km entre viagens** | Só existe km regressivo no abastecimento. Falta comparar `end_odometer` da última viagem com `start_odometer` da próxima (km "rodado sem registro") |
| P1.5 | **Uso fora do expediente / fim de semana / feriado** | Nada. Só `profiles.shift_start/end` sem regra. Falta: expediente por tenant/secretaria, calendário de feriados, tabela de autorização prévia, alerta |
| P1.6 | **Consumo anômalo por média do veículo** | Hoje só tanque > capacidade. Falta km/L abaixo de X% da média móvel do veículo |
| P1.7 | **Prestação de contas** | Falta filtro por condutor, CSV, QR de verificação no PDF (página pública que confere o hash), assinatura eletrônica do responsável e o relatório "mapa mensal de uso do veículo" (o equivalente digital da folha de papel, por veículo/mês) |
| P1.8 | **Manutenção preventiva por km/tempo** | Inexistente (`maintenances` morta, `preventiveCompliance` fixo em 0) |
| P1.9 | **Frota própria × locada × cedida, contrato de locação, centro de custo** | Inexistente |

### P2 — robustez e anti-fraude

| # | Lacuna |
|---|---|
| P2.1 | Hora do servidor junto com a hora do aparelho em início/fim de viagem e pontos GPS (o aparelho pode estar com o relógio alterado) |
| P2.2 | Detecção de GPS falso (`mocked` no Android) marcada na viagem |
| P2.3 | Login por matrícula (além de CPF) |
| P2.4 | Aviso de CNH vencida já no login (hoje só bloqueia ao iniciar viagem) |
| P2.5 | Atendimento ao titular LGPD: exportar os dados de um motorista |
| P2.6 | Lançamento retroativo das folhas de papel do período de transição (`trips.is_retroactive` e `justification` existem mas sem UI) |

---

## 3. Ordem de execução sugerida

1. **Semana 1 — P0.1, P0.2, P0.3** (só banco + painel; sem mexer no app). É o que torna o sistema defensável.
2. **Semana 2 — P0.4 + P1.2 + P1.3** (campos novos no banco, app e painel juntos, num release do app).
3. **Semana 3 — P1.4, P1.5, P1.6** (alertas no banco + tela de autorização prévia).
4. **Semana 4 — P1.7, P2.6** (relatórios e lançamento retroativo para a transição).
5. **Em paralelo, com mais tempo — P1.1 offline** (projeto próprio, seguir o doc de arquitetura).
6. **Depois — P1.8, P1.9, P2.x.**
7. **Fora do código (P0.5, P0.6)**: minuta de decreto, termo de ciência, 30–60 dias de operação paralela papel + app, treinamento com os motoristas.

---

## 4. Prompts prontos para execução

Regras comuns (cole no início de qualquer prompt):

> Leia `CLAUDE.md` e `sgf-2026/PRODUCAO.md`. Migrations: crie o arquivo em `sgf-2026/supabase/migrations/` mas **não aplique em produção**; me mostre o SQL e espere aprovação. Respeite RLS/multi-tenant (`get_user_tenant_id()`). Depois de mudar o schema, regenere `database.types.ts` com o comando do CLAUDE.md. Rode `npx tsc --noEmit -p tsconfig.app.json` em `sgf-2026/web`. Não commite sem eu pedir. Responda em pt-BR.

### Prompt A — P0.1 Viagem imutável (modelo: Sonnet)

```
Objetivo: viagem nunca é apagada; passa a ser cancelada ou retificada com motivo.
Banco (migration nova):
- adicionar 'cancelada' ao enum trip_status;
- trips: cancelled_at, cancelled_by (uuid profiles), cancel_reason (text, obrigatório quando status='cancelada', CHECK com length>=10);
- remover as policies DELETE de trips e checklists (trips_admin_delete e a parte de DELETE de active_session_delete — antes, leia o qual/using de active_session_delete e me diga o que ela faz) e criar trigger BEFORE DELETE que levanta exceção em trips, checklists, checklist_items, fuelings e trip_locations;
- tabela trip_corrections (id, tenant_id, trip_id, field, old_value, new_value, reason NOT NULL, corrected_by, corrected_at default now()) com RLS de tenant, sem UPDATE/DELETE;
- RPCs SECURITY DEFINER manager_cancel_trip(trip_id, reason) e manager_correct_trip(trip_id, patch jsonb, reason) restritas a admin/gestor do mesmo tenant; a correção grava em trip_corrections e só então atualiza trips (campos permitidos: start_odometer, end_odometer, destination, start_at, end_at e os novos de finalidade quando existirem).
Painel: em TripDetailsModal, botões "Cancelar viagem" e "Retificar" (modal com motivo obrigatório), histórico de retificações visível, badge "Cancelada" em Trips.tsx e exclusão de canceladas das somas de km dos relatórios (reportData.ts).
```

### Prompt B — P0.2 + P0.3 Auditoria permanente (modelo: Sonnet)

```
Objetivo: activity_log permanente, com IP e encadeamento de hash, e tela de consulta.
1. Leia a função activity_log_purge, a tabela activity_log_retention e os crons activity-log-purge e activity-log-purge-warning. Proponha (sem aplicar) desligar o purge para entity_type de frota (trips, fuelings, checklists, vehicles, service_orders, trip_corrections) — manter purge só para ruído, se houver. Explique o que cada cron apaga hoje.
2. activity_log: colunas ip inet, user_agent text, prev_hash text, row_hash text. Em tf_activity_log, ler IP e user-agent de current_setting('request.headers', true)::json (x-forwarded-for, primeiro IP; user-agent), tolerando nulo. row_hash = sha256(prev_hash || tenant_id || entity_type || entity_id || action || changes::text || created_at) com prev_hash = row_hash da última linha do mesmo tenant (usar lock por tenant com pg_advisory_xact_lock para não quebrar a cadeia).
3. Bloquear UPDATE/DELETE em activity_log por trigger (exceto o purge permitido, se mantido).
4. RPC verify_activity_chain(tenant_id, from, to) que recalcula e devolve a primeira linha divergente.
5. Painel: página "Auditoria" (só admin/gestor) com filtros por período, entidade, usuário e ação; mostra antes/depois, IP e um botão "Verificar integridade". Adicionar rota em App.tsx e item no Sidebar.
```

### Prompt C — P0.4 + P1.2 + P1.3 Campos de viagem, checklist e NF (modelo: Sonnet; dois repos)

```
Parte 1 — banco (AppFrota-web):
- trips: origin text, purpose text (finalidade pública), purpose_category (enum: saude, educacao, transporte_escolar, obras, administrativo, assistencia_social, outro), passengers jsonb (lista {nome, documento opcional} ou contagem), passenger_count int, cargo_description text.
- trip_stops (id, tenant_id, trip_id, seq, description, lat, lng, arrived_at, left_at, source 'declarada'|'gps') com RLS.
- Em tf_trip_insert_guard: exigir origin e purpose (length >= 10) apenas quando a viagem for criada por app com versão nova — use uma flag em tenants (require_trip_purpose boolean default false) para ligar por prefeitura sem quebrar o app antigo.
- checklists: fuel_level (enum vazio, 1/4, 1/2, 3/4, cheio), spare_tire_ok bool, safety_items jsonb (triangulo, macaco, chave_roda, cintos); checklist_items: damage_description text, photo_urls text[].
- fuelings: invoice_number text, nfce_access_key char(44) com CHECK de 44 dígitos.
Parte 2 — painel: mostrar todos esses campos em TripDetailsModal, no detalhe de checklist e no RefuelingDetailsModal; incluir nos relatórios.
Parte 3 — app (/Users/luanmachado/Documents/DEV/appFrota, ler o CLAUDE.md dele): em start-trip.tsx pedir origem (pré-preenchida pelo GPS/endereço da secretaria), finalidade (categoria + texto), passageiros e carga; botão "registrar parada" durante a viagem gravando em trip_stops; no checklist.tsx adicionar combustível, estepe, itens de segurança e foto obrigatória quando item estiver em "atenção"; em fuel.tsx campo nº da NF e leitura do QR da NFC-e extraindo a chave de 44 dígitos.
Faça Parte 1, pare e me mostre o SQL antes de seguir.
```

### Prompt D — P1.4, P1.5, P1.6 Alertas (modelo: Sonnet)

```
1. Salto de km: trigger AFTER INSERT em trips compara start_odometer com o end_odometer da última viagem concluída do mesmo veículo. Se diferença > tenants.km_gap_tolerance (default 5 km) gera notification para gestores ("X km sem registro entre viagens") e grava trips.odometer_gap_km. Se negativo, marca anomalia.
2. Expediente: tabelas work_schedules (tenant_id, department_id null = padrão do tenant, weekday 0-6, start_time, end_time), holidays (tenant_id, date, description) e off_hours_authorizations (tenant_id, vehicle_id, driver_id null, valid_from, valid_to, reason, authorized_by). Trigger em trips: se start_at fora do expediente aplicável, fim de semana ou feriado, e sem autorização vigente, marcar trips.off_hours=true e notificar. Não bloquear a viagem (emergências).
3. Consumo anômalo: em fuelings, comparar km_per_liter com a média dos últimos 5 abastecimentos com tanque cheio do veículo; se < (100 - tenants.consumption_tolerance_pct, default 25)% da média, has_anomaly=true, anomaly_type='consumo_baixo'.
4. Painel: tela em Configurações para expediente, feriados e tolerâncias; página/aba "Autorizações fora do horário" (criar, listar, revogar com motivo); os três alertas aparecem em get_dashboard_alerts e com badge em Trips/Refuelings.
```

### Prompt E — P1.7 + P2.6 Prestação de contas e transição (modelo: Sonnet)

```
1. reportData.ts: filtro por condutor; exportação CSV (UTF-8 com BOM, separador ;) para todos os relatórios.
2. Relatório novo "Mapa mensal de uso do veículo": por veículo e mês, uma linha por viagem com nº, data/hora saída e chegada, km inicial/final/rodado, origem, paradas, destino, finalidade, condutor (nome, matrícula, CNH), passageiros, abastecimentos do período (litros, valor, NF, km/L) e totais; rodapé com campos de assinatura do condutor-responsável e do gestor.
3. PDF: QR code apontando para uma rota pública /verificar/:hash (serverless em web/api, sem login) que confirma se o hash existe e quando foi gerado; gravar o snapshot e o hash numa tabela report_snapshots imutável.
4. Lançamento retroativo: modal no painel para o gestor lançar viagens das folhas de papel (is_retroactive=true, justification obrigatória, foto/scan da folha anexada em documentos via docStorage.ts), destacadas nos relatórios como "lançamento retroativo".
Pesquise antes (Haiku pode fazer) se o TCE do estado do cliente publica leiaute obrigatório para frota; se não houver, mantenha o mapa mensal como padrão.
```

### Prompt F — P1.1 Offline-first no app (modelo: Opus para o desenho, depois Sonnet para implementar)

```
Leia sgf-2026/docs/arquitetura-app-offline-ibutton.md e o app em /Users/luanmachado/Documents/DEV/appFrota. Proponha a implementação mínima de offline: fila persistente (expo-sqlite) para start_trip, end_trip, checklist, trip_locations, fotos e fuelings; ids gerados no aparelho (uuid) para idempotência; sincronização em ordem ao reconectar; client_created_at + server received_at; conflitos (veículo já em uso, CNH vencida) resolvidos no servidor e devolvidos ao motorista. Liste mudanças no banco (RPCs idempotentes) e no app, em etapas entregáveis. Não implemente até eu aprovar.
```

### Prompt G — P1.8, P1.9, P2.x (modelo: Sonnet; Haiku para P2.3/P2.4)

```
1. Preventiva: maintenance_plans (tenant_id, vehicle_id ou category, service_type, interval_km, interval_days, last_done_km, last_done_at); job diário que gera alerta e, opcionalmente, service_order 'preventiva' quando faltar 10% do intervalo; ao concluir OS preventiva, atualizar last_done. Substitui o preventiveCompliance fixo em 0.
2. Frota: vehicles.ownership (proprio, locado, cedido, comodato), vehicle_rental_contracts (fornecedor, número, vigência, valor mensal, franquia de km), cost_centers (tenant_id, código, nome, department_id) e vehicles.cost_center_id; filtros nos relatórios.
3. App: hora do servidor (default now() em colunas server_received_at) e flag is_mocked em trip_locations/trips a partir de location.mocked no Android; login por matrícula (resolver matrícula → e-mail interno como já é feito com CPF em src/lib/auth.tsx); aviso de CNH vencida logo após o login.
```

---

## 5. Itens não-código para a prefeitura

- **Decreto/portaria** instituindo o controle eletrônico de frota, revogando o formulário de papel, definindo responsáveis (motorista registra, chefe de setor valida, gestor de frota fecha o mês) e prazo de guarda dos registros.
- **Termo de ciência** do motorista sobre rastreamento e uso dos dados (versão registrada no app).
- **Operação paralela** de 30–60 dias (papel + app) por secretaria piloto; comparar os dois registros antes de abandonar o papel.
- **Encarregado de dados (DPO)** da prefeitura informado e o tratamento incluído no inventário LGPD do município.
- **Confirmar com o controle interno/TCE** o formato de prestação de contas e o prazo de retenção antes de definir a política final do `activity_log`.
