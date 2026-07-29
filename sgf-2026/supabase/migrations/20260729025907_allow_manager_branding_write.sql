-- Gestores e administradores da própria prefeitura podem manter a identidade
-- visual. O caminho continua obrigatoriamente isolado pelo tenant_id.
drop policy if exists "branding_admin_write" on storage.objects;

create policy "branding_admin_write"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'branding'
  and (
    is_superadmin()
    or (
      is_admin_or_manager()
      and (storage.foldername(name))[1] = get_user_tenant_id()::text
    )
  )
)
with check (
  bucket_id = 'branding'
  and (
    is_superadmin()
    or (
      is_admin_or_manager()
      and (storage.foldername(name))[1] = get_user_tenant_id()::text
    )
  )
);
