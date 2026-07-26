-- Cobertura da FK adicionada pelo fluxo V2. Além de acelerar a exclusão/
-- desativação de perfis, atende consultas de auditoria por autor da abertura.
create index if not exists idx_service_orders_opened_by
  on public.service_orders (opened_by);
