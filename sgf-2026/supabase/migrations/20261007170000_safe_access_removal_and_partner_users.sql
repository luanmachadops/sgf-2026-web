-- Gestão de acessos: remoção segura, arquivamento e vários usuários por parceiro.
--
-- 1. Apagar um usuário levava junto (ON DELETE CASCADE) as viagens,
--    abastecimentos, checklists, ocorrências e ordens de serviço dele — a
--    "lixeira" da Gestão de acessos apagava o histórico da frota. Agora o banco
--    recusa (RESTRICT) e a API arquiva quem tem histórico.
-- 2. profiles.archived_at: usuário arquivado não entra, some das listas e
--    mantém o nome no histórico.
-- 3. Posto e oficina podem ter vários usuários (antes, um único login).
-- 4. profile_history_count(): quantos registros apontam para o usuário — a API
--    usa para decidir entre excluir de vez ou arquivar, e a tela para avisar.

alter table public.profiles add column if not exists archived_at timestamptz;
create index if not exists profiles_active_idx on public.profiles (tenant_id, role) where archived_at is null;

drop index if exists public.uniq_profile_por_posto;
drop index if exists public.uniq_profile_por_oficina;

alter table public.trips          drop constraint trips_driver_id_fkey,
  add constraint trips_driver_id_fkey foreign key (driver_id) references public.profiles(id) on delete restrict;
alter table public.checklists     drop constraint checklists_driver_id_fkey,
  add constraint checklists_driver_id_fkey foreign key (driver_id) references public.profiles(id) on delete restrict;
alter table public.issues         drop constraint issues_driver_id_fkey,
  add constraint issues_driver_id_fkey foreign key (driver_id) references public.profiles(id) on delete restrict;
alter table public.trip_locations drop constraint trip_locations_driver_id_fkey,
  add constraint trip_locations_driver_id_fkey foreign key (driver_id) references public.profiles(id) on delete restrict;
alter table public.fuelings       drop constraint fuelings_driver_id_fkey,
  add constraint fuelings_driver_id_fkey foreign key (driver_id) references public.profiles(id) on delete restrict;
alter table public.service_orders drop constraint service_orders_driver_id_fkey,
  add constraint service_orders_driver_id_fkey foreign key (driver_id) references public.profiles(id) on delete restrict;

-- Registros que mencionam o usuário (exceto dados descartáveis dele mesmo:
-- avisos, tokens de push, posição ao vivo). Descobre as colunas pelo catálogo,
-- então novas tabelas de histórico entram sozinhas.
create or replace function public.profile_history_count(p_profile_id uuid)
returns integer language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r record;
  v_total integer := 0;
  v_n integer;
begin
  for r in
    select c.conrelid::regclass as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
       and c.conrelid::regclass::text not like 'auth.%'
       and c.conrelid::regclass::text not in ('profiles', 'notifications', 'push_tokens', 'live_positions', 'driver_registration_requests', 'platform_settings')
  loop
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into v_n using p_profile_id;
    v_total := v_total + v_n;
  end loop;
  return v_total;
end $$;
revoke all on function public.profile_history_count(uuid) from public, anon, authenticated;
grant execute on function public.profile_history_count(uuid) to service_role;
