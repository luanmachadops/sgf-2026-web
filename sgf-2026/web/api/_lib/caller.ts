import { getSupabaseAdmin } from './supabase-admin.js';

export interface Caller {
    id: string;
    role: string;
    departmentId: string | null;
    tenantId: string | null;
    accessBlocked: boolean;
    driverStatus: string | null;
}

/**
 * Garante que o chamador tem prefeitura definida.
 *
 * O `tenant_id` é a única coisa que separa uma prefeitura da outra. Se ele for
 * nulo dos DOIS lados, a comparação `alvo.tenant_id !== caller.tenantId` passa
 * e o isolamento multi-tenant deixa de existir — por isso a exigência é
 * explícita aqui, e não implícita na comparação.
 *
 * NÃO há exceção para superadmin, de propósito:
 *   • `assertCanManageDrivers` e `assertCanManagePartners` só aceitam
 *     admin/gestor/secretário — superadmin nunca chegou a passar por elas;
 *   • `profiles.tenant_id` é NOT NULL no banco (default `get_user_tenant_id()`),
 *     e o superadmin em produção tem tenant preenchido.
 * Ou seja: nenhum fluxo legítimo depende de chamador sem tenant. Se um dia o
 * superadmin precisar operar cross-tenant, isso tem de ser um desvio NOMEADO
 * (checando `role === 'superadmin'`), nunca o efeito colateral de um NULL.
 */
function assertScopedToTenant(caller: Caller): void {
    if (!caller.tenantId) {
        const e: any = new Error('Usuário sem prefeitura vinculada'); e.status = 403; throw e;
    }
}

/**
 * Garante que o perfil ALVO de uma ação de motorista é mesmo um motorista.
 *
 * As rotas /api/drivers/[id]/* recebem um id de `profiles` cru — admin, gestor,
 * secretário, posto e oficina moram na MESMA tabela. Sem esta trava, "redefinir
 * a senha do motorista X" vira "redefinir a senha de qualquer um da prefeitura",
 * inclusive do admin, e quem redefine a senha assume a conta.
 *
 * Exportada para poder ser reaplicada nas funções de `driver-access.ts`, que
 * também são exportadas e poderiam ser chamadas por uma rota nova que esquecesse
 * de passar por aqui (defesa em profundidade).
 */
export function assertTargetIsDriver(role: string | null | undefined): void {
    if (role !== 'motorista') {
        const e: any = new Error('O perfil informado não é um motorista'); e.status = 403; throw e;
    }
}

/** Lê e valida o JWT do header Authorization, retornando o perfil do chamador. */
export async function getCaller(req: any): Promise<Caller | null> {
    const header = req.headers?.authorization || req.headers?.Authorization;
    const fallbackToken = req.headers?.['x-access-token'] || req.headers?.['X-Access-Token'];
    const token = typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice(7)
        : typeof fallbackToken === 'string' && fallbackToken
            ? fallbackToken
            : null;
    if (!token) return null;

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;

    const { data: profile } = await admin
        .from('profiles')
        .select('role, department_id, tenant_id, access_blocked, driver_status')
        .eq('id', data.user.id)
        .single();
    if (!profile) return null;

    // Bloqueio é decidido no perfil, não no JWT: o token continua válido até
    // expirar, então sem esta checagem bloquear alguém no painel não impede
    // que ele siga chamando as rotas /api com o token que já tinha em mãos.
    const accessBlocked = (profile as any).access_blocked === true;
    const driverStatus = (profile as any).driver_status ?? null;
    if (accessBlocked || driverStatus === 'inativo' || driverStatus === 'suspenso') {
        const e: any = new Error('Acesso bloqueado. Procure a prefeitura.'); e.status = 403; throw e;
    }

    return {
        id: data.user.id,
        role: profile.role,
        departmentId: profile.department_id,
        tenantId: (profile as any).tenant_id ?? null,
        accessBlocked,
        driverStatus,
    };
}

/** Garante que o chamador pode gerenciar motoristas (admin, gestor ou secretário). */
export function assertCanManageDrivers(caller: Caller | null): asserts caller is Caller {
    if (!caller) {
        const e: any = new Error('Não autenticado'); e.status = 401; throw e;
    }
    if (!['admin', 'gestor', 'secretario'].includes(caller.role)) {
        const e: any = new Error('Sem permissão para gerenciar motoristas'); e.status = 403; throw e;
    }
    assertScopedToTenant(caller);
}

/**
 * Resolve a secretaria a ser usada:
 * - secretário: força a própria secretaria (rejeita tentativa de cadastrar em outra);
 * - admin/gestor: usa a secretaria solicitada (livre).
 */
export function resolveScopedDepartment(caller: Caller, requested?: string | null): string | undefined {
    if (caller.role === 'secretario') {
        if (!caller.departmentId) {
            const e: any = new Error('Secretário sem secretaria vinculada'); e.status = 403; throw e;
        }
        if (requested && requested !== caller.departmentId) {
            const e: any = new Error('Você só pode cadastrar na sua própria secretaria'); e.status = 403; throw e;
        }
        return caller.departmentId;
    }
    return requested ?? undefined;
}

/**
 * Para ações sobre um motorista específico:
 * - o alvo TEM de ser um motorista (ver `assertTargetIsDriver`);
 * - admin/gestor: apenas motoristas do seu tenant (isolamento multi-prefeitura);
 * - secretário: apenas motoristas da sua secretaria (dentro do seu tenant).
 */
export async function assertCanActOnDriver(caller: Caller, driverId: string): Promise<void> {
    if (!['admin', 'gestor', 'secretario'].includes(caller.role)) {
        const e: any = new Error('Sem permissão'); e.status = 403; throw e;
    }
    assertScopedToTenant(caller);

    const admin = getSupabaseAdmin();
    const { data: driver } = await admin
        .from('profiles')
        .select('role, tenant_id, department_id')
        .eq('id', driverId)
        .single();
    if (!driver) {
        const e: any = new Error('Motorista não encontrado'); e.status = 404; throw e;
    }
    // O `[id]` da rota é um profile QUALQUER, não necessariamente um motorista.
    // Sem esta checagem, /api/drivers/<id do admin>/reset-password troca a senha
    // do admin da prefeitura — um gestor assumiria a conta dele.
    assertTargetIsDriver((driver as any).role);
    // Isolamento por prefeitura (vale para todos os papéis de gestão).
    if ((driver as any).tenant_id !== caller.tenantId) {
        const e: any = new Error('Motorista fora da sua prefeitura'); e.status = 403; throw e;
    }
    // Secretário: além do tenant, restrito à própria secretaria.
    if (caller.role === 'secretario' && driver.department_id !== caller.departmentId) {
        const e: any = new Error('Motorista fora da sua secretaria'); e.status = 403; throw e;
    }
}
