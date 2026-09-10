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

## Próximo passo

Implementar a etapa 2. Ler este registro antes de alterar o banco; não interpretar a consulta da etapa 1 como migração concluída. Definir previamente o modelo de processo/instrumento/item e regras de acesso; preservar a distinção entre ata e contratos derivados para evitar duplicidade de valores. Conferir documentos antes de associar números semelhantes. Nenhum cadastro independente, item ou vínculo operacional foi criado na rodada 1.
