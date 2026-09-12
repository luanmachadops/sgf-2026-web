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

## Rodada 5B2 — emissão e conclusão vinculadas (implementado localmente)

As migrations `20260911105457_procurement_fuel_classification.sql` e `20260911105731_procurement_fuel_workflow.sql` conectam a autorização ao controle da rodada 5B1. Os itens de combustível exigem classificação explícita (diesel, gasolina ou etanol), inclusive nos contratos derivados. Registros antigos não são classificados automaticamente. Classificação com histórico de reserva não pode ser alterada.

A simulação oferece preparação de autorização para item de combustível em litros, preço unitário e permissões correspondentes. A emissão valida motorista, veículo, combustível, posto, vigência, quantidade, dotação e cobertura pelo controle de empenhos existente. Reserva e autorização são gravadas na mesma transação. O preço vigente na emissão fica preservado com seis casas decimais; a data escolhida na simulação não altera essa regra. Identificador repetido com os mesmos dados retorna a autorização existente; parâmetros divergentes são recusados.

O portal conclui a autorização pelo preço reservado e exige comprovante existente no caminho de armazenamento da prefeitura/posto/autorização. Conclusão parcial libera a diferença, conforme o controle anterior. Repetição dos mesmos dados não duplica o lançamento. O endpoint antigo também encaminha registros vinculados à nova validação. Registros sem vínculo mantêm o caminho legado. A habilitação antiga do contrato do posto não bloqueia o contrato central, mas o posto precisa estar ativo.

O cálculo do limite global antigo exclui os abastecimentos vinculados ao novo contrato; a cobertura fiscal por empenho continua incluindo seu consumo. O vínculo contábil individual entre nova dotação e empenho ainda não foi implementado. Relatórios antigos do posto ainda precisam de conciliação e separação por instrumento na etapa 6.

**Habilitação controlada:** `procurement_fuel_rollouts` começa sem contratos habilitados, tem RLS e não oferece escrita por clientes. A interface não permite ativação. Somente o contrato fictício da prévia local foi habilitado. Instrumentos continuam em rascunho; a disponibilização hospedada depende da homologação abaixo.

Validação:

- **111 testes passaram** na suíte completa, incluindo classificação, isolamento, permissões, emissão/conclusão, repetição segura, preço reservado, cancelamento, comprovante e recusa por empenho insuficiente com reversão integral da reserva.
- TypeScript, lint dos arquivos alterados e build Vite passaram. Build fora de `web/dist`; permanece aviso de tamanho dos bundles.
- Navegador local: seleção de contrato, item Diesel e dotação de Obras; simulação de 60 L a R$ 5,123456, total R$ 307,41; escolha de veículo e motorista e emissão confirmada. A prévia usa componentes reais e SQL em PGlite, com adaptadores e autenticação fictícios. Não equivale a homologação integrada de Auth/PostgREST/Storage.
- Os testes de conclusão executam a nova rotina SQL e funções financeiras reais com estrutura local de apoio; o caminho legado de conclusão é simulado na fixture. Não houve teste manual do portal autenticado nem teste com duas conexões PostgreSQL concorrentes reais.
- Advisors locais tentados: conexão recusada em `127.0.0.1:54322`, sem serviço Supabase/Postgres Docker. Advisors completos, autenticação/armazenamento reais e concorrência permanecem pendentes antes da ativação.

Sem push, deploy, alteração remota ou plano pago nesta rodada.

## Rodada 5C1 — reservas internas de ARLA e serviços de postos (implementado localmente)

Migration `20260911164848_procurement_station_reservations.sql`, criada pela CLI Supabase. Acrescenta o controle interno `procurement_station_reservations`, sem RPC pública de emissão e sem alterações nas telas. A função de reserva exige gestor global, sessão válida e módulos `procurement`, `budgets` e `stations`, mas não pode ser executada diretamente por clientes. A tabela tem RLS e privilégios diretos revogados.

