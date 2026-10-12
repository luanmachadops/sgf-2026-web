// Comprovante em PDF (ex.: abastecimento) — vetorial e leve, no mesmo padrão
// dos relatórios: texto real em Helvetica não embutida, cabeçalho
// institucional, seções de campos e fotos reduzidas ao tamanho impresso.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { generatedAt, institutionLines, safeHex } from './reports/format';
import type { ReportBranding } from './reports/types';
import type { ReportLogo } from './reports/pdf';

export interface ReceiptSection {
    title: string;
    fields: [label: string, value: string][];
}

export interface ReceiptPhoto {
    label: string;
    image: ReportLogo;
}

export interface ReceiptPdfOptions {
    title: string;
    protocol: string;
    status?: string;
    sections: ReceiptSection[];
    notes?: string | null;
    photos?: ReceiptPhoto[];
    branding?: ReportBranding;
    logo?: ReportLogo | null;
    issuer?: string;
    issuedAt?: Date;
}

const MM = 72 / 25.4;
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 14 * MM;

function hexColor(value: string) {
    const n = Number.parseInt(value, 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function cleaner(font: PDFFont) {
    const supported = new Set(font.getCharacterSet());
    return (text: string) => [...text.replace(/[\u2000-\u200B\u202F\u205F\u3000\n\r\t]/g, ' ')].map((char) => {
        if (supported.has(char.codePointAt(0) ?? 0)) return char;
        const base = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return base && [...base].every((part) => supported.has(part.codePointAt(0) ?? 0)) ? base : '?';
    }).join('');
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
            line = candidate;
            continue;
        }
        if (line) lines.push(line);
        line = '';
        let chunk = '';
        for (const char of word) {
            if (chunk && font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
                lines.push(chunk);
                chunk = '';
            }
            chunk += char;
        }
        line = chunk;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
}

export async function buildReceiptPdf(options: ReceiptPdfOptions): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const clean = cleaner(regular);
    const primary = hexColor(safeHex(options.branding?.primaryColor, '00A86B'));
    const dark = hexColor(safeHex(options.branding?.darkColor, '0F2B2F'));
    const text = hexColor('1F2937');
    const muted = hexColor('6B7280');
    const rule = hexColor('E3E8EB');
    const panel = hexColor('F4F7F8');
    const issuedAt = options.issuedAt ?? new Date();
    const contentWidth = PAGE.width - MARGIN * 2;

    let logo: PDFImage | null = null;
    if (options.logo) {
        try {
            logo = options.logo.type === 'png' ? await doc.embedPng(options.logo.bytes) : await doc.embedJpg(options.logo.bytes);
        } catch {
            logo = null;
        }
    }

    let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
    let y = MARGIN;
    const draw = (value: string, x: number, top: number, size: number, font = regular, color = text) => {
        const cleaned = clean(value);
        if (cleaned) page.drawText(cleaned, { x, y: PAGE.height - top - size * 0.8, size, font, color });
    };
    const bottom = PAGE.height - MARGIN - 20;
    const newPage = () => {
        page = doc.addPage([PAGE.width, PAGE.height]);
        y = MARGIN;
    };

    // Cabeçalho institucional
    const logoSize = 40;
    if (logo) {
        const ratio = Math.min(logoSize / logo.width, logoSize / logo.height);
        page.drawImage(logo, {
            x: MARGIN + (logoSize - logo.width * ratio) / 2,
            y: PAGE.height - y - (logoSize + logo.height * ratio) / 2,
            width: logo.width * ratio,
            height: logo.height * ratio,
        });
    }
    const textX = MARGIN + (logo ? logoSize + 10 : 0);
    draw((options.branding?.name || 'PREFEITURA MUNICIPAL').toUpperCase(), textX, y + 2, 11, bold, dark);
    institutionLines(options.branding).forEach((line, index) => draw(line.toUpperCase(), textX, y + 16 + index * 8.5, 6.8, regular, muted));
    y += Math.max(logoSize, 16 + institutionLines(options.branding).length * 8.5) + 8;
    page.drawLine({ start: { x: MARGIN, y: PAGE.height - y }, end: { x: PAGE.width - MARGIN, y: PAGE.height - y }, thickness: 2, color: primary });
    y += 14;

    draw(options.title, MARGIN, y, 15, bold, dark);
    y += 20;
    const meta = [`Protocolo ${options.protocol}`, options.status ? `Situação: ${options.status}` : '', `Emissão: ${generatedAt(issuedAt)}`]
        .filter(Boolean).join('   •   ');
    page.drawRectangle({ x: MARGIN, y: PAGE.height - y - 18, width: contentWidth, height: 18, color: panel });
    draw(meta, MARGIN + 8, y + 5, 8, bold, text);
    y += 28;

    // Seções em duas colunas de campos
    const columnWidth = (contentWidth - 16) / 2;
    for (const section of options.sections) {
        const fields = section.fields.filter(([, value]) => value && value !== '—');
        if (fields.length === 0) continue;
        if (y + 40 > bottom) newPage();
        draw(section.title.toUpperCase(), MARGIN, y, 7.5, bold, primary);
        y += 12;
        for (let index = 0; index < fields.length; index += 2) {
            const pair = fields.slice(index, index + 2).map(([label, value]) => ({
                label,
                lines: wrap(regular, clean(value), 9.5, columnWidth),
            }));
            const height = 11 + Math.max(...pair.map((item) => item.lines.length)) * 12 + 6;
            if (y + height > bottom) newPage();
            pair.forEach((item, column) => {
                const x = MARGIN + column * (columnWidth + 16);
                draw(item.label, x, y, 7, regular, muted);
                item.lines.forEach((line, lineIndex) => draw(line, x, y + 10 + lineIndex * 12, 9.5, bold, text));
            });
            y += height;
        }
        page.drawLine({ start: { x: MARGIN, y: PAGE.height - y }, end: { x: PAGE.width - MARGIN, y: PAGE.height - y }, thickness: 0.5, color: rule });
        y += 12;
    }

    if (options.notes) {
        const lines = wrap(regular, clean(options.notes), 9, contentWidth);
        if (y + 20 + lines.length * 11 > bottom) newPage();
        draw('OBSERVAÇÕES', MARGIN, y, 7.5, bold, primary);
        y += 12;
        lines.forEach((line) => {
            draw(line, MARGIN, y, 9, regular, text);
            y += 11;
        });
        y += 10;
    }

    // Fotos: duas por linha, 4:3
    const photos = options.photos ?? [];
    if (photos.length) {
        const photoWidth = (contentWidth - 12) / 2;
        const photoHeight = photoWidth * 0.75;
        if (y + 14 + photoHeight + 14 > bottom) newPage();
        draw('REGISTROS FOTOGRÁFICOS', MARGIN, y, 7.5, bold, primary);
        y += 14;
        for (let index = 0; index < photos.length; index += 2) {
            if (y + photoHeight + 16 > bottom) newPage();
            for (const [column, photo] of photos.slice(index, index + 2).entries()) {
                const x = MARGIN + column * (photoWidth + 12);
                try {
                    const image = photo.image.type === 'png' ? await doc.embedPng(photo.image.bytes) : await doc.embedJpg(photo.image.bytes);
                    const ratio = Math.min(photoWidth / image.width, photoHeight / image.height);
                    page.drawRectangle({ x, y: PAGE.height - y - photoHeight, width: photoWidth, height: photoHeight, color: panel });
                    page.drawImage(image, {
                        x: x + (photoWidth - image.width * ratio) / 2,
                        y: PAGE.height - y - photoHeight + (photoHeight - image.height * ratio) / 2,
                        width: image.width * ratio,
                        height: image.height * ratio,
                    });
                } catch {
                    draw('Imagem indisponível', x + 8, y + photoHeight / 2, 8, regular, muted);
                }
                draw(photo.label, x, y + photoHeight + 4, 7.5, bold, muted);
            }
            y += photoHeight + 18;
        }
    }

    // Rodapé
    const pages = doc.getPages();
    const footer = options.branding?.reportFooter || `${options.branding?.appName || 'Exattus Rotta'} — Gestão pública de frotas por protocolo digital`;
    pages.forEach((current, index) => {
        const top = PAGE.height - MARGIN - 10;
        current.drawLine({ start: { x: MARGIN, y: PAGE.height - top }, end: { x: PAGE.width - MARGIN, y: PAGE.height - top }, thickness: 0.5, color: rule });
        const right = clean(`${options.issuer ? `Emitido por ${options.issuer} · ` : ''}Página ${index + 1} de ${pages.length}`);
        const rightWidth = regular.widthOfTextAtSize(right, 6.5);
        current.drawText(right, { x: PAGE.width - MARGIN - rightWidth, y: PAGE.height - top - 10, size: 6.5, font: regular, color: muted });
        const left = wrap(regular, clean(footer), 6.5, contentWidth - rightWidth - 20)[0];
        current.drawText(left, { x: MARGIN, y: PAGE.height - top - 10, size: 6.5, font: regular, color: muted });
    });

    doc.setTitle(`${options.title} — ${options.protocol}`);
    doc.setAuthor((options.branding?.name || '').toUpperCase());
    doc.setLanguage('pt-BR');
    doc.setCreationDate(issuedAt);
    return doc.save({ useObjectStreams: true });
}
