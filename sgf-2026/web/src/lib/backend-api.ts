import type { Tables } from '@/types/database.types';
import { supabase } from './supabase';

function isLocalHostname(hostname: string): boolean {
    return hostname === 'localhost' || hostname === '127.0.0.1';
}

function resolveApiUrl(): string {
    const configuredUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '');

    if (configuredUrl) {
        if (typeof window !== 'undefined') {
            try {
                const configuredHost = new URL(configuredUrl).hostname;
                const currentHost = window.location.hostname;
                const isConfiguredLocal = isLocalHostname(configuredHost);
                const isCurrentLocal = isLocalHostname(currentHost);

                // Evita usar localhost em produção (Vercel/GitHub Pages/etc.)
                if (isConfiguredLocal && !isCurrentLocal) {
                    return '/api';
                }
            } catch {
                // If configured URL is malformed, fallback below.
            }
        }

        return configuredUrl;
    }

    if (typeof window !== 'undefined') {
        return isLocalHostname(window.location.hostname)
            ? 'http://localhost:3000/api'
            : '/api';
    }

    return '/api';
}

class BackendApiError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'BackendApiError';
        this.status = status;
    }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
    const apiUrl = resolveApiUrl();

    const buildHeaders = (token?: string) => ({
        'Content-Type': 'application/json',
        ...(token ? {
            Authorization: `Bearer ${token}`,
            // Alguns proxies de hospedagem removem Authorization. Este cabeçalho
            // carrega o mesmo JWT e é validado do mesmo modo no servidor.
            'X-Access-Token': token,
        } : {}),
        ...(init.headers || {}),
    });

    // O AuthContext persiste uma cópia do access token que acabou de ser
    // validado no login. Em alguns navegadores o GoTrue pode demorar para
    // reconstruir `getSession()` depois de trocar de aba; nesse intervalo a UI
    // já está autenticada, mas a chamada antiga saía sem Authorization.
    const { data: { session } } = await supabase.auth.getSession();
    let token = session?.access_token;
    if (!token && typeof window !== 'undefined') {
        try {
            token = window.localStorage.getItem('token') ?? undefined;
        } catch {
            // Storage indisponível: a API responderá 401 e o fluxo abaixo
            // encerrará a sessão visual de modo seguro.
        }
    }
    let headers = buildHeaders(token);

    let response: Response;
    try {
        response = await fetch(`${apiUrl}${path}`, {
            ...init,
            headers,
        });
    } catch {
        // Se falhar a conexão direta com http://localhost:3000 (servidor backend offline),
        // tenta o endpoint relativo `/api` (Serverless / Proxy).
        if (apiUrl.includes('localhost:3000')) {
            try {
                response = await fetch(`/api${path}`, {
                    ...init,
                    headers,
                });
            } catch {
                throw new BackendApiError('Servidor backend indisponível. Verifique se a API está rodando.', 503);
            }
        } else {
            throw new BackendApiError('Não foi possível conectar ao servidor de API.', 503);
        }
    }

    // Uma sessão aberta pode estar com o access token no limite da validade.
    // Renova uma única vez e repete a ação, sem criar laço de requisições.
    if (response.status === 401 && token) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        const refreshedToken = refreshed.session?.access_token;
        if (!refreshError && refreshedToken) {
            token = refreshedToken;
            headers = buildHeaders(token);
            response = await fetch(`${apiUrl}${path}`, { ...init, headers });
        }
    }

    if (!response.ok) {
        let message = 'Erro ao processar a requisição';

        try {
            const data = await response.json();
            const apiMessage = Array.isArray(data.message)
                ? data.message.join(', ')
                : data.message;
            message = apiMessage || data.error || message;
        } catch {
            // Ignore body parsing errors and use fallback message.
        }

        if (response.status === 401 && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('sgf:auth-invalid'));
        }

        throw new BackendApiError(message, response.status);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json() as Promise<T>;
}

export interface CreateDriverRequest {
    cpf: string;
    name: string;
    registrationNumber: string;
    cnhNumber: string;
    cnhCategory: string;
    cnhExpiryDate: string;
    birthDate: string;
    departmentId?: string;
    phone?: string;
    email?: string;
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    password: string;
    cnhEar?: boolean;
    shiftStart?: string;
    shiftEnd?: string;
    photoUrl?: string;
}

export interface DriverAccessRequest {
    password: string;
}

export interface PreRegisterDriverRequest {
    cpf: string;
    name: string;
    registrationNumber?: string;
    departmentId?: string;
}

export interface BulkPreRegisterResult {
    created: number;
    /** Senhas provisórias geradas — disponíveis SOMENTE nesta resposta. */
    credentials: { cpf: string; name: string; tempPassword: string }[];
    errors: { cpf: string; name: string; error: string }[];
}

