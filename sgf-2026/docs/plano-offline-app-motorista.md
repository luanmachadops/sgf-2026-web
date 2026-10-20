# Plano de implementação — modo offline do app do motorista

**Data:** 19/10/2026
**Escopo:** app do motorista (`appFrota`, Expo SDK 54 / React Native 0.81) + banco Supabase (`kgxdrgbxpfoebzrphtqg`).
**Substitui, como plano de execução:** `arquitetura-app-offline-ibutton.md` (02/10). Aquele documento continua
útil como referência de cenários de teste e da integração com iButton/rastreador, mas este é o plano a seguir.

> Nada deste plano foi implementado. Toda mudança de schema (fase 2) precisa de aprovação explícita antes
> de ser aplicada em produção.

---

## 1. Objetivo

O motorista precisa conseguir, **sem internet no celular**:

- abrir o app e ver seus dados, o veículo, os veículos da prefeitura, os postos e o histórico recente;
- fazer o checklist, iniciar e encerrar a viagem e registrar ocorrência, com fotos;
- ter tudo isso enviado sozinho, **sem duplicar e sem perder nada**, quando a conexão voltar;
- receber do servidor as mudanças (veículo novo, aprovação de abastecimento, O.S., notificações) sempre
  que houver conexão.

E isso **sem abrir brecha de segurança**: offline não pode virar um jeito de forjar viagem,
de ver dados de outra prefeitura ou de continuar usando o app depois de bloqueado.

### Abastecimento é sempre online

**Decisão do produto:** o abastecimento acontece na estrutura do posto, que terá um roteador para os
motoristas. Por isso o abastecimento **só pode ser concluído com conexão** — ele não entra na fila offline.

Isso também é o mais seguro: o abastecimento é a operação com maior risco de fraude (valor, litros,
autorização com prazo), e exigir rede garante que autorização, saldo/empenho, validade e conferência do
posto sejam checados **no momento** pelo servidor, sem registros retroativos.

Ver §6.5 para as regras do fluxo e da rede do posto.

## 2. Situação atual (verificada no código e no banco em 19/10/2026)

### App

| Área | Como está | Efeito sem sinal |
|---|---|---|
| Leituras | `requestCache.ts`: cache em memória, TTL de segundos | App reaberto sem rede fica vazio |
| Escritas | `startTrip`, `endTrip`, `saveChecklist`, `createFueling`, `createIssue`, `completeFuelAuthorization` em `data.ts` gravam direto no Supabase | Erro; o motorista fica travado |
| Fotos | `uploadQueue.ts`: fila em memória, 3 tentativas | Foto perdida se o app fechar ou as tentativas acabarem |
| GPS | `persistLocations` em `location.ts` faz `insert` e, se falhar, só `console.warn` | **Pontos de trajeto descartados** |
| Rede | Sem detecção (NetInfo não instalado) | O app não sabe quando a conexão volta |
| Sessão | Tokens em SecureStore, em pedaços — **bom, manter** | — |
| Biometria | `BiometricGate` já existe — **reaproveitar** | — |
| Backup Android | `allowBackup=false` + regras de extração — **bom** | — |
| OTA | `expo-updates` ativo **sem assinatura de código** | Risco: ver §5.9 |
| Logs | 88 `console.log/warn` em `app/` e `src/` | Risco de dado pessoal em log |

### Banco (o que o offline precisa respeitar)

| Mecanismo | Onde | Impacto no offline |
|---|---|---|
| Sessão única ativa | Políticas **RESTRICTIVE** `active_session_*` → `sgf_private.session_allowed()` (bloqueio, status do motorista, tenant suspenso, revogação de sessão) | Ótimo para segurança. Uma fila que tenta enviar com sessão revogada **vai falhar** — o app precisa tratar "precisa entrar de novo" sem perder os dados |
| RLS por dono | `trips/fuelings/checklists/issues/trip_locations`: `auth.uid() = driver_id` | Manter. O envio offline continua sob a identidade do motorista |
| Trava de início de viagem | `tf_trip_insert_guard` usa `now()` (CNH, status, checklist **de hoje**) | Uma viagem iniciada ontem offline e enviada hoje é avaliada com a data errada |
| Viagem retroativa | `tf_trip_retroactive_only_by_rpc`: só gestor | O envio offline não pode usar esse caminho; precisa de contrato próprio |
| Fim de viagem | `tf_trip_server_end_time` grava `server_ended_at = now()` | Bom: dá para guardar a hora do aparelho em `end_at` e a do servidor separada |
| Encerramento automático | `auto_close_abandoned_trips` (24 h sem atividade) e `trip_stale_after_hours = 6` | Motorista offline por muito tempo pode ter a viagem fechada pelo servidor antes do "encerrar" chegar |
| Bucket `fotos` | **Privado**, escopo por prefeitura (`tenant/<id>/...`), sem sobrescrita pelo motorista | Bom. Hoje qualquer usuário da prefeitura lê qualquer foto da prefeitura (ver §5.6) |
| `updated_at` | Ausente em `vehicles`, `trips`, `fuelings`, `checklists`, `service_orders`, `profiles` | Sem isso não há sincronização incremental confiável |

> Observação: o `CLAUDE.md` ainda descreve o bucket `fotos` como público. No banco ele está privado.

## 3. Decisão de arquitetura

**Offline-first com banco local e fila de envio, implementado no próprio app (sem serviço terceiro de sync).**

```
 Telas ──► Repositório local (SQLite criptografado) ◄── Pull (servidor → app)
                    │
                    └──► Outbox (fila persistente) ──► Push (app → servidor) ──► RPCs idempotentes
                                                                            └──► Storage (fotos)
```

