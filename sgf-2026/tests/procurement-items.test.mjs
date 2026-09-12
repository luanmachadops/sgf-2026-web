import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setup, id, admin, outsider, secretary, station, workshop } from './department-budget-fixture.mjs';
let db;
const record = async (kind, p) => (await db.query('select public.save_procurement_registry($1,$2::jsonb) id', [kind, JSON.stringify(p)])).rows[0].id;
const itemPayload = (instrument, extra = {}) => ({ instrument_id: instrument, reference: '01', lot_reference: 'Combustíveis', description: 'Diesel S10', category: 'fuel', unit: 'L', quantity: 1000, partner_kind: 'posto', partner_id: station, origin_item_id: null, reason: 'Adjudicação conferida', ...extra });
const saveItem = async p => (await db.query('select public.save_procurement_item($1::jsonb) id', [JSON.stringify(p)])).rows[0].id;
const pricePayload = (item, extra = {}) => ({ item_id: item, version: 1, effective_on: '2026-01-01', pricing_mode: 'unit', unit_price: 5.123456, discount_percent: null, table_reference: null, document_reference: 'Ata 01', reason: 'Condição contratada', ...extra });
const savePrice = async p => (await db.query('select public.save_procurement_price($1::jsonb) id', [JSON.stringify(p)])).rows[0].id;
const list = async (instrument, date = '2026-06-01', offset = 0, search = '') => (await db.query('select public.get_procurement_items($1,$2,$3,$4::date) data', [instrument, offset, search, date])).rows[0].data;
const prices = async (item, offset = 0) => (await db.query('select public.get_procurement_prices($1,$2) data', [item, offset])).rows[0].data;
const login = async (user = admin) => {
  await db.query("select set_config('app.uid',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ role: 'authenticated', sub: user, session_id: user })]);
  await db.exec('set role authenticated');
};
before(async () => {
  db = await setup(true);
  for (const name of ['20260910152227_procurement_registry.sql', '20260910211314_procurement_items_prices.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  await db.exec(`select set_config('app.uid','',false); alter table public.fuel_stations add column name text default 'Posto'; alter table public.repair_shops add column name text default 'Oficina'; update public.profiles set allowed_modules=array['procurement']; insert into auth.sessions(id,user_id,created_at) select id,id,clock_timestamp()+interval '1 second' from public.profiles;`);
  await login();
});
after(async () => db?.close());
async function isolated(fn) { await db.exec('begin'); try { await fn(); } finally { await db.exec('rollback'); } }
async function rejected(fn, pattern = /.+/) { await db.exec('savepoint invalid'); await assert.rejects(fn, pattern); await db.exec('rollback to savepoint invalid'); }
async function instruments() {
  const process = await record('process', { reference: 'P01', year: 2026, object: 'Combustível e manutenção', modality: 'Pregão', legal_basis: 'Lei 14.133', documents: [], reason: 'Cadastro fictício' });
  const payload = { process_id: process, reference: 'A01', year: 2026, kind: 'ata', starts_on: '2026-01-01', ends_on: '2026-12-31', declared_value: 10000, partners: [`posto:${station}`, `oficina:${workshop}`], documents: [], reason: 'Instrumento conferido' };
  const ata = await record('instrument', payload);
  const contract = await record('instrument', { ...payload, reference: 'C01', kind: 'contract', origin_ata_id: ata });
  const contract2 = await record('instrument', { ...payload, reference: 'C02', kind: 'contract', origin_ata_id: ata });
  return { process, ata, contract, contract2, payload };
}
test('itens por lote, categorias e precisão de preço; condição futura e fora da vigência', () => isolated(async () => {
  const { ata } = await instruments(); const item = await saveItem(itemPayload(ata));
  await savePrice(pricePayload(item)); await savePrice(pricePayload(item, { version: 2, effective_on: '2026-09-01', unit_price: 6 }));
  assert.equal((await list(ata)).items[0].price.unit_price, 5.123456);
  assert.equal((await list(ata, '2026-09-01')).items[0].price.unit_price, 6);
  assert.equal((await list(ata, '2027-01-01')).items[0].price, null);
  for (const category of ['arla', 'lubricant', 'parts', 'labor', 'tires', 'tire_service', 'other']) await saveItem(itemPayload(ata, { category, reference: category, lot_reference: 'Serviços' }));
  assert.equal((await list(ata, '2026-06-01', 0, 'Serviços')).total, 7);
}));
test('desconto exige tabela identificada; revisões na mesma data preservam histórico', () => isolated(async () => {
  const { ata } = await instruments(); const item = await saveItem(itemPayload(ata));
  await savePrice(pricePayload(item));
  await savePrice(pricePayload(item, { version: 2, pricing_mode: 'discount', unit_price: null, discount_percent: 12.3456, table_reference: 'Tabela fabricante versão 2026-01' }));
  const history = await prices(item); assert.equal(history.total, 2); assert.equal(history.items[1].unit_price, 5.123456);
  const current = (await list(ata)).items[0]; assert.equal(current.price.pricing_mode, 'discount'); assert.equal(current.price.unit_price, null); assert.equal(current.price.discount_percent, 12.3456);
  await rejected(() => savePrice(pricePayload(item, { version: 2 })), /recarregue/);
  for (const extra of [{ pricing_mode: 'discount', unit_price: null, discount_percent: 10 }, { discount_percent: 10 }, { unit_price: -1 }, { unit_price: 'NaN' }, { pricing_mode: 'discount', unit_price: null, discount_percent: 101, table_reference: 'Tabela 2026' }, { effective_on: '2025-12-31' }, { effective_on: 'infinity' }, { reason: '' }, { tenant_id: id(20) }]) await rejected(() => savePrice(pricePayload(item, { version: 3, ...extra })));
  assert.equal((await prices(item)).total, 2);
}));
test('contratos derivam do item correto e não excedem a quantidade da ata', () => isolated(async () => {
  const { ata, contract, contract2 } = await instruments(); const source = await saveItem(itemPayload(ata));
  await saveItem(itemPayload(contract, { quantity: 600, origin_item_id: source })); await saveItem(itemPayload(contract2, { quantity: 400, origin_item_id: source }));
  await rejected(() => saveItem(itemPayload(contract2, { reference: '02', quantity: 0.001, origin_item_id: source })), /excede/);
  await rejected(() => saveItem(itemPayload(ata, { id: source, version: 1, quantity: 999 })), /inferior/);
  await rejected(() => saveItem(itemPayload(contract, { reference: '03', quantity: 1, origin_item_id: source, unit: 'UN' })), /incompatível/);
  await rejected(() => saveItem(itemPayload(contract, { reference: '03', quantity: 1 })), /incompatível/);
  await rejected(() => saveItem(itemPayload(ata, { reference: '03', origin_item_id: source })), /não possui/);
}));
test('edições não destroem histórico, vínculo do fornecedor e vigências', () => isolated(async () => {
  const { ata, contract, payload } = await instruments(); const item = await saveItem(itemPayload(ata)); await savePrice(pricePayload(item));
  await rejected(() => saveItem(itemPayload(ata, { id: item, version: 2, unit: 'UN' })), /histórico/);
  await rejected(() => record('instrument', { ...payload, id: ata, version: 1, starts_on: '2026-02-01' }), /Vigência/);
  await record('instrument', { ...payload, id: ata, version: 1 });
  await db.exec('set constraints all immediate; set constraints all deferred');
  await rejected(async () => { await record('instrument', { ...payload, id: ata, version: 2, partners: [`oficina:${workshop}`] }); await db.exec('set constraints all immediate'); }, /contrato derivado/);
  await saveItem(itemPayload(contract, { origin_item_id: item, quantity: 10 }));
  await rejected(async () => { await record('instrument', { ...payload, id: contract, reference: 'C01', kind: 'contract', origin_ata_id: ata, version: 1, partners: [`oficina:${workshop}`] }); await db.exec('set constraints all immediate'); }, /foreign key/);
  await rejected(() => record('instrument', { ...payload, id: contract, version: 1, reference: 'C01', kind: 'contract', origin_ata_id: null }), /Ata de origem/);
}));
test('isolamento de prefeitura, módulo, secretaria, sessão e acesso direto', () => isolated(async () => {
  const { ata } = await instruments(); const item = await saveItem(itemPayload(ata));
  await login(outsider); assert.equal((await list(ata)).total, 0); await rejected(() => prices(item), /não encontrado/); await rejected(() => saveItem(itemPayload(ata)), /não encontrado/); await rejected(() => savePrice(pricePayload(item)), /não encontrado/);
  await login(secretary); await rejected(() => list(ata), /permissão/); await login();
  for (const table of ['procurement_items', 'procurement_item_prices']) { await rejected(() => db.query(`select * from ${table}`), /permission denied/); await rejected(() => db.query(`delete from ${table}`), /permission denied/); assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass', [table])).rows[0].relrowsecurity, true); }
  await db.exec('reset role'); await db.exec(`select set_config('app.uid','',false); update public.profiles set allowed_modules=array['budgets'] where id='${admin}'; update auth.sessions set created_at=clock_timestamp()+interval '1 second' where id='${admin}';`); await login(); await rejected(() => list(ata), /permissão/);
  await db.exec("select set_config('request.jwt.claims','{}',false)"); await rejected(() => list(ata), /revogada/);
}));
test('entradas inválidas e referência repetida não geram gravação parcial', () => isolated(async () => {
  const { ata, process } = await instruments();
  for (const extra of [{ quantity: 0 }, { quantity: -1 }, { quantity: 'NaN' }, { partner_id: id(22) }, { category: 'unknown' }, { unit: '' }, { description: '' }, { reason: '' }, { status: 'active' }, { instrument_id: id(999) }]) await rejected(() => saveItem(itemPayload(ata, extra)));
  assert.equal((await list(ata)).total, 0); await saveItem(itemPayload(ata)); await rejected(() => saveItem(itemPayload(ata, { reference: ' 01 ' })), /unique/);
  const events = (await db.query('select public.get_procurement_registry_events($1) data', [process])).rows[0].data; assert.equal(events.total, 5); assert.equal(events.items[0].kind, 'item'); assert.equal(events.items[0].actor_name, 'Admin');
}));
test('paginação de itens e condições; privilégios das novas funções', () => isolated(async () => {
  const { ata } = await instruments(); const item = await saveItem(itemPayload(ata));
  for (let n = 1; n <= 21; n++) { await saveItem(itemPayload(ata, { reference: `X${n}` })); await savePrice(pricePayload(item, { version: n })); }
  assert.equal((await list(ata)).items.length, 20); assert.equal((await list(ata, '2026-06-01', 20)).items.length, 2); assert.equal((await prices(item, 20)).items.length, 1);
  const functions = (await db.query(`select p.proname,n.nspname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') anonymous from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('get_procurement_items','get_procurement_prices','save_procurement_item','save_procurement_price','procurement_items_read','procurement_prices_read','procurement_item_save','procurement_price_save')`)).rows;
  assert.equal(functions.length, 8); for (const f of functions) { assert.equal(f.anonymous, false); assert.equal(f.prosecdef, f.nspname === 'sgf_private'); assert.ok(f.proconfig.includes('search_path=""')); }
}));
