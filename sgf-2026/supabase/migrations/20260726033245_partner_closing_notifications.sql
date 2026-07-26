-- ============================================================================
-- FASE 8 — Fechamento mensal e notificações dos parceiros
--
-- STATUS: APLICADA em produção em 2026-07-26
-- Versão registrada no banco: 20260726033245.
-- ============================================================================

-- Fechamento do posto: somente lançamentos executados pelo próprio parceiro.
-- "Total apresentado" inclui o que está aguardando validação; o valor validado
-- fica separado para a conferência da NF e lançamentos rejeitados não somam.
create or replace function public.get_station_monthly_summary(
  p_month date default current_date
)
returns table (
  fuel_type text,
  total_count bigint,
  total_liters numeric,
  total_amount numeric,
  pending_count bigint,
  pending_amount numeric,
  validated_count bigint,
  validated_amount numeric,
  rejected_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  ctx record;
  v_start timestamptz;
  v_end timestamptz;
begin
  select * into ctx from public.partner_context();
  if ctx.kind <> 'posto' then raise exception 'Somente postos'; end if;
  if p_month is null then raise exception 'Informe o mês do fechamento'; end if;

  v_start := date_trunc('month', p_month::timestamp) at time zone 'America/Sao_Paulo';
  v_end := (date_trunc('month', p_month::timestamp) + interval '1 month')
    at time zone 'America/Sao_Paulo';

  return query
    select lower(f.fuel_type)::text,
           count(*) filter (where f.workflow_status::text in ('concluido', 'validado')),
           coalesce(sum(f.liters) filter (
             where f.workflow_status::text in ('concluido', 'validado')
           ), 0),
           coalesce(sum(f.total_cost) filter (
             where f.workflow_status::text in ('concluido', 'validado')
           ), 0),
           count(*) filter (where f.workflow_status::text = 'concluido'),
           coalesce(sum(f.total_cost) filter (
             where f.workflow_status::text = 'concluido'
           ), 0),
           count(*) filter (where f.workflow_status::text = 'validado'),
           coalesce(sum(f.total_cost) filter (
             where f.workflow_status::text = 'validado'
           ), 0),
           count(*) filter (where f.workflow_status::text = 'rejeitado_admin')
      from public.fuelings f
     where f.tenant_id = ctx.tenant_id
       and f.station_id = ctx.partner_id
       and f.filled_at >= v_start
       and f.filled_at < v_end
       and f.workflow_status::text in ('concluido', 'validado', 'rejeitado_admin')
     group by lower(f.fuel_type)
     order by lower(f.fuel_type);
end
$$;

revoke all on function public.get_station_monthly_summary(date)
  from public, anon;
grant execute on function public.get_station_monthly_summary(date)
  to authenticated;

-- Helper interno: resolve o login pelo vínculo, nunca por um UUID vindo do
-- cliente. O trigger pode então avisar exatamente um posto/oficina.
create or replace function public.notify_partner_profile(
  p_partner_role text,
  p_partner_id uuid,
  p_tenant_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link text,
  p_entity_type text,
  p_entity_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_partner_role not in ('posto', 'oficina')
     or p_partner_id is null
     or p_tenant_id is null then
    return 0;
  end if;

  insert into public.notifications
    (driver_id, tenant_id, type, title, body, read, created_at, link, entity_type, entity_id)
  select p.id, p_tenant_id, p_type, p_title, coalesce(p_body, ''), false, now(),
         p_link, p_entity_type, p_entity_id
    from public.profiles p
   where p.tenant_id = p_tenant_id
     and p.role = p_partner_role
     and coalesce(p.access_blocked, false) = false
     and (
       (p_partner_role = 'posto' and p.station_id = p_partner_id)
       or
       (p_partner_role = 'oficina' and p.repair_shop_id = p_partner_id)
     );

  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke all on function public.notify_partner_profile(
  text,uuid,uuid,text,text,text,text,text,uuid
) from public, anon, authenticated;

create or replace function public.tg_notify_station_partner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plate text;
begin
  if new.station_id is null then return new; end if;
  select plate into v_plate from public.vehicles where id = new.vehicle_id;

  if new.workflow_status::text = 'autorizado'
     and (
       tg_op = 'INSERT'
       or new.workflow_status is distinct from old.workflow_status
       or new.station_id is distinct from old.station_id
     ) then
    perform public.notify_partner_profile(
      'posto', new.station_id, new.tenant_id, 'info',
      'Nova autorização de abastecimento',
      format('%s · %s · limite %s L',
        coalesce(v_plate, 'Veículo'),
        initcap(new.fuel_type),
        coalesce(new.max_liters::text, 'sem teto')),
      '/posto', 'fueling', new.id
    );
  elsif tg_op = 'UPDATE'
        and new.workflow_status is distinct from old.workflow_status
        and new.workflow_status::text in ('validado', 'rejeitado_admin') then
    perform public.notify_partner_profile(
      'posto', new.station_id, new.tenant_id,
      case when new.workflow_status::text = 'validado' then 'success' else 'alert' end,
      case when new.workflow_status::text = 'validado'
        then 'Abastecimento validado'
        else 'Abastecimento rejeitado'
      end,
      coalesce(v_plate, 'Veículo'),
      '/posto/historico', 'fueling', new.id
    );
  end if;

  return new;
end
$$;

drop trigger if exists trg_notify_station_partner on public.fuelings;
create trigger trg_notify_station_partner
  after insert or update of workflow_status, station_id on public.fuelings
  for each row execute function public.tg_notify_station_partner();

create or replace function public.tg_notify_workshop_partner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plate text;
  v_title text;
  v_body text;
  v_type text := 'info';
begin
  if new.repair_shop_id is null then return new; end if;
  select plate into v_plate from public.vehicles where id = new.vehicle_id;

  if (
       tg_op = 'INSERT'
       or new.repair_shop_id is distinct from old.repair_shop_id
     ) and new.operational_status::text in ('authorized', 'at_shop') then
    v_title := 'Nova ordem de serviço';
    v_body := format('%s · %s', coalesce(v_plate, 'Veículo'), new.category);
  elsif tg_op = 'UPDATE'
        and new.operational_status is distinct from old.operational_status then
    case new.operational_status::text
      when 'at_shop' then
        v_title := 'Veículo entregue na oficina';
        v_body := coalesce(v_plate, 'Veículo');
      when 'received' then
        v_title := 'Veículo recebido pela prefeitura';
        v_body := format('%s · envie a nota fiscal citando o empenho', coalesce(v_plate, 'Veículo'));
      when 'cancelled' then
        v_title := 'Ordem de serviço cancelada';
        v_body := coalesce(v_plate, 'Veículo');
        v_type := 'alert';
      else null;
    end case;
  end if;

  if v_title is not null then
    perform public.notify_partner_profile(
      'oficina', new.repair_shop_id, new.tenant_id, v_type,
      v_title, v_body, '/oficina', 'service_order', new.id
    );
  end if;

  v_title := null;
  v_body := null;
  v_type := 'info';
  if tg_op = 'UPDATE'
     and new.financial_status is distinct from old.financial_status then
    case new.financial_status::text
      when 'awaiting_commitment' then
        v_title := 'Orçamento aprovado';
        v_body := format('%s · aguardando empenho', coalesce(v_plate, 'Veículo'));
      when 'committed' then
        v_title := 'Empenho emitido';
        v_body := format('%s · execução liberada · empenho %s',
          coalesce(v_plate, 'Veículo'), coalesce(new.commitment_number, 'informado'));
        v_type := 'success';
      when 'attested' then
        v_title := 'Nota fiscal atestada';
        v_body := format('%s · aguardando pagamento', coalesce(v_plate, 'Veículo'));
        v_type := 'success';
      when 'paid' then
        v_title := 'Pagamento registrado';
        v_body := format('%s · processo encerrado', coalesce(v_plate, 'Veículo'));
        v_type := 'success';
      else null;
    end case;
  end if;

  if v_title is not null then
    perform public.notify_partner_profile(
      'oficina', new.repair_shop_id, new.tenant_id, v_type,
      v_title, v_body, '/oficina', 'service_order', new.id
    );
  end if;

  return new;
end
$$;

drop trigger if exists trg_notify_workshop_partner on public.service_orders;
create trigger trg_notify_workshop_partner
  after insert or update of repair_shop_id, operational_status, financial_status
  on public.service_orders
  for each row execute function public.tg_notify_workshop_partner();

create or replace function public.tg_notify_workshop_quote_review()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plate text;
begin
  if new.status is distinct from old.status and new.status = 'rejeitado' then
    select v.plate into v_plate
      from public.service_orders so
      join public.vehicles v on v.id = so.vehicle_id
     where so.id = new.service_order_id;

    perform public.notify_partner_profile(
      'oficina', new.repair_shop_id, new.tenant_id, 'alert',
      'Orçamento devolvido para revisão',
      format('%s%s',
        coalesce(v_plate, 'Veículo'),
        case when nullif(trim(new.review_note), '') is null
          then ''
          else ' · ' || trim(new.review_note)
        end),
      '/oficina', 'service_order', new.service_order_id
    );
  end if;
  return new;
end
$$;

drop trigger if exists trg_notify_workshop_quote_review on public.service_order_quotes;
create trigger trg_notify_workshop_quote_review
  after update of status on public.service_order_quotes
  for each row execute function public.tg_notify_workshop_quote_review();

revoke all on function public.tg_notify_station_partner()
  from public, anon, authenticated;
revoke all on function public.tg_notify_workshop_partner()
  from public, anon, authenticated;
revoke all on function public.tg_notify_workshop_quote_review()
  from public, anon, authenticated;
