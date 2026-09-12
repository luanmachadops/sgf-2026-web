import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {setupQuoteProcurement,login,id,admin,outsider,tenant,department,quote,quoteItem,order,procurementItem,allocation,price,otherDepartment,workshop,instrument} from './workshop-quote-procurement-fixture.mjs';

let db;
before(async()=>{db=await setupQuoteProcurement();await login(db);});
after(async()=>db?.close());
async function isolated(fn){await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}}
async function rejected(fn,pattern=/.+/){await db.exec('savepoint invalid');await assert.rejects(fn,pattern);await db.exec('rollback to savepoint invalid');}
const link=(patch={})=>({quote_item_id:quoteItem,procurement_item_id:procurementItem,allocation_id:allocation,...patch});
async function save(links=[link()],reason='Vínculo conferido com contrato') {return db.query('select public.set_quote_procurement_links($1,$2::jsonb,$3)',[quote,JSON.stringify(links),reason]);}
async function prepareReceived(){
 await save();
 await db.query('select public.manager_review_service_order_quote($1,true,$2)',[quote,'Aprovação']);
 await db.exec('reset role');
 await db.query("update public.service_orders set operational_status='ready',financial_status='committed' where id=$1",[order]);
 await login(db);
 await db.query('select public.manager_receive_service_order_vehicle($1)',[order]);
}
const invoicePath=`repair_shops/${tenant}/${workshop}/service_orders/${order}/invoices/nf-teste.pdf`;

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
 const reservation=(await db.query('select state,reserved_quantity,reserved_unit_price,reserved_amount,committed_quantity,committed_amount from public.service_order_quote_procurement_reservations where quote_item_id=$1',[quoteItem])).rows[0];
 assert.deepEqual({...reservation,reserved_quantity:Number(reservation.reserved_quantity),reserved_unit_price:Number(reservation.reserved_unit_price),reserved_amount:Number(reservation.reserved_amount),committed_quantity:Number(reservation.committed_quantity),committed_amount:Number(reservation.committed_amount)},{state:'reserved',reserved_quantity:2,reserved_unit_price:25,reserved_amount:50,committed_quantity:2,committed_amount:50});
 assert.equal((await db.query("select count(*)::int n from public.procurement_registry_events where kind='workshop_reservation'")).rows[0].n,1);
}));

test('aprovação recusa quantidade ou teto já comprometidos por outra reserva',()=>isolated(async()=>{
 await save();await db.exec('reset role');await db.query('update public.procurement_items set quantity=1 where id=$1',[procurementItem]);await login(db);
 await rejected(()=>db.query('select public.manager_review_service_order_quote($1,true,$2)',[quote,'Aprovação']),/Quantidade contratual insuficiente/);
 await db.exec('reset role');await db.query('update public.procurement_items set quantity=100 where id=$1',[procurementItem]);await db.query('insert into public.procurement_station_reservations(operation_id,allocation_id,committed_amount) values($1,$2,560)',[id(901),allocation]);await login(db);
 await rejected(()=>db.query('select public.manager_review_service_order_quote($1,true,$2)',[quote,'Aprovação']),/Teto da dotação insuficiente/);
}));

test('cancelamento libera a reserva e impede reduzir teto enquanto ela está comprometida',()=>isolated(async()=>{
 await save();await db.query('select public.manager_review_service_order_quote($1,true,$2)',[quote,'Aprovação']);await db.exec('reset role');
 await rejected(()=>db.query('update public.instrument_budget_allocations set spending_limit=49 where id=$1',[allocation]),/Teto inferior ao valor comprometido/);
 await login(db);await db.query('select public.manager_cancel_service_order($1,$2)',[order,'Cancelamento de teste']);await db.exec('reset role');
 const reservation=(await db.query('select state,committed_quantity,committed_amount from public.service_order_quote_procurement_reservations where quote_item_id=$1',[quoteItem])).rows[0];
 assert.deepEqual({...reservation,committed_quantity:Number(reservation.committed_quantity),committed_amount:Number(reservation.committed_amount)},{state:'released',committed_quantity:0,committed_amount:0});
 await db.query('update public.instrument_budget_allocations set spending_limit=0 where id=$1',[allocation]);
 assert.equal((await db.query('select operational_status from public.service_orders where id=$1',[order])).rows[0].operational_status,'cancelled');
}));

