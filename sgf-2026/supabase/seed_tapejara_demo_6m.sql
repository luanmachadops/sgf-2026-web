begin;

-- Carga idempotente de demonstração para a Prefeitura Municipal de Tapejara.
-- Todos os registros possuem IDs determinísticos e/ou o marcador DEMO-SEED-6M.

create temporary table _demo_ctx on commit drop as
select
  t.id as tenant_id,
  (select p.id from public.profiles p where p.tenant_id=t.id and p.role='motorista' and not p.access_blocked order by p.created_at limit 1) as driver_id,
  (select p.id from public.profiles p where p.tenant_id=t.id and p.role in ('gestor','admin') and not p.access_blocked order by case when p.role='gestor' then 0 else 1 end,p.created_at limit 1) as manager_id,
  (select p.id from public.profiles p where p.tenant_id=t.id and p.role='posto' and not p.access_blocked order by p.created_at limit 1) as station_user_id,
  (select s.id from public.fuel_stations s where s.tenant_id=t.id and s.is_active order by case when s.contract_value is not null then 0 else 1 end,s.created_at limit 1) as station_id,
  (select s.name from public.fuel_stations s where s.tenant_id=t.id and s.is_active order by case when s.contract_value is not null then 0 else 1 end,s.created_at limit 1) as station_name,
  (select r.id from public.repair_shops r where r.tenant_id=t.id and r.is_active order by r.created_at limit 1) as shop_1_id,
  (select r.id from public.repair_shops r where r.tenant_id=t.id and r.is_active order by r.created_at offset 1 limit 1) as shop_2_id
from public.tenants t
where t.slug='tapejara' and t.status='active';

do $$
declare c _demo_ctx%rowtype;
begin
  select * into c from _demo_ctx;
  if c.tenant_id is null then raise exception 'Tenant ativo de Tapejara não encontrado'; end if;
  if c.driver_id is null then raise exception 'Motorista ativo de Tapejara não encontrado'; end if;
  if c.manager_id is null then raise exception 'Gestor ou administrador de Tapejara não encontrado'; end if;
  if c.station_id is null or c.station_user_id is null then raise exception 'Posto ou usuário do posto de Tapejara não encontrado'; end if;
  if c.shop_1_id is null then raise exception 'Oficina ativa de Tapejara não encontrada'; end if;
end $$;

-- Evita alertas sonoros/push em massa enquanto o histórico é criado.
alter table public.fuelings disable trigger trg_notify_fueling;
alter table public.fuelings disable trigger trg_notify_station_partner;
alter table public.service_orders disable trigger trg_notify_service_order;
alter table public.service_orders disable trigger trg_notify_workshop_partner;
alter table public.issues disable trigger trg_notify_issue_created;
alter table public.issues disable trigger trg_issue_create_service_order;

-- Empenho vigente para validar lançamentos diretos e operações do posto.
insert into public.station_commitments
  (id,tenant_id,station_id,commitment_number,nad_number,amount,issued_on,valid_from,valid_until,document_path,status,registered_by,created_at)
select md5('DEMO-SEED-6M:TAPEJARA:COMMITMENT')::uuid,c.tenant_id,c.station_id,
       'DEMO-EMP-2026-001','DEMO-NAD-2026-001',1000000,'2026-01-05','2026-01-10','2026-12-31',
       'demo/tapejara/empenho-2026-001.pdf','ativo',c.manager_id,'2026-01-05 12:00+00'
from _demo_ctx c
on conflict (id) do nothing;

-- Item de ARLA para testar também as operações que não são abastecimento.
insert into public.station_catalog_items
  (id,tenant_id,station_id,code,kind,name,unit,unit_price,active,requires_odometer,created_at,updated_at)
select md5('DEMO-SEED-6M:TAPEJARA:ARLA')::uuid,c.tenant_id,c.station_id,
       'DEMO-ARLA-32','arla','ARLA 32 — demonstração','L',5.20,true,true,'2026-01-10 12:00+00','2026-01-10 12:00+00'
from _demo_ctx c
on conflict (id) do nothing;

