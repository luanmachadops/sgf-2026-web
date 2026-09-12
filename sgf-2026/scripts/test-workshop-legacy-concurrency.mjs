// Local PostgreSQL only. Never accepts a remote database URL.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  setupQuoteProcurement, login, id, admin, tenant, department, station, workshop, vehicle,
  quote, quoteItem, procurementItem, allocation, instrument,
} from '../tests/workshop-quote-procurement-fixture.mjs';

const runtime = process.env.SGF_PG_RUNTIME_DIR;
if (!runtime) throw new Error('Configure SGF_PG_RUNTIME_DIR com a instalação temporária de embedded-postgres.');
const { default: EmbeddedPostgres } = await import(pathToFileURL(resolve(runtime, 'node_modules/embedded-postgres/dist/index.js')).href);
const directory = await mkdtemp(join(tmpdir(), 'sgf-workshop-concurrency-'));
const postgres = new EmbeddedPostgres({
  databaseDir: join(directory, 'data'), port: 54880, user: 'postgres',
  password: randomBytes(24).toString('hex'), authMethod: 'scram-sha-256', persistent: true,
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', `unix_socket_directories=${directory}`],
  onLog: () => {}, onError: () => {},
});
let first, second, observer, started = false;
const secondOrder = id(811), secondQuote = id(812), secondQuoteItem = id(813);

function adapter(client) {
  return { exec: sql => client.query(sql), query: (sql, values) => client.query(sql, values) };
}

async function configure(client) {
  await client.query("select set_config('app.uid',$1,false),set_config('request.jwt.claims',$2,false)", [
    admin, JSON.stringify({ role: 'authenticated', sub: admin, session_id: id(99) }),
  ]);
  await client.query('set role authenticated');
}

