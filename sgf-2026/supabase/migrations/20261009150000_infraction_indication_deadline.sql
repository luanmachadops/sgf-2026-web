-- Preparação para indicação de condutor junto ao órgão autuador (FICI / SNE).
--
-- * profiles.cnh_uf: UF emissora da CNH — exigida no formulário de indicação.
-- * infractions.notified_at: data em que a prefeitura recebeu a notificação
--   de autuação. O prazo legal de indicação conta a partir dela.
-- * infractions.indication_deadline: notified_at + 30 dias (calculado).
-- * infraction_deadline_alerts(): todo dia avisa os gestores quando faltam
--   10 e 3 dias, e no dia do vencimento, para infrações ainda não aprovadas.

alter table public.profiles add column if not exists cnh_uf text
  check (cnh_uf is null or cnh_uf ~ '^[A-Z]{2}$');

alter table public.infractions add column if not exists notified_at date;
alter table public.infractions add column if not exists indication_deadline date
  generated always as (notified_at + 30) stored;

create or replace function public.infraction_deadline_alerts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_sent integer := 0;
  v_days integer;
  v_title text;
begin
  for r in
    select i.id, i.tenant_id, i.ait, i.plate, i.description, i.indication_deadline
      from public.infractions i
     where i.indication_deadline is not null
       and i.status in ('pendente', 'indicada')
       and (i.indication_deadline - current_date) in (10, 3, 0)
  loop
    v_days := r.indication_deadline - current_date;
    v_title := case v_days
      when 0 then 'Prazo de indicação vence hoje'
      else format('Prazo de indicação: faltam %s dias', v_days)
    end;
    -- Um aviso por infração e por marco (não repete se o cron rodar de novo).
    if exists (
      select 1 from public.notifications n
       where n.entity_type = 'infraction' and n.entity_id = r.id
         and n.title = v_title and n.created_at::date = current_date
    ) then
      continue;
    end if;

    insert into public.notifications (driver_id, tenant_id, type, title, body, link, entity_type, entity_id)
    select p.id, r.tenant_id, case when v_days <= 3 then 'alert' else 'warning' end, v_title,
           format('%s%s%s — indique o condutor até %s para não perder o prazo.',
                  coalesce(r.description, 'Infração'),
                  case when r.plate is not null then ' · ' || r.plate else '' end,
                  case when r.ait is not null then ' · AIT ' || r.ait else '' end,
                  to_char(r.indication_deadline, 'DD/MM/YYYY')),
           '/infracoes/' || r.id, 'infraction', r.id
      from public.profiles p
     where p.tenant_id = r.tenant_id and p.role in ('admin', 'gestor') and p.archived_at is null;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;
revoke all on function public.infraction_deadline_alerts() from public, anon, authenticated;

select cron.schedule('infraction-deadline-alerts', '30 8 * * *', $$ select public.infraction_deadline_alerts(); $$);