O controle aceita categorias ARLA, lubrificantes, mão de obra e borracharia **fornecidas por posto**. Confere contrato, vigência, exercício, secretaria do veículo, fornecedor, catálogo ativo, categoria e unidade. O catálogo é selecionado explicitamente; não há associação por semelhança de descrição. A unidade SERV do contrato corresponde a SERVICO no catálogo, sem conversão de quantidades. Peças, pneus, Outros e serviços de oficinas não são aceitos neste adaptador. ARLA e lubrificantes não são tratados como combustível de propulsão nem usam a capacidade do tanque como teto.

Quantidade e valor ficam reservados por item e dotação. A reserva usa o preço unitário positivo vigente do contrato, preservado com seis casas decimais; ignora o preço avulso do catálogo. Desconto com tabela ainda exige futura integração documental. Revisar preços afeta novas reservas, sem reescrever as anteriores. A função bloqueia prefeitura e processo na mesma ordem do controle anterior; reserva e INSERT da operação precisam ocorrer na mesma transação, assegurados por FK diferida. Identificador repetido com os mesmos dados e autor não duplica consumo nem reabre cancelamento.

Transições: conclusão parcial mantém apenas quantidade/valor executados; cancelamento anterior à execução libera o saldo; rejeição depois da execução conserva a despesa como contestada. Expiração impede conclusão, mas não libera saldo automaticamente. Vínculos, unidade, preço, autoria e identificação da autorização são imutáveis. Depois da execução, quantidade, total, responsável, hodômetro e comprovantes não podem ser reescritos. Histórico impede apagar a dotação ou trocar sua identificação; quantidade do item e teto da dotação não podem ficar abaixo do comprometido. Eventos de reserva/transição ficam na auditoria orçamentária do processo.

Operações vinculadas não são cobradas novamente no livro antigo de cotas. Operações existentes não ganham vínculo automaticamente. As categorias dos controles de combustível e destas operações são distintas e não compartilham uma mesma dotação; os guardas anteriores continuam ativos.

**Limite desta entrega:** os controles antigos de valor global do posto e cobertura por empenho continuam sem adaptação para estas operações. A função interna não ativa contrato nem substitui as validações de emissão/portal. A 5C2 deverá conferir habilitação, situação do posto/veículo/motorista, associação operacional do catálogo, cobertura fiscal e existência/autoria do arquivo no Storage, além de encaminhar clientes antigos com segurança. O gatilho desta rodada exige referência de comprovante e autoria preenchidas, mas não certifica a existência do arquivo. Não habilitar operações centrais por chamadas internas manuais no ambiente hospedado.

Validação:

- **120 testes passaram** na suíte completa, incluindo nove cenários novos executados em PGlite com as migrations anteriores, campos de apoio e as restrições de execução/quantidade do esquema de operações.
- Conferidos: reserva/repetição, consumo parcial, cancelamento, contestação, precisão e revisão de preço, teto/quantidade, FK diferida sem gravação parcial, compatibilidade do catálogo, unidades, ausência de cobrança no livro antigo, isolamento, permissões, sessão, RLS, privilégios e search_path.
- Exemplo: 60 unidades a R$ 5,123456 reservam R$ 307,41; concluir 40 mantém R$ 204,94. Revisão para R$ 7 afeta somente a nova autorização.
- Advisors locais tentados: conexão recusada em `127.0.0.1:54322`, sem Supabase/Postgres Docker. Permanecem pendentes os advisors completos e a homologação integrada, incluindo conexões concorrentes independentes. Não há interface nova a testar nesta rodada; build frontend não foi repetido.
- Changelog e documentação oficial de funções Supabase consultados em 11/09/2026; nenhuma alteração encontrada exigiu mudança no uso de PL/pgSQL, privilégios ou funções privadas desta entrega.

Sem push, deploy, alteração remota, exclusão de dados do usuário ou plano pago.

## Rodada 5C2 — emissão e portal de operações complementares (implementado localmente)

Migration `20260911170412_procurement_station_workflow.sql`, criada pela CLI. A simulação do planejamento agora oferece **Preparar autorização complementar** para ARLA, lubrificantes, mão de obra e borracharia fornecidos por posto, nas unidades compatíveis. O formulário recebe o contrato/item/dotação selecionados e solicita correspondência explícita no catálogo, veículo, motorista, quantidade, validade e observação. A conferência da especificação do catálogo permanece responsabilidade do gestor; o banco verifica fornecedor, categoria e unidade, sem inferir equivalência pelo nome. O preço é o vigente no contrato no momento da emissão, independentemente da data/preço da simulação e do preço avulso do catálogo.

