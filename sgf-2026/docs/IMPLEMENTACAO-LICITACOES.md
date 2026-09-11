# Licitações e Contratos — implementação por etapas

Plano aprovado em 10/09/2026. Trabalhar em uma entrega por rodada para limitar consumo de créditos. Não há estimativa confiável de créditos por etapa. Atualizar este arquivo com evidências e próximo passo para evitar repetir a investigação.

## Etapas e critérios de conclusão

1. **Central de consulta e navegação** — reunir os registros atuais de postos e oficinas com busca, filtros, paginação, composição do saldo e acesso ao painel de cotas existente. Preservar permissões e endereço antigo das cotas. Não somar contratos com a mesma referência nem tratá-los automaticamente como um processo único.
2. **Cadastro independente** — processos, atas e contratos com identidade própria, vários instrumentos por fornecedor, vigências, documentos, auditoria e isolamento por prefeitura. Criar e editar rascunhos; conferir antes de ativar. Validar no banco local sem exigir plano pago.
3. **Itens, lotes e preços** — combustível, ARLA, lubrificantes, peças, mão de obra, pneus e borracharia. Quantidades/unidades, adjudicação por fornecedor, preço ou tabela/desconto e histórico com data de efeito.
4. **Cotas e orçamento** — ligar o painel existente aos instrumentos, com exercício, secretaria, categoria, múltiplas dotações/fontes e remanejamentos documentados. Distinguir limite operacional, valor registrado/contratado e saldo de empenho.
5. **Operação e financeiro** — vincular autorizações, abastecimentos, lançamentos diretos, orçamentos, ordens, portais e fechamentos aos itens e contratos. Reservas atômicas de dinheiro/quantidade; revalidar complementações; preservar vínculos históricos.
6. **Migração, validação e publicação** — inventário dos documentos, associação do legado, conciliação dos saldos, testes integrados e recuperação. Atualizar relatórios e conferir referências TCE-PR/SIM-AM com a contabilidade. Publicar somente o conjunto validado.

## Rodada 1

Implementação local: `/licitacoes` consulta a API já existente, sem novo esquema de banco ou alteração dos controles financeiros. `/licitacoes/limites` reutiliza o painel existente; `/configuracoes/limites` redireciona para ele. Menu único e navegação entre as duas páginas.

A consulta é um inventário dos cadastros atuais por fornecedor, não o cadastro independente da etapa 2. Ela não calcula total global de licitações. Campos ausentes permanecem "Não informado"; não são convertidos para zero. A classificação dos fornecedores não é apresentada como categoria jurídica do item.

Permissões: a consulta conjunta exige gestor global com acesso aos dois tipos de fornecedor ou aos relatórios existentes. Secretários acessam somente as cotas autorizadas. Os endpoints e verificações de sessão existentes são reutilizados; nenhuma permissão de banco é ampliada. O módulo específico de gestão contratual será definido na etapa 2 junto com a proteção no servidor.

Validação: teste de acesso em `tests/procurement-navigation.test.mjs`, compilação e lint dos arquivos alterados. A validação visual autenticada com dados reais da aplicação deve ser registrada antes de publicar.

## Rodada 2 — cadastro independente (implementado localmente)

Rota `/licitacoes/processos`: criação e edição de processos, atas e contratos em rascunho, busca e paginação de 20 registros, fornecedores associados e histórico. Um fornecedor pode participar de vários instrumentos. A ata admite vários fornecedores; um contrato derivado deve usar fornecedores da ata e pertencer ao mesmo processo. Não é possível remover da ata um fornecedor usado por um contrato derivado. Datas, valores opcionais e até 20 referências HTTPS para documentos podem ser cadastrados. Referências documentais são links, não upload/armazenamento privado de anexos.

Modelo: `procurement_processes`, `procurement_instruments`, `procurement_instrument_partners` e `procurement_registry_events`. Processo e instrumento têm identidade e versão próprias. Não há soma de valores de atas e contratos derivados. Valor desconhecido permanece nulo. Nenhuma reserva, despesa, preço do fornecedor ou cota existente é alterada por estes rascunhos. Itens, ativação, encerramento e migração de contratos antigos continuam nas próximas etapas.

