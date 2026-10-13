// Etiquetas QR dos veículos em PDF 100% vetorial (pdf-lib).
//
// O QR é desenhado módulo a módulo — nada de PNG — com o mesmo visual do QR
// estilizado da tela (vehicleQr.ts): pontos arredondados com degradê do
// verde-escuro ao verde, olhos com cantos arredondados. A matriz vem do
// `qrcode-generator` com correção de erro H, a mesma usada pelo qr-code-styling.

import qrcode from 'qrcode-generator';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';

const MM = 72 / 25.4;
const DARK = [0x0f, 0x2b, 0x2f] as const;
const GREEN = [0x00, 0xa8, 0x6b] as const;
/** Faixas de cor do degradê: cada uma vira um único caminho no PDF. */
const GRADIENT_STEPS = 10;

export interface QrLabelItem {
    /** Conteúdo do QR: a placa como cadastrada (o app do motorista lê por ela). */
    data: string;
    /** Placa como aparece impressa na etiqueta. */
    plate: string;
    /** Linhas abaixo da placa (modelo, secretaria, prefixo...), já na ordem. */
    lines?: string[];
    /** Linha única abaixo da placa (formato antigo; usado quando `lines` não vem). */
    caption?: string;
}

/** Papel da impressão. `label` = uma etiqueta por página, do tamanho da etiqueta (impressora de etiquetas). */
export type QrLabelSheet = 'A4' | 'letter' | 'A5' | 'label';

export interface QrLabelSheetOptions {
    items: QrLabelItem[];
    /** Largura da etiqueta e lado do QR, em mm. */
    labelWidthMm: number;
    qrSizeMm: number;
    plateSizePt: number;
    captionSizePt: number;
    sheet: QrLabelSheet;
    /** `styled` = degradê da marca; `plain` = preto chapado (impressora P&B, leitura em pouca luz). */
    qrStyle?: 'styled' | 'plain';
    /** Contorno de corte em volta de cada etiqueta (padrão: sim). */
    border?: boolean;
    /** Texto pequeno acima do QR (ex.: nome da prefeitura). */
    header?: string;
    /** Mostra a placa sob o QR (padrão: sim). */
    showPlate?: boolean;
    /** Posições a pular no início da 1ª folha (reaproveitar folha de etiquetas já usada). */
    skip?: number;
    title?: string;
}

const SHEETS: Record<Exclude<QrLabelSheet, 'label'>, { width: number; height: number }> = {
    A4: { width: 210 * MM, height: 297 * MM },
    letter: { width: 215.9 * MM, height: 279.4 * MM },
    A5: { width: 148 * MM, height: 210 * MM },
};

/** Medidas de uma etiqueta (pt), compartilhadas pelo PDF e pela contagem na tela. */
export function qrLabelMetrics(options: Omit<QrLabelSheetOptions, 'items'> & { lineCount: number }) {
    const labelWidth = options.labelWidthMm * MM;
    const qrSize = options.qrSizeMm * MM;
    const padding = 3 * MM;
    const headerHeight = options.header ? options.captionSizePt * 1.3 + 1.5 * MM : 0;
    const plateHeight = options.showPlate === false ? 0 : 2 * MM + options.plateSizePt * 1.1;
    const linesHeight = options.lineCount > 0 ? 1.5 * MM + options.lineCount * options.captionSizePt * 1.25 : 0;
    const labelHeight = padding + headerHeight + qrSize + plateHeight + linesHeight + padding;
    if (options.sheet === 'label') {
        return { labelWidth, labelHeight, qrSize, padding, headerHeight, columns: 1, rows: 1, perPage: 1, pageWidth: labelWidth, pageHeight: labelHeight, margin: 0, gap: 0 };
    }
    const sheet = SHEETS[options.sheet];
    const margin = 8 * MM;
    const gap = 4 * MM;
    const columns = Math.max(1, Math.floor((sheet.width - margin * 2 + gap) / (labelWidth + gap)));
    const rows = Math.max(1, Math.floor((sheet.height - margin * 2 + gap) / (labelHeight + gap)));
    return { labelWidth, labelHeight, qrSize, padding, headerHeight, columns, rows, perPage: columns * rows, pageWidth: sheet.width, pageHeight: sheet.height, margin, gap };
}

function mix(t: number): RGB {
    const channel = (index: 0 | 1 | 2) => (DARK[index] + (GREEN[index] - DARK[index]) * t) / 255;
    return rgb(channel(0), channel(1), channel(2));
}

/** Retângulo de cantos arredondados como caminho SVG (coordenadas com y para baixo). */
function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
    const radius = Math.min(r, w / 2, h / 2);
    const f = (n: number) => n.toFixed(3);
    return `M${f(x + radius)} ${f(y)}H${f(x + w - radius)}A${f(radius)} ${f(radius)} 0 0 1 ${f(x + w)} ${f(y + radius)}`
        + `V${f(y + h - radius)}A${f(radius)} ${f(radius)} 0 0 1 ${f(x + w - radius)} ${f(y + h)}`
        + `H${f(x + radius)}A${f(radius)} ${f(radius)} 0 0 1 ${f(x)} ${f(y + h - radius)}`
        + `V${f(y + radius)}A${f(radius)} ${f(radius)} 0 0 1 ${f(x + radius)} ${f(y)}Z`;
}

