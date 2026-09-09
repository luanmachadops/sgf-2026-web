# Paraná: sessões revogadas e conferência SIM-AM

Implementação em 09/09/2026. Complementa os commits de limites por secretaria. As mudanças são locais; esta etapa não alterou o banco, a autenticação ou o site de produção.

## Sessões e permissões

A verificação consulta a sessão efetiva em `auth.sessions`, identifica o usuário e exige perfil habilitado, status válido do motorista, prefeitura não suspensa e sessão não expirada. Alteração de bloqueio, cargo, prefeitura, secretaria ou módulos registra uma data de revogação protegida contra edição direta. Uma sessão iniciada antes dela deixa de servir; reativar acesso exige novo login. O mesmo vale para suspensão e reativação de prefeitura, com exceção do acesso global de superadministradores à gestão dos tenants.

As regras foram colocadas em três camadas:

- Políticas **restritivas** em tabelas públicas e em `storage.objects`, combinadas com as políticas anteriores. As permissões de prefeitura, secretaria e papel continuam necessárias.
- Verificação antes de requisições PostgREST e dentro das RPCs privilegiadas. As implementações anteriores ficam em schema privado, sem EXECUTE dos clientes. A migration preserva assinaturas, parâmetros padrão e dependências; aborta se encontrar um pre-request personalizado já instalado.
- APIs web/administrativas e Edge Functions conferem a sessão depois de validar o token com Auth. As funções de IA não seguem para cobrança quando não conseguem identificar uma sessão autorizada. Os painéis verificam revogação ao ganhar foco e a cada 30 segundos; no web, limpam também o cache de consultas.

O banco rejeita novas chamadas com sessão revogada independentemente do intervalo da tela. Solicitações já iniciadas seguem a semântica transacional do PostgreSQL; a alteração não cancela uma transação que já estava em execução. Dados já baixados não podem ser recolhidos. URLs assinadas previamente emitidas têm validade própria até expirar; a regra impede novas autorizações de acesso a arquivos, mas não revoga retroativamente essas URLs.

Módulos são verificados nas leituras/escritas e nas RPCs. Leituras de apoio podem ser compartilhadas por módulos que precisam de seletores ou relatórios; escrita exige o módulo responsável. Motoristas e parceiros continuam sob as regras operacionais próprias, e não sob a seleção de abas do gestor. Recursos desconhecidos não são automaticamente liberados aos gestores. Futuras tabelas ou RPCs devem receber política/guard e classificação de módulo na respectiva migration.

A opção de usar tanto RLS quanto verificações por requisição segue a separação documentada pelo [Supabase](https://supabase.com/docs/guides/api/securing-your-api): o hook de PostgREST não cobre Storage/Realtime. A validação pelo registro da sessão segue a [documentação de sessões](https://supabase.com/docs/guides/auth/sessions).

## Conferência do Paraná

Referência consultada: [página oficial de layouts SIM-AM](https://www.tce.pr.gov.br/para-o-fiscalizado/sistemas/sim-sistema-de-informacoes-municipais/layout.htm), que lista o layout geral 2026 v1.2 de 25/08/2026 e o módulo de licitações v1.2b de 03/09/2026.

O [módulo de licitações reformulado](https://www.tce.pr.gov.br/data/files/CB/B4/79/E2/56860A107A37850A026B6394/Layout%20SIMAM%20-%20Modulo%20de%20Licitacoes%20Reformulado%20-%202026%20v1.2b-%20publicado%20em%2003_09_2026.pdf) relaciona entidade, processo e classificação orçamentária (páginas 45–47), além de tratar o vínculo de empenhos com licitações/contratos e a transição dos registros antigos (páginas 130–137). A conferência adicionada guarda esses identificadores de referência e uma dotação completa por secretaria, com validação sintática de 28 dígitos. Códigos são texto para preservar zeros.

O botão **Conferência TCE-PR** exporta CSV com saldos, referências e campos ausentes. Ele identifica explicitamente que não é remessa SIM-AM. Os códigos de instrumento, modalidade, entidade e fonte precisam corresponder aos cadastros oficiais da prefeitura; a aplicação não os inventa nem afirma que os validou no cadastro do Tribunal. As alterações de referência ficam auditadas.

| Ponto | Atendimento nesta entrega |
| --- | --- |
| Teto por secretaria dentro da contratação global | Validação transacional de reservas e despesas, com histórico |
| Classificação e identificação para conferência | Campos de entidade, instrumento, origem, número/ano, modalidade e dotação por secretaria |
| Fonte | Mantida a referência informada pela contabilidade; conferir na tabela oficial vigente |
| Empenho, liquidação e pagamento | Permanecem nos fluxos fiscais existentes; devem ser reconciliados com o sistema contábil |
| Remessa e protocolo de aceitação no TCE-PR | Não gerados por este CSV; dependem da escrituração e transmissão oficial |

Não foi encontrada nas fontes consultadas uma regra que torne uma aba com esse nome ou um teto gerencial suficiente, por si só, para aprovação de contas. O painel implementa o controle solicitado e oferece evidências de sua execução. Conformidade de cada contratação depende também da LOA, dos atos autorizativos, da classificação correta e da documentação efetivamente produzida. O valor da cota não substitui crédito orçamentário nem empenho.

## Implantação e verificação

Aplicar, na ordem, as quatro migrations desta entrega: segurança de cadastro, cotas, sessões/permissões legadas e referências do Paraná. A atualização dos produtores de `app_metadata` continua precedendo a primeira migration, conforme o relatório inicial. Publicar as APIs e as cinco Edge Functions após a migration de sessões, pois passam a depender de `assert_server_session`. Publicar o frontend de referências após a última migration.

Homologar no Supabase real com os perfis administrativos, motorista e parceiros: leitura válida, bloqueio com token antigo, nova sessão após reativação, acesso fora da prefeitura, fluxos fiscais e emissão de arquivos. Executar o teste concorrente das cotas em duas conexões. Os ensaios locais usam PostgreSQL embarcado e fixtures, e não equivalem a uma remessa aceita pelo TCE.

A suíte inclui agora sessão excluída/expirada, proprietário incorreto, JWT sem session_id, bloqueio e reativação, RLS de arquivos, RPC sem pre-request, núcleo privado inacessível, backend indisponível, referências inválidas, auditoria, CSV seguro e aplicação conjunta das quatro migrations.

A proteção de senhas vazadas e a organização da extensão `pg_net`, apontadas pelo advisor no ambiente de produção, não foram modificadas por estas migrations. São configurações operacionais separadas da correção de sessões e da conferência do Paraná. Não se deve mover a extensão apenas para silenciar o alerta sem verificar sua capacidade de relocação e os dependentes.

### Resultado dos testes locais

- 61 testes aprovados, incluindo assinaturas tabulares, parâmetros padrão, sobrecargas e retorno void das RPCs protegidas.
- Builds web, admin e servidor aprovados; os bundlers ainda alertam sobre tamanho dos pacotes.
- Verificação de tipos das APIs alteradas e empacotamento de sintaxe/imports das cinco Edge Functions aprovados.
- Teste manual com dados fictícios e API em memória: abrir referências, salvar revisão e reabrir preservando código com zeros iniciais e dotação. Persistência real e auditoria foram exercitadas na suíte PostgreSQL embarcada.

A homologação integrada e a implantação no ambiente real continuam necessárias antes de considerar essas proteções ativas em produção.
