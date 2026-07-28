-- A OS criada automaticamente por uma ocorrência usa a origem `issue`.
-- A restrição anterior foi criada antes desse fluxo existir.
alter table public.service_orders
  drop constraint if exists service_orders_origin_check;

alter table public.service_orders
  add constraint service_orders_origin_check
  check (origin = any (array['driver', 'checklist', 'manager', 'issue']));
