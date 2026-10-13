// Utilitários dos datasets de relatório (consultas paginadas, datas, rótulos).
// Compartilhado por `reportData.ts` e `reports/operationalReports.ts`.

import type { PostgrestError } from '@supabase/supabase-js';
import type { ReportDataset } from './types';

export interface ReportFilterInput {
    /** id (uuid) da secretaria; vazio = todas */
    departmentId?: string;
    /** ISO date (yyyy-mm-dd) inicial */
    dateFrom?: string;
    /** ISO date (yyyy-mm-dd) final */
    dateTo?: string;
    /** id (uuid) do condutor; vazio = todos (relatórios com `driverFilter`) */
    driverId?: string;
    /** id (uuid) do veículo; vazio = todos (relatórios com `vehicleFilter`) */
    vehicleId?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Só deixa passar uuid: o valor vai interpolado em filtros `.or(...)` do PostgREST. */
export function safeUuid(value?: string): string | undefined {
    return value && UUID_PATTERN.test(value) ? value : undefined;
}

// ── Helpers ────────────────────────────────────────────────────────────────
export const EMPTY: ReportDataset = { kpis: [], columns: [], rows: [], charts: [] };
export const PAGE_SIZE = 1000;

export type RangeQuery<T> = {
    range: (
        from: number,
        to: number,
    ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;
};

/**
 * O Data API limita respostas por projeto (1.000 linhas por padrão). Relatórios
 * não podem aceitar truncamento silencioso, então percorremos todas as páginas.
 * As consultas chamadoras devem sempre informar uma ordenação determinística.
 */
export async function fetchAllRows<T>(query: RangeQuery<T>): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        const page = data ?? [];
        rows.push(...page);
        if (page.length < PAGE_SIZE) return rows;
    }
}

export const BRL = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const NUM = (n: number, d = 0) =>
    n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function dateRange(f?: ReportFilterInput) {
    const from = f?.dateFrom ? new Date(f.dateFrom + 'T00:00:00').toISOString() : undefined;
    const to = f?.dateTo ? new Date(f.dateTo + 'T23:59:59').toISOString() : undefined;
    return { from, to };
}

export function withinRange(value: string | null | undefined, from?: string, to?: string): boolean {
    if (!value) return false;
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return false;
    if (from && time < new Date(from).getTime()) return false;
    if (to && time > new Date(to).getTime()) return false;
    return true;
}

export function topChartData(
    values: { label: string; value: number }[],
    limit = 8,
): { label: string; value: number }[] {
    return [...values]
        .filter((item) => Number.isFinite(item.value))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);
}

export const VEHICLE_STATUS_LABEL: Record<string, string> = {
    liberado: 'Disponível',
    manutencao: 'Em manutenção',
    bloqueado: 'Bloqueado',
};

export const SO_STATUS_LABEL: Record<string, string> = {
    pendente: 'Pendente',
    aprovada: 'Aprovada',
    rejeitada: 'Rejeitada',
    em_execucao: 'Em execução',
    concluida: 'Concluída',
};

export const SO_OPERATIONAL_STATUS_LABEL: Record<string, string> = {
    pending: 'Pendente',
    authorized: 'Autorizada',
    at_shop: 'Na oficina',
    awaiting_quote_approval: 'Aguardando orçamento',
    in_progress: 'Em execução',
    ready: 'Pronta',
    received: 'Recebida',
    cancelled: 'Cancelada',
};

export const SO_FINANCIAL_STATUS_LABEL: Record<string, string> = {
    not_started: 'Não iniciado',
    awaiting_commitment: 'Aguardando empenho',
    committed: 'Empenhada',
    invoiced: 'Faturada',
    attested: 'Atestada',
    paid: 'Paga',
};

export const TRIP_STATUS_LABEL: Record<string, string> = {
    andamento: 'Em andamento',
    concluida: 'Concluída',
    problema: 'Com anomalia',
    cancelada: 'Cancelada',
    pendente: 'Pendente',
};

export function fmtDate(iso?: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

export type Rel = { plate?: string | null; brand?: string | null; model?: string | null } | null;
export const vehicleLabel = (v: Rel) =>
    v ? [v.brand, v.model].filter(Boolean).join(' ') || (v.plate ?? '—') : '—';


export const ORIGIN_LABEL: Record<string, string> = {
    driver: 'Motorista',
    checklist: 'Checklist',
    manager: 'Gestor',
};

export const PRIORITY_LABEL: Record<string, string> = {
    baixa: 'Baixa',
    media: 'Média',
    alta: 'Alta',
};

export function capitalize(value: string): string {
    const text = value.replaceAll('_', ' ').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : text;
}

export function startOfToday(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
}

/** Dias de hoje até a data (yyyy-mm-dd ou ISO); negativo = já passou. */
export function daysUntil(value: string, today = startOfToday()): number {
    const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
    date.setHours(0, 0, 0, 0);
    return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

export function expiryStatus(days: number | null): string {
    if (days === null) return 'Não informada';
    if (days < 0) return `Vencida há ${Math.abs(days)} ${Math.abs(days) === 1 ? 'dia' : 'dias'}`;
    if (days === 0) return 'Vence hoje';
    if (days <= 90) return `Vence em ${days} ${days === 1 ? 'dia' : 'dias'}`;
    return 'Válida';
}

export function groupCount(labels: string[]): { label: string; value: number }[] {
    const counts = new Map<string, number>();
    for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
    return [...counts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

/**
 * Filtro PostgREST pela data efetiva do abastecimento (`filled_at`, senão
 * `created_at`), para não baixar o histórico inteiro. Retorna null sem período.
 */
export function effectiveFuelingDateFilter(from?: string, to?: string): string | null {
    const parts: string[] = [];
    if (from) parts.push(`or(filled_at.gte."${from}",and(filled_at.is.null,created_at.gte."${from}"))`);
    if (to) parts.push(`or(filled_at.lte."${to}",and(filled_at.is.null,created_at.lte."${to}"))`);
    return parts.length ? `and(${parts.join(',')})` : null;
}
