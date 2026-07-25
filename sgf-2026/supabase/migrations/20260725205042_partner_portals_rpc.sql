-- ============================================================================
-- FASE 1 (b) — Portais de parceiros: helpers, RLS e RPCs
--
-- STATUS: *** APLICADA em 2026-07-25 *** (versão registrada: 20260725205042)
--   Validada antes por execução completa em transação com rollback, e depois
--   por teste do trigger de sincronia nos dois sentidos.
--
-- PRINCÍPIO: o parceiro NUNCA recebe INSERT/UPDATE/DELETE direto. Policy de RLS
-- filtra LINHA, não coluna — com UPDATE direto o posto poderia alterar
-- total_cost, validated_by, tenant_id da mesma linha. E como todo usuário do
-- app compartilha o papel `authenticated`, GRANT por coluna também não separa
-- posto de gestor. Toda escrita passa por RPC SECURITY DEFINER que valida
-- vínculo, estado anterior e valores no servidor.
-- ============================================================================

-- ─── 1. Helpers ─────────────────────────────────────────────────────────────
create or replace function public.is_posto()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'posto') $$;

create or replace function public.is_oficina()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'oficina') $$;

create or replace function public.get_user_station_id()
returns uuid language sql stable security definer set search_path = public, pg_temp
as $$ select station_id from public.profiles where id = auth.uid() and role = 'posto' $$;

create or replace function public.get_user_repair_shop_id()
returns uuid language sql stable security definer set search_path = public, pg_temp
as $$ select repair_shop_id from public.profiles where id = auth.uid() and role = 'oficina' $$;

/**
 * Contexto do parceiro autenticado. Recusa perfil bloqueado, parceiro inativo
 * ou contrato vencido — checagem única usada por todas as RPCs.
 */
create or replace function public.partner_context()
returns table (profile_id uuid, tenant_id uuid, kind text, partner_id uuid, partner_name text)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare r record;
begin
  select p.id, p.tenant_id, p.role, p.station_id, p.repair_shop_id, p.access_blocked
    into r
    from public.profiles p
   where p.id = auth.uid() and p.role in ('posto','oficina');

  if r.id is null then raise exception 'Acesso restrito a postos e oficinas'; end if;
  if coalesce(r.access_blocked, false) then raise exception 'Seu acesso está bloqueado. Procure a prefeitura.'; end if;

  if r.role = 'posto' then
    return query
      select r.id, r.tenant_id, 'posto'::text, s.id, s.name
        from public.fuel_stations s
       where s.id = r.station_id and s.tenant_id = r.tenant_id and coalesce(s.is_active, true)
         and (s.contract_end is null or s.contract_end >= current_date);
  else
    return query
      select r.id, r.tenant_id, 'oficina'::text, o.id, o.name
        from public.repair_shops o
       where o.id = r.repair_shop_id and o.tenant_id = r.tenant_id and o.is_active
         and (o.contract_end is null or o.contract_end >= current_date);
  end if;

  if not found then raise exception 'Cadastro inativo ou contrato vencido. Procure a prefeitura.'; end if;
end $$;

-- ─── 2. RLS: parceiro só LÊ, e só o que é dele ──────────────────────────────
create policy fuelings_posto_select on public.fuelings
  for select to authenticated
  using (is_posto() and tenant_id = get_user_tenant_id() and station_id = get_user_station_id());

create policy service_orders_oficina_select on public.service_orders
  for select to authenticated
  using (is_oficina() and tenant_id = get_user_tenant_id() and repair_shop_id = get_user_repair_shop_id());

create policy quotes_oficina_select on public.service_order_quotes
  for select to authenticated
  using (is_oficina() and tenant_id = get_user_tenant_id() and repair_shop_id = get_user_repair_shop_id());

create policy quote_items_oficina_select on public.service_order_quote_items
  for select to authenticated
  using (exists (select 1 from public.service_order_quotes q
                  where q.id = quote_id and is_oficina()
                    and q.tenant_id = get_user_tenant_id()
                    and q.repair_shop_id = get_user_repair_shop_id()));

create policy invoices_oficina_select on public.service_order_invoices
  for select to authenticated
  using (is_oficina() and tenant_id = get_user_tenant_id() and repair_shop_id = get_user_repair_shop_id());

create policy events_oficina_select on public.service_order_events
  for select to authenticated
  using (is_oficina() and tenant_id = get_user_tenant_id()
         and exists (select 1 from public.service_orders so
                      where so.id = service_order_id
                        and so.repair_shop_id = get_user_repair_shop_id()));