Segurança: módulo explícito `procurement`, limitado a admin/gestor/superadmin global e sessão válida. Usuários existentes não ganham permissão automaticamente; na futura implantação, outro administrador autorizado deverá atribuir a aba pela gestão de acessos. Listagem de nomes dos fornecedores é autorizada pelo próprio módulo contratual. As tabelas têm RLS e acesso direto revogado; RPCs públicas invoker delegam para funções privadas com validação de sessão, papel e prefeitura. Escrita e auditoria são transacionais, com justificativa, nome/ID do responsável, antes/depois e controle de versão. Alterações simultâneas sobre versão antiga são recusadas. Não existem RPCs de exclusão/ativação nesta etapa.

Migration criada pela CLI Supabase 2.116.0: `20260910152227_procurement_registry.sql`. Foi executada em PostgreSQL local em memória (PGlite), após as migrations de sessões/cotas. Tipos das quatro RPCs adicionados ao cliente TypeScript, com validação Zod das respostas.

Validação em 10/09/2026:

- 75 testes passaram na suíte `node --import tsx --test tests/*.test.mjs`, incluindo 8 cenários novos de SQL e a permissão específica de navegação.
- Verificados: múltiplos instrumentos por fornecedor, origem da ata, auditoria, concorrência por versão, erros sem gravação parcial, dados inválidos, isolamento entre prefeituras, sessões revogadas, usuários bloqueados, roles/módulos, paginação e privilégios/RLS no catálogo PostgreSQL.
- TypeScript, lint dos arquivos da funcionalidade e build Vite passaram. Permanece o aviso de tamanho dos bundles já existente no projeto.
- Fluxo manual no navegador com a página e API reais ligadas ao PGlite: criar processo, criar ata com dois fornecedores, criar contrato derivado com um fornecedor, conferir valores separados e histórico. O servidor de ensaio usa autenticação fictícia somente na fixture isolada e não carrega credenciais do serviço remoto. Pode ser reproduzido com `node tests/procurement-registry-preview.mjs` (porta local 5184).
- `supabase db advisors --local` foi tentado, mas não havia Supabase/Postgres Docker em `127.0.0.1:54322`. Os testes verificaram RLS, search_path, execução anônima e privilégios localmente. Advisors completos e homologação com Auth/PostgREST reais seguem como verificação da implantação; não foram substituídos por uma consulta ao banco remoto.

Nenhuma migration foi aplicada ao ambiente hospedado, e não houve push/publicação nesta rodada. Antes de publicar esta etapa, aplicar a migration em ambiente de validação e conferir atribuição do módulo com sessões reais. A estrutura continua no plano gratuito.

## Rodada 3 — itens, lotes e condições de preço (implementado localmente)

Cada ata/contrato tem a ação **Itens e preços**. O item registra referência própria, descrição, categoria, unidade, quantidade e fornecedor adjudicado. A referência de lote é opcional e agrupa os itens dentro do instrumento; a adjudicação permanece no item. Nesta etapa não existe um cadastro separado de lotes nem fluxo de julgamento da licitação. Categorias: combustível, ARLA, lubrificantes, peças, mão de obra, pneus, borracharia e outros. Busca por item/lote/descrição e paginação de 20 registros.

As condições de preço são registros históricos: preço por unidade (até seis casas decimais) ou percentual de desconto com tabela identificada por versão/data-base. Cada condição exige início de efeito dentro da vigência, documento de fundamento e justificativa. A consulta por data seleciona a condição aplicável; não antecipa uma condição futura. Revisões na mesma data são preservadas, prevalecendo a mais recente. Não se calcula um total fictício para descontos cuja base ainda não foi informada. As operações antigas não são reprecificadas.

