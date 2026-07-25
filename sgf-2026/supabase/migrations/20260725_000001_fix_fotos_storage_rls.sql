-- ============================================================================
-- FIX: uploads de imagem quebrados no bucket `fotos`
--
-- STATUS: *** NÃO APLICADA *** — aguardando aprovação do usuário.
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
