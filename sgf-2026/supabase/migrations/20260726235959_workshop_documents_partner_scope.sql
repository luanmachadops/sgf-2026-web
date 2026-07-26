-- ============================================================================
-- FASE 7 — `documentos`: isolamento parceiro × parceiro
--
-- STATUS: *** APLICADA MANUALMENTE PELO DASHBOARD DO STORAGE EM 2026-07-26 ***
--
-- A API SQL conecta como `postgres`, mas `storage.objects` pertence a
-- `supabase_storage_admin`. Nem execute_sql nem apply_migration conseguem
-- alterar a policy (erro 42501). A expressão abaixo documenta exatamente a
-- alteração feita em Storage > Policies.
--
-- `documentos_tenant_all` limita por prefeitura, mas não por parceiro. Como
-- policies permissivas são combinadas com OR, criar outra policy permissiva
-- não fecharia a fronteira. Por isso a policy existente foi endurecida:
-- gestores mantêm o escopo por tenant; posto/oficina só alcançam o diretório
-- vinculado ao próprio perfil.
-- ============================================================================

alter policy documentos_tenant_all on storage.objects
  using (
    bucket_id = 'documentos'
    and (
      public.is_superadmin()
      or (
        (storage.foldername(name))[2] = (public.get_user_tenant_id())::text
        and (
          not (public.is_posto() or public.is_oficina())
          or (
            public.is_posto()
            and (storage.foldername(name))[1] = 'stations'
            and (storage.foldername(name))[3] = (public.get_user_station_id())::text
          )
          or (
            public.is_oficina()
            and (storage.foldername(name))[1] = 'repair_shops'
            and (storage.foldername(name))[3] = (public.get_user_repair_shop_id())::text
          )
        )
      )
    )
  )
  with check (
    bucket_id = 'documentos'
    and (
      public.is_superadmin()
      or (
        (storage.foldername(name))[2] = (public.get_user_tenant_id())::text
        and (
          not (public.is_posto() or public.is_oficina())
          or (
            public.is_posto()
            and (storage.foldername(name))[1] = 'stations'
            and (storage.foldername(name))[3] = (public.get_user_station_id())::text
          )
          or (
            public.is_oficina()
            and (storage.foldername(name))[1] = 'repair_shops'
            and (storage.foldername(name))[3] = (public.get_user_repair_shop_id())::text
          )
        )
      )
    )
  );

comment on policy documentos_tenant_all on storage.objects is
  'Documentos por tenant; postos e oficinas limitados ao diretório do próprio vínculo.';
