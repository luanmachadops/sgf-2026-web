-- ============================================================================
-- FASE 7 — `documentos`: isolamento parceiro × parceiro
--
-- STATUS: *** PENDENTE — exige criação pelo dashboard do Storage ***
--
-- A API SQL conecta como `postgres`, mas `storage.objects` pertence a
-- `supabase_storage_admin`. Nem execute_sql nem apply_migration podem assumir
-- esse papel (erro 42501). Criar esta policy pela tela Storage > Policies e,
-- depois, marcar/aplicar esta versão no histórico sem executar o CREATE de novo.
--
-- `documentos_tenant_all` limita por prefeitura, mas não por parceiro. Como
-- policies permissivas são combinadas com OR, a fronteira precisa ser
-- RESTRICTIVE: gestores mantêm o comportamento atual; posto/oficina só
-- alcançam o diretório vinculado ao próprio perfil.
-- ============================================================================

create policy documentos_partner_scope on storage.objects
  as restrictive
  for all
  to authenticated
  using (
    bucket_id <> 'documentos'
    or (
      not (public.is_posto() or public.is_oficina())
      or (
        public.is_posto()
        and (storage.foldername(name))[1] = 'stations'
        and (storage.foldername(name))[2] = (public.get_user_tenant_id())::text
        and (storage.foldername(name))[3] = (public.get_user_station_id())::text
      )
      or (
        public.is_oficina()
        and (storage.foldername(name))[1] = 'repair_shops'
        and (storage.foldername(name))[2] = (public.get_user_tenant_id())::text
        and (storage.foldername(name))[3] = (public.get_user_repair_shop_id())::text
      )
    )
  )
  with check (
    bucket_id <> 'documentos'
    or (
      not (public.is_posto() or public.is_oficina())
      or (
        public.is_posto()
        and (storage.foldername(name))[1] = 'stations'
        and (storage.foldername(name))[2] = (public.get_user_tenant_id())::text
        and (storage.foldername(name))[3] = (public.get_user_station_id())::text
      )
      or (
        public.is_oficina()
        and (storage.foldername(name))[1] = 'repair_shops'
        and (storage.foldername(name))[2] = (public.get_user_tenant_id())::text
        and (storage.foldername(name))[3] = (public.get_user_repair_shop_id())::text
      )
    )
  );

comment on policy documentos_partner_scope on storage.objects is
  'Parceiros só acessam documentos do próprio vínculo; demais papéis preservam o escopo por tenant.';
