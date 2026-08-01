-- ============================================================================
-- FASE 2 — Suíte de isolamento dos portais de parceiros
--
-- COMO RODAR
--   Tudo acontece dentro de uma transação que termina em ROLLBACK: nenhum dado
--   de teste sobra, e é seguro rodar contra produção.
--
--     psql "$DATABASE_URL" -f supabase/tests/rls_partner_isolation.sql
--
--   Ou colando o conteúdo no SQL editor. O resultado esperado é UMA exceção
--   final começando com "TODOS OS TESTES PASSARAM" — é ela que provoca o
--   rollback. Qualquer outra mensagem é falha.
--
-- O QUE ISSO PROVA
--   Que um posto/oficina não enxerga dados de outro parceiro nem de outra
--   prefeitura, que não consegue escrever direto nas tabelas, e que as RPCs
--   recusam parceiro bloqueado, contrato vencido e valores inválidos.
--
-- RESULTADO DA ÚLTIMA EXECUÇÃO
--   2026-07-26 — 20/20 passaram contra o banco de produção, incluindo Storage.
--
-- DUAS ARMADILHAS DA MASSA DE TESTE (custaram duas execuções)
--   • `auth.users` tem trigger `handle_new_user`, que já cria o `profiles` e
--     exige `tenant_id` em `raw_user_meta_data` — por isso os usuários são
--     inseridos com metadata e o profile é ajustado por UPDATE, não INSERT.
--   • `service_orders.driver_id` é NOT NULL, então a massa precisa de um
--     motorista mesmo que o teste seja sobre a oficina.
--
-- POR QUE IMPORTA
--   Postos e oficinas são EMPRESAS PRIVADAS com login no sistema da
--   prefeitura. Um furo aqui não é bug de tela: é dado de uma prefeitura
--   visível para terceiro de outra.
-- ============================================================================

begin;

-- ── Cenário ─────────────────────────────────────────────────────────────────
-- Prefeitura A: posto A1, posto A2, oficina A1
-- Prefeitura B: posto B1
-- Cada um com seu login. As asserções checam quem enxerga o quê.

do $$
declare
  t_a uuid := gen_random_uuid();  t_b uuid := gen_random_uuid();
  st_a1 uuid := gen_random_uuid(); st_a2 uuid := gen_random_uuid(); st_b1 uuid := gen_random_uuid();
  of_a1 uuid := gen_random_uuid();
  veh_a uuid := gen_random_uuid(); veh_a2 uuid := gen_random_uuid(); veh_b uuid := gen_random_uuid();
  u_posto_a1 uuid := gen_random_uuid(); u_posto_a2 uuid := gen_random_uuid();
  u_posto_b1 uuid := gen_random_uuid(); u_oficina_a1 uuid := gen_random_uuid();
  u_bloqueado uuid := gen_random_uuid(); st_bloq uuid := gen_random_uuid();
  u_vencido uuid := gen_random_uuid();  st_venc uuid := gen_random_uuid();
  f_a1 uuid := gen_random_uuid(); f_a2 uuid := gen_random_uuid(); f_b1 uuid := gen_random_uuid();
  so_a1 uuid := gen_random_uuid(); so_a2 uuid := gen_random_uuid();
  u_motorista uuid := gen_random_uuid();
  n int; msg text; falhas text := '';
  v_total numeric; v_price numeric; v_liters numeric; q uuid; u record;