-- 18 veículos claramente identificados, distribuídos por seis secretarias.
with dept as (
  select d.id,d.name,row_number() over(order by case d.code
    when 'OBRAS' then 1 when 'SAUDE' then 2 when 'EDUC' then 3 when 'ADM' then 4 when 'AGRO' then 5 when 'SOCIAL' then 6 else 99 end,d.name) rn
  from public.departments d join _demo_ctx c on c.tenant_id=d.tenant_id
  where d.code in ('OBRAS','SAUDE','EDUC','ADM','AGRO','SOCIAL')
), src as (
  select n,c.tenant_id,d.id department_id,d.name department_name,
         md5('DEMO-SEED-6M:TAPEJARA:VEHICLE:'||lpad(n::text,3,'0'))::uuid id
  from generate_series(1,18) n cross join _demo_ctx c
  join dept d on d.rn=((n-1)%6)+1
)
insert into public.vehicles
  (id,tenant_id,unit_code,qr_code,name,plate,brand,model,year,department,department_id,vehicle_type,current_odometer,fuel_level,status,fuel_type,tank_capacity,color,created_at)
select id,tenant_id,'DEMO-TAP-'||lpad(n::text,3,'0'),'DEMO-QR-TAP-'||lpad(n::text,3,'0'),
       '[DEMO] '||case n%3 when 0 then 'Caminhão operacional' when 1 then 'Veículo administrativo' else 'Van de atendimento' end,
       'D'||chr(65+((n-1)/10)::int)||'M'||(n%10)::text||'T'||lpad(n::text,2,'0'),
       case n%3 when 0 then 'Mercedes-Benz' when 1 then 'Fiat' else 'Renault' end,
       case n%3 when 0 then 'Atego 1719' when 1 then 'Strada' else 'Master' end,
       2022+(n%4),department_name,department_id,case n%3 when 0 then 'Caminhão' when 1 then 'Utilitário' else 'Van' end,
       5000+n*700,'75%','liberado',case n%3 when 0 then 'diesel'::public.fuel_type_enum when 1 then 'flex'::public.fuel_type_enum else 'diesel'::public.fuel_type_enum end,
       case n%3 when 0 then 150 when 1 then 55 else 100 end,'Branco','2026-01-15 12:00+00'
from src
on conflict (id) do nothing;

-- Checklists atuais mínimos exigidos pela regra de início de viagem.
insert into public.checklists (id,driver_id,vehicle_id,notes,created_at,quick_confirm,tenant_id)
select md5('DEMO-SEED-6M:TAPEJARA:CHECK-PRE:'||v.id)::uuid,c.driver_id,v.id,
       '[DEMO-SEED-6M] Checklist técnico de preparação da carga.',now()-interval '10 minutes',true,c.tenant_id
from public.vehicles v join _demo_ctx c on c.tenant_id=v.tenant_id
where v.unit_code like 'DEMO-TAP-%'
on conflict (id) do nothing;

-- 540 abastecimentos em seis meses (90/mês), com estados efetivos, pendentes e rejeitados.
with demo_vehicles as (
  select v.*,row_number() over(order by v.unit_code) vrn
  from public.vehicles v join _demo_ctx c on c.tenant_id=v.tenant_id where v.unit_code like 'DEMO-TAP-%'
), src as (
  select n,v.*,c.driver_id,c.manager_id,c.station_user_id,c.station_id,c.station_name,
         ('2026-02-01 10:00 America/Sao_Paulo'::timestamptz + (n-1)*interval '8 hours') event_at,
         case when v.fuel_type='flex' then case when n%4=0 then 'etanol' else 'gasolina' end else v.fuel_type::text end actual_fuel,
         case when v.fuel_type='flex' then 25+(n%20) else 45+(n%35) end::numeric liters_value
  from generate_series(1,540) n cross join _demo_ctx c
  join demo_vehicles v on v.vrn=((n-1)%18)+1
), valued as (
  select *,case actual_fuel when 'etanol' then 3.99 when 'gasolina' then 6.30 else 6.90 end::numeric unit_value
  from src
)
insert into public.fuelings
  (id,driver_id,vehicle_id,fuel_type,liters,price_per_liter,total_cost,odometer,station,created_at,
   has_anomaly,anomaly_type,km_per_liter,validated_at,validated_by,workflow_status,station_id,authorized_by,authorized_at,
   max_liters,tenant_id,full_tank,filled_by,filled_at,pump_receipt_number,cancellation_reason)