test('recebimento converte a reserva em realização e preserva a evidência contratual',()=>isolated(async()=>{
 await save();await db.query('select public.manager_review_service_order_quote($1,true,$2)',[quote,'Aprovação']);await db.exec('reset role');
 await rejected(()=>db.query("update public.service_orders set operational_status='received' where id=$1",[order]),/Realize as reservas/);
 await db.query("update public.service_orders set operational_status='ready',financial_status='committed' where id=$1",[order]);await login(db);
 await db.query('select public.manager_receive_service_order_vehicle($1)',[order]);await db.exec('reset role');
 const reservation=(await db.query('select state,reserved_amount,committed_amount from public.service_order_quote_procurement_reservations where quote_item_id=$1',[quoteItem])).rows[0];
 assert.deepEqual({...reservation,reserved_amount:Number(reservation.reserved_amount),committed_amount:Number(reservation.committed_amount)},{state:'realized',reserved_amount:50,committed_amount:50});
 await rejected(()=>db.query('update public.service_order_quote_items set qty=3 where id=$1',[quoteItem]),/reserva não pode ser alterado/);
 assert.equal((await db.query('select operational_status from public.service_orders where id=$1',[order])).rows[0].operational_status,'received');
}));

test('nota fiscal atual mapeia os itens realizados e o ateste registra glosa auditável',()=>isolated(async()=>{
 await prepareReceived();
 const invoiceId=(await db.query('select public.repair_shop_submit_invoice_v2($1,$2,$3,$4,$5) id',[order,'NF-5D4',50,invoicePath,'2026-09-12'])).rows[0].id;
 await db.exec('reset role');
 const line=(await db.query('select quote_item_id,delivered_quantity,unit_price,line_amount from public.service_order_invoice_items where invoice_id=$1',[invoiceId])).rows[0];
 assert.equal(line.quote_item_id,quoteItem);assert.equal(Number(line.delivered_quantity),2);assert.equal(Number(line.unit_price),25);assert.equal(Number(line.line_amount),50);
 await login(db);await db.query('select public.manager_attest_service_order_invoice_v2($1,$2,$3)',[invoiceId,5,'Divergência de item conferida']);await db.exec('reset role');
 const invoice=(await db.query('select attested_at,attested_amount,glosa_amount,attestation_note from public.service_order_invoices where id=$1',[invoiceId])).rows[0];
 assert.ok(invoice.attested_at);assert.equal(Number(invoice.attested_amount),45);assert.equal(Number(invoice.glosa_amount),5);assert.equal(invoice.attestation_note,'Divergência de item conferida');
 assert.equal((await db.query("select count(*)::int n from public.procurement_registry_events where kind='workshop_invoice'")).rows[0].n,1);
 assert.match((await db.query("select note from public.service_order_events where service_order_id=$1 and note like 'NF %glosa%'",[order])).rows[0].note,/glosa/);
 await login(db);await rejected(()=>db.query('select public.manager_register_service_order_payment($1,$2,$3,$4,$5)',[order,46,invoiceId,'2026-09-12','Pagamento']),/saldo atestado/);
 assert.equal((await db.query('select public.manager_register_service_order_payment($1,$2,$3,$4,$5)',[order,45,invoiceId,'2026-09-12','Pagamento final'])).rows[0].manager_register_service_order_payment,true);
 await db.exec('reset role');
 const paid=(await db.query('select financial_status,cost from public.service_orders where id=$1',[order])).rows[0];assert.equal(paid.financial_status,'paid');assert.equal(Number(paid.cost),45);
}));

test('nota itemizada rejeita valor divergente, excesso e arquivo fora da OS sem gravação parcial',()=>isolated(async()=>{
 await prepareReceived();
 await rejected(()=>db.query('select public.repair_shop_submit_invoice_v3($1,$2,$3,$4,$5,$6)',[order,'NF-ERR',49,invoicePath,'2026-09-12',JSON.stringify([{quote_item_id:quoteItem,quantity:2}])]),/soma dos itens/);
 await rejected(()=>db.query('select public.repair_shop_submit_invoice_v3($1,$2,$3,$4,$5,$6)',[order,'NF-ERR',75,invoicePath,'2026-09-12',JSON.stringify([{quote_item_id:quoteItem,quantity:3}])]),/excede a reserva/);
 await rejected(()=>db.query('select public.repair_shop_submit_invoice_v3($1,$2,$3,$4,$5,$6)',[order,'NF-ERR',50,'repair_shops/outro/service_orders/x/invoices/nf.pdf','2026-09-12',JSON.stringify([{quote_item_id:quoteItem,quantity:2}])]),/não pertence/);
 await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from public.service_order_invoices')).rows[0].n,0);
}));

