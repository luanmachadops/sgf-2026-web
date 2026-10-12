// Encaixe da tabela na folha A4 — puro e testável (sem DOM, sem pdf-lib).
//
// Regra: a fonte impressa nunca fica abaixo de MIN_PRINT_FONT_PT. Quando a
// tabela não cabe, muda-se o layout, nunca o tamanho da letra:
//   1. retrato com larguras naturais
//   2. paisagem automática
//   3. colunas de texto quebram linha (largura entre mínima e natural)
//   4. colunas com `stackUnder` viram 2ª linha da coluna-mãe
//   5. divisão em blocos de colunas, repetindo as colunas-âncora
// As larguras saem do conteúdo medido com a fonte real do PDF.

import { computeTotals, formatPrintValue, printColumnLabel } from './format';
import type { ReportColumn, ReportDataset, ReportOrientation } from './types';

export interface TextMeasurer {
    /** Largura em pontos do texto na fonte do PDF. */
    width(text: string, size: number, bold?: boolean): number;
}

export const MIN_PRINT_FONT_PT = 8;
export const MAX_PRINT_FONT_PT = 11;
export const DEFAULT_PRINT_FONT_PT = 9;

const MM = 72 / 25.4;
export const PAGE_MARGIN_PT = 10 * MM;
export const A4_PORTRAIT = { width: 595.28, height: 841.89 } as const;
export const A4_LANDSCAPE = { width: 841.89, height: 595.28 } as const;

export function contentWidth(orientation: 'portrait' | 'landscape'): number {
    const page = orientation === 'portrait' ? A4_PORTRAIT : A4_LANDSCAPE;
    return page.width - PAGE_MARGIN_PT * 2;
}

/** Espaço horizontal interno de cada célula (cada lado). */
export const CELL_PAD_X = 4;
/** Palavras maiores que isso quebram por caractere (UUID, hash, URL). */
const MAX_WORD_PT = 110;
/** Coluna de texto não pede mais que isso de largura natural (~70 mm). */
const MAX_TEXT_NATURAL_PT = 200;
const SAMPLE_ROWS = 1500;

export const headerFontSize = (fontSize: number) => Math.max(MIN_PRINT_FONT_PT - 0.5, fontSize - 1);
export const stackedFontSize = (fontSize: number) => Math.max(MIN_PRINT_FONT_PT - 0.5, fontSize - 1);

export interface LayoutCell {
    column: ReportColumn;
    /** Colunas impressas como linhas extras desta célula (empilhamento). */
    children: ReportColumn[];
    width: number;
    wrap: boolean;
}

export interface LayoutBlock {
    cells: LayoutCell[];
}

export type FitStatus = 'fits' | 'wrapped' | 'stacked' | 'split';

export interface TableLayout {
    orientation: 'portrait' | 'landscape';
    /** A orientação foi trocada para paisagem automaticamente. */
    autoLandscape: boolean;
    fontSize: number;
    status: FitStatus;
    blocks: LayoutBlock[];
    tableWidth: number;
    /** Largura mínima da tabela sem dividir ÷ largura útil (1 = no limite). */
    fillRatio: number;
    /** Colunas visíveis de prioridade 3, sugeridas para remoção quando não cabe. */
    removableColumns: ReportColumn[];
}

interface Metrics {
    min: number;
    nat: number;
    wrap: boolean;
}

export function isWrapColumn(column: ReportColumn): boolean {
    return (column.format ?? 'text') === 'text';
}

export function headerText(cellColumn: ReportColumn, children: ReportColumn[]): string {
    return [cellColumn, ...children].map(printColumnLabel).join(' / ');
}

function longestWord(text: string, size: number, bold: boolean, measurer: TextMeasurer): number {
    let max = 0;
    for (const word of text.split(/\s+/)) {
        if (!word) continue;
        max = Math.max(max, measurer.width(word, size, bold));
    }
    return Math.min(max, MAX_WORD_PT);
}

function sampleRows<T>(rows: T[]): T[] {
    if (rows.length <= SAMPLE_ROWS) return rows;
    const step = rows.length / SAMPLE_ROWS;
    return Array.from({ length: SAMPLE_ROWS }, (_, index) => rows[Math.floor(index * step)]);
}

function contentMetrics(
    column: ReportColumn,
    texts: string[],
    size: number,
    measurer: TextMeasurer,
): { min: number; nat: number } {
    const wrap = isWrapColumn(column);
    let min = 0;
    const widths: number[] = [];
    for (const text of texts) {
        const width = measurer.width(text, size);
        widths.push(width);
        min = Math.max(min, wrap ? longestWord(text, size, false, measurer) : width);
    }
    if (!wrap) return { min, nat: min };
    widths.sort((a, b) => a - b);
    const p95 = widths.length ? widths[Math.min(widths.length - 1, Math.floor(widths.length * 0.95))] : 0;
    return { min, nat: Math.min(Math.max(p95, min), MAX_TEXT_NATURAL_PT) };
}

