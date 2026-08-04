import { supabase } from '@/lib/supabase';
import { uploadPrivateDoc } from '@/lib/docStorage';

export interface StationClosing {
    closingId: string; protocol: string; stationId: string; stationName: string;
    competence: string; closingStatus: string; fiscalStatus: string;
    recordCount: number; totalQuantity: number; totalAmount: number; snapshotHash: string;
    submittedAt: string; reviewedAt: string | null; commitmentNumber: string | null;
    nadNumber: string | null; invoiceId: string | null; invoiceNumber: string | null;
    invoiceAmount: number | null; invoiceStatus: string | null; invoiceAttestedAt: string | null;
    scheduledAmount: number; paidAmount: number; nextPaymentDate: string | null; lastPaymentDate: string | null;
}

export interface StationFiscalDashboard {
    stationId: string; stationName: string; totalClosings: number; pendingReview: number;
    pendingCommitment: number; pendingInvoice: number; pendingAttestation: number;
    pendingPayment: number; paidClosings: number; closedAmount: number;
    invoicedAmount: number; paidAmount: number; openAmount: number; integrityFailures: number;
}

const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

export const stationClosingApi = {
    getCommitmentBalance: async (stationId: string, on: string): Promise<number> => {
        const { data, error } = await supabase.rpc('manager_get_station_commitment_balance', {
            p_station_id: stationId,
            p_on: on,
        });
        fail(error);
        return Number(data ?? 0);
    },
    list: async (): Promise<StationClosing[]> => {
        const { data, error } = await supabase.rpc('get_station_closing_register', {});
        fail(error);
        return (data ?? []).map((r) => ({
            closingId: r.closing_id, protocol: r.protocol, stationId: r.station_id,
            stationName: r.station_name, competence: r.competence,
            closingStatus: r.closing_status, fiscalStatus: r.fiscal_status,
            recordCount: Number(r.record_count), totalQuantity: Number(r.total_quantity),
            totalAmount: Number(r.total_amount), snapshotHash: r.snapshot_hash,
            submittedAt: r.submitted_at, reviewedAt: r.reviewed_at,
            commitmentNumber: r.commitment_number, nadNumber: r.nad_number,
            invoiceId: r.invoice_id, invoiceNumber: r.invoice_number,
            invoiceAmount: r.invoice_amount == null ? null : Number(r.invoice_amount),
            invoiceStatus: r.invoice_status, invoiceAttestedAt: r.invoice_attested_at,
            scheduledAmount: Number(r.scheduled_amount), paidAmount: Number(r.paid_amount),
            nextPaymentDate: r.next_payment_date, lastPaymentDate: r.last_payment_date,
        }));
    },
    dashboard: async (): Promise<StationFiscalDashboard[]> => {
        const { data, error } = await supabase.rpc('get_station_fiscal_dashboard', {});
        fail(error);
        return (data ?? []).map((r) => ({
            stationId: r.station_id, stationName: r.station_name,
            totalClosings: Number(r.total_closings), pendingReview: Number(r.pending_review),
            pendingCommitment: Number(r.pending_commitment), pendingInvoice: Number(r.pending_invoice),
            pendingAttestation: Number(r.pending_attestation), pendingPayment: Number(r.pending_payment),
            paidClosings: Number(r.paid_closings), closedAmount: Number(r.closed_amount),
            invoicedAmount: Number(r.invoiced_amount), paidAmount: Number(r.paid_amount),
            openAmount: Number(r.open_amount), integrityFailures: Number(r.integrity_failures),
        }));
    },
    submit: async (month: string): Promise<string> => {
        const { data, error } = await supabase.rpc('partner_submit_station_monthly_closing', { p_month: `${month}-01` });
        fail(error); return data;
    },
    review: async (id: string, approved: boolean, note?: string): Promise<void> => {
        const { error } = await supabase.rpc('manager_review_station_closing', {
            p_closing_id: id, p_approved: approved, p_note: note || undefined,
        }); fail(error);
    },
    listCommitments: async (stationId: string) => {
        const { data, error } = await supabase.rpc('manager_list_station_commitments', { p_station_id: stationId });
        fail(error); return data ?? [];
    },
    registerCommitment: async (input: {
        stationId: string; number: string; nad: string; amount: number;
        issuedOn: string; validFrom: string; validUntil: string; file: File;
    }): Promise<string> => {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) throw new Error('Sessão expirada.');
        const { data: profile, error: profileError } = await supabase.from('profiles').select('tenant_id').eq('id', auth.user.id).single();
        fail(profileError);
        const path = await uploadPrivateDoc(input.file, 'station-commitments', profile.tenant_id, `empenho-${input.stationId}`);
        const { data, error } = await supabase.rpc('manager_register_station_commitment', {
            p_station_id: input.stationId, p_commitment_number: input.number,
            p_nad_number: input.nad, p_amount: input.amount, p_issued_on: input.issuedOn,
            p_valid_from: input.validFrom, p_valid_until: input.validUntil, p_document_path: path,
        }); fail(error); return data;
    },
    linkCommitment: async (closingId: string, commitmentId: string): Promise<void> => {
        const { error } = await supabase.rpc('manager_link_station_closing_commitment', {
            p_closing_id: closingId, p_commitment_id: commitmentId,
        }); fail(error);
    },
    submitInvoice: async (input: {
        closing: StationClosing; invoiceNumber: string; issuedOn: string; file: File; tenantId: string;
    }): Promise<string> => {
        const path = await uploadPrivateDoc(input.file, 'station-closings', input.tenantId, `nf-${input.closing.closingId}`);
        const { data, error } = await supabase.rpc('partner_submit_station_closing_invoice', {
            p_closing_id: input.closing.closingId, p_invoice_number: input.invoiceNumber,
            p_amount: input.closing.totalAmount, p_issued_on: input.issuedOn, p_document_path: path,
        }); fail(error); return data;
    },
    attest: async (invoiceId: string): Promise<void> => {
        const { error } = await supabase.rpc('manager_attest_station_closing_invoice', { p_invoice_id: invoiceId });
        fail(error);
    },
    schedulePayment: async (closingId: string, amount: number, date: string): Promise<string> => {
        const { data, error } = await supabase.rpc('manager_schedule_station_closing_payment', {
            p_closing_id: closingId, p_amount: amount, p_scheduled_on: date,
        }); fail(error); return data;
    },
    auditRows: async (closingId: string) => {
        const { data, error } = await supabase.rpc('get_station_closing_audit_report', { p_closing_id: closingId });
        fail(error); return data ?? [];
    },
};