select md5('DEMO-SEED-6M:TAPEJARA:FUEL:'||lpad(n::text,4,'0'))::uuid,driver_id,id,actual_fuel,liters_value,unit_value,
       round(liters_value*unit_value,2),current_odometer+(((n-1)/18)::int+1)*145,
       station_name,event_at,false,null,case actual_fuel when 'diesel' then 7.4 else 10.8 end,
       case when n%20=0 or n%10=0 then null else event_at+interval '3 hours' end,
       case when n%20=0 or n%10=0 then null else manager_id end,
       case when n%20=0 then 'rejeitado_admin'::public.fueling_workflow_status
            when n%10=0 then 'concluido'::public.fueling_workflow_status
            when n%6=0 then 'lancado_direto'::public.fueling_workflow_status
            else 'validado'::public.fueling_workflow_status end,
       station_id,manager_id,event_at-interval '2 hours',tank_capacity,tenant_id,(n%3=0),station_user_id,event_at,
       'DEMO-TAP-'||to_char(event_at at time zone 'America/Sao_Paulo','YYYYMMDD')||'-'||lpad(n::text,4,'0'),
       case when n%20=0 then '[DEMO-SEED-6M] Divergência proposital para teste.' end
from valued
on conflict (id) do nothing;

-- 36 autorizações de ARLA/lubrificantes no portal do posto.
with demo_vehicles as (
  select v.*,row_number() over(order by v.unit_code) vrn
  from public.vehicles v join _demo_ctx c on c.tenant_id=v.tenant_id where v.unit_code like 'DEMO-TAP-%' and v.fuel_type='diesel'
), src as (
  select n,v.id vehicle_id,v.department_id,v.current_odometer,
         c.tenant_id,c.driver_id,c.manager_id,c.station_user_id,c.station_id,
         ('2026-02-04 14:00 America/Sao_Paulo'::timestamptz + (n-1)*interval '5 days') event_at
  from generate_series(1,36) n cross join _demo_ctx c
  join demo_vehicles v on v.vrn=((n-1)%12)+1
)
insert into public.station_operations
  (id,tenant_id,station_id,catalog_item_id,vehicle_id,driver_id,department_id,protocol,item_kind,item_name,unit,status,
   authorized_quantity,quantity,unit_price,total_cost,odometer,authorization_note,authorized_by,authorized_at,expires_at,
   executed_by,executed_at,receipt_number,evidence_path,validated_by,validated_at,created_at,updated_at)
select md5('DEMO-SEED-6M:TAPEJARA:OP:'||lpad(n::text,3,'0'))::uuid,tenant_id,station_id,
       md5('DEMO-SEED-6M:TAPEJARA:ARLA')::uuid,vehicle_id,driver_id,department_id,
       'DEMO-OP-TAP-'||lpad(n::text,4,'0'),'arla','ARLA 32 — demonstração','L','validado',
       30+(n%20),25+(n%15),5.20,round((25+(n%15))*5.20,2),current_odometer+n*80,
       '[DEMO-SEED-6M] Operação histórica.',manager_id,event_at-interval '1 hour',event_at+interval '1 day',
       station_user_id,event_at,'DEMO-ARLA-'||lpad(n::text,4,'0'),'demo/tapejara/arla-'||lpad(n::text,4,'0')||'.jpg',
       manager_id,event_at+interval '2 hours',event_at-interval '1 hour',event_at+interval '2 hours'
from src
on conflict (id) do nothing;

-- 144 viagens encerradas, distribuídas uniformemente no período.
with demo_vehicles as (
  select v.*,row_number() over(order by v.unit_code) vrn
  from public.vehicles v join _demo_ctx c on c.tenant_id=v.tenant_id where v.unit_code like 'DEMO-TAP-%'
), src as (
  select n,v.id vehicle_id,v.current_odometer,c.driver_id,c.tenant_id,
         ('2026-02-02 07:30 America/Sao_Paulo'::timestamptz + (n-1)*interval '30 hours') event_at,
         (38+(n%145))::int distance_value
  from generate_series(1,144) n cross join _demo_ctx c
  join demo_vehicles v on v.vrn=((n-1)%18)+1
)
insert into public.trips
  (id,driver_id,vehicle_id,destination,estimated_distance_km,start_odometer,end_odometer,distance_km,start_at,end_at,status,notes,created_at,tenant_id)
