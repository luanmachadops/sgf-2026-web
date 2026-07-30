import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database.types';

export type PartnerKind = 'posto' | 'oficina';
export type ProcurementAlertCode =
    | 'contract_expired'
    | 'contract_expiring'
    | 'budget_exhausted'
    | 'budget_low';

export interface PartnerContractStatus {
    partnerKind: PartnerKind;
    partnerId: string;
    partnerName: string;
    isActive: boolean;
    contractNumber: string | null;
    contractStart: string | null;
    contractEnd: string | null;
    contractValue: number | null;
    committedValue: number;
    remainingValue: number | null;
    remainingPercent: number | null;
    alertPercent: number;
    alertDays: number;
    daysRemaining: number | null;
    canCreateNew: boolean;
    canExecuteExisting: boolean;
    blockCode: string | null;
    blockTitle: string | null;
    blockMessage: string | null;
}

export interface ProcurementContractUsage {
    partnerKind: PartnerKind;
    partnerId: string;
    partnerName: string;
    contractNumber: string | null;
    contractStart: string | null;
    contractEnd: string | null;
    contractValue: number | null;
    reservedValue: number;
    realizedValue: number;
    disputedValue: number;
    consumedValue: number;
    invoicedValue: number | null;
    paidValue: number | null;
    remainingValue: number | null;
    consumedPercent: number | null;
    monthRealizedValue: number;
    monthContractPercent: number | null;
    daysRemaining: number | null;
    isActive: boolean;
    canCreateNew: boolean;
}

export interface PartnerDashboardPoint {
    key: string;
    amount: number;
    count: number;
    liters?: number;
}

export interface PartnerDashboardStatus {
    status: string;
    count: number;
}

export interface PartnerDashboardData {
    partnerKind: PartnerKind;
    metrics: Record<string, number>;
    monthly: PartnerDashboardPoint[];
    statuses: PartnerDashboardStatus[];
}

export interface ProcurementAlert {
    partnerKind: PartnerKind;
    partnerId: string;
    partnerName: string;
    contractNumber: string | null;
    contractEnd: string | null;
    daysRemaining: number | null;
    contractValue: number | null;
    committedValue: number;
    remainingValue: number | null;
    remainingPercent: number | null;
    code: ProcurementAlertCode;
    severity: 'error' | 'warning';
    blocksNewOperations: boolean;
}

function throwIfError(error: { message: string } | null): void {
    if (error) throw new Error(error.message);
}

function jsonRecord(value: Json): Record<string, number> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, Number(item ?? 0)]),
    );
}

function jsonArray(value: Json): Array<Record<string, Json | undefined>> {
    if (!Array.isArray(value)) return [];
    return value.filter(
        (item): item is Record<string, Json | undefined> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    );
}

function mapContractUsage(row: {
    partner_kind: string;
    partner_id: string;
    partner_name: string;
    contract_number: string | null;
    contract_start: string | null;
    contract_end: string | null;
    contract_value: number | null;
    reserved_value: number;
    realized_value: number;
    disputed_value: number;
    consumed_value: number;
    invoiced_value: number | null;
    paid_value: number | null;
    remaining_value: number | null;
    consumed_percent: number | null;
    month_realized_value: number;
    month_contract_percent: number | null;
    days_remaining: number | null;
    is_active: boolean;
    can_create_new: boolean;
}): ProcurementContractUsage {
    return {
        partnerKind: row.partner_kind as PartnerKind,
        partnerId: row.partner_id,
        partnerName: row.partner_name,
        contractNumber: row.contract_number,
        contractStart: row.contract_start,
        contractEnd: row.contract_end,
        contractValue: row.contract_value == null ? null : Number(row.contract_value),
        reservedValue: Number(row.reserved_value ?? 0),
        realizedValue: Number(row.realized_value ?? 0),
        disputedValue: Number(row.disputed_value ?? 0),
        consumedValue: Number(row.consumed_value ?? 0),
        invoicedValue: row.invoiced_value == null ? null : Number(row.invoiced_value),
        paidValue: row.paid_value == null ? null : Number(row.paid_value),
        remainingValue: row.remaining_value == null ? null : Number(row.remaining_value),
        consumedPercent: row.consumed_percent == null ? null : Number(row.consumed_percent),
        monthRealizedValue: Number(row.month_realized_value ?? 0),
        monthContractPercent: row.month_contract_percent == null ? null : Number(row.month_contract_percent),
        daysRemaining: row.days_remaining,
        isActive: row.is_active,
        canCreateNew: row.can_create_new,
    };
}