test('conciliação fiscal separa teto, execução e marcos da oficina',()=>isolated(async()=>{
 await prepareReceived();
 const invoiceId=(await db.query('select public.repair_shop_submit_invoice_v2($1,$2,$3,$4,$5) id',[order,'NF-6A',50,invoicePath,'2026-09-12'])).rows[0].id;
 await login(db);await db.query('select public.manager_attest_service_order_invoice_v2($1,$2,$3)',[invoiceId,5,'Glosa conferida']);
 await db.query('select public.manager_register_service_order_payment($1,$2,$3,$4,$5)',[order,45,invoiceId,'2026-09-12','Pagamento']);
 const row=(await db.query('select * from public.get_procurement_fiscal_reconciliation($1,$2,$3)',[new Date().getUTCFullYear(),null,null])).rows.find(value=>value.allocation_id===allocation);
 assert.ok(row);
 assert.equal(Number(row.planned_limit),600);
 assert.equal(Number(row.reserved_amount),0);
 assert.equal(Number(row.realized_amount),50);
 assert.equal(Number(row.consumed_amount),50);
 assert.equal(Number(row.remaining_amount),550);
 assert.equal(Number(row.invoiced_amount),50);
 assert.equal(Number(row.attested_amount),45);
 assert.equal(Number(row.paid_amount),45);
}));

test('fila de conciliação mantém o ledger legado sem atribuição automática',()=>isolated(async()=>{
 await db.exec('reset role');
 const contract=id(901),source=id(902);
 await db.query(`insert into public.budget_contracts(id,tenant_id,category,reference,fiscal_year,starts_on,ends_on,total_limit)
   values($1,$2,'fuel','Contrato legado 6A',$3,$4,$5,1000)`,[contract,tenant,new Date().getUTCFullYear(),`${new Date().getUTCFullYear()}-01-01`,`${new Date().getUTCFullYear()}-12-31`]);
 await db.query(`insert into public.budget_allocations(contract_id,department_id,spending_limit,appropriation,funding_source)
   values($1,$2,1000,'3.3.90.30','1500')`,[contract,department]);
 await db.query(`insert into public.budget_entries(source_type,source_id,contract_id,department_id,partner_id,reserved,realized,disputed,source_status)
   values('fuelings',$1,$2,$3,$4,20,30,0,'validado')`,[source,contract,department,id(7)]);
 await login(db);
 const rows=(await db.query('select * from public.get_procurement_legacy_reconciliation($1,$2)',[new Date().getUTCFullYear(),null])).rows;
 const row=rows.find(value=>value.source_id===source);
 assert.ok(row);assert.equal(row.reconciliation_status,'pending');assert.equal(Number(row.consumed_amount),50);assert.equal(row.department_id,department);
}));

test('conciliação assistida exige vínculo explícito, documento, limite e idempotência auditada',()=>isolated(async()=>{
 await db.exec('reset role');
 const contract=id(903),source=id(904);
 await db.query(`insert into public.budget_contracts(id,tenant_id,category,reference,fiscal_year,starts_on,ends_on,total_limit)
   values($1,$2,'fuel','Contrato legado 6B',$3,$4,$5,1000)`,[contract,tenant,new Date().getUTCFullYear(),`${new Date().getUTCFullYear()}-01-01`,`${new Date().getUTCFullYear()}-12-31`]);
 await db.query(`insert into public.budget_allocations(contract_id,department_id,spending_limit,appropriation,funding_source)
   values($1,$2,1000,'3.3.90.30','1500')`,[contract,department]);
 await db.query(`insert into public.budget_entries(source_type,source_id,contract_id,department_id,partner_id,reserved,realized,disputed,source_status)
   values('fuelings',$1,$2,$3,$4,10,35,5,'validado')`,[source,contract,department,id(7)]);
 await login(db);
 const documents=JSON.stringify([{label:'Nota de empenho',url:'https://documentos.example.gov.br/nota-6b.pdf'}]);
 await rejected(()=>db.query('select public.reconcile_procurement_legacy_entry($1,$2,$3,$4,$5,$6::jsonb)', ['fuelings',source,instrument,allocation,'',documents]),/justificativa/);
 const first=(await db.query('select public.reconcile_procurement_legacy_entry($1,$2,$3,$4,$5,$6::jsonb) id',['fuelings',source,instrument,allocation,'Conferência do empenho e da nota fiscal',documents])).rows[0].id;
 const second=(await db.query('select public.reconcile_procurement_legacy_entry($1,$2,$3,$4,$5,$6::jsonb) id',['fuelings',source,instrument,allocation,'Conferência do empenho e da nota fiscal',documents])).rows[0].id;
 assert.equal(first,second);
 await db.exec('reset role');
 const mapping=(await db.query('select source_type,amount_at_reconciliation,justification from public.procurement_legacy_reconciliations where id=$1',[first])).rows[0];
 assert.equal(mapping.source_type,'fuelings');assert.equal(Number(mapping.amount_at_reconciliation),50);assert.match(mapping.justification,/Conferência/);
 assert.equal((await db.query("select count(*)::int n from public.procurement_registry_events where kind='legacy_reconciliation'")).rows[0].n,1);
 await login(db);
 assert.equal((await db.query('select count(*)::int n from public.get_procurement_legacy_reconciliation($1,$2) where source_id=$3',[new Date().getUTCFullYear(),null,source])).rows[0].n,0);
 const total=(await db.query('select * from public.get_procurement_reconciled_legacy_totals($1,$2,$3)',[new Date().getUTCFullYear(),instrument,null])).rows.find(row=>row.allocation_id===allocation);
 assert.ok(total);assert.equal(Number(total.legacy_reconciled_amount),50);
}));