try {
  await postgres.initialise();
  await postgres.start(); started = true;
  first = postgres.getPgClient(); second = postgres.getPgClient(); observer = postgres.getPgClient();
  await Promise.all([first.connect(), second.connect(), observer.connect()]);
  await setupQuoteProcurement(adapter(first));
  await first.query('reset role');
  await first.query('update public.service_order_quotes set total=400 where id=$1', [quote]);
  await first.query('update public.service_order_quote_items set qty=16 where id=$1', [quoteItem]);
  await first.query(`insert into public.service_orders(id,tenant_id,repair_shop_id,vehicle_id,operational_status,financial_status)
    values($1,$2,$3,$4,'awaiting_quote_approval','not_started')`, [secondOrder, tenant, workshop, vehicle]);
  await first.query(`insert into public.service_order_quotes(id,tenant_id,service_order_id,repair_shop_id,version,status,valid_until,total)
    values($1,$2,$3,$4,1,'enviado',current_date+7,400)`, [secondQuote, tenant, secondOrder, workshop]);
  await first.query(`insert into public.service_order_quote_items(id,quote_id,kind,description,qty,unit_price,unit,category)
    values($1,$2,'peca','Filtro de óleo concorrente',16,25,'UN','parts')`, [secondQuoteItem, secondQuote]);
  await login(adapter(first));
  for (const [quoteId, itemId] of [[quote, quoteItem], [secondQuote, secondQuoteItem]]) {
    await first.query('select public.set_quote_procurement_links($1,$2::jsonb,$3)', [quoteId, JSON.stringify([{
      quote_item_id: itemId, procurement_item_id: procurementItem, allocation_id: allocation,
    }]), 'Vínculo concorrente conferido']);
  }
  await configure(first); await configure(second);
  const firstPid = (await first.query('select pg_backend_pid() pid')).rows[0].pid;
  const secondPid = (await second.query('select pg_backend_pid() pid')).rows[0].pid;
  await first.query('begin');
  await first.query('select public.manager_review_service_order_quote($1,true,$2)', [quote, 'Aprovação concorrente um']);
  const competing = second.query('select public.manager_review_service_order_quote($1,true,$2)', [secondQuote, 'Aprovação concorrente dois'])
    .then(() => ({ ok: true }), error => ({ ok: false, error }));
  let blocked = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ids = (await observer.query('select pg_blocking_pids($1) ids', [secondPid])).rows[0].ids;
    if (ids.includes(firstPid)) { blocked = true; break; }
    await delay(20);
  }
  assert.equal(blocked, true, 'A segunda aprovação deve aguardar o lock compartilhado do teto');
  await first.query('commit');
  const result = await competing;
  assert.equal(result.ok, false, 'Duas aprovações de oficina não podem ultrapassar a dotação compartilhada');
  assert.match(result.error.message, /Teto da dotação insuficiente/);
  await first.query('reset role');
  const totals = (await first.query(`select count(*)::int entries, coalesce(sum(committed_amount),0) amount
    from public.service_order_quote_procurement_reservations where allocation_id=$1`, [allocation])).rows[0];
  assert.equal(totals.entries, 1);
  assert.equal(Number(totals.amount), 400);
  const legacyContract = id(814), legacySource = id(815), legacyQuote = id(816);
  const year = new Date().getUTCFullYear();
  await first.query(`insert into public.budget_contracts(id,tenant_id,category,reference,fiscal_year,starts_on,ends_on,total_limit)
    values($1,$2,'maintenance','Legado concorrente',$3,$4,$5,1000)`, [legacyContract, tenant, year, `${year}-01-01`, `${year}-12-31`]);
  await first.query(`insert into public.budget_allocations(contract_id,department_id,spending_limit,appropriation,funding_source)
    values($1,$2,1000,'3.3.90.30','1500')`, [legacyContract, department]);
  await first.query(`insert into public.service_orders(id,tenant_id,repair_shop_id,vehicle_id,operational_status,financial_status)
    values($1,$2,$3,$4,'received','committed')`, [legacySource, tenant, workshop, vehicle]);
  await first.query(`insert into public.service_order_quotes(id,tenant_id,service_order_id,repair_shop_id,version,status,valid_until,total)
    values($1,$2,$3,$4,1,'aprovado',current_date+7,300)`, [legacyQuote, tenant, legacySource, workshop]);
  await first.query(`insert into public.service_order_quote_items(id,quote_id,kind,description,qty,unit_price,unit,category)
    values($1,$2,'peca','Peça legada',12,25,'UN','parts')`, [id(817), legacyQuote]);
  await first.query(`insert into public.budget_entries(source_type,source_id,contract_id,department_id,partner_id,reserved,realized,disputed,source_status)
    values('service_orders',$1,$2,$3,$4,0,300,0,'received')`, [legacySource, legacyContract, department, workshop]);
  const legacy = await second.query('select public.reconcile_procurement_legacy_entry($1,$2,$3,$4,$5,$6::jsonb)', [
    'service_orders', legacySource, instrument, allocation, 'Conferência documental concorrente',
    JSON.stringify([{ label: 'Nota fiscal', url: 'https://documentos.example.gov.br/legado-concorrente.pdf' }]),
  ]).then(() => ({ ok: true }), error => ({ ok: false, error }));
  assert.equal(legacy.ok, false, 'O legado conciliado não pode ultrapassar o teto já reservado pela oficina');
  assert.match(legacy.error.message, /conciliação ultrapassa o saldo financeiro total|conciliação ultrapassa o saldo da dotação/);
  assert.equal((await first.query('select count(*)::int entries from public.procurement_legacy_reconciliations where allocation_id=$1', [allocation])).rows[0].entries, 0);
  console.log('APROVADO: PostgreSQL 17, duas conexões reais, lock compartilhado do teto de oficina comprovado, segunda aprovação recusada sem reserva parcial e legado conciliado bloqueado pelo mesmo teto.');
} finally {
  if (first) await first.query('rollback').catch(() => {});
  await Promise.allSettled([first?.end(), second?.end(), observer?.end()]);
  if (started) await postgres.stop();
  await rm(directory, { recursive: true, force: true });
}
