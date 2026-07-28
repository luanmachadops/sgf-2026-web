import { randomBytes } from 'crypto';
import { getSupabaseAdmin } from './supabase-admin.js';
import type { Caller } from './caller.js';

/**
 * Acesso de PARCEIRO (posto de combustível ou oficina mecânica).
 *
 * São empresas privadas com login no sistema da prefeitura, então tudo aqui
 * gira em torno de duas garantias:
 *
 *  1. O parceiro pertence ao tenant do chamador. O `tenant_id` NUNCA vem do
 *     body — sempre do perfil de quem chama. Sem isso, um admin de uma
 *     prefeitura criaria acesso para o posto de outra.
 *  2. Um login por parceiro (índice único parcial em `profiles`). A checagem
 *     aqui devolve mensagem legível em vez de deixar estourar o 23505.
 */

export type PartnerType = 'posto' | 'oficina';

const TABLE: Record<PartnerType, string> = {
    posto: 'fuel_stations',
    oficina: 'repair_shops',
};

const LINK_COLUMN: Record<PartnerType, 'station_id' | 'repair_shop_id'> = {
    posto: 'station_id',
    oficina: 'repair_shop_id',
};

const LABEL: Record<PartnerType, string> = {
    posto: 'posto',
    oficina: 'oficina',
};

export interface PartnerAccessPayload {
    partnerType: PartnerType;
    partnerId: string;
    name: string;
    email: string;
    password?: string;
}

function assertPartnerType(value: unknown): asserts value is PartnerType {
    if (value !== 'posto' && value !== 'oficina') {
        throw Object.assign(new Error('Tipo de parceiro inválido'), { status: 400 });
    }
}

/** Senha provisória legível: sem caracteres ambíguos, trocada no 1º acesso. */
export function generateTempPassword(): string {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(10);
    const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
    return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
}

/** Garante que só o admin mexe em acesso de parceiro. */
export function assertCanManagePartners(caller: Caller | null): asserts caller is Caller {
    if (!caller) throw Object.assign(new Error('Não autenticado'), { status: 401 });
    if (caller.role !== 'admin') {
        throw Object.assign(new Error('Apenas o administrador pode gerenciar acessos de parceiros'), { status: 403 });
    }
    // `loadPartnerScoped` compara `parceiro.tenant_id !== caller.tenantId`. Com
    // os dois lados nulos a comparação passa e o isolamento entre prefeituras
    // some — então o tenant do chamador tem de existir de verdade. Não há
    // desvio para superadmin: ele já é barrado pela checagem de role acima.
    if (!caller.tenantId) {
        throw Object.assign(new Error('Usuário sem prefeitura vinculada'), { status: 403 });
    }
}

/** Carrega o parceiro e recusa se for de outra prefeitura. */
async function loadPartnerScoped(caller: Caller, partnerType: PartnerType, partnerId: string) {
    assertPartnerType(partnerType);
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from(TABLE[partnerType])
        .select('id, name, tenant_id, is_active')
        .eq('id', partnerId)
        .maybeSingle();

    if (error || !data) {
        throw Object.assign(new Error(`${LABEL[partnerType]} não encontrado`), { status: 404 });
    }
    if ((data as { tenant_id: string }).tenant_id !== caller.tenantId) {
        throw Object.assign(new Error(`Este ${LABEL[partnerType]} é de outra prefeitura`), { status: 403 });
    }
    return data as { id: string; name: string; tenant_id: string; is_active: boolean };
}

/** Perfil de acesso já existente para o parceiro (ou null). */
export async function getPartnerAccess(caller: Caller, partnerType: PartnerType, partnerId: string) {
    await loadPartnerScoped(caller, partnerType, partnerId);
    const admin = getSupabaseAdmin();

    const { data } = await admin
        .from('profiles')
        .select('id, full_name, email, access_blocked, must_change_password, created_at')
        .eq(LINK_COLUMN[partnerType], partnerId)
        .eq('role', partnerType)
        .maybeSingle();

    if (!data) return { access: null };

    // `last_sign_in_at` vive em auth.users, não em profiles.
    const { data: authUser } = await admin.auth.admin.getUserById((data as { id: string }).id);

    return {
        access: {
            ...data,
            last_sign_in_at: authUser?.user?.last_sign_in_at ?? null,
        },
    };
}

