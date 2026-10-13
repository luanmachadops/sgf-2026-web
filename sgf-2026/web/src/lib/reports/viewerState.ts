// Estado do visualizador de relatórios: ordenação, agrupamento e a lista de
// relatórios recentes (localStorage, só conveniência deste navegador — tudo
// funciona sem ele). Modelos e assinaturas ficam no banco (reportSettingsApi).

import { parseBrazilianDate } from './format';
import type { ReportColumn, ReportDataset, ReportValue } from './types';

export interface ReportSort {
    key: string;
    direction: 'asc' | 'desc';
}

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

function sortableValue(value: ReportValue | undefined, column?: ReportColumn): number | string | null {
    if (value === undefined || value === null || value === '' || value === '—') return null;
    if (typeof value === 'number') return value;
    if (column?.format === 'date') {
        const date = parseBrazilianDate(value);
        if (date) return date.getTime();
    }
    // "12/10/2026, 14:30" (data e hora)
    const dateTime = /^(\d{2})\/(\d{2})\/(\d{4}),? (\d{2}):(\d{2})/.exec(value);
    if (dateTime) {
        return new Date(Number(dateTime[3]), Number(dateTime[2]) - 1, Number(dateTime[1]), Number(dateTime[4]), Number(dateTime[5])).getTime();
    }
    return value;
}

export function compareReportValues(a: ReportValue | undefined, b: ReportValue | undefined, column?: ReportColumn): number {
    const left = sortableValue(a, column);
    const right = sortableValue(b, column);
    // Vazios sempre no fim.
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    if (typeof left === 'number' && typeof right === 'number') return left - right;
    return collator.compare(String(left), String(right));
}

/** Ordena por agrupamento (se houver) e depois pela coluna escolhida. Estável. */
export function arrangeRows(
    rows: ReportDataset['rows'],
    columns: ReportColumn[],
    sort: ReportSort | null,
    groupBy: string | null,
): ReportDataset['rows'] {
    if (!sort && !groupBy) return rows;
    const byKey = new Map(columns.map((column) => [column.key, column]));
    const indexed = rows.map((row, index) => ({ row, index }));
    indexed.sort((left, right) => {
        if (groupBy) {
            const group = compareReportValues(left.row[groupBy], right.row[groupBy], byKey.get(groupBy));
            if (group !== 0) return group;
        }
        if (sort) {
            const value = compareReportValues(left.row[sort.key], right.row[sort.key], byKey.get(sort.key));
            if (value !== 0) return sort.direction === 'asc' ? value : -value;
        }
        return left.index - right.index;
    });
    return indexed.map((item) => item.row);
}

export function nextSort(current: ReportSort | null, key: string): ReportSort | null {
    if (!current || current.key !== key) return { key, direction: 'asc' };
    if (current.direction === 'asc') return { key, direction: 'desc' };
    return null;
}

// ── Persistência local ──────────────────────────────────────────────────────

function readJson<T>(key: string, fallback: T): T {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
}

function writeJson(key: string, value: unknown): void {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Armazenamento bloqueado (aba privada): o recurso só não persiste.
    }
}

const RECENT_KEY = 'sgf-report-recent';

export function loadRecentReports(): string[] {
    const value = readJson<unknown>(RECENT_KEY, []);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 6) : [];
}

export function rememberRecentReport(reportId: string): void {
    writeJson(RECENT_KEY, [reportId, ...loadRecentReports().filter((id) => id !== reportId)].slice(0, 6));
}
