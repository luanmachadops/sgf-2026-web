import { setupStationWorkflow } from './procurement-station-workflow-fixture.mjs';
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
 await db.exec(`select set_config('app.uid','',false); alter table public.fuel_stations add column name text default 'Posto'; alter table public.repair_shops add column name text default 'Oficina'; update public.profiles set allowed_modules=array['procurement','budgets','refuelings','stations']; insert into auth.sessions(id,user_id,created_at) select id,id,clock_timestamp()+interval '1 second' from public.profiles;`);await login();await setupWorkflow(db);await setupStationWorkflow(db);await login();
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

let operationSequence=800;
async function ready(category='arla',unit='L'){const s=await scenario(category,unit);await s.setPrice({unit_price:5.123456});await db.exec('reset role');s.catalog=id(++operationSequence);await db.query('insert into public.station_catalog_items(id,tenant_id,station_id,kind,name,unit,unit_price) values($1,$2,$3,$4,$5,$6,99)',[s.catalog,tenant,station,s.kind,`Catálogo ${operationSequence}`,s.unit]);await login();return s;}
const row=s=>({vehicle_id:vehicle,station_id:station,catalog_item_id:s.catalog,quantity:60,expires_at:new Date(Date.now()+3600000).toISOString()});
async function reserve(s,p=row(s),operation=id(++operationSequence)){await db.exec('reset role');await db.query('select sgf_private.reserve_procurement_station_operation($1,$2,$3,$4::jsonb)',[operation,s.item,s.allocation.id,JSON.stringify(p)]);return {operation,p};}
async function insert(s,r){const saved=await balance(r);await db.query(`insert into public.station_operations(id,tenant_id,station_id,vehicle_id,department_id,catalog_item_id,item_kind,item_name,unit,status,authorized_quantity,unit_price,expires_at,authorized_by,protocol) values($1,$2,$3,$4,$5,$6,$11,'ARLA contratado',$12,'autorizado',$7,$13,$8,$9,$10)`,[r.operation,tenant,station,vehicle,department,s.catalog,r.p.quantity,r.p.expires_at,admin,`OP-${r.operation}`,s.kind,s.unit,saved.unit_price]);await db.exec('set constraints all immediate; set constraints all deferred');return r;}
const issue=async(s,p=row(s))=>insert(s,await reserve(s,p));
const balance=async r=>(await db.query('select * from public.procurement_station_reservations where operation_id=$1',[r.operation])).rows[0];
const complete=async(r,qty=40)=>db.query("update public.station_operations set status='concluido',quantity=$2,total_cost=round($2::numeric*unit_price,2),executed_at=now(),executed_by=$3,receipt_number='CUPOM-1',evidence_path='local/evidencia.jpg',odometer=150 where id=$1",[r.operation,qty,admin]);
const operator=id(50),driver=id(51);
async function configured(amount=1000){const s=await ready();await db.exec('reset role');await db.query("insert into public.procurement_station_rollouts values($1,true,'Homologação fictícia')",[s.contract]);await db.query("insert into public.station_commitments(station_id,amount,status,valid_from,valid_until,issued_on) values($1,$2,'ativo',current_date,current_date+7,current_date)",[station,amount]);await login();return s;}
const request=s=>({item_id:s.item,allocation_id:s.allocation.id,vehicle_id:vehicle,driver_id:driver,catalog_item_id:s.catalog,quantity:60,expires_at:new Date(Date.now()+3600000).toISOString(),note:'Teste'});
const emit=async(s,p=request(s),operation=id(++operationSequence))=>{await db.query('select public.issue_procurement_station_operation($1,$2::jsonb)',[operation,JSON.stringify(p)]);return {operation,p};};
const path=r=>`tenant/${tenant}/stations/${station}/operations/${r.operation}/foto.jpg`;
async function proof(r,owner=operator){await db.exec('reset role');await db.query("insert into storage.objects(bucket_id,name,owner_id) values('fotos',$1,$2)",[path(r),owner]);await login(operator);}
const finish=async(r,qty=40,evidence=path(r))=>(await db.query('select * from public.partner_complete_station_operation($1,$2,150,$3,$4)',[r.operation,qty,'CUPOM',evidence])).rows[0];
test('emissão idempotente e conclusão no endpoint do portal preservam preço, cota e empenho',()=>isolated(async()=>{
 const s=await configured();const r=await emit(s);await emit(s,r.p,r.operation);await rejected(()=>emit(s,{...r.p,note:'Outra'},r.operation),/já utilizada/);
 await login(operator);const pending=(await db.query('select * from public.partner_get_pending_station_operations()')).rows;assert.equal(Number(pending[0].unit_price),5.123456);
 await proof(r);const result=await finish(r);assert.equal(Number(result.total_cost),204.94);assert.deepEqual(await finish(r),result);await rejected(()=>finish(r,39),/outros dados/);
 await db.exec('reset role');assert.equal((await balance(r)).state,'realized');assert.equal((await db.query('select count(*)::int n from public.budget_entries')).rows[0].n,0);
 assert.equal(Number((await db.query('select public.station_contract_committed($1) n',[station])).rows[0].n),0);
 assert.equal(Number((await db.query('select public.station_commitment_total_available($1,current_date) n',[station])).rows[0].n),795.06);
}));
test('empenho insuficiente reverte tudo e habilitação de combustível não habilita serviços',()=>isolated(async()=>{
 const s=await configured(300);await rejected(()=>emit(s),/empenho insuficiente/);await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.procurement_station_reservations')).rows[0].n,0);
 await db.query('update public.procurement_station_rollouts set enabled=false where instrument_id=$1',[s.contract]);await db.query("insert into public.procurement_fuel_rollouts values($1,true,'Teste combustível')",[s.contract]);await login();await rejected(()=>emit(s),/habilitação/);
}));
test('valida motorista, veículo, catálogo, prefeitura e sessão antes de emitir',()=>isolated(async()=>{
 const s=await configured();await rejected(()=>emit(s,{...request(s),driver_id:outsider}),/Motorista/);
 await db.exec('reset role');await db.query("update public.vehicles set status='bloqueado' where id=$1",[vehicle]);await login();await rejected(()=>emit(s),/Veículo/);
 await db.exec('reset role');await db.query("update public.vehicles set status='disponivel' where id=$1",[vehicle]);await db.query("update public.station_catalog_items set unit='UN' where id=$1",[s.catalog]);await login();await rejected(()=>emit(s),/Catálogo/);
 await login(outsider);await rejected(()=>emit(s),/não encontrado/);await login();await db.exec('reset role');await db.query('delete from auth.sessions where user_id=$1',[admin]);await login();await rejected(()=>emit(s),/sessão|sessao|session/i);
}));
test('evidência exige caminho, objeto e autoria; posto inativo e usuário gestor não concluem',()=>isolated(async()=>{
 const s=await configured(),r=await emit(s);await rejected(()=>finish(r),/restrito/);await login(operator);
 await rejected(()=>finish(r,40,'outro/caminho.jpg'),/não pertence/);await rejected(()=>finish(r),/não encontrada/);await proof(r,admin);await rejected(()=>finish(r),/outro usuário/);
 await db.exec('reset role');await db.query('update storage.objects set owner_id=$1',[operator]);await db.query('update public.fuel_stations set is_active=false where id=$1',[station]);await login(operator);await rejected(()=>finish(r),/inativo/);
 await db.exec('reset role');await db.query('update public.fuel_stations set is_active=true,contract_end=current_date-1 where id=$1',[station]);await login(operator);await finish(r);
}));
test('cancelamento pelo gestor libera reserva com motivo auditado; execução não pode ser cancelada',()=>isolated(async()=>{
 const s=await configured(),r=await emit(s);assert.equal((await db.query('select public.has_procurement_station_binding($1) yes',[r.operation])).rows[0].yes,true);
 await rejected(()=>db.query('select public.cancel_procurement_station_operation($1,$2)',[r.operation,'x']),/motivo/);
 await db.query('select public.cancel_procurement_station_operation($1,$2)',[r.operation,'Solicitação duplicada']);await db.query('select public.cancel_procurement_station_operation($1,$2)',[r.operation,'Solicitação duplicada']);
 await db.exec('reset role');assert.equal((await balance(r)).state,'released');assert.match((await db.query('select reason from public.procurement_registry_events where record_id=$1 order by id desc limit 1',[r.operation])).rows[0].reason,/Solicitação duplicada/);
 await login();const next=await emit(s);await proof(next);await finish(next);await login();await rejected(()=>db.query('select public.cancel_procurement_station_operation($1,$2)',[next.operation,'Tentativa indevida']),/não executada/);
}));
test('operações legadas continuam no caminho anterior e não consomem duas vezes o limite global',()=>isolated(async()=>{
 const s=await configured();const bound=await emit(s);await db.exec('reset role');await db.query('update public.fuel_stations set contract_value=200 where id=$1',[station]);await login();
 const old=(await db.query('select public.manager_create_station_operation($1,$2,$3,$4,1,now()+interval \'1 hour\',$5) id',[vehicle,driver,station,s.catalog,'Legado'])).rows[0].id;
 await login(operator);const result=(await db.query('select * from public.partner_complete_station_operation($1,1,150,$2,$3)',[old,'OLD','legacy/path.jpg'])).rows[0];assert.equal(Number(result.total_cost),99);
 await db.exec('reset role');assert.equal(Number((await db.query('select public.station_contract_committed($1) n',[station])).rows[0].n),99);
 assert.equal(Number((await balance(bound)).committed_amount),307.41);
}));
test('funções novas são invoker públicas e implementações antigas não são chamadas diretamente',()=>isolated(async()=>{
 await login();await rejected(()=>db.query('select * from sgf_private.complete_station_operation_before_procurement(null,1,1,null,null)'),/permission denied/);
 const funcs=(await db.query("select p.prosecdef,has_function_privilege('anon',p.oid,'execute') anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('issue_procurement_station_operation','partner_complete_station_operation','has_procurement_station_binding','cancel_procurement_station_operation')")).rows;
 assert.equal(funcs.length,4);for(const fn of funcs){assert.equal(fn.prosecdef,false);assert.equal(fn.anon,false);}
}));
