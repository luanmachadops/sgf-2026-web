// Local PostgreSQL only. Never accepts a remote database URL.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { setup, save, fueling, admin, id } from '../tests/department-budget-fixture.mjs';

const runtime = process.env.SGF_PG_RUNTIME_DIR;
if (!runtime) throw new Error('Configure SGF_PG_RUNTIME_DIR com a instalação temporária de embedded-postgres.');
const { default: EmbeddedPostgres } = await import(pathToFileURL(resolve(runtime, 'node_modules/embedded-postgres/dist/index.js')).href);
const directory = await mkdtemp(join(tmpdir(), 'sgf-concurrency-'));
const postgres = new EmbeddedPostgres({ databaseDir: join(directory, 'data'), port: 54879,
  user: 'postgres', password: randomBytes(24).toString('hex'), authMethod: 'scram-sha-256',
  persistent: true, postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', `unix_socket_directories=${directory}`],
  onLog: () => {}, onError: () => {} });
let first, second, observer, started = false;
try {
  await postgres.initialise();
  await postgres.start(); started = true;
  first = postgres.getPgClient(); second = postgres.getPgClient(); observer = postgres.getPgClient();
  await Promise.all([first.connect(), second.connect(), observer.connect()]);
  const adapter = client => ({ exec: sql => client.query(sql), query: (sql, values) => client.query(sql, values) });
  await setup(true, adapter(first));
  await save(adapter(first));
  await second.query("select set_config('app.uid',$1,false),set_config('request.jwt.claims',$2,false)",
    [admin, JSON.stringify({role:'authenticated', sub:admin, session_id:id(99)})]);
  const firstPid = (await first.query('select pg_backend_pid() pid')).rows[0].pid;
  const secondPid = (await second.query('select pg_backend_pid() pid')).rows[0].pid;
  await first.query('begin');
  await fueling(adapter(first), 700, 80); // R$ 400 reserved out of R$ 600.
  const competing = fueling(adapter(second), 701, 60).then(() => ({ok:true}), error => ({ok:false,error}));
  let blocked = false;
  for (let attempt=0; attempt<100; attempt++) {
    const locks = (await observer.query('select pg_blocking_pids($1) ids',[secondPid])).rows[0].ids;
    if (locks.includes(firstPid)) { blocked = true; break; }
    await delay(20);
  }
  assert.equal(blocked, true, 'Segunda conexão deve aguardar a transação que reservou o saldo');
  await first.query('commit');
  const result = await competing;
  assert.equal(result.ok, false, 'Duas reservas não podem ultrapassar a cota');
  assert.match(result.error.message, /Saldo insuficiente da secretaria/);
  const balance = (await first.query('select sum(reserved) reserved,count(*) entries from public.budget_entries')).rows[0];
  assert.equal(Number(balance.reserved), 400);
  assert.equal(Number(balance.entries), 1);
  assert.equal(Number((await first.query('select count(*) count from public.fuelings')).rows[0].count), 1);
  console.log('APROVADO: PostgreSQL 17, duas conexões reais, espera de lock comprovada, segunda reserva recusada e sem gravação parcial.');
} finally {
  if (first) await first.query('rollback').catch(() => {});
  await Promise.allSettled([first?.end(), second?.end(), observer?.end()]);
  if (started) await postgres.stop();
  await rm(directory,{recursive:true,force:true});
}
