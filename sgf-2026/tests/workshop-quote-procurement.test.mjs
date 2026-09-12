import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {setupQuoteProcurement,login,id,admin,outsider,quote,quoteItem,order,procurementItem,allocation,price,otherDepartment,workshop} from './workshop-quote-procurement-fixture.mjs';

let db;
before(async()=>{db=await setupQuoteProcurement();await login(db);});
after(async()=>db?.close());
async function isolated(fn){await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}}
async function rejected(fn,pattern=/.+/){await db.exec('savepoint invalid');await assert.rejects(fn,pattern);await db.exec('rollback to savepoint invalid');}
const link=(patch={})=>({quote_item_id:quoteItem,procurement_item_id:procurementItem,allocation_id:allocation,...patch});
async function save(links=[link()],reason='Vínculo conferido com contrato') {return db.query('select public.set_quote_procurement_links($1,$2::jsonb,$3)',[quote,JSON.stringify(links),reason]);}

test('lista candidaturas compatíveis e grava vínculo auditável sem reservar saldo',()=>isolated(async()=>{
 const rows=(await db.query('select public.get_quote_procurement_candidates($1) data',[quote])).rows[0].data;
 assert.equal(rows.length,1);assert.equal(rows[0].candidates.length,1);assert.equal(rows[0].candidates[0].item_id,procurementItem);assert.equal(rows[0].candidates[0].allocation_id,allocation);
 await save();await db.exec('reset role');
 const saved=(await db.query('select * from public.service_order_quote_item_procurement_links where quote_item_id=$1',[quoteItem])).rows[0];
 assert.equal(saved.procurement_item_id,procurementItem);assert.equal(saved.allocation_id,allocation);assert.equal(saved.procurement_price_id,price);assert.equal(Number(saved.contract_unit_price),30);
 assert.equal((await db.query("select count(*)::int n from public.procurement_registry_events where kind='quote_link'")).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from public.budget_entries')).rows[0].n,0);
}));

test('recusa item, preço, unidade, secretaria e vínculos incompletos incompatíveis',()=>isolated(async()=>{
 await rejected(()=>save([]),/Vincule todos/);
 await rejected(()=>save([link({allocation_id:id(999)})]),/Dotação incompatível/);
 await db.exec('reset role');await db.query('update public.instrument_budget_allocations set department_id=$1 where id=$2',[otherDepartment,allocation]);await login(db);
 await rejected(()=>save(),/Dotação incompatível/);
 await db.exec('reset role');await db.query('update public.instrument_budget_allocations set department_id=(select department_id from public.vehicles where id=(select vehicle_id from public.service_orders where id=$1)) where id=$2',[order,allocation]);await db.query('update public.procurement_item_prices set unit_price=20 where id=$1',[price]);await login(db);
 await rejected(()=>save(),/Preço do orçamento/);
 await db.exec('reset role');await db.query("update public.procurement_items set unit='H' where id=$1",[procurementItem]);await login(db);
 await rejected(()=>save(),/Item contratual incompatível/);
}));

test('aprovação exige vínculo válido e revalida preço vigente',()=>isolated(async()=>{
 await rejected(()=>db.query('select public.manager_review_service_order_quote($1,true,$2)',[quote,'Aprovação']),/Vincule todos/);
 await save();await db.exec('reset role');await db.query('update public.procurement_item_prices set unit_price=20 where id=$1',[price]);await login(db);
 await rejected(()=>db.query('select public.manager_review_service_order_quote($1,true,$2)',[quote,'Aprovação']),/Preço do orçamento/);
 await db.exec('reset role');await db.query('update public.procurement_item_prices set unit_price=30 where id=$1',[price]);await login(db);
 await db.query('select public.manager_review_service_order_quote($1,true,$2)',[quote,'Aprovação']);await db.exec('reset role');
 assert.equal((await db.query('select status from public.service_order_quotes where id=$1',[quote])).rows[0].status,'aprovado');
 assert.equal((await db.query('select financial_status,budget from public.service_orders where id=$1',[order])).rows[0].financial_status,'awaiting_commitment');
}));

test('sessão, permissões e tabelas internas permanecem restritas',()=>isolated(async()=>{
  await login(db,outsider);await rejected(()=>db.query('select public.get_quote_procurement_candidates($1)',[quote]),/Sessão|permissão|licitações/);
  await db.exec('reset role');const status=(await db.query("select relrowsecurity,has_table_privilege('authenticated','public.service_order_quote_item_procurement_links','select') direct,has_function_privilege('anon','public.set_quote_procurement_links(uuid,jsonb,text)'::regprocedure,'execute') anon from pg_class where oid='public.service_order_quote_item_procurement_links'::regclass")).rows[0];assert.equal(status.relrowsecurity,true);assert.equal(status.direct,false);assert.equal(status.anon,false);
  const functions=(await db.query("select prosecdef,has_function_privilege('anon',oid,'execute') anon from pg_proc where oid in ('public.get_quote_procurement_candidates(uuid)'::regprocedure,'public.set_quote_procurement_links(uuid,jsonb,text)'::regprocedure)")).rows;assert.equal(functions.length,2);for(const fn of functions){assert.equal(fn.prosecdef,false);assert.equal(fn.anon,false);}
}));