Contrato derivado exige seleção de item da ata de origem, com mesmo fornecedor, unidade e categoria. A soma das quantidades distribuídas aos contratos não pode superar a quantidade do item da ata. Reduzir a ata abaixo do já distribuído também é recusado. Essa distribuição inclui os contratos em rascunho; é uma alocação contratual, não reserva operacional de abastecimento/serviço. A futura ativação/cancelamento deverá manter coerência desse cálculo. Condições de preço do contrato são conferidas e registradas separadamente; não são copiadas silenciosamente da ata.

Modelo adicional: `procurement_items` e `procurement_item_prices`, migration `20260910211314_procurement_items_prices.sql` criada pela CLI. Reutiliza o módulo `procurement`, os controles de sessão e a auditoria da etapa 2. Tabelas sem acesso direto, com RLS; quatro RPCs públicas invoker com implementação privada validada. Um bloqueio transacional no processo serializa alterações de quantidade e preço. A versão do item também muda ao registrar preço, evitando sobrescrita sobre estado desatualizado. Fornecedor, unidade e categoria com histórico não podem ser trocados; a alteração da vigência não pode excluir datas de condições já registradas. A FK diferida para os fornecedores permite a reposição das mesmas associações pelo editor antigo, mas impede remover um fornecedor usado por itens.

Validação desta rodada:

- **82 testes passaram**, incluindo sete novos cenários de banco: categorias/lotes, precisão, preço por data, desconto, revisões, limite da ata, preservação de vínculos, transação, isolamento, permissões e paginação.
- TypeScript, lint dos arquivos alterados e build Vite passaram; permanece o aviso conhecido de tamanho dos bundles.
- Navegador com página/API reais e PGlite local: item Diesel S10, lote Combustíveis, 1.000 L, preço R$ 5,123456; registro posterior de desconto de 12,5% sobre tabela fictícia; consulta anterior mostrou o preço antigo. Contrato derivado recusou 1.001 L e aceitou 600 L. Dados exclusivamente fictícios.
- Prévia reproduzível: `node tests/procurement-registry-preview.mjs --seed-items`, em `127.0.0.1:5184`, sem credenciais da nuvem. Sem a opção, a prévia começa vazia.
- Advisors locais tentados: serviço Supabase/Postgres Docker continua ausente em `127.0.0.1:54322`. Testes verificaram RLS, grants e search_path das funções no PGlite. Homologação com Auth/PostgREST e advisors completos permanece necessária antes da publicação.

Nenhum push, deploy ou alteração no banco hospedado nesta rodada. Itens e instrumentos permanecem rascunhos. Cotas financeiras e autorizações continuam usando o modelo anterior até as etapas 4/5.

## Rodada 4 — cotas e orçamento por instrumento (implementado localmente)

A ação **Tetos por secretaria** de cada ata/contrato abre o planejamento anual. O painel existente de limites ganhou a opção **Planejamento por instrumento**, mantendo os limites operacionais atuais em sua própria visualização. Cada planejamento informa teto do exercício, documento de distribuição e dotações por secretaria/categoria, com fonte e código SIM-AM opcional. Códigos são texto para preservar zeros iniciais. Uma secretaria pode ter diversas fontes/dotações; seu teto é a soma dessas parcelas, exibida no resumo por secretaria. Listagens e histórico têm paginação.

Regras: a soma dos exercícios não pode exceder o valor registrado/contratado, e o exercício precisa intersectar a vigência. A soma das dotações não pode exceder o teto anual. Contratos derivados exigem planejamento da ata no mesmo exercício: os tetos dos contratos, somados, devem caber no teto da ata, e sua distribuição deve caber na parcela da mesma secretaria/categoria. Fontes e dotações podem diferir entre ata e contrato; o limite compartilhado é verificado por secretaria/categoria. Ata e contratos derivados não são somados como recursos adicionais. Reduzir um limite da ata abaixo dos contratos já distribuídos é recusado. Alterar vigência, valor ou origem não pode invalidar planejamento existente.

