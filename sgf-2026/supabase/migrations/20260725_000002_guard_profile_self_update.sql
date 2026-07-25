-- ============================================================================
-- FIX DE SEGURANÇA: motorista conseguia se desbloquear e renovar a própria CNH
--
-- VULNERABILIDADE
--   A policy `profiles_update_own` permite `update ... where auth.uid() = id`
--   em QUALQUER coluna. A trava existente (`guard_profile_privilege`) só
--   revertia `role`, `department_id` e `tenant_id` — os demais campos
--   administrativos ficavam graváveis pelo próprio usuário.
--
--   Comprovado em produção (teste revertido por RAISE EXCEPTION), autenticado
--   como o próprio motorista:
--     access_blocked  false  -> true    (não protegido)
--     driver_status   ativo  -> suspenso (não protegido)
--     cnh_expiry  2026-07-07 -> 2099-12-31 (não protegido)
--     role        motorista  -> motorista  (protegido, revertido)
--
-- IMPACTO
--   • `access_blocked` é o mecanismo de bloqueio do motorista: o app faz
--     signOut quando ele é true (appFrota/src/lib/auth.tsx). Um motorista
--     bloqueado pelo gestor podia se reabilitar com um PATCH no PostgREST.
--   • `driver_status` permitia sair de 'suspenso'/'inativo' para 'ativo'.
--   • `cnh_expiry` permitia estender a validade da própria CNH, burlando o
--     alerta de vencimento e a regra de negócio que depende dele.
--   • `cpf` comprometeria a identificação na trilha de auditoria.
--
-- CORREÇÃO
--   Estende a mesma trava aos campos administrativos. Mantém o comportamento
--   atual de reverter silenciosamente (em vez de lançar erro), para não
--   quebrar chamadas que enviam o registro inteiro.
--
--   Os campos de autoatendimento continuam livres, porque o app do motorista
--   os edita em app/edit-profile.tsx: phone, photo_url, cnh_category, cnh_ear,
--   cnh_document_url, other_skills, shift_start, shift_end — além de
--   full_name, email, on_duty, current_vehicle_id e must_change_password.
-- ============================================================================

create or replace function public.guard_profile_privilege()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  -- Admin e superadmin passam livres; operações sem sessão (service_role,
  -- triggers internas, cron) também, pois não são o usuário se auto-editando.
  if auth.uid() is null
     or public.is_admin()
     or public.is_superadmin() then
    return NEW;
  end if;

  -- Vínculo e papel (trava original)
  NEW.role          := OLD.role;
  NEW.department_id := OLD.department_id;
  NEW.tenant_id     := OLD.tenant_id;

  -- Controle de acesso: o usuário não pode se reabilitar
  NEW.access_blocked := OLD.access_blocked;
  NEW.driver_status  := OLD.driver_status;

  -- Identidade e habilitação: não são autodeclaráveis
  NEW.cpf                 := OLD.cpf;
  NEW.registration_number := OLD.registration_number;
  NEW.cnh_expiry          := OLD.cnh_expiry;
  NEW.cnh_number          := OLD.cnh_number;

  -- Avaliação atribuída pelo gestor
  NEW.score := OLD.score;

  return NEW;
end;
$function$;

comment on function public.guard_profile_privilege() is
  'Impede que um usuário altere os próprios campos administrativos via profiles_update_own (RLS permite update em qualquer coluna). Campos de autoatendimento usados pelo app do motorista seguem editáveis.';
