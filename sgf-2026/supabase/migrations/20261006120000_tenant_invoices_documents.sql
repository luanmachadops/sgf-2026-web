-- Documentos anexados à fatura (empenho, comprovante de pagamento, nota fiscal…).
-- Mesmo formato de tenant_contracts.documents: [{ name, path, size, type, kind }].
-- Arquivos ficam no bucket privado `documentos`, em <tenant_id>/invoices/<invoice_id>/.
alter table public.tenant_invoices
  add column if not exists documents jsonb not null default '[]'::jsonb;
