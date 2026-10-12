// Gerador de PDF dos relatórios — 100% vetorial e leve.
//
// - Texto é texto do PDF (selecionável e pesquisável), nas fontes padrão
//   Helvetica/Helvetica-Bold: não são embutidas (0 KB) e a codificação WinAnsi
//   cobre todos os acentos do português.
// - Tabela, linhas, fundos, gráficos e logo padrão são desenhados como vetor.
// - A única imagem possível é o brasão/logo da prefeitura, embutido uma vez e
//   reaproveitado em todas as páginas (o navegador o reduz antes, ver
//   `reportPdfBrowser.ts`).
// Sem DOM: roda no navegador e no Node (testes em sgf-2026/tests).

import {
    PDFDocument,
    StandardFonts,
    rgb,
    type PDFFont,
    type PDFImage,
    type PDFPage,
    type RGB,
} from 'pdf-lib';
import {
    computeTotals,
    filtersSummary,
    formatPrintValue,
    formatReportValue,
    generatedAt,
    institutionLines,
    safeHex,
    totalsLabel,
} from './format';
import {
    A4_LANDSCAPE,
    A4_PORTRAIT,
    CELL_PAD_X,
    DEFAULT_PRINT_FONT_PT,
    PAGE_MARGIN_PT,
    computeTableLayout,
    headerFontSize,
    headerText,
    stackedFontSize,
    wrapText,
    type LayoutBlock,
    type TableLayout,
    type TextMeasurer,
} from './layout';
import type { ReportChart, ReportColumn, ReportDataset, ReportExportOptions, ReportSignature } from './types';

export interface ReportLogo {
    bytes: Uint8Array;
    type: 'png' | 'jpg';
}

export interface BuildReportPdfOptions extends ReportExportOptions {
    logo?: ReportLogo | null;
    /** Data de emissão (fixa nos testes). */
    issuedAt?: Date;
}

const DEFAULT_PRIMARY = '00A86B';
const DEFAULT_DARK = '0F2B2F';
const DEFAULT_ACCENT = '70C4A8';

const C = {
    text: hex('1F2937'),
    body: hex('334155'),
    muted: hex('6B7280'),
    faint: hex('94A3B8'),
    rule: hex('E3E8EB'),
    headerFill: hex('E9EEF1'),
    totalFill: hex('EEF2F4'),
    zebra: hex('F7F9FA'),
    groupFill: hex('EAF4F0'),
    panel: hex('F4F7F8'),
    border: hex('DFE7E5'),
    track: hex('E8EFED'),
    white: rgb(1, 1, 1),
};

const CHART_COLORS = ['00A86B', '0F2B2F', '70C4A8', '3B82F6', 'F59E0B', '8B5CF6', 'DC2626', '64748B'];

