// Etiquetas QR dos veículos em PDF 100% vetorial (pdf-lib).
//
// O QR é desenhado módulo a módulo — nada de PNG — com o mesmo visual do QR
// estilizado da tela (vehicleQr.ts): pontos arredondados com degradê do
// verde-escuro ao verde, olhos com cantos arredondados. A matriz vem do
// `qrcode-generator` com correção de erro H, a mesma usada pelo qr-code-styling.

import qrcode from 'qrcode-generator';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { APPLE_ICON, APP_LOGO_ICON, GOOGLE_PLAY_ICON, type LabelIcon } from './labelIcons';

const MM = 72 / 25.4;
const DARK = [0x0f, 0x2b, 0x2f] as const;
const GREEN = [0x00, 0xa8, 0x6b] as const;

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
    /** Largura da etiqueta (mm). */
    labelWidthMm: number;
    /** Altura da etiqueta (mm). Sem ela, a altura sai do conteúdo e de `qrSizeMm`. */
    labelHeightMm?: number;
    /** Lado do QR (mm). Com `labelHeightMm`, é calculado para ocupar o espaço livre. */
    qrSizeMm?: number;
    plateSizePt?: number;
    captionSizePt?: number;
    sheet: QrLabelSheet;
    /** `styled` = design da marca; `plain` = escuro sólido (impressora P&B). */
    qrStyle?: 'styled' | 'plain';
    /** Margem branca do QR colorido, em fração do lado (padrão 0,06, como no app). */
    qrMarginRatio?: number;
    /** Contorno de corte em volta de cada etiqueta (padrão: sim). */
    border?: boolean;
    /** Nome da prefeitura no topo da etiqueta. */
    header?: string;
    /** Linha com o logo e o nome do app e os ícones das lojas. */
    appPromo?: boolean;
    /** Texto do convite acima do logo (padrão: acompanha `appPromo`). */
    showPromoText?: boolean;
    /** Nome do app no convite (padrão: Exattus Rotta). */
    appName?: string;
    /** Mostra a placa sob o QR (padrão: sim). */
    showPlate?: boolean;
    /** Texto do convite (padrão: "Baixe o app do motorista:"). */
    promoText?: string;
    /** Tamanhos (pt) por elemento; o que faltar é calculado pela largura da etiqueta. */
    fonts?: Partial<QrLabelFonts>;
    /** Multiplicador do espaço entre elementos e das margens de cima e de baixo (1 = normal). */
    spacing?: number;
    /** Margens laterais (mm). Sem valor, sai da largura da etiqueta. */
    sidePaddingMm?: number;
    /** Entrelinha dos textos (1 = justo; padrão 1,25). */
    lineHeight?: number;
    /** `spread` = cabeçalho no topo e rodapé embaixo; `grouped` = tudo junto no centro. */
    align?: 'spread' | 'grouped';
    /** Margem branca em volta do QR, em módulos (padrão 4; 2 = compacta). */
    qrQuietModules?: number;
    /** Espaço entre colunas de etiquetas na folha (mm; padrão 4). */
    gapXMm?: number;
    /** Espaço entre linhas de etiquetas na folha (mm; padrão 4). */
    gapYMm?: number;
    /** Margem da folha em cima/embaixo e nas laterais (mm; padrão 8). */
    sheetMarginTopMm?: number;
    sheetMarginSideMm?: number;
    /** `center` = grade centralizada na folha; `margin` = começa exatamente na margem (folhas pré-cortadas). */
    gridAlign?: 'center' | 'margin';
    /** Posições a pular no início da 1ª folha (reaproveitar folha de etiquetas já usada). */
    skip?: number;
    title?: string;
}

const SHEETS: Record<Exclude<QrLabelSheet, 'label'>, { width: number; height: number }> = {
    A4: { width: 210 * MM, height: 297 * MM },
    letter: { width: 215.9 * MM, height: 279.4 * MM },
    A5: { width: 148 * MM, height: 210 * MM },
};

const PT_MM = 25.4 / 72;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Menor lado de QR que ainda lê bem com a câmera do celular. */
export const MIN_QR_MM = 15;

