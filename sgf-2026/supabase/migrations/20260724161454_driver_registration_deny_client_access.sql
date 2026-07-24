-- Políticas explícitas de negação: toda leitura/escrita passa pela Edge Function,
-- que valida convite ou papel de gestor e usa service_role no servidor.
create policy driver_registration_invites_deny_client
on public.driver_registration_invites
for all
to anon, authenticated
using (false)
with check (false);

create policy driver_registration_requests_deny_client
on public.driver_registration_requests
for all
to anon, authenticated
using (false)
with check (false);