Modelo adicional: `instrument_budget_plans` e `instrument_budget_allocations`, migration `20260911021152_instrument_budget_planning.sql` criada pela CLI. Revisões completas mantêm identificadores das dotações existentes, exigem documento/justificativa e registram responsável, antes/depois e versão. Bloqueio transacional no processo serializa a validação da família ata/contratos; versão antiga é recusada. Não houve teste com conexões concorrentes independentes nesta rodada.

Segurança: leitura exige módulo `budgets` e sessão válida. Edição exige administrador/superadmin com `budgets` e `procurement`. Secretário consulta somente parcelas da própria secretaria, sem valor global do instrumento, opções de outras secretarias ou histórico global. O histórico geral de licitações também oculta eventos orçamentários de usuários sem `budgets`. Tabelas com RLS e acesso direto revogado; três RPCs públicas invoker delegam para funções privadas com validações de prefeitura, papel, sessão e entrada. Não há migração automática das permissões existentes.

**Escopo de planejamento:** os novos registros continuam em rascunho. Não criam contratos/lançamentos no livro financeiro antigo e não alteram bloqueios operacionais já existentes. Valor registrado/contratado, teto planejado e saldo de empenho são conceitos separados. Saldo contábil de empenhos não foi integrado. O campo SIM-AM valida somente a forma de 28 dígitos, sem validar existência/classificação contábil nem gerar remessa ao TCE-PR. A conferência com a contabilidade permanece na etapa 6.

Validação desta rodada:

- **89 testes passaram**, incluindo sete novos cenários: múltiplas fontes, remanejamento e histórico, versões, limite entre exercícios, vigência, hierarquia ata/contratos, isolamento por prefeitura/secretaria, módulos/sessão, erros sem gravação parcial, identificadores de dotações, paginação e ausência de lançamentos no modelo antigo.
- TypeScript, lint dos arquivos alterados e build Vite passaram; permanece o aviso conhecido de tamanho dos bundles. Build gerado fora de `web/dist`.
- Navegador com página/API reais e PGlite local: teto anual fictício de R$ 10 mil, cota de Obras de R$ 6 mil; revisão dividiu a cota em R$ 4 mil na fonte 001500 e R$ 2 mil na fonte 001501. Resumo manteve R$ 6 mil para Obras e R$ 4 mil ainda não distribuídos. Histórico exibiu responsável, motivo e valores antes/depois.
- Prévia reproduzível: `node tests/procurement-registry-preview.mjs --seed-items` em `127.0.0.1:5184`; autenticação fictícia isolada, sem credenciais remotas. O fluxo manual cobriu o acesso pelo instrumento; a alternância na página antiga de limites foi verificada por compilação/lint, não por sessão autenticada integrada.
- Advisors locais tentados novamente: conexão recusada em `127.0.0.1:54322`, sem serviço Supabase/Postgres Docker. Testes locais verificaram RLS, privilégios e search_path. Advisors completos e homologação com Auth/PostgREST reais continuam pendentes antes da publicação.

Nenhum push, deploy ou alteração no banco hospedado nesta rodada. Sem contratação de plano pago.

## Rodada 5A — pré-validação de operações (implementado localmente)

Primeira entrega da etapa 5, que permanece em andamento. A inspeção de `manager_create_fueling_authorization` e do controle financeiro existente confirmou que a emissão atual ainda usa preços do posto e gatilhos do livro antigo. Antes da mudança de execução, esta rodada acrescenta uma conferência independente do planejamento. Não implementa a reserva atômica nem a emissão da nova autorização.

No planejamento de cada contrato, a ação **Simular operação** permite selecionar item/fornecedor, dotação/fonte, data e quantidade. Itens têm busca e paginação. O servidor confere vínculo entre item e dotação, categoria, exercício, vigência, quantidade cadastrada e teto da dotação. Seleciona a condição de preço pela data e revisão; desconto requer preço-base informado e referência da tabela correspondente. Multiplica com precisão decimal e arredonda o total para centavos, sem arredondar prematuramente o preço unitário com desconto. Valores de tabela informados são exclusivamente de simulação e não constituem comprovação de preço para uma autorização real.

