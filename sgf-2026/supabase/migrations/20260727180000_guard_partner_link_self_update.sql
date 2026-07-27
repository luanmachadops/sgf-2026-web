-- ============================================================================
-- FIX DE SEGURANÇA: parceiro podia se vincular a OUTRO posto/oficina
--
-- VULNERABILIDADE
--   `guard_profile_privilege` (ver 20260724221030) trava role/department_id/
--   tenant_id contra auto-edição, mas `station_id` e `repair_shop_id` — criados
--   depois, na fase dos portais de parceiros (20260725204942) — ficaram de fora.
--
--   A policy `profiles_update_own` permite `update ... where auth.uid() = id`
--   em qualquer coluna, então um usuário de posto ou oficina podia, via PATCH
--   direto no PostgREST:
--
--     patch /rest/v1/profiles?id=eq.<self>  { "repair_shop_id": "<outra oficina>" }
--
--   O papel continua 'oficina' (protegido) e o tenant também, mas o VÍNCULO é
--   o que define o escopo dos portais: as policies e RPCs de parceiro filtram
--   pelas OS/abastecimentos da oficina/posto do profile. Trocar o vínculo dá
--   leitura — e escrita de orçamento, NF e conclusão — sobre o movimento de um
--   concorrente dentro da mesma prefeitura.
--
-- CORREÇÃO
--   Estende a mesma trava aos dois campos de vínculo. Admin, superadmin e
--   operações sem sessão (service_role — é por onde a rota /api/partners cria e
--   mantém o acesso) seguem passando livres, como no guard original.
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

  -- Vínculo de parceiro: é ele que define o escopo dos portais /posto e
  -- /oficina. Autodeclarável = ler e mexer no movimento de outro parceiro.
  NEW.station_id     := OLD.station_id;
  NEW.repair_shop_id := OLD.repair_shop_id;

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
  'Impede que um usuário altere os próprios campos administrativos via profiles_update_own (RLS permite update em qualquer coluna), inclusive o vínculo de parceiro (station_id/repair_shop_id). Campos de autoatendimento usados pelo app do motorista seguem editáveis.';
