-- ============================================================================
-- FIX DE SEGURANÇA: admin conseguia se promover a superadmin e trocar de tenant
--
-- VULNERABILIDADE
--   `guard_profile_privilege` (20260724221030, estendida em 20260727180000)
--   isenta quem é `is_admin()` LOGO NA PRIMEIRA CONDIÇÃO, sem reverter nenhuma
--   coluna. Combinado com a policy `profiles_update_own`
--   (USING/WITH CHECK = `auth.uid() = id`), que permite `update` em QUALQUER
--   coluna da própria linha, o admin da prefeitura executa:
--
--     update public.profiles set role = 'superadmin' where id = auth.uid();
--
--   e vira superadmin. O superadmin atravessa o isolamento multi-tenant: todas
--   as policies de `profiles`, veículos, viagens, parceiros etc. começam com
--   `is_superadmin() OR ...`. Ou seja, o admin de UMA prefeitura passa a ler e
--   escrever os dados de TODAS as prefeituras do SaaS.
--
--   Pelo mesmo caminho o admin trocava o próprio `tenant_id`, se mudando de
--   prefeitura (e levando junto o escopo de `get_user_tenant_id()`).
--
-- CORREÇÃO
--   1. A isenção total passa a ser só do superadmin (e das operações sem
--      sessão). O admin deixa de ser "passa livre".
--   2. `tenant_id` é SEMPRE preservado para quem não é superadmin — inclusive
--      para o admin. Mover perfil entre prefeituras é ato de superadmin.
--   3. Promover qualquer perfil a 'superadmin' levanta exceção.
--   4. Alterar o PRÓPRIO papel levanta exceção (vale para todos os papéis).
--   5. As demais colunas administrativas seguem sendo revertidas em silêncio
--      para quem NÃO é admin, exatamente como antes.
--
-- O QUE CONTINUA FUNCIONANDO (verificado antes de endurecer)
--   • Cadastro/pré-cadastro de motorista pelo painel: passa por
--     web/api/_lib/driver-access.ts com service_role. `auth.uid()` é nulo nesse
--     contexto (o JWT de service_role não tem claim `sub`), então a primeira
--     condição já isenta. Além disso o trigger é BEFORE **UPDATE** apenas
--     (`trg_guard_profile_privilege`, tgtype=19) — INSERT nunca passa por aqui.
--   • Edição de motorista pelo painel (EditDriverModal -> driversApi.update),
--     que roda com o JWT do ADMIN e grava cpf, registration_number, cnh_number,
--     cnh_expiry, department_id e driver_status direto via PostgREST: o admin
--     segue podendo gravar essas colunas em perfis de TERCEIROS — por isso a
--     reversão do item 5 continua restrita a quem não é admin. Esse payload não
--     envia `role` nem `tenant_id`, então os itens 2/3/4 não o afetam.
--   • Console do superadmin (admin/api/*): tudo com service_role — isento.
--   • App do motorista (edit-profile, first-access): só campos de
--     autoatendimento, sem `role` — comportamento inalterado.
--
--   Nenhum fluxo encontrado envia `role` num UPDATE com JWT de usuário, o que é
--   o que torna seguro trocar o revert silencioso por exceção nos itens 3 e 4.
-- ============================================================================

create or replace function public.guard_profile_privilege()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
begin
  -- Operações sem sessão (service_role, cron, triggers internas) não são o
  -- usuário se auto-editando. O superadmin é o único papel acima desta trava.
  if v_uid is null or public.is_superadmin() then
    return NEW;
  end if;

  -- ---------------------------------------------------------------------
  -- Travas que valem para TODOS abaixo de superadmin — inclusive o admin.
  -- ---------------------------------------------------------------------

  -- Prefeitura do perfil: mover alguém (ou a si mesmo) de tenant é ato de
  -- superadmin. Preservado sempre, e em silêncio, porque nenhum cliente envia
  -- esta coluna num update.
  NEW.tenant_id := OLD.tenant_id;

  if NEW.role is distinct from OLD.role then
    -- Criar superadmin é privilégio de superadmin. Sem isto, o admin se promove
    -- e enxerga todas as prefeituras.
    if NEW.role = 'superadmin' then
      raise exception 'Somente um superadmin pode conceder o papel superadmin'
        using errcode = '42501';
    end if;

    -- Auto-promoção/rebaixamento: papel é concedido por outra pessoa, nunca por
    -- si mesmo. Fecha o caminho `profiles_update_own` para escalada lateral.
    if OLD.id = v_uid then
      raise exception 'Você não pode alterar o próprio papel'
        using errcode = '42501';
    end if;
  end if;

  -- ---------------------------------------------------------------------
  -- Admin: segue gerenciando os perfis da própria prefeitura (o painel grava
  -- CPF, matrícula, CNH, secretaria e status direto via PostgREST).
  -- ---------------------------------------------------------------------
  if public.is_admin() then
    return NEW;
  end if;

  -- ---------------------------------------------------------------------
  -- Demais papéis: reversão silenciosa (comportamento de 20260727180000).
  -- ---------------------------------------------------------------------

  -- Vínculo e papel (trava original)
  NEW.role          := OLD.role;
  NEW.department_id := OLD.department_id;

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
  'Impede escalada de privilégio via profiles_update_own (RLS permite update em qualquer coluna). Só superadmin e operações sem sessão passam livres. Para todos os demais: tenant_id é preservado, promover a superadmin e alterar o próprio papel levantam exceção. Para quem não é admin, as demais colunas administrativas (papel, secretaria, vínculo de parceiro, bloqueio, identidade, CNH, score) são revertidas silenciosamente; campos de autoatendimento do app do motorista seguem editáveis.';