create policy fuel_stations_posto_select on public.fuel_stations
  for select to authenticated
  using (is_posto() and id = get_user_station_id());

create policy repair_shops_oficina_select on public.repair_shops
  for select to authenticated
  using (is_oficina() and id = get_user_repair_shop_id());

-- NENHUMA policy para parceiro em vehicles, profiles ou trips: os dados
-- mínimos do veículo saem das RPCs de leitura abaixo, como DTO.

-- ─── 3. Leitura: DTO mínimo, sem expor vehicles/profiles ────────────────────
-- (View `security_invoker` não serviria: herdaria a RLS de vehicles e voltaria
--  vazia; view `definer` ignoraria RLS e viraria vazamento.)
create or replace function public.get_station_pending_authorizations()
returns table (
  fueling_id uuid, plate text, brand text, model text,
  fuel_type text, max_liters numeric, authorized_at timestamptz,
  expires_at timestamptz, note text, price_per_liter numeric
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare ctx record;
begin
  select * into ctx from public.partner_context();
  if ctx.kind <> 'posto' then raise exception 'Somente postos'; end if;

  return query
    select f.id, v.plate, v.brand, v.model,
           f.fuel_type, f.max_liters, f.authorized_at, f.expires_at, f.authorization_note,
           -- preço do contrato (chaves de fuel_prices são capitalizadas)
           nullif((s.fuel_prices ->> initcap(f.fuel_type)), '')::numeric
      from public.fuelings f
      join public.vehicles v on v.id = f.vehicle_id
      join public.fuel_stations s on s.id = f.station_id
     where f.tenant_id = ctx.tenant_id
       and f.station_id = ctx.partner_id
       and f.workflow_status = 'autorizado'
       and f.cancelled_at is null
       and (f.expires_at is null or f.expires_at > now())
     order by f.authorized_at;
end $$;

create or replace function public.get_repair_shop_orders()
returns table (
  order_id uuid, plate text, brand text, model text, year int, odometer int,
  category text, description text, priority text,
  operational_status text, financial_status text,
  commitment_number text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare ctx record;
begin
  select * into ctx from public.partner_context();
  if ctx.kind <> 'oficina' then raise exception 'Somente oficinas'; end if;

  return query
    select so.id, v.plate, v.brand, v.model, v.year, so.odometer,
           so.category, so.description, so.priority::text,
           so.operational_status::text, so.financial_status::text,
           so.commitment_number, so.created_at
      from public.service_orders so
      join public.vehicles v on v.id = so.vehicle_id
     where so.tenant_id = ctx.tenant_id
       and so.repair_shop_id = ctx.partner_id
       and so.operational_status <> 'cancelled'
     order by so.created_at desc;
end $$;

-- ─── 4. Escrita do posto ────────────────────────────────────────────────────
/**
 * Completa uma autorização de abastecimento. Idempotente: se a autorização já
 * foi concluída por esta mesma execução, devolve o registro sem duplicar.
 * O posto NUNCA cria abastecimento do zero — só completa o que a prefeitura
 * autorizou, o que fecha a porta para lançamento fantasma.
 */
create or replace function public.partner_complete_fueling(
  p_fueling_id  uuid,
  p_liters      numeric,
  p_odometer    int,
  p_receipt_no  text default null,
  p_photo_url   text default null
)
returns table (fueling_id uuid, total_cost numeric, price_per_liter numeric)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  ctx record; f record; v record;
  v_price numeric; v_total numeric; v_anomaly boolean := false; v_anomaly_txt text;
begin
  select * into ctx from public.partner_context();
  if ctx.kind <> 'posto' then raise exception 'Somente postos podem registrar abastecimento'; end if;
  if p_liters is null or p_liters <= 0 then raise exception 'Informe os litros abastecidos'; end if;
  if p_odometer is null or p_odometer <= 0 then raise exception 'Informe o hodômetro'; end if;

  select * into f from public.fuelings
   where id = p_fueling_id and tenant_id = ctx.tenant_id and station_id = ctx.partner_id
   for update;

  if f.id is null then raise exception 'Autorização não encontrada para este posto'; end if;

  -- Idempotência: repetição do mesmo envio não duplica nem sobrescreve.
  if f.workflow_status <> 'autorizado' then
    if f.filled_by = ctx.profile_id then
      return query select f.id, f.total_cost, f.price_per_liter; return;
    end if;
    raise exception 'Esta autorização não está mais aberta (situação: %)', f.workflow_status;
  end if;

  if f.cancelled_at is not null then raise exception 'Autorização cancelada pela prefeitura'; end if;
  if f.expires_at is not null and f.expires_at <= now() then raise exception 'Autorização vencida em %',
     to_char(f.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'); end if;
  if f.max_liters is not null and p_liters > f.max_liters then
    raise exception 'Litros acima do autorizado (máximo %)', f.max_liters; end if;

  select * into v from public.vehicles where id = f.vehicle_id;
  if v.tank_capacity is not null and p_liters > v.tank_capacity then
    raise exception 'Litros acima da capacidade do tanque (% L)', v.tank_capacity; end if;
  if v.current_odometer is not null and p_odometer < v.current_odometer then
    v_anomaly := true; v_anomaly_txt := format('Hodômetro informado (%s) menor que o registrado (%s)', p_odometer, v.current_odometer);
  end if;

  -- Preço vem do CONTRATO, não do cliente.
  select nullif((s.fuel_prices ->> initcap(f.fuel_type)), '')::numeric into v_price
    from public.fuel_stations s where s.id = ctx.partner_id;
  if v_price is null or v_price <= 0 then
    raise exception 'Preço de % não cadastrado no contrato deste posto. Procure a prefeitura.', f.fuel_type;
  end if;
  v_total := round(p_liters * v_price, 2);

  update public.fuelings
     set liters              = p_liters,
         odometer            = p_odometer,
         price_per_liter     = v_price,
         total_cost          = v_total,
         pump_receipt_number = p_receipt_no,
         photo_pump_url      = coalesce(p_photo_url, photo_pump_url),
         filled_by           = ctx.profile_id,
         filled_at           = now(),
         workflow_status     = 'concluido',
         has_anomaly         = v_anomaly,
         anomaly_type        = v_anomaly_txt
   where id = f.id and workflow_status = 'autorizado';

  return query select f.id, v_total, v_price;
end $$;

-- ─── 5. Escrita da oficina ──────────────────────────────────────────────────
create or replace function public.repair_shop_submit_quote(
  p_order_id    uuid,
  p_items       jsonb,           -- [{"kind":"peca","description":"...","qty":1,"unit_price":100.00}]
  p_valid_until date default null,
  p_note        text default null
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  ctx record; so record; v_quote_id uuid; v_version int; v_total numeric := 0; it jsonb;
begin
  select * into ctx from public.partner_context();
  if ctx.kind <> 'oficina' then raise exception 'Somente oficinas'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Orçamento sem itens'; end if;

  select * into so from public.service_orders
   where id = p_order_id and tenant_id = ctx.tenant_id and repair_shop_id = ctx.partner_id
   for update;
  if so.id is null then raise exception 'OS não encontrada para esta oficina'; end if;
  if so.operational_status not in ('authorized','at_shop','awaiting_quote_approval') then
    raise exception 'A OS não está em fase de orçamento (situação: %)', so.operational_status; end if;

  select coalesce(max(version), 0) + 1 into v_version
    from public.service_order_quotes where service_order_id = p_order_id;

  update public.service_order_quotes set status = 'substituido'
   where service_order_id = p_order_id and status = 'enviado';

  insert into public.service_order_quotes (tenant_id, service_order_id, repair_shop_id, version, valid_until, note)
  values (ctx.tenant_id, p_order_id, ctx.partner_id, v_version, p_valid_until, p_note)
  returning id into v_quote_id;

  for it in select * from jsonb_array_elements(p_items) loop
    if (it->>'kind') not in ('peca','mao_de_obra') then raise exception 'Tipo de item inválido: %', it->>'kind'; end if;
    insert into public.service_order_quote_items (quote_id, kind, description, qty, unit_price)
    values (v_quote_id, it->>'kind', it->>'description',
            coalesce((it->>'qty')::numeric, 1), (it->>'unit_price')::numeric);
    v_total := v_total + coalesce((it->>'qty')::numeric, 1) * (it->>'unit_price')::numeric;
  end loop;

  -- Total é calculado aqui; o valor enviado pelo cliente é ignorado.
  update public.service_order_quotes set total = round(v_total, 2) where id = v_quote_id;

  update public.service_orders
     set operational_status = 'awaiting_quote_approval'
   where id = p_order_id;

  insert into public.service_order_events (tenant_id, service_order_id, from_state, to_state, actor_id, actor_role, note)
  values (ctx.tenant_id, p_order_id, so.operational_status::text, 'awaiting_quote_approval', ctx.profile_id, 'oficina',
          format('Orçamento v%s enviado: R$ %s', v_version, round(v_total,2)));

  return v_quote_id;
end $$;

create or replace function public.repair_shop_start_service(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare ctx record; so record;
begin
  select * into ctx from public.partner_context();
  if ctx.kind <> 'oficina' then raise exception 'Somente oficinas'; end if;

  select * into so from public.service_orders
   where id = p_order_id and tenant_id = ctx.tenant_id and repair_shop_id = ctx.partner_id for update;
  if so.id is null then raise exception 'OS não encontrada para esta oficina'; end if;
  if so.operational_status = 'in_progress' then return; end if;   -- idempotente
  if so.financial_status not in ('committed') then
    raise exception 'Aguardando empenho da prefeitura para iniciar a execução'; end if;

  update public.service_orders set operational_status = 'in_progress' where id = p_order_id;

  insert into public.service_order_events (tenant_id, service_order_id, from_state, to_state, actor_id, actor_role)
  values (ctx.tenant_id, p_order_id, so.operational_status::text, 'in_progress', ctx.profile_id, 'oficina');
end $$;

create or replace function public.repair_shop_finish_service(p_order_id uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare ctx record; so record;
begin
  select * into ctx from public.partner_context();
  if ctx.kind <> 'oficina' then raise exception 'Somente oficinas'; end if;

  select * into so from public.service_orders
   where id = p_order_id and tenant_id = ctx.tenant_id and repair_shop_id = ctx.partner_id for update;
  if so.id is null then raise exception 'OS não encontrada para esta oficina'; end if;
  if so.operational_status = 'ready' then return; end if;         -- idempotente
  if so.operational_status <> 'in_progress' then
    raise exception 'A OS não está em execução (situação: %)', so.operational_status; end if;

  update public.service_orders set operational_status = 'ready' where id = p_order_id;

  insert into public.service_order_events (tenant_id, service_order_id, from_state, to_state, actor_id, actor_role, note)
  values (ctx.tenant_id, p_order_id, 'in_progress', 'ready', ctx.profile_id, 'oficina', p_note);
end $$;

create or replace function public.repair_shop_submit_invoice(
  p_order_id       uuid,
  p_invoice_number text,
  p_amount         numeric,
  p_file_path      text default null,
  p_issued_at      date default current_date
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare ctx record; so record; v_id uuid;
begin
  select * into ctx from public.partner_context();
  if ctx.kind <> 'oficina' then raise exception 'Somente oficinas'; end if;
  if coalesce(trim(p_invoice_number), '') = '' then raise exception 'Informe o número da nota fiscal'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Informe o valor da nota fiscal'; end if;

  select * into so from public.service_orders
   where id = p_order_id and tenant_id = ctx.tenant_id and repair_shop_id = ctx.partner_id for update;
  if so.id is null then raise exception 'OS não encontrada para esta oficina'; end if;
  if so.operational_status <> 'received' then
    raise exception 'A nota só pode ser emitida após a prefeitura receber o veículo'; end if;

  -- Idempotência pela unique (tenant, oficina, número).
  select id into v_id from public.service_order_invoices
   where tenant_id = ctx.tenant_id and repair_shop_id = ctx.partner_id and invoice_number = trim(p_invoice_number);
  if v_id is not null then return v_id; end if;

  insert into public.service_order_invoices
    (tenant_id, service_order_id, repair_shop_id, invoice_number, amount, issued_at, file_path, commitment_number)
  values (ctx.tenant_id, p_order_id, ctx.partner_id, trim(p_invoice_number), p_amount, p_issued_at, p_file_path, so.commitment_number)
  returning id into v_id;

  update public.service_orders set financial_status = 'invoiced'
   where id = p_order_id and financial_status in ('committed','awaiting_commitment');

  insert into public.service_order_events (tenant_id, service_order_id, from_state, to_state, axis, actor_id, actor_role, note)
  values (ctx.tenant_id, p_order_id, so.financial_status::text, 'invoiced', 'financial', ctx.profile_id, 'oficina',
          format('NF %s — R$ %s', trim(p_invoice_number), p_amount));

  return v_id;
end $$;

-- ─── 6. Grants ──────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'is_posto()','is_oficina()','get_user_station_id()','get_user_repair_shop_id()','partner_context()',
    'get_station_pending_authorizations()','get_repair_shop_orders()',
    'partner_complete_fueling(uuid,numeric,int,text,text)',
    'repair_shop_submit_quote(uuid,jsonb,date,text)',
    'repair_shop_start_service(uuid)',
    'repair_shop_finish_service(uuid,text)',
    'repair_shop_submit_invoice(uuid,text,numeric,text,date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
