import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setup, id, admin, outsider, secretary, station, department, otherDepartment } from './department-budget-fixture.mjs';
let db;
const record = async (kind, p) => (await db.query('select public.save_procurement_registry($1,$2::jsonb) id', [kind,JSON.stringify(p)])).rows[0].id;
const line=(extra={})=>({department_id:department,category:'fuel',spending_limit:600,appropriation:'03.01.3.3.90.30',funding_source:'001500',simam_code:'0'.repeat(28),...extra});
const payload=(instrument,extra={})=>({instrument_id:instrument,fiscal_year:2026,total_limit:1000,document_reference:'Ato de distribuição 01',reason:'Planejamento inicial',allocations:[line(),line({department_id:otherDepartment,spending_limit:400})],...extra});
const save=async p=>(await db.query('select public.save_instrument_budget($1::jsonb) id',[JSON.stringify(p)])).rows[0].id;
const list=async (year=2026,instrument=null,offset=0)=>(await db.query('select public.get_instrument_budgets($1,$2,$3) data',[year,instrument,offset])).rows[0].data;
const events=async plan=>(await db.query('select public.get_instrument_budget_events($1) data',[plan])).rows[0].data;
const login=async(user=admin)=>{await db.query("select set_config('app.uid',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({role:'authenticated',sub:user,session_id:user})]);await db.exec('set role authenticated');};
before(async()=>{
 db=await setup(true);
 for(const migration of ['20260910152227_procurement_registry.sql','20260910211314_procurement_items_prices.sql','20260911021152_instrument_budget_planning.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'));
 await db.exec(`select set_config('app.uid','',false); alter table public.fuel_stations add column name text default 'Posto'; alter table public.repair_shops add column name text default 'Oficina'; update public.profiles set allowed_modules=array['procurement','budgets']; insert into auth.sessions(id,user_id,created_at) select id,id,clock_timestamp()+interval '1 second' from public.profiles;`);await login();
});
after(async()=>db?.close());
async function isolated(fn){await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}}
async function rejected(fn,pattern=/.+/){await db.exec('savepoint invalid');await assert.rejects(fn,pattern);await db.exec('rollback to savepoint invalid');}
async function instruments(){
 const process=await record('process',{reference:'P01',year:2026,object:'Frota municipal',modality:'Pregão',legal_basis:'Lei 14.133',documents:[],reason:'Teste'});
 const base={process_id:process,reference:'01',year:2026,kind:'ata',starts_on:'2026-01-01',ends_on:'2027-12-31',declared_value:2000,partners:[`posto:${station}`],documents:[],reason:'Teste'};
 const ata=await record('instrument',base);
 const contract=await record('instrument',{...base,kind:'contract',origin_ata_id:ata});
 const contract2=await record('instrument',{...base,reference:'02',kind:'contract',origin_ata_id:ata});
 return {process,ata,contract,contract2,base};
}
test('planejamento aceita múltiplas fontes por secretaria, preserva códigos e histórico de remanejamento',()=>isolated(async()=>{
 const {ata}=await instruments();const initial=payload(ata,{allocations:[line({spending_limit:300}),line({spending_limit:300,funding_source:'001501'}),line({department_id:otherDepartment,spending_limit:400})]});
 const plan=await save(initial);const rows=(await list()).items[0];assert.equal(rows.allocations.length,3);assert.equal(rows.allocations[0].funding_source.startsWith('00'),true);
 const revised=rows.allocations.map(({id,department_id,category,spending_limit,appropriation,funding_source,simam_code})=>({id,department_id,category,spending_limit,appropriation,funding_source,simam_code}));revised[0].spending_limit-=100;revised[1].spending_limit+=100;
 await save({...initial,id:plan,version:1,allocations:revised,reason:'Remanejamento conforme ato 02'});
 const history=await events(plan);assert.equal(history.total,2);assert.equal(history.items[0].before_value.allocations.length,3);assert.equal(history.items[0].after_value.version,2);
 assert.deepEqual(new Set((await list()).items[0].allocations.map(l=>l.id)),new Set(rows.allocations.map(l=>l.id)));
 await rejected(()=>save({...initial,id:plan,version:1}),/recarregue/);
}));
test('soma dos exercícios, teto anual e valor do instrumento não podem ser ultrapassados',()=>isolated(async()=>{
 const {ata,base}=await instruments();await save(payload(ata));await save(payload(ata,{fiscal_year:2027}));
 await rejected(()=>save(payload(ata,{fiscal_year:2028})),/Exercício/);
 const plan=(await list(2027)).items[0];await rejected(()=>save(payload(ata,{id:plan.id,version:1,fiscal_year:2027,total_limit:1001})),/soma dos exercícios/);
 await rejected(()=>record('instrument',{...base,id:ata,version:1,declared_value:1999}),/inferior/);
 await rejected(()=>record('instrument',{...base,id:ata,version:1,ends_on:'2026-12-31'}),/exercício/);
}));
test('contratos derivados usam parcelas da ata por exercício, secretaria e categoria',()=>isolated(async()=>{
 const {ata,contract,contract2}=await instruments();await rejected(()=>save(payload(contract)),/Defina primeiro/);
 const parent=await save(payload(ata));await save(payload(contract,{total_limit:500,allocations:[line({spending_limit:500})]}));
 await rejected(()=>save(payload(contract2,{total_limit:501,allocations:[line({department_id:otherDepartment,spending_limit:1})]})),/Tetos dos contratos/);
 await rejected(()=>save(payload(contract2,{total_limit:500,allocations:[line({spending_limit:101})]})),/secretaria e categoria/);
 await rejected(()=>save(payload(contract2,{total_limit:500,allocations:[line({category:'arla',spending_limit:1})]})),/secretaria e categoria/);
 await save(payload(contract2,{total_limit:500,allocations:[line({spending_limit:100}),line({department_id:otherDepartment,spending_limit:400})]}));
 await rejected(()=>save(payload(ata,{id:parent,version:1,allocations:[line({spending_limit:599}),line({department_id:otherDepartment,spending_limit:401})]})),/secretaria e categoria/);
 assert.equal((await events(parent)).total,1);
}));
test('secretário vê somente sua secretaria e não recebe teto global nem histórico',()=>isolated(async()=>{
 const {ata}=await instruments();const plan=await save(payload(ata));await login(secretary);
 const result=await list();assert.equal(result.items.length,1);assert.equal(result.items[0].allocations.length,1);assert.equal(result.items[0].allocations[0].department_id,department);assert.equal(result.items[0].total_limit,null);assert.equal(result.items[0].declared_value,null);assert.equal(result.departments.length,1);
 await rejected(()=>save(payload(ata)),/administrador/);await rejected(()=>events(plan),/restrito/);
}));
test('prefeitura distinta, sessão e módulos são exigidos inclusive no histórico geral',()=>isolated(async()=>{
 const {ata,process}=await instruments();const plan=await save(payload(ata));await login(outsider);assert.equal((await list()).total,0);assert.equal((await events(plan)).total,0);await rejected(()=>save(payload(ata)),/não encontrado/);
 await db.exec('reset role');await db.exec(`select set_config('app.uid','',false); update public.profiles set allowed_modules=array['procurement'] where id='${admin}'; update auth.sessions set created_at=clock_timestamp()+interval '1 second' where id='${admin}';`);await login();
 await rejected(()=>list(),/permissão/);await rejected(()=>save(payload(ata)),/permissão/);
 const history=(await db.query('select public.get_procurement_registry_events($1) data',[process])).rows[0].data;assert.equal(history.items.some(e=>e.kind==='budget'),false);assert.equal(history.total,4);
 await db.exec("select set_config('request.jwt.claims','{}',false)");await rejected(()=>list(),/revogada/);
}));
test('validações e escrita atômica; totais inválidos e códigos incoerentes não criam plano parcial',()=>isolated(async()=>{
 const {ata}=await instruments();
 for(const extra of [{total_limit:999},{total_limit:-1},{total_limit:1000.001},{total_limit:'NaN'},{allocations:[]},{allocations:[line({department_id:id(21)})]},{allocations:[line({simam_code:'123'})]},{allocations:[line({funding_source:123})]},{allocations:[line({spending_limit:0.001})]},{allocations:[line(),line()]},{reason:''},{document_reference:''},{status:'active'}])await rejected(()=>save(payload(ata,extra)));
 assert.equal((await list()).total,0);await save(payload(ata));await rejected(()=>save(payload(ata)),/unique/);
 for(const table of ['instrument_budget_plans','instrument_budget_allocations']){await rejected(()=>db.query(`select * from ${table}`),/permission denied/);await rejected(()=>db.query(`delete from ${table}`),/permission denied/);assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass',[table])).rows[0].relrowsecurity,true);}
 const funcs=(await db.query(`select n.nspname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') anonymous from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('get_instrument_budgets','save_instrument_budget','get_instrument_budget_events','instrument_budget_read','instrument_budget_save','instrument_budget_events')`)).rows;
 assert.equal(funcs.length,6);for(const f of funcs){assert.equal(f.anonymous,false);assert.equal(f.prosecdef,f.nspname==='sgf_private');assert.ok(f.proconfig.includes('search_path=""'));}
}));
test('paginação e isolamento de dotações; planejamento não cria reservas ou despesas operacionais',()=>isolated(async()=>{
 const {ata,base}=await instruments();const first=await save(payload(ata));
 for(let n=0;n<11;n++){const contract=await record('instrument',{...base,reference:`Independente ${n}`,kind:'contract'});await save(payload(contract));}
 assert.equal((await list()).items.length,10);assert.equal((await list(2026,null,10)).items.length,2);
 const own=(await list(2026,ata)).items[0];const foreign=(await list()).items.find(p=>p.id!==first);
 await rejected(()=>save(payload(ata,{id:first,version:1,allocations:[line({id:foreign.allocations[0].id})]})),/não pertence/);
 await db.exec('reset role');
 assert.equal((await db.query('select count(*)::int count from public.budget_contracts')).rows[0].count,0);
 assert.equal((await db.query('select count(*)::int count from public.budget_entries')).rows[0].count,0);
 assert.equal(own.total_limit,1000);
}));