begin
  -- ── Massa de teste (como postgres, ignorando RLS) ────────────────────────
  insert into public.tenants (id, name, slug) values
    (t_a, 'Prefeitura Teste A', 'teste-a-' || substr(t_a::text,1,8)),
    (t_b, 'Prefeitura Teste B', 'teste-b-' || substr(t_b::text,1,8));

  insert into public.fuel_stations (id, tenant_id, name, is_active, fuel_prices, fuel_types) values
    (st_a1, t_a, 'Posto A1', true, '{"Diesel": 6.00}'::jsonb, array['diesel']),
    (st_a2, t_a, 'Posto A2', true, '{"Diesel": 6.10}'::jsonb, array['diesel']),
    (st_b1, t_b, 'Posto B1', true, '{"Diesel": 6.20}'::jsonb, array['diesel']),
    (st_bloq, t_a, 'Posto Bloqueado', true, '{"Diesel": 6.00}'::jsonb, array['diesel']),
    (st_venc, t_a, 'Posto Vencido', true, '{"Diesel": 6.00}'::jsonb, array['diesel']);
  update public.fuel_stations set contract_end = current_date - 1 where id = st_venc;

  insert into public.repair_shops (id, tenant_id, name, is_active) values (of_a1, t_a, 'Oficina A1', true);

  insert into public.vehicles (id, tenant_id, unit_code, plate, model, status, tank_capacity, current_odometer) values
    (veh_a, t_a, 'A-001', 'AAA1A11', 'Carro A', 'liberado', 50, 1000),
    (veh_a2, t_a, 'A-002', 'AAA2A22', 'Carro A2', 'liberado', 50, 1200),
    (veh_b, t_b, 'B-001', 'BBB1B11', 'Carro B', 'liberado', 50, 2000);

  -- Usuários. O trigger `handle_new_user` em auth.users já cria o profiles e
  -- exige tenant_id no metadata — por isso o profile é ajustado por UPDATE.
  for u in select * from (values
      (u_posto_a1,   t_a, 'Login Posto A1',   'posto',    st_a1,   null::uuid, false),
      (u_posto_a2,   t_a, 'Login Posto A2',   'posto',    st_a2,   null::uuid, false),
      (u_posto_b1,   t_b, 'Login Posto B1',   'posto',    st_b1,   null::uuid, false),
      (u_oficina_a1, t_a, 'Login Oficina A1', 'oficina',  null::uuid, of_a1,   false),
      (u_bloqueado,  t_a, 'Login Bloqueado',  'posto',    st_bloq, null::uuid, true),
      (u_vencido,    t_a, 'Login Vencido',    'posto',    st_venc, null::uuid, false),
      (u_motorista,  t_a, 'Motorista Teste',  'motorista', null::uuid, null::uuid, false)
    ) as x(uid, tid, nome, papel, sid, oid, bloq)
  loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at, raw_user_meta_data)
    values (u.uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'teste-' || substr(u.uid::text,1,8) || '@example.invalid', '', now(), now(), now(),
            jsonb_build_object('full_name', u.nome, 'tenant_id', u.tid::text));
    update public.profiles set tenant_id = u.tid, full_name = u.nome, role = u.papel,
           station_id = u.sid, repair_shop_id = u.oid, access_blocked = u.bloq
     where id = u.uid;
  end loop;

  -- Autorizações de abastecimento
  insert into public.fuelings (id, tenant_id, vehicle_id, station_id, fuel_type, liters, workflow_status, authorized_at, max_liters) values
    (f_a1, t_a, veh_a, st_a1, 'diesel', 0, 'autorizado', now(), 40),
    (f_a2, t_a, veh_a, st_a2, 'diesel', 0, 'autorizado', now(), 40),
    (f_b1, t_b, veh_b, st_b1, 'diesel', 0, 'autorizado', now(), 40);

  -- Ordens de serviço
  insert into public.service_orders (
    id, tenant_id, vehicle_id, driver_id, opened_by, repair_shop_id,
    category, description, operational_status, financial_status
  ) values
    (so_a1, t_a, veh_a,  u_motorista, u_motorista, of_a1, 'mecanica', 'OS da oficina A1', 'authorized', 'not_started'),
    (so_a2, t_a, veh_a2, u_motorista, u_motorista, null,  'mecanica', 'OS sem oficina',   'pending',    'not_started');

  -- ── Helper de assert ─────────────────────────────────────────────────────
  -- (inline: cada bloco acumula em `falhas` em vez de abortar no primeiro erro,
  --  para o relatório mostrar TODOS os problemas de uma vez)

  ------------------------------------------------------------------ TESTE 1
  -- Posto A1 enxerga só a autorização da própria bandeira.
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_posto_a1, 'role','authenticated')::text, true);

  select count(*) into n from public.fuelings;
  if n <> 1 then falhas := falhas || format('[T1] posto A1 vê %s fuelings (esperado 1); ', n); end if;

  select count(*) into n from public.fuelings where id = f_a2;
  if n <> 0 then falhas := falhas || '[T1b] posto A1 ENXERGA autorização do posto A2 (mesmo tenant); '; end if;

  select count(*) into n from public.fuelings where id = f_b1;
  if n <> 0 then falhas := falhas || '[T1c] posto A1 ENXERGA autorização de OUTRA PREFEITURA; '; end if;

  ------------------------------------------------------------------ TESTE 2
  -- Parceiro não acessa vehicles nem profiles direto.
  select count(*) into n from public.vehicles;
  if n <> 0 then falhas := falhas || format('[T2] posto enxerga %s veículos direto (esperado 0); ', n); end if;

  select count(*) into n from public.profiles where id <> u_posto_a1;
  if n <> 0 then falhas := falhas || format('[T2b] posto enxerga %s profiles alheios; ', n); end if;

  ------------------------------------------------------------------ TESTE 3
  -- Escrita direta é proibida (só RPC).
  begin
    update public.fuelings set total_cost = 1 where id = f_a1;
    get diagnostics n = row_count;
    if n > 0 then falhas := falhas || '[T3] posto conseguiu UPDATE DIRETO em fuelings; '; end if;
  exception when insufficient_privilege or others then null;  -- bloqueado: ok
  end;

  ------------------------------------------------------------------ TESTE 4
  -- RPC de leitura devolve só o que é do posto.
  select count(*) into n from public.get_station_pending_authorizations();
  if n <> 1 then falhas := falhas || format('[T4] RPC devolveu %s autorizações (esperado 1); ', n); end if;

  ------------------------------------------------------------------ TESTE 5
  -- RPC de escrita: litros acima do autorizado é recusado.
  begin
    perform public.partner_complete_fueling_v2(
      f_a1, 999, 1500, 'NF1',
      format('https://example.supabase.co/storage/v1/object/public/fotos/tenant/%s/stations/%s/fuelings/%s/bico.webp', t_a, st_a1, f_a1)
    );
    falhas := falhas || '[T5] RPC aceitou litros acima do max_liters; ';
  exception when others then null;  -- recusado: ok
  end;

  ------------------------------------------------------------------ TESTE 6
  -- RPC de escrita em autorização de OUTRO posto é recusada.
  begin
    perform public.partner_complete_fueling_v2(
      f_a2, 10, 1500, 'NF1',
      format('https://example.supabase.co/storage/v1/object/public/fotos/tenant/%s/stations/%s/fuelings/%s/bico.webp', t_a, st_a1, f_a2)
    );
    falhas := falhas || '[T6] posto A1 completou abastecimento do posto A2; ';
  exception when others then null;
  end;

  ------------------------------------------------------------------ TESTE 7
  -- Caminho feliz + preço vindo do contrato (6.00), não do cliente.
  begin
    select total_cost, price_per_liter into v_total, v_price
      from public.partner_complete_fueling_v2(
        f_a1, 10, 1500, 'NF1',
        format('https://example.supabase.co/storage/v1/object/public/fotos/tenant/%s/stations/%s/fuelings/%s/bico.webp', t_a, st_a1, f_a1)
      );
    if v_price <> 6.00 then falhas := falhas || format('[T7] preço veio %s (esperado 6.00 do contrato); ', v_price); end if;
    if v_total <> 60.00 then falhas := falhas || format('[T7b] total veio %s (esperado 60.00); ', v_total); end if;
  exception when others then
    get stacked diagnostics msg = message_text;
    falhas := falhas || format('[T7] caminho feliz falhou: %s; ', msg);
  end;

  ------------------------------------------------------------------ TESTE 8
  -- Idempotência: repetir o mesmo envio não duplica nem erra.
  begin
    perform public.partner_complete_fueling_v2(
      f_a1, 10, 1500, 'NF1',
      format('https://example.supabase.co/storage/v1/object/public/fotos/tenant/%s/stations/%s/fuelings/%s/bico.webp', t_a, st_a1, f_a1)
    );
  exception when others then
    get stacked diagnostics msg = message_text;
    falhas := falhas || format('[T8] segundo envio não foi idempotente: %s; ', msg);
  end;

  ------------------------------------------------------------------ TESTE 9
  -- Posto de OUTRA prefeitura não enxerga nada do tenant A.
  perform set_config('request.jwt.claims', json_build_object('sub', u_posto_b1, 'role','authenticated')::text, true);
  select count(*) into n from public.fuelings where tenant_id = t_a;
  if n <> 0 then falhas := falhas || format('[T9] posto B1 enxerga %s fuelings da prefeitura A; ', n); end if;

  select count(*) into n from public.get_station_pending_authorizations();
  if n <> 1 then falhas := falhas || format('[T9b] RPC do posto B1 devolveu %s (esperado 1, só o dele); ', n); end if;

  ------------------------------------------------------------------ TESTE 10
  -- Oficina enxerga só as próprias OS.
  perform set_config('request.jwt.claims', json_build_object('sub', u_oficina_a1, 'role','authenticated')::text, true);
  select count(*) into n from public.service_orders;
  if n <> 1 then falhas := falhas || format('[T10] oficina vê %s OS (esperado 1); ', n); end if;

  select count(*) into n from public.get_repair_shop_orders();
  if n <> 1 then falhas := falhas || format('[T10b] RPC da oficina devolveu %s OS (esperado 1); ', n); end if;

  ------------------------------------------------------------------ TESTE 11
  -- Oficina não inicia serviço sem empenho.
  begin
    perform public.repair_shop_start_service(so_a1);
    falhas := falhas || '[T11] oficina iniciou execução SEM empenho; ';
  exception when others then null;
  end;

  ------------------------------------------------------------------ TESTE 12
  -- Orçamento: total é calculado no servidor.
  perform set_config('role','postgres', true);
  update public.service_orders set operational_status = 'at_shop' where id = so_a1;
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_oficina_a1, 'role','authenticated')::text, true);
  begin
    q := public.repair_shop_submit_quote_v2(so_a1,
          '[{"kind":"peca","description":"Pastilha","qty":2,"unit_price":150.00},
            {"kind":"mao_de_obra","description":"Troca","qty":1,"unit_price":100.00}]'::jsonb, null, null);
    select total into v_total from public.service_order_quotes where id = q;
    if v_total <> 400.00 then falhas := falhas || format('[T12] total do orçamento %s (esperado 400.00); ', v_total); end if;
  exception when others then
    get stacked diagnostics msg = message_text;
    falhas := falhas || format('[T12] orçamento falhou: %s; ', msg);
  end;

  ------------------------------------------------------------------ TESTE 13
  -- Oficina não emite NF antes de a prefeitura receber o veículo.
  begin
    perform public.repair_shop_submit_invoice_v2(
      so_a1, 'NF-999', 400.00,
      format('repair_shops/%s/%s/service_orders/%s/invoices/nf-999.pdf', t_a, of_a1, so_a1),
      current_date
    );
    falhas := falhas || '[T13] oficina emitiu NF antes do recebimento; ';
  exception when others then null;
  end;

  ------------------------------------------------------------------ TESTE 14
  -- Parceiro bloqueado é recusado.
  perform set_config('request.jwt.claims', json_build_object('sub', u_bloqueado, 'role','authenticated')::text, true);
  begin
    perform public.get_station_pending_authorizations();
    falhas := falhas || '[T14] parceiro BLOQUEADO conseguiu usar a RPC; ';
  exception when others then null;
  end;

  ------------------------------------------------------------------ TESTE 15
  -- Contrato vencido é recusado.
  perform set_config('request.jwt.claims', json_build_object('sub', u_vencido, 'role','authenticated')::text, true);
  begin
    perform public.get_station_pending_authorizations();
    falhas := falhas || '[T15] parceiro com CONTRATO VENCIDO conseguiu usar a RPC; ';
  exception when others then null;
  end;

  ------------------------------------------------------------------ TESTE 16
  -- Oficina pode gravar documento no próprio diretório, mas não em outro
  -- parceiro do mesmo tenant.
  perform set_config('request.jwt.claims', json_build_object('sub', u_oficina_a1, 'role','authenticated')::text, true);
  begin
    insert into storage.objects (bucket_id, name, owner_id)
    values ('documentos', format('repair_shops/%s/%s/service_orders/%s/invoices/ok.pdf', t_a, of_a1, so_a1), u_oficina_a1::text);
  exception when others then
    get stacked diagnostics msg = message_text;
    falhas := falhas || format('[T16] oficina não gravou no próprio diretório: %s; ', msg);
  end;
  begin
    insert into storage.objects (bucket_id, name, owner_id)
    values ('documentos', format('repair_shops/%s/%s/service_orders/%s/invoices/invasao.pdf', t_a, gen_random_uuid(), so_a1), u_oficina_a1::text);
    falhas := falhas || '[T16b] oficina gravou documento no diretório de OUTRO parceiro; ';
  exception when others then null;
  end;

  ------------------------------------------------------------------ TESTE 17
  -- Caminho execução: com empenho inicia e conclui com foto vinculada.
  perform set_config('role','postgres', true);
  update public.service_orders
     set financial_status = 'committed', commitment_number = 'EMP-001', budget = 400
   where id = so_a1;
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_oficina_a1, 'role','authenticated')::text, true);
  begin
    perform public.repair_shop_start_service(so_a1);
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'fotos',
      format(
        'tenant/%s/repair_shops/%s/service_orders/%s/completion/final.webp',
        t_a, of_a1, so_a1
      ),
      u_oficina_a1::text
    );
    perform public.repair_shop_finish_service_v2(
      so_a1,
      'Pastilhas substituídas e sistema revisado',
      array[format(
        'tenant/%s/repair_shops/%s/service_orders/%s/completion/final.webp',
        t_a, of_a1, so_a1
      )]
    );
    select count(*) into n
      from public.service_order_events
     where service_order_id = so_a1 and attachment_path is not null;
    if n <> 1 then falhas := falhas || format('[T17] conclusão registrou %s fotos (esperado 1); ', n); end if;
  exception when others then
    get stacked diagnostics msg = message_text;
    falhas := falhas || format('[T17] execução/conclusão falhou: %s; ', msg);
  end;

  ------------------------------------------------------------------ TESTE 18
  -- Após recebimento, NF privada é aceita e move o eixo financeiro.
  perform set_config('role','postgres', true);
  update public.service_orders set operational_status = 'received' where id = so_a1;
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_oficina_a1, 'role','authenticated')::text, true);
  begin
    q := public.repair_shop_submit_invoice_v2(
      so_a1, 'NF-001', 400.00,
      format('repair_shops/%s/%s/service_orders/%s/invoices/nf-001.pdf', t_a, of_a1, so_a1),
      current_date
    );
    select count(*) into n from public.service_order_invoices where id = q and file_path is not null;
    if n <> 1 then falhas := falhas || '[T18] NF não foi persistida com arquivo; '; end if;
  exception when others then
    get stacked diagnostics msg = message_text;
    falhas := falhas || format('[T18] emissão de NF falhou: %s; ', msg);
  end;

  ------------------------------------------------------------------ TESTE 19
  -- Fechamento mensal do posto soma apenas a própria execução.
  perform set_config('request.jwt.claims', json_build_object('sub', u_posto_a1, 'role','authenticated')::text, true);
  begin
    select coalesce(sum(total_liters), 0), coalesce(sum(total_amount), 0)
      into v_liters, v_total
      from public.get_station_monthly_summary(current_date);
    if v_liters <> 10 then falhas := falhas || format('[T19] fechamento somou %s L (esperado 10); ', v_liters); end if;
    if v_total <> 60 then falhas := falhas || format('[T19b] fechamento somou R$ %s (esperado 60); ', v_total); end if;
  exception when others then
    get stacked diagnostics msg = message_text;
    falhas := falhas || format('[T19] fechamento mensal falhou: %s; ', msg);
  end;

  ------------------------------------------------------------------ TESTE 20
  -- A autorização gera aviso apenas para o login do posto vinculado.
  select count(*) into n
    from public.notifications
   where driver_id = u_posto_a1
     and entity_type = 'fueling'
     and entity_id = f_a1
     and title = 'Nova autorização de abastecimento';
  if n <> 1 then falhas := falhas || format('[T20] posto A1 recebeu %s avisos da própria autorização (esperado 1); ', n); end if;

  select count(*) into n
    from public.notifications
   where entity_id in (f_a2, f_b1);
  if n <> 0 then falhas := falhas || format('[T20b] posto A1 enxerga %s avisos de outros postos; ', n); end if;

  ------------------------------------------------------------------ RELATÓRIO
  perform set_config('role','postgres', true);
  if falhas = '' then
    raise exception 'TODOS OS TESTES PASSARAM (20/20) — rollback automático';
  else
    raise exception 'FALHAS >>> %', falhas;
  end if;
end $$;

rollback;