function circle(cx: number, cy: number, r: number): string {
    const f = (n: number) => n.toFixed(3);
    return `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}Z`;
}

export function qrMatrix(data: string, errorCorrection: 'L' | 'M' | 'Q' | 'H' = 'H'): boolean[][] {
    const qr = qrcode(0, errorCorrection);
    qr.addData(data, 'Byte');
    qr.make();
    const count = qr.getModuleCount();
    return Array.from({ length: count }, (_, row) => Array.from({ length: count }, (_, col) => qr.isDark(row, col)));
}

/**
 * Desenha o QR em vetor. `x`/`top` = canto superior esquerdo na folha (pt,
 * top medido a partir do topo da página).
 */
export function drawVectorQr(page: PDFPage, data: string, x: number, top: number, size: number): void {
    const matrix = qrMatrix(data);
    const count = matrix.length;
    const quiet = 1;
    const cell = size / (count + quiet * 2);
    const origin = quiet * cell;
    const inFinder = (row: number, col: number) =>
        (row < 7 && col < 7) || (row < 7 && col >= count - 7) || (row >= count - 7 && col < 7);

    // Módulos comuns: corridas horizontais arredondadas, agrupadas por faixa de cor.
    const buckets: string[][] = Array.from({ length: GRADIENT_STEPS }, () => []);
    for (let row = 0; row < count; row += 1) {
        let col = 0;
        while (col < count) {
            if (!matrix[row][col] || inFinder(row, col)) {
                col += 1;
                continue;
            }
            let end = col;
            while (end + 1 < count && matrix[row][end + 1] && !inFinder(row, end + 1)) end += 1;
            const runX = origin + col * cell;
            const runY = origin + row * cell;
            // Leve sobreposição vertical evita frestas brancas entre linhas na impressão.
            const path = roundedRect(runX, runY - 0.02 * cell, (end - col + 1) * cell, cell * 1.04, cell * 0.45);
            const t = ((col + end) / 2 + row) / (2 * (count - 1));
            buckets[Math.min(GRADIENT_STEPS - 1, Math.floor(t * GRADIENT_STEPS))].push(path);
            col = end + 1;
        }
    }
    const y = page.getHeight() - top;
    buckets.forEach((paths, index) => {
        if (paths.length) page.drawSvgPath(paths.join(''), { x, y, color: mix((index + 0.5) / GRADIENT_STEPS) });
    });

    // Olhos: anel 7×7 de cantos arredondados (escuro) + ponto central (verde).
    for (const [row, col] of [[0, 0], [0, count - 7], [count - 7, 0]] as const) {
        const ex = origin + col * cell;
        const ey = origin + row * cell;
        const outer = roundedRect(ex, ey, 7 * cell, 7 * cell, 2.2 * cell);
        // Furo do anel desenhado no sentido inverso (regra even-odd não é garantida).
        const innerX = ex + cell;
        const innerY = ey + cell;
        const s = 5 * cell;
        const r = 1.5 * cell;
        const f = (n: number) => n.toFixed(3);
        const hole = `M${f(innerX + r)} ${f(innerY)}A${f(r)} ${f(r)} 0 0 0 ${f(innerX)} ${f(innerY + r)}`
            + `V${f(innerY + s - r)}A${f(r)} ${f(r)} 0 0 0 ${f(innerX + r)} ${f(innerY + s)}`
            + `H${f(innerX + s - r)}A${f(r)} ${f(r)} 0 0 0 ${f(innerX + s)} ${f(innerY + s - r)}`
            + `V${f(innerY + r)}A${f(r)} ${f(r)} 0 0 0 ${f(innerX + s - r)} ${f(innerY)}Z`;
        page.drawSvgPath(outer + hole, { x, y, color: mix(0) });
        page.drawSvgPath(circle(ex + 3.5 * cell, ey + 3.5 * cell, 1.6 * cell), { x, y, color: mix(1) });
    }
}

/**
 * QR "clássico" para leitura garantida (ex.: link de verificação longo): fundo
 * branco, margem de 4 módulos, módulos quadrados numa cor só, correção M.
 */
