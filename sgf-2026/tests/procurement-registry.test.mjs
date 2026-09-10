import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setup, id, admin, tenant, secretary, outsider, station, workshop } from './department-budget-fixture.mjs';
let db;
const processPayload = (reference = 'Pregão 01') => ({ reference, year: 2026, object: 'Combustíveis e serviços', modality: 'Pregão eletrônico', legal_basis: 'Lei 14.133/2021', documents: [], reason: 'Cadastro conforme processo' });
const instrumentPayload = (process, reference = '001', extra = {}) => ({ process_id: process, kind: 'ata', reference, year: 2026, starts_on: '2026-01-01', ends_on: '2026-12-31', declared_value: 1000, partners: [`posto:${station}`, `oficina:${workshop}`], documents: [], reason: 'Instrumento conferido', ...extra });
const save = async (kind, payload) => (await db.query('select public.save_procurement_registry($1,$2::jsonb) id', [kind, JSON.stringify(payload)])).rows[0].id;
const read = async (kind = 'process', process = null, offset = 0) => (await db.query('select public.get_procurement_registry($1,$2,$3) data', [kind, process, offset])).rows[0].data;
const events = async (process, offset = 0) => (await db.query('select public.get_procurement_registry_events($1,$2) data', [process, offset])).rows[0].data;
const login = async (user = admin) => {
  await db.query("select set_config('app.uid',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ role: 'authenticated', sub: user, session_id: user })]);
  await db.exec('set role authenticated');
};
before(async () => {
  db = await setup(true);
  await db.exec(await readFile(new URL('../supabase/migrations/20260910152227_procurement_registry.sql', import.meta.url), 'utf8'));
  await db.exec(`select set_config('app.uid','',false);
    alter table public.fuel_stations add column name text default 'Posto teste';
    alter table public.repair_shops add column name text default 'Oficina teste';
    update public.profiles set allowed_modules=array['procurement','budgets'];
    insert into public.profiles(id,tenant_id,role,full_name,allowed_modules) values
    ('${id(40)}','${tenant}','gestor','Sem módulo',array['budgets']),
    ('${id(41)}','${tenant}','oficina','Parceiro',array['procurement']);
    insert into auth.sessions(id,user_id,created_at) select id,id,clock_timestamp()+interval '1 second' from public.profiles;
  `);
  await login();
});
after(async () => { await db?.close(); });

// Each scenario runs as the authenticated database role, not as the database owner.
async function isolated(fn) {
  await db.exec('begin');
  try { await fn(); } finally { await db.exec('rollback'); }
}
async function rejectsStatement(fn, pattern) {
  await db.exec('savepoint invalid_input');
  await assert.rejects(fn, pattern);
  await db.exec('rollback to savepoint invalid_input');
}
test('processo, ata com dois fornecedores e vários contratos do mesmo fornecedor; histórico e versão', () => isolated(async () => {
  const p = await save('process', processPayload());
  const a = await save('instrument', instrumentPayload(p));
  const c = await save('instrument', instrumentPayload(p, 'C01', { kind: 'contract', origin_ata_id: a, partners: [`posto:${station}`] }));
  await save('instrument', instrumentPayload(p, 'C02', { kind: 'contract', partners: [`posto:${station}`], declared_value: null }));
  assert.equal((await read()).total, 1);
  const instruments = await read('instrument', p);
  assert.equal(instruments.total, 3);
  assert.equal(instruments.items.find(r => r.id === a).partners.length, 2);
  assert.equal(instruments.items.find(r => r.id === c).origin_ata_id, a);
  await save('process', { ...processPayload(), id: p, version: 1, object: 'Objeto conferido' });
  assert.equal((await read()).items[0].version, 2);
  const history = await events(p);
  assert.equal(history.total, 5);
  assert.equal(history.items[0].before_value.object, 'Combustíveis e serviços');
  assert.equal(history.items[0].after_value.object, 'Objeto conferido');
  assert.equal(history.items[0].actor_id, admin);
  assert.equal(history.items[0].actor_name, 'Admin');
  await rejectsStatement(() => save('process', { ...processPayload(), id: p, version: 1 }), /recarregue/);
  await rejectsStatement(() => save('instrument', instrumentPayload(p, '001', { id: a, version: 1, partners: [`oficina:${workshop}`] })), /contrato derivado/);
  assert.equal((await events(p)).total, 5);
}));
test('validação e atomicidade: referências, datas, valores, documentos, campos e fornecedores', () => isolated(async () => {
  const p = await save('process', processPayload());
  await rejectsStatement(() => save('process', processPayload('  PREGÃO 01  ')), /unique/);
  for (const extra of [{ ends_on: '2025-12-31' }, { ends_on: 'infinity' }, { partners: [null] }, { partners: [`posto:${station}:extra`] }, { documents: [{ label: 3, url: 'https://example.com' }] }, { declared_value: -1 }, { declared_value: 'NaN' }, { partners: [] }, { partners: [`posto:${id(22)}`] }, { status: 'active' }, { tenant_id: id(20) }, { reason: ' ' }, { documents: [{ label: 'X', url: 'javascript:alert(1)' }] }, { documents: [{ label: 'X', url: 'http://example.com' }] }, { documents: [{ label: 'X', url: 'https://user:pass@example.com' }] }]) {
    await rejectsStatement(() => save('instrument', instrumentPayload(p, '001', extra)), /.+/);
  }
  assert.equal((await read('instrument', p)).total, 0);
  assert.equal((await events(p)).total, 1);
  await save('instrument', instrumentPayload(p, '001', { documents: [{ label: 'Documento', url: 'https://example.gov.br/ata.pdf' }] }));
}));
test('ata de outro processo e fornecedor fora da ata são recusados; tipo e processo imutáveis', () => isolated(async () => {
  const p = await save('process', processPayload());
  const p2 = await save('process', processPayload('Pregão 02'));
  const a = await save('instrument', instrumentPayload(p, '001', { partners: [`posto:${station}`] }));
  await rejectsStatement(() => save('instrument', instrumentPayload(p2, 'C01', { kind: 'contract', origin_ata_id: a })), /incompatível/);
  await rejectsStatement(() => save('instrument', instrumentPayload(p, 'C01', { kind: 'contract', origin_ata_id: a, partners: [`oficina:${workshop}`] })), /não pertence/);
  await rejectsStatement(() => save('instrument', instrumentPayload(p2, '001', { id: a, version: 1 })), /não podem/);
  await rejectsStatement(() => save('instrument', instrumentPayload(p, '001', { id: a, version: 1, kind: 'contract' })), /não podem/);
}));
test('isolamento de prefeitura para listagem, histórico, parceiros e alteração', () => isolated(async () => {
  const p = await save('process', processPayload());
  await login(outsider);
  assert.equal((await read()).total, 0);
  assert.equal((await events(p)).total, 0);
  await rejectsStatement(() => save('process', { ...processPayload(), id: p, version: 1 }), /não encontrado/);
  await rejectsStatement(() => save('instrument', instrumentPayload(p)), /não encontrado/);
  const partners = (await db.query('select public.get_procurement_registry_partners() data')).rows[0].data;
  assert.deepEqual(partners.map(p => p.id), [`posto:${id(22)}`]);
  await login();
}));
test('secretaria, parceiro e gestor sem módulo não acessam nenhuma RPC', () => isolated(async () => {
  for (const user of [secretary, id(40), id(41)]) {
    await login(user);
    for (const operation of [() => read(), () => save('process', processPayload()), () => events(id(55)), () => db.query('select public.get_procurement_registry_partners()')]) {
      await rejectsStatement(operation, /permissão/);
    }
  }
  await login();
}));
test('sessões revogadas, sem sessão e acesso bloqueado são recusados', () => isolated(async () => {
  await db.exec('reset role');
  await db.exec(`select set_config('app.uid','',false); update auth.sessions set created_at=clock_timestamp()-interval '1 minute' where id='${admin}'; update public.profiles set allowed_modules=array['procurement'] where id='${admin}'`);
  await login();
  await rejectsStatement(() => read(), /revogada/);
  await db.exec('reset role');
  await db.exec(`select set_config('app.uid','',false); update public.profiles set access_blocked=true where id='${admin}'; update auth.sessions set created_at=clock_timestamp()+interval '1 second' where id='${admin}'`);
  await login();
  await rejectsStatement(() => read(), /revogada/);
  await db.exec("select set_config('request.jwt.claims','{}',false)");
  await rejectsStatement(() => read(), /revogada/);
}));
test('tabelas e auditoria sem acesso direto; funções e RLS protegidas', () => isolated(async () => {
  for (const table of ['procurement_processes', 'procurement_instruments', 'procurement_instrument_partners', 'procurement_registry_events']) {
    await rejectsStatement(() => db.query(`select * from public.${table}`), /permission denied/);
    await rejectsStatement(() => db.query(`delete from public.${table}`), /permission denied/);
    const state = (await db.query('select relrowsecurity from pg_class where oid=$1::regclass', [`public.${table}`])).rows[0];
    assert.equal(state.relrowsecurity, true);
  }
  await rejectsStatement(() => db.query('select sgf_private.procurement_actor()'), /permission denied/);
  const functions = (await db.query(`select n.nspname,p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') anonymous from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname like '%procurement_registry%'`)).rows;
  for (const f of functions) {
    assert.equal(f.anonymous, false, f.proname);
    if (f.nspname === 'public') assert.equal(f.prosecdef, false, f.proname);
    if (f.prosecdef) assert.ok(f.proconfig.includes('search_path=""'), f.proname);
  }
  await db.exec('reset role');
  assert.deepEqual((await db.query("select sgf_private.resource_modules('save_procurement_registry',true) modules")).rows[0].modules, ['procurement']);
  assert.deepEqual((await db.query("select sgf_private.resource_modules('save_department_budget',true) modules")).rows[0].modules, ['budgets']);
}));
test('processos e histórico paginados em 20 registros', () => isolated(async () => {
  const p = await save('process', processPayload());
  for (let i = 2; i <= 22; i++) {
    await save('process', processPayload(`Pregão ${i}`));
    await save('process', { ...processPayload(), id: p, version: i - 1, reason: `Revisão documental ${i}` });
  }
  assert.equal((await read()).items.length, 20);
  assert.equal((await read('process', null, 20)).items.length, 2);
  assert.equal((await events(p)).items.length, 20);
  assert.equal((await events(p, 20)).items.length, 2);
}));
