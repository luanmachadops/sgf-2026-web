import { setupWorkflow } from './procurement-workflow-fixture.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { save as saveLegacy, setup, id, admin, outsider, secretary, station, department, otherDepartment, vehicle, tenant } from './department-budget-fixture.mjs';
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
 for(const migration of ['20260910152227_procurement_registry.sql','20260910211314_procurement_items_prices.sql','20260911021152_instrument_budget_planning.sql','20260911022956_procurement_preflight.sql','20260911023848_procurement_fuel_reservations.sql','20260911105457_procurement_fuel_classification.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'));
 await db.exec(`select set_config('app.uid','',false); alter table public.fuel_stations add column name text default 'Posto'; alter table public.repair_shops add column name text default 'Oficina'; update public.profiles set allowed_modules=array['procurement','budgets','refuelings']; insert into auth.sessions(id,user_id,created_at) select id,id,clock_timestamp()+interval '1 second' from public.profiles;`);await login();await setupWorkflow(db);await login();
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
 const item=(await db.query('select public.save_procurement_item($1::jsonb) id',[JSON.stringify({instrument_id:contract,reference:'Diesel',description:'Diesel para frota',category:'fuel',fuel_code:'diesel',unit:'L',quantity:100,partner_kind:'posto',partner_id:station,origin_item_id:null,reason:'Teste'})])).rows[0].id;
 const setPrice=async(extra={})=>db.query('select public.save_procurement_price($1::jsonb)',[JSON.stringify({item_id:item,version:1,effective_on:'2026-01-01',pricing_mode:'unit',unit_price:5.123456,discount_percent:null,table_reference:null,document_reference:'Tabela teste',reason:'Teste preço',...extra})]);
 return {contract,item,allocation,setPrice,input:{item_id:item,allocation_id:allocation.id,operation_date:'2026-06-01',quantity:100}};
}

let fuelSequence=200;
const row=()=>({vehicle_id:vehicle,station_id:station,fuel_type:'Diesel',max_liters:60,expires_at:new Date(Date.now()+3600000).toISOString()});
async function reserve(s,request=row(),fid=id(++fuelSequence)){
 await db.exec('reset role');
 await db.query('select sgf_private.reserve_procurement_fueling($1,$2,$3,$4::jsonb)',[fid,s.item,s.allocation.id,JSON.stringify(request)]);
 return {fid,request};
}
async function issue(s,request=row()){
 const result=await reserve(s,request);
 await db.query("insert into public.fuelings(id,tenant_id,vehicle_id,station_id,fuel_type,max_liters,expires_at,workflow_status,liters) values($1,$2,$3,$4,$5,$6,$7,'autorizado',0)",[result.fid,tenant,request.vehicle_id,request.station_id,request.fuel_type,request.max_liters,request.expires_at]);
 await db.exec('set constraints all immediate; set constraints all deferred');
 return result;
}
const balance=async fid=>(await db.query('select * from public.procurement_fuel_reservations where fueling_id=$1',[fid])).rows[0];
const complete=async(fid,liters=40,price=5)=>db.query("update public.fuelings set workflow_status='concluido',liters=$2,price_per_liter=$3,total_cost=round($2::numeric*$3::numeric,2),filled_at=now() where id=$1",[fid,liters,price]);
async function ready(){const s=await scenario();await s.setPrice({unit_price:5});return s;}