A resposta identifica versões de instrumento, item, planejamento e preço para a conferência. Mostra incompatibilidades e valor estimado. Alterar os campos limpa o resultado anterior. A interface explica que não há reserva, autorização nem consideração dos gastos/reservas atuais: **compatibilidade com planejamento não significa saldo operacional disponível**. Não há avaliação de motorista, veículo, tipo exato de combustível ou capacidade de tanque nesta rodada; essas verificações continuam necessárias na emissão operacional. Cada simulação considera uma única dotação.

Migration `20260911022956_procurement_preflight.sql`, criada pela CLI: somente funções de leitura; nenhuma tabela nova ou mudança dos gatilhos antigos. RPC pública invoker chama implementação privada definer, com search_path vazio, sessão válida, prefeitura e módulos `procurement` e `budgets` obrigatórios. Usa o acesso de gestão global já definido para licitações; secretário não recebe dados de itens globais por essa função. Execução anônima revogada. Função STABLE, sem gravação em tabelas, incluindo auditoria (não existe ação financeira para auditar). A reserva futura deverá revalidar os dados e os saldos em transação, sem confiar neste resultado no cliente.

Validação:

- **95 testes passaram na suíte completa.** Seis novos testes SQL cobrem preço por data/revisão, desconto e base, precisão, limites, vigência, categoria, dados inválidos, vínculos incorretos, isolamento de prefeitura, módulos/sessões e ausência de reservas/abastecimentos gravados. Catálogo confirma privilégios, volatilidade e search_path.
- TypeScript, lint dos arquivos alterados e build Vite passaram; aviso de bundles grandes permanece.
- Navegador com página e API reais conectadas ao PGlite: 100 L a R$ 5,123456 geraram estimativa de R$ 512,35 diante de teto de R$ 600; 120 L geraram R$ 614,81 e os impedimentos de quantidade e teto. Alterar a quantidade removeu o resultado anterior.
- Prévia reproduzível: `node tests/procurement-registry-preview.mjs --seed-preflight`, com contrato, item e dotação fictícios em `127.0.0.1:5184`.
- Documentação oficial de funções e changelog Supabase conferidos; nenhuma mudança aplicável ao padrão utilizado. Advisors locais continuam dependendo do serviço Supabase/Postgres Docker, indisponível nesta máquina. Homologação com Auth/PostgREST reais permanece pendente.

Sem push, deploy, alteração remota ou plano pago nesta rodada.

## Rodada 5B1 — controle interno de reservas de combustível (implementado localmente)

A etapa 5B foi dividida em controle contábil e adaptação da emissão/portal. A inspeção identificou três controles que precisam coexistir: cota por secretaria, valor global do posto e cobertura por empenho. **Esta entrega implementa o controle interno e suas transições; não disponibiliza emissão pelo novo modelo na interface.** Não há RPC pública para criar reservas, e todas as funções novas têm execução revogada para clientes. O cadastro de instrumentos continua em rascunho. A função interna aceita rascunhos para os testes; antes da exposição operacional, a etapa 5B2 deverá exigir habilitação explícita e conferida do contrato.

Migration `20260911023848_procurement_fuel_reservations.sql`, criada pela CLI. A tabela `procurement_fuel_reservations` guarda vínculo com abastecimento, item, dotação, condição de preço, veículo e posto, além de quantidade autorizada, preço reservado, quantidade/valor comprometidos, estado e autoria. FK diferida exige que a reserva e o abastecimento sejam gravados na mesma transação. Identificador repetido com os mesmos parâmetros não duplica consumo nem reabre cancelamento; identificador com parâmetros diferentes é recusado. O adaptador futuro deverá reutilizar o identificador em tentativas da mesma solicitação.

