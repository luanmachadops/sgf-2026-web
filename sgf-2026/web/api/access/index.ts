import { getCaller, type Caller } from '../_lib/caller.js';
import { createManager } from '../_lib/manager-access.js';
import { preRegisterDriver } from '../_lib/driver-access.js';
import { getSupabaseAdmin } from '../_lib/supabase-admin.js';
import { assertManagedTarget, canManageAccess } from '../_lib/access-policy.js';
import { assertStrongPassword, generateTempPassword } from '../_lib/password-policy.js';
import { checkRateLimitByKey, sendRateLimited } from '../_lib/rate-limit.js';

/**
 * Gestão de acessos — exclusiva de administrador e superadministrador.
 *
 *   GET    /access                                  → todos os acessos ativos do escopo
 *   GET    /access?partnerType=posto&partnerId=…    → usuários de um posto/oficina
 *   GET    /access?impact=<id>                       → o que a exclusão vai fazer
 *   POST   /access  { role, … }                      → cria (equipe, motorista, posto, oficina)
 *   PATCH  /access  { id, name?, email?, departmentId?, role?, allowedModules?, accessBlocked?, resetPassword? }
 *   DELETE /access  { id }                           → exclui de vez OU arquiva (quem tem histórico)
 *
 * Excluir nunca apaga histórico: quem já registrou algo (viagem, abastecimento,
 * aprovação, nota…) é ARQUIVADO — login desligado, some das listas, o nome
 * continua nos registros e o e-mail fica livre para reuso.
 */

const MODULES = new Set([
    'dashboard', 'map', 'notifications', 'fleet', 'drivers', 'trips',
    'refuelings', 'stations', 'maintenances', 'repair_shops', 'checklists',
    'infractions', 'departments', 'reports', 'settings', 'budgets', 'procurement',
]);
const STAFF_ROLES = new Set(['admin', 'gestor', 'secretario']);
const PARTNER_ROLES = new Set(['posto', 'oficina']);
const LISTED_ROLES = ['admin', 'gestor', 'secretario', 'motorista', 'posto', 'oficina'];
const PARTNER_TABLE = { posto: 'fuel_stations', oficina: 'repair_shops' } as const;
const PARTNER_LINK = { posto: 'station_id', oficina: 'repair_shop_id' } as const;
const SELECT = 'id, full_name, email, cpf, phone, role, tenant_id, department_id, station_id, repair_shop_id, access_blocked, must_change_password, allowed_modules, driver_status, created_at, departments(id, name), tenants(id, name), fuel_stations(id, name), repair_shops(id, name)';

interface ApiRequest {
    body?: unknown;
    method?: string;
    query?: Record<string, string | string[] | undefined>;
    headers?: Record<string, string | string[] | undefined>;
    get?: (name: string) => string | undefined;
}

interface ApiResponse {
    status: (status: number) => ApiResponse;
    json: (value: unknown) => unknown;
    end: () => unknown;
    setHeader: (name: string, value: string) => void;
}

type PartnerRole = 'posto' | 'oficina';
interface TargetRow { id: string; role: string; tenant_id: string; email: string | null; full_name: string | null }

function bodyOf(req: ApiRequest): Record<string, unknown> {
    if (typeof req.body === 'string') {
        const parsed: unknown = JSON.parse(req.body);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    }
    return req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
}

