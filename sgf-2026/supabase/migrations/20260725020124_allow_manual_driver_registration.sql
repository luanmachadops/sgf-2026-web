alter table public.driver_registration_requests
  add column if not exists document_entry_mode text not null default 'photo';

alter table public.driver_registration_requests
  alter column cnh_front_path drop not null;

alter table public.driver_registration_requests
  drop constraint if exists driver_registration_requests_document_entry_mode;

alter table public.driver_registration_requests
  add constraint driver_registration_requests_document_entry_mode
  check (
    (document_entry_mode = 'photo' and cnh_front_path is not null)
    or (document_entry_mode = 'manual' and cnh_front_path is null)
  );

comment on column public.driver_registration_requests.document_entry_mode is
  'Origem dos dados da CNH: photo para foto com leitura por IA; manual para preenchimento sem foto.';
