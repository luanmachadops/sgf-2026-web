// Local-only form verification with fictitious auth and a SQL-backed submission adapter.
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {fileURLToPath} from 'node:url';
import {setupQuotes,login,order} from './workshop-quote-classification-fixture.mjs';
const db=await setupQuotes();await login(db);
const root=fileURLToPath(new URL('../web/',import.meta.url));
const server=await createServer({root,configFile:`${root}vite.config.ts`,server:{host:'127.0.0.1',port:5185,strictPort:true},plugins:[{
 name:'workshop-quote-local-preview',enforce:'pre',
 resolveId(source){if(source.endsWith('workshop-portal-api')||source.endsWith('workshop-portal-api.ts'))return '\0quote-api';if(source==='/quote-entry.js')return '\0quote-entry';},
 load(source){
 if(source==='\0quote-api')return `export const workshopPortalApi={submitQuote:async input=>{const r=await fetch('/quote-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const data=await r.json();if(!r.ok)throw new Error(data.error);return data.id;}};`;
 if(source==='\0quote-entry')return `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {QuoteModal} from '/src/components/partners/workshop/QuoteModal.tsx';import '/src/index.css';function App(){const[done,setDone]=useState(false);return done?React.createElement('p',{role:'status'},'Orçamento classificado enviado com sucesso ao banco local.'):React.createElement(QuoteModal,{order:{orderId:'${order}',plate:'TESTE01',brand:'Marca',model:'Veículo fictício'},onClose:()=>{},onSuccess:()=>setDone(true)});}createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{client:new QueryClient()},React.createElement(App)));`;
 },
 configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/',`<html lang="pt-BR"><head><meta charset="utf-8"><title>Orçamento de oficina — teste local</title></head><body><div id="root"></div><script type="module" src="/quote-entry.js"></script></body></html>`));return;}
 if(req.url!=='/quote-test'||req.method!=='POST'){next();return;}
 try{let body='';for await(const part of req)body+=part;const input=JSON.parse(body);const items=input.items.map(i=>({kind:i.kind,description:i.description,qty:i.qty,unit_price:i.unitPrice,unit:i.unit,category:i.category}));const result=await db.query('select public.repair_shop_submit_quote_v3($1,$2::jsonb,$3::date,$4) id',[input.orderId,JSON.stringify(items),input.validUntil,input.note]);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result.rows[0]));}
 catch(error){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.message}));}
 });}
}]});await server.listen();console.log('Prévia fictícia: http://127.0.0.1:5185');
