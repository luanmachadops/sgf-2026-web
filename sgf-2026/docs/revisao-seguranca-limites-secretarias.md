# Revisão de segurança e limites por secretaria

Revisão iniciada em 08/09/2026 e concluída em 09/09/2026. Projeto: Exattus Rotta / SGF 2026.

## Situação da entrega

Implementação preparada no código e em duas migrations, com testes locais. O banco e o site de produção **não foram alterados** nesta revisão. A inspeção do Supabase de produção foi somente de leitura. O usuário informou que os erros de acesso e do portal das oficinas voltaram a funcionar; não foi identificada evidência suficiente para atribuir uma causa retrospectiva à indisponibilidade.

## Solução de limites

Nova página **Configurações → Limites por secretaria**, em `/configuracoes/limites`, com combustível/operações de postos e manutenção separados. Uma licitação/contrato/ata pode reunir vários fornecedores e distribuir um teto anual entre secretarias.

Cada distribuição registra exercício, vigência, referência da contratação, teto global, fornecedores, limite da secretaria, dotação/classificação, fonte de recursos e justificativa com referência do ato autorizativo. O sistema permite saldo global ainda não distribuído. A soma das cotas nunca pode superar o teto global.

| Valor exibido | Regra |
| --- | --- |
| Reservado | Abastecimento autorizado, operação de posto autorizada ou manutenção com fluxo financeiro iniciado e ainda não recebida |
| Realizado | Abastecimento/operação concluída ou validada; manutenção recebida |
| Em contestação | Despesa executada rejeitada para análise, conservando o comprometimento |
| Disponível | Limite menos reservas, realização e contestação |

O banco aplica as regras em triggers nas três tabelas operacionais. Assim, a verificação também alcança os portais e chamadas diretas autorizadas ao banco. Uma operação acima da cota falha na mesma transação que a originou. O bloqueio da linha da prefeitura serializa cálculos concorrentes entre fornecedores; a versão da configuração impede que duas telas sobrescrevam o planejamento silenciosamente.

Outras regras:

- A secretaria é copiada da lotação do veículo ao primeiro vínculo e preservada mesmo após transferência do veículo.
- Sem secretaria ou sem cota para ela, a despesa vinculada à licitação é recusada.
- O preço usado na reserva de combustível fica preservado; alteração posterior no catálogo não reprecifica a reserva.
- A realização substitui a reserva, sem dupla contagem. Cancelar uma reserva libera saldo; cancelar uma despesa executada não apaga seu consumo.
- Aumento de valor passa novamente pelo limite. Não é possível reduzir a cota abaixo do já comprometido.
- Exclusão de registro com movimentação orçamentária é bloqueada; o fluxo deve preservar o histórico.
- Fornecedor não pode estar em duas configurações da mesma categoria com vigências sobrepostas.
- Fornecedor já incluído no controle exige configuração vigente para novas despesas. Encerrar a vigência não libera o saldo automaticamente.
- O histórico conserva antes/depois, responsável, data e justificativa, com consulta paginada. A exportação CSV traz o resumo do filtro atual.

### Permissões

| Perfil | Acesso ao novo módulo |
| --- | --- |
| Administrador municipal | Define e revisa limites; consulta todas as cotas da prefeitura e auditoria |
| Gestor | Consulta cotas da prefeitura e auditoria |
| Secretário | Consulta somente a cota da própria secretaria |
| Motorista, posto, oficina | Sem acesso ao painel; suas operações continuam sujeitas ao controle no banco |

Todos exigem perfil habilitado, prefeitura não suspensa e módulo `budgets`. Não há escrita direta nas tabelas orçamentárias para clientes autenticados, inclusive administradores; alterações passam pela função administrativa. As políticas RLS restringem as tabelas à prefeitura. O secretário recebe resumo filtrado por função e não recebe as alocações de outras secretarias.

### Implantação dos saldos e limites deste modelo

A primeira configuração concilia despesas existentes dentro da vigência e compromissos ainda abertos. Se ultrapassarem a cota proposta, o cadastro inteiro é recusado. É necessário conferir lotação dos veículos, preços, despesas e reservas antes de ativar cada contratação. O histórico anterior à implantação não contém necessariamente a lotação original; na conciliação, usa-se a lotação atual do veículo. Essa limitação exige conferência administrativa.

Despesas já executadas antes do primeiro período configurado não passam a consumir o exercício atual por uma simples validação. Alterações financeiras nesses registros são recusadas para exigir conciliação específica do exercício de origem.

Esta primeira versão ativa configurações com vigência atual, dentro de um exercício. Exercícios encerrados continuam consultáveis; não há cadastro antecipado de rascunhos futuros. Reservas abertas de períodos anteriores são conservadoramente incluídas na implantação quando ainda não possuem vínculo. A separação contábil de restos a pagar precisa ser conferida antes da ativação. Uma reserva vencida só libera saldo após cancelamento no fluxo operacional.