// "Driver" no banco unificado = profile com role='motorista'
export type DriverWithDepartment = Tables<'profiles'> & {
    department?: { id: string; name: string } | null;
    departments?: { id: string; name: string } | null;
    // Aliases retro-compatíveis usados por componentes do web
    name?: string;
    cnh_expiry_date?: string | null;
    status?: Tables<'profiles'>['driver_status'];
};

export const driverAccessApi = {
    create: async (payload: CreateDriverRequest): Promise<DriverWithDepartment> =>
        request<DriverWithDepartment>('/drivers', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),

    provisionAccess: async (driverId: string, payload: DriverAccessRequest): Promise<DriverWithDepartment> =>
        request<DriverWithDepartment>(`/drivers/${driverId}/provision-access`, {
            method: 'POST',
            body: JSON.stringify(payload),
        }),

    resetPassword: async (driverId: string, payload: DriverAccessRequest): Promise<{ success: true }> =>
        request<{ success: true }>(`/drivers/${driverId}/reset-password`, {
            method: 'POST',
            body: JSON.stringify(payload),
        }),

    preRegister: async (payload: PreRegisterDriverRequest): Promise<DriverWithDepartment & { tempPassword: string }> =>
        request<DriverWithDepartment & { tempPassword: string }>('/drivers/pre-register', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),

    preRegisterBulk: async (drivers: PreRegisterDriverRequest[]): Promise<BulkPreRegisterResult> =>
        request<BulkPreRegisterResult>('/drivers/pre-register', {
            method: 'POST',
            body: JSON.stringify({ drivers }),
        }),
};

export interface CreateSecretarioRequest {
    name: string;
    email: string;
    password: string;
    departmentId: string;
}

export const managerAccessApi = {
    createSecretario: async (payload: CreateSecretarioRequest): Promise<DriverWithDepartment> =>
        request<DriverWithDepartment>('/managers', {
            method: 'POST',
            body: JSON.stringify({ ...payload, role: 'secretario' }),
        }),
};

export type ManagedAccessRole = 'admin' | 'gestor' | 'secretario' | 'motorista';

export interface ManagedAccess {
    id: string;
    full_name: string;
    email: string | null;
    cpf: string | null;
    role: ManagedAccessRole;
    tenant_id: string;
    department_id: string | null;
    access_blocked: boolean;
    allowed_modules: string[];
    driver_status: string | null;
    created_at: string;
    departments?: { id: string; name: string } | null;
    tenants?: { id: string; name: string } | null;
    tempPassword?: string | null;
}

export interface CreateManagedAccess {
    role: ManagedAccessRole;
    name: string;
    email?: string;
    cpf?: string;
    registrationNumber?: string;
    password?: string;
    departmentId?: string;
    tenantId?: string;
    allowedModules: string[];
}

export const accessManagementApi = {
    list: () => request<ManagedAccess[]>('/access', { method: 'GET' }),
    create: (payload: CreateManagedAccess) =>
        request<ManagedAccess>('/access', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: string, payload: { accessBlocked?: boolean; allowedModules?: string[] }) =>
        request<ManagedAccess>('/access', {
            method: 'PATCH',
            body: JSON.stringify({ id, ...payload }),
        }),
    remove: (id: string) =>
        request<void>('/access', { method: 'DELETE', body: JSON.stringify({ id }) }),
};

export { BackendApiError };

export type PartnerType = 'posto' | 'oficina';

export interface PartnerAccess {
    id: string;
    full_name: string | null;
    email: string | null;
    access_blocked: boolean | null;
    must_change_password: boolean | null;
    created_at?: string | null;
    last_sign_in_at?: string | null;
}

/** Acesso ao portal do parceiro (posto/oficina). Só admin — validado no servidor. */
export const partnersApi = {
    get: (partnerType: PartnerType, partnerId: string) =>
        request<{ access: PartnerAccess | null }>(
            `/partners?partnerType=${partnerType}&partnerId=${encodeURIComponent(partnerId)}`,
            { method: 'GET' },
        ),

    create: (input: { partnerType: PartnerType; partnerId: string; name: string; email: string; password?: string }) =>
        request<{ access: PartnerAccess; tempPassword: string }>('/partners', {
            method: 'POST',
            body: JSON.stringify({ action: 'create', ...input }),
        }),

    resetPassword: (partnerType: PartnerType, partnerId: string) =>
        request<{ success: boolean; tempPassword: string }>('/partners', {
            method: 'POST',
            body: JSON.stringify({ action: 'reset', partnerType, partnerId }),
        }),

    setBlocked: (partnerType: PartnerType, partnerId: string, blocked: boolean) =>
        request<{ success: boolean; blocked: boolean }>('/partners', {
            method: 'POST',
            body: JSON.stringify({ action: blocked ? 'block' : 'unblock', partnerType, partnerId }),
        }),
};
