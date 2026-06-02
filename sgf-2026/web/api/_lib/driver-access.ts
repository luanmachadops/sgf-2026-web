import { getSupabaseAdmin } from './supabase-admin.js';

// Banco unificado: motorista vive em `public.profiles` com role='motorista'.
// O `id` do profile = `id` do auth.users (trigger handle_new_user já cria a row).

type DriverDbStatus = 'ativo' | 'inativo' | 'suspenso';
type DriverWebStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface CreateDriverPayload {
    cpf: string;
    name: string;
    registrationNumber: string;
    cnhNumber: string;
    cnhCategory: string;
    cnhExpiryDate: string;
    departmentId?: string;
    phone?: string;
    email?: string;
    status?: DriverWebStatus;
    password: string;
}

export interface DriverAccessPayload {
    password: string;
}

function normalizeCpf(cpf: string) {
    return cpf.replace(/\D/g, '');
}

function buildDriverAuthEmail(cpf: string) {
    return `driver-${cpf}@internal.sgf2026.local`;
}

function statusToDb(status: DriverWebStatus | undefined): DriverDbStatus {
    switch (status) {
        case 'INACTIVE': return 'inativo';
        case 'SUSPENDED': return 'suspenso';
        default: return 'ativo';
    }
}

function assertPassword(password: unknown) {
    if (typeof password !== 'string' || password.length < 6 || password.length > 20) {
        throw new Error('Senha deve ter entre 6 e 20 caracteres');
    }
}

function assertCreatePayload(payload: Partial<CreateDriverPayload>) {
    const requiredFields = [
        'cpf',
        'name',
        'registrationNumber',
        'cnhNumber',
        'cnhCategory',
        'cnhExpiryDate',
        'password',
    ] as const;

    for (const field of requiredFields) {
        if (!payload[field]) {
            throw new Error(`Campo obrigatório ausente: ${field}`);
        }
    }

    const normalizedCpf = normalizeCpf(payload.cpf!);
    if (normalizedCpf.length !== 11) {
        throw new Error('CPF inválido');
    }

    assertPassword(payload.password);
}

export async function createDriver(payload: CreateDriverPayload) {
    assertCreatePayload(payload);

    const supabaseAdmin = getSupabaseAdmin();
    const normalizedCpf = normalizeCpf(payload.cpf);

    const { data: existingDriver, error: existingError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('cpf', normalizedCpf)
        .maybeSingle();

    if (existingError) {
        throw new Error(`Falha ao validar CPF: ${existingError.message}`);
    }

    if (existingDriver) {
        throw new Error('Já existe um motorista com este CPF');
    }

    const authEmail = payload.email?.trim().toLowerCase() || buildDriverAuthEmail(normalizedCpf);

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: authEmail,
        password: payload.password,
        email_confirm: true,
        user_metadata: {
            cpf: normalizedCpf,
            full_name: payload.name,
            type: 'driver',
        },
    });

    if (authError || !authData.user) {
        throw new Error(authError?.message || 'Não foi possível criar o acesso do motorista');
    }

    // O trigger handle_new_user já criou um row em profiles com id = authData.user.id.
    // Atualizamos os campos do motorista.
    const { data: driver, error: driverError } = await supabaseAdmin
        .from('profiles')
        .update({
            full_name: payload.name,
            cpf: normalizedCpf,
            role: 'motorista',
            registration_number: payload.registrationNumber,
            cnh_number: payload.cnhNumber,
            cnh_category: payload.cnhCategory,
            cnh_expiry: payload.cnhExpiryDate,
            department_id: payload.departmentId || null,
            phone: payload.phone?.trim() || null,
            email: payload.email?.trim().toLowerCase() || null,
            driver_status: statusToDb(payload.status),
        })
        .eq('id', authData.user.id)
        .select('*, departments(id, name)')
        .single();

    if (driverError) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        throw new Error(driverError.message);
    }

    return driver;
}

// No banco unificado, todo motorista que existe na tabela já tem auth (id=auth.users.id).
// "provisionar acesso" para um motorista existente sem auth não se aplica — mantido só por compat.
export async function provisionDriverAccess(driverId: string, payload: DriverAccessPayload) {
    assertPassword(payload.password);

    const supabaseAdmin = getSupabaseAdmin();
    const { data: driver, error: driverError } = await supabaseAdmin
        .from('profiles')
        .select('id, cpf, full_name')
        .eq('id', driverId)
        .single();

    if (driverError || !driver) {
        throw new Error('Motorista não encontrado');
    }

    // O profile.id já é o auth user id no banco unificado: apenas atualizar a senha.
    const { error } = await supabaseAdmin.auth.admin.updateUserById(driver.id, {
        password: payload.password,
    });

    if (error) {
        throw new Error(error.message);
    }

    return driver;
}

export async function resetDriverPassword(driverId: string, payload: DriverAccessPayload) {
    assertPassword(payload.password);

    const supabaseAdmin = getSupabaseAdmin();
    const { data: driver, error: driverError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', driverId)
        .single();

    if (driverError || !driver) {
        throw new Error('Motorista não encontrado');
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(driver.id, {
        password: payload.password,
    });

    if (error) {
        throw new Error(error.message);
    }

    return { success: true };
}
