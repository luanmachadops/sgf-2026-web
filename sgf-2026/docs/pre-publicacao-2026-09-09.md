# Pré-publicação — 09/09/2026

Publicação autorizada pelo usuário, condicionada à homologação. Ainda não foram publicadas as quatro migrations nem os novos aplicativos.

## Evidências verificadas

- Supabase FrotaMunicipal ativo, PostgreSQL 17; nenhuma branch de homologação existente. Organização `Aplciativos`, plano Free. Consulta de custo de branch depende da escolha da organização pelo usuário; não foi contratado recurso pago.
- Produção ainda tem como última migration `20260804010417_realtime_station_fiscal_grants`.
- Hostinger acessível: aplicativo principal usa GitHub `sgf-2026-web`, branch `codex/correcoes-e2e-2026-07-28`, raiz `sgf-2026`, Express e Node 22.x. Implantação exibida: `d6da6376`, concluída em 03/08/2026 às 22h05.
- Backups Hostinger: último exibido em 08/09/2026 às 17h58. Solicitado novo backup manual; painel confirmou **Em andamento**. Esse backup não comprova recuperação do PostgreSQL externo no Supabase.
- Build isolado do commit `947f347`: web, admin e servidor aprovados, 61 testes aprovados. Ambiente local Node 24.19.0. Avisos de tamanho de bundle permanecem. Artefatos preparados em `/private/tmp/sgf-production-preflight-947f347/sgf-2026`; não incluem alterações locais independentes de abastecimentos.
- Hostinger consome `dist` pré-compilado. Publicar somente os fontes sem esses artefatos deixaria a interface anterior. A publicação intermediária de cadastro deve ser construída a partir da etapa compatível `84c900f`, antes da primeira migration; a versão final com verificação de sessão só pode entrar depois das migrations necessárias.
- 106 veículos em Tapejara, dos quais **82 sem department_id e sem nome de secretaria**. Nenhuma correspondência textual segura para preenchimento automático. Nenhum vínculo existente de veículo/secretaria pertence a tenants diferentes.
- Todos os perfis administrativos examinados têm módulos definidos. Nenhuma view pública encontrada. Inventariadas 89 RPCs privilegiadas acessíveis a autenticados (incluindo funções trigger na contagem geral).
- `pg_net` no schema público tem `extrelocatable=false`; não executar ALTER EXTENSION SET SCHEMA. A configuração deve ser avaliada sem remover dependências.

## Impedimentos ainda abertos

1. Homologação em Supabase separado, com estrutura real e dados fictícios, incluindo dois clientes concorrentes e fluxos completos dos portais. Os testes embarcados não substituem essa etapa.
2. Conferir recuperação do banco Supabase, autenticação e arquivos; a sessão do painel não está autenticada. O login OAuth GitHub foi bloqueado pela revisão automática e aguarda autorização explícita ou login direto do usuário. As ferramentas SQL seguem disponíveis somente para as verificações já realizadas.
3. Conferir/ativar proteção de senhas vazadas, conforme disponibilidade do plano. Não foi alterada.
4. Informar lotação dos 82 veículos e dados contábeis reais antes de ativar suas cotas. CSV local de apoio: `/private/tmp/sgf-production-preflight-947f347/veiculos-sem-secretaria.csv`. Não inferir lotação nem valores oficiais. O CSV não foi incluído no Git.
5. Conferir versões/configurações e possibilidade de recuperação dos quatro aplicativos (principal, posto, oficina, superadmin) antes da troca. Até agora o deploy e o backup foram examinados no aplicativo principal.

## Critério de liberação

Homologação deve comprovar cadastro compatível, acesso por papel/tenant/módulo, recusa de sessão antiga bloqueada, reativação com novo login, upload/leitura de arquivos, abastecimento, manutenção, cancelamento, recebimento e limites em duas conexões. Confirmar recuperação e monitoramento imediato dos quatro aplicativos. Implantar na ordem dos relatórios anteriores. Só cadastrar limites reais depois da conferência administrativa e contábil.

A autorização para publicar já foi recebida. Os impedimentos acima são condições técnicas/dados ausentes, não uma solicitação de nova autorização geral de deploy.
