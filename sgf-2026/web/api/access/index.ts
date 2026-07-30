import { getCaller } from '../_lib/caller.js';
import { createManager } from '../_lib/manager-access.js';
import { preRegisterDriver } from '../_lib/driver-access.js';
import { getSupabaseAdmin } from '../_lib/supabase-admin.js';

const MODULES = new Set([
    'dashboard', 'map', 'notifications', 'fleet', 'drivers', 'trips',
    'refuelings', 'stations', 'maintenances', 'repair_shops', 'checklists',
    'infractions', 'departments', 'reports', 'settings',
]);
const ROLES = new Set(['admin', 'gestor', 'secretario', 'motorista']);

interface ApiRequest {
    body?: unknown;
    method?: string;
    headers?: Record<string, string | string[] | undefined>;
    get?: (name: string) => string | undefined;
}

interface ApiResponse {
    status: (status: number) => ApiResponse;
    json: (value: unknown) => unknown;
    end: () => unknown;
    setHeader: (name: string, value: string) => void;
}

function bodyOf(req: ApiRequest): Record<string, unknown> {
    if (typeof req.body === 'string') {
        const parsed: unknown = JSON.parse(req.body);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};
    }
    return req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? req.body as Record<string, unknown>
        : {};
}

function fail(message: string, status: number): never {
    throw Object.assign(new Error(message), { status });
}

function cleanModules(value: unknown): string[] {
    if (!Array.isArray(value)) return [...MODULES];
    const modules = [...new Set(value.filter((item): item is string => typeof item === 'string'))];
    if (modules.some((module) => !MODULES.has(module))) fail('Há módulos de acesso inválidos.', 400);
    return modules;
}

async function manager(req: ApiRequest) {
    const caller = await getCaller(req);
    if (!caller) fail('Não autenticado', 401);
    if (!['admin', 'gestor', 'superadmin'].includes(caller.role)) {
        fail('Apenas administradores, gestores e superadministradores podem gerenciar acessos.', 403);
    }
    if (caller.role !== 'superadmin' && !caller.tenantId) {
        fail('Usuário sem prefeitura vinculada.', 403);
    }
    return caller;
}

async function targetInScope(id: string, caller: Awaited<ReturnType<typeof manager>>) {
    let query = getSupabaseAdmin()
        .from('profiles')
        .select('id, role, tenant_id')
        .eq('id', id);
    if (caller.role !== 'superadmin') {
        query = query.eq('tenant_id', caller.tenantId!);
    }
    const { data } = await query.maybeSingle();
    if (!data) fail('Acesso não encontrado no seu escopo.', 404);
    return data;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
    try {
        const caller = await manager(req);
        const admin = getSupabaseAdmin();

        if (req.method === 'GET') {
            let query = admin
                .from('profiles')
                .select('id, full_name, email, cpf, role, tenant_id, department_id, access_blocked, allowed_modules, driver_status, created_at, departments(id, name), tenants(id, name)')
                .in('role', [...ROLES])
                .order('full_name');
            if (caller.role !== 'superadmin') {
                query = query.eq('tenant_id', caller.tenantId!);
            }
            const { data, error } = await query;
            if (error) throw error;
            return res.status(200).json(data ?? []);
        }

        const body = bodyOf(req);

        if (req.method === 'POST') {
            const role = String(body.role ?? '').toLowerCase();
            if (!ROLES.has(role)) fail('Cargo inválido.', 400);
            if (role === 'admin' && !['admin', 'superadmin'].includes(caller.role)) {
                fail('Somente um administrador pode criar outro administrador.', 403);
            }
            const targetTenantId = caller.role === 'superadmin'
                ? String(body.tenantId ?? '')
                : caller.tenantId!;
            if (!targetTenantId) fail('Selecione a prefeitura do novo acesso.', 400);

            const { data: tenant } = await admin
                .from('tenants')
                .select('id')
                .eq('id', targetTenantId)
                .maybeSingle();
            if (!tenant) fail('Prefeitura não encontrada.', 404);

            if (body.departmentId) {
                const { data: department } = await admin
                    .from('departments')
                    .select('id')
                    .eq('id', String(body.departmentId))
                    .eq('tenant_id', targetTenantId)
                    .maybeSingle();
                if (!department) fail('A secretaria não pertence à prefeitura selecionada.', 400);
            }

            const allowedModules = role === 'motorista' ? [] : cleanModules(body.allowedModules);
            let created: { id: string; tempPassword?: string | null };
            if (role === 'motorista') {
                created = await preRegisterDriver({
                    cpf: String(body.cpf ?? ''),
                    name: String(body.name ?? ''),
                    registrationNumber: String(body.registrationNumber ?? ''),
                    departmentId: body.departmentId || undefined,
                    tenantId: targetTenantId,
                    actorId: caller.id,
                });
            } else {
                created = await createManager({
                    name: String(body.name ?? ''),
                    email: String(body.email ?? ''),
                    password: String(body.password ?? ''),
                    departmentId: body.departmentId || undefined,
                    role: role as 'admin' | 'gestor' | 'secretario',
                    tenantId: targetTenantId,
                    actorId: caller.id,
                });
            }

            const { data: profile, error } = await admin
                .from('profiles')
                .update({ allowed_modules: allowedModules, updated_by: caller.id })
                .eq('id', created.id)
                .select('id, full_name, email, cpf, role, tenant_id, department_id, access_blocked, allowed_modules, driver_status, created_at, departments(id, name), tenants(id, name)')
                .single();
            if (error) {
                await admin.auth.admin.deleteUser(created.id);
                throw error;
            }
            return res.status(201).json({
                ...profile,
                tempPassword: created.tempPassword ?? null,
            });
        }

        const id = String(body.id ?? '');
        if (!id) fail('Informe o acesso.', 400);
        const target = await targetInScope(id, caller);
        if (target.id === caller.id && (req.method === 'DELETE' || body.accessBlocked === true)) {
            fail('Você não pode excluir ou desativar o próprio acesso.', 400);
        }
        if (caller.role === 'gestor' && target.role === 'admin') {
            fail('Gestores não podem alterar administradores.', 403);
        }

        if (req.method === 'PATCH') {
            const update: Record<string, unknown> = { updated_by: caller.id };
            if (typeof body.accessBlocked === 'boolean') {
                update.access_blocked = body.accessBlocked;
                if (target.role === 'motorista') {
                    update.driver_status = body.accessBlocked ? 'inativo' : 'ativo';
                }
            }
            if (body.allowedModules !== undefined && target.role !== 'motorista') {
                update.allowed_modules = cleanModules(body.allowedModules);
            }
            const { data, error } = await admin
                .from('profiles')
                .update(update)
                .eq('id', id)
                .select('id, full_name, email, cpf, role, tenant_id, department_id, access_blocked, allowed_modules, driver_status, created_at, departments(id, name), tenants(id, name)')
                .single();
            if (error) throw error;
            return res.status(200).json(data);
        }

        if (req.method === 'DELETE') {
            const { error } = await admin.auth.admin.deleteUser(id);
            if (error) throw error;
            return res.status(204).end();
        }

        res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
        return res.status(405).json({ message: 'Método não permitido.' });
    } catch (error) {
        const status = typeof error === 'object'
            && error !== null
            && 'status' in error
            && typeof error.status === 'number'
            ? error.status
            : 400;
        return res.status(status).json({
            message: error instanceof Error ? error.message : 'Não foi possível gerenciar o acesso.',
        });
    }
}