Há uma dotação e uma fonte por secretaria em cada configuração. Rateio da mesma despesa entre múltiplas fontes, lotes paralelos do mesmo fornecedor e remanejamento retroativo entre exercícios exigem evolução específica. Depois da criação, fornecedores, referência e vigência ficam fixos; as revisões alteram teto e cotas com justificativa. Fornecedores ainda não vinculados continuam sob os controles globais existentes: ativar uma contratação não cobre automaticamente todos os fornecedores da prefeitura.

### Relação com o controle externo

O painel oferece controle gerencial e trilha de auditoria. Não emite empenho contábil nem certifica conformidade com um Tribunal de Contas. A identificação da UF/TCE e do layout de prestação de contas não foi informada. A contabilidade deve validar classificações, fontes, limites autorizados e tratamento dos exercícios antes do uso oficial.

A referência de crédito orçamentário/classificação nos contratos consta do art. 92 da [Lei 14.133/2021](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm). As etapas de empenho e liquidação têm disciplina própria na [Lei 4.320/1964](https://www.planalto.gov.br/ccivil_03/leis/l4320.htm). Esses registros continuam nos fluxos fiscais e no sistema contábil; uma cota gerencial não os substitui.

## Segurança: achados e tratamento

As correções abaixo estão **preparadas localmente**, não aplicadas à produção.

| Prioridade | Evidência / efeito | Tratamento |
| --- | --- | --- |
| Alta | `handle_new_user` aceitava prefeitura de `raw_user_meta_data`, editável pelo usuário. A exploração por cadastro público depende da configuração de signup, não verificada nesta revisão. | Trigger passa a aceitar somente `raw_app_meta_data.tenant_id`, definido pelo servidor; sete produtores de usuários atualizados. |
| Alta | Guard existente de `profiles` não protegia a coluna posterior `allowed_modules`; o próprio usuário podia alterar a seleção. | Novo guard impede alteração das próprias permissões e alteração por não administrador. O endpoint também restringe concessão por gestores. |
| Alta | Rota genérica de gestão aceitava alvos privilegiados por UUID e permitia a gestores administrar pares. | Validação explícita dos papéis de origem/alvo; gestores só administram secretário/motorista. Parceiros e superadmin não são alvos da rota genérica. |
| Média | Senhas do pré-cadastro de motorista tinham menos caracteres que a política de 12. | Gerador compartilhado de 16 caracteres com `crypto.randomInt`, validado antes do cadastro. |
| Média | Erro na consulta de acesso de parceiro era exibido como ausência de cadastro. | Erro propagado, mensagem e ação de repetir; não oferece criação baseada em uma consulta que falhou. |
| Média | Bloqueio de parceiro tentava `signOut` passando UUID em uma API que exige token. | Usa bloqueio do Auth por `updateUserById` e perfil bloqueado; gestão genérica sincroniza o bloqueio também. Erro parcial é informado e permite repetição. |
| Média | Rotas que usam `getCaller` não validavam suspensão da prefeitura. | Verificação de status da prefeitura, com falha fechada quando indisponível. |
| Baixa | Helpers internos acessíveis por `anon`; `activity_log_ignored_cols` com search path mutável. | Revogação de EXECUTE de helpers internos e search path vazio. |
| Variável | Dependências com avisos de segurança em PDF, roteamento e utilitários. | Atualizações compatíveis de lockfiles; override de UUID do ExcelJS testado com exportação/reabertura real de XLSX. |

As respostas de gestão de acessos e parceiros recebem `Cache-Control: no-store`. As mutações da rota genérica passam a ter limite de frequência por usuário. As verificações de papel, prefeitura e módulos ocorrem no servidor.

### Pendências que a revisão não encerra

1. **Prioridade alta: abrangência do bloqueio de sessões existentes.** A inspeção encontrou helpers legados de autorização que leem papel/prefeitura sem verificar consistentemente `access_blocked` ou suspensão do tenant. Os contextos de parceiros verificam bloqueio do perfil, mas não há prova de cobertura uniforme de todas as RPCs/RLS. O bloqueio no Auth impede novos logins; não se deve afirmar revogação instantânea de todo JWT já emitido. É necessário homologar chamadas diretas com token anterior ao bloqueio e revisar políticas/contextos legados. As novas funções orçamentárias verificam essas condições.
2. **Prioridade alta: módulos legados.** `allowed_modules` controla navegação em módulos existentes; a correção de sua edição não transforma automaticamente todos os módulos em autorização de dados no servidor. Essa revisão não comprova enforcement uniforme nas RPCs antigas. No módulo de cotas, a permissão é obrigatória no banco.
3. **Prioridade média: proteção contra senhas vazadas.** O advisor do Supabase informou proteção desabilitada. Não foi alterada configuração de autenticação em produção.
4. **Operação:** o advisor sinalizou extensão `pg_net` no schema público. A transferência de extensão exige revisar dependentes antes de qualquer DDL. Tabelas privadas com RLS e sem políticas não são, por si só, uma falha de acesso: permanecem inacessíveis aos clientes.
5. **Retenção e escala:** a rota genérica de acessos ainda tem exclusão de usuário do Auth e listagem sem paginação de servidor; não foram redesenhadas nesta entrega. Revisar retenção do histórico e paginação antes de ampliar o uso dessa rota em grandes bases.

Não foram realizados testes de invasão, carga, alteração de usuários reais ou login com credenciais de terceiros. A inspeção de produção confirmou vínculos dos perfis parceiros existentes e buckets de fotos/documentos privados; isso não certifica todo o aplicativo como seguro. RLS e funções com privilégios elevados precisam de avaliação por fluxo, conforme a [documentação de segurança do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security). O bloqueio Auth usa a [API administrativa documentada](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid).

## Verificação

- `npm run test:security-budget`: 30 testes reportados pelo runner (inclui o agrupador), sem falhas. SQL executado em PostgreSQL embarcado PGlite com schema de teste e as duas migrations reais.
- Cenários: teto global, cota da secretaria, fornecedores de outra prefeitura, reservas/realização/contestação, repetição, preço preservado, exercícios antigos, transferência de veículo, redução abaixo do gasto, versões concorrentes da tela, conciliação inicial, manutenção, operações dos postos, exclusão bloqueada, secretário, tenant, escrita direta, bloqueio, módulos próprios, signup e anonimato.
- XLSX: criação, formatação condicional que chama UUID e reabertura com valores preservados.
- Painel: inspeção visual em navegador, dados fictícios isolados, valores e estados de saldo; formulário rejeitou cotas acima do teto global. [Captura do teste](limites-secretarias-preview.jpg).
- Compilações de web, administrativo e servidor verificadas com Node 24.19.0, compatível com o requisito do projeto. Avisos de tamanho de bundle permanecem.
- Auditoria final de dependências: web, servidor e administrativo com 0 alertas. O alerta baixo de esbuild no administrativo foi resolvido atualizando Vite e sua dependência dentro das faixas compatíveis.

Os testes SQL não reproduzem todas as políticas/triggers legadas e não substituem homologação no Supabase. O ensaio usa uma sessão; a serialização entre duas conexões reais precisa ser confirmada em homologação junto com os fluxos completos dos portais.

## Ordem de implantação

1. Conferir backup/recuperação, revisão do código e alterações locais independentes que não pertencem a esta entrega. Homologar com cópia sanitizada da estrutura atual, inclusive triggers existentes.
2. Publicar primeiro a etapa de segurança (commit `84c900f`, `fix: harden access management and update vulnerable dependencies`), que atualiza os produtores de `app_metadata.tenant_id`: APIs web, APIs administrativas e Edge Function `driver-registration`. Ela permanece compatível com o trigger antigo e ainda não concede o módulo `budgets`. Confirmar cadastro de motorista, gestor, parceiro e nova prefeitura.
3. Aplicar `20260908235823_access_security_and_department_budgets.sql` pelo fluxo de migrations do projeto. Confirmar que os sete produtores estão publicados antes desse passo; um produtor antigo sem app_metadata passará a falhar.
4. Aplicar `20260908235909_department_budget_control.sql`. A migration cria estruturas/regras, mas não inventa tetos ou dotações para prefeituras reais.
5. Publicar a etapa de cotas, incluindo servidor e painel com a nova rota, somente depois da migration orçamentária: o servidor passa a conceder o módulo `budgets` aos novos acessos. Se apenas o frontend chegar antes, exibe mensagem de módulo ainda não habilitado. Gerar artefatos a partir dos fontes revisados; os arquivos `dist` produzidos na verificação não integram esta alteração.
6. Homologar simultaneamente duas autorizações cujo total exceda uma cota, com conexões distintas. Uma deve ser recusada. Validar usuário bloqueado, outra prefeitura, secretário, combustível, oficina, cancelamento e recebimento.
7. Administrador e contabilidade conferem saldos anteriores, contratos, fornecedores, lotação, dotação e fonte; cadastram as cotas reais pelo painel. Reconciliar totais com documentos fiscais e guardar o ato autorizativo.

Para correção posterior, preservar tabelas de eventos e despesas. Não reverter simplesmente apagando as estruturas após haver movimentação. A retirada do novo frontend não desfaz a proteção do banco. Se houver falha no cadastro de usuários após a migration de segurança, corrigir o produtor que não envia metadados administrativos; não restaurar a confiança em user_metadata.
