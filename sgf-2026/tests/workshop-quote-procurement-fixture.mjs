import {readFile} from 'node:fs/promises';
import {setup,id,admin,outsider,tenant,department,otherDepartment,station,workshop,vehicle} from './department-budget-fixture.mjs';

export const order=id(801), quote=id(802), quoteItem=id(803), process=id(804), instrument=id(805), procurementItem=id(806), allocation=id(807), price=id(808);

async function sourceFunction(file, name) {
  const source=await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8');
  const start=source.indexOf(`create or replace function public.${name}(`);
  const end=source.indexOf('$$;',source.indexOf('as $$',start))+3;
  if(start<0||end<=start)throw new Error(`Função de fixture ausente: ${name}`);
  return source.slice(start,end);
}

export async function setupQuoteProcurement(db) {
  db=await setup(true,db);
  await db.exec(`reset role;select set_config('app.uid','',false);
    alter table public.profiles add column repair_shop_id uuid;
    alter table public.service_orders add column admin_note text;
    alter table public.service_orders add column completed_at timestamptz;
    alter table public.service_orders add column commitment_number text;
    create type public.service_order_fin_status as enum ('not_started','awaiting_commitment','committed','invoiced','attested','paid');
    create function public.get_user_tenant_id() returns uuid language sql stable as $$select tenant_id from public.profiles where id=auth.uid()$$;
    create function public.service_order_manager_context() returns table(profile_id uuid,tenant_id uuid,superadmin boolean)
      language sql security definer as $$select id,tenant_id,false from public.profiles where id=auth.uid() and role='admin'$$;
    create function public.partner_context() returns table(profile_id uuid,tenant_id uuid,kind text,partner_id uuid,partner_name text)
      language sql security definer as $$select p.id,p.tenant_id,'oficina'::text,p.repair_shop_id,null::text from public.profiles p where p.id=auth.uid()$$;
    create table public.service_order_events(id uuid default gen_random_uuid(),tenant_id uuid,service_order_id uuid,axis text,from_state text,to_state text,actor_id uuid,actor_role text,note text);
    alter table public.service_order_events add column attachment_path text;
    alter table public.service_order_events add column created_at timestamptz default now();
    create table public.service_order_invoices(
      id uuid primary key default gen_random_uuid(),tenant_id uuid not null,service_order_id uuid not null references public.service_orders(id),repair_shop_id uuid not null references public.repair_shops(id),invoice_number text not null,amount numeric(12,2) not null,issued_at date not null default current_date,file_path text,commitment_number text,attested_by uuid,attested_at timestamptz,created_at timestamptz default now(),unique(tenant_id,repair_shop_id,invoice_number)
    );
    create table public.service_order_payments(id uuid primary key default gen_random_uuid(),tenant_id uuid,service_order_id uuid,invoice_id uuid,amount numeric(12,2),paid_at date, note text,registered_by uuid);
    update public.profiles set repair_shop_id='${workshop}' where id='${admin}';
  `);
  for(const migration of ['20260910152227_procurement_registry.sql','20260910211314_procurement_items_prices.sql','20260911021152_instrument_budget_planning.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'));
  }
  await db.exec(`reset role;select set_config('app.uid','',false);
    update public.profiles set allowed_modules=array['procurement','budgets','maintenances','reports'] where id='${admin}';
    update auth.sessions set created_at=clock_timestamp()+interval '1 second' where id='${id(99)}';
  `);
  const partnerSchema=await readFile(new URL('../supabase/migrations/20260725204942_partner_portals_schema.sql',import.meta.url),'utf8');
  await db.exec(partnerSchema.slice(partnerSchema.indexOf('create table if not exists public.service_order_quotes'),partnerSchema.indexOf('-- ─── 5. Notas')));
  for (const name of ['manager_review_service_order_quote','manager_cancel_service_order','manager_receive_service_order_vehicle']) {
    await db.exec(await sourceFunction('20260726043806_maintenance_workflow_v2.sql',name));
  }
  await db.exec(await sourceFunction('20260726031428_workshop_portal_security.sql','repair_shop_submit_invoice_v2'));
  await db.exec(await sourceFunction('20260726043806_maintenance_workflow_v2.sql','manager_attest_service_order_invoice'));
  await db.exec(await sourceFunction('20260726043806_maintenance_workflow_v2.sql','manager_register_service_order_payment'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260911215046_workshop_quote_classification.sql',import.meta.url),'utf8'));
  await db.exec(`
    insert into public.service_orders(id,tenant_id,repair_shop_id,vehicle_id,operational_status,financial_status)
      values('${order}','${tenant}','${workshop}','${vehicle}','awaiting_quote_approval','not_started');
    insert into public.service_order_quotes(id,tenant_id,service_order_id,repair_shop_id,version,status,valid_until,total)
      values('${quote}','${tenant}','${order}','${workshop}',1,'enviado',current_date+7,50);
    insert into public.service_order_quote_items(id,quote_id,kind,description,qty,unit_price,unit,category)
      values('${quoteItem}','${quote}','peca','Filtro de óleo',2,25,'UN','parts');
    insert into public.procurement_processes(id,tenant_id,reference,year,object,modality,legal_basis)
      values('${process}','${tenant}','PE 01',extract(year from current_date),'Peças de manutenção','Pregão','Lei 14.133');
    insert into public.procurement_instruments(id,tenant_id,process_id,kind,reference,year,starts_on,ends_on,declared_value)
      values('${instrument}','${tenant}','${process}','contract','CT 01',extract(year from current_date),current_date-10,current_date+365,1000);
    insert into public.procurement_instrument_partners values('${instrument}','oficina','${workshop}');
    insert into public.procurement_items(id,instrument_id,reference,description,category,unit,quantity,partner_kind,partner_id)
      values('${procurementItem}','${instrument}','ITEM 1','Filtro de óleo contratado','parts','UN',100,'oficina','${workshop}');
    insert into public.procurement_item_prices(id,item_id,effective_on,pricing_mode,unit_price,document_reference,revision)
      values('${price}','${procurementItem}',current_date-1,'unit',30,'Tabela contratual',1);
    insert into public.instrument_budget_plans(id,instrument_id,fiscal_year,total_limit,document_reference)
      values('${id(809)}','${instrument}',extract(year from current_date),1000,'Planejamento anual');
    insert into public.instrument_budget_allocations(id,plan_id,department_id,category,spending_limit,appropriation,funding_source)
      values('${allocation}','${id(809)}','${department}','parts',600,'3.3.90.30','1500');
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20260912034547_workshop_quote_procurement_links.sql',import.meta.url),'utf8'));
  // 5D3 shares a dotação with the existing station reservation ledger. This
  // focused fixture only needs the columns referenced by the cross-ledger guard.
  await db.exec(`create table public.procurement_station_reservations(
    operation_id uuid primary key,
    allocation_id uuid not null references public.instrument_budget_allocations(id),
    committed_amount numeric(14,2) not null default 0
  );`);
  await db.exec(await readFile(new URL('../supabase/migrations/20260912040123_workshop_quote_reservations.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260912041412_workshop_invoice_attestation.sql',import.meta.url),'utf8'));
  // 6A reads the central fuel/station ledgers. Keep this focused fixture
  // minimal while preserving the columns needed by the read-only report.
  await db.exec(`
    create table public.procurement_fuel_reservations(
      fueling_id uuid primary key, tenant_id uuid, allocation_id uuid,
      state text not null default 'reserved', committed_amount numeric(14,2) not null default 0
    );
    alter table public.procurement_station_reservations
      add column tenant_id uuid,
      add column state text not null default 'reserved';
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20260912042702_procurement_fiscal_reconciliation.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260912044001_procurement_legacy_reconciliation.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260912152713_procurement_legacy_ceiling_integrity.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260912225722_procurement_fiscal_workshop_usage_fix.sql',import.meta.url),'utf8'));
  return db;
}

export async function login(db,user=admin){
  const session=user===admin?id(99):id(99);
  await db.query("select set_config('app.uid',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({role:'authenticated',sub:user,session_id:session})]);
  await db.exec('set role authenticated');
}

export {id,admin,outsider,tenant,department,otherDepartment,station,workshop,vehicle};
