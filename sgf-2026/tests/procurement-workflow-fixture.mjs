import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import {id,tenant,station} from './department-budget-fixture.mjs';
const operator=id(50),driver=id(51);
async function sqlFunction(file,name){const text=await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8');const start=text.indexOf(`create or replace function public.${name}(`);const end=text.indexOf('$$;',text.indexOf('as $$',start))+3;assert.ok(start>=0&&end>start);return text.slice(start,end);}
export async function setupWorkflow(db){
 await db.exec(`reset role;select set_config('app.uid','',false);
 alter table public.vehicles add column status text default 'disponivel',add column fuel_type text default 'diesel',add column current_odometer integer default 100,add column plate text default 'AAA1234',add column brand text default 'Marca',add column model text default 'Modelo';
 alter table public.fuel_stations add column is_active boolean default true,add column fuel_types text[] default array['Diesel'],add column contract_value numeric default 1;
 alter table public.profiles add column station_id uuid;
 alter table public.fuelings add column driver_id uuid,add column authorized_by uuid,add column authorization_note text,add column odometer integer,add column pump_receipt_number text,add column photo_pump_url text,add column filled_by uuid,add column has_anomaly boolean,add column anomaly_type text;
 create schema storage;create table storage.objects(bucket_id text,name text);
 create table public.station_commitments(id uuid default gen_random_uuid(),station_id uuid,amount numeric,status text,valid_from date,valid_until date,issued_on date);
 insert into public.profiles(id,tenant_id,role,full_name,allowed_modules,station_id) values('${operator}','${tenant}','posto','Operador',array['refuelings','stations'],'${station}'),('${driver}','${tenant}','motorista','Motorista',array['refuelings'],null);
 insert into auth.sessions(id,user_id,created_at) values('${operator}','${operator}',clock_timestamp()+interval '1 second');
 create function public.partner_read_context() returns table(profile_id uuid,tenant_id uuid,kind text,partner_id uuid,partner_name text) language sql security definer as $$ select p.id,p.tenant_id,p.role,p.station_id,p.full_name from public.profiles p where p.id=auth.uid() and p.role='posto' $$;
 create function public.partner_complete_fueling_v2(uuid,numeric,integer,text,text) returns table(fueling_id uuid,total_cost numeric,price_per_liter numeric) language sql as $$select $1,10::numeric,5::numeric$$;
 `);
 await db.exec(await sqlFunction('20260730003626_station_catalog_and_operations.sql','station_contract_usage'));
 await db.exec(await sqlFunction('20260730001044_procurement_contract_usage_breakdown.sql','station_contract_committed'));
 await db.exec(await sqlFunction('20260726162437_procurement_partner_dashboards.sql','enforce_station_contract_budget'));
 await db.exec(await sqlFunction('20260726162437_procurement_partner_dashboards.sql','get_station_pending_authorizations'));
 await db.exec(await sqlFunction('20260730003629_station_fiscal_flow.sql','station_commitment_total_available'));
 await db.exec(await sqlFunction('20260804004633_fix_realtime_and_station_commitment_date.sql','tg_require_station_commitment'));
 await db.exec(`create trigger trg_enforce_station_contract_budget before insert on public.fuelings for each row execute function public.enforce_station_contract_budget();create trigger trg_fuelings_require_commitment before insert on public.fuelings for each row execute function public.tg_require_station_commitment();`);
 await db.exec(await readFile(new URL('../supabase/migrations/20260911105731_procurement_fuel_workflow.sql',import.meta.url),'utf8'));
}
