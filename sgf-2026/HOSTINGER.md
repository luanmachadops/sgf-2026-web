# Publicação da Exattus Rotta na Hostinger

Este repositório contém um único serviço Node.js que publica:

- `exattusrotta.com.br`: painel de gestão e convites;
- `posto.exattusrotta.com.br`: portal do posto;
- `oficina.exattusrotta.com.br`: portal da oficina;
- `superadmin.exattusrotta.com.br`: painel do superadministrador.

## Configuração da aplicação

- Tipo: Node.js Web App
- Repositório: `luanmachadops/sgf-2026-web`
- Branch de produção: `main`
- Diretório do projeto: raiz do repositório
- Versão do Node.js: 22
- Comando de build: `npm run build`
- Arquivo de entrada: `dist-server/server.mjs`
- Comando inicial, quando solicitado: `npm start`

Cadastre no hPanel as variáveis descritas em `hostinger.env.example`, usando
os valores de produção. Nunca salve a `SUPABASE_SERVICE_ROLE_KEY` no GitHub.

## Domínios

Associe o domínio principal e os três subdomínios à mesma aplicação Node.js.
Ative SSL para todos eles e mantenha `www` redirecionando para o domínio raiz.

## Implantação contínua

Conecte o repositório pelo GitHub no hPanel. A Hostinger recompila a aplicação
quando há novos commits na branch de produção. Antes de promover uma alteração,
confirme que `npm run build` foi concluído com sucesso.
