import { setupWorkflow } from './procurement-workflow-fixture.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setup, id, admin, outsider, secretary, station, department, otherDepartment, vehicle, tenant } from './department-budget-fixture.mjs';
let db;
const record = async (kind, p) => (await db.query('select public.save_procurement_registry($1,$2::jsonb) id', [kind,JSON.stringify(p)])).rows[0].id;
const line=(extra={})=>({department_id:department,category:'arla',spending_limit:600,appropriation:'03.01.3.3.90.30',funding_source:'001500',simam_code:'0'.repeat(28),...extra});
const payload=(instrument,extra={})=>({instrument_id:instrument,fiscal_year:2026,total_limit:1000,document_reference:'Ato de distribuição 01',reason:'Planejamento inicial',allocations:[line(),line({department_id:otherDepartment,spending_limit:400})],...extra});
const save=async p=>(await db.query('select public.save_instrument_budget($1::jsonb) id',[JSON.stringify(p)])).rows[0].id;
const list=async (year=2026,instrument=null,offset=0)=>(await db.query('select public.get_instrument_budgets($1,$2,$3) data',[year,instrument,offset])).rows[0].data;
const login=async(user=admin)=>{await db.query("select set_config('app.uid',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({role:'authenticated',sub:user,session_id:user})]);await db.exec('set role authenticated');};
before(async()=>{
 db=await setup(true);
 for(const migration of ['20260910152227_procurement_registry.sql','20260910211314_procurement_items_prices.sql','20260911021152_instrument_budget_planning.sql','20260911022956_procurement_preflight.sql','20260911023848_procurement_fuel_reservations.sql','20260911105457_procurement_fuel_classification.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'));
 await db.exec(`select set_config('app.uid','',false); alter table public.fuel_stations add column name text default 'Posto'; alter table public.repair_shops add column name text default 'Oficina'; update public.profiles set allowed_modules=array['procurement','budgets','refuelings','stations']; insert into auth.sessions(id,user_id,created_at) select id,id,clock_timestamp()+interval '1 second' from public.profiles;`);await login();await setupWorkflow(db);await setupStationLedger();await login();
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

async function scenario(category='arla',unit='L'){
 const {base}=await instruments();
 const contract=await record('instrument',{...base,kind:'contract',reference:`Independente-${sequence}`});
 await save(payload(contract,{allocations:[line({category}),line({category,department_id:otherDepartment,spending_limit:400})]}));
 const allocation=(await list(2026,contract)).items[0].allocations.find(a=>a.department_id===department);
 const item=(await db.query('select public.save_procurement_item($1::jsonb) id',[JSON.stringify({instrument_id:contract,reference:'ARLA',description:'ARLA contratado',category,unit,quantity:100,partner_kind:'posto',partner_id:station,origin_item_id:null,reason:'Teste'})])).rows[0].id;
 const setPrice=async(extra={})=>db.query('select public.save_procurement_price($1::jsonb)',[JSON.stringify({item_id:item,version:1,effective_on:'2026-01-01',pricing_mode:'unit',unit_price:5.123456,discount_percent:null,table_reference:null,document_reference:'Tabela teste',reason:'Teste preço',...extra})]);
 return {contract,item,allocation,setPrice,kind:category==='arla'?'arla':category==='lubricant'?'lubrificante':'servico',unit:unit==='SERV'?'SERVICO':unit,input:{item_id:item,allocation_id:allocation.id,operation_date:'2026-06-01',quantity:100}};
}

async function setupStationLedger(){
 const source=await readFile(new URL('../supabase/migrations/20260730003626_station_catalog_and_operations.sql',import.meta.url),'utf8');
 await db.exec(source.slice(source.indexOf('create table public.station_catalog_items'),source.indexOf('create unique index station_catalog_items')));
 await db.exec(`alter table public.station_operations add column catalog_item_id uuid references public.station_catalog_items(id),add column driver_id uuid,add column protocol text unique,add column item_kind text,add column item_name text,add column unit text,add column quantity numeric(12,3),add column odometer integer,add column authorized_by uuid,add column executed_by uuid,add column receipt_number text,add column evidence_path text,add column created_at timestamptz default now();`);
 const start=source.indexOf('  constraint station_operation_execution_complete');
 await db.exec('alter table public.station_operations add '+source.slice(start,source.indexOf('\n);',start)).replace(',\n  constraint station_operation_quantity_limit',',\n add constraint station_operation_quantity_limit'));
 await db.exec(await readFile(new URL('../supabase/migrations/20260911164848_procurement_station_reservations.sql',import.meta.url),'utf8'));
}
let operationSequence=800;
async function ready(category='arla',unit='L'){const s=await scenario(category,unit);await s.setPrice({unit_price:5.123456});await db.exec('reset role');s.catalog=id(++operationSequence);await db.query('insert into public.station_catalog_items(id,tenant_id,station_id,kind,name,unit,unit_price) values($1,$2,$3,$4,$5,$6,99)',[s.catalog,tenant,station,s.kind,`Catálogo ${operationSequence}`,s.unit]);await login();return s;}
const row=s=>({vehicle_id:vehicle,station_id:station,catalog_item_id:s.catalog,quantity:60,expires_at:new Date(Date.now()+3600000).toISOString()});
async function reserve(s,p=row(s),operation=id(++operationSequence)){await db.exec('reset role');await db.query('select sgf_private.reserve_procurement_station_operation($1,$2,$3,$4::jsonb)',[operation,s.item,s.allocation.id,JSON.stringify(p)]);return {operation,p};}
async function insert(s,r){const saved=await balance(r);await db.query(`insert into public.station_operations(id,tenant_id,station_id,vehicle_id,department_id,catalog_item_id,item_kind,item_name,unit,status,authorized_quantity,unit_price,expires_at,authorized_by,protocol) values($1,$2,$3,$4,$5,$6,$11,'ARLA contratado',$12,'autorizado',$7,$13,$8,$9,$10)`,[r.operation,tenant,station,vehicle,department,s.catalog,r.p.quantity,r.p.expires_at,admin,`OP-${r.operation}`,s.kind,s.unit,saved.unit_price]);await db.exec('set constraints all immediate; set constraints all deferred');return r;}
const issue=async(s,p=row(s))=>insert(s,await reserve(s,p));
const balance=async r=>(await db.query('select * from public.procurement_station_reservations where operation_id=$1',[r.operation])).rows[0];
const complete=async(r,qty=40)=>db.query("update public.station_operations set status='concluido',quantity=$2,total_cost=round($2::numeric*unit_price,2),executed_at=now(),executed_by=$3,receipt_number='CUPOM-1',evidence_path='local/evidencia.jpg',odometer=150 where id=$1",[r.operation,qty,admin]);
test('reserva ARLA com preço contratual, execução parcial e repetição sem cobrança dupla',()=>isolated(async()=>{
 const s=await ready(),r=await issue(s);assert.equal(Number((await balance(r)).committed_amount),307.41);
 await reserve(s,r.p,r.operation);await rejected(()=>reserve(s,{...r.p,quantity:59},r.operation),/já usado/);
 await complete(r);await complete(r);assert.equal((await balance(r)).state,'realized');assert.equal(Number((await balance(r)).committed_amount),204.94);
 assert.equal((await db.query('select count(*)::int n from public.budget_entries')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from public.fuelings')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from public.procurement_registry_events where record_id=$1',[r.operation])).rows[0].n,2);
}));
test('cancelamento libera sem reabrir; rejeição após execução mantém despesa contestada',()=>isolated(async()=>{
 const s=await ready(),r=await issue(s);await db.query("update public.station_operations set status='cancelado' where id=$1",[r.operation]);await reserve(s,r.p,r.operation);assert.equal((await balance(r)).state,'released');assert.equal(Number((await balance(r)).committed_amount),0);
 await rejected(()=>db.query("update public.station_operations set status='autorizado' where id=$1",[r.operation]),/reaberta/);
 const next=await issue(s);await complete(next);await db.query("update public.station_operations set status='rejeitado' where id=$1",[next.operation]);assert.equal((await balance(next)).state,'disputed');assert.equal(Number((await balance(next)).committed_amount),204.94);
 await rejected(()=>db.query("update public.station_operations set status='cancelado' where id=$1",[next.operation]),/não pode liberar/);
 await rejected(()=>db.query("update public.station_operations set status='validado' where id=$1",[next.operation]),/conciliação/);
}));
test('saldo compartilhado, quantidade e FK diferida impedem excesso e gravação parcial',()=>isolated(async()=>{
 const s=await ready();await db.exec('reset role');await db.query('update public.instrument_budget_allocations set spending_limit=400 where id=$1',[s.allocation.id]);await issue(s);
 await rejected(()=>reserve(s,{...row(s),quantity:30}),/Saldo disponível/);await rejected(()=>reserve(s,{...row(s),quantity:50}),/Quantidade disponível/);
 await rejected(async()=>{await reserve(s,{...row(s),quantity:10});await db.exec('set constraints all immediate');},/foreign key/);
 assert.equal((await db.query('select count(*)::int n from public.procurement_station_reservations')).rows[0].n,1);
}));
test('catálogo exige categoria, unidade, fornecedor e atividade; legado não é migrado',()=>isolated(async()=>{
 const s=await ready();await db.exec('reset role');
 for(const change of ["kind='combustivel'","kind='arla',unit='UN'","unit='L',active=false"]){await db.query(`update public.station_catalog_items set ${change} where id=$1`,[s.catalog]);await rejected(()=>reserve(s),/Catálogo incompatível/);}
 await db.query('update public.station_catalog_items set active=true where id=$1',[s.catalog]);const r=await issue(s);
 const old=id(++operationSequence);await db.query("insert into public.station_operations(id,tenant_id,status) values($1,$2,'autorizado')",[old,tenant]);await rejected(()=>reserve(s,row(s),old),/existente exige/);
 await rejected(()=>db.query('select sgf_private.book_budget($1,$2::jsonb,$3)',['station_operations',JSON.stringify({id:r.operation}),s.contract]),/já vinculada/);
}));
test('lubrificante e serviços usam unidades próprias sem limite do tanque de propulsão',()=>isolated(async()=>{
 for(const [category,unit,kind] of [['lubricant','KG','lubrificante'],['labor','SERV','servico'],['tire_service','UN','servico']]){
 const s=await ready(category,unit);await db.exec('reset role');await db.query('update public.vehicles set tank_capacity=1 where id=$1',[vehicle]);const r=await issue(s);await complete(r);assert.equal((await balance(r)).item_kind,kind);assert.equal((await balance(r)).state,'realized');
 }
}));
test('vínculos, autoria, comprovantes e limites comprometidos são preservados',()=>isolated(async()=>{
 const s=await ready(),r=await issue(s);
 await rejected(()=>db.query('update public.station_operations set unit_price=99 where id=$1',[r.operation]),/imutáveis/);
 await rejected(()=>db.query('update public.station_operations set driver_id=$1 where id=$2',[outsider,r.operation]),/autoria/);
 await rejected(()=>db.query('update public.instrument_budget_allocations set spending_limit=300 where id=$1',[s.allocation.id]),/Teto inferior/);
 await rejected(()=>db.query('update public.procurement_items set quantity=59 where id=$1',[s.item]),/Quantidade inferior/);
 await rejected(()=>db.query("update public.procurement_items set category='fuel' where id=$1",[s.item]),/histórico/);
 await rejected(()=>db.query('delete from public.instrument_budget_allocations where id=$1',[s.allocation.id]),/histórico/);
 await rejected(()=>db.query('delete from public.station_operations where id=$1',[r.operation]),/excluída/);
 await rejected(()=>complete(r,61),/Quantidade executada/);await complete(r);
 await rejected(()=>db.query("update public.station_operations set evidence_path='alterada' where id=$1",[r.operation]),/reescritos/);
 await rejected(()=>db.query('update public.station_operations set quantity=39,total_cost=199.81 where id=$1',[r.operation]),/reescritos/);
}));
test('valida entrada, prefeitura, secretaria, módulos e sessão',()=>isolated(async()=>{
 const s=await ready();for(const quantity of [0,-1,'NaN','Infinity',1.0001])await rejected(()=>reserve(s,{...row(s),quantity}),/Quantidade inválida/);
 await rejected(()=>reserve(s,{...row(s),expires_at:new Date(Date.now()-1000).toISOString()}),/Validade inválida/);await rejected(()=>reserve(s,{...row(s),price:1}),/Campo/);
 await db.exec('reset role');await db.query('update public.vehicles set department_id=$1 where id=$2',[otherDepartment,vehicle]);await rejected(()=>reserve(s),/secretaria/);
 await login(outsider);await rejected(()=>reserve(s),/Item não encontrado/);await login(secretary);await rejected(()=>reserve(s),/permissão|gestão|restrito/i);
 await login();await db.exec("reset role;select set_config('app.uid','',false)");await db.query("update public.profiles set allowed_modules=array['procurement','budgets'] where id=$1",[admin]);await login();await rejected(()=>reserve(s),/postos obrigatório/);
 await db.exec("reset role;select set_config('app.uid','',false)");await db.query("update public.profiles set allowed_modules=array['procurement','budgets','stations'] where id=$1",[admin]);await db.query('delete from auth.sessions where id=$1',[admin]);await login();await rejected(()=>reserve(s),/sessão|sessao|session/i);
}));
test('RLS e privilégios mantêm tabela e funções internas inacessíveis aos clientes',()=>isolated(async()=>{
 await login();await rejected(()=>db.query("select sgf_private.reserve_procurement_station_operation(null,null,null,'{}')"),/permission denied/);await rejected(()=>db.query('select * from public.procurement_station_reservations'),/permission denied/);
 await db.exec('reset role');assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.procurement_station_reservations'::regclass")).rows[0].relrowsecurity,true);
 const functions=(await db.query("select p.proconfig,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') client from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='sgf_private' and p.proname in ('reserve_procurement_station_operation','procurement_station_transition','procurement_station_allocation_guard','procurement_station_item_guard')")).rows;
 assert.equal(functions.length,4);for(const fn of functions){assert.equal(fn.anon,false);assert.equal(fn.client,false);assert.ok(fn.proconfig.includes('search_path=""'));}
}));

test('revisão de preço não reescreve reservas e novas solicitações usam a revisão vigente',()=>isolated(async()=>{
 const s=await ready(),first=await issue(s);await login();await s.setPrice({version:2,unit_price:7});
 await reserve(s,first.p,first.operation);const second=await issue(s,{...row(s),quantity:20});
 assert.equal(Number((await balance(first)).unit_price),5.123456);assert.equal(Number((await balance(second)).unit_price),7);
 await complete(first);assert.equal(Number((await balance(first)).committed_amount),204.94);
 await rejected(()=>reserve(s,{...row(s),quantity:1,expires_at:new Date(Date.now()+8*86400000).toISOString()}),/Validade inválida/);
}));