select md5('DEMO-SEED-6M:TAPEJARA:TRIP:'||lpad(n::text,3,'0'))::uuid,driver_id,vehicle_id,
       (array['Distrito de Santa Rita','Hospital Regional','Secretaria de Obras','Comunidade Linha Nova','Almoxarifado Central','Escola Municipal'])[1+((n-1)%6)],
       distance_value+5,current_odometer+(((n-1)/18)::int+1)*300,
       current_odometer+(((n-1)/18)::int+1)*300+distance_value,distance_value,event_at,event_at+interval '2 hours 20 minutes',
       case when n%17=0 then 'problema'::public.trip_status else 'concluida'::public.trip_status end,
       '[DEMO-SEED-6M] Viagem histórica para testes analíticos.',event_at,tenant_id
from src
on conflict (id) do nothing;

-- Checklist histórico correspondente a cada viagem, com itens detalhados.
insert into public.checklists (id,driver_id,vehicle_id,trip_id,notes,created_at,quick_confirm,tenant_id)
select md5('DEMO-SEED-6M:TAPEJARA:CHECK:'||t.id)::uuid,t.driver_id,t.vehicle_id,t.id,
       '[DEMO-SEED-6M] Checklist de viagem concluído.',t.start_at-interval '15 minutes',false,t.tenant_id
from public.trips t
where t.notes like '[DEMO-SEED-6M]%'
on conflict (id) do nothing;

insert into public.checklist_items (id,checklist_id,item_key,label,state,tenant_id)
select md5('DEMO-SEED-6M:TAPEJARA:CHECKITEM:'||c.id||':'||i.item_key)::uuid,c.id,i.item_key,i.label,
       case when i.item_key='limpeza' and row_number() over(order by c.id)%19=0 then 'atencao'::public.checklist_state else 'ok'::public.checklist_state end,
       c.tenant_id
from public.checklists c
cross join (values ('freios','Freios'),('pneus','Pneus'),('luzes','Luzes'),('oleo','Óleo do motor'),('limpeza','Limpeza geral')) i(item_key,label)
where c.notes like '[DEMO-SEED-6M]%'
on conflict (id) do nothing;

-- Manutenções legadas para os gráficos/histórico de revisões.
with demo_vehicles as (
  select v.*,row_number() over(order by v.unit_code) vrn
  from public.vehicles v join _demo_ctx c on c.tenant_id=v.tenant_id where v.unit_code like 'DEMO-TAP-%'
)
insert into public.maintenances
  (id,vehicle_id,type,description,status,performed_at,odometer,due_date,due_odometer,created_at,tenant_id)
select md5('DEMO-SEED-6M:TAPEJARA:MAINT:'||lpad(n::text,3,'0'))::uuid,v.id,
       (array['Troca de óleo e filtros','Revisão preventiva','Sistema de freios','Pneus e alinhamento'])[1+((n-1)%4)],
       '[DEMO-SEED-6M] Serviço periódico registrado para testes.','realizada',
       ('2026-02-05'::date+(n-1)*5),v.current_odometer+n*90,('2026-02-05'::date+(n-1)*5)+interval '180 days',v.current_odometer+n*90+10000,
       ('2026-02-05 12:00+00'::timestamptz+(n-1)*interval '5 days'),v.tenant_id
from generate_series(1,36) n join demo_vehicles v on v.vrn=((n-1)%18)+1
on conflict (id) do nothing;

-- Ocorrências e infrações com diferentes severidades/situações.
with demo_vehicles as (
  select v.*,row_number() over(order by v.unit_code) vrn
  from public.vehicles v join _demo_ctx c on c.tenant_id=v.tenant_id where v.unit_code like 'DEMO-TAP-%'
)
insert into public.issues
  (id,driver_id,vehicle_id,title,description,severity,status,created_at,tenant_id)
select md5('DEMO-SEED-6M:TAPEJARA:ISSUE:'||lpad(n::text,2,'0'))::uuid,c.driver_id,v.id,
       (array['Ruído no sistema de freios','Luz de advertência acesa','Desgaste irregular dos pneus','Vazamento leve identificado'])[1+((n-1)%4)],
       '[DEMO-SEED-6M] Ocorrência fictícia para validação dos painéis.',
       (array['baixa','media','alta'])[1+((n-1)%3)]::public.issue_severity,
       (array['resolvido','em_analise','aberto'])[1+((n-1)%3)]::public.issue_status,
       '2026-02-10 13:00+00'::timestamptz+(n-1)*interval '15 days',c.tenant_id
