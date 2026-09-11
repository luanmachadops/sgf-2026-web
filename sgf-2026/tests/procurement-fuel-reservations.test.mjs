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
 for(const migration of ['20260910152227_procurement_registry.sql','20260910211314_procurement_items_prices.sql','20260911021152_instrument_budget_planning.sql','20260911022956_procurement_preflight.sql','20260911023848_procurement_fuel_reservations.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'));
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
 const item=(await db.query('select public.save_procurement_item($1::jsonb) id',[JSON.stringify({instrument_id:contract,reference:'Diesel',description:'Diesel para frota',category:'fuel',unit:'L',quantity:100,partner_kind:'posto',partner_id:station,origin_item_id:null,reason:'Teste'})])).rows[0].id;
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
test('reserva atômica mantém preço e vínculos; repetição não duplica nem consome o livro antigo',()=>isolated(async()=>{
 const s=await ready();const issued=await issue(s);let r=await balance(issued.fid);assert.equal(r.committed_amount,'300.00');assert.equal(r.committed_quantity,'60.000');assert.equal(r.state,'reserved');
 await reserve(s,issued.request,issued.fid);assert.equal((await db.query('select count(*)::int n from public.procurement_fuel_reservations')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from public.budget_entries')).rows[0].n,0);
 await rejected(()=>reserve(s,{...issued.request,max_liters:50},issued.fid),/já usado/);
 await rejected(()=>reserve(s,{...row(),max_liters:41}),/Quantidade disponível/);
 await complete(issued.fid);r=await balance(issued.fid);assert.equal(r.state,'realized');assert.equal(r.committed_amount,'200.00');assert.equal(r.committed_quantity,'40.000');
 await issue(s);assert.equal((await db.query('select sum(committed_quantity) total from public.procurement_fuel_reservations')).rows[0].total,'100.000');
}));
test('cancelamento libera saldo; rejeição após execução mantém valor contestado e nunca reabre',()=>isolated(async()=>{
 const s=await ready();const a=await issue(s);
 await db.query("update public.fuelings set workflow_status='rejeitado_admin',cancelled_at=now() where id=$1",[a.fid]);assert.equal((await balance(a.fid)).state,'released');assert.equal((await balance(a.fid)).committed_amount,'0.00');
 await rejected(()=>db.query("update public.fuelings set workflow_status='autorizado',cancelled_at=null where id=$1",[a.fid]),/reaberta/);
 const b=await issue(s);await complete(b.fid);await db.query("update public.fuelings set workflow_status='rejeitado_admin',cancelled_at=now() where id=$1",[b.fid]);assert.equal((await balance(b.fid)).state,'disputed');assert.equal((await balance(b.fid)).committed_amount,'200.00');
 await rejected(()=>db.query("update public.fuelings set workflow_status='rejeitado_motorista' where id=$1",[b.fid]),/liberar/);
 await rejected(()=>complete(b.fid,39),/reescrita/);
 await rejected(()=>db.query('delete from public.fuelings where id=$1',[b.fid]),/excluído/);
}));
test('preço reservado prevalece sobre revisões; execução acima do autorizado ou com preço diferente falha',()=>isolated(async()=>{
 const s=await ready();const a=await issue(s);await s.setPrice({version:2,unit_price:7});
 await rejected(()=>complete(a.fid,40,7),/preço reservado/);await rejected(()=>complete(a.fid,61),/Quantidade executada/);
 assert.equal((await balance(a.fid)).state,'reserved');await complete(a.fid);assert.equal((await balance(a.fid)).committed_amount,'200.00');
 await db.query("update public.fuelings set workflow_status='validado' where id=$1",[a.fid]);assert.equal((await balance(a.fid)).state,'realized');
}));
test('tetos não podem cair abaixo de compromissos e dotações com histórico preservam identidade',()=>isolated(async()=>{
 const s=await ready();await issue(s);
 await rejected(()=>db.query('update public.instrument_budget_allocations set spending_limit=299 where id=$1',[s.allocation.id]),/comprometido/);
 await rejected(()=>db.query("update public.instrument_budget_allocations set funding_source='002' where id=$1",[s.allocation.id]),/identificação/);
 await rejected(()=>db.query('delete from public.instrument_budget_allocations where id=$1',[s.allocation.id]),/histórico/);
 await rejected(()=>db.query('update public.procurement_items set quantity=59 where id=$1',[s.item]),/comprometido/);
 await db.query('update public.procurement_items set quantity=1000 where id=$1',[s.item]);await db.query('update public.instrument_budget_allocations set spending_limit=499 where id=$1',[s.allocation.id]);
 await rejected(()=>issue(s,{...row(),max_liters:40}),/Saldo disponível/);
 assert.equal((await db.query('select count(*)::int n from public.procurement_fuel_reservations')).rows[0].n,1);
}));
test('reserva exige secretaria/fornecedor compatíveis e quantidade, preço e validade definidos',()=>isolated(async()=>{
 const s=await ready();
 for(const patch of [{vehicle_id:id(8)},{station_id:id(7)},{max_liters:0},{max_liters:101},{max_liters:0.0001},{max_liters:'NaN'},{expires_at:'2020-01-01'},{expires_at:'infinity'},{fuel_type:'Outra'}])await rejected(()=>reserve(s,{...row(),...patch}));
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.procurement_fuel_reservations')).rows[0].n,0);
 await s.setPrice({version:2,pricing_mode:'discount',unit_price:null,discount_percent:10,table_reference:'Tabela'});await rejected(()=>reserve(s),/preço unitário/);
}));
test('reserva sem inserção do abastecimento não pode confirmar; abastecimento divergente e migração implícita são recusados',()=>isolated(async()=>{
 const s=await ready();await reserve(s);await rejected(()=>db.exec('set constraints all immediate'),/foreign key/);
 // Roll back the orphan request before continuing the scenario.
 await db.exec('reset role');await db.exec('delete from public.procurement_fuel_reservations');
 const a=await issue(s);
 await rejected(()=>db.query('update public.fuelings set id=$2 where id=$1',[a.fid,id(++fuelSequence)]),/imutáveis/);
 await rejected(()=>db.query("update public.fuelings set station_id=$2 where id=$1",[a.fid,id(7)]),/imutáveis/);
 const existing=id(++fuelSequence);await db.query("insert into public.fuelings(id,tenant_id,vehicle_id,station_id,workflow_status,max_liters,fuel_type) values($1,$2,$3,$4,'autorizado',10,'Diesel')",[existing,tenant,vehicle,station]);
 await rejected(()=>reserve(s,row(),existing),/conciliação/);
}));
test('motor de reserva é privado; sessão, prefeitura e módulos continuam obrigatórios',()=>isolated(async()=>{
 const s=await ready();await login();await rejected(()=>db.query('select * from public.procurement_fuel_reservations'),/permission denied/);
 await rejected(()=>db.query('select sgf_private.reserve_procurement_fueling($1,$2,$3,$4::jsonb)',[id(900),s.item,s.allocation.id,JSON.stringify(row())]),/permission denied/);
 await login(outsider);await rejected(()=>reserve(s),/não encontrado/);await login(secretary);await rejected(()=>reserve(s));
 await login();await db.exec("select set_config('request.jwt.claims','{}',false)");await rejected(()=>reserve(s),/revogada/);
 const funcs=(await db.query(`select p.proname,has_function_privilege('authenticated',p.oid,'execute') granted from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='sgf_private' and p.proname in ('reserve_procurement_fueling','procurement_fueling_transition','procurement_reserved_allocation_guard','procurement_reserved_item_guard')`)).rows;assert.equal(funcs.length,4);for(const f of funcs)assert.equal(f.granted,false);
}));

test('livros novo e antigo coexistem sem cobrar duas vezes e auditam a transição',()=>isolated(async()=>{
 const s=await ready();await db.exec('reset role');await saveLegacy(db);
 const issued=await issue(s);assert.equal((await db.query('select count(*)::int n from public.budget_entries')).rows[0].n,0);
 await complete(issued.fid,50);assert.equal((await db.query('select count(*)::int n from public.budget_entries')).rows[0].n,0);
 const history=(await db.query("select before_value,after_value from public.procurement_registry_events where record_id=$1 and kind='budget' order by id",[issued.fid])).rows;
 assert.equal(history.length,2);assert.equal(history[0].after_value.state,'reserved');assert.equal(history[1].before_value.committed_amount,300);assert.equal(history[1].after_value.committed_amount,250);
 const legacy=id(++fuelSequence);await db.query("insert into public.fuelings(id,tenant_id,vehicle_id,station_id,workflow_status,max_liters,fuel_type) values($1,$2,$3,$4,'autorizado',10,'Diesel')",[legacy,tenant,vehicle,station]);
 assert.equal((await db.query('select reserved from public.budget_entries where source_id=$1',[legacy])).rows[0].reserved,'50.00');
 await rejected(()=>db.query("select sgf_private.book_budget('fuelings',to_jsonb(f),(select id from public.budget_contracts limit 1)) from public.fuelings f where id=$1",[issued.fid]),/novo controle/);
}));
