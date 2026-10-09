-- Aplicada em 2026-10-09 com aprovacao do usuario.
-- 1) Admin do tenant passa a ler toda a trilha de auditoria (inclusive
--    sensitivity = 'sensivel'). Gestor continua so com 'operacional'
--    (policy activity_log_select_manager inalterada). Superadmin ja lia tudo.
-- 2) verify_activity_chain aceita tambem superadmin (no tenant atual do perfil)
--    e o limite p_to passa a ser exclusivo (o painel envia o inicio do dia seguinte).

drop policy if exists activity_log_select_admin_all on public.activity_log;
create policy activity_log_select_admin_all on public.activity_log
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.is_admin());

create or replace function public.verify_activity_chain(
  p_from timestamptz default null,
  p_to   timestamptz default null
) returns table (ok boolean, checked bigint, first_broken_id uuid, first_broken_seq bigint)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tenant   uuid := public.get_user_tenant_id();
  r          record;
  v_count    bigint := 0;
  v_exp_seq  bigint;
  v_exp_prev text;
  v_first    boolean := true;
begin
  if auth.uid() is null or v_tenant is null
     or not (public.is_admin_or_manager() or public.is_superadmin()) then
    raise exception 'acesso negado' using errcode = 'insufficient_privilege';
  end if;

  for r in
    select * from public.activity_log
     where tenant_id = v_tenant
       and (p_from is null or created_at >= p_from)
       and (p_to   is null or created_at <  p_to)
     order by chain_seq
  loop
    if v_first then
      v_first := false;
      v_exp_seq := r.chain_seq;
      if r.chain_seq = 1 then
        v_exp_prev := null;
      else
        select l.row_hash into v_exp_prev
          from public.activity_log l
         where l.tenant_id = v_tenant and l.chain_seq = r.chain_seq - 1;
        if not found then
          return query select false, v_count, r.id, r.chain_seq;
          return;
        end if;
      end if;
    end if;

    if r.chain_seq is distinct from v_exp_seq
       or r.prev_hash is distinct from v_exp_prev
       or r.row_hash is distinct from public.activity_log_compute_hash(
            r.prev_hash, r.id, r.tenant_id, r.entity_type, r.entity_id, r.action,
            r.changes, r.snapshot, r.actor_id, r.created_at)
    then
      return query select false, v_count, r.id, r.chain_seq;
      return;
    end if;

    v_count := v_count + 1;
    v_exp_seq := r.chain_seq + 1;
    v_exp_prev := r.row_hash;
  end loop;

  return query select true, v_count, null::uuid, null::bigint;
end $$;