from generate_series(1,12) n cross join _demo_ctx c join demo_vehicles v on v.vrn=((n-1)%18)+1
on conflict (id) do nothing;

with demo_vehicles as (
  select v.*,row_number() over(order by v.unit_code) vrn
  from public.vehicles v join _demo_ctx c on c.tenant_id=v.tenant_id where v.unit_code like 'DEMO-TAP-%'
)
insert into public.infractions
  (id,ait,code,description,plate,vehicle_id,location,occurred_at,amount,points,due_date,status,suggested_driver_id,indicated_driver_id,notes,approved_by,approved_at,source,raw,created_at,tenant_id)
select md5('DEMO-SEED-6M:TAPEJARA:INFRACTION:'||lpad(n::text,2,'0'))::uuid,
       'DEMO-AIT-'||lpad(n::text,5,'0'),case when n%2=0 then '745-50' else '605-01' end,
       case when n%2=0 then 'Transitar em velocidade superior à permitida em até 20%' else 'Avançar sinal vermelho' end,
       v.plate,v.id,'Tapejara/PR — via urbana','2026-02-12 15:00+00'::timestamptz+(n-1)*interval '14 days',
       case when n%2=0 then 130.16 else 293.47 end,case when n%2=0 then 4 else 7 end,
       ('2026-02-12'::date+(n-1)*14)+45,
       (array['pendente','aprovada','paga'])[1+((n-1)%3)],c.driver_id,c.driver_id,
       '[DEMO-SEED-6M] Infração fictícia.',c.manager_id,'2026-02-13 15:00+00'::timestamptz+(n-1)*interval '14 days',
       'manual',jsonb_build_object('demo_seed','DEMO-SEED-6M'),'2026-02-12 15:00+00'::timestamptz+(n-1)*interval '14 days',c.tenant_id
from generate_series(1,12) n cross join _demo_ctx c join demo_vehicles v on v.vrn=((n-1)%18)+1
on conflict (id) do nothing;

-- 30 ordens de serviço cobrindo todo o fluxo operacional e financeiro.
with demo_vehicles as (
  select v.*,row_number() over(order by v.unit_code) vrn
  from public.vehicles v join _demo_ctx c on c.tenant_id=v.tenant_id where v.unit_code like 'DEMO-TAP-%'
), src as (
  select n,v.id vehicle_id,v.current_odometer,c.driver_id,c.manager_id,c.shop_1_id,
         coalesce(c.shop_2_id,c.shop_1_id) shop_2_id,c.tenant_id,
         ('2026-02-06 11:00 America/Sao_Paulo'::timestamptz+(n-1)*interval '6 days') event_at,
         (850+(n%8)*375)::numeric budget_value
  from generate_series(1,30) n cross join _demo_ctx c join demo_vehicles v on v.vrn=((n-1)%18)+1
)
insert into public.service_orders
  (id,vehicle_id,driver_id,category,description,priority,odometer,status,approved_by,approved_at,admin_note,created_at,tenant_id,
   cost,repair_shop,budget,completed_at,repair_shop_id,operational_status,financial_status,commitment_number,nad_number,
   at_shop_at,received_at,opened_by,origin,issue_id,commitment_document_path)
