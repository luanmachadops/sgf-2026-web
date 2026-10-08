-- Documento da CNH enviado pelo motorista no app (foto ou PDF). Guarda o PATH
-- no bucket privado `documentos` (tenant/<tenant>/cnh/<arquivo>); quem exibe
-- assina a URL na hora. O app já gravava este campo, mas a coluna não existia
-- e a gravação do perfil inteira falhava.
alter table public.profiles add column if not exists cnh_document_url text;
