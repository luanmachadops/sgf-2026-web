// Formatação compartilhada entre tela, PDF e Excel.

import type { ReportBranding, ReportColumn, ReportDataset, ReportFilters, ReportValue } from './types';

const NUM = (n: number, d = 0) =>
    n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function formatReportValue(
    value: ReportValue | null | undefined,
    format: ReportColumn['format'] = 'text',
): string {
    if (value === null || value === undefined || value === '') return '—';
    // `text` explícito: número sem separador de milhar (exercício, código).
    if (typeof value !== 'number' || format === 'text') return String(value);
    if (format === 'currency') {
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    if (format === 'integer') return NUM(value, 0);
    if (format === 'decimal') return NUM(value, 2);
    if (format === 'percent') return `${NUM(value, 1)}%`;
    return value.toLocaleString('pt-BR');
}

/**
 * Valor como sai na impressão. Moeda perde o "R$" (que vai para o cabeçalho,
 * ver `printColumnLabel`): em tabela com várias colunas de valor, repetir o
 * símbolo em cada célula só consome largura.
 */
export function formatPrintValue(
    value: ReportValue | null | undefined,
    format: ReportColumn['format'] = 'text',
): string {
    if (format === 'currency' && typeof value === 'number') return formatReportValue(value, 'decimal');
    return formatReportValue(value, format);
}

export function printColumnLabel(column: ReportColumn): string {
    return column.format === 'currency' ? `${column.label} (R$)` : column.label;
}

/**
 * Soma das colunas marcadas com `total: 'sum'`. Textos ("—", "Não informado")
 * ficam fora da soma. Retorna `null` quando nenhuma coluna visível tem total.
 */
export function computeTotals(
    columns: ReportColumn[],
    rows: ReportDataset['rows'],
): Record<string, number> | null {
    const summed = columns.filter((column) => column.total === 'sum');
    if (summed.length === 0) return null;
    const totals: Record<string, number> = {};
    for (const column of summed) {
        let sum = 0;
        for (const row of rows) {
            const value = row[column.key];
            if (typeof value === 'number' && Number.isFinite(value)) sum += value;
        }
        // Evita 0,30000000000000004 em somas de moeda.
        totals[column.key] = Math.round(sum * 100) / 100;
    }
    return totals;
}

export function totalsLabel(rowCount: number): string {
    return `Total (${rowCount.toLocaleString('pt-BR')} ${rowCount === 1 ? 'registro' : 'registros'})`;
}

/** Converte "dd/mm/aaaa" (formato dos datasets) em Date local. */
export function parseBrazilianDate(value: ReportValue | null | undefined): Date | null {
    if (typeof value !== 'string') return null;
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
    if (!match) return null;
    const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    return Number.isNaN(date.getTime()) ? null : date;
}

export function generatedAt(date = new Date()): string {
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function stateName(state?: string): string {
    const states: Record<string, string> = {
        PR: 'PARANÁ',
        SC: 'SANTA CATARINA',
        RS: 'RIO GRANDE DO SUL',
        SP: 'SÃO PAULO',
        MG: 'MINAS GERAIS',
        RJ: 'RIO DE JANEIRO',
        MS: 'MATO GROSSO DO SUL',
        MT: 'MATO GROSSO',
        GO: 'GOIÁS',
    };
    const code = state?.trim().toUpperCase() ?? '';
    return states[code] ?? code;
}

export function institutionLines(branding?: ReportBranding): string[] {
    const city = branding?.city?.trim();
    const state = branding?.state?.trim();
    const isTapejara = city?.localeCompare('Tapejara', 'pt-BR', { sensitivity: 'base' }) === 0
        && (!state || state.toUpperCase() === 'PR');
    const postalCode = branding?.postalCode || (isTapejara ? '87430-000' : '');
    const lines: string[] = [];
    if (branding?.cnpj) lines.push(`CNPJ: ${branding.cnpj}`);
    const addressLine = [
        branding?.address?.trim(),
        branding?.supportPhone ? `Fone: ${branding.supportPhone}` : '',
    ].filter(Boolean).join(' — ');
    if (addressLine) lines.push(addressLine);
    const locationLine = [
        postalCode ? `CEP ${postalCode}` : '',
        city?.toUpperCase(),
        stateName(state),
    ].filter(Boolean).join(' — ');
    if (locationLine) lines.push(locationLine);
    return lines;
}

function formatFilterDate(value: string): string {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
}

export function filtersSummary(filters: ReportFilters): string {
    const parts: string[] = [
        `Período: ${filters.periodLabel}`,
        `Secretaria: ${filters.departmentLabel}`,
    ];
    if (filters.dateFrom) parts.push(`De: ${formatFilterDate(filters.dateFrom)}`);
    if (filters.dateTo) parts.push(`Até: ${formatFilterDate(filters.dateTo)}`);
    if (filters.vehicleLabel) parts.push(`Veículo: ${filters.vehicleLabel}`);
    if (filters.driverLabel) parts.push(`Condutor: ${filters.driverLabel}`);
    if (filters.contextLabel) parts.push(filters.contextLabel);
    if (filters.searchLabel) parts.push(`Busca: ${filters.searchLabel}`);
    return parts.join('  •  ');
}

export function safeHex(value: string | undefined, fallback: string): string {
    const normalized = (value ?? '').replace('#', '').trim();
    return /^[\da-f]{6}$/i.test(normalized) ? normalized.toUpperCase() : fallback;
}
