-- ============================================================================
-- FIX: uploads de imagem quebrados no bucket `fotos`
--
-- STATUS: *** APLICADA em 2026-07-25 *** — verificada com a anon key:
--   upload anônimo → 403 "new row violates row-level security policy"
--   leitura pública de foto existente → 200 (não regrediu)
--
-- COMO FOI APLICADA (para a próxima vez que mexer em storage):
--   `storage.objects` pertence a `supabase_storage_admin` e a conexão entra
--   como `postgres`. Mesmo assim, `create policy` PASSA via execute_sql —
--   o que NÃO passa é `comment on policy` (exige ownership) e
--   `grant supabase_storage_admin to postgres` (membership reservada a
--   superusuário). Como o lote roda em transação, um COMMENT no meio derruba
--   as policies criadas junto: aplique **um statement por vez, sem COMMENT**.
--   As três policies `fotos_public_*` foram removidas pelo dashboard
--   (Storage → Policies), que é o caminho para DROP.
--
-- HISTÓRICO DO DIAGNÓSTICO (não apagar — explica a ordem das operações):
--   ✅ Aplicado por SQL: limite de 10 MB e allowed_mime_types (só imagens) no
--      bucket `fotos`; 20 MB em `documentos`. Reduz o alcance da brecha —
--      anônimo não consegue mais hospedar arquivo arbitrário no domínio.
--   ⛔ PENDENTE: as policies abaixo. `storage.objects` pertence a
--      `supabase_storage_admin`, e a conexão do MCP/CLI entra como `postgres`,
--      que não é dono nem pode se conceder a role ("role memberships are
--      reserved, only superusers can grant them"). O SQL editor do dashboard
--      tem a mesma limitação.
--      COMO APLICAR: Supabase Dashboard → Storage → Policies → bucket `fotos`.
--      Apagar as três policies `fotos_public_*` (INSERT/UPDATE/DELETE, que hoje
--      valem para o papel `public`, incluindo anônimo) e criar as quatro
--      `fotos_auth_*` abaixo, todas com target role `authenticated`.
--
-- EXPOSIÇÃO REAL (medida com a anon key em 2026-07-25, não inferida):
--   • INSERT anônimo → HTTP 200. Qualquer pessoa cria objetos no bucket.
--   • UPDATE/DELETE anônimo → HTTP 403 "Access denied".
--   O motivo do 403 é o próprio bug deste arquivo: sem policy de SELECT,
--   sobrescrever e apagar são impossíveis para TODO MUNDO (é por isso que os
--   uploads do painel quebraram). Ou seja, hoje o anônimo consegue DESPEJAR
--   arquivos, mas não adulterar nem destruir os existentes.
--
-- ⚠️ ORDEM IMPORTA — NÃO aplique só a metade "consertar upload":
--   criar `fotos_auth_select` sem antes remover as policies `fotos_public_*`
--   devolve o SELECT que falta e, com ele, o anônimo passa a conseguir
--   SOBRESCREVER E APAGAR as fotos existentes (inclusive as de hodômetro que
--   sustentam prestação de contas). Hoje isso está acidentalmente bloqueado.
--   No dashboard: apague as três `fotos_public_*` PRIMEIRO, crie as
--   `fotos_auth_*` depois.
--
-- Mitigação já aplicada por SQL enquanto as policies não são corrigidas:
--   bucket `fotos` limitado a 10 MB e a MIME types de imagem — o despejo
--   anônimo não serve mais para hospedar arquivo arbitrário no domínio.
--
-- SINTOMA
--   Alterar a foto do motorista (e de veículo, posto, perfil, infração,
--   abastecimento) falha com HTTP 400:
--     {"statusCode":"403","message":"new row violates row-level security policy"}
--   Apagar arquivo falha com 403 "Access denied".
--
-- CAUSA
--   A migration 20260707_000001_security_hardening.sql (linha 93) removeu a
--   policy `fotos_public_select` para tirar a listagem pública do bucket. O
--   comentário registra que a verificação feita foi "nenhum client usa .list()"
--   — o que continua verdade. Mas SELECT em storage.objects não serve só para
--   listar:
--
--     • upload com `upsert: true` vira INSERT ... ON CONFLICT DO UPDATE, e o
--       Postgres exige policy de SELECT para ler a linha em conflito;
--     • DELETE exige SELECT para localizar o objeto.
--
--   O código do painel usa `upsert: true` em 13 pontos de upload, então todos
--   quebraram. O bucket `documentos` não foi afetado porque sua policy é
--   `FOR ALL`, que já inclui SELECT.
--
--   Leitura nunca quebrou: o bucket é público e `/object/public/fotos/...`
--   não passa por RLS. Por isso as fotos antigas continuam aparecendo — só
--   não é possível enviar novas nem apagar.
--
-- CORREÇÃO
--   Restaura o SELECT, mas apenas para `authenticated`, preservando a intenção
--   original: anônimo continua sem conseguir listar o bucket.
-- ============================================================================

create policy fotos_auth_select on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos');

comment on policy fotos_auth_select on storage.objects is
  'Necessária para upload com upsert (ON CONFLICT DO UPDATE) e para DELETE. Restrita a authenticated: anônimo segue sem listagem, que era o objetivo do hardening de 2026-07-07.';


-- ── Brecha de escrita anônima ───────────────────────────────────────────────
-- As policies de escrita do bucket estavam concedidas ao role `public`, que no
-- Postgres inclui `anon`. Como a anon key é pública (vai no bundle JS do site),
-- qualquer pessoa conseguia enviar arquivo para o bucket sem estar logada —
-- comprovado com um POST usando apenas a anon key.
--
-- Nenhum fluxo legítimo depende disso: o cadastro público do motorista
-- (/convite) grava no bucket `documentos` via signed upload URL, que não passa
-- por RLS; todo o resto (painel e app do motorista) é autenticado.
drop policy if exists fotos_public_insert on storage.objects;
drop policy if exists fotos_public_update on storage.objects;
drop policy if exists fotos_public_delete on storage.objects;

create policy fotos_auth_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos');

create policy fotos_auth_update on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos')
  with check (bucket_id = 'fotos');

create policy fotos_auth_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos');
