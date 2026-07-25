-- ============================================================================
-- Bucket `fotos`: escopo por prefeitura — ETAPA 1 de 2 (somente SELECT)
--
-- STATUS: *** NÃO APLICADA — aplicar após o deploy do PAINEL ***
--
-- PROBLEMA
--   A policy `fotos_auth_select` é ampla (`bucket_id = 'fotos'`) porque os
--   caminhos não têm tenant (`drivers/…`, `hodometro/…`, `ocorrencias/…`).
--   Qualquer autenticado, de QUALQUER prefeitura, lista todos os arquivos —
--   e como o bucket é público, listar equivale a acessar.
--
--   Remover a policy de SELECT não é opção: é ela que faz upload com
--   `upsert: true` e DELETE funcionarem no painel.
--
-- POR QUE SÓ SELECT AGORA (e não a restrição completa)
--   O app do motorista é NATIVO: os motoristas têm builds antigos instalados,
--   que continuam gravando no caminho sem tenant. Restringir INSERT junto
--   quebraria o upload de foto de TODO motorista que ainda não atualizou —
--   e a foto do hodômetro é obrigatória para iniciar viagem. Seria uma parada
--   do fluxo principal em campo.
--
--   Restringir só o SELECT já mata a enumeração cross-tenant, que é o
--   vazamento, e não afeta quem grava:
--     • app antigo usa `upsert: false` → INSERT puro, não precisa de SELECT;
--     • painel novo (já deployado nesta etapa) grava em `tenant/{id}/…`,
--       dentro do escopo;
--     • leitura das fotos é por URL pública, que não passa por RLS —
--       nenhuma imagem some do sistema;
--     • não há DELETE em `fotos` no painel (só em `documentos`) — conferido.
--
--   A ETAPA 2 (INSERT/UPDATE/DELETE) está em
--   20260725230000_fotos_tenant_scope_write.sql e só entra depois que os
--   motoristas estiverem com a build nova.
--
-- POR QUE `as restrictive`
--   Policy restritiva é combinada com AND às permissivas, então NÃO é preciso
--   apagar as `fotos_auth_*` — o que importa, porque DROP POLICY exige ser
--   dono de `storage.objects` (a conexão entra como `postgres`, que não é) e
--   só sairia pelo dashboard.
-- ============================================================================

create policy fotos_tenant_scope_select on storage.objects
  as restrictive
  for select
  to authenticated
  using (
    bucket_id <> 'fotos'
    or ((storage.foldername(name))[1] = 'tenant'
        and (storage.foldername(name))[2] = (get_user_tenant_id())::text)
  );

-- ── ORDEM ───────────────────────────────────────────────────────────────────
--   1. Deploy do painel com `src/lib/fotoStorage.ts` (uploadFoto).
--   2. Conferir que upload novo cai no caminho certo:
--        select name from storage.objects
--         where bucket_id = 'fotos' order by created_at desc limit 5;
--   3. Aplicar esta migration.
--   4. Publicar a build nova do app do motorista e aguardar a adoção.
--   5. Só então aplicar a etapa 2 (write).
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   drop policy fotos_tenant_scope_select on storage.objects;  -- via dashboard
