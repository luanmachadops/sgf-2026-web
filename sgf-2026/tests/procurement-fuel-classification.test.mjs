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
 await db.exec(`select set_config('app.uid','',false); alter table public.fuel_stations add column name text default 'Posto'; alter table public.repair_shops add column name text default 'Oficina'; update public.profiles set allowed_modules=array['procurement','budgets','refuelings']; insert into auth.sessions(id,user_id,created_at) select id,id,clock_timestamp()+interval '1 second' from public.profiles;`);await login();
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

async function edit(s,code){return db.query('select public.save_procurement_item($1::jsonb)',[JSON.stringify({id:s.item,version:1,instrument_id:s.contract,reference:'Diesel',description:'Diesel para frota',category:'fuel',fuel_code:code,unit:'L',quantity:100,partner_kind:'posto',partner_id:station,origin_item_id:null,reason:'Classificação conferida'})]);}
test('classificação explícita obrigatória, auditada e retornada para leitura',()=>isolated(async()=>{
 const s=await scenario();await rejected(()=>edit(s,null),/Classifique/);await rejected(()=>edit(s,'outro'),/Classifique/);
 await edit(s,'gasolina');const data=(await db.query('select public.get_procurement_items($1) data',[s.contract])).rows[0].data;assert.equal(data.items[0].fuel_code,'gasolina');
 await db.exec('reset role');const history=(await db.query("select before_value,after_value from public.procurement_registry_events where record_id=$1 and kind='item' order by id desc limit 1",[s.item])).rows[0];assert.equal(history.before_value.fuel_code,'diesel');assert.equal(history.after_value.fuel_code,'gasolina');
}));
test('reserva não aceita combustível diferente e falha não deixa reserva parcial',()=>isolated(async()=>{
 const s=await ready();await rejected(()=>reserve(s,{...row(),fuel_type:'Gasolina'}),/classificação/);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.procurement_fuel_reservations')).rows[0].n,0);await issue(s);
 await rejected(()=>db.query('select public.save_procurement_item($1::jsonb)',[JSON.stringify({id:s.item,version:2,instrument_id:s.contract,reference:'Diesel',description:'Diesel para frota',category:'fuel',fuel_code:'gasolina',unit:'L',quantity:100,partner_kind:'posto',partner_id:station,origin_item_id:null,reason:'Tentativa'})]),/histórico/);
}));
test('contrato derivado exige combustível idêntico à ata e bloqueia divergência na origem',()=>isolated(async()=>{
 const {ata,contract}=await instruments();
 const base={instrument_id:ata,reference:'01',description:'Combustível',category:'fuel',fuel_code:'diesel',unit:'L',quantity:100,partner_kind:'posto',partner_id:station,origin_item_id:null,reason:'Teste'};
 const item=(await db.query('select public.save_procurement_item($1::jsonb) id',[JSON.stringify(base)])).rows[0].id;
 await rejected(()=>db.query('select public.save_procurement_item($1::jsonb)',[JSON.stringify({...base,instrument_id:contract,origin_item_id:item,fuel_code:'gasolina'})]),/diferente/);
 await db.query('select public.save_procurement_item($1::jsonb)',[JSON.stringify({...base,instrument_id:contract,origin_item_id:item})]);
 await rejected(()=>db.query('select public.save_procurement_item($1::jsonb)',[JSON.stringify({...base,id:item,version:1,fuel_code:'etanol'})]),/diverge/);
}));
test('implementações anteriores são privadas e sessão/prefeitura continuam verificadas',()=>isolated(async()=>{
 const s=await scenario();await login(outsider);await rejected(()=>edit(s,'gasolina'),/não encontrado/);
 await login();await rejected(()=>db.query("select sgf_private.procurement_item_save_before_fuel_code('{}'::jsonb)"),/permission denied/);
 const rows=(await db.query(`select p.proname,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') authenticated from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='sgf_private' and p.proname in ('procurement_item_save_before_fuel_code','reserve_procurement_fueling_before_classification','reserve_procurement_fueling')`)).rows;assert.equal(rows.length,3);for(const r of rows){assert.equal(r.anon,false);assert.equal(r.authenticated,false);}
}));