A reserva valida sessão, gestão global, módulos de licitações/limites/abastecimentos, prefeitura, secretaria do veículo, fornecedor do item, categoria combustível e unidade litro, exercício, vigência, quantidade, capacidade e validade (máximo sete dias e dentro do contrato/exercício). Nesta entrega somente preço unitário positivo; desconto depende de uma base comprovada, ainda não integrada. A rotina bloqueia a prefeitura e depois o processo durante o cálculo e gravação, verifica quantidade total comprometida do item e dinheiro comprometido da dotação. A transição serializa atualizações pelo bloqueio da prefeitura. Não houve ensaio com duas conexões PostgreSQL concorrentes reais: essa homologação permanece pendente.

Transições ligadas a `fuelings` por trigger:

- Autorizado: quantidade e dinheiro ficam reservados.
- Concluído: valor e quantidade efetivos substituem a reserva, liberando a diferença. Exige preço reservado, quantidade positiva dentro da autorização e prazo válido.
- Cancelado/recusado antes da execução: libera quantidade e dinheiro. Não permite reabrir.
- Validado: mantém o realizado.
- Rejeitado depois da execução: mantém quantidade e dinheiro como contestados; não libera saldo e exige futura conciliação específica para outra destinação.

Preço, vínculo, autoria e identificação da autorização são preservados. Depois da execução, litros, preço, total e data de execução não podem ser reescritos. Registros vinculados não podem ser excluídos. Dotação com histórico não pode ser apagada ou trocar identificação; teto não pode ficar abaixo do comprometido. Item com histórico preserva vínculo e não admite quantidade menor que a comprometida. Mudanças são auditadas no histórico financeiro da licitação, com antes/depois. Expiração não libera reserva automaticamente: impede conclusão, mantendo saldo comprometido até cancelamento explícito.

O livro antigo de cotas por secretaria ignora abastecimentos com vínculo no novo controle e recusa sua associação por conciliação antiga. Abastecimentos existentes não ganham vínculo silenciosamente. Os controles globais do posto e de empenho **não foram removidos nem adaptados**: a emissão/portal novos continuam privados justamente porque essa compatibilidade precisa ser concluída. A função atual do portal ainda busca preço no posto; na etapa 5B2 deverá utilizar o preço da reserva para os registros vinculados e manter o comportamento antigo para os demais. A nova trigger rejeita conclusão com preço diferente, sem substituí-lo silenciosamente.

Validação:

- **103 testes passaram na suíte completa**, incluindo oito cenários novos. Após o ajuste final de imutabilidade de ID/autoria, os oito testes desta entrega passaram novamente.
- Testados: reserva/repetição, limite de quantidade e dinheiro, execução parcial, cancelamento, contestação, revisão de preço, entradas inválidas, permissões/sessão, prefeitura/secretaria/fornecedor, FK diferida, preservação de histórico, redução de limites e coexistência dos dois livros com auditoria.
- Exemplo: reserva de 60 L a R$ 5 compromete R$ 300; conclusão com 40 L mantém R$ 200 e devolve 20 L/R$ 100. Rejeição após execução mantém os R$ 200 contestados.
- Advisors locais tentados: serviço Supabase/Postgres Docker indisponível em `127.0.0.1:54322`. RLS e privilégios foram conferidos no PostgreSQL em memória. Não houve alteração de frontend, portanto não foi necessário repetir build/teste visual nesta entrega.

Sem push, deploy, alteração remota ou plano pago.

## Próximo passo

Etapa 5B2: conectar a emissão de autorização e o portal ao controle interno. Antes de habilitar: definir classificação explícita do combustível do item (sem inferir por descrição); validar motorista, situação/combustível do veículo, posto e documentos; manter cobertura por empenho; adaptar os limites globais do posto para não bloquear indevidamente nem somar duas vezes o novo contrato. Criar a reserva e a autorização na mesma transação, com identificador idempotente, habilitação explícita e consulta de saldos por permissão. No portal, concluir usando preço reservado e permitir repetição segura. Testar o fluxo completo com Auth/PostgREST e concorrência real antes de ativar. Depois expandir para lançamentos diretos, serviços, complementações e fechamentos, seguido de conciliação/homologação da etapa 6.
