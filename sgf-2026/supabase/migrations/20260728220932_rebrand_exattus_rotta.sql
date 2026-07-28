-- Identidade pública única do produto. O nome da prefeitura continua em
-- tenants.name/login_eyebrow; app_name identifica o aplicativo Exattus Rotta.
alter table public.tenants
  alter column app_name set default 'Exattus Rotta';

update public.tenants
set app_name = 'Exattus Rotta',
    updated_at = now()
where app_name is distinct from 'Exattus Rotta';

comment on column public.tenants.app_name is
  'Nome público do aplicativo exibido no login, convites e app móvel.';
