import { supabase } from './supabase';
import type { Json } from '@/types/database.types';

export interface ReportSnapshotRow {
    id: string;
    reportType: string;
    title: string;
    periodStart: string | null;
    periodEnd: string | null;
    verificationCode: string;
    contentHash: string;
    rowCount: number | null;
    generatedAt: string;
    generatedByName: string | null;
    signedAt: string | null;
    signedByName: string | null;
    signatureNote: string | null;
}

export interface RegisterSnapshotInput {
    reportType: string;
    title: string;
    periodStart: string | null;
    periodEnd: string | null;
    filters: Record<string, Json>;
    contentHash: string;
    rowCount: number;
}

export interface VerifyReportResult {
    valid: boolean;
    orgao?: string;
    reportType?: string;
    title?: string;
    periodStart?: string | null;
    periodEnd?: string | null;
    generatedAt?: string;
    contentHash?: string;
    rowCount?: number | null;
    signed?: boolean;
    signedAt?: string | null;
    signedByName?: string | null;
    signedByRole?: string | null;
}

const CODE_ALPHABET_PATTERN = /^[A-HJ-KM-NP-Z2-9]{12}$/;

export function normalizeVerificationCode(value: string): string {
    return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function isValidVerificationCode(value: string): boolean {
    return CODE_ALPHABET_PATTERN.test(normalizeVerificationCode(value));
}

interface SnapshotQueryRow {
    id: string;
    report_type: string;
    title: string;
    period_start: string | null;
    period_end: string | null;
    verification_code: string;
    content_hash: string;
    row_count: number | null;
    generated_at: string;
    signed_at: string | null;
    signature_note: string | null;
    generated: { full_name: string | null } | null;
    signer: { full_name: string | null } | null;
}

export const reportSnapshotsApi = {
    async list(limit = 100): Promise<ReportSnapshotRow[]> {
        const { data, error } = await supabase
            .from('report_snapshots')
            .select(`id, report_type, title, period_start, period_end, verification_code, content_hash,
                row_count, generated_at, signed_at, signature_note,
                generated:profiles!report_snapshots_generated_by_fkey(full_name),
                signer:profiles!report_snapshots_signed_by_fkey(full_name)`)
            .order('generated_at', { ascending: false })
            .limit(limit);
        if (error) throw new Error(error.message);
        return ((data ?? []) as unknown as SnapshotQueryRow[]).map((row) => ({
            id: row.id,
            reportType: row.report_type,
            title: row.title,
            periodStart: row.period_start,
            periodEnd: row.period_end,
            verificationCode: row.verification_code,
            contentHash: row.content_hash,
            rowCount: row.row_count,
            generatedAt: row.generated_at,
            generatedByName: row.generated?.full_name ?? null,
            signedAt: row.signed_at,
            signedByName: row.signer?.full_name ?? null,
            signatureNote: row.signature_note,
        }));
    },

    async register(input: RegisterSnapshotInput): Promise<{ id: string; code: string; generatedAt: string }> {
        const { data, error } = await supabase.rpc('register_report_snapshot', {
            p_report_type: input.reportType,
            p_title: input.title,
            // A RPC aceita datas nulas (relatório de todo o período), mas o tipo gerado exige string.
            p_period_start: input.periodStart as unknown as string,
            p_period_end: input.periodEnd as unknown as string,
            p_filters: input.filters as Json,
            p_content_hash: input.contentHash,
            p_row_count: input.rowCount,
        });
        if (error) throw new Error(error.message);
        const row = Array.isArray(data) ? data[0] : data;
        if (!row?.verification_code) throw new Error('A resposta do registro não trouxe o código de verificação.');
        return { id: row.id, code: row.verification_code, generatedAt: row.generated_at };
    },

    async sign(id: string, note?: string): Promise<string> {
        const { data, error } = await supabase.rpc('sign_report_snapshot', {
            p_id: id,
            p_note: note?.trim() || undefined,
        });
        if (error) throw new Error(error.message);
        return data;
    },
};

interface VerifyPayload {
    valid?: boolean;
    orgao?: string;
    report_type?: string;
    title?: string;
    period_start?: string | null;
    period_end?: string | null;
    generated_at?: string;
    content_hash?: string;
    row_count?: number | null;
    signed?: boolean;
    signed_at?: string | null;
    signed_by_name?: string | null;
    signed_by_role?: string | null;
}

function mapVerifyPayload(payload: VerifyPayload): VerifyReportResult {
    if (!payload.valid) return { valid: false };
    return {
        valid: true,
        orgao: payload.orgao,
        reportType: payload.report_type,
        title: payload.title,
        periodStart: payload.period_start ?? null,
        periodEnd: payload.period_end ?? null,
        generatedAt: payload.generated_at,
        contentHash: payload.content_hash,
        rowCount: payload.row_count ?? null,
        signed: Boolean(payload.signed),
        signedAt: payload.signed_at ?? null,
        signedByName: payload.signed_by_name ?? null,
        signedByRole: payload.signed_by_role ?? null,
    };
}

/**
 * Consulta pública (sem login). Usa a rota do servidor GET /api/verify/:code,
 * que aplica limite de requisições por IP. Se a rota não existir no ambiente
 * (ex.: servidor de desenvolvimento), cai para a RPC pública diretamente.
 */
export async function verifyReport(rawCode: string): Promise<VerifyReportResult> {
    const code = normalizeVerificationCode(rawCode);
    if (!CODE_ALPHABET_PATTERN.test(code)) return { valid: false };

    let response: Response | null = null;
    try {
        response = await fetch(`/api/verify/${encodeURIComponent(code)}`, {
            headers: { Accept: 'application/json' },
            cache: 'no-store',
        });
    } catch {
        response = null;
    }
    if (response?.status === 429) {
        throw new Error('Muitas consultas em pouco tempo. Aguarde um minuto e tente novamente.');
    }
    if (response && (response.ok || response.status === 400)) {
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
            return mapVerifyPayload((await response.json()) as VerifyPayload);
        }
    }

    const { data, error } = await supabase.rpc('verify_report', { p_code: code });
    if (error) throw new Error('Não foi possível consultar a autenticidade agora. Tente novamente.');
    return mapVerifyPayload((data ?? {}) as VerifyPayload);
}
