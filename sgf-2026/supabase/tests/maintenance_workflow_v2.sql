-- ============================================================================
-- FLUXO DE MANUTENÇÃO V2 — integração motorista → gestor → oficina
--
-- Rode após a migration `maintenance_workflow_v2`. Tudo fica dentro de uma
-- transação. O resultado esperado é a exceção final:
--   "TODOS OS TESTES PASSARAM (18/18) — rollback automático"
-- ============================================================================

begin;

do $$
declare
  tenant_a uuid := gen_random_uuid();
  vehicle_a uuid := gen_random_uuid();
  vehicle_b uuid := gen_random_uuid();
  shop_a uuid := gen_random_uuid();
  manager_a uuid := gen_random_uuid();
  driver_a uuid := gen_random_uuid();
  workshop_a uuid := gen_random_uuid();
  order_a uuid;
  quote_v1 uuid;
  quote_v2 uuid;
  invoice_a uuid;
  paid boolean;
  value_text text;
  value_number numeric;
  value_count integer;
  failures text := '';
  message text;
  usr record;
begin
  insert into public.tenants (id, name, slug)
  values (
    tenant_a,
    'Prefeitura Fluxo Manutenção',
    'manutencao-' || substr(tenant_a::text, 1, 8)
  );

  insert into public.vehicles (
    id, tenant_id, unit_code, plate, model, status, tank_capacity, current_odometer
  )
  values
    (vehicle_a, tenant_a, 'M-001', 'MAN1A11', 'Veículo manutenção', 'liberado', 50, 25000),
    (vehicle_b, tenant_a, 'M-002', 'MAN2A22', 'Veículo reserva', 'liberado', 50, 12000);

  insert into public.repair_shops (
    id, tenant_id, name, code, is_active, contract_number, contract_end
  )
  values (
    shop_a, tenant_a, 'Oficina Fluxo Real', 'OF-TESTE', true, 'CT-001',
    current_date + 365
  );

  for usr in select * from (values
    (manager_a, tenant_a, 'Gestor Teste', 'gestor', null::uuid),
    (driver_a, tenant_a, 'Motorista Teste', 'motorista', null::uuid),
    (workshop_a, tenant_a, 'Oficina Teste', 'oficina', shop_a)
  ) as data(user_id, tenant_id, full_name, profile_role, repair_shop_id)
  loop
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_user_meta_data
    )
    values (
      usr.user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'fluxo-' || substr(usr.user_id::text, 1, 8) || '@example.invalid',
      '',
      now(),
      now(),
      now(),
      jsonb_build_object(
        'full_name', usr.full_name,
        'tenant_id', usr.tenant_id::text
      )
    );

    update public.profiles
       set tenant_id = usr.tenant_id,
           full_name = usr.full_name,
           role = usr.profile_role,
           repair_shop_id = usr.repair_shop_id,
           access_blocked = false,
           driver_status = case
             when usr.profile_role = 'motorista' then 'ativo'::public.driver_lifecycle
             else driver_status
           end
     where id = usr.user_id;
  end loop;

  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', manager_a, 'role', 'authenticated')::text,
    true
  );

  ------------------------------------------------------------------ TESTE 1
  -- O gestor abre a solicitação em nome de um motorista real.
  begin
    order_a := public.manager_create_service_order(
      vehicle_a,
      driver_a,
      'Freios',
      'alta',
      'Ruído forte e perda de eficiência na frenagem',
      25000,
      null
    );
    select origin into value_text from public.service_orders where id = order_a;
    if value_text <> 'manager' then
      failures := failures || format('[T1] origem %s (esperado manager); ', value_text);
    end if;
  exception when others then
    get stacked diagnostics message = message_text;
    failures := failures || format('[T1] abertura falhou: %s; ', message);
  end;

  ------------------------------------------------------------------ TESTE 2
  select count(*) into value_count
    from public.service_order_events
   where service_order_id = order_a
     and to_state = 'pending';
  if value_count <> 1 then
    failures := failures || format('[T2] abertura gerou %s eventos (esperado 1); ', value_count);
  end if;

  ------------------------------------------------------------------ TESTE 3
  -- Uma segunda OS aberta para o mesmo veículo é recusada.
  begin
    perform public.manager_create_service_order(
      vehicle_a, driver_a, 'Elétrica', 'media', 'Falha elétrica concorrente', 25000, null
    );
    failures := failures || '[T3] aceitou duas OS abertas para o mesmo veículo; ';
  exception when others then null;
  end;

  ------------------------------------------------------------------ TESTE 4
  perform public.manager_authorize_service_order(
    order_a, shop_a, 'Diagnosticar o sistema de freios'
  );
  select operational_status::text into value_text
    from public.service_orders where id = order_a;
  if value_text <> 'authorized' then
    failures := failures || format('[T4] autorização deixou status %s; ', value_text);
  end if;

  ------------------------------------------------------------------ TESTE 5
  -- A oficina não pode orçar antes de o veículo chegar.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', workshop_a, 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.repair_shop_submit_quote_v2(
      order_a,
      '[{"kind":"peca","description":"Pastilhas","qty":1,"unit_price":300}]'::jsonb,
      current_date + 10,
      null
    );
    failures := failures || '[T5] oficina orçou antes da entrega do veículo; ';
  exception when others then null;
  end;

  ------------------------------------------------------------------ TESTE 6
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', manager_a, 'role', 'authenticated')::text,
    true
  );
  perform public.manager_confirm_shop_delivery(order_a);
  select operational_status::text into value_text
    from public.service_orders where id = order_a;
  if value_text <> 'at_shop' then
    failures := failures || format('[T6] entrega deixou status %s; ', value_text);
  end if;

  ------------------------------------------------------------------ TESTE 7
  -- Orçamento é calculado pelo servidor.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', workshop_a, 'role', 'authenticated')::text,
    true
  );
  quote_v1 := public.repair_shop_submit_quote_v2(
    order_a,
    '[{"kind":"peca","description":"Pastilhas","qty":2,"unit_price":150},
      {"kind":"mao_de_obra","description":"Substituição","qty":1,"unit_price":100}]'::jsonb,
    current_date + 10,
    'Primeiro orçamento'
  );
  select total into value_number from public.service_order_quotes where id = quote_v1;
  if value_number <> 400 then
    failures := failures || format('[T7] orçamento totalizou %s (esperado 400); ', value_number);
  end if;

  ------------------------------------------------------------------ TESTE 8
  -- Rejeição exige justificativa e devolve a OS para revisão da oficina.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', manager_a, 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.manager_review_service_order_quote(quote_v1, false, '');
    failures := failures || '[T8] rejeitou orçamento sem justificativa; ';
  exception when others then null;
  end;
  perform public.manager_review_service_order_quote(
    quote_v1, false, 'Detalhar a peça e revisar o valor'
  );
  select operational_status::text into value_text
    from public.service_orders where id = order_a;
  if value_text <> 'at_shop' then
    failures := failures || format('[T8b] rejeição deixou status %s; ', value_text);
  end if;

  ------------------------------------------------------------------ TESTE 9
  -- A oficina envia uma segunda versão e o gestor a aprova.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', workshop_a, 'role', 'authenticated')::text,
    true
  );
  quote_v2 := public.repair_shop_submit_quote_v2(
    order_a,
    '[{"kind":"peca","description":"Pastilhas dianteiras homologadas","qty":2,"unit_price":150},
      {"kind":"mao_de_obra","description":"Substituição e teste","qty":1,"unit_price":100}]'::jsonb,
    current_date + 10,
    'Orçamento revisado'
  );
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', manager_a, 'role', 'authenticated')::text,
    true
  );
  perform public.manager_review_service_order_quote(quote_v2, true, 'Aprovado');
  select financial_status::text, budget
    into value_text, value_number
    from public.service_orders where id = order_a;
  if value_text <> 'awaiting_commitment' or value_number <> 400 then
    failures := failures || format('[T9] aprovação resultou em %s / R$ %s; ', value_text, value_number);
  end if;

  ----------------------------------------------------------------- TESTE 10
  -- Sem empenho a oficina não inicia a execução.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', workshop_a, 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.repair_shop_start_service(order_a);
    failures := failures || '[T10] oficina iniciou o serviço sem empenho; ';
  exception when others then null;
  end;

  ----------------------------------------------------------------- TESTE 11
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', manager_a, 'role', 'authenticated')::text,
    true
  );
  perform public.manager_register_service_order_commitment(
    order_a, 'EMP-2026-001', 'NAD-2026-001'
  );
  select financial_status::text into value_text
    from public.service_orders where id = order_a;
  if value_text <> 'committed' then
    failures := failures || format('[T11] empenho deixou status %s; ', value_text);
  end if;

  ----------------------------------------------------------------- TESTE 12
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', workshop_a, 'role', 'authenticated')::text,
    true
  );
  perform public.repair_shop_start_service(order_a);
  insert into storage.objects (bucket_id, name, owner_id)
  values (
    'fotos',
    format(
      'tenant/%s/repair_shops/%s/service_orders/%s/completion/final.webp',
      tenant_a, shop_a, order_a
    ),
    workshop_a::text
  );
  perform public.repair_shop_finish_service_v2(
    order_a,
    'Pastilhas substituídas, fluido verificado e frenagem testada',
    array[format(
      'tenant/%s/repair_shops/%s/service_orders/%s/completion/final.webp',
      tenant_a, shop_a, order_a
    )]
  );
  select operational_status::text into value_text
    from public.service_orders where id = order_a;
  if value_text <> 'ready' then
    failures := failures || format('[T12] conclusão deixou status %s; ', value_text);
  end if;

  ----------------------------------------------------------------- TESTE 13
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', manager_a, 'role', 'authenticated')::text,
    true
  );
  perform public.manager_receive_service_order_vehicle(order_a);
  select operational_status::text into value_text
    from public.service_orders where id = order_a;
  if value_text <> 'received' then
    failures := failures || format('[T13] recebimento deixou status %s; ', value_text);
  end if;

  ----------------------------------------------------------------- TESTE 14
  -- NF acima do orçamento é recusada.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', workshop_a, 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.repair_shop_submit_invoice_v2(
      order_a,
      'NF-ACIMA',
      401,
      format(
        'repair_shops/%s/%s/service_orders/%s/invoices/nf-acima.pdf',
        tenant_a, shop_a, order_a
      ),
      current_date
    );
    failures := failures || '[T14] aceitou NF acima do orçamento; ';
  exception when others then null;
  end;

  ----------------------------------------------------------------- TESTE 15
  invoice_a := public.repair_shop_submit_invoice_v2(
    order_a,
    'NF-001',
    400,
    format(
      'repair_shops/%s/%s/service_orders/%s/invoices/nf-001.pdf',
      tenant_a, shop_a, order_a
    ),
    current_date
  );
  select financial_status::text into value_text
    from public.service_orders where id = order_a;
  if value_text <> 'invoiced' then
    failures := failures || format('[T15] NF deixou status %s; ', value_text);
  end if;

  ----------------------------------------------------------------- TESTE 16
  -- Pagamento antes do ateste é recusado.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', manager_a, 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.manager_register_service_order_payment(
      order_a, 400, invoice_a, current_date, null
    );
    failures := failures || '[T16] pagamento foi aceito antes do ateste; ';
  exception when others then null;
  end;
  perform public.manager_attest_service_order_invoice(invoice_a);

  ----------------------------------------------------------------- TESTE 17
  -- Pagamento acima do saldo é recusado; pagamento parcial mantém o processo.
  begin
    perform public.manager_register_service_order_payment(
      order_a, 401, invoice_a, current_date, null
    );
    failures := failures || '[T17] pagamento acima do saldo foi aceito; ';
  exception when others then null;
  end;
  paid := public.manager_register_service_order_payment(
    order_a, 100, invoice_a, current_date, 'Parcela 1'
  );
  if paid then failures := failures || '[T17b] pagamento parcial encerrou o processo; '; end if;
  select financial_status::text into value_text
    from public.service_orders where id = order_a;
  if value_text <> 'attested' then
    failures := failures || format('[T17c] parcial deixou status %s; ', value_text);
  end if;

  ----------------------------------------------------------------- TESTE 18
  paid := public.manager_register_service_order_payment(
    order_a, 300, invoice_a, current_date, 'Parcela final'
  );
  select financial_status::text, cost
    into value_text, value_number
    from public.service_orders where id = order_a;
  if not paid or value_text <> 'paid' or value_number <> 400 then
    failures := failures || format(
      '[T18] quitação resultou em paid=%s, status=%s, custo=%s; ',
      paid, value_text, value_number
    );
  end if;

  perform set_config('role', 'postgres', true);
  if failures = '' then
    raise exception 'TODOS OS TESTES PASSARAM (18/18) — rollback automático';
  end if;
  raise exception 'FALHAS >>> %', failures;
end
$$;

rollback;