function queryValue(req: ApiRequest, key: string): string {
    const value = req.query?.[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

function fail(message: string, status: number): never {
    throw Object.assign(new Error(message), { status });
}

function cleanText(value: unknown, max = 160): string {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanEmail(value: unknown): string {
    const email = cleanText(value, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Informe um e-mail válido.', 400);
    return email;
}

function cleanModules(value: unknown): string[] {
    if (!Array.isArray(value)) return [...MODULES];
    const modules = [...new Set(value.filter((item): item is string => typeof item === 'string'))];
    if (modules.some((module) => !MODULES.has(module))) fail('Há módulos de acesso inválidos.', 400);
    return modules;
}

function duplicateEmail(message: string | undefined): boolean {
    return /already|registered|exists|duplicate/i.test(message ?? '');
}

async function accessManager(req: ApiRequest): Promise<Caller> {
    const caller = await getCaller(req);
    if (!caller) fail('Não autenticado', 401);
    if (!canManageAccess(caller.role)) fail('Somente o administrador pode gerenciar acessos.', 403);
    if (caller.role !== 'superadmin' && !caller.tenantId) fail('Usuário sem prefeitura vinculada.', 403);
    return caller;
}

async function targetInScope(id: string, caller: Caller): Promise<TargetRow> {
    let query = getSupabaseAdmin()
        .from('profiles')
        .select('id, role, tenant_id, email, full_name')
        .eq('id', id)
        .is('archived_at', null);
    if (caller.role !== 'superadmin') query = query.eq('tenant_id', caller.tenantId!);
    const { data } = await query.maybeSingle();
    if (!data) fail('Acesso não encontrado.', 404);
    return data as TargetRow;
}

async function partnerInScope(type: unknown, partnerId: unknown, tenantId: string) {
    if (type !== 'posto' && type !== 'oficina') fail('Tipo de parceiro inválido.', 400);
    const id = cleanText(partnerId, 50);
    if (!id) fail('Informe o posto ou a oficina.', 400);
    const { data } = await getSupabaseAdmin()
        .from(PARTNER_TABLE[type])
        .select('id, name, tenant_id')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle();
    if (!data) fail(type === 'posto' ? 'Posto não encontrado nesta prefeitura.' : 'Oficina não encontrada nesta prefeitura.', 404);
    return { type: type as PartnerRole, id: (data as { id: string }).id };
}

/** A prefeitura nunca pode ficar sem um administrador ativo. */
async function assertNotLastAdmin(target: TargetRow) {
    if (target.role !== 'admin') return;
    const { count } = await getSupabaseAdmin()
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', target.tenant_id)
        .eq('role', 'admin')
        .eq('access_blocked', false)
        .is('archived_at', null)
        .neq('id', target.id);
    if (!count) fail('Esta é a última conta de administrador ativa da prefeitura. Crie ou reative outro administrador antes.', 409);
}

async function historyCount(id: string): Promise<number> {
    const { data, error } = await getSupabaseAdmin().rpc('profile_history_count', { p_profile_id: id });
    if (error) fail('Não foi possível verificar o histórico deste acesso.', 503);
    return Number(data ?? 0);
}

async function createPartnerUser(caller: Caller, tenantId: string, body: Record<string, unknown>) {
    const partner = await partnerInScope(body.partnerType ?? body.role, body.partnerId, tenantId);
    const admin = getSupabaseAdmin();
    const name = cleanText(body.name);
    if (name.length < 3) fail('Informe o nome do responsável.', 400);
    const email = cleanEmail(body.email);
    const password = generateTempPassword();

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
        app_metadata: { tenant_id: tenantId },
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name, role: partner.type, tenant_id: tenantId },
    });
    if (authError || !authData.user) {
        fail(duplicateEmail(authError?.message) ? 'Já existe uma conta com esse e-mail.' : (authError?.message || 'Não foi possível criar o acesso.'), duplicateEmail(authError?.message) ? 409 : 400);
    }
    const { error } = await admin.from('profiles').update({
        full_name: name,
        email,
        role: partner.type,
        tenant_id: tenantId,
        [PARTNER_LINK[partner.type]]: partner.id,
        must_change_password: true,
        access_blocked: false,
        created_by: caller.id,
        updated_by: caller.id,
    }).eq('id', authData.user.id);
    if (error) {
        await admin.auth.admin.deleteUser(authData.user.id);
        fail(error.message, 400);
    }
    return { id: authData.user.id, tempPassword: password };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
    try {
        res.setHeader('Cache-Control', 'no-store');
        if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method ?? '')) {
            res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
            return res.status(405).json({ message: 'Método não permitido.' });
        }
        const caller = await accessManager(req);
        const admin = getSupabaseAdmin();

        if (req.method === 'GET') {
            const impactId = queryValue(req, 'impact');
            if (impactId) {
                const target = await targetInScope(impactId, caller);
                assertManagedTarget(caller, target);
                const history = await historyCount(target.id);
                return res.status(200).json({ history, action: history > 0 ? 'archive' : 'delete' });
            }

            let query = admin
                .from('profiles')
                .select(SELECT)
                .in('role', LISTED_ROLES)
                .is('archived_at', null)
                .order('full_name');
            if (caller.role !== 'superadmin') query = query.eq('tenant_id', caller.tenantId!);
            const partnerType = queryValue(req, 'partnerType');
            const partnerId = queryValue(req, 'partnerId');
            if (partnerType || partnerId) {
                if (partnerType !== 'posto' && partnerType !== 'oficina') fail('Tipo de parceiro inválido.', 400);
                query = query.eq('role', partnerType).eq(PARTNER_LINK[partnerType], partnerId);
            }
            const { data, error } = await query;
            if (error) throw error;
            return res.status(200).json(data ?? []);
        }

        const body = bodyOf(req);
        const limit = await checkRateLimitByKey(`access-management:${caller.id}`, 60, 30);
        if (!limit.allowed) return sendRateLimited(res, limit, 'Muitas alterações de acesso. Aguarde e tente novamente.');

        if (req.method === 'POST') {
            const role = String(body.role ?? '').toLowerCase();
            if (!STAFF_ROLES.has(role) && !PARTNER_ROLES.has(role) && role !== 'motorista') fail('Cargo inválido.', 400);
            const tenantId = caller.role === 'superadmin' ? cleanText(body.tenantId, 50) : caller.tenantId!;
            if (!tenantId) fail('Selecione a prefeitura do novo acesso.', 400);
            const { data: tenant } = await admin.from('tenants').select('id').eq('id', tenantId).maybeSingle();
            if (!tenant) fail('Prefeitura não encontrada.', 404);

            const departmentId = cleanText(body.departmentId, 50) || undefined;
            if (departmentId) {
                const { data: department } = await admin.from('departments').select('id')
                    .eq('id', departmentId).eq('tenant_id', tenantId).maybeSingle();
                if (!department) fail('A secretaria não pertence à prefeitura selecionada.', 400);
            }

            let created: { id: string; tempPassword?: string | null };
            if (PARTNER_ROLES.has(role)) {
                created = await createPartnerUser(caller, tenantId, { ...body, partnerType: role });
            } else if (role === 'motorista') {
                created = await preRegisterDriver({
                    cpf: String(body.cpf ?? ''),
                    name: String(body.name ?? ''),
                    registrationNumber: String(body.registrationNumber ?? ''),
                    departmentId,
                    tenantId,
                    actorId: caller.id,
                });
            } else {
                // Senha provisória gerada pelo sistema (mostrada uma vez); quem
                // entra troca no primeiro acesso.
                const password = cleanText(body.password, 72) || generateTempPassword();
                assertStrongPassword(password);
                const profile = await createManager({
                    name: cleanText(body.name),
                    email: cleanEmail(body.email),
                    password,
                    departmentId,
                    role: role as 'admin' | 'gestor' | 'secretario',
                    tenantId,
                    actorId: caller.id,
                }).catch((error: unknown) => {
                    const message = error instanceof Error ? error.message : '';
                    if (duplicateEmail(message)) fail('Já existe uma conta com esse e-mail.', 409);
                    throw error;
                });
                created = { id: (profile as { id: string }).id, tempPassword: password };
                await admin.from('profiles').update({
                    allowed_modules: cleanModules(body.allowedModules),
                    must_change_password: true,
                    updated_by: caller.id,
                }).eq('id', created.id);
            }

            const { data: profile, error } = await admin.from('profiles').select(SELECT).eq('id', created.id).single();
            if (error) throw error;
            return res.status(201).json({ ...profile, tempPassword: created.tempPassword ?? null });
        }

        const id = cleanText(body.id, 50);
        if (!id) fail('Informe o acesso.', 400);
        const target = await targetInScope(id, caller);
        assertManagedTarget(caller, target);
        const isSelf = target.id === caller.id;

        if (req.method === 'PATCH') {
            const update: Record<string, unknown> = { updated_by: caller.id };
            const authUpdate: Record<string, unknown> = {};
            let tempPassword: string | null = null;

            if (body.name !== undefined) {
                const name = cleanText(body.name);
                if (name.length < 3) fail('Informe o nome completo.', 400);
                update.full_name = name;
                authUpdate.user_metadata = { full_name: name };
            }
            if (body.email !== undefined) {
                const email = body.email === '' && target.role === 'motorista' ? null : cleanEmail(body.email);
                update.email = email;
                // Motorista entra por CPF (e-mail interno no Auth): aqui o e-mail é só contato.
                if (target.role !== 'motorista' && email && email !== target.email) {
                    authUpdate.email = email;
                    authUpdate.email_confirm = true;
                }
            }
            if (body.role !== undefined && body.role !== target.role) {
                const role = String(body.role);
                if (!STAFF_ROLES.has(role) || !STAFF_ROLES.has(target.role)) {
                    fail('Só é possível trocar o cargo entre administrador, gestor e secretário.', 400);
                }
                if (isSelf) fail('Outro administrador deve alterar o seu cargo.', 403);
                await assertNotLastAdmin(target);
                update.role = role;
                authUpdate.user_metadata = { ...(authUpdate.user_metadata as object ?? {}), role };
            }
            const finalRole = (update.role as string | undefined) ?? target.role;
            if (body.departmentId !== undefined) {
                const departmentId = cleanText(body.departmentId, 50) || null;
                if (departmentId) {
                    const { data: department } = await admin.from('departments').select('id, name')
                        .eq('id', departmentId).eq('tenant_id', target.tenant_id).maybeSingle();
                    if (!department) fail('A secretaria não pertence a esta prefeitura.', 400);
                    update.department = (department as { name: string }).name;
                } else {
                    update.department = null;
                }
                update.department_id = departmentId;
            }
            if (finalRole === 'secretario' && update.role === 'secretario' && body.departmentId === undefined) {
                const { data: current } = await admin.from('profiles').select('department_id').eq('id', id).single();
                if (!(current as { department_id: string | null } | null)?.department_id) fail('Secretário precisa de uma secretaria.', 400);
            }
            if (finalRole === 'secretario' && body.departmentId !== undefined && !update.department_id) {
                fail('Secretário precisa de uma secretaria.', 400);
            }
            if (body.allowedModules !== undefined && STAFF_ROLES.has(finalRole)) {
                if (isSelf) fail('Outro administrador deve alterar suas permissões.', 403);
                update.allowed_modules = cleanModules(body.allowedModules);
            }
            if (typeof body.accessBlocked === 'boolean') {
                if (isSelf && body.accessBlocked) fail('Você não pode desativar o próprio acesso.', 400);
                if (body.accessBlocked) await assertNotLastAdmin(target);
                update.access_blocked = body.accessBlocked;
                if (target.role === 'motorista') update.driver_status = body.accessBlocked ? 'inativo' : 'ativo';
                authUpdate.ban_duration = body.accessBlocked ? '876000h' : 'none';
            }
            if (body.resetPassword === true) {
                if (isSelf) fail('Para trocar a sua senha, use "Meu perfil".', 400);
                tempPassword = generateTempPassword();
                authUpdate.password = tempPassword;
                update.must_change_password = true;
            }

            if (Object.keys(authUpdate).length > 0) {
                if (authUpdate.user_metadata) {
                    // Mescla com o que já existe (tenant_id, role…), sem sobrescrever.
                    const { data: current } = await admin.auth.admin.getUserById(id);
                    authUpdate.user_metadata = { ...(current?.user?.user_metadata ?? {}), ...(authUpdate.user_metadata as object) };
                }
                const { error: authError } = await admin.auth.admin.updateUserById(id, authUpdate);
                if (authError) {
                    fail(duplicateEmail(authError.message) ? 'Já existe uma conta com esse e-mail.' : 'Não foi possível atualizar o login deste acesso. Tente novamente.', duplicateEmail(authError.message) ? 409 : 503);
                }
            }
            const { data, error } = await admin.from('profiles').update(update).eq('id', id).select(SELECT).single();
            if (error) throw error;
            return res.status(200).json({ ...data, tempPassword });
        }

        // DELETE
        if (isSelf) fail('Você não pode excluir o próprio acesso.', 400);
        await assertNotLastAdmin(target);
        const history = await historyCount(target.id);

        if (history === 0) {
            const { error } = await admin.auth.admin.deleteUser(id);
            if (error) fail('Não foi possível excluir este acesso. Tente novamente.', 503);
            return res.status(200).json({ result: 'deleted' });
        }

        if (target.role === 'motorista') {
            const { count } = await admin.from('trips').select('id', { count: 'exact', head: true })
                .eq('driver_id', id).eq('status', 'andamento');
            if (count) fail('Este motorista está com uma viagem em andamento. Encerre a viagem antes de remover o acesso.', 409);
        }
        // Arquivar: login desligado e e-mail liberado para reuso; o perfil e o
        // nome continuam ligados a todo o histórico.
        const { error: authError } = await admin.auth.admin.updateUserById(id, {
            email: `arquivado+${id}@arquivado.invalid`,
            email_confirm: true,
            ban_duration: '876000h',
        });
        if (authError) fail('Não foi possível desligar o login deste acesso. Tente novamente.', 503);
        const { error } = await admin.from('profiles').update({
            archived_at: new Date().toISOString(),
            access_blocked: true,
            current_vehicle_id: null,
            ...(target.role === 'motorista' ? { driver_status: 'inativo' } : {}),
            updated_by: caller.id,
        }).eq('id', id);
        if (error) throw error;
        return res.status(200).json({ result: 'archived' });
    } catch (error) {
        const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
            ? error.status
            : 400;
        return res.status(status).json({
            message: error instanceof Error ? error.message : 'Não foi possível gerenciar o acesso.',
        });
    }
}
