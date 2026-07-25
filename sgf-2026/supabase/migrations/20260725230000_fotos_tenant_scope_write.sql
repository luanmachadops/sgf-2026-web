-- ============================================================================
-- Bucket `fotos`: escopo por prefeitura — ETAPA 2 de 2 (escrita)
--
-- STATUS: *** NÃO APLICADA ***
-- PRÉ-REQUISITO: a build nova do APP DO MOTORISTA precisa estar em uso.
--   Enquanto houver motorista em build antiga, esta policy faz o upload da
--   foto do hodômetro falhar — e sem essa foto ele não inicia viagem.
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
