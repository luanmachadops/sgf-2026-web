import { readFile } from 'node:fs/promises';
export async function setupStationLedger(db){
 const source=await readFile(new URL('../supabase/migrations/20260730003626_station_catalog_and_operations.sql',import.meta.url),'utf8');
 await db.exec(source.slice(source.indexOf('create table public.station_catalog_items'),source.indexOf('create unique index station_catalog_items')));
 await db.exec(`alter table public.fuel_stations add column contract_start date,add column contract_end date;
 alter table public.station_operations alter column id set default gen_random_uuid(),alter column status set default 'autorizado';
 alter table public.station_operations add column catalog_item_id uuid references public.station_catalog_items(id),add column driver_id uuid,add column protocol text unique,add column item_kind text,add column item_name text,add column unit text,add column quantity numeric(12,3),add column odometer integer,add column authorized_by uuid,add column executed_by uuid,add column receipt_number text,add column evidence_path text,add column created_at timestamptz default now();`);
 const start=source.indexOf('  constraint station_operation_execution_complete');
 await db.exec('alter table public.station_operations add '+source.slice(start,source.indexOf('\n);',start)).replace(',\n  constraint station_operation_quantity_limit',',\n add constraint station_operation_quantity_limit'));
 await db.exec(await readFile(new URL('../supabase/migrations/20260911164848_procurement_station_reservations.sql',import.meta.url),'utf8'));
}

export async function setupStationWorkflow(db){
 await setupStationLedger(db);
 await db.exec(`alter table public.station_operations add column authorization_note text,add column updated_at timestamptz default now(),add column rejection_reason text,add column validated_by uuid,add column validated_at timestamptz;
 alter table storage.objects add column owner_id text;
 create function public.service_order_manager_context() returns table(profile_id uuid,tenant_id uuid,superadmin boolean) language sql security definer as $$ select p.id,p.tenant_id,false from public.profiles p where p.id=auth.uid() and p.role='admin' $$;
 create function public.partner_context() returns table(profile_id uuid,tenant_id uuid,kind text,partner_id uuid,partner_name text) language sql security definer as $$select * from public.partner_read_context()$$;
 create trigger trg_station_operations_require_commitment before insert on public.station_operations for each row execute function public.tg_require_station_commitment();`);
 const source=await readFile(new URL('../supabase/migrations/20260730003626_station_catalog_and_operations.sql',import.meta.url),'utf8');
 for(const name of ['manager_list_station_catalog','manager_create_station_operation','partner_get_pending_station_operations','partner_complete_station_operation','manager_get_station_operations','manager_review_station_operation']){
 const start=source.indexOf(`create or replace function public.${name}(`),end=source.indexOf('$$;',source.indexOf('as $$',start))+3;
 if(start<0||end<=start)throw new Error(`Missing fixture function ${name}`);
 await db.exec(source.slice(start,end));
 }
 await db.exec(await readFile(new URL('../supabase/migrations/20260911170412_procurement_station_workflow.sql',import.meta.url),'utf8'));
}
