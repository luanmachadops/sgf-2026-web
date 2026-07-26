-- ============================================================================
-- ABASTECIMENTO V2 — gestor → posto → validação
--
-- Resultado esperado:
--   "TODOS OS TESTES PASSARAM (11/11) — rollback automático"
-- ============================================================================

begin;

do $$
declare
  tenant_a uuid := gen_random_uuid();
  vehicle_a uuid := gen_random_uuid();
  vehicle_b uuid := gen_random_uuid();
  station_a uuid := gen_random_uuid();
  manager_a uuid := gen_random_uuid();
  driver_a uuid := gen_random_uuid();
  station_user uuid := gen_random_uuid();
  authorization_a uuid;
  authorization_b uuid;
  direct_a uuid;
  total numeric;
  price numeric;
  value_number numeric;
  value_text text;
  value_count integer;
  failures text := '';
  message text;
  usr record;
begin
  insert into public.tenants (id, name, slug)
  values (
    tenant_a,
    'Prefeitura Fluxo Abastecimento',
    'abastecimento-' || substr(tenant_a::text, 1, 8)
  );

  insert into public.vehicles (
    id, tenant_id, unit_code, plate, model, status, tank_capacity,
    current_odometer, fuel_type
  )
  values
    (vehicle_a, tenant_a, 'F-001', 'FUE1A11', 'Veículo A', 'liberado', 50, 1000, 'diesel'),
    (vehicle_b, tenant_a, 'F-002', 'FUE2A22', 'Veículo B', 'liberado', 50, 2000, 'diesel');

  insert into public.fuel_stations (
    id, tenant_id, name, code, is_active, contract_number, contract_end,
    fuel_types, fuel_prices
  )
  values (
    station_a, tenant_a, 'Posto Contratado', 'PS-001', true, 'CT-001',
    current_date + 365, array['diesel'], '{"Diesel": 6.00}'::jsonb
  );

  for usr in select * from (values
    (manager_a, tenant_a, 'Gestor Teste', 'gestor', null::uuid),
    (driver_a, tenant_a, 'Motorista Teste', 'motorista', null::uuid),
    (station_user, tenant_a, 'Posto Teste', 'posto', station_a)
  ) as data(user_id, tenant_id, full_name, profile_role, station_id)
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
      'fuel-' || substr(usr.user_id::text, 1, 8) || '@example.invalid',
      '',
      now(),
      now(),
      now(),
      jsonb_build_object('full_name', usr.full_name, 'tenant_id', usr.tenant_id::text)
    );
    update public.profiles
       set tenant_id = usr.tenant_id,
           full_name = usr.full_name,
           role = usr.profile_role,
           station_id = usr.station_id,
           access_blocked = false,
           driver_status = case
             when usr.profile_role = 'motorista' then 'ativo'::public.driver_lifecycle
             else driver_status
           end
     where id = usr.user_id;
  end loop;

  -- Base anterior para cálculo de km/L.
  insert into public.fuelings (
    tenant_id, vehicle_id, driver_id, fuel_type, liters, total_cost,
    price_per_liter, odometer, workflow_status, validated_at, validated_by,
    filled_at
  )
  values (
    tenant_a, vehicle_a, driver_a, 'Diesel', 20, 120, 6, 1000,
    'validado', now() - interval '10 days', manager_a, now() - interval '10 days'
  );

  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', manager_a, 'role', 'authenticated')::text,
    true
  );

  ------------------------------------------------------------------ TESTE 1
  authorization_a := public.manager_create_fueling_authorization(
    vehicle_a,
    driver_a,
    station_a,
    'Diesel',
    40,
    now() + interval '1 day',
    'Completar até o limite'
  );
  select count(*) into value_count
    from public.fuelings
   where id = authorization_a
     and driver_id = driver_a
     and station_id = station_a
     and workflow_status = 'autorizado'
     and authorization_note = 'Completar até o limite';
  if value_count <> 1 then failures := failures || '[T1] autorização não preservou os vínculos; '; end if;

  ------------------------------------------------------------------ TESTE 2
  begin
    perform public.manager_create_fueling_authorization(
      vehicle_a, driver_a, station_a, 'Diesel', 40,
      now() + interval '1 day', null
    );
    failures := failures || '[T2] aceitou duas autorizações abertas para o veículo; ';
  exception when others then null;
  end;

  ------------------------------------------------------------------ TESTE 3
  begin
    perform public.manager_create_fueling_authorization(
      vehicle_b, driver_a, station_a, 'Diesel', 60,
      now() + interval '1 day', null
    );
    failures := failures || '[T3] aceitou limite acima da tolerância do tanque; ';
  exception when others then null;
  end;

  ------------------------------------------------------------------ TESTE 4
  -- Só o posto vinculado executa; preço e total vêm do contrato.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', station_user, 'role', 'authenticated')::text,
    true
  );
  select total_cost, price_per_liter into total, price
    from public.partner_complete_fueling_v2(
      authorization_a,
      40,
      1100,
      'CUPOM-001',
      format(
        'https://example.supabase.co/storage/v1/object/public/fotos/tenant/%s/stations/%s/fuelings/%s/bico.webp',
        tenant_a, station_a, authorization_a
      )
    );
  if total <> 240 or price <> 6 then
    failures := failures || format('[T4] execução totalizou %s a %s/L; ', total, price);
  end if;

  ------------------------------------------------------------------ TESTE 5
  -- Usuário do posto não acessa RPC gerencial.
  begin
    perform public.manager_create_fueling_authorization(
      vehicle_b, driver_a, station_a, 'Diesel', 40,
      now() + interval '1 day', null
    );
    failures := failures || '[T5] posto executou RPC exclusiva do gestor; ';
  exception when others then null;
  end;

  ------------------------------------------------------------------ TESTE 6
  -- Validação atualiza hodômetro e consumo atomicamente.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', manager_a, 'role', 'authenticated')::text,
    true
  );
  perform public.manager_review_fueling(authorization_a, true, 'Conferido');
  select workflow_status::text, km_per_liter
    into value_text, value_number
    from public.fuelings where id = authorization_a;
  if value_text <> 'validado' or value_number <> 2.5 then
    failures := failures || format('[T6] validação resultou em %s / %s km/L; ', value_text, value_number);
  end if;
  select current_odometer into value_number from public.vehicles where id = vehicle_a;
  if value_number <> 1100 then failures := failures || '[T6b] hodômetro do veículo não foi atualizado; '; end if;

  ------------------------------------------------------------------ TESTE 7
  -- Lançamento direto exige comprovantes.
  begin
    perform public.manager_create_direct_fueling(
      vehicle_a, driver_a, 'Diesel', 10, 99, 1150, station_a, null,
      current_date, null, null, true
    );
    failures := failures || '[T7] lançamento direto sem comprovantes foi aceito; ';
  exception when others then null;
  end;

  ------------------------------------------------------------------ TESTE 8
  -- Mesmo recebendo 99 do cliente, posto contratado usa preço 6 do contrato.
  direct_a := public.manager_create_direct_fueling(
    vehicle_a,
    driver_a,
    'Diesel',
    10,
    99,
    1150,
    station_a,
    null,
    current_date,
    'https://example.invalid/requisicao.webp',
    'https://example.invalid/hodometro.webp',
    true
  );
  select total_cost, price_per_liter, driver_id::text
    into total, price, value_text
    from public.fuelings where id = direct_a;
  if total <> 60 or price <> 6 or value_text <> driver_a::text then
    failures := failures || format(
      '[T8] direto resultou em total=%s preço=%s motorista=%s; ',
      total, price, value_text
    );
  end if;

  ------------------------------------------------------------------ TESTE 9
  authorization_b := public.manager_create_fueling_authorization(
    vehicle_b, driver_a, station_a, 'Diesel', 40,
    now() + interval '1 day', null
  );
  perform public.manager_cancel_fueling_authorization(
    authorization_b, 'Veículo não fará mais a viagem'
  );
  select workflow_status::text into value_text
    from public.fuelings where id = authorization_b;
  if value_text <> 'rejeitado_admin' then
    failures := failures || format('[T9] cancelamento deixou status %s; ', value_text);
  end if;

  ----------------------------------------------------------------- TESTE 10
  -- Aprovação de execução exige foto do bico e número do cupom.
  authorization_b := public.manager_create_fueling_authorization(
    vehicle_b, driver_a, station_a, 'Diesel', 40,
    now() + interval '1 day', null
  );
  perform set_config('role', 'postgres', true);
  update public.fuelings
     set liters = 10,
         odometer = 2050,
         price_per_liter = 6,
         total_cost = 60,
         filled_at = now(),
         workflow_status = 'concluido'
   where id = authorization_b;
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', manager_a, 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.manager_review_fueling(authorization_b, true, 'Conferido');
    failures := failures || '[T10] aprovou execução sem foto e cupom; ';
  exception when others then null;
  end;

  ----------------------------------------------------------------- TESTE 11
  -- Registro sem evidência pode ser rejeitado, mas exige motivo.
  begin
    perform public.manager_review_fueling(authorization_b, false, '');
    failures := failures || '[T11] rejeitou execução sem justificativa; ';
  exception when others then null;
  end;
  perform public.manager_review_fueling(
    authorization_b, false, 'Cupom não corresponde ao abastecimento'
  );
  select cancellation_reason into value_text
    from public.fuelings where id = authorization_b;
  if value_text <> 'Cupom não corresponde ao abastecimento' then
    failures := failures || '[T11b] rejeição não preservou o parecer; ';
  end if;

  perform set_config('role', 'postgres', true);
  if failures = '' then
    raise exception 'TODOS OS TESTES PASSARAM (11/11) — rollback automático';
  end if;
  raise exception 'FALHAS >>> %', failures;
end
$$;

rollback;
