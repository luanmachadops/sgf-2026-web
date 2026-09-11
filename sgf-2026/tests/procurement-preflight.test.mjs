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
 for(const migration of ['20260910152227_procurement_registry.sql','20260910211314_procurement_items_prices.sql','20260911021152_instrument_budget_planning.sql','20260911022956_procurement_preflight.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'));
 await db.exec(`select set_config('app.uid','',false); alter table public.fuel_stations add column name text default 'Posto'; alter table public.repair_shops add column name text default 'Oficina'; update public.profiles set allowed_modules=array['procurement','budgets']; insert into auth.sessions(id,user_id,created_at) select id,id,clock_timestamp()+interval '1 second' from public.profiles;`);await login();
});
after(async()=>db?.close());
async function isolated(fn){await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}}
async function rejected(fn,pattern=/.+/){await db.exec('savepoint invalid');await assert.rejects(fn,pattern);await db.exec('rollback to savepoint invalid');}
let sequence=0;
async function instruments(){
 const process=await record('process',{reference:`P${++sequence}`,year:2026,object:'Frota municipal',modality:'Pregão',legal_basis:'Lei 14.133',documents:[],reason:'Teste'});
 const base={process_id:process,reference:`01-${sequence}`,year:2026,kind:'ata',starts_on:'2026-01-01',ends_on:'2027-12-31',declared_value:2000,partners:[`posto:${station}`],documents:[],reason:'Teste'};
 const ata=await record('instrument',base);
 const contract=await record('instrument',{...base,kind:'contract',origin_ata_id:ata});
 const contract2=await record('instrument',{...base,reference:`02-${sequence}`,kind:'contract',origin_ata_id:ata});
 return {process,ata,contract,contract2,base};
}

const preview=async(p)=>(await db.query('select public.preview_procurement_operation($1::jsonb) data',[JSON.stringify(p)])).rows[0].data;
async function scenario(){
 const {base}=await instruments();
 const contract=await record('instrument',{...base,kind:'contract',reference:`Independente-${sequence}`});
 await save(payload(contract));
 const allocation=(await list(2026,contract)).items[0].allocations.find(a=>a.department_id===department);
 const item=(await db.query('select public.save_procurement_item($1::jsonb) id',[JSON.stringify({instrument_id:contract,reference:'Diesel',description:'Diesel para frota',category:'fuel',unit:'L',quantity:100,partner_kind:'posto',partner_id:station,origin_item_id:null,reason:'Teste'})])).rows[0].id;
 const setPrice=async(extra={})=>db.query('select public.save_procurement_price($1::jsonb)',[JSON.stringify({item_id:item,version:1,effective_on:'2026-01-01',pricing_mode:'unit',unit_price:5.123456,discount_percent:null,table_reference:null,document_reference:'Tabela teste',reason:'Teste preço',...extra})]);
 return {contract,item,allocation,setPrice,input:{item_id:item,allocation_id:allocation.id,operation_date:'2026-06-01',quantity:100}};
}
test('pré-validação usa preço por data e arredonda somente total; nenhuma reserva ou despesa é criada',()=>isolated(async()=>{
 const s=await scenario();await s.setPrice();
 const result=await preview(s.input);assert.equal(result.planning_compatible,true);assert.equal(result.estimated_total,512.35);assert.equal(result.reserved,false);assert.equal(result.operational_balance_checked,false);assert.equal(result.price_revision,2);
 await s.setPrice({version:2,effective_on:'2026-07-01',unit_price:7});
 assert.equal((await preview(s.input)).estimated_total,512.35);
 assert.equal((await preview({...s.input,operation_date:'2026-08-01'})).planning_compatible,false);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.budget_entries')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from public.fuelings')).rows[0].n,0);
}));
test('pré-validação recusa estouro de quantidade, teto, exercício, vigência e categoria',()=>isolated(async()=>{
 const s=await scenario();await s.setPrice({unit_price:7});
 const result=await preview({...s.input,quantity:101,operation_date:'2028-01-01'});assert.equal(result.issues.length,4);assert.equal(result.planning_compatible,false);
 await db.exec('reset role');await db.query("update public.instrument_budget_allocations set category='arla' where id=$1",[s.allocation.id]);await login();
 assert.ok((await preview({...s.input,quantity:1})).issues.some(i=>i.includes('Categoria')));
}));
test('desconto exige base identificada; revisão da mesma data usa condição mais recente',()=>isolated(async()=>{
 const s=await scenario();await s.setPrice({pricing_mode:'discount',unit_price:null,discount_percent:12.5,table_reference:'Tabela A'});
 assert.equal((await preview(s.input)).estimated_total,null);
 assert.equal((await preview({...s.input,base_price:5,table_reference:'Outra'})).planning_compatible,false);
 const valid=await preview({...s.input,base_price:5.123456,table_reference:'Tabela A',quantity:99.999});assert.equal(valid.estimated_total,448.3);assert.equal(valid.planning_compatible,true);
 await s.setPrice({version:2,unit_price:4});assert.equal((await preview(s.input)).estimated_total,400);
 await rejected(()=>preview({...s.input,base_price:5}),/Preço fixo/);
}));
test('item sem preço, ata e entradas inválidas não produzem resultado compatível',()=>isolated(async()=>{
 const s=await scenario();assert.equal((await preview(s.input)).planning_compatible,false);
 for(const quantity of [0,-1,0.0001,'NaN','Infinity',null])await rejected(()=>preview({...s.input,quantity}),/Quantidade/);
 await rejected(()=>preview({...s.input,operation_date:'infinity'}),/Data/);
 await rejected(()=>preview({...s.input,total:1}),/Campo/);
 await db.exec('reset role');await db.query("update public.procurement_instruments set kind='ata' where id=$1",[s.contract]);await login();
 assert.ok((await preview(s.input)).issues.some(i=>i.includes('Selecione um contrato')));
}));
test('pré-validação impede dados de outra prefeitura, dotação de outro instrumento e acesso sem módulos/sessão',()=>isolated(async()=>{
 const s=await scenario();const other=await scenario();await rejected(()=>preview({...s.input,allocation_id:other.allocation.id}),/não pertence/);
 await login(outsider);await rejected(()=>preview(s.input),/não encontrado/);await login(secretary);await rejected(()=>preview(s.input));
 await db.exec('reset role');await db.exec(`select set_config('app.uid','',false); update public.profiles set allowed_modules=array['procurement'] where id='${admin}'; update auth.sessions set created_at=clock_timestamp()+interval '1 second' where id='${admin}';`);await login();await rejected(()=>preview(s.input),/permissão/);
 await db.exec("select set_config('request.jwt.claims','{}',false)");await rejected(()=>preview(s.input),/revogada/);
}));
test('RPC de simulação não admite acesso anônimo e mantém implementação privada',()=>isolated(async()=>{
 const rows=(await db.query(`select n.nspname,p.prosecdef,p.proconfig,p.provolatile,has_function_privilege('anon',p.oid,'execute') anonymous from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('preview_procurement_operation','procurement_preflight')`)).rows;
 assert.equal(rows.length,2);for(const f of rows){assert.equal(f.anonymous,false);assert.equal(f.prosecdef,f.nspname==='sgf_private');assert.equal(f.provolatile,'s');assert.ok(f.proconfig.includes('search_path=""'));}
}));