export async function createPartnerAccess(caller: Caller, payload: PartnerAccessPayload) {
    assertPartnerType(payload.partnerType);
    const partner = await loadPartnerScoped(caller, payload.partnerType, payload.partnerId);
    const admin = getSupabaseAdmin();

    const email = (payload.email || '').trim().toLowerCase();
    if (!payload.name?.trim()) throw Object.assign(new Error('Informe o nome do responsável'), { status: 400 });
    if (!email.includes('@')) throw Object.assign(new Error('E-mail inválido'), { status: 400 });

    const existing = await getPartnerAccess(caller, payload.partnerType, payload.partnerId);
    if (existing.access) {
        throw Object.assign(
            new Error(`Este ${LABEL[payload.partnerType]} já tem um acesso (${existing.access.email}).`),
            { status: 409 },
        );
    }

    const password = payload.password?.trim() || generateTempPassword();
    if (password.length < 8) {
        throw Object.assign(new Error('Senha deve ter ao menos 8 caracteres'), { status: 400 });
    }

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: payload.name.trim(), role: payload.partnerType, tenant_id: partner.tenant_id },
    });
    if (authError || !authData.user) {
        const dup = /already|registered|exists/i.test(authError?.message ?? '');
        throw Object.assign(
            new Error(dup ? 'Já existe uma conta com esse e-mail.' : (authError?.message || 'Não foi possível criar o acesso')),
            { status: dup ? 409 : 400 },
        );
    }

    const { data: profile, error: profError } = await admin
        .from('profiles')
        .update({
            full_name: payload.name.trim(),
            email,
            role: payload.partnerType,
            tenant_id: partner.tenant_id,
            [LINK_COLUMN[payload.partnerType]]: partner.id,
            must_change_password: true,
            access_blocked: false,
            created_by: caller.id,
            updated_by: caller.id,
        })
        .eq('id', authData.user.id)
        .select('id, full_name, email, access_blocked, must_change_password')
        .single();

    if (profError) {
        // Sem rollback ficaria um usuário autenticável sem perfil — que, com o
        // gate por allowlist, não entra em lugar nenhum, mas é lixo perigoso.
        await admin.auth.admin.deleteUser(authData.user.id);
        throw Object.assign(new Error(profError.message), { status: 400 });
    }

    // A senha é devolvida UMA vez, para o admin entregar ao parceiro.
    return { access: profile, tempPassword: password };
}

export async function resetPartnerPassword(caller: Caller, partnerType: PartnerType, partnerId: string) {
    const existing = await getPartnerAccess(caller, partnerType, partnerId);
    if (!existing.access) throw Object.assign(new Error('Este parceiro ainda não tem acesso'), { status: 404 });

    const admin = getSupabaseAdmin();
    const password = generateTempPassword();

    const { error } = await admin.auth.admin.updateUserById(existing.access.id, { password });
    if (error) throw Object.assign(new Error(error.message), { status: 400 });

    await admin.from('profiles')
        .update({ must_change_password: true, updated_by: caller.id })
        .eq('id', existing.access.id);

    return { success: true, tempPassword: password };
}

export async function setPartnerBlocked(caller: Caller, partnerType: PartnerType, partnerId: string, blocked: boolean) {
    const existing = await getPartnerAccess(caller, partnerType, partnerId);
    if (!existing.access) throw Object.assign(new Error('Este parceiro ainda não tem acesso'), { status: 404 });

    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('profiles')
        .update({ access_blocked: blocked, updated_by: caller.id })
        .eq('id', existing.access.id);
    if (error) throw Object.assign(new Error(error.message), { status: 400 });

    // Bloquear não basta no banco: um token já emitido continua válido até
    // expirar. Encerrar as sessões corta o acesso imediatamente.
    if (blocked) {
        await admin.auth.admin.signOut(existing.access.id, 'global').catch(() => { /* best-effort */ });
    }

    return { success: true, blocked };
}
