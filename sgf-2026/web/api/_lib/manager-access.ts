import { getSupabaseAdmin } from './supabase-admin.js';

export interface CreateManagerPayload {
    name: string;
    email: string;
    password: string;
    departmentId?: string;
    role?: 'secretario' | 'gestor';
}

/**
 * Cria um usuário do PAINEL (secretário ou gestor). Login por e-mail.
 * Secretário fica vinculado a uma secretaria (department_id) e é escopado por RLS.
 */
export async function createManager(payload: CreateManagerPayload) {
    const supabaseAdmin = getSupabaseAdmin();
    const role = payload.role === 'gestor' ? 'gestor' : 'secretario';
    const email = (payload.email || '').trim().toLowerCase();

    if (!payload.name?.trim()) throw Object.assign(new Error('Nome é obrigatório'), { status: 400 });
    if (!email || !email.includes('@')) throw Object.assign(new Error('E-mail inválido'), { status: 400 });
    if (!payload.password || payload.password.length < 6) {
        throw Object.assign(new Error('Senha deve ter ao menos 6 caracteres'), { status: 400 });
    }
    if (role === 'secretario' && !payload.departmentId) {
        throw Object.assign(new Error('Secretário precisa de uma secretaria'), { status: 400 });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: payload.password,
        email_confirm: true,
        user_metadata: { full_name: payload.name, role },
    });
    if (authError || !authData.user) {
        throw Object.assign(new Error(authError?.message || 'Não foi possível criar o acesso'), { status: 400 });
    }

    const { data: profile, error: profError } = await supabaseAdmin
        .from('profiles')
        .update({
            full_name: payload.name.trim(),
            email,
            role,
            department_id: payload.departmentId || null,
        })
        .eq('id', authData.user.id)
        .select('*, departments(id, name)')
        .single();

    if (profError) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        throw Object.assign(new Error(profError.message), { status: 400 });
    }

    return profile;
}