select md5('DEMO-SEED-6M:TAPEJARA:SO:'||lpad(n::text,3,'0'))::uuid,vehicle_id,driver_id,
       (array['Mecânica','Elétrica','Pneus','Funilaria','Revisão preventiva'])[1+((n-1)%5)],
       '[DEMO-SEED-6M] '||(array['Troca de pastilhas e revisão dos discos.','Reparo no alternador e bateria.','Substituição e alinhamento dos pneus.','Correção de avaria na carroceria.','Revisão completa por quilometragem.'])[1+((n-1)%5)],
       (array['baixa','media','alta'])[1+((n-1)%3)]::public.issue_severity,current_odometer+n*110,
       case when n<=18 then 'concluida'::public.service_order_status when n<=22 then 'em_execucao'::public.service_order_status when n<=28 then 'aprovada'::public.service_order_status else 'pendente'::public.service_order_status end,
       case when n<=28 then manager_id end,case when n<=28 then event_at+interval '8 hours' end,
       '[DEMO-SEED-6M] Processo completo para testes de gráficos e modais.',event_at,tenant_id,
       case when n<=20 then round(budget_value*(0.94+(n%4)*0.01),2) end,
       case when n%2=0 then 'RICOL AUTO PECAS E MECANICA' else 'JUNINHO AUTO ELETRICA' end,budget_value,
       case when n<=18 then event_at+interval '4 days' end,
       case when n%2=0 then shop_2_id else shop_1_id end,
       case when n<=18 then 'received'::public.service_order_op_status when n<=22 then 'ready'::public.service_order_op_status
            when n<=26 then 'in_progress'::public.service_order_op_status when n<=28 then 'awaiting_quote_approval'::public.service_order_op_status
            else 'pending'::public.service_order_op_status end,
       case when n<=14 then 'paid'::public.service_order_fin_status when n<=18 then 'attested'::public.service_order_fin_status
            when n<=20 then 'invoiced'::public.service_order_fin_status when n<=26 then 'committed'::public.service_order_fin_status
            else 'not_started'::public.service_order_fin_status end,
       case when n<=26 then 'DEMO-EMP-OS-'||lpad(n::text,4,'0') end,
       case when n<=26 then 'DEMO-NAD-OS-'||lpad(n::text,4,'0') end,
       case when n<=28 then event_at+interval '1 day' end,
       case when n<=18 then event_at+interval '5 days' end,manager_id,'manager',
       case when n<=12 then md5('DEMO-SEED-6M:TAPEJARA:ISSUE:'||lpad(n::text,2,'0'))::uuid end,
       case when n<=26 then 'demo/tapejara/os-'||lpad(n::text,3,'0')||'/empenho.pdf' end
from src
on conflict (id) do nothing;

-- Orçamentos, itens, notas fiscais e pagamentos das O.S.
insert into public.service_order_quotes
  (id,tenant_id,service_order_id,repair_shop_id,version,total,status,valid_until,note,reviewed_by,reviewed_at,review_note,created_at)
select md5('DEMO-SEED-6M:TAPEJARA:QUOTE:'||so.id)::uuid,so.tenant_id,so.id,so.repair_shop_id,1,so.budget,
       case when row_number() over(order by so.created_at)<=26 then 'aprovado' else 'enviado' end,
       so.created_at::date+20,'[DEMO-SEED-6M] Orçamento fictício.',
       case when row_number() over(order by so.created_at)<=26 then so.approved_by end,
       case when row_number() over(order by so.created_at)<=26 then so.approved_at end,
       case when row_number() over(order by so.created_at)<=26 then 'Aprovado para demonstração.' end,so.created_at+interval '1 day'
from public.service_orders so
where so.admin_note like '[DEMO-SEED-6M]%' and so.operational_status<>'pending'
on conflict (id) do nothing;

insert into public.service_order_quote_items (id,quote_id,kind,description,qty,unit_price,created_at)
select md5('DEMO-SEED-6M:TAPEJARA:QUOTEITEM:'||q.id||':'||i.n)::uuid,q.id,
       case when i.n=1 then 'peca' else 'mao_de_obra' end,
       case when i.n=1 then 'Peças e insumos da manutenção' else 'Mão de obra técnica' end,
       1,case when i.n=1 then round(q.total*0.62,2) else q.total-round(q.total*0.62,2) end,q.created_at
from public.service_order_quotes q cross join (values(1),(2)) i(n)
where q.note like '[DEMO-SEED-6M]%'
on conflict (id) do nothing;

insert into public.service_order_invoices
  (id,tenant_id,service_order_id,repair_shop_id,invoice_number,amount,issued_at,file_path,commitment_number,attested_by,attested_at,created_at)
select md5('DEMO-SEED-6M:TAPEJARA:INVOICE:'||so.id)::uuid,so.tenant_id,so.id,so.repair_shop_id,
       'DEMO-NF-'||lpad(row_number() over(order by so.created_at)::text,5,'0'),coalesce(so.cost,so.budget),
       so.created_at::date+4,'demo/tapejara/'||so.id||'/nota-fiscal.pdf',so.commitment_number,
       case when so.financial_status in ('attested','paid') then so.approved_by end,
       case when so.financial_status in ('attested','paid') then so.created_at+interval '5 days' end,
       so.created_at+interval '4 days'