function cellMetrics(
    column: ReportColumn,
    children: ReportColumn[],
    textsByKey: Map<string, string[]>,
    fontSize: number,
    measurer: TextMeasurer,
): Metrics {
    const headSize = headerFontSize(fontSize);
    const header = headerText(column, children);
    const headerMin = longestWord(header, headSize, true, measurer);
    // O cabeçalho pode ocupar até 2 linhas na largura natural.
    const headerNat = Math.max(headerMin, measurer.width(header, headSize, true) / 2);
    let { min, nat } = contentMetrics(column, textsByKey.get(column.key) ?? [], fontSize, measurer);
    for (const child of children) {
        const childMetrics = contentMetrics(
            { ...child, format: 'text' },
            textsByKey.get(child.key) ?? [],
            stackedFontSize(fontSize),
            measurer,
        );
        min = Math.max(min, childMetrics.min);
        nat = Math.max(nat, childMetrics.nat);
    }
    const pad = CELL_PAD_X * 2;
    const cellMin = Math.max(headerMin, min) + pad;
    return {
        min: cellMin,
        nat: Math.max(cellMin, Math.max(headerNat, nat) + pad),
        wrap: isWrapColumn(column) || children.length > 0,
    };
}

/** Distribui a largura útil; `null` quando nem a largura mínima cabe. */
function fitWidths(metrics: Metrics[], available: number): number[] | null {
    const sumNat = metrics.reduce((sum, item) => sum + item.nat, 0);
    const sumMin = metrics.reduce((sum, item) => sum + item.min, 0);
    if (sumNat <= available) {
        // Sobra de largura: distribui proporcionalmente, para nenhuma coluna
        // "engolir" a folha inteira.
        const extra = available - sumNat;
        return metrics.map((item) => item.nat + extra * (item.nat / (sumNat || 1)));
    }
    if (sumMin <= available) {
        // Encolhe primeiro as colunas mais largas: procura o teto L tal que
        // Σ max(mín, min(natural, L)) = largura útil. Colunas curtas ficam intactas.
        const widthAt = (cap: number) => metrics.map((item) => Math.max(item.min, Math.min(item.nat, cap)));
        let low = 0;
        let high = Math.max(...metrics.map((item) => item.nat));
        for (let step = 0; step < 40; step += 1) {
            const mid = (low + high) / 2;
            if (widthAt(mid).reduce((sum, width) => sum + width, 0) > available) high = mid;
            else low = mid;
        }
        const widths = widthAt(low);
        // Sobra residual da busca vai para as colunas que foram cortadas.
        const slack = available - widths.reduce((sum, width) => sum + width, 0);
        const capped = metrics.map((item, index) => item.nat > widths[index]);
        const cappedCount = capped.filter(Boolean).length || 1;
        return widths.map((width, index) => (capped[index] ? width + slack / cappedCount : width));
    }
    return null;
}

/** Força caber (coluna única gigante): proporcional ao mínimo; o texto quebra por caractere. */
function forceWidths(metrics: Metrics[], available: number): number[] {
    const sumMin = metrics.reduce((sum, item) => sum + item.min, 0) || 1;
    return metrics.map((item) => (item.min / sumMin) * available);
}

function stackColumns(columns: ReportColumn[]): { column: ReportColumn; children: ReportColumn[] }[] {
    const visible = new Set(columns.map((column) => column.key));
    const parentOf = (column: ReportColumn) => {
        const target = column.stackUnder;
        if (!target || !visible.has(target)) return undefined;
        const parent = columns.find((candidate) => candidate.key === target);
        // Sem cadeias: a mãe não pode ela mesma estar empilhada.
        return parent && !(parent.stackUnder && visible.has(parent.stackUnder)) ? target : undefined;
    };
    const groups: { column: ReportColumn; children: ReportColumn[] }[] = [];
    for (const column of columns) {
        if (parentOf(column)) continue;
        groups.push({
            column,
            children: columns.filter((candidate) => parentOf(candidate) === column.key),
        });
    }
    return groups;
}

/**
 * Divide as colunas em blocos que cabem na largura. Primeiro descobre o número
 * mínimo de blocos (guloso) e depois equilibra as larguras, para não sobrar um
 * último bloco com uma coluna só.
 */
