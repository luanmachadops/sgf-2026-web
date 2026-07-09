-- T4.1 — Protege a edge function send-push com segredo compartilhado.
-- APLICADA EM PRODUÇÃO em 2026-07-09 (via MCP, migration "push_webhook_secret").
--
-- O secret é gerado no próprio banco e nunca sai dele: fica na tabela privada
-- app_secrets (RLS habilitada sem policies; anon/authenticated sem grants).
-- O trigger tg_notifications_push lê de lá e envia o header x-webhook-secret;
-- a send-push (v2, service role bypassa RLS) compara com o mesmo valor.
-- A env PUSH_WEBHOOK_SECRET, se definida na function, tem precedência.

create table if not exists public.app_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on table public.app_secrets from public, anon, authenticated;

insert into public.app_secrets (name, value)
values ('PUSH_WEBHOOK_SECRET', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (name) do nothing;

create or replace function public.tg_notifications_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_secret text;
begin
  select value into v_secret from public.app_secrets where name = 'PUSH_WEBHOOK_SECRET';
  perform net.http_post(
    url     := 'https://kgxdrgbxpfoebzrphtqg.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-webhook-secret', coalesce(v_secret, '')),
    body    := jsonb_build_object('record', to_jsonb(NEW))
  );
  return NEW;
exception when others then
  return NEW;
end $$;
