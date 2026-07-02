import { getSupabaseAdmin } from './supabase-admin.js';

export interface Caller {
    id: string;
    role: string;
    departmentId: string | null;
    tenantId: string | null;
}

/** Lê e valida o JWT do header Authorization, retornando o perfil do chamador. */
export async function getCaller(req: any): Promise<Caller | null> {
    const header = req.headers?.authorization || req.headers?.Authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice(7)
        : null;
    if (!token) return null;

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;

    const { data: profile } = await admin
        .from('profiles')
        .select('role, department_id, tenant_id')
        .eq('id', data.user.id)
        .single();
    if (!profile) return null;

    return { id: data.user.id, role: profile.role, departmentId: profile.department_id, tenantId: (profile as any).tenant_id ?? null };
}

/** Garante que o chamador pode gerenciar motoristas (admin, gestor ou secretário). */
export function assertCanManageDrivers(caller: Caller | null): asserts caller is Caller {
    if (!caller) {
        const e: any = new Error('Não autenticado'); e.status = 401; throw e;
    }
    if (!['admin', 'gestor', 'secretario'].includes(caller.role)) {
        const e: any = new Error('Sem permissão para gerenciar motoristas'); e.status = 403; throw e;
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
 * - admin/gestor: apenas motoristas do seu tenant (isolamento multi-prefeitura);
 * - secretário: apenas motoristas da sua secretaria (dentro do seu tenant).
 */
export async function assertCanActOnDriver(caller: Caller, driverId: string): Promise<void> {
    if (!['admin', 'gestor', 'secretario'].includes(caller.role)) {
        const e: any = new Error('Sem permissão'); e.status = 403; throw e;
    }
    const admin = getSupabaseAdmin();
    const { data: driver } = await admin
        .from('profiles')
        .select('tenant_id, department_id')
        .eq('id', driverId)
        .single();
    if (!driver) {
        const e: any = new Error('Motorista não encontrado'); e.status = 404; throw e;
    }
    // Isolamento por prefeitura (vale para todos os papéis de gestão).
    if ((driver as any).tenant_id !== caller.tenantId) {
        const e: any = new Error('Motorista fora da sua prefeitura'); e.status = 403; throw e;
    }
    // Secretário: além do tenant, restrito à própria secretaria.
    if (caller.role === 'secretario' && driver.department_id !== caller.departmentId) {
        const e: any = new Error('Motorista fora da sua secretaria'); e.status = 403; throw e;
    }
}
