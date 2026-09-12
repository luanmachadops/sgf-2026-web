import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migrationUrl = new URL('../supabase/migrations/20260912152713_procurement_legacy_ceiling_integrity.sql', import.meta.url);

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema sgf_private;
    create table public.tenants(id uuid primary key);
    create table public.instrument_budget_allocations(id uuid primary key,department_id uuid not null,category text not null,spending_limit numeric not null);
    create table public.procurement_fuel_reservations(fueling_id uuid primary key,tenant_id uuid not null,allocation_id uuid not null,committed_amount numeric not null);
    create table public.procurement_station_reservations(operation_id uuid primary key,tenant_id uuid not null,allocation_id uuid not null,committed_amount numeric not null);
    create table public.service_order_quote_procurement_reservations(quote_item_id uuid primary key,tenant_id uuid not null,allocation_id uuid not null,committed_amount numeric not null);
    create table public.budget_entries(source_type text,source_id uuid,contract_id uuid,department_id uuid,partner_id uuid,reserved numeric not null,realized numeric not null,disputed numeric not null,primary key(source_type,source_id));
    create table public.procurement_legacy_reconciliations(source_type text,source_id uuid,tenant_id uuid,legacy_contract_id uuid,instrument_id uuid,allocation_id uuid,amount_at_reconciliation numeric not null,primary key(source_type,source_id));
    create table public.station_operations(id uuid primary key,tenant_id uuid,station_id uuid,item_kind text);
    create table public.service_order_quotes(id uuid primary key,service_order_id uuid,repair_shop_id uuid,status text);
    create table public.service_order_quote_items(id uuid primary key,quote_id uuid,category text);
    create table public.procurement_items(id uuid primary key,instrument_id uuid,partner_id uuid,partner_kind text,category text);
  `);
  return db;
}

const ids = {
  tenant: '00000000-0000-0000-0000-000000000001', allocation: '00000000-0000-0000-0000-000000000002',
  department: '00000000-0000-0000-0000-000000000003', contract: '00000000-0000-0000-0000-000000000004',
  instrument: '00000000-0000-0000-0000-000000000005', partner: '00000000-0000-0000-0000-000000000006',
  source: '00000000-0000-0000-0000-000000000007', item: '00000000-0000-0000-0000-000000000008',
};

test('legado conciliado participa do teto combinado e impede redução abaixo do consumo', async () => {
  const db = await fixture();
  await db.exec(`
    insert into tenants values('${ids.tenant}');
    insert into instrument_budget_allocations values('${ids.allocation}','${ids.department}','fuel',100);
    insert into procurement_legacy_reconciliations values('fuelings','${ids.source}','${ids.tenant}','${ids.contract}','${ids.instrument}','${ids.allocation}',80);
  `);
  await db.exec(await readFile(migrationUrl, 'utf8'));
  await assert.rejects(
    db.exec(`insert into procurement_fuel_reservations values(gen_random_uuid(),'${ids.tenant}','${ids.allocation}',21)`),
    /ultrapassa o consumo financeiro total/,
  );
  await assert.rejects(
    db.exec(`update instrument_budget_allocations set spending_limit=79 where id='${ids.allocation}'`),
    /consumo financeiro total/,
  );
  await assert.rejects(db.exec(`update instrument_budget_allocations set category='parts' where id='${ids.allocation}'`), /não pode trocar sua identificação/);
  await db.close();
});

test('conciliação exige despesa final e item do mesmo fornecedor e categoria', async () => {
  const db = await fixture();
  await db.exec(await readFile(migrationUrl, 'utf8'));
  await db.exec(`
    insert into tenants values('${ids.tenant}');
    insert into instrument_budget_allocations values('${ids.allocation}','${ids.department}','fuel',100);
    insert into budget_entries values('fuelings','${ids.source}','${ids.contract}','${ids.department}','${ids.partner}',10,0,0);
    insert into procurement_items values('${ids.item}','${ids.instrument}','${ids.partner}','posto','fuel');
  `);
  const insertReconciliation = `insert into procurement_legacy_reconciliations values('fuelings','${ids.source}','${ids.tenant}','${ids.contract}','${ids.instrument}','${ids.allocation}',40)`;
  await assert.rejects(db.exec(insertReconciliation), /somente despesa legada final/);
  await db.exec(`update budget_entries set reserved=0,realized=40 where source_type='fuelings' and source_id='${ids.source}'`);
  await db.exec(`update procurement_items set partner_id=gen_random_uuid()`);
  await assert.rejects(db.exec(insertReconciliation), /fornecedor e categoria/);
  await db.exec(`update procurement_items set partner_id='${ids.partner}'`);
  await db.exec(insertReconciliation);
  await assert.rejects(db.exec(`update budget_entries set realized=41 where source_type='fuelings' and source_id='${ids.source}'`), /imutável/);
  await db.close();
});

test('OS legada com mais de uma categoria falha fechada', async () => {
  const db = await fixture();
  await db.exec(await readFile(migrationUrl, 'utf8'));
  const quote = '00000000-0000-0000-0000-000000000009';
  await db.exec(`
    insert into tenants values('${ids.tenant}');
    insert into instrument_budget_allocations values('${ids.allocation}','${ids.department}','parts',100);
    insert into budget_entries values('service_orders','${ids.source}','${ids.contract}','${ids.department}','${ids.partner}',0,40,0);
    insert into service_order_quotes values('${quote}','${ids.source}','${ids.partner}','aprovado');
    insert into service_order_quote_items values(gen_random_uuid(),'${quote}','parts'),(gen_random_uuid(),'${quote}','labor');
    insert into procurement_items values('${ids.item}','${ids.instrument}','${ids.partner}','oficina','parts');
  `);
  await assert.rejects(
    db.exec(`insert into procurement_legacy_reconciliations values('service_orders','${ids.source}','${ids.tenant}','${ids.contract}','${ids.instrument}','${ids.allocation}',40)`),
    /sem categoria única comprovável/,
  );
  await db.close();
});