export const procurementApi = {
    getPartnerContractStatus: async (): Promise<PartnerContractStatus> => {
        const { data, error } = await supabase.rpc('get_partner_contract_status');
        throwIfError(error);
        const row = data?.[0];
        if (!row) throw new Error('Não foi possível carregar a situação do contrato.');
        return {
            partnerKind: row.partner_kind as PartnerKind,
            partnerId: row.partner_id,
            partnerName: row.partner_name,
            isActive: row.is_active,
            contractNumber: row.contract_number,
            contractStart: row.contract_start,
            contractEnd: row.contract_end,
            contractValue: row.contract_value == null ? null : Number(row.contract_value),
            committedValue: Number(row.committed_value ?? 0),
            remainingValue: row.remaining_value == null ? null : Number(row.remaining_value),
            remainingPercent: row.remaining_percent == null ? null : Number(row.remaining_percent),
            alertPercent: Number(row.alert_percent ?? 20),
            alertDays: Number(row.alert_days ?? 30),
            daysRemaining: row.days_remaining,
            canCreateNew: row.can_create_new,
            canExecuteExisting: row.can_execute_existing,
            blockCode: row.block_code,
            blockTitle: row.block_title,
            blockMessage: row.block_message,
        };
    },

    getPartnerDashboard: async (): Promise<PartnerDashboardData> => {
        const { data, error } = await supabase.rpc('get_partner_dashboard');
        throwIfError(error);
        const row = data?.[0];
        if (!row) throw new Error('Não foi possível carregar o dashboard.');
        return {
            partnerKind: row.partner_kind as PartnerKind,
            metrics: jsonRecord(row.metrics),
            monthly: jsonArray(row.monthly_series).map((item) => ({
                key: String(item.key ?? ''),
                amount: Number(item.amount ?? 0),
                count: Number(item.count ?? 0),
                ...(item.liters == null ? {} : { liters: Number(item.liters) }),
            })),
            statuses: jsonArray(row.status_series).map((item) => ({
                status: String(item.status ?? ''),
                count: Number(item.count ?? 0),
            })),
        };
    },

    getPartnerContractUsage: async (): Promise<ProcurementContractUsage> => {
        const { data, error } = await supabase.rpc('get_partner_contract_usage');
        throwIfError(error);
        const row = data?.[0];
        if (!row) throw new Error('Não foi possível carregar o consumo da licitação.');
        return mapContractUsage(row);
    },

    getContractUsage: async (): Promise<ProcurementContractUsage[]> => {
        const { data, error } = await supabase.rpc('get_procurement_contract_usage');
        throwIfError(error);
        return (data ?? []).map(mapContractUsage);
    },

    getAlerts: async (): Promise<ProcurementAlert[]> => {
        const { data, error } = await supabase.rpc('get_procurement_alerts');
        throwIfError(error);
        return (data ?? []).map((row) => ({
            partnerKind: row.partner_kind as PartnerKind,
            partnerId: row.partner_id,
            partnerName: row.partner_name,
            contractNumber: row.contract_number,
            contractEnd: row.contract_end,
            daysRemaining: row.days_remaining,
            contractValue: row.contract_value == null ? null : Number(row.contract_value),
            committedValue: Number(row.committed_value ?? 0),
            remainingValue: row.remaining_value == null ? null : Number(row.remaining_value),
            remainingPercent: row.remaining_percent == null ? null : Number(row.remaining_percent),
            code: row.alert_code as ProcurementAlertCode,
            severity: row.severity as ProcurementAlert['severity'],
            blocksNewOperations: row.blocks_new_operations,
        }));
    },
};
