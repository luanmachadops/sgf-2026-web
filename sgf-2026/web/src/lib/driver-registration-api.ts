import { supabase } from './supabase';

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
    ai_confidence: number | null;
    manager_note: string | null;
    submitted_at: string;
    reviewed_at: string | null;
    departments?: { name: string } | null;
    cnhUrls: string[];
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
            /** Link https — é o que se envia ao motorista (clicável no WhatsApp). */
            inviteUrl?: string;
            /** Esquema nativo do app. Mantido para compatibilidade e fallback. */
            deepLink: string;
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