test('sessão, permissões e tabelas internas permanecem restritas',()=>isolated(async()=>{
  await login(db,outsider);await rejected(()=>db.query('select public.get_quote_procurement_candidates($1)',[quote]),/Sessão|permissão|licitações/);
  await db.exec('reset role');const status=(await db.query("select relrowsecurity,has_table_privilege('authenticated','public.service_order_quote_item_procurement_links','select') direct,has_function_privilege('anon','public.set_quote_procurement_links(uuid,jsonb,text)'::regprocedure,'execute') anon from pg_class where oid='public.service_order_quote_item_procurement_links'::regclass")).rows[0];assert.equal(status.relrowsecurity,true);assert.equal(status.direct,false);assert.equal(status.anon,false);
  const ledger=(await db.query("select relrowsecurity,has_table_privilege('authenticated','public.service_order_quote_procurement_reservations','select') direct from pg_class where oid='public.service_order_quote_procurement_reservations'::regclass")).rows[0];assert.equal(ledger.relrowsecurity,true);assert.equal(ledger.direct,false);
  const invoiceItems=(await db.query("select relrowsecurity,has_table_privilege('authenticated','public.service_order_invoice_items','select') direct from pg_class where oid='public.service_order_invoice_items'::regclass")).rows[0];assert.equal(invoiceItems.relrowsecurity,true);assert.equal(invoiceItems.direct,false);
  const functions=(await db.query("select prosecdef,has_function_privilege('anon',oid,'execute') anon from pg_proc where oid in ('public.get_quote_procurement_candidates(uuid)'::regprocedure,'public.set_quote_procurement_links(uuid,jsonb,text)'::regprocedure)")).rows;assert.equal(functions.length,2);for(const fn of functions){assert.equal(fn.prosecdef,false);assert.equal(fn.anon,false);}
  const reports=(await db.query("select has_function_privilege('authenticated','public.get_procurement_fiscal_reconciliation(integer,uuid,uuid)'::regprocedure,'execute') granted,has_function_privilege('anon','public.get_procurement_fiscal_reconciliation(integer,uuid,uuid)'::regprocedure,'execute') anon")).rows[0];assert.equal(reports.granted,true);assert.equal(reports.anon,false);
  const reconciliation=(await db.query("select relrowsecurity,has_table_privilege('authenticated','public.procurement_legacy_reconciliations','select') direct,has_function_privilege('authenticated','public.reconcile_procurement_legacy_entry(text,uuid,uuid,uuid,text,jsonb)'::regprocedure,'execute') granted,has_function_privilege('anon','public.reconcile_procurement_legacy_entry(text,uuid,uuid,uuid,text,jsonb)'::regprocedure,'execute') anon from pg_class where oid='public.procurement_legacy_reconciliations'::regclass")).rows[0];assert.equal(reconciliation.relrowsecurity,true);assert.equal(reconciliation.direct,false);assert.equal(reconciliation.granted,true);assert.equal(reconciliation.anon,false);
}));
