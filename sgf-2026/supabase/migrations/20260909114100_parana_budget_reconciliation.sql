-- Reference data for reconciliation; not a SIM-AM remittance generator.
alter table public.budget_contracts add column reporting jsonb not null default '{}' check(jsonb_typeof(reporting)='object');
alter function public.save_department_budget(jsonb) set schema sgf_private;
alter function sgf_private.save_department_budget(jsonb) rename to save_department_budget_core;
revoke all on function sgf_private.save_department_budget_core(jsonb) from public,anon,authenticated;
create function public.save_department_budget(p_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; r jsonb:=p_payload->'reporting'; k text; v text; before_reporting jsonb;
begin
  if r is not null then
    if jsonb_typeof(r)<>'object' or octet_length(r::text)>100000 then raise exception 'Referências SIM-AM inválidas'; end if;
    for k,v in select key,value from jsonb_each_text(r) where key<>'dotacoes' loop
      if k not in ('idPessoa','nrLicitacao','nrAnoLicitacao','idTipoInstrumentoConvocatorio','idModalidadeLicitacao','idTipoDocOrigemLicitacao','nrDocOrigemLicitacao') then raise exception 'Campo SIM-AM desconhecido: %',k; end if;
      if jsonb_typeof(r->k)<>'string' then raise exception 'Informe os códigos SIM-AM como texto'; end if;
      if v<>'' then
        if k='nrDocOrigemLicitacao' then
          if v!~'^[A-Za-z0-9]{14,15}$' then raise exception 'Documento de origem inválido'; end if;
        elsif k='nrAnoLicitacao' then
          if v!~'^[0-9]{4}$' then raise exception 'Ano da licitação inválido'; end if;
        elsif v!~'^[0-9]+$' or length(v)>(case when k='idPessoa' then 7 when k='nrLicitacao' then 9 else 2 end) then
          raise exception 'Código SIM-AM inválido: %',k;
        end if;
      end if;
    end loop;
    if r ? 'dotacoes' then
      if jsonb_typeof(r->'dotacoes')<>'object' then raise exception 'Dotações SIM-AM inválidas'; end if;
      for k,v in select key,value from jsonb_each_text(r->'dotacoes') loop
        if jsonb_typeof(r->'dotacoes'->k)<>'string' or (v<>'' and v!~'^[0-9]{28}$') then raise exception 'A dotação SIM-AM deve ter 28 dígitos'; end if;
        if not exists(select 1 from jsonb_array_elements(p_payload->'allocations') a where a->>'department_id'=k) then
          raise exception 'Dotação sem secretaria na distribuição'; end if;
      end loop;
    end if;
  end if;
  v_id:=sgf_private.save_department_budget_core(p_payload);
  if r is not null then
    select reporting into before_reporting from public.budget_contracts where id=v_id;
    update public.budget_contracts set reporting=r where id=v_id;
    if r is distinct from before_reporting then
      insert into public.budget_events(contract_id,actor_id,event_type,reason,before_value,after_value)
      values(v_id,auth.uid(),'reporting_references',trim(p_payload->>'reason'),before_reporting,r);
    end if;
  end if;
  return v_id;
end $$;
revoke all on function public.save_department_budget(jsonb) from public,anon;
grant execute on function public.save_department_budget(jsonb) to authenticated;
