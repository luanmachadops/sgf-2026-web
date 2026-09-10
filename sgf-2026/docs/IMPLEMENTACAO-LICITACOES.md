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

## Próximo passo

Implementar a etapa 3: itens, lotes, unidades/quantidades, categorias (incluindo ARLA, pneus e borracharia), adjudicação por fornecedor e condições de preço/tabela/desconto. Usar os IDs dos processos/instrumentos criados na rodada 2. Planejar o vínculo de cotas da etapa 4 sem duplicar os saldos das atas e contratos. Ler este registro para retomar sem repetir a investigação. Não ativar instrumentos antes de concluir a integração operacional e a conciliação previstas nas etapas seguintes.
