import {readFile} from 'node:fs/promises';
import {setup,id,tenant,workshop,vehicle} from './department-budget-fixture.mjs';
export const operator=id(70),order=id(71);
export const unitItem={kind:'mao_de_obra',description:'Diagnóstico',qty:2,unit_price:25.123456,unit:'H',category:'labor'};
export async function setupQuotes(){
 const db=await setup(true);
 const source=await readFile(new URL('../supabase/migrations/20260725204942_partner_portals_schema.sql',import.meta.url),'utf8');
 const tables=source.slice(source.indexOf('create table if not exists public.service_order_quotes'),source.indexOf('-- ─── 5. Notas'));
 await db.exec(`reset role;select set_config('app.uid','',false);
 alter table public.profiles add column repair_shop_id uuid;
 create function public.get_user_tenant_id() returns uuid language sql stable as $$select tenant_id from public.profiles where id=auth.uid()$$;
 insert into public.profiles(id,tenant_id,role,full_name,repair_shop_id) values('${operator}','${tenant}','oficina','Oficina de teste','${workshop}');
 insert into auth.sessions(id,user_id,created_at) select id,id,clock_timestamp()+interval '1 second' from public.profiles;
 create function public.partner_context() returns table(profile_id uuid,tenant_id uuid,kind text,partner_id uuid) language sql security definer as $$select id,tenant_id,role,repair_shop_id from public.profiles where id=auth.uid()$$;
 create table public.service_order_events(id uuid default gen_random_uuid(),tenant_id uuid,service_order_id uuid,from_state text,to_state text,actor_id uuid,actor_role text,note text);
 insert into public.service_orders(id,tenant_id,repair_shop_id,vehicle_id,operational_status,financial_status) values('${order}','${tenant}','${workshop}','${vehicle}','at_shop','not_started');
 `);
 await db.exec(tables);
 // Historical item deliberately has no unit/category; never infer them from its kind.
 await db.exec(`insert into public.service_order_quotes(id,tenant_id,service_order_id,repair_shop_id,version,status) values('${id(72)}','${tenant}','${order}','${workshop}',1,'enviado');
 insert into public.service_order_quote_items(id,quote_id,kind,description,qty,unit_price) values('${id(73)}','${id(72)}','peca','Legado',1,10);`);
 await db.exec(await readFile(new URL('../supabase/migrations/20260911215046_workshop_quote_classification.sql',import.meta.url),'utf8'));
 return db;
}
export async function login(db,user=operator){await db.query("select set_config('app.uid',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({role:'authenticated',sub:user,session_id:user})]);await db.exec('set role authenticated');}