function balancedChunks(indexes: number[], widthOf: (index: number) => number, capacity: number): number[][] {
    const greedy: number[][] = [];
    let current: number[] = [];
    let used = 0;
    for (const index of indexes) {
        if (current.length > 0 && used + widthOf(index) > capacity) {
            greedy.push(current);
            current = [];
            used = 0;
        }
        current.push(index);
        used += widthOf(index);
    }
    if (current.length > 0) greedy.push(current);
    if (greedy.length <= 1) return greedy;

    const blocks = greedy.length;
    const balanced: number[][] = [];
    let remaining = indexes.reduce((sum, index) => sum + widthOf(index), 0);
    current = [];
    used = 0;
    indexes.forEach((index, position) => {
        const width = widthOf(index);
        const blocksLeft = blocks - balanced.length;
        const target = remaining / blocksLeft;
        const columnsLeft = indexes.length - position;
        const mustClose = used + width > capacity;
        const shouldClose = blocksLeft > 1 && used + width / 2 > target && columnsLeft >= blocksLeft - 1;
        if (current.length > 0 && (mustClose || shouldClose)) {
            balanced.push(current);
            remaining -= used;
            current = [];
            used = 0;
        }
        current.push(index);
        used += width;
    });
    if (current.length > 0) balanced.push(current);
    const fits = balanced.every((chunk) => chunk.length === 1
        || chunk.reduce((sum, index) => sum + widthOf(index), 0) <= capacity);
    return balanced.length === blocks && fits ? balanced : greedy;
}

export interface LayoutInput {
    columns: ReportColumn[];
    rows: ReportDataset['rows'];
    orientation: ReportOrientation;
    fontSize: number;
}

export function clampPrintFont(fontSize: number): number {
    if (!Number.isFinite(fontSize)) return DEFAULT_PRINT_FONT_PT;
    return Math.min(MAX_PRINT_FONT_PT, Math.max(MIN_PRINT_FONT_PT, fontSize));
}

export function computeTableLayout(input: LayoutInput, measurer: TextMeasurer): TableLayout {
    const fontSize = clampPrintFont(input.fontSize);
    const { columns } = input;
    const sample = sampleRows(input.rows);
    const totals = computeTotals(columns, input.rows);
    const textsByKey = new Map<string, string[]>();
    for (const column of columns) {
        const texts = sample.map((row) => formatPrintValue(row[column.key], column.format));
        if (totals && column.key in totals) texts.push(formatPrintValue(totals[column.key], column.format));
        textsByKey.set(column.key, texts);
    }
    const removableColumns = columns.filter((column) => column.priority === 3);

    const flatGroups = columns.map((column) => ({ column, children: [] as ReportColumn[] }));
    const stackedGroups = stackColumns(columns);
    const measure = (groups: { column: ReportColumn; children: ReportColumn[] }[]) =>
        groups.map((group) => cellMetrics(group.column, group.children, textsByKey, fontSize, measurer));
    const flatMetrics = measure(flatGroups);
    const stackedMetrics = stackedGroups.length < flatGroups.length ? measure(stackedGroups) : null;

    const toBlock = (
        groups: { column: ReportColumn; children: ReportColumn[] }[],
        metrics: Metrics[],
        widths: number[],
    ): LayoutBlock => ({
        cells: groups.map((group, index) => ({
            column: group.column,
            children: group.children,
            width: widths[index],
            wrap: metrics[index].wrap,
        })),
    });
    const sumNat = (metrics: Metrics[]) => metrics.reduce((sum, item) => sum + item.nat, 0);
    const sumMin = (metrics: Metrics[]) => metrics.reduce((sum, item) => sum + item.min, 0);

    const build = (
        orientation: 'portrait' | 'landscape',
        autoLandscape: boolean,
    ): TableLayout | null => {
        const available = contentWidth(orientation);
        const base = { orientation, autoLandscape, fontSize, removableColumns };
        const flat = fitWidths(flatMetrics, available);
        if (flat) {
            return {
                ...base,
                status: sumNat(flatMetrics) <= available ? 'fits' : 'wrapped',
                blocks: [toBlock(flatGroups, flatMetrics, flat)],
                tableWidth: available,
                fillRatio: sumMin(flatMetrics) / available,
            };
        }
        if (stackedMetrics) {
            const stacked = fitWidths(stackedMetrics, available);
            if (stacked) {
                return {
                    ...base,
                    status: 'stacked',
                    blocks: [toBlock(stackedGroups, stackedMetrics, stacked)],
                    tableWidth: available,
                    fillRatio: sumMin(stackedMetrics) / available,
                };
            }
        }
        return null;
    };

    const split = (orientation: 'portrait' | 'landscape', autoLandscape: boolean): TableLayout => {
        const available = contentWidth(orientation);
        const groups = stackedMetrics ? stackedGroups : flatGroups;
        const metrics = stackedMetrics ?? flatMetrics;
        let anchorIdx = groups
            .map((group, index) => (group.column.anchor ? index : -1))
            .filter((index) => index >= 0);
        if (anchorIdx.length === 0) anchorIdx = [0];
        const anchorWidth = () => anchorIdx.reduce((sum, index) => sum + metrics[index].min, 0);
        if (anchorWidth() > available * 0.45) anchorIdx = [anchorIdx[0]];
        if (anchorWidth() > available * 0.45) anchorIdx = [];

        const rest = groups.map((_, index) => index).filter((index) => !anchorIdx.includes(index));
        const capacity = available - anchorWidth();
        const chunks = balancedChunks(rest, (index) => metrics[index].min, capacity);

        const blocks = chunks.map((chunk) => {
            const indexes = [...anchorIdx, ...chunk];
            const blockGroups = indexes.map((index) => groups[index]);
            const blockMetrics = indexes.map((index) => metrics[index]);
            const widths = fitWidths(blockMetrics, available) ?? forceWidths(blockMetrics, available);
            return toBlock(blockGroups, blockMetrics, widths);
        });
        return {
            orientation,
            autoLandscape,
            fontSize,
            removableColumns,
            status: 'split',
            blocks,
            tableWidth: available,
            fillRatio: sumMin(metrics) / available,
        };
    };

    if (columns.length === 0) {
        return {
            orientation: input.orientation === 'landscape' ? 'landscape' : 'portrait',
            autoLandscape: false,
            fontSize,
            status: 'fits',
            blocks: [],
            tableWidth: 0,
            fillRatio: 0,
            removableColumns,
        };
    }

    if (input.orientation === 'auto') {
        const portraitWidth = contentWidth('portrait');
        // Retrato só quando cabe sem apertar; senão paisagem, que comporta mais.
        if (sumNat(flatMetrics) <= portraitWidth) return build('portrait', false)!;
        return build('landscape', true) ?? split('landscape', true);
    }
    return build(input.orientation, false) ?? split(input.orientation, false);
}

