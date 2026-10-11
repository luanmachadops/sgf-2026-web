// Autenticidade dos relatórios: serialização canônica, hash SHA-256 e CSV.
//
// Formato 'sgf-report-v1' (qualquer mudança nestas regras exige nova versão):
//   - O conteúdo é { format, columns, rows[, extraTables] }; as colunas são as
//     EXIBIDAS (na ordem exibida) e as linhas já refletem os filtros de tela.
//   - Cada célula vira texto: número -> ponto decimal, sem notação científica
//     (até 6 casas, zeros finais removidos); null/undefined/'—' -> ''; colunas
//     de data -> ISO (aaaa-mm-dd) e de data/hora -> aaaa-mm-ddTHH:MM.
//   - JSON com chaves em ordem alfabética, sem espaços, UTF-8.
//   - O hash é o SHA-256 (hex minúsculo) desse JSON. O CSV exportado traz as
//     mesmas células canônicas, o que permite recalcular o hash a partir dele.

import type { ReportColumn, ReportDataset, ReportExtraTable, ReportRow } from './reportData';

export const REPORT_FORMAT_VERSION = 'sgf-report-v1';

const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const BR_DATETIME = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/;

export function normalizeCell(value: unknown, format?: ReportColumn['format']): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return '';
        return String(Number(value.toFixed(6)));
    }
    const text = String(value).trim();
    if (text === '—') return '';
    if (format === 'date') {
        const match = BR_DATE.exec(text);
        if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    }
    if (format === 'datetime') {
        const match = BR_DATETIME.exec(text);
        if (match) return `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}`;
    }
    return text;
}

type CanonicalJson = string | number | boolean | null | CanonicalJson[] | { [key: string]: CanonicalJson };

/** JSON com chaves ordenadas, sem espaços. */
export function canonicalStringify(value: CanonicalJson): string {
    if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

export function canonicalTable(columns: ReportColumn[], rows: ReportRow[]): string[][] {
    return rows.map((row) => columns.map((column) => normalizeCell(row[column.key], column.format)));
}

function canonicalExtra(table: ReportExtraTable): CanonicalJson {
    return {
        title: table.title,
        columns: table.columns.map((column) => ({ key: column.key, label: column.label })),
        rows: canonicalTable(table.columns, table.rows),
    };
}

export function buildCanonicalText(dataset: ReportDataset): string {
    const payload: { [key: string]: CanonicalJson } = {
        format: REPORT_FORMAT_VERSION,
        columns: dataset.columns.map((column) => ({ key: column.key, label: column.label })),
        rows: canonicalTable(dataset.columns, dataset.rows),
    };
    if (dataset.extraTables && dataset.extraTables.length > 0) {
        payload.extraTables = dataset.extraTables.map(canonicalExtra);
    }
    return canonicalStringify(payload);
}

export async function sha256Hex(text: string): Promise<string> {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
        throw new Error('Este navegador não oferece SHA-256 (use HTTPS).');
    }
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

/** 'ABCDEFGH2345' -> 'ABCD-EFGH-2345'. */
export function formatVerificationCode(code: string): string {
    const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return clean.match(/.{1,4}/g)?.join('-') ?? clean;
}

export function verificationUrl(code: string): string {
    const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return `${window.location.origin}/verificar/${formatVerificationCode(clean)}`;
}

// ── CSV ─────────────────────────────────────────────────────────────────────

const CSV_BOM = '﻿';
const CSV_SEPARATOR = ';';
const CSV_EOL = '\r\n';

function csvCell(value: string): string {
    // Proteção contra injeção de fórmulas em planilhas: texto que começa com
    // = + - @ ganha apóstrofo (números negativos legítimos não são alterados).
    let safe = value;
    if (/^[=+\-@\t\r]/.test(safe) && !/^-?\d+(\.\d+)?$/.test(safe)) safe = `'${safe}`;
    return /[;"\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function csvLine(cells: string[]): string {
    return cells.map(csvCell).join(CSV_SEPARATOR);
}

export interface CsvAuthenticity {
    reportTitle: string;
    code?: string;
    hash?: string;
    generatedAt: string;
    url?: string;
}

export function buildReportCsv(dataset: ReportDataset, auth: CsvAuthenticity): string {
    const lines: string[] = [];
    lines.push(csvLine(dataset.columns.map((column) => column.label)));
    for (const cells of canonicalTable(dataset.columns, dataset.rows)) lines.push(csvLine(cells));
    for (const table of dataset.extraTables ?? []) {
        lines.push('');
        lines.push(csvLine([table.title]));
        lines.push(csvLine(table.columns.map((column) => column.label)));
        for (const cells of canonicalTable(table.columns, table.rows)) lines.push(csvLine(cells));
    }
    lines.push('');
    lines.push(csvLine(['Relatório', auth.reportTitle]));
    if (auth.code && auth.hash && auth.url) {
        lines.push(csvLine(['Código de verificação', auth.code]));
        lines.push(csvLine([`Hash SHA-256 (${REPORT_FORMAT_VERSION})`, auth.hash]));
        lines.push(csvLine(['Gerado em', auth.generatedAt]));
        lines.push(csvLine(['Confira a autenticidade em', auth.url]));
    } else {
        lines.push(csvLine(['Gerado em', auth.generatedAt]));
        lines.push(csvLine(['Autenticidade', 'Sem código de verificação (registro indisponível na emissão)']));
    }
    return CSV_BOM + lines.join(CSV_EOL) + CSV_EOL;
}
