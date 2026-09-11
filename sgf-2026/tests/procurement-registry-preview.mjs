import { setupWorkflow } from './procurement-workflow-fixture.mjs';
// Local-only UI fixture: real page + RPC adapter + in-memory PostgreSQL. No cloud credentials.
// Run: node tests/procurement-registry-preview.mjs; open http://127.0.0.1:5184
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setup, id, admin, tenant, station, workshop, department } from './department-budget-fixture.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
const web = fileURLToPath(new URL('../web/', import.meta.url));
const db = await setup(true);
for (const migration of ['20260910152227_procurement_registry.sql', '20260910211314_procurement_items_prices.sql', '20260911021152_instrument_budget_planning.sql', '20260911022956_procurement_preflight.sql', '20260911023848_procurement_fuel_reservations.sql', '20260911105457_procurement_fuel_classification.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
await db.exec(`select set_config('app.uid','',false);
  alter table public.fuel_stations add column name text default 'Posto municipal teste';
  alter table public.repair_shops add column name text default 'Oficina mecânica teste';
  update public.profiles set allowed_modules=array['procurement','budgets','refuelings'] where id='${admin}';
  update auth.sessions set created_at=clock_timestamp()+interval '1 second' where id='${id(99)}';
  select set_config('app.uid','${admin}',false); set role authenticated;`);
await setupWorkflow(db);
await db.exec(`select set_config('app.uid','${admin}',false); set role authenticated;`);
if (process.argv.includes('--seed-items') || process.argv.includes('--seed-preflight')) {
  const save = async (kind, payload) => (await db.query('select public.save_procurement_registry($1,$2::jsonb) id', [kind, JSON.stringify(payload)])).rows[0].id;
  const processId = await save('process', { reference: 'Pregão de teste 01', year: 2026, object: 'Combustíveis e serviços para frota', modality: 'Pregão eletrônico', legal_basis: 'Lei 14.133/2021', documents: [], reason: 'Fixture local de itens' });
  const payload = { process_id: processId, reference: '01', year: 2026, kind: 'ata', starts_on: '2026-01-01', ends_on: '2026-12-31', declared_value: 10000, partners: [`posto:${station}`, `oficina:${workshop}`], documents: [], reason: 'Fixture local de itens' };
  const ataId = await save('instrument', payload);
  const contractId = await save('instrument', { ...payload, kind: 'contract', origin_ata_id: ataId });
  if (process.argv.includes('--seed-preflight')) {
    for (const instrument of [ataId,contractId]) {
      await db.query('select public.save_instrument_budget($1::jsonb)',[JSON.stringify({instrument_id:instrument,fiscal_year:2026,total_limit:10000,document_reference:'Ato fictício',reason:'Teste local',allocations:[{department_id:department,category:'fuel',spending_limit:600,appropriation:'03.01.3.3.90.30',funding_source:'001500',simam_code:''}]})]);
    }
    await db.exec('reset role');
    await db.query("insert into public.procurement_fuel_rollouts values($1,true,'Homologação fictícia local')",[contractId]);
    await db.query("insert into public.station_commitments(station_id,amount,status,valid_from,valid_until,issued_on) values($1,10000,'ativo',current_date,current_date+7,current_date)",[station]);
    await db.exec('set role authenticated');
    let origin=null;
    for (const instrument of [ataId,contractId]) {
      const item=(await db.query('select public.save_procurement_item($1::jsonb) id',[JSON.stringify({instrument_id:instrument,reference:'Diesel',description:'Diesel para frota',category:'fuel',fuel_code:'diesel',unit:'L',quantity:100,partner_kind:'posto',partner_id:station,origin_item_id:origin,reason:'Teste local'})])).rows[0].id;
      await db.query('select public.save_procurement_price($1::jsonb)',[JSON.stringify({item_id:item,version:1,effective_on:'2026-01-01',pricing_mode:'unit',unit_price:5.123456,discount_percent:null,table_reference:null,document_reference:'Tabela fictícia',reason:'Teste local'})]);
      origin=item;
    }
  }
}
const rpc = {
  issue_procurement_fueling: p => db.query('select public.issue_procurement_fueling($1,$2::jsonb) data',[p.p_request,JSON.stringify(p.p_payload)]),
  preview_procurement_operation: p => db.query('select public.preview_procurement_operation($1::jsonb) data', [JSON.stringify(p.p_payload)]),
  get_instrument_budgets: p => db.query('select public.get_instrument_budgets($1,$2,$3) data', [p.p_year, p.p_instrument ?? null, p.p_offset ?? 0]),
  save_instrument_budget: p => db.query('select public.save_instrument_budget($1::jsonb) data', [JSON.stringify(p.p_payload)]),
  get_instrument_budget_events: p => db.query('select public.get_instrument_budget_events($1,$2) data', [p.p_plan, p.p_offset ?? 0]),
  get_procurement_items: p => db.query('select public.get_procurement_items($1,$2,$3,$4::date) data', [p.p_instrument, p.p_offset ?? 0, p.p_search ?? '', p.p_date ?? new Date().toISOString().slice(0,10)]),
  get_procurement_prices: p => db.query('select public.get_procurement_prices($1,$2) data', [p.p_item, p.p_offset ?? 0]),
  save_procurement_item: p => db.query('select public.save_procurement_item($1::jsonb) data', [JSON.stringify(p.p_payload)]),
  save_procurement_price: p => db.query('select public.save_procurement_price($1::jsonb) data', [JSON.stringify(p.p_payload)]),
  get_procurement_registry: p => db.query('select public.get_procurement_registry($1,$2,$3,$4) data', [p.p_kind, p.p_process ?? null, p.p_offset ?? 0, p.p_search ?? '']),
  save_procurement_registry: p => db.query('select public.save_procurement_registry($1,$2::jsonb) data', [p.p_kind, JSON.stringify(p.p_payload)]),
  get_procurement_registry_events: p => db.query('select public.get_procurement_registry_events($1,$2) data', [p.p_process, p.p_offset ?? 0]),
  get_procurement_registry_partners: () => db.query('select public.get_procurement_registry_partners() data'),
};
const server = await createServer({
  root: web, configFile: `${web}vite.config.ts`,
  optimizeDeps: { entries: ['src/pages/ProcurementRegistry.tsx'] },
  server: { host: '127.0.0.1', port: 5184, strictPort: true },
  plugins: [{
    name: 'local-procurement-fixture', enforce: 'pre',
    resolveId(source, importer) {
      if (source.includes('hooks/useDrivers')) return '\0preview-drivers';
      if (source.includes('hooks/useRefuelings')) return '\0preview-refuelings';
      if (source.endsWith('/supabase-api')) return '\0preview-options';
      if (source.endsWith('/procurement-api')) return '\0preview-alerts';
      if (source.endsWith('/station-closing-api')) return '\0preview-commitment';
      if (source.includes('contexts/AuthContext')) return '\0preview-auth';
      if (source === './supabase' && (importer?.endsWith('procurement-registry-api.ts') || importer?.endsWith('procurement-items-api.ts') || importer?.endsWith('instrument-budget-api.ts'))) return '\0preview-rpc';
      if (source === '/preview-entry.js') return '\0preview-entry';
    },
    load(source) {
      if(source==='\0preview-drivers') return `export const useDrivers=()=>({data:[{id:'${id(51)}',name:'Motorista de teste',full_name:'Motorista de teste'}],isLoading:false});`;
      if(source==='\0preview-refuelings') return `import {useMutation} from '@tanstack/react-query'; export const useCreateFuelAuthorization=()=>useMutation({mutationFn:async input=>{const response=await fetch('/fixture-rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'issue_procurement_fueling',args:{p_request:input.procurement.requestId,p_payload:{item_id:input.procurement.itemId,allocation_id:input.procurement.allocationId,vehicle_id:input.vehicle_id,driver_id:input.driver_id,quantity:input.max_liters,expires_at:input.expires_at,note:input.notes}}})});const result=await response.json();if(result.error)throw new Error(result.error.message);return result.data;}});`;
      if(source==='\0preview-options') return `export const vehicleDocumentsApi=new Proxy({}, {get:()=>async()=>[]});export const driversApi=new Proxy({}, {get:()=>async()=>[]});export const tripsApi=new Proxy({}, {get:()=>async()=>[]});export const mapApi=new Proxy({}, {get:()=>async()=>[]});export const infractionsApi=new Proxy({}, {get:()=>async()=>[]});export const refuelingsApi=new Proxy({}, {get:()=>async()=>[]});export const maintenancesApi=new Proxy({}, {get:()=>async()=>[]});export const checklistsApi=new Proxy({}, {get:()=>async()=>[]});export const settingsApi=new Proxy({}, {get:()=>async()=>[]});export const tenantApi=new Proxy({}, {get:()=>async()=>[]});export const departmentsApi=new Proxy({}, {get:()=>async()=>[]});export const dashboardApi=new Proxy({}, {get:()=>async()=>[]});export const userProfileApi=new Proxy({}, {get:()=>async()=>[]});export const notificationsApi=new Proxy({}, {get:()=>async()=>[]});export const repairShopsApi=new Proxy({}, {get:()=>async()=>[]});export const serviceOrderFiscalApi=new Proxy({}, {get:()=>async()=>[]});export const dashboardSummaryApi=new Proxy({}, {get:()=>async()=>[]});export const vehiclesApi={getAll:async()=>[{id:'${id(6)}',plate:'AAA1234',brand:'Marca',model:'Modelo',tank_capacity:100,fuel_type:'DIESEL'}]};export const stationsApi={getAll:async()=>[{id:'${station}',name:'Posto de teste',is_active:true,fuel_prices:{Diesel:99}}]};`;
      if(source==='\0preview-alerts') return `export const procurementApi={getAlerts:async()=>[]};`;
      if(source==='\0preview-commitment') return `export const stationClosingApi={getCommitmentBalance:async()=>10000};`;
      if (source === '\0preview-auth') return `export const useAuth=()=>({user:{id:'${admin}',tenantId:'${tenant}',accountRole:'admin',allowedModules:['procurement','budgets','refuelings']}});`;
      if (source === '\0preview-rpc') return `export const supabase={rpc:async(name,args={})=>(await fetch('/fixture-rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})})).json()};`;
      if (source === '\0preview-entry') return `import React from 'react'; import {Toaster} from 'sonner'; import {createRoot} from 'react-dom/client'; import {BrowserRouter} from 'react-router-dom'; import {QueryClient,QueryClientProvider} from '@tanstack/react-query'; import {HeaderProvider} from '/src/contexts/HeaderContext.tsx'; import Registry from '/src/pages/ProcurementRegistry.tsx'; import '/src/index.css'; createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false}}})},React.createElement(BrowserRouter,null,React.createElement(HeaderProvider,null,React.createElement('main',{className:'mx-auto max-w-6xl p-6'},React.createElement(Registry),React.createElement(Toaster))))));`;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/fixture-rpc' && req.method === 'POST') {
          let body = ''; for await (const chunk of req) body += chunk;
          res.setHeader('Content-Type', 'application/json');
          try {
            const { name, args } = JSON.parse(body);
            if (!Object.hasOwn(rpc, name)) throw new Error('RPC desconhecida');
            const result = await rpc[name](args);
            res.end(JSON.stringify({ data: result.rows[0].data, error: null }));
          } catch (error) { res.end(JSON.stringify({ data: null, error: { message: error.message, code: error.code } })); }
        } else if (req.url === '/' || req.url?.startsWith('/licitacoes')) {
          const html = await server.transformIndexHtml('/', '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Teste local de licitações</title></head><body><div id="root"></div><script type="module" src="/preview-entry.js"></script></body></html>');
          res.setHeader('Content-Type', 'text/html'); res.end(html);
        } else next();
      });
    },
  }],
});
await server.listen();
console.info('Fixture local: http://127.0.0.1:5184');