- As telas **só leem e escrevem no banco local**. Nunca mais chamam `supabase.from(...).insert` diretamente.
- Um **motor de sincronização** separado faz o "pull" (baixar) e o "push" (enviar).
- O servidor continua sendo a **fonte da verdade e o juiz**: o app propõe fatos, o servidor valida e aceita,
  aceita com ressalva ("precisa revisão") ou rejeita com motivo.

### Por que não PowerSync / WatermelonDB / Realm

| Opção | Motivo para não usar agora |
|---|---|
| PowerSync | Bom produto, mas é mais um serviço com acesso aos dados das prefeituras (contrato, LGPD, custo) e as escritas continuam exigindo RPCs idempotentes próprias. O ganho é pequeno porque o motorista quase só **cria** registros |
| WatermelonDB | Exige adaptar o backend ao protocolo dele; criptografia não é nativa |
| Realm / Atlas Device Sync | Descontinuado pela MongoDB |

Se no futuro o gestor também precisar trabalhar offline com edição concorrente, reavaliar PowerSync.

### Bibliotecas

| Função | Biblioteca | Observação |
|---|---|---|
| Banco local | `expo-sqlite` com **SQLCipher** (`useSQLCipher: true` no plugin) | Exige build nativo (já é o caso) |
| Chave do banco | `expo-secure-store`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | Não vai para backup nem para outro aparelho |
| Rede | `@react-native-community/netinfo` | Só como gatilho; "tem rede" ≠ "servidor alcançável" |
| Segundo plano | `expo-background-task` (substituto do `background-fetch` no SDK 53+) | Oportunístico; o iOS decide quando roda |
| Hash de foto | `expo-crypto` | SHA-256 do arquivo comprimido |
| Arquivos | `expo-file-system` (pasta do app, não cache) | — |
| IDs | UUID v4 via `expo-crypto.randomUUID()` | ID nasce no celular |

## 4. Modelo de dados local

Um **arquivo de banco por usuário** (`sgf_<hash do user_id>.db`), cada um com sua chave. Trocar de conta
nunca abre o banco de outra pessoa.