A emissão valida sessão, prefeitura e módulos, habilitação específica do contrato, situação do veículo/motorista/posto, categoria, quantidade, dotação e cobertura fiscal pelo controle de empenhos existente. Reserva e operação são gravadas na mesma transação, com identificador reutilizado nas tentativas do formulário. Repetição idêntica retorna o registro existente; parâmetros diferentes são recusados. O controle global antigo do posto exclui as operações vinculadas ao contrato central; o cálculo fiscal por empenho continua incluindo seu consumo. Não há vínculo contábil individual dotação–empenho nesta entrega.

**Habilitação independente:** `procurement_station_rollouts` não habilita nenhum contrato automaticamente, tem RLS e não admite escrita por clientes. Habilitar combustível não habilita operações complementares. Apenas a fixture local habilita o contrato fictício; os instrumentos continuam em rascunho até a implantação controlada.

O endpoint já usado pelo portal encaminha operações vinculadas à validação nova e mantém operações antigas na implementação anterior. Exige sessão e posto corretos/ativos, hodômetro positivo, número do comprovante, caminho do arquivo na prefeitura/posto/operação e objeto existente pertencente ao usuário que conclui. O preço reservado e as transições da 5C1 são preservados. A repetição com os mesmos valores, responsável e caminho do comprovante retorna a conclusão existente; divergências são recusadas. A data vencida do cadastro contratual antigo do posto não impede concluir o novo contrato.

No cliente, o mesmo arquivo é reutilizado durante tentativas na sessão. Falha na resposta da RPC não remove automaticamente o comprovante, pois a transação pode ter sido concluída. A referência temporária não persiste após recarregar a página; consultar novamente as pendências evita executar uma operação já concluída. Arquivos enviados sem conclusão podem permanecer sem referência e exigem futura limpeza conferida; não foram excluídos arquivos remotamente.

O painel de operações permite ao gestor autorizado cancelar uma autorização vinculada ainda não executada, inclusive vencida, com motivo registrado no histórico e liberação do saldo. Repetição não duplica o cancelamento. Despesas executadas não podem ser canceladas por esse caminho e continuam sujeitas à validação/contestação.

Validação:

