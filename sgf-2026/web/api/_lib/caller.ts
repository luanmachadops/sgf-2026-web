import { assertServerSession } from './session-access.js';
import { getSupabaseAdmin } from './supabase-admin.js';

interface ApiRequest {
    headers?: Record<string, string | string[] | undefined>;
    get?: (name: string) => string | string[] | undefined | null;
}

export interface Caller {
    id: string;
    role: string;
    departmentId: string | null;
    tenantId: string | null;
    accessBlocked: boolean;
    driverStatus: string | null;
    allowedModules: string[];
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
        throw Object.assign(new Error('Usuário sem prefeitura vinculada'), { status: 403 });
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
        throw Object.assign(new Error('O perfil informado não é um motorista'), { status: 403 });
    }
}

/** Lê e valida o JWT do header Authorization, retornando o perfil do chamador. */
export async function getCaller(req: ApiRequest): Promise<Caller | null> {
    const firstHeaderValue = (value: unknown): string | null => {
        if (typeof value === 'string') return value;
        if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
        return null;
    };
    const header = firstHeaderValue(
        req.headers?.authorization
        ?? req.headers?.Authorization
        ?? (typeof req.get === 'function' ? req.get('authorization') : null),
    );
    const fallbackToken = firstHeaderValue(
        req.headers?.['x-access-token']
        ?? req.headers?.['X-Access-Token']
        ?? (typeof req.get === 'function' ? req.get('x-access-token') : null),
    );
    const token = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
        || fallbackToken?.trim()
        || null;
    if (!token) return null;

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;
    await assertServerSession(admin, data.user.id, token);

    const { data: profile } = await admin
        .from('profiles')
        .select('role, department_id, tenant_id, access_blocked, driver_status, allowed_modules')
        .eq('id', data.user.id)
        .single();
    if (!profile) return null;
    if (profile.role !== 'superadmin') {
        const { data: tenant, error: tenantError } = await admin.from('tenants')
            .select('status').eq('id', profile.tenant_id).maybeSingle();
        if (tenantError) throw Object.assign(new Error('Não foi possível verificar a prefeitura.'), { status: 503 });
        if (!tenant || tenant.status === 'suspended') {
            throw Object.assign(new Error('Acesso da prefeitura indisponível.'), { status: 403 });
        }
    }

    // Bloqueio é decidido no perfil, não no JWT: o token continua válido até
    // expirar, então sem esta checagem bloquear alguém no painel não impede
    // que ele siga chamando as rotas /api com o token que já tinha em mãos.
    const accessBlocked = profile.access_blocked === true;
    const driverStatus = profile.driver_status ?? null;
    if (accessBlocked || driverStatus === 'inativo' || driverStatus === 'suspenso') {
        throw Object.assign(new Error('Acesso bloqueado. Procure a prefeitura.'), { status: 403 });
    }

    return {
        id: data.user.id,
        role: profile.role,
        departmentId: profile.department_id,
        tenantId: profile.tenant_id ?? null,
        accessBlocked,
        driverStatus,
        allowedModules: profile.allowed_modules ?? [],
    };
}

/** Garante que o chamador pode gerenciar motoristas (admin, gestor ou secretário). */
export function assertCanManageDrivers(caller: Caller | null): asserts caller is Caller {
    if (!caller) {
        throw Object.assign(new Error('Não autenticado'), { status: 401 });
    }
    if (!['admin', 'gestor', 'secretario'].includes(caller.role)) {
        throw Object.assign(new Error('Sem permissão para gerenciar motoristas'), { status: 403 });
    }
    assertScopedToTenant(caller);
    if (!caller.allowedModules.includes('drivers')) {
        throw Object.assign(new Error('Módulo de motoristas não autorizado.'), { status: 403 });
    }
}

/**
 * Resolve a secretaria a ser usada:
 * - secretário: força a própria secretaria (rejeita tentativa de cadastrar em outra);
 * - admin/gestor: usa a secretaria solicitada (livre).
 */
export function resolveScopedDepartment(caller: Caller, requested?: string | null): string | undefined {
    if (caller.role === 'secretario') {
        if (!caller.departmentId) {
            throw Object.assign(new Error('Secretário sem secretaria vinculada'), { status: 403 });
        }
        if (requested && requested !== caller.departmentId) {
            throw Object.assign(new Error('Você só pode cadastrar na sua própria secretaria'), { status: 403 });
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
    assertCanManageDrivers(caller);
    if (!['admin', 'gestor', 'secretario'].includes(caller.role)) {
        throw Object.assign(new Error('Sem permissão'), { status: 403 });
    }
    assertScopedToTenant(caller);

    const admin = getSupabaseAdmin();
    const { data: driver } = await admin
        .from('profiles')
        .select('role, tenant_id, department_id')
        .eq('id', driverId)
        .single();
    if (!driver) {
        throw Object.assign(new Error('Motorista não encontrado'), { status: 404 });
    }
    // O `[id]` da rota é um profile QUALQUER, não necessariamente um motorista.
    // Sem esta checagem, /api/drivers/<id do admin>/reset-password troca a senha
    // do admin da prefeitura — um gestor assumiria a conta dele.
    assertTargetIsDriver(driver.role);
    // Isolamento por prefeitura (vale para todos os papéis de gestão).
    if (driver.tenant_id !== caller.tenantId) {
        throw Object.assign(new Error('Motorista fora da sua prefeitura'), { status: 403 });
    }
    // Secretário: além do tenant, restrito à própria secretaria.
    if (caller.role === 'secretario' && driver.department_id !== caller.departmentId) {
        throw Object.assign(new Error('Motorista fora da sua secretaria'), { status: 403 });
    }
}