export function drawPlainVectorQr(
    page: PDFPage,
    data: string,
    x: number,
    top: number,
    size: number,
    errorCorrection: 'L' | 'M' | 'Q' | 'H' = 'M',
): void {
    const matrix = qrMatrix(data, errorCorrection);
    const count = matrix.length;
    const quiet = 4;
    const cell = size / (count + quiet * 2);
    const y = page.getHeight() - top;
    page.drawRectangle({ x, y: y - size, width: size, height: size, color: rgb(1, 1, 1) });
    const f = (n: number) => n.toFixed(3);
    const runs: string[] = [];
    for (let row = 0; row < count; row += 1) {
        let col = 0;
        while (col < count) {
            if (!matrix[row][col]) {
                col += 1;
                continue;
            }
            let end = col;
            while (end + 1 < count && matrix[row][end + 1]) end += 1;
            const rx = (quiet + col) * cell;
            const ry = (quiet + row) * cell;
            // Leve sobreposição evita frestas entre linhas na rasterização.
            runs.push(`M${f(rx)} ${f(ry)}H${f(rx + (end - col + 1) * cell)}V${f(ry + cell * 1.03)}H${f(rx)}Z`);
            col = end + 1;
        }
    }
    page.drawSvgPath(runs.join(''), { x, y, color: mix(0) });
}

function fit(font: PDFFont, text: string, size: number, maxWidth: number): string {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
    let out = text;
    while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) out = out.slice(0, -1);
    return `${out.trimEnd()}…`;
}

/** Remove o que a fonte padrão (WinAnsi) não codifica. */
function winAnsiSafe(font: PDFFont, text: string): string {
    const supported = new Set(font.getCharacterSet());
    return [...text].map((char) => {
        if (supported.has(char.codePointAt(0) ?? 0)) return char;
        const base = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return base && [...base].every((part) => supported.has(part.codePointAt(0) ?? 0)) ? base : '';
    }).join('');
}

function itemLines(item: QrLabelItem): string[] {
    if (item.lines) return item.lines.filter(Boolean);
    return item.caption ? [item.caption] : [];
}

export async function buildQrLabelsPdf(options: QrLabelSheetOptions): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const lineCount = Math.max(0, ...options.items.map((item) => itemLines(item).length));
    const m = qrLabelMetrics({ ...options, lineCount });
    const skip = Math.max(0, Math.min(options.skip ?? 0, m.perPage - 1));
    // Centraliza a grade na folha.
    const offsetX = (m.pageWidth - (m.columns * m.labelWidth + (m.columns - 1) * m.gap)) / 2;
    const border = rgb(0xcb / 255, 0xd5 / 255, 0xe1 / 255);
    const muted = rgb(0x64 / 255, 0x74 / 255, 0x8b / 255);
    const showPlate = options.showPlate !== false;
    const header = options.header ? winAnsiSafe(bold, options.header) : '';
    const centered = (page: PDFPage, font: PDFFont, text: string, size: number, x: number, top: number, color: RGB) => {
        const value = fit(font, text, size, m.labelWidth - 4 * MM);
        if (!value) return;
        page.drawText(value, {
            x: x + (m.labelWidth - font.widthOfTextAtSize(value, size)) / 2,
            y: page.getHeight() - top - size * 0.8,
            size,
            font,
            color,
        });
    };

    let page: PDFPage | null = null;
    options.items.forEach((item, itemIndex) => {
        const index = itemIndex + skip;
        if (index % m.perPage === 0 || page === null) page = doc.addPage([m.pageWidth, m.pageHeight]);
        const current: PDFPage = page;
        const slot = index % m.perPage;
        const x = offsetX + (slot % m.columns) * (m.labelWidth + m.gap);
        const top = m.margin + Math.floor(slot / m.columns) * (m.labelHeight + m.gap);
        if (options.border !== false) {
            const inset = options.sheet === 'label' ? 0.5 : 0;
            current.drawSvgPath(roundedRect(inset, inset, m.labelWidth - inset * 2, m.labelHeight - inset * 2, 3 * MM), {
                x, y: current.getHeight() - top, borderColor: border, borderWidth: 0.6,
            });
        }
        let cursor = top + m.padding;
        if (header) {
            centered(current, bold, header.toUpperCase(), options.captionSizePt, x, cursor, muted);
            cursor += m.headerHeight;
        }
        const qrX = x + (m.labelWidth - m.qrSize) / 2;
        if (options.qrStyle === 'plain') drawPlainVectorQr(current, item.data.toUpperCase(), qrX, cursor, m.qrSize, 'H');
        else drawVectorQr(current, item.data.toUpperCase(), qrX, cursor, m.qrSize);
        cursor += m.qrSize;
        if (showPlate) {
            cursor += 2 * MM;
            centered(current, bold, winAnsiSafe(bold, item.plate), options.plateSizePt, x, cursor, options.qrStyle === 'plain' ? rgb(0, 0, 0) : mix(0));
            cursor += options.plateSizePt * 1.1;
        }
        const lines = itemLines(item);
        if (lines.length > 0) cursor += 1.5 * MM;
        lines.forEach((line) => {
            centered(current, regular, winAnsiSafe(regular, line), options.captionSizePt, x, cursor, muted);
            cursor += options.captionSizePt * 1.25;
        });
    });
    if (options.items.length === 0) doc.addPage([m.pageWidth, m.pageHeight]);
    doc.setTitle(options.title ?? 'Etiquetas QR — Frota');
    doc.setLanguage('pt-BR');
    return doc.save({ useObjectStreams: true });
}