- **127 testes passaram** na suíte completa, incluindo sete cenários de emissão/conclusão, reversão integral por empenho insuficiente, habilitação separada, permissões, dados inválidos, autoria/caminho do comprovante, repetição, cancelamento auditado e coexistência com o fluxo legado.
- Testes usam funções SQL de emissão/conclusão/listagem/fiscal do projeto em PGlite. Contextos auxiliares de parceiros/gestores e Storage são fictícios; não equivalem a sessões reais e upload autenticado integrado.
- TypeScript, lint dos arquivos alterados e build Vite passaram. Build fora de `web/dist`, com o aviso conhecido de tamanho dos bundles.
- Navegador: contrato e dotação de Obras, simulação de 60 L de ARLA por R$ 307,41, escolha do item correspondente no catálogo, veículo/motorista e emissão confirmada pelo formulário/API reais ligados ao banco local. Prévia reproduzível: `node tests/procurement-registry-preview.mjs --seed-station`. A adaptação local do import da API foi corrigida para encaminhar o catálogo à fixture.
- Cancelamento e conclusão foram conferidos em SQL, sem teste manual autenticado do portal/armazenamento real nesta rodada. Advisors locais: conexão recusada em `127.0.0.1:54322`. Homologação integrada e concorrência com conexões PostgreSQL independentes continuam pendentes antes da ativação.
- Documentação oficial de [autoria de objetos no Storage](https://supabase.com/docs/guides/storage/security/ownership) consultada: a conferência prioriza `owner_id`, com compatibilidade de leitura para `owner` legado.

Sem push, deploy, alteração no banco hospedado ou plano pago.

## Rodada 5D1 — classificação dos itens de orçamento (implementado localmente)

Migration `20260911215046_workshop_quote_classification.sql`, criada pela CLI. O orçamento da oficina passa a exigir categoria e unidade explícitas por linha. Peças, pneus, lubrificantes, ARLA, mão de obra e borracharia ficam distinguíveis; unidades disponíveis: UN, H, L, KG, KM e SERV. Oficina e gestor visualizam essa classificação. Preço unitário admite seis casas decimais; quantidade mantém duas; o total é arredondado em centavos depois da soma.

O novo endpoint v3 valida sessão, oficina, prefeitura, situação da OS, validade e conteúdo dos itens. Substituição cria nova versão, preservando a classificação anterior; não se pode alterar unidade/categoria diretamente. Orçamentos antigos permanecem sem classificação e são identificados assim na tela, sem inferências ou preenchimento retroativo. Clientes legados ainda podem enviar itens não classificados pelos endpoints anteriores.

Esta rodada não associa itens a contratos/dotações nem reserva saldo contratual. A futura aprovação vinculada deverá exigir classificação completa e correspondência explícita. A migration precisa preceder a publicação do frontend; nada foi aplicado remotamente.

Validação em 12/09/2026:

- **133 testes passaram**, incluindo seis cenários novos: precisão, compatibilidade, entradas inválidas e reversão, versões, preservação do legado, isolamento, sessão e privilégios.
- Um teste anterior foi estabilizado simulando nova sessão após a alteração de permissões. A revogação de sessões em produção permanece intacta.
- TypeScript, lint dos arquivos alterados e build Vite passaram; build em diretório temporário, com aviso conhecido de tamanho dos bundles.
- Navegador local: classificação Peças/UN, quantidade 2 e preço 25,123456 exibiram total de R$ 50,25. A automação do calendário não manteve a validade no estado do formulário; o envio manual completo não foi confirmado. O envio SQL foi validado pelos testes. Prévia reproduzível: `node tests/workshop-quote-preview.mjs`.
- Fixture usa PGlite e contextos de autenticação fictícios. Não equivale a homologação de Auth/PostgREST/RLS completos. Advisors locais tentados sem sucesso por ausência do serviço em `127.0.0.1:54322`; permanecem pendentes homologação integrada e concorrência PostgreSQL real.

Sem push, deploy, alteração remota ou plano pago.

## Rodada 5D2 — vínculo do orçamento ao contrato e à dotação (implementado localmente)

Migration `20260912034547_workshop_quote_procurement_links.sql`, criada pela CLI Supabase. O gestor recebe, para cada linha do orçamento, somente os itens de contratos da mesma oficina que tenham categoria, unidade, vigência, preço unitário e dotação compatíveis. A dotação é filtrada pela secretaria do veículo da ordem de serviço e pelo exercício vigente. Não há associação por texto ou por semelhança de descrição.

O vínculo registra item contratual, dotação, condição de preço, valor unitário vigente, autor e horário. Cada alteração exige justificativa e gera evento de auditoria no processo da licitação. Tabelas internas permanecem sem acesso direto de clientes, com RLS e funções públicas invocadoras protegidas por sessão, papel de gestão e módulos de manutenções, licitações e limites.

A aprovação do orçamento passou a exigir que todos os itens estejam classificados e vinculados. Ela repete a validação completa no banco, inclusive o preço vigente, antes de mudar a OS para aguardando empenho. Assim, uma revisão de preço, vigência, item, contrato ou dotação depois da seleção não é aceita silenciosamente. Orçamentos antigos sem categoria/unidade devem receber uma nova versão da oficina para entrar neste fluxo.

Esta etapa ainda não reserva nem consome quantidade ou saldo da dotação. O valor salvo é a evidência da conferência, não um empenho ou autorização de fornecimento. A próxima entrega fará a reserva transacional, suas transições e a conciliação com o recebimento/pagamento da OS.

Validação em 12/09/2026:

- **137 testes passaram** na suíte completa. Os quatro cenários novos cobrem candidatura compatível, auditoria sem reserva, rejeição por preço/unidade/secretaria/vínculo, revalidação na aprovação, sessão, privilégios e RLS.
- TypeScript, lint dos arquivos alterados e build Vite passaram. O build temporário mantém o aviso conhecido de bundle principal acima de 500 kB.
- Advisors locais foram tentados, mas o PostgreSQL/Supabase Docker não está disponível em `127.0.0.1:54322`. A homologação integrada de Auth/PostgREST/RLS, concorrência PostgreSQL real e validação manual autenticada permanecem pendentes antes de qualquer ativação.

Sem push, deploy, alteração remota ou plano pago.

## Rodada 5D3 — reserva e realização do orçamento da oficina (implementado localmente)

Migration `20260912040123_workshop_quote_reservations.sql`, criada pela CLI Supabase. A aprovação de um orçamento já classificado e vinculado passa a criar, na mesma transação, uma reserva por linha: item contratual, dotação, condição de preço, quantidade, valor em centavos, responsável e horário. A soma das linhas reproduz exatamente o total aprovado do orçamento; as frações são distribuídas em centavos sem alterar o preço unitário registrado.

Antes da reserva, o banco repete a conferência de sessão, módulos de manutenções/licitações/limites, prefeitura, secretaria do veículo, oficina contratada, vigência, categoria, unidade, preço unitário vigente, quantidade do item e teto da dotação. O teto considera também reservas vigentes de operações complementares dos postos que compartilhem a mesma dotação. Falha em qualquer linha desfaz integralmente a aprovação e a reserva.

Cancelar a ordem em fase de empenho libera as quantidades e valores comprometidos, preservando o histórico e a auditoria. Receber o veículo após serviço concluído e empenhado converte a reserva em realização, conservando quantidade e valor como evidência do consumo contratual. A ordem não pode ser cancelada ou recebida por atualização direta enquanto a transição correspondente não ocorrer. Linhas do orçamento, vínculos, item e dotação com histórico não podem ser apagados ou ter sua identificação reduzida abaixo do comprometido.

O livro de reservas é interno, com RLS e privilégios diretos revogados. As únicas transições são os fluxos existentes de aprovação, cancelamento e recebimento, agora protegidos pela mesma sessão e pelos três módulos requeridos. Cada criação, liberação ou realização é gravada na auditoria da licitação com antes/depois e justificativa operacional.

Validação em 12/09/2026:

- **140 testes passaram** na suíte completa. Os sete cenários do orçamento/oficina cobrem vínculo, preço, categoria, unidade, secretaria, reserva atômica, concorrência com o saldo de posto, teto e quantidade, liberação no cancelamento, realização no recebimento, imutabilidade, sessão, RLS e privilégios.
- `supabase db advisors --local` foi executado, mas o Docker/PostgreSQL local não está disponível em `127.0.0.1:54322`. Os controles de RLS, grants e funções foram verificados no PGlite. Changelog e documentação atuais do Supabase foram revisados; não houve mudança aplicável à migration.
- A fixture de teste representa a integração entre os dois livros de reservas. Ela não substitui homologação com Auth/PostgREST/Storage reais nem ensaio de concorrência em conexões PostgreSQL independentes.

Sem push, deploy, alteração remota, exclusão de dados ou plano pago.

## Rodada 5D4 — nota fiscal, itens entregues, glosa e ateste (implementado localmente)

Migration `20260912041412_workshop_invoice_attestation.sql`, criada pela CLI Supabase. A nota fiscal da oficina passa a guardar linhas ligadas aos itens do orçamento e às reservas realizadas: quantidade entregue, preço contratual preservado e valor da linha. O endpoint seguro atual (`repair_shop_submit_invoice_v2`) foi mantido e, quando a OS possui reserva contratual, cria automaticamente as linhas restantes; o endpoint v3 aceita o detalhamento explícito para emissões parciais ou múltiplas notas.

O banco recusa valor total divergente da soma das linhas, quantidade acima do saldo realizado, preço diferente da reserva, item de outra OS, arquivo fora do diretório privado da oficina/OS e repetição do número da nota com dados diferentes. Linhas da nota são internas, têm RLS, privilégios diretos revogados e ficam imutáveis depois do envio. O evento fiscal registra o arquivo e a auditoria da licitação registra a nota por processo/contrato.

O ateste continua condicionado ao recebimento do veículo e agora valida a linhagem da nota. O gestor pode informar glosa e justificativa; o sistema grava o valor líquido atestado e preserva o valor bruto da NF. O pagamento foi ajustado para usar o valor líquido atestado, impedindo pagamento acima do saldo depois da glosa. O ateste repetido só é idempotente quando a glosa informada coincide com a já registrada.

Validação em 12/09/2026:

- **142 testes passaram** na suíte completa. A etapa acrescentou cenários de emissão automática itemizada, divergência de total, excesso de quantidade, arquivo fora da OS, glosa auditada, pagamento limitado ao valor líquido, isolamento, RLS e privilégios.
- TypeScript passou; o build Vite passou. O lint direto dos dois arquivos alterados passou. O comando geral de lint continua apontando problemas preexistentes em outros arquivos do projeto.
- Advisors locais não puderam conectar ao PostgreSQL/Supabase Docker em `127.0.0.1:54322`; não houve alteração no banco hospedado.

Sem push, deploy, alteração remota, exclusão de dados ou plano pago.

## Rodada 6A — conciliação fiscal por instrumento e fila do legado (implementado localmente)

Migration `20260912042702_procurement_fiscal_reconciliation.sql`, criada pela CLI Supabase. O relatório fiscal agora parte das dotações do planejamento anual e retorna uma linha por instrumento, exercício, secretaria e categoria, com processo, ata/contrato, dotação, apropriação, fonte, código SIM-AM, valor declarado, teto planejado, reserva pendente, realização, contestação e saldo. Para as oficinas, os valores de faturamento, ateste (já líquido de glosa) e pagamento são distribuídos pelas linhas efetivamente ligadas à reserva contratual; o pagamento é rateado pelas linhas da ordem para não duplicar o total quando existem várias dotações.

Postos e abastecimentos ainda não possuem um ciclo de NF/ateste/pagamento no modelo central; por isso o relatório deixa esses marcos como `NULL`, preservando a diferença entre “não modelado” e “zero”. Reserva, realização e contestação são estados mutuamente exclusivos e somente sua soma consome o teto da dotação.

O RPC `get_procurement_legacy_reconciliation` oferece uma fila somente leitura dos lançamentos do livro antigo que ainda não possuem reserva central comprovada. A fila informa origem, contrato legado, secretaria, fornecedor, veículo, valores e situação `pending`, sem migrar, apagar ou atribuir automaticamente a despesa a um instrumento novo. Esse resultado será a base da próxima etapa de conciliação assistida, com justificativa e auditoria por lançamento.

Os dois RPCs exigem sessão vigente, papel de gestão/secretaria, módulo de limites e relatórios, prefeitura correspondente e escopo da secretaria para o papel `secretario`. As tabelas e implementações privadas continuam com RLS e privilégios diretos revogados; `anon` não executa as funções. A etapa é somente leitura e não altera dados operacionais nem habilita contratos.

O catálogo de Relatórios agora expõe **Conciliação Fiscal das Licitações** e **Fila de Conciliação do Legado**. Ambos usam a mesma janela de exportação PDF/Excel dos demais relatórios; o filtro de período é interpretado como exercício quando as datas pertencem ao mesmo ano. A fila aparece separada para impedir que o usuário confunda valor legado ainda não conciliado com consumo do instrumento central.

Validação em 12/09/2026:

- **144 testes passaram** na suíte completa. Foram acrescentados cenários de conciliação oficina (teto, realização, NF, glosa, ateste e pagamento), fila de legado sem atribuição automática e privilégios dos novos RPCs.
- A fixture confirma que um teto de R$ 600 com R$ 50 realizado, R$ 50 faturado, R$ 45 atestado e R$ 45 pago permanece consumido em R$ 50, com saldo de R$ 550.
- `supabase db advisors --local` continua sem conexão porque o PostgreSQL/Supabase Docker não está disponível em `127.0.0.1:54322`; a verificação feita em PGlite cobre a migration, RLS, grants, sessão e isolamento, mas não substitui a homologação integrada nem o ensaio de concorrência real.
- TypeScript, build Vite e lint direto dos arquivos web alterados passaram; o build mantém o aviso conhecido de bundle principal acima de 500 kB. O lint geral do projeto continua com falhas preexistentes em arquivos fora desta etapa.

Sem push, deploy, alteração remota, exclusão de dados ou plano pago.

## Rodada 6B — conciliação assistida do legado (implementado localmente)

Migration `20260912044001_procurement_legacy_reconciliation.sql`, criada pela CLI Supabase. A fila de lançamentos antigos agora pode ser tratada individualmente por um gestor autorizado: ele seleciona o instrumento e a dotação da mesma secretaria e exercício, informa justificativa e referencia ao menos um documento HTTPS. O banco confere prefeitura, exercício, secretaria, existência do lançamento, saldo da dotação e ausência de reserva central anterior.

O vínculo é imutável e idempotente. Ele não altera `budget_entries`, não cria uma nova reserva operacional e não apaga dados; grava um snapshot dos valores legado, o responsável, o horário, os documentos e o evento `legacy_reconciliation` no processo da licitação. A entrada deixa a fila pendente e passa a ser exibida como **legado conciliado** no relatório fiscal, com valor separado antes de compor o consumo e o saldo da dotação.

O painel de relatórios ganhou a ação **Conciliar** na fila do legado. A tela carrega somente planejamentos do exercício e dotações da secretaria do lançamento. Secretários, parceiros, motoristas e usuários sem os módulos explícitos não recebem a ação. O documento é armazenado como referência HTTPS; a existência e o conteúdo do arquivo devem ser conferidos no procedimento documental da prefeitura.

Validação em 12/09/2026:

- **145 testes passaram** na suíte completa. A rodada acrescentou idempotência, documento obrigatório, saldo da dotação, isolamento, saída da fila, evento de auditoria, soma do legado conciliado e privilégios da tabela/RPC.
- TypeScript, build Vite e lint direto dos arquivos web alterados passaram; o build mantém o aviso conhecido de bundle principal acima de 500 kB. O lint geral continua com falhas preexistentes fora desta etapa.
- `supabase db advisors --local` continua dependente do PostgreSQL/Supabase Docker em `127.0.0.1:54322`; a migration foi exercitada em PGlite com a cadeia anterior, mas ainda falta a validação integrada de Auth, PostgREST, Storage e concorrência PostgreSQL.

Sem push, deploy, alteração remota, exclusão de dados ou plano pago.

## Rodada 6C — gate de pré-publicação local (implementado localmente)

O script `npm run release:preflight` reúne a verificação que pode ser repetida sem contratar uma branch do Supabase. Ele confere a presença e a ordem das migrations de segurança, cotas, sessões, referências do Paraná, licitações, postos e oficinas; garante que as duas tabelas de habilitação operacional iniciem desativadas; executa os 145 testes da suíte; recompila web, superadmin e servidor; e, quando `SGF_PG_RUNTIME_DIR` está configurado, executa o ensaio de concorrência em duas conexões PostgreSQL embarcadas.

O modo `node scripts/release-preflight.mjs --strict` transforma avisos em bloqueio. Sem o runtime PostgreSQL, o modo normal conclui a parte local e registra que a concorrência real ainda não foi executada. O script não faz `db push`, não publica migrations, não altera dados e não envia credenciais para fora da máquina.

Validação desta rodada:

- Suíte integrada: **145 testes aprovados**.
- Build web, superadmin e servidor: aprovados.
- Migrations e flags de habilitação: conferidas pelo gate.
- Advisors e Auth/PostgREST/Storage reais: ainda dependem de ambiente Supabase disponível.

A etapa 6C local está concluída. A liberação estrita de produção continua condicionada à homologação remota, recuperação, concorrência PostgreSQL independente e conferência contábil/TCE-PR/SIM-AM.

## Próxima etapa

Executar o gate em um PostgreSQL/Supabase de homologação disponível, aplicar as migrations em ordem, testar os quatro painéis com sessões reais, conferir a recuperação e somente então preparar a publicação controlada.