from public.service_orders so
where so.admin_note like '[DEMO-SEED-6M]%' and so.financial_status in ('invoiced','attested','paid')
on conflict (id) do nothing;

insert into public.service_order_payments
  (id,tenant_id,service_order_id,invoice_id,amount,paid_at,note,registered_by,created_at)
select md5('DEMO-SEED-6M:TAPEJARA:PAYMENT:'||so.id)::uuid,so.tenant_id,so.id,i.id,i.amount,
       so.created_at::date+12,'[DEMO-SEED-6M] Pagamento fictício integral.',so.approved_by,so.created_at+interval '12 days'
from public.service_orders so join public.service_order_invoices i on i.service_order_id=so.id
where so.admin_note like '[DEMO-SEED-6M]%' and so.financial_status='paid'
on conflict (id) do nothing;

-- Fechamentos fiscais mensais do posto, incluindo itens, empenho, NF e pagamento.
with months as (select generate_series('2026-02-01'::date,'2026-07-01'::date,interval '1 month')::date competence), totals as (
  select m.competence,count(f.id)::int record_count,coalesce(sum(f.liters),0) total_quantity,coalesce(sum(f.total_cost),0) total_amount
  from months m join _demo_ctx c on true
  left join public.fuelings f on f.tenant_id=c.tenant_id and f.station_id=c.station_id
    and f.workflow_status in ('validado','lancado_direto')
    and (f.filled_at at time zone 'America/Sao_Paulo')::date>=m.competence
    and (f.filled_at at time zone 'America/Sao_Paulo')::date<(m.competence+interval '1 month')::date
  group by m.competence
)
insert into public.station_monthly_closings
  (id,tenant_id,station_id,competence,protocol,status,record_count,total_quantity,total_amount,snapshot_hash,
   submitted_by,submitted_at,reviewed_by,reviewed_at,review_note,created_at,updated_at,fiscal_status)
select md5('DEMO-SEED-6M:TAPEJARA:CLOSING:'||t.competence)::uuid,c.tenant_id,c.station_id,t.competence,
       'DEMO-FECH-TAP-'||to_char(t.competence,'YYYYMM'),'aprovado',t.record_count,t.total_quantity,t.total_amount,
       md5('DEMO-SEED-6M:TAPEJARA:CLOSING:'||t.competence)||md5(t.total_amount::text),
       c.station_user_id,(t.competence+interval '1 month 2 days')::timestamptz,c.manager_id,(t.competence+interval '1 month 3 days')::timestamptz,
       '[DEMO-SEED-6M] Fechamento aprovado para testes.',(t.competence+interval '1 month 2 days')::timestamptz,
       (t.competence+interval '1 month 3 days')::timestamptz,
       case when t.competence<='2026-04-01' then 'pago' when t.competence='2026-05-01' then 'atestado'
            when t.competence='2026-06-01' then 'nota_enviada' else 'coberto' end
from totals t cross join _demo_ctx c where t.record_count>0
on conflict (id) do nothing;

insert into public.station_monthly_closing_items
  (id,closing_id,tenant_id,station_id,source_kind,source_id,source_protocol,vehicle_id,plate,vehicle_name,department_name,
   driver_name,authorizer_name,item_kind,item_name,unit,quantity,unit_price,total_cost,odometer,previous_odometer,distance_km,
   efficiency,receipt_number,evidence_paths,has_anomaly,executed_at,created_at)
select md5('DEMO-SEED-6M:TAPEJARA:CLOSINGITEM:'||f.id)::uuid,cl.id,f.tenant_id,f.station_id,'abastecimento',f.id,
       coalesce(f.pump_receipt_number,'DEMO-'||f.id),f.vehicle_id,v.plate,v.name,d.name,p.full_name,a.full_name,
       'combustivel',upper(f.fuel_type),'L',f.liters,f.price_per_liter,f.total_cost,f.odometer,null,null,f.km_per_liter,
       f.pump_receipt_number,'[]'::jsonb,false,coalesce(f.filled_at,f.created_at),coalesce(f.filled_at,f.created_at)