export interface QrLabelFonts {
    /** Nome da prefeitura. */
    name: number;
    /** Texto do convite. */
    promo: number;
    /** Nome do app (o logo e os ícones das lojas acompanham). */
    app: number;
    plate: number;
    /** Linhas abaixo da placa (modelo, secretaria, prefixo). */
    caption: number;
}

/** Tamanhos automáticos (pt) para uma etiqueta desta largura (mm). */
export function defaultLabelFonts(labelWidthMm: number): QrLabelFonts {
    const caption = clamp(labelWidthMm * 0.11, 6, 12);
    return {
        name: Math.round(caption * 1.05 * 2) / 2,
        promo: Math.round(caption * 0.85 * 2) / 2,
        app: Math.round(caption * 0.95 * 2) / 2,
        plate: Math.round(clamp(labelWidthMm * 0.2, 9, 28) * 2) / 2,
        caption: Math.round(caption * 2) / 2,
    };
}

/**
 * Posições de cada elemento dentro de uma etiqueta, em mm (fontes em pt). O
 * PDF e a prévia da tela usam as mesmas contas, para saírem iguais.
 */
export function qrLabelLayout(options: {
    labelWidthMm: number;
    labelHeightMm?: number;
    qrSizeMm?: number;
    plateSizePt?: number;
    captionSizePt?: number;
    fonts?: Partial<QrLabelFonts>;
    header?: string;
    appPromo?: boolean;
    showPromoText?: boolean;
    showPlate?: boolean;
    spacing?: number;
    sidePaddingMm?: number;
    lineHeight?: number;
    align?: 'spread' | 'grouped';
    lineCount: number;
}) {
    const width = options.labelWidthMm;
    const auto = defaultLabelFonts(width);
    const fonts: QrLabelFonts = {
        ...auto,
        ...(options.plateSizePt ? { plate: options.plateSizePt } : {}),
        ...(options.captionSizePt ? { caption: options.captionSizePt } : {}),
        ...Object.fromEntries(Object.entries(options.fonts ?? {}).filter(([, v]) => typeof v === 'number' && v > 0)),
    };
    const spacing = clamp(options.spacing ?? 1, 0, 3);
    const lh = clamp(options.lineHeight ?? 1.25, 0.9, 2);
    const autoPadding = clamp(width * 0.06, 2, 5);
    // Laterais: valor escolhido ou automático; cima/baixo acompanham o espaçamento.
    const sidePadding = options.sidePaddingMm !== undefined ? clamp(options.sidePaddingMm, 0, width / 3) : autoPadding;
    const padding = autoPadding * Math.max(0.3, Math.min(spacing, 1.5));
    const gap = clamp(width * 0.025, 1, 2.5) * spacing;
    const inner = gap * 0.45;
    const textMm = (pt: number) => pt * lh * PT_MM;
    const iconMm = fonts.app * 1.75 * PT_MM;

    // Blocos em ordem; cada elemento guarda a altura e o espaço antes dele.
    const headerParts: { key: 'name' | 'promo' | 'app'; h: number }[] = [];
    if (options.header) headerParts.push({ key: 'name', h: textMm(fonts.name) });
    if (options.showPromoText ?? options.appPromo) headerParts.push({ key: 'promo', h: textMm(fonts.promo) });
    if (options.appPromo) headerParts.push({ key: 'app', h: iconMm });
    const showPlate = options.showPlate !== false;
    const footerParts: { key: 'plate' | 'line'; h: number }[] = [];
    if (showPlate) footerParts.push({ key: 'plate', h: fonts.plate * Math.max(1, lh * 0.9) * PT_MM });
    for (let i = 0; i < options.lineCount; i += 1) footerParts.push({ key: 'line', h: textMm(fonts.caption) });
    const blockHeight = (parts: { h: number }[]) => parts.reduce((sum, part, i) => sum + part.h + (i > 0 ? inner : 0), 0);
    const headerMm = blockHeight(headerParts);
    const footerMm = blockHeight(footerParts);
    const gapsAroundQr = (headerMm > 0 ? gap : 0) + (footerMm > 0 ? gap : 0);

    const freeWidth = width - sidePadding * 2;
    let height = options.labelHeightMm;
    let qr: number;
    if (height) {
        qr = Math.min(freeWidth, height - padding * 2 - headerMm - footerMm - gapsAroundQr);
        if (options.qrSizeMm) qr = Math.min(qr, options.qrSizeMm);
    } else {
        qr = Math.min(freeWidth, options.qrSizeMm ?? freeWidth);
        height = padding * 2 + headerMm + footerMm + gapsAroundQr + qr;
    }
    const slack = Math.max(0, height - padding * 2 - headerMm - footerMm - gapsAroundQr - Math.max(qr, 0));
    const grouped = options.align === 'grouped';

    const headerTop = padding + (grouped ? slack / 2 : 0);
    const qrTop = headerTop + headerMm + (headerMm > 0 ? gap : 0) + (grouped ? 0 : slack / 2);
    const footerTop = grouped ? qrTop + qr + (footerMm > 0 ? gap : 0) : height - padding - footerMm;

    const place = <K extends string>(parts: { key: K; h: number }[], start: number) => {
        let cursor = start;
        return parts.map((part, i) => {
            if (i > 0) cursor += inner;
            const top = cursor;
            cursor += part.h;
            return { key: part.key, top, h: part.h };
        });
    };
    const header = place(headerParts, headerTop);
    const footer = place(footerParts, footerTop);
    return {
        width,
        height,
        padding,
        sidePadding,
        autoSidePadding: autoPadding,
        gap,
        qr,
        qrTop,
        qrLeft: (width - qr) / 2,
        fits: qr >= MIN_QR_MM,
        fonts,
        lineHeight: lh,
        iconMm,
        headerMm,
        footerTop,
        showPlate,
        /** Topo (mm) de cada elemento do cabeçalho. */
        nameTop: header.find((e) => e.key === 'name')?.top,
        promoTop: header.find((e) => e.key === 'promo')?.top,
        appTop: header.find((e) => e.key === 'app')?.top,
        plateTop: footer.find((e) => e.key === 'plate')?.top,
        lineTops: footer.filter((e) => e.key === 'line').map((e) => e.top),
    };
}