| Tabela local | Conteúdo | Origem |
|---|---|---|
| `meta` | versão do schema local, `user_id`, `tenant_id`, último pull (marca d'água **do servidor**), diferença de relógio medida, validade do modo offline | app |
| `profile` | dados mínimos do motorista: nome, CNH (categoria/validade), status, departamento, papel | pull |
| `vehicles` | colunas mínimas: id, placa, modelo, QR/código, combustível, capacidade do tanque, odômetro, status, departamento, modo de rastreamento | pull (snapshot) |
| `checklist_template` | itens, críticos, versão | pull (snapshot) |
| `stations` | postos credenciados: id, nome, endereço, combustíveis | pull (snapshot) |
| `trips`, `checklists`, `issues` | do próprio motorista, últimos N dias + os criados offline | pull (delta) + local |
| `fuelings` | **somente leitura**: histórico do motorista, para consulta offline. Nunca criado localmente | pull (delta) |
| `fueling_drafts` | rascunho do formulário de abastecimento (fotos e campos) para não perder o que foi preenchido se a rede do posto cair. **Não é fila de envio** | local |
| `notifications`, `service_orders` (status) | do motorista | pull (delta) |
| `trip_points` | buffer de GPS ainda não enviado | local |
| `attachments` | id, entidade, finalidade, caminho local, tamanho, SHA-256, estado (`local` → `uploaded` → `confirmed`) | local |
| `outbox` | id do evento, tipo, versão do contrato, payload, dependências, estado, tentativas, próxima tentativa, último erro | local |

**Minimização (LGPD):** não baixar CPF, telefone ou dados de outros motoristas. Hoje
`get_current_vehicle_people` traz pessoas do veículo; offline, guardar no máximo o nome.

## 5. Segurança — ameaças e controles

### 5.1 Celular perdido ou roubado
- Banco SQLCipher (AES-256) com chave aleatória de 256 bits no Keychain/Keystore, `THIS_DEVICE_ONLY`.
- Abrir o app offline exige **biometria ou senha do aparelho** (`BiometricGate`), sempre — não só no primeiro acesso.
- **Validade do modo offline:** se o app não fala com o servidor há mais de **72 h** (proposta; você decide),
  ele continua mostrando e enviando o que já existe, mas **não permite iniciar nova viagem** até
  conectar e revalidar (abastecimento já é sempre online). Limita o estrago de um aparelho roubado ou de um motorista
  bloqueado que fica sem rede de propósito.
- Fotos ficam na pasta do app (sandbox, protegida pela criptografia do sistema), **excluídas do backup**,
  e são apagadas após confirmação do servidor + período de segurança (proposta: 7 dias).

### 5.2 Motorista bloqueado, demitido ou CNH vencida enquanto offline
- Cada pull traz o status atual. Se vier `access_blocked`, `inativo/suspenso` ou sessão revogada:
  o app **apaga os catálogos** (veículos, postos) e bloqueia novos registros. Pendências ainda não
  enviadas são mantidas e enviadas quando for possível — são fatos que aconteceram e o gestor precisa vê-los.
- O servidor **sempre** reavalia: um registro recebido de um motorista bloqueado é guardado como
  "recebido — irregular" para auditoria, nunca aprovado automaticamente.

### 5.3 Payload forjado (alguém usa o token e chama a API na mão)
- `driver_id` e `tenant_id` **nunca vêm do payload**: o servidor deriva de `auth.uid()` e do perfil.
- Validação completa no servidor: veículo pertence à prefeitura, combustível compatível (já existe no
  `tg_fuelings_guard`), capacidade do tanque, odômetro não regride, itens do checklist batem com o modelo.
- Limites: tamanho máximo do lote, quantidade de eventos por chamada, taxa por motorista (já existe
  `api_rate_limits`).
- As políticas RESTRICTIVE de sessão ativa continuam valendo para tudo.

### 5.4 Fraude de data/hora (mudar o relógio e "lançar" viagem no passado)
- Cada evento leva `occurred_at` (relógio do aparelho) **e** o tempo de relógio monotônico desde o último
  contato com o servidor. O servidor grava também `received_at`.
- O app mede a diferença entre o relógio do aparelho e o do servidor a cada pull. Se o relógio do aparelho
  andar para trás ou divergir mais que um limite, o evento vai marcado `clock_suspect`.
- Regras no servidor:
  - `occurred_at` no futuro (> 5 min) → rejeita;
  - mais antigo que a janela de aceitação (proposta: **7 dias**) → aceita **como "precisa revisão"**;
  - anterior ao último contato online do aparelho → `clock_suspect`.
- Todo registro que chegou offline fica **marcado no painel** (`synced_offline = true`, atraso em horas),
  e o gestor pode filtrar por isso.
- Abastecimento não tem esse risco: é gravado online, com hora do servidor (§6.5).

### 5.5 Reenvio, duplicação e replay
- Cada evento tem UUID gerado no celular. O servidor guarda um **recibo** por evento
  (`sync_receipts`: `tenant_id`, `driver_id`, `event_id`, tipo, **hash do payload**, resultado, data),
  gravado **na mesma transação** que o efeito.
- Mesmo ID + mesmo hash → devolve o resultado anterior (não duplica).
- Mesmo ID + hash diferente → **conflito auditável**, não sobrescreve.
- Chave única `(tenant_id, client_id)` em `trips`, `checklists`, `issues` como segunda barreira.
- Abastecimento online também recebe `client_id` único: se a rede do posto cair depois do envio e o
  motorista tocar em "Concluir" de novo, não duplica.

### 5.6 Fotos
- Caminho no Storage determinado pelo **servidor**: `tenant/<tenant>/driver/<uid>/<attachment_id>.webp`.
  O motorista só pode gravar no próprio prefixo e nunca sobrescrever (já é `x-upsert: false`).
- Depois do upload, uma RPC `finalize_attachment` confere: objeto existe, tamanho e SHA-256 batem com o
  declarado. Só então o anexo vira "confirmado".
- **Melhoria recomendada:** hoje qualquer usuário da prefeitura (inclusive motorista) lê qualquer foto da
  prefeitura. Restringir a leitura do motorista ao próprio prefixo.
- Comprimir na captura (já é feito: WebP, 1000 px). Decidir se o original do hodômetro deve ser mantido
  em resolução maior por ser prova (ver §9).

### 5.7 Aparelho compartilhado / troca de conta
- Banco e chave por usuário: a conta B não lê nada da conta A.
- Logout com pendências: avisar claramente ("há 3 registros não enviados; se sair, eles ficam guardados
  e só serão enviados quando você entrar de novo"). Os catálogos são apagados; as pendências ficam
  criptografadas.
- O envio só acontece com a sessão **do mesmo `user_id`** que criou o evento.

### 5.8 Sessão expirada ou revogada com fila pendente
- Erro de RLS/sessão no envio → estado **"precisa entrar de novo"**; nada é descartado.
- Após o login do mesmo usuário, a fila retoma.

### 5.9 Atualizações OTA
- `expo-updates` está ativo sem assinatura. Quem obtiver acesso à conta Expo pode publicar JavaScript
  que roda em todos os aparelhos, com acesso ao banco local já descriptografado.
- **Ativar code signing do EAS Update** (`codeSigningCertificate` + chave privada fora do repositório)
  antes de liberar o offline.

### 5.10 Logs e erros
- Remover `console.*` de produção (regra do projeto), ou passar por um logger que nunca registra payload,
  token, CPF, placa + nome juntos ou coordenadas.
- Erros do servidor mostrados ao motorista sem detalhes internos.

## 6. Sincronização

### 6.1 Pull (servidor → app)

Uma RPC `driver_sync_pull(p_since timestamptz, p_catalog_versions jsonb)`, `SECURITY INVOKER` (respeita
RLS), com `search_path` fixo. Ela devolve:

| Bloco | Estratégia | Por quê |
|---|---|---|
| Perfil, status, validade offline | Sempre completo | É pequeno e é o que decide o bloqueio |
| Veículos, modelo de checklist, postos | **Snapshot com versão** (hash do conteúdo). Se o hash bater, não manda nada | Poucos registros por prefeitura; evita depender de `updated_at` e de "exclusões" |
| Viagens, abastecimentos, checklists, ocorrências, O.S., notificações do motorista | **Delta** por `updated_at > p_since`, com `deleted_at` para remoções | Crescem com o tempo |
| `server_time` | Sempre | Nova marca d'água e medição do relógio |

A marca d'água é o `server_time` devolvido, **nunca o relógio do aparelho**.

### 6.2 Push (app → servidor)

Uma RPC `driver_sync_push(p_events jsonb)`, `SECURITY DEFINER`, com `search_path = ''`, que:

1. Confere `sgf_private.current_session_allowed()` e o papel `motorista`.
2. Para cada evento, em ordem e respeitando dependências (checklist → início → pontos → fim):
   - valida o schema e a versão do contrato;
   - consulta o recibo (idempotência, §5.5);
   - aplica o efeito numa transação (sub-bloco por evento) e grava o recibo;
   - devolve `ok`, `ok_needs_review` (com motivo), `retry_later` (dependência ausente) ou `rejected` (motivo).
3. Usa uma flag de sessão própria (`app.offline_sync = 'on'`) para que as travas de viagem avaliem a
   regra **na data do fato** (CNH válida em `occurred_at`, checklist do dia de `occurred_at`) em vez de
   `now()`. Não reutiliza a flag de viagem retroativa do gestor.

Tipos de evento (contrato v1):

| Evento | Efeito |
|---|---|
| `checklist.submit` | Cabeçalho + itens numa transação; item crítico → cria O.S. (mesma regra de hoje) |
| `trip.start` | Cria a viagem com `start_at = occurred_at`, ligada **explicitamente** ao `checklist_id` (fim do `link_checklist_to_trip` "pega o mais recente") |
| `trip.points` | Lote de pontos de GPS (deduplicados por `trip_id + recorded_at`) |
| `trip.end` | Encerra com `end_at = occurred_at`; `server_ended_at` continua sendo do servidor. Se a viagem já foi encerrada pelo `auto_close_abandoned_trips`, **corrige** o fim via `trip_corrections` com auditoria |
| `issue.create` | Ocorrência |
| `attachment.finalize` | Confirma foto (§5.6) |

### 6.3 Conflitos — regras fixas

| Situação | Regra |
|---|---|
| Cadastro (veículo, posto, perfil) | Servidor sempre vence; o app só lê |
| Fato do motorista (viagem, checklist, ocorrência) | O registro do motorista é imutável depois de enviado; correção = novo registro (`trip_corrections`) |
| Dois motoristas iniciaram o mesmo veículo offline | Servidor aceita os dois e marca **sobreposição** para o gestor. Não dá para impedir sem rede, e rejeitar apagaria um fato real |
| Viagem fechada automaticamente e o "encerrar" chega depois | Corrige o fim com auditoria (§6.2) |
| Abastecimento aprovado/rejeitado pelo gestor | Desce no pull; o app só mostra |

### 6.4 Quando sincroniza
- Ao abrir o app e ao voltar do segundo plano.
- Quando o NetInfo indica rede (com uma tentativa real de conexão, não só o sinal).
- Botão **"Sincronizar agora"** na tela de pendências.
- Em segundo plano via `expo-background-task` (no iOS não há garantia de horário).
- Espera progressiva com variação aleatória entre tentativas (2 s, 10 s, 30 s, 2 min, 10 min…).
  **Limite de tentativas pausa o envio, nunca apaga o evento.**
- Uma trava local impede que duas rotinas (primeiro e segundo plano) enviem o mesmo evento ao mesmo tempo.

### 6.5 Abastecimento: só online, na rede do posto

**No app**

- Antes de abrir o formulário, o app faz uma **checagem real de alcance do servidor** (uma chamada leve
  ao Supabase com timeout curto), não só "tem Wi-Fi". Wi-Fi do posto sem internet ou com portal de login
  conta como **sem conexão**.
- Sem conexão: a tela de abastecimento mostra "Conecte-se à rede do posto para abastecer" e não deixa
  concluir. O histórico de abastecimentos continua visível (somente leitura, do cache).
- O formulário é guardado como **rascunho local** enquanto o motorista preenche (fotos e campos). Se a rede
  cair no meio, ele não perde o que fez; mas o **"Concluir" só é aceito com o servidor respondendo**.
  O rascunho expira (proposta: 2 h) e é apagado ao concluir.
- O envio usa `client_id` gerado no celular: repetir o "Concluir" após uma queda não duplica (§5.5).
- Hora do abastecimento = **hora do servidor**. Nada de `occurred_at` do aparelho aqui.
- Fotos (cupom, hodômetro, bomba) sobem pela fila de fotos já existente; o abastecimento só fica
  completo com todas confirmadas pelo servidor.
- A autorização de abastecimento (`expires_at`, saldo, empenho) é sempre conferida no servidor na hora.

**Na rede do posto (roteador para os motoristas)**

| Item | Recomendação | Por quê |
|---|---|---|
| Rede separada | SSID próprio para motoristas, **isolado** da rede interna do posto (rede de visitante/VLAN) | Um celular de motorista não pode alcançar o computador do caixa nem a automação das bombas |
| Isolamento de clientes | Ativar "AP/client isolation" | Um celular não enxerga o outro na mesma rede |
| Criptografia | WPA2-AES ou WPA3; senha forte, trocada periodicamente; WPS desligado | Evita rede aberta onde qualquer um intercepta/injeta tráfego |
| Portal de login | **Evitar** captive portal | Ele faz o app achar que tem internet e falhar no meio do envio |
| Administração | Senha do painel do roteador trocada; administração remota desligada; firmware atualizado | Roteadores com senha padrão são a falha mais comum |
| Filtro opcional | Liberar só os domínios necessários (`*.supabase.co`, Expo/atualizações, mapas) | Reduz uso indevido da rede do posto |
| Responsável | Definir no contrato/termo do posto quem mantém o roteador e o link | Se a rede cair, o abastecimento para |

Tudo do app vai por **HTTPS** para o Supabase, então mesmo numa rede ruim o conteúdo não fica exposto.
Mas a rede isolada protege o **posto** e os outros celulares, que o HTTPS não protege.

**Contingência (decisão sua):** se a internet do posto cair, o que acontece? Opções:
(a) o motorista usa os dados móveis do próprio celular; (b) o gestor lança o abastecimento pelo painel
depois (`manager_create_direct_fueling`, que já existe), com justificativa auditada. Recomendo **(b) como
regra** e (a) como permitido — nunca um abastecimento offline no app.

## 7. Mudanças necessárias no banco (precisam da sua aprovação)

1. `updated_at timestamptz not null default now()` + trigger em `trips`, `fuelings`, `checklists`,
   `issues`, `service_orders`, `notifications`, `profiles`; `deleted_at` onde houver exclusão.
2. `client_id uuid` + índice único `(tenant_id, client_id)` em `trips`, `fuelings`, `checklists`, `issues`.
3. Colunas de origem: `synced_offline boolean`, `occurred_at`/`received_at` onde fizer sentido,
   `clock_suspect boolean`, `review_reason text`.
4. Tabela `sync_receipts` (RLS: motorista lê os próprios; ninguém escreve fora da RPC).
5. Tabela `attachments` (metadados + SHA-256 + estado).
6. RPCs `driver_sync_pull`, `driver_sync_push`, `finalize_attachment` + mapeamento em
   `resource_modules` (senão admin/gestor recebem "Módulo não autorizado").
7. Ajuste de `tf_trip_insert_guard` para a flag `app.offline_sync` (avaliar na data do fato).
8. Ajuste de `auto_close_abandoned_trips` para não fechar viagem de quem tem pendência conhecida?
   **Não recomendo** — melhor fechar e corrigir depois (§6.3), mantendo o servidor previsível.
9. Fotos: motorista grava só em `tenant/<tenant>/driver/<uid>/`; leitura do motorista por RPC que
   assina a URL apenas se o registro dono da foto for visível para ele (ver §8.1).
10. Índice único `(trip_id, recorded_at)` em `trip_locations`, para o buffer de GPS enviar com
    "ignorar duplicados".

Gerar `database.types.ts` de novo após aplicar.

## 8. Fases

| Fase | Entrega | Mexe no banco? | Critério de pronto |
|---|---|---|---|
| **0. Base de segurança** | Code signing do OTA; logger sem dados pessoais no lugar dos `console.*`; restringir leitura de fotos do motorista | Só política de Storage | OTA não assinado é recusado pelo app; nenhum `console.*` em produção |
| **1. Parar de perder dado** | SQLite criptografado + buffer de GPS + fotos em pasta permanente com fila persistente | Não | Modo avião durante a viagem, fechar o app, reabrir: nenhum ponto/foto perdido |
| **2. Banco** | Itens 1–7 e 9 da §7 | **Sim** (aprovação) | Migrations aplicadas, tipos regerados, RPCs com testes de idempotência e de RLS |
| **3. Leitura offline** | Pull + repositório local; telas leem do SQLite | Não (usa a fase 2) | Login, modo avião, fechar e reabrir: Início, veículos, postos e histórico aparecem |
| **4. Escrita offline** | Checklist → início → fim → ocorrência pela outbox; tela de pendências. Abastecimento: checagem de alcance do servidor, rascunho local e `client_id` (§6.5) | Não | Ciclo de viagem completo em modo avião sincroniza sem duplicar; abastecimento recusado sem servidor e sem duplicar após queda |
| **5. Painel do gestor** | Selo "enviado offline (atraso X h)", filtros de revisão, sobreposição de veículo, fotos pendentes | Não | Gestor identifica e revisa registros offline |
| **6. Homologação** | Matriz de testes (§10) em iPhone e Android reais, piloto com 2–3 motoristas | — | Todos os cenários passam com evidência |

A fase 1 já elimina a perda de GPS que existe hoje, sem nenhuma mudança no servidor.

### 8.1 Andamento (19/10/2026)

**Fase 0 — feita, com ajustes de escopo:**
- Logs: já estava resolvido. O `babel.config.js` do app remove `console.*` do bundle de produção
  (fica só `console.error`, 6 chamadas, que registram apenas erros do Supabase).
- OTA: code signing ativado (`app.json` → `updates.codeSigningCertificate`, certificado em `certs/`).
  A **chave privada fica fora do repositório**, em `~/.config/exattus-rotta/ota-keys/private-key.pem`
  (permissão 600). Publicar com `npm run ota -- --channel production ...` (já passa a chave). Se a chave
  for perdida, é preciso gerar outra e publicar um build novo nas lojas. **Faça backup dela num cofre de senhas.**
- Leitura de fotos do motorista: **movida para a fase 2**. O motorista legitimamente vê fotos que não
  enviou (viagens de outros motoristas no veículo atual, O.S., documentos, postos), então restringir por
  prefixo/dono quebraria telas. O caminho certo é assinar as URLs no servidor por uma RPC que confere se
  o registro é visível para ele.
- Correção encontrada no caminho: o plugin `plugins/withIos27Compat.js` inseria um comentário `//` no
  `Podfile` (Ruby), o que quebrava o `pod install` em qualquer prebuild novo — inclusive no EAS.

**Fase 1 — GPS feito; fotos movidas para a fase 4:**
- `src/lib/localDb.ts`: SQLite com SQLCipher, um arquivo e uma chave por usuário, chave no Keychain com
  `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` (não `WHEN_UNLOCKED`, porque a tarefa de GPS grava com a tela
  bloqueada). Sem SQLCipher no build, o banco não abre e o app segue como antes.
- `src/lib/tripPoints.ts`: todo ponto vai primeiro para o banco local e só é apagado depois que o servidor
  confirma. Reenvio ao chegar ponto novo, ao voltar o app para o primeiro plano, ao restaurar/renovar a
  sessão e ao encerrar a viagem. Pontos com mais de 30 dias sem conseguir subir são descartados.
- Duplicidade: sem índice único em `trip_locations`, um lote gravado cuja resposta se perdeu é reenviado
  (cópia idêntica, não altera distância). **Fase 2:** índice único `(trip_id, recorded_at)` + envio com
  "ignorar duplicados".
- Fotos: hoje nenhuma foto se perde **depois** de salvo o registro (o salvamento espera o upload). O que
  se perde é o formulário inteiro se o app fechar, e isso só se resolve junto com os rascunhos da fase 4.
  Persistir só a foto agora não teria efeito prático.
- Validado no iPhone (19/10): o banco é criado em `Documents/SQLite/sgf_<hash>.db` e o arquivo copiado
  do aparelho não abre sem a chave ("file is not a database"); cabeçalho aleatório, não `SQLite format 3`.
- **Bug encontrado e corrigido no mesmo dia:** a migração do esquema local usava
  `withExclusiveTransactionAsync`, que no expo-sqlite abre uma **segunda conexão** sem o `PRAGMA key`. A
  migração falhava, `getUserDb` devolvia `null` e o GPS caía no envio direto antigo (sem perda, mas sem
  buffer). Agora a migração roda na mesma conexão (`BEGIN IMMEDIATE`/`COMMIT`). Evidência no aparelho: o
  WAL passou de 0 para 24 KB após abrir o app. **Regra para as próximas fases: nunca usar
  `withExclusiveTransactionAsync` nem abrir conexão nova no banco cifrado.**
- Esquema local v2: `trip_points.client_point_id` (UUID por ponto). O envio usa
  `upsert(..., { onConflict: 'client_point_id', ignoreDuplicates: true })`; testado no banco como motorista:
  mesmo ponto enviado 2 vezes → 1 linha.
- Pendente: uma viagem real com modo avião no meio para ver os pontos chegarem depois.

**Fase 2 — dividida em três, para cada RPC nascer junto com o app que a usa:**
- **2a** (`20261019195113_offline_fase2a_sync_foundations.sql`, só aditiva): `updated_at` + trigger
  `zzz_touch_updated_at` (roda por último, para não acionar as travas que comparam OLD x NEW), `client_id`
  único por prefeitura em viagens/abastecimentos/checklists/ocorrências, `trip_locations.client_point_id`
  único (no lugar de `(trip_id, recorded_at)`, que já tem 1 par repetido em produção e não pode ser
  apagado) e a tabela `sync_receipts`.
- 2a **aplicada em produção em 19/10** (versão `20261019195113`). Verificado com transação desfeita no fim,
  agindo como motorista: edição permitida da própria O.S. passa; notificações marcadas como lidas
  passam; recibo não pode ser gravado direto (`permission denied`); leitura dos próprios recibos funciona.
  Advisor de segurança sem avisos novos. `web/src/types/database.types.ts` regerado (só adições).
- **Achado de segurança anterior a este trabalho:** `tf_service_order_guard_driver_update` (limita os campos
  da O.S. que o motorista pode mudar) é `SECURITY DEFINER` e testa `current_user`, que dentro dela é o dono
  da função — então ela sempre sai no primeiro `if` e **não protege nada**. No teste, o motorista conseguiu
  trocar `repair_shop_id` da própria O.S. pendente (só a FK barrou o UUID inventado). **Corrigido em
  19/10** (`20261019200448_fix_service_order_driver_guard_invoker.sql`): a função passou a
  `SECURITY INVOKER`. Verificado em produção (transação desfeita): edição de descrição/prioridade passa,
  troca de `repair_shop_id` é bloqueada e a RPC `driver_update_service_order` ('deliver') segue funcionando.
- **2b** (com a fase 3): RPC `driver_sync_pull` — **aplicada em 19/10** (`20261019201313_offline_fase2b_driver_sync_pull.sql`).
  `SECURITY INVOKER`, só papel motorista, catálogo de veículos só com colunas operacionais (sem RENAVAM,
  chassi, documento, seguro, foto), versão por md5 do conteúdo (mesma versão → catálogo não reenviado) e
  hora do servidor. Verificado como motorista: 88 veículos, ~32 KB; `anon` sem permissão; sessão inválida → 42501.

**Fase 3 — leitura offline (19/10, no app):**
- `requestCache.ts`: todo resultado BOM das leituras do app é salvo no banco cifrado (`query_cache`) e
  devolvido quando a leitura falha por rede. "Bom" = nenhuma falha de rede durante a leitura: o client do
  Supabase conta falhas de `fetch` (`getNetworkFailureCount` em `supabase.ts`), porque várias leituras
  engolem o erro e devolvem lista vazia — esse vazio nunca sobrescreve o dado salvo. Não salvos:
  autorizações de abastecimento, operações de posto e modo de preço (vencem; abastecimento é online).
  Validade máxima de 60 dias. `invalidateCache` também apaga a cópia salva.
- Abertura sem rede (`offlineSession.ts` + `auth.tsx`): sem rede e com o token vencido, `getSession()`
  devolve null mas a sessão continua salva; o app usa essa sessão (que não acessa nada no servidor) com o
  perfil salvo na última abertura online, se: (1) último contato com o servidor há menos de **72 h**;
  (2) o dono confirmar com biometria ou senha do celular (com o desbloqueio por biometria do app ligado,
  o `BiometricGate` já cobre isso; celular sem senha não entra offline); (3) o usuário não tiver saído.
  Em modo offline o app tenta voltar ao normal a cada 30 s e ao reabrir; o supabase-js renova o token.
- Bloqueio/sessão revogada/saída forçada pelo servidor e logout apagam o cache salvo, o catálogo e o
  contexto offline. Pontos de GPS não enviados continuam guardados.
- `syncPull.ts`: baixa o catálogo após cada perfil carregado online (no máximo a cada 5 min) e guarda a
  diferença de relógio servidor − aparelho. `findVehicleIdByCode`/`getVehicleById` usam o catálogo só
  quando a consulta falha por rede.
- Aviso "Sem internet — mostrando os dados salvos (hora)" na tela Início (`OfflineNotice.tsx`).
- **Fotos offline (`fotoVault.ts`, esquema local v4):** perfil (`drivers`/`avatars`), veículos (`vehicles`) e
  CNH (`cnh` no `fotos` e o bucket `documentos`) ganham cópia como data URI **dentro do SQLCipher** (a CNH é
  documento sensível) quando são assinadas com rede. Sem rede, `signFotos`/`resolveFotoUrl`/`resolveCnhUrl`
  e o dado lido do aparelho usam a cópia. Teto de 3 MB por foto e 30 MB no total; PDF fica só online;
  tudo sai no logout/bloqueio. Fotos de hodômetro, abastecimento e ocorrência não são copiadas.
- **Notificações:** marcar como lidas/limpar só invalidava o cache e apagava a cópia salva mesmo quando a
  gravação falhava sem rede (tela vazia offline). Agora só invalida quando o servidor confirma; e a tela de
  notificações (50 itens) usa a lista salva pela Início (30 itens) se não tiver a própria.
- **Diário de diagnóstico (`diag.ts`):** últimos 200 eventos (boot, modo offline, ciclo de vida, cadeado)
  no AsyncStorage, só nomes de eventos — para entender travamentos em campo.
- **Pedido de Face ID/senha offline:** espera o app estar ativo, prazo de 60 s, e o boot nunca fica sem
  saída (limite de 100 s). A capa de privacidade do `BiometricGate` sai sozinha se o evento 'active' se perder.
- **Teste no Simulador (19/10, modo de desenvolvimento, "sem internet" simulado pelo link
  `exattusrotta://dev-offline?on=1`, só em `__DEV__`):** abre offline com o aviso, Início com viagens,
  foto do perfil, notificações (36 não lidas), Perfil e a foto da CNH vindas do aparelho; volta ao normal
  quando a rede volta. Sem repetição de Face ID.
- **Travamento total do iPhone (19/10):** não reproduzido no Simulador; nenhum relatório de falha no
  aparelho. Suspeitos ainda abertos: projeto iOS regenerado (ciclo de cena do iOS 27 e `expo-updates`
  ligado) e o pedido de Face ID com a Central de Controle aberta. O diário de diagnóstico está no app para
  a próxima ocorrência.
- **Foto do veículo offline (19/10):** `driver_sync_pull` passou a trazer `photo_url` (migration
  `20261019204634`); o app guarda no cofre as fotos dos veículos do catálogo. Testado no Simulador: placa
  digitada sem internet abre o veículo com a foto.
- **Faixa "Sem internet" em todas as telas (`OfflineNotice.tsx`):** fixa no topo, no layout raiz; o
  conteúdo de todas as telas desce porque o topo da área segura (`useSafeAreaInsets`) ganha a altura da
  faixa — nenhum cabeçalho fica coberto.
- **Token vencido sem internet (o caso real de horas sem sinal):** o supabase-js insiste em renovar a
  sessão por ~30 s e toda chamada esperava isso — o boot estourava (caía no login) e as telas ficavam em
  "Carregando". Agora: boot espera no máximo 3 s pela sessão e segue pelo modo offline; em modo offline
  as leituras com cópia no aparelho, o catálogo e as fotos não tentam a rede; a volta ao normal faz antes
  um teste leve de conexão (`/auth/v1/health`, 4 s) a cada 30 s.
- **Novas tentativas automáticas do PostgREST desligadas** (`supabase.rest.retry = false`): cada leitura
  sem rede repetia 3 vezes (1 s + 2 s + 4 s).
- **Cadeado sem saída offline:** depois de falhar o Face ID, a tela pedia a senha do app (conferida no
  servidor). Offline, agora oferece "Usar a senha do celular".
- **Fase 4 — checklist offline (19/10):** `driver_sync_push` aplicada (migration `20261020003516`, 9
  cenários testados em transação desfeita). App: fila local (`outbox.ts`, esquema local v5) com fotos em
  WebP dentro do SQLCipher; o checklist entra na fila e é enviado na hora se houver rede. Testado no
  Simulador sem internet: "Checklist salvo no aparelho", faixa "1 registro a enviar", veículo selecionado
  localmente e "Checklist feito" na Início.
- **Ajustes vistos no teste da fase 4:** (1) em modo offline o refresh automático do token fica parado
  (cada tentativa falhava, gastava bateria e enchia o log); (2) a checagem de conflito de veículo da Início
  não tenta a rede offline (segurava a tela 8 s até o timeout); (3) no "sem internet" simulado, os avisos
  de erro do modo de desenvolvimento não aparecem na tela (ficam no terminal do Metro).
- **Fase 4 — viagem offline (19/10):** migration `20261020010049` (testada em transação desfeita, 9
  cenários). Banco: eventos `trip.start`/`trip.end` em `driver_sync_push`; viagem offline é fato — regra
  de negócio (CNH, veículo, checklist, sobreposição) vira `ok_needs_review` com motivos, não recusa;
  início com o fim no mesmo lote entra já encerrado se houver outra viagem aberta no servidor; fim depois
  do fechamento automático completa o hodômetro com registro em `trip_corrections`. **Correção de bug
  online junto:** as travas usavam o dia em UTC (das 21h às 23h59 o checklist da manhã contava como
  "ontem"); agora usam o dia de Brasília (`tf_trip_insert_guard`, `link_checklist_to_trip`).
  App: início com internet continua direto (travas barram na hora); sem internet — ou se a rede cair no
  meio — vai para a fila com o mesmo id (sem duplicar). Encerramento sempre pela fila. Testado no
  Simulador sem internet: início e fim salvos no aparelho ("2 registros a enviar"); ao reconectar a
  viagem chegou com as horas do fato, 8 km, as duas fotos e o checklist vinculado.
- **Fase 4 — paradas e ocorrência offline (20/10):** migration `20261020014507` (testada em transação
  desfeita). Eventos `stop.add`, `stop.leave` e `issue.create`; paradas e ocorrência agora vão SEMPRE pela
  fila (a RLS de `trip_stops` exigia viagem em andamento no servidor). Hora fora do intervalo da viagem é
  ajustada e marcada para revisão. A ocorrência continua abrindo a O.S. e avisando o gestor pelos gatilhos
  de sempre. App: a tela da viagem soma as paradas da fila às do servidor; a busca de GPS da parada tem
  limite de 8 s (sem sinal, grava sem coordenada). Testado no Simulador sem internet: ocorrência com foto,
  viagem, parada (chegada e saída) e encerramento ("5 registros a enviar"); ao reconectar os 5 chegaram
  com as horas do fato, a O.S. foi aberta e o gestor avisado.
- **Tela "Registros no aparelho" (`app/pending.tsx`, 20/10):** aguardando envio (com "Enviar agora"),
  recusados pelo servidor (com o motivo; o motorista pode tirar da lista) e enviados nos últimos 7 dias
  (com selo "o gestor vai conferir" quando marcado para revisão). Abre pelo Perfil e tocando na faixa do
  topo, que agora também aparece com internet, em vermelho, quando há registro recusado. Enviados com mais
  de 30 dias saem do aparelho.
- **Confirmação rápida pela fila (20/10):** migration `20261020110637` (6 cenários em transação desfeita),
  evento `checklist.quick_confirm`. Sem checklist completo no dia até a hora do fato, ou com item crítico
  reprovado, grava e marca para revisão. App: a tela do veículo usa a fila (com e sem internet) e pula a
  checagem de conflito offline. Offline, o "checklist de hoje" também considera o já enviado deste
  aparelho quando não há cópia do servidor (com internet o servidor sempre vence). Testado no Simulador:
  checklist completo online → confirmação rápida sem internet → enviada ao reconectar e veículo vinculado.
  **Limite conhecido:** offline, a confirmação rápida de um veículo que OUTRO motorista conferiu só aparece
  se este celular já tiver visto esse checklist com internet; senão o app pede o checklist completo
  (seguro, só mais demorado). Resolver exigiria o `driver_sync_pull` trazer o checklist do dia.
- **2c** (com a fase 4): RPC `driver_sync_push`, ajuste das travas de viagem para a data do fato,
  colunas de origem offline, anexos e assinatura de fotos no servidor.

## 9. Decisões que dependem de você

| # | Decisão | Proposta |
|---|---|---|
| 1 | Por quanto tempo o app pode criar registros sem falar com o servidor | 72 h |
| 2 | Janela máxima para aceitar um registro atrasado sem revisão | 7 dias (depois disso, entra como "precisa revisão") |
| 3 | Quantos dias de histórico guardar no celular | 60 dias |
| 4 | Dois motoristas no mesmo veículo offline | Aceitar e sinalizar ao gestor |
| 5 | Foto do hodômetro: só comprimida ou guardar original maior | Comprimida, mas com 1600 px no hodômetro/cupom (legibilidade) |
| 6 | Logout com pendências | Permitir, com aviso, mantendo as pendências criptografadas |
| 7 | Exigir biometria toda vez que abrir offline | Sim |
| 8 | Contingência se a internet do posto cair | Gestor lança pelo painel com justificativa; dados móveis do motorista permitidos |
| 9 | Validade do rascunho de abastecimento no celular | 2 h |

## 10. Testes obrigatórios antes de produção

Em aparelho físico, build Release, iOS e Android:

1. Modo avião antes do login → mensagem clara, nada é inventado.
2. Login online, modo avião, fechar e reabrir → dados aparecem; biometria exigida.
3. Ciclo de viagem completo offline (checklist, início, GPS, fim, ocorrência com fotos) → volta a rede → tudo no
   painel, sem duplicar, com selo "offline".
4. Matar o app no meio do envio → reabrir → reenvio sem duplicar (recibo).
5. Servidor grava, resposta se perde (simular timeout) → reenvio devolve o mesmo resultado.
6. Mesmo `event_id` com payload alterado → conflito registrado, nada sobrescrito.
7. Relógio do aparelho adiantado/atrasado → `clock_suspect` / rejeição de futuro.
8. Gestor bloqueia o motorista enquanto ele está offline → ao reconectar: catálogos apagados, pendências
   enviadas como "irregular", novos registros bloqueados.
9. Sessão revogada (login em outro aparelho) com fila → "precisa entrar de novo", nada perdido.
10. Troca de conta no mesmo aparelho → conta B não vê nada da A.
11. Viagem offline > 24 h → servidor fecha automaticamente → "encerrar" chega → fim corrigido com auditoria.
12. Dois motoristas, mesmo veículo, ambos offline → sobreposição sinalizada.
13. Sem espaço no aparelho ao salvar foto → erro claro, nada marcado como salvo.
14. Atualizar o app com fila pendente (migração do banco local) → nada perdido.
15. Tentar ler foto de outro motorista com o token do motorista → negado.
16. Payload com `driver_id` de outra pessoa → ignorado (servidor usa `auth.uid()`).
17. Abrir abastecimento em modo avião → bloqueado com a mensagem da rede do posto; histórico visível.
18. Wi-Fi conectado mas sem internet (roteador sem link) → tratado como sem conexão, não trava no envio.
19. Rede do posto cai no meio do formulário → rascunho preservado; ao voltar, conclui sem refazer fotos.
20. Rede cai depois de tocar em "Concluir" → novo toque não duplica o abastecimento (`client_id`).
21. Na rede do posto, um celular tenta alcançar outro celular ou um IP da rede interna do posto → bloqueado
    (isolamento de clientes/VLAN).

## 11. Fora do escopo deste plano

- iButton e rastreador físico como fonte de trajeto e de identificação (ver `arquitetura-app-offline-ibutton.md`).
  O desenho de eventos e recibos deste plano já comporta essa integração depois.
- Gestor/painel funcionando offline.