from public.fuelings f
join public.station_monthly_closings cl on cl.tenant_id=f.tenant_id and cl.station_id=f.station_id
  and cl.protocol like 'DEMO-FECH-TAP-%'
  and date_trunc('month',f.filled_at at time zone 'America/Sao_Paulo')::date=cl.competence
join public.vehicles v on v.id=f.vehicle_id left join public.departments d on d.id=v.department_id
left join public.profiles p on p.id=f.driver_id left join public.profiles a on a.id=f.authorized_by
where f.pump_receipt_number like 'DEMO-TAP-%' and f.workflow_status in ('validado','lancado_direto')
on conflict (id) do nothing;

insert into public.station_closing_commitments (id,closing_id,commitment_id,tenant_id,amount,linked_by,linked_at)
select md5('DEMO-SEED-6M:TAPEJARA:CLOSINGCOMMIT:'||cl.id)::uuid,cl.id,
       md5('DEMO-SEED-6M:TAPEJARA:COMMITMENT')::uuid,cl.tenant_id,cl.total_amount,c.manager_id,cl.reviewed_at
from public.station_monthly_closings cl join _demo_ctx c on c.tenant_id=cl.tenant_id
where cl.protocol like 'DEMO-FECH-TAP-%'
on conflict (id) do nothing;

insert into public.station_closing_invoices
  (id,closing_id,tenant_id,station_id,invoice_number,amount,issued_on,document_path,status,submitted_by,submitted_at,attested_by,attested_at,attestation_note)
select md5('DEMO-SEED-6M:TAPEJARA:CLOSINGINV:'||cl.id)::uuid,cl.id,cl.tenant_id,cl.station_id,
       'DEMO-NF-POSTO-'||to_char(cl.competence,'YYYYMM'),cl.total_amount,(cl.competence+interval '1 month 4 days')::date,
       'demo/tapejara/fechamentos/'||to_char(cl.competence,'YYYYMM')||'/nota-fiscal.pdf',
       case when cl.competence<='2026-05-01' then 'atestada' else 'enviada' end,c.station_user_id,
       (cl.competence+interval '1 month 4 days')::timestamptz,
       case when cl.competence<='2026-05-01' then c.manager_id end,
       case when cl.competence<='2026-05-01' then (cl.competence+interval '1 month 6 days')::timestamptz end,
       case when cl.competence<='2026-05-01' then '[DEMO-SEED-6M] Ateste fictício.' end
from public.station_monthly_closings cl join _demo_ctx c on c.tenant_id=cl.tenant_id
where cl.protocol like 'DEMO-FECH-TAP-%' and cl.competence<='2026-06-01'
on conflict (id) do nothing;

insert into public.station_closing_payments
  (id,closing_id,invoice_id,tenant_id,amount,scheduled_on,paid_on,payment_reference,receipt_path,note,registered_by,created_at)
select md5('DEMO-SEED-6M:TAPEJARA:CLOSINGPAY:'||cl.id)::uuid,cl.id,i.id,cl.tenant_id,i.amount,
       (cl.competence+interval '1 month 10 days')::date,(cl.competence+interval '1 month 12 days')::date,
       'DEMO-PAG-'||to_char(cl.competence,'YYYYMM'),'demo/tapejara/fechamentos/'||to_char(cl.competence,'YYYYMM')||'/pagamento.pdf',
       '[DEMO-SEED-6M] Pagamento fictício.',c.manager_id,(cl.competence+interval '1 month 12 days')::timestamptz
from public.station_monthly_closings cl join _demo_ctx c on c.tenant_id=cl.tenant_id
join public.station_closing_invoices i on i.closing_id=cl.id
where cl.protocol like 'DEMO-FECH-TAP-%' and cl.competence<='2026-04-01'
on conflict (id) do nothing;

-- Reativa os gatilhos de notificação antes do commit.
alter table public.fuelings enable trigger trg_notify_fueling;
alter table public.fuelings enable trigger trg_notify_station_partner;
alter table public.service_orders enable trigger trg_notify_service_order;
alter table public.service_orders enable trigger trg_notify_workshop_partner;
alter table public.issues enable trigger trg_notify_issue_created;
alter table public.issues enable trigger trg_issue_create_service_order;

commit;
