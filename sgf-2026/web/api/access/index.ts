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

function bodyOf(req: any): Record<string, any> {
    return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
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

async function manager(req: any) {
    const caller = await getCaller(req);
    if (!caller) fail('Não autenticado', 401);
    if (!['admin', 'gestor'].includes(caller.role)) {
        fail('Apenas administradores e gestores podem gerenciar acessos.', 403);
    }
    if (!caller.tenantId) fail('Usuário sem prefeitura vinculada.', 403);
    return caller;
}

async function targetInTenant(id: string, tenantId: string) {
    const { data } = await getSupabaseAdmin()
        .from('profiles')
        .select('id, role, tenant_id')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle();
    if (!data) fail('Acesso não encontrado nesta prefeitura.', 404);
    return data;
}

export default async function handler(req: any, res: any) {
    try {
        const caller = await manager(req);
        const admin = getSupabaseAdmin();

        if (req.method === 'GET') {
            const { data, error } = await admin
                .from('profiles')
                .select('id, full_name, email, cpf, role, department_id, access_blocked, allowed_modules, driver_status, created_at, departments(id, name)')
                .eq('tenant_id', caller.tenantId)
                .in('role', [...ROLES])
                .order('full_name');
            if (error) throw error;
            return res.status(200).json(data ?? []);
        }

        const body = bodyOf(req);

        if (req.method === 'POST') {
            const role = String(body.role ?? '').toLowerCase();
            if (!ROLES.has(role)) fail('Cargo inválido.', 400);
            if (role === 'admin' && caller.role !== 'admin') {
                fail('Somente um administrador pode criar outro administrador.', 403);
            }

            const allowedModules = role === 'motorista' ? [] : cleanModules(body.allowedModules);
            let created: any;
            if (role === 'motorista') {
                created = await preRegisterDriver({
                    cpf: String(body.cpf ?? ''),
                    name: String(body.name ?? ''),
                    registrationNumber: String(body.registrationNumber ?? ''),
                    departmentId: body.departmentId || undefined,
                    tenantId: caller.tenantId,
                    actorId: caller.id,
                });
            } else {
                created = await createManager({
                    name: String(body.name ?? ''),
                    email: String(body.email ?? ''),
                    password: String(body.password ?? ''),
                    departmentId: body.departmentId || undefined,
                    role: role as 'admin' | 'gestor' | 'secretario',
                    tenantId: caller.tenantId,
                    actorId: caller.id,
                });
            }

            const { data: profile, error } = await admin
                .from('profiles')
                .update({ allowed_modules: allowedModules, updated_by: caller.id })
                .eq('id', created.id)
                .select('id, full_name, email, cpf, role, department_id, access_blocked, allowed_modules, driver_status, created_at, departments(id, name)')
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
        const target = await targetInTenant(id, caller.tenantId);
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
                .select('id, full_name, email, cpf, role, department_id, access_blocked, allowed_modules, driver_status, created_at, departments(id, name)')
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
        const status = (error as any)?.status ?? 400;
        return res.status(status).json({
            message: error instanceof Error ? error.message : 'Não foi possível gerenciar o acesso.',
        });
    }
}