const operator=id(50), driver=id(51);
async function configured(amount=1000){const s=await ready();await db.exec('reset role');await db.query("insert into public.procurement_fuel_rollouts values($1,true,'Homologação fictícia')",[s.contract]);await db.query("insert into public.station_commitments(station_id,amount,status,valid_from,valid_until,issued_on) values($1,$2,'ativo',current_date,current_date+7,current_date)",[station,amount]);await login();return s;}
function request(s){return {item_id:s.item,allocation_id:s.allocation.id,vehicle_id:vehicle,driver_id:driver,quantity:60,expires_at:new Date(Date.now()+3600000).toISOString(),note:'Teste'};}
async function emit(s,p=request(s),fid=id(++fuelSequence)){const result=(await db.query('select public.issue_procurement_fueling($1,$2::jsonb) id',[fid,JSON.stringify(p)])).rows[0].id;return {fid:result,p};}
async function finish(fid,liters=40){const path=`tenant/${tenant}/stations/${station}/fuelings/${fid}/bico.jpg`;await db.exec('reset role');await db.query('insert into storage.objects values($1,$2)',['fotos',path]);await login(operator);return (await db.query('select public.complete_procurement_fueling($1,$2,150,$3,$4) data',[fid,liters,'CUPOM-1',path])).rows[0].data;}
test('emissão e conclusão usam reserva e preço contratado, com idempotência e empenho preservado',()=>isolated(async()=>{
 const s=await configured();const issued=await emit(s);assert.equal(await (async()=>(await emit(s,issued.p,issued.fid)).fid)(),issued.fid);
 await rejected(()=>emit(s,{...issued.p,quantity:50},issued.fid),/já utilizada/);
 await login(operator);const pending=(await db.query('select * from public.get_station_pending_authorizations()')).rows;assert.equal(Number(pending[0].price_per_liter),5);
 const result=await finish(issued.fid);assert.equal(result.total_cost,200);assert.equal(result.price_per_liter,5);
 assert.deepEqual(await finish(issued.fid),result);await rejected(()=>finish(issued.fid,39),/outros dados/);
 await db.exec('reset role');assert.equal((await balance(issued.fid)).state,'realized');assert.equal((await db.query('select count(*)::int n from public.budget_entries')).rows[0].n,0);
 assert.equal(Number((await db.query('select public.station_commitment_total_available($1,current_date) available',[station])).rows[0].available),800);
}));
test('empenho insuficiente reverte autorização e reserva; rollout desabilitado não emite',()=>isolated(async()=>{
 const s=await configured(299);await rejected(()=>emit(s),/empenho insuficiente/);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.procurement_fuel_reservations')).rows[0].n,0);await db.query('update public.procurement_fuel_rollouts set enabled=false where instrument_id=$1',[s.contract]);await login();await rejected(()=>emit(s),/habilitação/);
}));
test('valida motorista, veículo e prefeitura; posto distinto e foto inexistente são recusados',()=>isolated(async()=>{
 const s=await configured();await rejected(()=>emit(s,{...request(s),driver_id:outsider}),/Motorista/);
 await db.exec('reset role');await db.query("update public.vehicles set fuel_type='gasolina' where id=$1",[vehicle]);await login();await rejected(()=>emit(s),/incompatível/);
 await db.exec('reset role');await db.query("update public.vehicles set fuel_type='diesel' where id=$1",[vehicle]);await login();const issued=await emit(s);
 await login(outsider);await rejected(()=>emit(s),/não encontrado/);await rejected(()=>db.query('select public.complete_procurement_fueling($1,40,150,$2,$3)',[issued.fid,'C','bad']),/restrito/);
 await login(operator);await rejected(()=>db.query('select public.complete_procurement_fueling($1,40,150,$2,$3)',[issued.fid,'C',`tenant/${tenant}/stations/${station}/fuelings/${issued.fid}/missing.jpg`]),/não encontrada/);
}));

test('clientes antigos não contornam foto nem preço; cancelamento libera saldo e preço independe do catálogo',()=>isolated(async()=>{
 const s=await configured();const a=await emit(s);await login(operator);
 await rejected(()=>db.query('select * from public.partner_complete_fueling_v2($1,40,150,$2,$3)',[a.fid,'CUPOM','inexistente']),/Foto/);
 await db.exec('reset role');await db.query("update public.fuelings set workflow_status='rejeitado_admin',cancelled_at=now() where id=$1",[a.fid]);assert.equal((await balance(a.fid)).state,'released');
 await login();const b=await emit(s);await db.exec('reset role');await db.query("update public.fuel_stations set fuel_prices='{}'::jsonb where id=$1",[station]);await login(operator);const pending=(await db.query('select * from public.get_station_pending_authorizations()')).rows;assert.equal(Number(pending[0].price_per_liter),5);
 await finish(b.fid);await rejected(()=>db.query('select * from public.partner_complete_fueling_v2($1,39,150,$2,$3)',[b.fid,'CUPOM-1','ignored']),/outros dados/);
}));