/**
 * Quebra o texto em linhas que cabem na largura. Palavras maiores que a
 * largura (UUID, hash) quebram por caractere.
 */
export function wrapText(
    text: string,
    maxWidth: number,
    size: number,
    measurer: TextMeasurer,
    bold = false,
): string[] {
    const width = (value: string) => measurer.width(value, size, bold);
    const lines: string[] = [];
    for (const paragraph of text.split(/\r?\n/)) {
        let line = '';
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            const candidate = line ? `${line} ${word}` : word;
            if (width(candidate) <= maxWidth) {
                line = candidate;
                continue;
            }
            if (line) lines.push(line);
            line = '';
            if (width(word) <= maxWidth) {
                line = word;
                continue;
            }
            let chunk = '';
            for (const char of word) {
                if (chunk && width(chunk + char) > maxWidth) {
                    lines.push(chunk);
                    chunk = '';
                }
                chunk += char;
            }
            line = chunk;
        }
        lines.push(line);
    }
    return lines.length ? lines : [''];
}

export function describeLayout(layout: TableLayout): { tone: 'ok' | 'info' | 'warn'; message: string } {
    const page = layout.orientation === 'portrait' ? 'A4 retrato' : 'A4 paisagem';
    const font = `fonte ${layout.fontSize.toLocaleString('pt-BR')} pt`;
    if (layout.status === 'fits') {
        return {
            tone: layout.autoLandscape ? 'info' : 'ok',
            message: layout.autoLandscape
                ? `Paisagem automática: a tabela cabe em ${page}, ${font}.`
                : `Cabe em ${page}, ${font}.`,
        };
    }
    if (layout.status === 'wrapped') {
        return { tone: 'info', message: `Cabe em ${page}, ${font}, com quebra de linha nos textos longos.` };
    }
    if (layout.status === 'stacked') {
        return {
            tone: 'info',
            message: `Cabe em ${page}, ${font}, com campos agrupados na mesma célula (ex.: placa e modelo).`,
        };
    }
    const removable = layout.removableColumns.map((column) => column.label);
    return {
        tone: 'warn',
        message: `A tabela ocupa ${Math.round(layout.fillRatio * 100)}% da folha e será impressa em ${layout.blocks.length} blocos de colunas (${font}).`
            + (removable.length ? ` Para caber num bloco só, remova: ${removable.join(', ')}.` : ' Para caber num bloco só, desmarque algumas colunas.'),
    };
}
