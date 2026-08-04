-- Corrige a validação fiscal de abastecimentos retroativos e completa a
-- publicação Realtime das entidades de empenho dos postos.

create or replace function public.tg_require_station_commitment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new numeric := 0;
  v_available numeric;
  v_operation_date date := current_date;
begin
  if tg_table_name = 'fuelings' then
    if new.station_id is null then return new; end if;

    if new.workflow_status::text = 'autorizado' then
      select round(
        coalesce(new.max_liters, v.tank_capacity, 0)
        * coalesce(
            new.price_per_liter,
            (
              select nullif(fp.value, '')::numeric
                from public.fuel_stations s
                cross join lateral jsonb_each_text(coalesce(s.fuel_prices, '{}'::jsonb)) fp
               where s.id = new.station_id
                 and lower(fp.key) = lower(new.fuel_type)
               limit 1
            ),
            0
          ),
        2
      )
        into v_new
        from public.vehicles v
       where v.id = new.vehicle_id;
    elsif new.workflow_status::text = 'lancado_direto' then
      v_new := coalesce(new.total_cost, 0);
      -- O lançamento direto é uma contingência retroativa. O empenho precisa
      -- estar vigente na data do abastecimento, não necessariamente hoje.
      v_operation_date := coalesce(
        (new.filled_at at time zone 'America/Sao_Paulo')::date,
        (new.created_at at time zone 'America/Sao_Paulo')::date,
        current_date
      );
    else
      return new;
    end if;
  else
    v_new := round(new.authorized_quantity * new.unit_price, 2);
  end if;

  v_available := public.station_commitment_total_available(
    new.station_id,
    v_operation_date
  );

  if v_available < v_new then
    raise exception
      'Saldo de empenho insuficiente em %: disponível R$ %, necessário R$ %',
      to_char(v_operation_date, 'DD/MM/YYYY'),
      round(v_available, 2),
      round(v_new, 2);
  end if;

  return new;
end
$$;

comment on function public.tg_require_station_commitment() is
  'Exige saldo de empenho prévio; em lançamento direto usa a data efetiva do abastecimento.';

create or replace function public.manager_get_station_commitment_balance(
  p_station_id uuid,
  p_on date default current_date
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  v_balance numeric;
begin
  select * into ctx from public.service_order_manager_context();

  if p_on is null or p_on > current_date then
    raise exception 'Data de consulta do empenho inválida';
  end if;

  if not exists (
    select 1
      from public.fuel_stations s
     where s.id = p_station_id
       and (ctx.superadmin or s.tenant_id = ctx.tenant_id)
  ) then
    raise exception 'Posto não encontrado nesta prefeitura';
  end if;

  v_balance := public.station_commitment_total_available(p_station_id, p_on);
  return round(coalesce(v_balance, 0), 2);
end
$$;

revoke all on function public.manager_get_station_commitment_balance(uuid, date)
  from public, anon;
grant execute on function public.manager_get_station_commitment_balance(uuid, date)
  to authenticated;

comment on function public.manager_get_station_commitment_balance(uuid, date) is
  'Saldo agregado dos empenhos vigentes de um posto na data informada, restrito ao tenant do gestor.';

-- As tabelas nasceram para acesso por RPC SECURITY DEFINER e, por isso, não
-- tinham policy SELECT. O Realtime respeita RLS: sem estas policies o gestor
-- poderia assinar o canal, mas nunca receberia os eventos fiscais.
drop policy if exists station_commitments_manager_realtime
  on public.station_commitments;
create policy station_commitments_manager_realtime
  on public.station_commitments
  for select
  to authenticated
  using (
    (select public.is_superadmin())
    or (
      (select public.is_admin_or_manager())
      and tenant_id = (select public.get_user_tenant_id())
    )
  );

drop policy if exists station_closing_commitments_manager_realtime
  on public.station_closing_commitments;
create policy station_closing_commitments_manager_realtime
  on public.station_closing_commitments
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.station_monthly_closings c
       where c.id = station_closing_commitments.closing_id
         and (
           (select public.is_superadmin())
           or (
             (select public.is_admin_or_manager())
             and c.tenant_id = (select public.get_user_tenant_id())
           )
         )
    )
  );

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'station_commitments',
    'station_closing_commitments'
  ] loop
    if to_regclass(format('public.%I', v_table)) is not null
       and not exists (
         select 1
           from pg_publication_tables
          where pubname = 'supabase_realtime'
            and schemaname = 'public'
            and tablename = v_table
       ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        v_table
      );
    end if;
  end loop;
end
$$;
