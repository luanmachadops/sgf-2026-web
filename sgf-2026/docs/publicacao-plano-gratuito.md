# Publicação mantendo o Supabase Free

O usuário confirmou que o aplicativo está em fase de testes, com dados de teste, e autorizou inclusive apagar dados caso necessário. Não há necessidade de contratar Pro nem de apagar a base para esta atualização. Nenhum serviço pago foi contratado.

## Estratégia

1. Manter testes de regras e permissões em PostgreSQL embarcado.
2. Testar concorrência em PostgreSQL 17 local com dois clientes independentes, restrito a loopback, sem conexão ao Supabase. O script encerra o processo e remove sua própria base temporária.
3. Publicar primeiro a etapa compatível de cadastro (`84c900f`). A função `driver-registration` precisa receber `app_metadata.tenant_id` antes do novo trigger de cadastro.
4. Aplicar as migrations na base remota de testes, preservando dados existentes sempre que possível. Validar nela a integração com a estrutura e os serviços reais antes de declarar a versão final pronta.
5. Publicar os artefatos finais web/admin/servidor e funções dependentes das migrations. Conferir os quatro aplicativos.
6. Não ativar cotas com valores fictícios como se fossem planejamento oficial. A lotação dos 82 veículos sem secretaria e os limites reais serão necessários quando a prefeitura passar a operar com dados reais.

## Teste de concorrência sem serviço pago

Instalação temporária validada nesta máquina:

```sh
npm install --prefix /private/tmp/sgf-free-pg --save-exact embedded-postgres@17.10.0-beta.17 pg@8.16.3
SGF_PG_RUNTIME_DIR=/private/tmp/sgf-free-pg node scripts/test-budget-concurrency.mjs
```

O pacote nativo requer seu postinstall documentado para recriar links internos. Caso o npm solicite aprovação de scripts, revisar o postinstall do pacote `@embedded-postgres/darwin-arm64` antes de aprová-lo. Não é preciso instalar ou executar o pacote no servidor de produção.

Resultado verificado: a segunda conexão aguardou o lock da primeira; depois da confirmação de R$ 400 numa cota de R$ 600, a reserva adicional de R$ 300 foi recusada. Restaram uma única despesa e R$ 400 reservados, sem gravação parcial. As quatro migrations foram aplicadas à estrutura de teste desse ensaio. A suíte de 61 testes também continuou aprovada.

## Recuperação e limites

Backup manual da Hostinger confirmado em 09/09/2026 às 14h19. Ele cobre a hospedagem, não o PostgreSQL externo. O plano Free não oferece o backup gerenciado exibido nos planos pagos. A autorização para usar uma base descartável de testes permite este ensaio remoto sem contratar backup gerenciado; isso não deve ser interpretado como garantia de recuperação de dados reais.

Antes de inserir dados reais, preparar backup lógico manual com conexão PostgreSQL segura e testar a restauração. Arquivos do Storage precisam de cópia própria, além dos metadados do banco. Não colocar senhas, tokens, dumps de usuários ou documentos no Git.

## Estado da publicação

- Commit `84c900f` enviado à branch de hospedagem e validado nos quatro aplicativos.
- Atualização de `driver-registration` publicada com sucesso no Supabase (`v10`, ACTIVE) incluindo `app_metadata.tenant_id` e verificação de sessões ativas via `_shared/session-access.ts`.
- As outras 4 Edge Functions com IA e importação foram publicadas com verificação de sessão ativa:
  - `driver-cnh-extract` (`v6`, ACTIVE)
  - `drivers-import-extract` (`v2`, ACTIVE)
  - `vehicle-ai-extract` (`v11`, ACTIVE)
  - `vehicles-import-extract` (`v5`, ACTIVE)
- 4 migrations aplicadas com sucesso no Supabase de produção:
  - `20260908235823_access_security_and_department_budgets.sql`
  - `20260908235909_department_budget_control.sql`
  - `20260909113403_active_sessions_and_legacy_access.sql` (ajuste idempotente no `storage.objects` para contornar restrição de ownership no Postgres gerenciado)
  - `20260909114100_parana_budget_reconciliation.sql`
- Artefatos de produção reconstruídos com sucesso (`web/dist`, `admin/dist` e `dist-server/server.mjs`).
- Suíte completa de 61 testes de segurança e orçamento executada e 100% aprovada (`61 passed, 0 failed`).
- Deploy em produção subindo para a branch `codex/correcoes-e2e-2026-07-28` consumida pela Hostinger.

## Atualização da etapa de licitações — 12/09/2026

- As 15 migrations de licitações, combustível, operações de postos, oficinas e conciliação foram aplicadas com sucesso no projeto Supabase `FrotaMunicipal` (`kgxdrgbxpfoebzrphtqg`), após as quatro migrations de segurança/Paraná.
- As tabelas novas estão com RLS; o acesso direto por clientes está revogado; não há registros centrais nem contratos habilitados (`procurement_fuel_rollouts` e `procurement_station_rollouts` permanecem vazias).
- Os dados existentes foram preservados: 1 prefeitura, 7 perfis, 106 veículos, 547 abastecimentos e 33 ordens de serviço antes da ativação dos novos fluxos.
- O gate local `npm run release:preflight` foi executado com 145 testes aprovados e builds web, superadmin e servidor aprovados. A concorrência PostgreSQL independente continua aguardando `SGF_PG_RUNTIME_DIR`.
- Os advisors remotos permanecem com alertas legados de `pg_net`, funções `SECURITY DEFINER`, proteção de senhas vazadas e políticas permissivas. Eles não foram alterados automaticamente porque envolvem fluxos antigos e configuração do plano.
- Nenhum valor de teto foi cadastrado e nenhum rollout foi habilitado. A ativação operacional exige primeiro login real de gestor, conferência contábil e validação TCE-PR/SIM-AM.