function hex(value: string): RGB {
    const n = Number.parseInt(value, 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// ── Fontes e medição ────────────────────────────────────────────────────────

interface Fonts {
    regular: PDFFont;
    bold: PDFFont;
    clean: (text: string) => string;
    measurer: TextMeasurer;
}

const SPACE_LIKE = /[\u2000-\u200B\u202F\u205F\u3000]/g;

async function loadFonts(doc: PDFDocument): Promise<Fonts> {
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const supported = new Set(regular.getCharacterSet());
    const cache = new Map<string, string>();
    // WinAnsi não tem todos os caracteres Unicode; troca o que faltar pelo
    // equivalente sem acento ou por "?" em vez de deixar o PDF falhar.
    const clean = (text: string) => {
        const cached = cache.get(text);
        if (cached !== undefined) return cached;
        let out = '';
        for (const char of text.replace(SPACE_LIKE, ' ')) {
            const code = char.codePointAt(0) ?? 0;
            if (code === 10 || code === 13 || code === 9) {
                out += ' ';
                continue;
            }
            if (supported.has(code)) {
                out += char;
                continue;
            }
            if (code < 32) continue;
            const base = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            out += base && [...base].every((part) => supported.has(part.codePointAt(0) ?? 0)) ? base : '?';
        }
        if (cache.size < 20000) cache.set(text, out);
        return out;
    };
    const measurer: TextMeasurer = {
        width: (text, size, isBold) => (isBold ? bold : regular).widthOfTextAtSize(clean(text), size),
    };
    return { regular, bold, clean, measurer };
}

let measurerPromise: Promise<TextMeasurer> | null = null;

/** Medidor com as mesmas fontes do PDF, para o medidor de encaixe da tela. */
export function getPdfTextMeasurer(): Promise<TextMeasurer> {
    measurerPromise ??= PDFDocument.create().then(loadFonts).then((fonts) => fonts.measurer);
    return measurerPromise;
}

// ── Contexto de desenho ─────────────────────────────────────────────────────

interface Ctx {
    doc: PDFDocument;
    fonts: Fonts;
    logo: PDFImage | null;
    primary: RGB;
    dark: RGB;
    accent: RGB;
    page: PDFPage;
    pageWidth: number;
    pageHeight: number;
    /** Distância a partir do topo da folha (pt). */
    y: number;
    pages: PDFPage[];
    institution: string;
    title: string;
}

const M = PAGE_MARGIN_PT;
const FOOTER_RESERVED = 26;

function text(
    ctx: Ctx,
    value: string,
    x: number,
    top: number,
    size: number,
    options: { bold?: boolean; color?: RGB; align?: 'left' | 'right' | 'center'; width?: number } = {},
) {
    const font = options.bold ? ctx.fonts.bold : ctx.fonts.regular;
    const clean = ctx.fonts.clean(value);
    if (!clean) return;
    const width = font.widthOfTextAtSize(clean, size);
    let drawX = x;
    if (options.align === 'right' && options.width !== undefined) drawX = x + options.width - width;
    if (options.align === 'center' && options.width !== undefined) drawX = x + (options.width - width) / 2;
    // `top` é o topo da caixa da linha; a linha de base fica ~0,8 do tamanho abaixo.
    ctx.page.drawText(clean, {
        x: drawX,
        y: ctx.pageHeight - top - size * 0.8,
        size,
        font,
        color: options.color ?? C.text,
    });
}

function rect(ctx: Ctx, x: number, top: number, width: number, height: number, color: RGB, border?: RGB) {
    ctx.page.drawRectangle({
        x,
        y: ctx.pageHeight - top - height,
        width,
        height,
        color,
        ...(border ? { borderColor: border, borderWidth: 0.6 } : {}),
    });
}

function hline(ctx: Ctx, x1: number, x2: number, top: number, thickness: number, color: RGB) {
    ctx.page.drawLine({
        start: { x: x1, y: ctx.pageHeight - top },
        end: { x: x2, y: ctx.pageHeight - top },
        thickness,
        color,
    });
}

/** Trunca com reticências para caber numa linha. */
function fitLine(ctx: Ctx, value: string, maxWidth: number, size: number, bold = false): string {
    const font = bold ? ctx.fonts.bold : ctx.fonts.regular;
    let clean = ctx.fonts.clean(value);
    if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
    while (clean.length > 1 && font.widthOfTextAtSize(`${clean}…`, size) > maxWidth) clean = clean.slice(0, -1);
    return `${clean.trimEnd()}…`;
}

function contentLeft() {
    return M;
}

function contentRight(ctx: Ctx) {
    return ctx.pageWidth - M;
}

function bodyBottom(ctx: Ctx) {
    return ctx.pageHeight - M - FOOTER_RESERVED;
}

// ── Logo ────────────────────────────────────────────────────────────────────

/** Escudo padrão do sistema, em vetor (mesmo desenho do ícone da tela). */
function drawDefaultLogo(ctx: Ctx, x: number, top: number, size: number) {
    const scale = size / 24;
    const y = ctx.pageHeight - top;
    ctx.page.drawSvgPath('M7 0H17A7 7 0 0 1 24 7V17A7 7 0 0 1 17 24H7A7 7 0 0 1 0 17V7A7 7 0 0 1 7 0Z', {
        x, y, scale, color: ctx.primary,
    });
    ctx.page.drawSvgPath('M12 5l4.5 1.8v3.6c0 2.8-1.9 5.4-4.5 6.3-2.6-.9-4.5-3.5-4.5-6.3V6.8L12 5z', {
        x, y, scale, color: C.white, opacity: 0.25,
    });
    ctx.page.drawSvgPath('M10.6 12.2l-1.3-1.3-1 1 2.3 2.4 4-4.1-1-1-3 3z', { x, y, scale, color: C.white });
}

function drawLogo(ctx: Ctx, x: number, top: number, size: number) {
    if (!ctx.logo) {
        drawDefaultLogo(ctx, x, top, size);
        return;
    }
    const ratio = Math.min(size / ctx.logo.width, size / ctx.logo.height);
    const width = ctx.logo.width * ratio;
    const height = ctx.logo.height * ratio;
    ctx.page.drawImage(ctx.logo, {
        x: x + (size - width) / 2,
        y: ctx.pageHeight - top - (size + height) / 2,
        width,
        height,
    });
}

// ── Páginas ─────────────────────────────────────────────────────────────────

function addPage(ctx: Ctx, orientation: 'portrait' | 'landscape') {
    const size = orientation === 'portrait' ? A4_PORTRAIT : A4_LANDSCAPE;
    ctx.page = ctx.doc.addPage([size.width, size.height]);
    ctx.pageWidth = size.width;
    ctx.pageHeight = size.height;
    ctx.pages.push(ctx.page);
    ctx.y = M;
}

/** Faixa fina das páginas de continuação. */
function drawContinuationHeader(ctx: Ctx) {
    const logoSize = 18;
    drawLogo(ctx, contentLeft(), ctx.y, logoSize);
    const textX = contentLeft() + logoSize + 7;
    const right = contentRight(ctx);
    text(ctx, 'CONTINUAÇÃO', textX, ctx.y + 1, 6.5, {
        bold: true, color: ctx.primary, align: 'right', width: right - textX,
    });
    const label = fitLine(ctx, ctx.institution, right - textX - 60, 7.5, true);
    text(ctx, label, textX, ctx.y + 1, 7.5, { bold: true, color: ctx.dark });
    text(ctx, fitLine(ctx, ctx.title, right - textX, 7.5), textX, ctx.y + 10.5, 7.5, { color: C.muted });
    ctx.y += logoSize + 5;
    hline(ctx, contentLeft(), right, ctx.y, 0.8, ctx.primary);
    ctx.y += 8;
}

function drawFirstHeader(ctx: Ctx, options: BuildReportPdfOptions, issued: string) {
    const left = contentLeft();
    const right = contentRight(ctx);
    const logoSize = 44;
    drawLogo(ctx, left, ctx.y, logoSize);

    const metaWidth = 110;
    text(ctx, 'RELATÓRIO OFICIAL', right - metaWidth, ctx.y + 4, 7, {
        bold: true, color: ctx.primary, align: 'right', width: metaWidth,
    });
    text(ctx, `Emissão: ${issued}`, right - metaWidth, ctx.y + 14, 7, {
        color: C.muted, align: 'right', width: metaWidth,
    });

    const textX = left + logoSize + 10;
    const textWidth = right - metaWidth - 10 - textX;
    let lineTop = ctx.y + 4;
    for (const line of wrapText(ctx.institution, textWidth, 11, ctx.fonts.measurer, true).slice(0, 2)) {
        text(ctx, line, textX, lineTop, 11, { bold: true, color: ctx.dark });
        lineTop += 13;
    }
    for (const line of institutionLines(options.branding)) {
        text(ctx, fitLine(ctx, line.toUpperCase(), textWidth, 6.8), textX, lineTop, 6.8, { color: C.muted });
        lineTop += 8.5;
    }
    ctx.y = Math.max(ctx.y + logoSize, lineTop) + 6;
    hline(ctx, left, right, ctx.y, 2, ctx.primary);
    ctx.y += 12;

    for (const line of wrapText(options.reportTitle, right - left, 15, ctx.fonts.measurer, true)) {
        text(ctx, line, left, ctx.y, 15, { bold: true, color: ctx.dark });
        ctx.y += 18;
    }
    if (options.reportDescription) {
        for (const line of wrapText(options.reportDescription, right - left, 8.5, ctx.fonts.measurer)) {
            text(ctx, line, left, ctx.y, 8.5, { color: C.muted });
            ctx.y += 11;
        }
    }
    ctx.y += 5;

    const summaryLines = wrapText(filtersSummary(options.filters), right - left - 16, 7.5, ctx.fonts.measurer, true);
    const boxHeight = summaryLines.length * 10 + 9;
    rect(ctx, left, ctx.y, right - left, boxHeight, C.panel);
    rect(ctx, left, ctx.y, 2.5, boxHeight, ctx.accent);
    summaryLines.forEach((line, index) => {
        text(ctx, line, left + 10, ctx.y + 5 + index * 10, 7.5, { bold: true, color: C.body });
    });
    ctx.y += boxHeight + 10;
}

function drawKpis(ctx: Ctx, options: BuildReportPdfOptions) {
    const kpis = options.dataset.kpis;
    if (kpis.length === 0) return;
    const left = contentLeft();
    const total = contentRight(ctx) - left;
    const perRow = Math.min(kpis.length, ctx.pageWidth > ctx.pageHeight ? 6 : 4);
    const gap = 6;
    const width = (total - gap * (perRow - 1)) / perRow;
    const height = 36;
    kpis.forEach((kpi, index) => {
        const column = index % perRow;
        const row = Math.floor(index / perRow);
        const x = left + column * (width + gap);
        const top = ctx.y + row * (height + gap);
        rect(ctx, x, top, width, height, C.white, C.border);
        text(ctx, fitLine(ctx, kpi.value, width - 14, 11.5, true), x + 7, top + 7, 11.5, { bold: true, color: ctx.dark });
        text(ctx, fitLine(ctx, kpi.label.toUpperCase(), width - 14, 6.3, true), x + 7, top + 23, 6.3, {
            bold: true, color: C.muted,
        });
    });
    ctx.y += Math.ceil(kpis.length / perRow) * (height + gap) + 4;
}

// ── Gráficos (vetor) ────────────────────────────────────────────────────────

const CHART_HEIGHT = 128;

function polar(cx: number, cy: number, radius: number, angle: number) {
    // Ângulo em radianos a partir do topo, sentido horário, em coordenadas SVG.
    return { x: cx + radius * Math.sin(angle), y: cy - radius * Math.cos(angle) };
}

function ringSlice(cx: number, cy: number, outer: number, inner: number, start: number, end: number): string {
    const large = end - start > Math.PI ? 1 : 0;
    const p1 = polar(cx, cy, outer, start);
    const p2 = polar(cx, cy, outer, end);
    const p3 = polar(cx, cy, inner, end);
    const p4 = polar(cx, cy, inner, start);
    const f = (n: number) => n.toFixed(3);
    return `M${f(p1.x)} ${f(p1.y)}A${outer} ${outer} 0 ${large} 1 ${f(p2.x)} ${f(p2.y)}`
        + `L${f(p3.x)} ${f(p3.y)}A${inner} ${inner} 0 ${large} 0 ${f(p4.x)} ${f(p4.y)}Z`;
}

function drawChartFrame(ctx: Ctx, chart: ReportChart, x: number, width: number): number {
    rect(ctx, x, ctx.y, width, CHART_HEIGHT, C.white, C.border);
    text(ctx, fitLine(ctx, chart.title, width - 16, 8.5, true), x + 8, ctx.y + 7, 8.5, { bold: true, color: ctx.dark });
    if (chart.description) {
        text(ctx, fitLine(ctx, chart.description, width - 16, 6.5), x + 8, ctx.y + 18, 6.5, { color: C.muted });
    }
    return ctx.y + 30;
}

function drawBarChart(ctx: Ctx, chart: ReportChart, x: number, width: number) {
    const top = drawChartFrame(ctx, chart, x, width);
    const data = chart.data.filter((item) => item.value >= 0).slice(0, 8);
    const max = Math.max(...data.map((item) => item.value), 1);
    const labelWidth = Math.min(110, width * 0.34);
    const valueWidth = 64;
    const trackX = x + 8 + labelWidth + 6;
    const trackWidth = width - 16 - labelWidth - valueWidth - 12;
    const rowHeight = Math.min(11.5, (CHART_HEIGHT - 38) / Math.max(data.length, 1));
    data.forEach((item, index) => {
        const rowTop = top + index * rowHeight;
        text(ctx, fitLine(ctx, item.label, labelWidth, 6.8), x + 8, rowTop + 1, 6.8, { color: C.body });
        rect(ctx, trackX, rowTop + 2.5, trackWidth, 4.5, C.track);
        rect(ctx, trackX, rowTop + 2.5, Math.max(1.5, (item.value / max) * trackWidth), 4.5, ctx.primary);
        text(ctx, formatReportValue(item.value, chart.valueFormat ?? 'integer'), trackX + trackWidth + 6, rowTop + 1, 6.8, {
            bold: true, color: ctx.dark, align: 'right', width: valueWidth,
        });
    });
}

function drawDonutChart(ctx: Ctx, chart: ReportChart, x: number, width: number) {
    const top = drawChartFrame(ctx, chart, x, width);
    const data = chart.data.filter((item) => item.value > 0).slice(0, 8);
    const total = data.reduce((sum, item) => sum + item.value, 0);
    const outer = 40;
    const inner = 25;
    const cx = x + 16 + outer;
    const cyTop = top + outer + 2;
    const originY = ctx.pageHeight; // SVG: origem no topo da folha
    if (total <= 0) {
        text(ctx, 'Sem valores no período.', x + 8, top + 4, 7, { color: C.muted });
        return;
    }
    let angle = 0;
    data.forEach((item, index) => {
        const sweep = (item.value / total) * Math.PI * 2;
        const color = hex(CHART_COLORS[index % CHART_COLORS.length]);
        // Fatia de 360° é desenhada em duas metades (arco SVG não fecha círculo).
        const parts = sweep >= Math.PI * 2 - 1e-6 ? [[0, Math.PI], [Math.PI, Math.PI * 2]] : [[angle, angle + sweep]];
        for (const [start, end] of parts) {
            ctx.page.drawSvgPath(ringSlice(cx, cyTop, outer, inner, start, end), { x: 0, y: originY, color });
        }
        angle += sweep;
    });
    const legendX = cx + outer + 18;
    const legendWidth = x + width - 8 - legendX;
    data.forEach((item, index) => {
        const rowTop = top + index * 11;
        rect(ctx, legendX, rowTop + 1.5, 6, 6, hex(CHART_COLORS[index % CHART_COLORS.length]));
        const value = formatReportValue(item.value, chart.valueFormat ?? 'integer');
        const pct = `${Math.round((item.value / total) * 100)}%`;
        text(ctx, `${value} · ${pct}`, legendX + 10, rowTop, 6.8, {
            bold: true, color: ctx.dark, align: 'right', width: legendWidth - 10,
        });
        text(ctx, fitLine(ctx, item.label, legendWidth - 80, 6.8), legendX + 10, rowTop, 6.8, { color: C.body });
    });
}

function drawGaugeChart(ctx: Ctx, chart: ReportChart, x: number, width: number) {
    const top = drawChartFrame(ctx, chart, x, width);
    const data = chart.data.slice(0, 4);
    if (data.length === 0) {
        text(ctx, 'Sem contratos com teto definido.', x + 8, top + 4, 7, { color: C.muted });
        return;
    }
    const cellWidth = (width - 16) / data.length;
    const radius = Math.min(30, cellWidth / 2 - 10);
    const bands: [number, number, string][] = [[0, 60, '22C55E'], [60, 80, 'FACC15'], [80, 95, 'F59E0B'], [95, 100, 'DC2626']];
    data.forEach((item, index) => {
        const cellX = x + 8 + index * cellWidth;
        const cx = cellX + cellWidth / 2;
        const cy = top + 14 + radius;
        text(ctx, fitLine(ctx, item.label, cellWidth - 6, 6.8, true), cellX, top, 6.8, {
            bold: true, color: ctx.dark, align: 'center', width: cellWidth,
        });
        for (const [from, to, color] of bands) {
            // Semicírculo da esquerda (−90°) para a direita (+90°), passando pelo topo.
            const start = -Math.PI / 2 + (from / 100) * Math.PI;
            const end = -Math.PI / 2 + (to / 100) * Math.PI;
            ctx.page.drawSvgPath(ringSlice(cx, cy, radius, radius - 7, start, end), {
                x: 0, y: ctx.pageHeight, color: hex(color),
            });
        }
        const bounded = Math.min(Math.max(item.value, 0), 100);
        const needle = polar(cx, cy, radius - 9, -Math.PI / 2 + (bounded / 100) * Math.PI);
        ctx.page.drawLine({
            start: { x: cx, y: ctx.pageHeight - cy },
            end: { x: needle.x, y: ctx.pageHeight - needle.y },
            thickness: 1.8,
            color: ctx.dark,
        });
        ctx.page.drawCircle({ x: cx, y: ctx.pageHeight - cy, size: 2.6, color: ctx.dark });
        text(ctx, `${formatReportValue(item.value, 'percent')} consumido`, cellX, cy + 6, 6.8, {
            bold: true, color: C.body, align: 'center', width: cellWidth,
        });
    });
}

function drawCharts(ctx: Ctx, charts: ReportChart[]) {
    const visible = charts.filter((chart) => chart.data.length > 0).slice(0, 2);
    if (visible.length === 0) return;
    const left = contentLeft();
    const total = contentRight(ctx) - left;
    const gap = 8;
    const width = (total - gap * (visible.length - 1)) / visible.length;
    visible.forEach((chart, index) => {
        const x = left + index * (width + gap);
        if (chart.type === 'donut') drawDonutChart(ctx, chart, x, width);
        else if (chart.type === 'gauge') drawGaugeChart(ctx, chart, x, width);
        else drawBarChart(ctx, chart, x, width);
    });
    ctx.y += CHART_HEIGHT + 10;
}

// ── Tabela ──────────────────────────────────────────────────────────────────

const PAD_Y = 3.2;
const lineHeight = (size: number) => size * 1.22;

interface PreparedCell {
    lines: string[];
    childLines: string[];
    bold?: boolean;
}

function prepareRow(
    ctx: Ctx,
    block: LayoutBlock,
    fontSize: number,
    values: (column: ReportColumn) => string,
    bold = false,
): { cells: PreparedCell[]; height: number } {
    const childSize = stackedFontSize(fontSize);
    const cells = block.cells.map((cell) => {
        const inner = cell.width - CELL_PAD_X * 2;
        const lines = wrapText(values(cell.column), inner, fontSize, ctx.fonts.measurer, bold);
        const childLines = cell.children.flatMap((child) => {
            const value = values(child);
            return value ? wrapText(value, inner, childSize, ctx.fonts.measurer) : [];
        });
        return { lines, childLines, bold };
    });
    const maxHeight = bodyBottom(ctx) - M - 60;
    const height = Math.min(
        maxHeight,
        Math.max(...cells.map((cell) =>
            cell.lines.length * lineHeight(fontSize) + cell.childLines.length * lineHeight(childSize),
        )) + PAD_Y * 2,
    );
    return { cells, height };
}

function drawRow(
    ctx: Ctx,
    block: LayoutBlock,
    prepared: { cells: PreparedCell[]; height: number },
    fontSize: number,
    color: RGB,
) {
    const childSize = stackedFontSize(fontSize);
    const bottom = ctx.y + prepared.height - PAD_Y;
    let x = contentLeft();
    block.cells.forEach((cell, index) => {
        const data = prepared.cells[index];
        const align = cell.column.align ?? 'left';
        let top = ctx.y + PAD_Y;
        for (const line of data.lines) {
            if (top + lineHeight(fontSize) > bottom + 0.5) break;
            text(ctx, line, x + CELL_PAD_X, top, fontSize, {
                bold: data.bold, color, align, width: cell.width - CELL_PAD_X * 2,
            });
            top += lineHeight(fontSize);
        }
        for (const line of data.childLines) {
            if (top + lineHeight(childSize) > bottom + 0.5) break;
            text(ctx, line, x + CELL_PAD_X, top, childSize, {
                color: C.muted, align, width: cell.width - CELL_PAD_X * 2,
            });
            top += lineHeight(childSize);
        }
        x += cell.width;
    });
}

function drawTableHeader(ctx: Ctx, block: LayoutBlock, fontSize: number) {
    const size = headerFontSize(fontSize);
    const prepared = block.cells.map((cell) =>
        wrapText(headerText(cell.column, cell.children), cell.width - CELL_PAD_X * 2, size, ctx.fonts.measurer, true),
    );
    const height = Math.max(...prepared.map((lines) => lines.length)) * lineHeight(size) + PAD_Y * 2 + 1;
    const width = block.cells.reduce((sum, cell) => sum + cell.width, 0);
    rect(ctx, contentLeft(), ctx.y, width, height, C.headerFill);
    let x = contentLeft();
    block.cells.forEach((cell, index) => {
        const lines = prepared[index];
        // Cabeçalho alinhado pela base, como em planilha.
        let top = ctx.y + height - PAD_Y - lines.length * lineHeight(size);
        for (const line of lines) {
            text(ctx, line, x + CELL_PAD_X, top, size, {
                bold: true, color: ctx.dark, align: cell.column.align ?? 'left', width: cell.width - CELL_PAD_X * 2,
            });
            top += lineHeight(size);
        }
        x += cell.width;
    });
    ctx.y += height;
    hline(ctx, contentLeft(), contentLeft() + width, ctx.y, 0.8, ctx.dark);
}

/** Faixa de totais/subtotais; o rótulo ocupa as células vazias consecutivas. */
function drawTotalsRow(
    ctx: Ctx,
    block: LayoutBlock,
    fontSize: number,
    totals: Record<string, number>,
    label: string,
    style: 'total' | 'subtotal',
    newPage: () => void,
) {
    const tableWidth = block.cells.reduce((sum, cell) => sum + cell.width, 0);
    const hasTotal = (cell: LayoutBlock['cells'][number]) =>
        [cell.column, ...cell.children].some((column) => column.key in totals);
    if (!block.cells.some(hasTotal)) return;
    const labelIndex = block.cells.findIndex((cell) => !hasTotal(cell));
    let spanEnd = labelIndex;
    while (spanEnd + 1 < block.cells.length && !hasTotal(block.cells[spanEnd + 1])) spanEnd += 1;
    const labelX = contentLeft() + block.cells.slice(0, Math.max(labelIndex, 0))
        .reduce((sum, cell) => sum + cell.width, 0);
    const spanWidth = labelIndex < 0 ? 0 : block.cells.slice(labelIndex, spanEnd + 1)
        .reduce((sum, cell) => sum + cell.width, 0);
    const labelLines = labelIndex < 0 ? [] : wrapText(label, spanWidth - CELL_PAD_X * 2, fontSize, ctx.fonts.measurer, true);
    const prepared = prepareRow(ctx, block, fontSize, (column) =>
        column.key in totals ? formatPrintValue(totals[column.key], column.format) : '', true);
    prepared.height = Math.max(prepared.height, labelLines.length * lineHeight(fontSize) + PAD_Y * 2);
    if (ctx.y + prepared.height > bodyBottom(ctx)) newPage();
    if (style === 'total') hline(ctx, contentLeft(), contentLeft() + tableWidth, ctx.y, 0.8, ctx.dark);
    rect(ctx, contentLeft(), ctx.y, tableWidth, prepared.height, style === 'total' ? C.totalFill : C.zebra);
    const color = style === 'total' ? ctx.dark : C.body;
    drawRow(ctx, block, prepared, fontSize, color);
    labelLines.forEach((line, index) => {
        text(ctx, line, labelX + CELL_PAD_X, ctx.y + PAD_Y + index * lineHeight(fontSize), fontSize, { bold: true, color });
    });
    ctx.y += prepared.height;
    if (style === 'subtotal') hline(ctx, contentLeft(), contentLeft() + tableWidth, ctx.y, 0.5, C.faint);
}

interface RowGroup {
    label: string | null;
    rows: ReportDataset['rows'];
}

/** Agrupa linhas consecutivas pelo valor da coluna (o visualizador já ordena por ela). */
export function groupRows(rows: ReportDataset['rows'], column?: ReportColumn): RowGroup[] {
    if (!column) return [{ label: null, rows }];
    const groups: RowGroup[] = [];
    for (const row of rows) {
        const label = formatReportValue(row[column.key], column.format);
        const last = groups.at(-1);
        if (last && last.label === label) last.rows.push(row);
        else groups.push({ label, rows: [row] });
    }
    return groups;
}

function drawTable(ctx: Ctx, options: BuildReportPdfOptions, layout: TableLayout) {
    const { dataset } = options;
    const fontSize = layout.fontSize;
    const allColumns = dataset.columns;
    const totals = computeTotals(allColumns, dataset.rows);
    const groupColumn = options.groupBy ? allColumns.find((column) => column.key === options.groupBy)
        ?? options.groupColumn : undefined;
    const groups = groupRows(dataset.rows, groupColumn);

    layout.blocks.forEach((block, blockIndex) => {
        if (blockIndex > 0) {
            addPage(ctx, layout.orientation);
            drawContinuationHeader(ctx);
        }
        const tableWidth = block.cells.reduce((sum, cell) => sum + cell.width, 0);
        if (layout.blocks.length > 1) {
            const labels = block.cells.map((cell) => headerText(cell.column, cell.children)).join(', ');
            const caption = `Bloco ${blockIndex + 1} de ${layout.blocks.length} — ${labels}`;
            for (const line of wrapText(caption, tableWidth, 7, ctx.fonts.measurer, true)) {
                text(ctx, line, contentLeft(), ctx.y, 7, { bold: true, color: C.muted });
                ctx.y += 9;
            }
            ctx.y += 3;
        }
        drawTableHeader(ctx, block, fontSize);

        const newPage = () => {
            addPage(ctx, layout.orientation);
            drawContinuationHeader(ctx);
            drawTableHeader(ctx, block, fontSize);
        };

        if (dataset.rows.length === 0) {
            text(ctx, 'Sem registros para os filtros selecionados.', contentLeft() + CELL_PAD_X, ctx.y + 6, fontSize, { color: C.muted });
            ctx.y += lineHeight(fontSize) + 12;
            return;
        }

        // Altura aproximada da linha de total, para a última linha não deixá-la sozinha na página.
        const totalsReserve = totals ? lineHeight(fontSize) * 2 + PAD_Y * 2 : 0;
        const drawDataRow = (row: ReportDataset['rows'][number], zebra: boolean, keepWithTotals = false) => {
            const prepared = prepareRow(ctx, block, fontSize, (column) =>
                formatPrintValue(row[column.key], column.format),
            );
            const reserve = keepWithTotals ? totalsReserve : 0;
            if (ctx.y + prepared.height + reserve > bodyBottom(ctx)) newPage();
            if (zebra) rect(ctx, contentLeft(), ctx.y, tableWidth, prepared.height, C.zebra);
            drawRow(ctx, block, prepared, fontSize, C.body);
            ctx.y += prepared.height;
            hline(ctx, contentLeft(), contentLeft() + tableWidth, ctx.y, 0.4, C.rule);
        };

        for (const group of groups) {
            if (group.label !== null && groupColumn) {
                const caption = `${groupColumn.label}: ${group.label}  ·  ${group.rows.length} ${group.rows.length === 1 ? 'registro' : 'registros'}`;
                const lines = wrapText(caption, tableWidth - CELL_PAD_X * 2, fontSize, ctx.fonts.measurer, true);
                const height = lines.length * lineHeight(fontSize) + PAD_Y * 2 + 2;
                // Cabeçalho do grupo nunca fica sozinho no pé da página.
                const firstRow = prepareRow(ctx, block, fontSize, (column) =>
                    formatPrintValue(group.rows[0][column.key], column.format));
                if (ctx.y + height + firstRow.height > bodyBottom(ctx)) newPage();
                rect(ctx, contentLeft(), ctx.y, tableWidth, height, C.groupFill);
                rect(ctx, contentLeft(), ctx.y, 2.5, height, ctx.primary);
                lines.forEach((line, index) => {
                    text(ctx, line, contentLeft() + CELL_PAD_X + 3, ctx.y + PAD_Y + 1 + index * lineHeight(fontSize), fontSize, {
                        bold: true, color: ctx.dark,
                    });
                });
                ctx.y += height;
            }
            const isLastGroup = group === groups[groups.length - 1];
            group.rows.forEach((row, index) => drawDataRow(
                row,
                index % 2 === 1,
                isLastGroup && index === group.rows.length - 1 && !(group.label !== null && groups.length > 1),
            ));
            if (group.label !== null && groups.length > 1) {
                const subtotals = computeTotals(allColumns, group.rows);
                if (subtotals) {
                    drawTotalsRow(ctx, block, fontSize, subtotals, `Subtotal — ${group.label}`, 'subtotal', newPage);
                }
            }
        }

        if (totals) drawTotalsRow(ctx, block, fontSize, totals, totalsLabel(dataset.rows.length), 'total', newPage);
        ctx.y += 10;
    });
}

function drawNotes(ctx: Ctx, notes: string[], orientation: 'portrait' | 'landscape') {
    if (notes.length === 0) return;
    const left = contentLeft();
    const width = contentRight(ctx) - left;
    const lines = notes.flatMap((note) => wrapText(`• ${note}`, width - 16, 7, ctx.fonts.measurer));
    const height = 16 + lines.length * 9 + 6;
    if (ctx.y + Math.min(height, 60) > bodyBottom(ctx)) {
        addPage(ctx, orientation);
        drawContinuationHeader(ctx);
    }
    text(ctx, 'Critérios do relatório', left + 8, ctx.y + 6, 7.5, { bold: true, color: ctx.dark });
    ctx.y += 18;
    for (const line of lines) {
        if (ctx.y + 9 > bodyBottom(ctx)) {
            addPage(ctx, orientation);
            drawContinuationHeader(ctx);
        }
        text(ctx, line, left + 8, ctx.y, 7, { color: C.muted });
        ctx.y += 9;
    }
}

function drawSignatures(
    ctx: Ctx,
    signatures: ReportSignature[],
    place: string,
    orientation: 'portrait' | 'landscape',
) {
    const filled = signatures.filter((item) => item.name.trim() || item.role.trim());
    if (filled.length === 0) return;
    const left = contentLeft();
    const width = contentRight(ctx) - left;
    const perRow = Math.min(filled.length, orientation === 'landscape' ? 4 : 3);
    const rows = Math.ceil(filled.length / perRow);
    const rowHeight = 64;
    const needed = 26 + rows * rowHeight;
    if (ctx.y + needed > bodyBottom(ctx)) {
        addPage(ctx, orientation);
        drawContinuationHeader(ctx);
    }
    ctx.y += 8;
    text(ctx, place, left, ctx.y, 8, { color: C.body, align: 'right', width });
    ctx.y += 18;
    const colWidth = width / perRow;
    filled.forEach((signature, index) => {
        const column = index % perRow;
        const row = Math.floor(index / perRow);
        const x = left + column * colWidth;
        const top = ctx.y + row * rowHeight + 30;
        hline(ctx, x + 16, x + colWidth - 16, top, 0.6, C.body);
        const name = fitLine(ctx, signature.name.trim() || ' ', colWidth - 20, 8, true);
        text(ctx, name, x, top + 4, 8, { bold: true, color: ctx.dark, align: 'center', width: colWidth });
        const role = fitLine(ctx, signature.role.trim(), colWidth - 20, 7);
        text(ctx, role, x, top + 14, 7, { color: C.muted, align: 'center', width: colWidth });
    });
    ctx.y += rows * rowHeight;
}

/**
 * Código de integridade: SHA-256 do conteúdo (título, filtros, colunas, linhas,
 * emissão e emissor), em 4 grupos de 4. Qualquer alteração no conteúdo muda o código.
 */
export async function reportIntegrityCode(options: BuildReportPdfOptions, issuedAt: Date): Promise<string> {
    const keys = options.dataset.columns.map((column) => column.key);
    const canonical = JSON.stringify({
        title: options.reportTitle,
        filters: options.filters,
        columns: keys,
        rows: options.dataset.rows.map((row) => keys.map((key) => row[key] ?? null)),
        issuedAt: issuedAt.toISOString(),
        issuer: options.issuer ?? '',
        institution: options.branding?.name ?? '',
    });
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    const hexText = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
    return hexText.slice(0, 16).match(/.{4}/g)!.join('-');
}

function drawFooters(ctx: Ctx, footerText: string, issued: string, integrity: string, issuer?: string) {
    const total = ctx.pages.length;
    ctx.pages.forEach((page, index) => {
        ctx.page = page;
        ctx.pageWidth = page.getWidth();
        ctx.pageHeight = page.getHeight();
        const left = contentLeft();
        const right = contentRight(ctx);
        const top = ctx.pageHeight - M - FOOTER_RESERVED + 8;
        hline(ctx, left, right, top, 0.5, C.rule);
        const pageLabel = `Emissão: ${issued} · Página ${index + 1} de ${total}`;
        const integrityLabel = `Integridade: ${integrity}${issuer ? ` · Emitido por ${issuer}` : ''}`;
        const labelWidth = Math.max(
            ctx.fonts.regular.widthOfTextAtSize(ctx.fonts.clean(pageLabel), 6.5),
            ctx.fonts.regular.widthOfTextAtSize(ctx.fonts.clean(integrityLabel), 6.5),
        );
        text(ctx, pageLabel, right - labelWidth, top + 5, 6.5, { color: C.muted, align: 'right', width: labelWidth });
        text(ctx, integrityLabel, right - labelWidth, top + 13, 6.5, { color: C.muted, align: 'right', width: labelWidth });
        wrapText(footerText, right - left - labelWidth - 20, 6.5, ctx.fonts.measurer)
            .slice(0, 2)
            .forEach((line, lineIndex) => {
                text(ctx, line, left, top + 5 + lineIndex * 8, 6.5, { color: C.muted });
            });
    });
}

// ── Entrada ─────────────────────────────────────────────────────────────────

export async function buildReportPdf(options: BuildReportPdfOptions): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const fonts = await loadFonts(doc);
    const branding = options.branding;
    const primaryHex = safeHex(branding?.primaryColor, DEFAULT_PRIMARY);
    const institution = (branding?.name || 'PREFEITURA MUNICIPAL').toUpperCase();
    const softwareName = branding?.appName || 'Exattus Rotta';
    const footerText = branding?.reportFooter
        || `${softwareName} — Sistema de gestão pública de frotas, rastreamento, abastecimentos e manutenções por protocolo digital.`;
    const issuedAt = options.issuedAt ?? new Date();
    const issued = generatedAt(issuedAt);

    let logo: PDFImage | null = null;
    if (options.logo) {
        try {
            logo = options.logo.type === 'png'
                ? await doc.embedPng(options.logo.bytes)
                : await doc.embedJpg(options.logo.bytes);
        } catch {
            logo = null; // imagem corrompida: usa o escudo vetorial
        }
    }

    // Com agrupamento, a coluna do grupo já aparece no cabeçalho de cada grupo.
    const groupColumn = options.groupBy
        ? options.dataset.columns.find((column) => column.key === options.groupBy) ?? options.groupColumn
        : undefined;
    const tableColumns = groupColumn && options.dataset.columns.length > 1
        ? options.dataset.columns.filter((column) => column.key !== groupColumn.key)
        : options.dataset.columns;
    const layout = computeTableLayout({
        columns: tableColumns,
        rows: options.dataset.rows,
        orientation: options.layout?.orientation ?? 'auto',
        fontSize: options.layout?.fontSize ?? DEFAULT_PRINT_FONT_PT,
    }, fonts.measurer);

    const ctx = {
        doc,
        fonts,
        logo,
        primary: hex(primaryHex),
        dark: hex(safeHex(branding?.darkColor, DEFAULT_DARK)),
        accent: hex(safeHex(branding?.accentColor, DEFAULT_ACCENT)),
        pages: [],
        institution,
        title: options.reportTitle,
        y: M,
    } as unknown as Ctx;

    addPage(ctx, layout.orientation);
    drawFirstHeader(ctx, options, issued);
    drawKpis(ctx, options);
    drawCharts(ctx, options.dataset.charts ?? []);
    drawTable(ctx, { ...options, groupColumn }, layout);
    drawNotes(ctx, options.dataset.notes ?? [], layout.orientation);
    if (options.signatures?.length) {
        const city = [branding?.city, branding?.state?.toUpperCase()].filter(Boolean).join('/');
        const longDate = issuedAt.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
        drawSignatures(ctx, options.signatures, `${city ? `${city}, ` : ''}${longDate}.`, layout.orientation);
    }
    const integrity = await reportIntegrityCode(options, issuedAt);
    drawFooters(ctx, footerText, issued, integrity, options.issuer);

    doc.setTitle(options.reportTitle);
    doc.setSubject(options.reportDescription);
    doc.setAuthor(institution);
    doc.setCreator(softwareName);
    doc.setProducer(softwareName);
    doc.setLanguage('pt-BR');
    doc.setCreationDate(issuedAt);
    doc.setModificationDate(issuedAt);
    return doc.save({ useObjectStreams: true });
}
