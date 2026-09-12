import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  setupQuoteProcurement, login, tenant, workshop, order, quote, quoteItem, procurementItem, allocation,
} from './workshop-quote-procurement-fixture.mjs';

let db;
before(async () => {
  db = await setupQuoteProcurement();
  await login(db);
});
after(async () => db?.close());

async function prepareReceived() {
  await db.query('select public.set_quote_procurement_links($1,$2::jsonb,$3)', [quote, JSON.stringify([{ quote_item_id: quoteItem, procurement_item_id: procurementItem, allocation_id: allocation }]), 'Vínculo fiscal']);
  await db.query('select public.manager_review_service_order_quote($1,true,$2)', [quote, 'Aprovação']);
  await db.exec('reset role');
  await db.query("update public.service_orders set operational_status='ready',financial_status='committed' where id=$1", [order]);
  await login(db);
  await db.query('select public.manager_receive_service_order_vehicle($1)', [order]);
}

test('conciliação separa reserva realizada das duas notas parciais e rateia pagamento por nota', async () => {
  await db.exec('begin');
  try {
    await prepareReceived();
    const path = `repair_shops/${tenant}/${workshop}/service_orders/${order}/invoices/`;
    const payload = JSON.stringify([{ quote_item_id: quoteItem, quantity: 1 }]);
    const first = (await db.query('select public.repair_shop_submit_invoice_v3($1,$2,$3,$4,$5,$6::jsonb) id', [order, 'NF-PARCIAL-1', 25, `${path}1.pdf`, '2026-09-12', payload])).rows[0].id;
    await db.exec('reset role');
    await login(db);
    const second = (await db.query('select public.repair_shop_submit_invoice_v3($1,$2,$3,$4,$5,$6::jsonb) id', [order, 'NF-PARCIAL-2', 25, `${path}2.pdf`, '2026-09-12', payload])).rows[0].id;
    await db.query('select public.manager_attest_service_order_invoice_v2($1,0,$2)', [first, 'Primeira parcela']);
    await db.query('select public.manager_attest_service_order_invoice_v2($1,0,$2)', [second, 'Segunda parcela']);
    await db.query('select public.manager_register_service_order_payment($1,$2,$3,$4,$5)', [order, 25, first, '2026-09-12', 'Pagamento NF 1']);
    await db.query('select public.manager_register_service_order_payment($1,$2,$3,$4,$5)', [order, 25, second, '2026-09-12', 'Pagamento NF 2']);
    await db.exec('reset role');

    const row = (await db.query('select * from public.get_procurement_fiscal_reconciliation($1,$2,$3)', [new Date().getUTCFullYear(), null, null])).rows.find((value) => value.allocation_id === allocation);
    assert.ok(row);
    assert.equal(Number(row.realized_amount), 50);
    assert.equal(Number(row.invoiced_amount), 50);
    assert.equal(Number(row.attested_amount), 50);
    assert.equal(Number(row.paid_amount), 50);
  } finally {
    await db.exec('rollback');
  }
});
