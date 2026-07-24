alter table public.driver_registration_invites
  add column if not exists ai_use_count integer not null default 0
  check (ai_use_count >= 0);
