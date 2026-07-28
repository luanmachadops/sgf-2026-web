import { supabase } from './supabase';

/**
 * NOTA (fechamento do bucket `fotos`): esta lib não lê nada do `fotos`, então
 * não usa o resolver de `fotoStorage`. Auditado campo a campo:
 * - `cnhUrls` e `cnh_*_path` vivem no bucket privado `documentos` e já vêm
 *   assinados pela Edge Function `driver-registration`;
 * - `tenant.logo_url` / `seal_url` são URL pública do bucket `branding`, que
 *   continua público de propósito — a página de convite renderiza sem sessão e
 *   não teria como assinar nada.
 * Se algum dia esta lib passar a devolver campo do `fotos`, envelope o objeto
 * com `withFotoUrls`.
 */

type Envelope<T> = { data?: T; error?: string };

export type DriverRegistrationRequest = {
    id: string;
    status: 'pending' | 'needs_correction' | 'approved' | 'rejected';
    full_name: string;
    cpf: string;
    birth_date: string | null;
    cnh_number: string;
    cnh_category: string;
    cnh_expiry: string;
    email: string;
    phone: string | null;
    department_id: string;
    document_entry_mode: 'photo' | 'manual';
    ai_confidence: number | null;
    manager_note: string | null;
    submitted_at: string;
    reviewed_at: string | null;
    departments?: { name: string } | null;
    cnhUrls: string[];
};

export type RegistrationInvite = {
    tenant: {
        id: string;
        name: string;
        app_name?: string | null;
        login_eyebrow?: string | null;
        logo_url?: string | null;
        seal_url?: string | null;
        primary_color?: string | null;
    };
    departments: Array<{ id: string; name: string }>;
    expiresAt: string;
};

export type CnhExtraction = {
    name?: string | null;
    cpf?: string | null;
    birthDate?: string | null;
    cnhNumber?: string | null;
    cnhCategory?: string | null;
    cnhExpiry?: string | null;
    confidence?: number | null;
};

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke<Envelope<T>>(
        'driver-registration',
        { body },
    );
    if (error) {
        let message = error.message;
        try {
            const payload = await error.context?.json();
            message = payload?.error ?? message;
        } catch { /* resposta sem JSON */ }
        throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    if (!data?.data) throw new Error('O serviço retornou uma resposta incompleta.');
    return data.data;
}

export const driverRegistrationManagerApi = {
    createInvite: (input: { departmentId?: string; expiresInDays: number; maxUses: number }) =>
        invoke<{
            id: string;
            token: string;
            /** Link HTTPS que abre o cadastro diretamente no navegador. */
            inviteUrl: string;
            expiresAt: string;
            maxUses: number;
        }>({ action: 'create_invite', ...input }),

    listRequests: (status: string = 'all') =>
        invoke<DriverRegistrationRequest[]>({ action: 'list_requests', status }),

    review: (
        requestId: string,
        decision: 'approved' | 'needs_correction' | 'rejected',
        note?: string,
    ) => invoke<{ status: string; notificationSent: boolean; whatsappUrl: string | null }>({
        action: 'review',
        requestId,
        decision,
        note,
    }),
};

export const driverRegistrationPublicApi = {
    validateInvite: (token: string) =>
        invoke<RegistrationInvite>({ action: 'validate_invite', token }),

    checkCpf: (token: string, cpf: string) =>
        invoke<{ valid: boolean; available: boolean }>({
            action: 'check_cpf',
            token,
            cpf,
        }),

    async uploadCnh(token: string, file: File, side: 'front' | 'back' = 'front') {
        const signed = await invoke<{ path: string; token: string }>({
            action: 'create_upload',
            token,
            side,
        });
        const { error } = await supabase.storage
            .from('documentos')
            .uploadToSignedUrl(signed.path, signed.token, file, {
                contentType: file.type || 'image/jpeg',
            });
        if (error) throw new Error(`Não foi possível enviar a foto da CNH: ${error.message}`);
        return signed.path;
    },

    extractCnh: (token: string, paths: string[]) =>
        invoke<CnhExtraction>({ action: 'extract_cnh', token, paths }),

    submit: (payload: Record<string, unknown>) =>
        invoke<{ requestId: string; trackingToken: string; status: 'pending' }>({
            action: 'submit',
            ...payload,
        }),

    status: (requestId: string, trackingToken: string) =>
        invoke<{
            status: 'pending' | 'needs_correction' | 'approved' | 'rejected';
            manager_note?: string | null;
            reviewed_at?: string | null;
            updated_at: string;
        }>({ action: 'status', requestId, trackingToken }),
};
