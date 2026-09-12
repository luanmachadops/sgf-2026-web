import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {setupQuotes,login,order,unitItem,operator} from './workshop-quote-classification-fixture.mjs';
import {id,admin,outsider} from './department-budget-fixture.mjs';
let db;
before(async()=>{db=await setupQuotes();await login(db);});
after(async()=>db?.close());
async function isolated(fn){await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}}
async function rejected(fn,pattern=/.+/){await db.exec('savepoint invalid');await assert.rejects(fn,pattern);await db.exec('rollback to savepoint invalid');}
async function submit(items=[unitItem],oid=order){return (await db.query("select public.repair_shop_submit_quote_v3($1,$2::jsonb,current_date+7,'Teste') id",[oid,JSON.stringify(items)])).rows[0].id;}
test('classificação explícita preserva preço, versão, total e itens antigos',()=>isolated(async()=>{
 const quote=await submit();await db.exec('reset role');
 const row=(await db.query('select * from public.service_order_quote_items where quote_id=$1',[quote])).rows[0];assert.equal(row.unit,'H');assert.equal(row.category,'labor');assert.equal(Number(row.unit_price),25.123456);
 const q=(await db.query('select * from public.service_order_quotes where id=$1',[quote])).rows[0];assert.equal(q.version,2);assert.equal(Number(q.total),50.25);
 const old=(await db.query('select * from public.service_order_quote_items where id=$1',[id(73)])).rows[0];assert.equal(old.unit,null);assert.equal(old.category,null);
 assert.equal((await db.query('select status from public.service_order_quotes where id=$1',[id(72)])).rows[0].status,'substituido');
 assert.equal((await db.query('select count(*)::int n from public.service_order_events')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from public.budget_entries')).rows[0].n,0);
}));
test('recusa unidade ausente, categoria incompatível e precisão inválida sem substituir orçamento anterior',()=>isolated(async()=>{
 for(const change of [{unit:null},{unit:'CAIXA'},{category:'parts'},{qty:1.001},{qty:'NaN'},{unit_price:'Infinity'},{unit_price:1.1234567},{extra:'não permitido'}])await rejected(()=>submit([{...unitItem,...change}]));
 await rejected(()=>submit([unitItem,{...unitItem,category:null}]));await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.service_order_quotes')).rows[0].n,1);assert.equal((await db.query('select status from public.service_order_quotes')).rows[0].status,'enviado');
}));
test('peças, pneus, borracharia e unidades distintas permanecem identificáveis',()=>isolated(async()=>{
 const items=[{...unitItem,kind:'peca',category:'parts',unit:'UN'},{...unitItem,kind:'peca',category:'tires',unit:'UN'},{...unitItem,category:'tire_service',unit:'SERV'},{...unitItem,kind:'peca',category:'lubricant',unit:'L'}];
 const quote=await submit(items);await db.exec('reset role');const rows=(await db.query('select category,unit from public.service_order_quote_items where quote_id=$1',[quote])).rows;assert.equal(rows.length,4);assert.ok(rows.some(r=>r.category==='tire_service'&&r.unit==='SERV'));
}));
test('mudança de unidade exige nova versão; orçamento já aprovado não é substituído',()=>isolated(async()=>{
 const first=await submit();await db.exec('reset role');await rejected(()=>db.query("update public.service_order_quote_items set unit='SERV' where quote_id=$1",[first]),/nova versão/);
 await login(db);const second=await submit([{...unitItem,unit:'SERV'}]);await db.exec('reset role');assert.equal((await db.query('select version from public.service_order_quotes where id=$1',[second])).rows[0].version,3);
 await db.query("update public.service_orders set financial_status='awaiting_commitment' where id=$1",[order]);await login(db);await rejected(()=>submit(),/aprovado/);
}));
test('sessões, papel, oficina e prefeitura restringem o novo endpoint',()=>isolated(async()=>{
 await login(db,admin);await rejected(()=>submit(),/oficinas/);await login(db,outsider);await rejected(()=>submit(),/oficinas/);
 await login(db);await rejected(()=>submit([unitItem],id(999)),/não encontrada/);
 await db.exec('reset role');await db.query('delete from auth.sessions where user_id=$1',[operator]);await login(db);await rejected(()=>submit(),/Sessão/);
}));
test('endpoint público é invoker e acesso anônimo é negado',()=>isolated(async()=>{
 const fn=(await db.query("select prosecdef,has_function_privilege('anon',oid,'execute') anon from pg_proc where oid='public.repair_shop_submit_quote_v3(uuid,jsonb,date,text)'::regprocedure")).rows[0];assert.equal(fn.prosecdef,false);assert.equal(fn.anon,false);
 await db.exec('reset role');await rejected(()=>db.query("update public.service_order_quote_items set unit='UN',category='parts' where id=$1",[id(73)]),/nova versão/);
}));