export const DEFAULT_SHEET_GAP_MM = 4;
export const DEFAULT_SHEET_MARGIN_MM = 8;

/** Grade da folha (pt), compartilhada pelo PDF e pela prévia na tela. */
export function qrLabelMetrics(options: Omit<QrLabelSheetOptions, 'items'> & { lineCount: number }) {
    const layout = qrLabelLayout(options);
    const labelWidth = layout.width * MM;
    const labelHeight = layout.height * MM;
    if (options.sheet === 'label') {
        return {
            layout, labelWidth, labelHeight, columns: 1, rows: 1, perPage: 1,
            pageWidth: labelWidth, pageHeight: labelHeight, gapX: 0, gapY: 0, marginTop: 0, marginSide: 0,
            fitsSheet: layout.fits,
            slot: () => ({ x: 0, top: 0 }),
        };
    }
    const sheet = SHEETS[options.sheet];
    const mm = (value: number | undefined, fallback: number, max: number) =>
        clamp(Number.isFinite(value) ? (value as number) : fallback, 0, max) * MM;
    const gapX = mm(options.gapXMm, DEFAULT_SHEET_GAP_MM, 60);
    const gapY = mm(options.gapYMm, DEFAULT_SHEET_GAP_MM, 60);
    const marginTop = mm(options.sheetMarginTopMm, DEFAULT_SHEET_MARGIN_MM, 60);
    const marginSide = mm(options.sheetMarginSideMm, DEFAULT_SHEET_MARGIN_MM, 60);
    const usableW = sheet.width - marginSide * 2;
    const usableH = sheet.height - marginTop * 2;
    const fitsSheet = layout.fits && labelWidth <= usableW + 0.01 && labelHeight <= usableH + 0.01;
    const columns = Math.max(1, Math.floor((usableW + gapX + 0.01) / (labelWidth + gapX)));
    const rows = Math.max(1, Math.floor((usableH + gapY + 0.01) / (labelHeight + gapY)));
    const gridW = columns * labelWidth + (columns - 1) * gapX;
    const gridH = rows * labelHeight + (rows - 1) * gapY;
    const centered = options.gridAlign !== 'margin';
    const originX = centered ? (sheet.width - gridW) / 2 : marginSide;
    const originY = centered ? (sheet.height - gridH) / 2 : marginTop;
    return {
        layout, labelWidth, labelHeight, columns, rows, perPage: columns * rows,
        pageWidth: sheet.width, pageHeight: sheet.height, gapX, gapY, marginTop, marginSide,
        fitsSheet,
        /** Canto superior esquerdo (pt, topo medido de cima) da posição `index` na folha. */
        slot: (index: number) => ({
            x: originX + (index % columns) * (labelWidth + gapX),
            top: originY + Math.floor(index / columns) * (labelHeight + gapY),
        }),
    };
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

/** Faixas de cor do degradê no QR vetorial (cada uma vira um caminho no PDF). */
const STYLED_GRADIENT_STEPS = 48;

/**
 * Formas do `qr-code-styling` (tipo `rounded`), em coordenadas de uma célula
 * 0..1. Rotação no sentido horário, como o `rotate()` do SVG que a lib usa.
 */
type Pt = [number, number];
function rotateCell(points: Pt[], quarterTurns: number): Pt[] {
    const turns = ((quarterTurns % 4) + 4) % 4;
    return points.map(([px, py]) => {
        let [rx, ry] = [px - 0.5, py - 0.5];
        for (let i = 0; i < turns; i += 1) [rx, ry] = [-ry, rx];
        return [rx + 0.5, ry + 0.5];
    });
}

/**
 * Caminho de um módulo, igual ao `_drawRounded` do qr-code-styling:
 * isolado = círculo; 3+ vizinhos ou vizinhos opostos = quadrado; 2 vizinhos =
 * canto arredondado do lado oposto; 1 vizinho = lado arredondado oposto.
 */
function roundedModulePath(x: number, y: number, size: number, n: { l: boolean; r: boolean; t: boolean; b: boolean }): string {
    const f = (v: number) => v.toFixed(3);
    const at = ([px, py]: Pt) => `${f(x + px * size)} ${f(y + py * size)}`;
    const half = f(size / 2);
    const count = +n.l + +n.r + +n.t + +n.b;
    if (count === 0) return circle(x + size / 2, y + size / 2, size / 2);
    if (count > 2 || (n.l && n.r) || (n.t && n.b)) // Mesmo sentido (anti-horário na tela) das outras formas: na regra nonzero do PDF,
        // sobreposições com sentidos opostos se anulariam e virariam frestas brancas.
        return `M${at([0, 0])}L${at([0, 1])}L${at([1, 1])}L${at([1, 0])}Z`;
    if (count === 2) {
        // Base (rotação 0): vizinhos embaixo e à esquerda, canto superior direito arredondado.
        const turns = n.l && n.t ? 1 : n.t && n.r ? 2 : n.r && n.b ? 3 : 0;
        const [p0, p1, p2, p3, p4] = rotateCell([[0, 0], [0, 1], [1, 1], [1, 0.5], [0.5, 0]], turns);
        return `M${at(p0)}L${at(p1)}L${at(p2)}L${at(p3)}A${half} ${half} 0 0 0 ${at(p4)}Z`;
    }
    // Um vizinho. Base: vizinho à esquerda, lado direito arredondado.
    const turns = n.t ? 1 : n.r ? 2 : n.b ? 3 : 0;
    const [p0, p1, p2, p3] = rotateCell([[0, 0], [0, 1], [0.5, 1], [0.5, 0]], turns);
    return `M${at(p0)}L${at(p1)}L${at(p2)}A${half} ${half} 0 0 0 ${at(p3)}Z`;
}

/**
 * QR no design do app (o mesmo do qr-code-styling em `vehicleQr.ts`), 100%
 * vetorial: pontos arredondados conforme os vizinhos, degradê linear a 45°
 * do verde-escuro ao verde, olhos "extra-rounded" escuros com centro verde.
 * `x`/`top` = canto superior esquerdo na folha (pt, top medido do topo).
 */
export function drawVectorQr(page: PDFPage, data: string, x: number, top: number, size: number, marginRatio = 0.06): void {
    const matrix = qrMatrix(data);
    const count = matrix.length;
    const margin = size * Math.max(0, Math.min(0.2, marginRatio));
    const cell = (size - margin * 2) / count;
    const y = page.getHeight() - top;
    page.drawRectangle({ x, y: y - size, width: size, height: size, color: rgb(1, 1, 1) });

    const inFinder = (row: number, col: number) =>
        (row < 7 && col < 7) || (row < 7 && col >= count - 7) || (row >= count - 7 && col < 7);
    const dark = (row: number, col: number) =>
        row >= 0 && col >= 0 && row < count && col < count && matrix[row][col] && !inFinder(row, col);

    const buckets: string[][] = Array.from({ length: STYLED_GRADIENT_STEPS }, () => []);
    for (let row = 0; row < count; row += 1) {
        for (let col = 0; col < count; col += 1) {
            if (!dark(row, col)) continue;
            const mx = margin + col * cell;
            const my = margin + row * cell;
            // Leve sobreposição (3%) evita frestas claras entre módulos vizinhos na impressão.
            const bleed = cell * 0.03;
            const path = roundedModulePath(mx - bleed, my - bleed, cell + bleed * 2, {
                l: dark(row, col - 1), r: dark(row, col + 1), t: dark(row - 1, col), b: dark(row + 1, col),
            });
            // Degradê linear a 45°: do canto superior esquerdo ao inferior direito.
            const t = (mx + my + cell) / (2 * size);
            buckets[Math.min(STYLED_GRADIENT_STEPS - 1, Math.max(0, Math.floor(t * STYLED_GRADIENT_STEPS)))].push(path);
        }
    }
    buckets.forEach((paths, index) => {
        if (paths.length) page.drawSvgPath(paths.join(''), { x, y, color: mix((index + 0.5) / STYLED_GRADIENT_STEPS) });
    });

    // Olhos: quadrado 7×7 de raio 2,5 com furo 5×5 de raio 1,5 (escuro) e ponto central de 3 módulos (verde).
    const white = rgb(1, 1, 1);
    for (const [row, col] of [[0, 0], [0, count - 7], [count - 7, 0]] as const) {
        const ex = margin + col * cell;
        const ey = margin + row * cell;
        page.drawSvgPath(roundedRect(ex, ey, 7 * cell, 7 * cell, 2.5 * cell), { x, y, color: mix(0) });
        page.drawSvgPath(roundedRect(ex + cell, ey + cell, 5 * cell, 5 * cell, 1.5 * cell), { x, y, color: white });
        page.drawSvgPath(circle(ex + 3.5 * cell, ey + 3.5 * cell, 1.5 * cell), { x, y, color: rgb(GREEN[0] / 255, GREEN[1] / 255, GREEN[2] / 255) });
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
    color: RGB = mix(0),
    quietModules = 4,
): void {
    const matrix = qrMatrix(data, errorCorrection);
    const count = matrix.length;
    const quiet = quietModules;
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
    page.drawSvgPath(runs.join(''), { x, y, color });
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

function hexColor(hex: string): RGB {
    const value = hex.replace('#', '');
    const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
    const n = Number.parseInt(full, 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Desenha um ícone de `labelIcons.ts` com o canto superior esquerdo em (x, top), lado `size` (pt). */
function drawIcon(page: PDFPage, icon: LabelIcon, x: number, top: number, size: number): void {
    const unit = size / icon.box;
    const y = page.getHeight() - top;
    if (icon.background) {
        page.drawSvgPath(roundedRect(0, 0, icon.box, icon.box, icon.background.radius), {
            x, y, scale: unit, color: hexColor(icon.background.fill),
        });
    }
    const offset = icon.offset ?? { x: 0, y: 0, scale: 1 };
    icon.paths.forEach((path) => {
        page.drawSvgPath(path.d, {
            x: x + offset.x * unit,
            y: y - offset.y * unit,
            scale: unit * offset.scale,
            color: hexColor(path.fill),
        });
    });
}

export async function buildQrLabelsPdf(options: QrLabelSheetOptions): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const lineCount = Math.max(0, ...options.items.map((item) => itemLines(item).length));
    const m = qrLabelMetrics({ ...options, lineCount });
    const L = m.layout;
    const skip = Math.max(0, Math.min(options.skip ?? 0, m.perPage - 1));
    const border = rgb(0xcb / 255, 0xd5 / 255, 0xe1 / 255);
    const muted = rgb(0x64 / 255, 0x74 / 255, 0x8b / 255);
    const ink = options.qrStyle === 'plain' ? rgb(0, 0, 0) : mix(0);
    const header = options.header ? winAnsiSafe(bold, options.header.toUpperCase()) : '';
    const appName = winAnsiSafe(bold, options.appName || 'Exattus Rotta');
    const promoText = winAnsiSafe(regular, options.promoText ?? 'Baixe o app do motorista:');
    const innerWidth = (L.width - L.sidePadding * 2) * MM;

    const centered = (page: PDFPage, font: PDFFont, text: string, size: number, x: number, top: number, color: RGB) => {
        const value = fit(font, text, size, innerWidth);
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
    for (let itemIndex = 0; itemIndex < options.items.length; itemIndex += 1) {
        const item = options.items[itemIndex];
        const index = itemIndex + skip;
        if (index % m.perPage === 0 || page === null) page = doc.addPage([m.pageWidth, m.pageHeight]);
        const current: PDFPage = page;
        const slot = index % m.perPage;
        const { x, top } = m.slot(slot);
        if (options.border !== false) {
            const inset = options.sheet === 'label' ? 0.5 : 0;
            current.drawSvgPath(roundedRect(inset, inset, m.labelWidth - inset * 2, m.labelHeight - inset * 2, 3 * MM), {
                x, y: current.getHeight() - top, borderColor: border, borderWidth: 0.6,
            });
        }

        // Cabeçalho: prefeitura e convite para o app do motorista.
        // Texto desenhado com o topo da linha em `topMm` e o corpo centrado na entrelinha.
        const textTop = (topMm: number, size: number) => top + topMm * MM + (size * L.lineHeight - size) / 2;
        if (header && L.nameTop !== undefined) {
            centered(current, bold, header, L.fonts.name, x, textTop(L.nameTop, L.fonts.name), mix(0));
        }
        if (L.promoTop !== undefined) {
            centered(current, regular, promoText, L.fonts.promo, x, textTop(L.promoTop, L.fonts.promo), muted);
        }
        if (options.appPromo && L.appTop !== undefined) {
            const rowTop = top + L.appTop * MM;
            const icon = L.iconMm * MM;
            const nameSize = L.fonts.app;
            const nameWidth = bold.widthOfTextAtSize(appName, nameSize);
            const spacing = icon * 0.3;
            const store = icon * 0.8;
            const rowWidth = icon + spacing + nameWidth + spacing * 2 + store * 2 + spacing;
            let cx = x + (m.labelWidth - rowWidth) / 2;
            drawIcon(current, APP_LOGO_ICON, cx, rowTop, icon);
            cx += icon + spacing;
            current.drawText(appName, {
                x: cx,
                y: current.getHeight() - rowTop - icon / 2 - nameSize * 0.35,
                size: nameSize,
                font: bold,
                color: mix(0),
            });
            cx += nameWidth + spacing * 2;
            drawIcon(current, GOOGLE_PLAY_ICON, cx, rowTop + (icon - store) / 2, store);
            cx += store + spacing;
            drawIcon(current, APPLE_ICON, cx, rowTop + (icon - store) / 2, store);
        }

        const qrX = x + L.qrLeft * MM;
        const qrTop = top + L.qrTop * MM;
        const qrSize = L.qr * MM;
        const data = item.data.toUpperCase();
        if (options.qrStyle === 'plain') {
            drawPlainVectorQr(current, data, qrX, qrTop, qrSize, 'H', rgb(0, 0, 0), options.qrQuietModules ?? 4);
        } else {
            drawVectorQr(current, data, qrX, qrTop, qrSize, options.qrMarginRatio ?? 0.06);
        }

        if (L.showPlate && L.plateTop !== undefined) {
            const plateLine = Math.max(1, L.lineHeight * 0.9);
            centered(current, bold, winAnsiSafe(bold, item.plate), L.fonts.plate, x, top + L.plateTop * MM + (L.fonts.plate * plateLine - L.fonts.plate) / 2, ink);
        }
        itemLines(item).forEach((line, i) => {
            const lineTop = L.lineTops[i];
            if (lineTop === undefined) return;
            centered(current, regular, winAnsiSafe(regular, line), L.fonts.caption, x, textTop(lineTop, L.fonts.caption), muted);
        });
    }
    if (options.items.length === 0) doc.addPage([m.pageWidth, m.pageHeight]);
    doc.setTitle(options.title ?? 'Etiquetas QR — Frota');
    doc.setLanguage('pt-BR');
    return doc.save({ useObjectStreams: true });
}
