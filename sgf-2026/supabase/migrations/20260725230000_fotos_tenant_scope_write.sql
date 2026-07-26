-- ============================================================================
-- Bucket `fotos`: escopo por prefeitura — ETAPA 2 de 2 (escrita)
--
-- STATUS: *** APLICADA em 2026-07-26 ***
--   Aplicada com o sistema em pré-produção (2 prefeituras de teste, 1
--   motorista) e após o painel já estar gravando em tenant/…: nenhum caminho
--   legado recebeu upload depois do deploy. A build do app saiu junto.
--
--   Verificada em transação revertida, 4/4:
--     • grava no caminho da própria prefeitura ......... OK
--     • recusa caminho legado (sem tenant) ............ OK
--     • recusa caminho de OUTRA prefeitura ............ OK
--     • bucket `documentos` não foi afetado ........... OK
--
-- ATENÇÃO PARA O FUTURO: em produção com motoristas reais, esta policy só
--   entra depois da adoção da build nova. Build antiga grava em caminho legado
--   e perderia o upload da foto do hodômetro, que bloqueia o início da viagem.
--
-- COMO SABER QUE PODE APLICAR
--   Nenhum upload novo em caminho legado nas últimas 24h:
--
--     select (storage.foldername(name))[1] as raiz, count(*), max(created_at)
--       from storage.objects
--      where bucket_id = 'fotos' and created_at > now() - interval '24 hours'
--      group by 1 order by 2 desc;
--
--   Só aplicar quando a única raiz for `tenant`.
--
-- Depois desta etapa, os ~120 objetos antigos deixam de poder ser
-- sobrescritos ou apagados pelo painel. Continuam servidos por URL pública
-- (leitura de bucket público não passa por RLS), e toda substituição já grava
-- em caminho novo — então na prática não muda nada para o usuário.
-- ============================================================================

create policy fotos_tenant_scope_write on storage.objects
  as restrictive
  for all
  to authenticated
  using (
    bucket_id <> 'fotos'
    or ((storage.foldername(name))[1] = 'tenant'
        and (storage.foldername(name))[2] = (get_user_tenant_id())::text)
  )
  with check (
    bucket_id <> 'fotos'
    or ((storage.foldername(name))[1] = 'tenant'
        and (storage.foldername(name))[2] = (get_user_tenant_id())::text)
  );

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   drop policy fotos_tenant_scope_write on storage.objects;  -- via dashboard
