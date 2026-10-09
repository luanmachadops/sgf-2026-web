import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { supabase } from './supabase';
import { tenantApi } from './supabase-api';
import { formatCPF, formatCurrency } from './utils';
import { fmtDateTimeLong } from './infractionFormat';

/**
 * FICI — Formulário de Identificação do Condutor Infrator, pré-preenchido.
 *
 * Modelo genérico com os campos que os órgãos autuadores pedem (CTB art. 257,
 * §7º e Res. CONTRAN 918/2022). Cada órgão pode ter o próprio formulário; este
 * serve para conferência, assinatura e protocolo, ou como base para preencher
 * o modelo oficial. Acompanha: cópia da CNH do condutor e documento do
 * proprietário (prefeitura).
 */
export interface FiciInput {
    infractionId: string;
    driverId: string;
}

type Row = Record<string, unknown>;

const A4: [number, number] = [595.28, 841.89];
const M = 40;
const INK = rgb(0.12, 0.16, 0.22);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.82, 0.84, 0.87);

function fmtDate(d?: string | null): string {
    if (!d) return '';
    const [y, m, day] = d.slice(0, 10).split('-');
    return y && m && day ? `${day}/${m}/${y}` : '';
}

function maskCnpj(v?: string | null): string {
    const d = (v ?? '').replace(/\D/g, '');
    return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : v ?? '';
}

/** Quebra o texto pela largura disponível. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const para of text.split('\n')) {
        let line = '';
        for (const word of para.split(/\s+/)) {
            const test = line ? `${line} ${word}` : word;
            if (font.widthOfTextAtSize(test, size) > width && line) { out.push(line); line = word; } else line = test;
        }
        out.push(line);
    }
    return out;
}

export async function generateFiciPdf({ infractionId, driverId }: FiciInput): Promise<{ blob: Blob; filename: string }> {
    const [{ data: inf, error: e1 }, { data: drv, error: e2 }, tenant] = await Promise.all([
        supabase.from('infractions').select('*, vehicles(plate, brand, model, renavam, chassis, year, color)').eq('id', infractionId).single(),
        supabase.from('profiles').select('full_name, cpf, cnh_number, cnh_category, cnh_expiry, cnh_uf, phone, email').eq('id', driverId).single(),
        tenantApi.getCurrent(),
    ]);
    if (e1 || !inf) throw new Error('Infração não encontrada.');
    if (e2 || !drv) throw new Error('Motorista não encontrado.');
    const i = inf as Row & { vehicles?: Row | null };
    const v = (i.vehicles ?? {}) as Row;
    const d = drv as Row;

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const page: PDFPage = pdf.addPage(A4);
    const W = A4[0] - M * 2;
    let y = A4[1] - M;

    const text = (t: string, x: number, size = 9, f = font, color = INK) => page.drawText(t, { x, y, size, font: f, color });

    // Cabeçalho
    text('FICI — FORMULÁRIO DE IDENTIFICAÇÃO DO CONDUTOR INFRATOR', M, 13, bold);
    y -= 15;
    text('Indicação do condutor responsável pela infração de trânsito (CTB, art. 257, § 7º)', M, 8.5, font, MUTED);
    y -= 18;

    const section = (title: string) => {
        y -= 6;
        page.drawRectangle({ x: M, y: y - 4, width: W, height: 16, color: rgb(0.94, 0.95, 0.96) });
        text(title, M + 6, 9, bold);
        y -= 20;
    };

    /** Linha de campos: [rótulo, valor, fração da largura]. */
    const fields = (cols: [string, string, number][]) => {
        let x = M;
        for (const [label, value, frac] of cols) {
            const w = W * frac;
            page.drawText(label.toUpperCase(), { x: x + 2, y, size: 6.5, font: bold, color: MUTED });
            const val = value || ' ';
            let size = 9.5;
            while (size > 6 && font.widthOfTextAtSize(val, size) > w - 6) size -= 0.5;
            page.drawText(val, { x: x + 2, y: y - 12, size, font, color: INK });
            page.drawLine({ start: { x: x + 2, y: y - 16 }, end: { x: x + w - 6, y: y - 16 }, thickness: 0.6, color: LINE });
            x += w;
        }
        y -= 28;
    };

    section('1. IDENTIFICAÇÃO DA INFRAÇÃO');
    fields([
        ['Nº do auto de infração (AIT)', String(i.ait ?? ''), 0.35],
        ['Código da infração', String(i.code ?? ''), 0.2],
        ['Data e hora', fmtDateTimeLong(String(i.occurred_at ?? '')), 0.45],
    ]);
    fields([['Descrição', String(i.description ?? ''), 1]]);
    fields([
        ['Local', String(i.location ?? ''), 0.7],
        ['Valor', i.amount != null ? formatCurrency(Number(i.amount)) : '', 0.15],
        ['Pontos', i.points != null ? String(i.points) : '', 0.15],
    ]);
    fields([['Órgão autuador', '', 0.6], ['Data da notificação', fmtDate(i.notified_at as string | null), 0.4]]);

    section('2. IDENTIFICAÇÃO DO VEÍCULO');
    fields([
        ['Placa', String(i.plate ?? v.plate ?? ''), 0.2],
        ['RENAVAM', String(v.renavam ?? ''), 0.25],
        ['Marca / modelo', [v.brand, v.model].filter(Boolean).join(' '), 0.4],
        ['Ano', String(v.year ?? ''), 0.15],
    ]);

    section('3. PROPRIETÁRIO DO VEÍCULO');
    fields([['Nome / razão social', tenant?.name ?? '', 0.65], ['CNPJ', maskCnpj(tenant?.cnpj), 0.35]]);
    fields([
        ['Endereço', tenant?.address ?? '', 0.6],
        ['Município', tenant?.city ?? '', 0.28],
        ['UF', tenant?.state ?? '', 0.12],
    ]);
    fields([['Representante legal', tenant?.mayorName ?? '', 1]]);

    section('4. CONDUTOR INFRATOR');
    fields([['Nome completo', String(d.full_name ?? ''), 0.65], ['CPF', formatCPF(String(d.cpf ?? '')), 0.35]]);
    fields([
        ['Nº de registro da CNH', String(d.cnh_number ?? ''), 0.35],
        ['UF da CNH', String(d.cnh_uf ?? ''), 0.15],
        ['Categoria', String(d.cnh_category ?? ''), 0.2],
        ['Validade', fmtDate(d.cnh_expiry as string | null), 0.3],
    ]);
    fields([['Telefone', String(d.phone ?? ''), 0.35], ['E-mail', String(d.email ?? ''), 0.65]]);

    section('5. DECLARAÇÃO');
    const decl = 'Declaramos, sob as penas da lei, que o condutor acima identificado conduzia o veículo descrito no momento da infração, '
        + 'assumindo o condutor a responsabilidade pela infração e pela pontuação correspondente em seu prontuário. '
        + 'Anexos: cópia da CNH do condutor e documento de identificação do representante do proprietário.';
    for (const l of wrap(decl, font, 9, W)) { text(l, M, 9); y -= 12; }
    y -= 34;

    // Assinaturas
    const sig = (label: string, sub: string, x: number, w: number) => {
        page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: 0.8, color: INK });
        page.drawText(label, { x, y: y - 12, size: 8.5, font: bold, color: INK });
        page.drawText(sub, { x, y: y - 23, size: 7.5, font, color: MUTED });
    };
    const half = (W - 30) / 2;
    sig('Assinatura do proprietário (representante legal)', tenant?.mayorName ?? '', M, half);
    sig('Assinatura do condutor infrator', String(d.full_name ?? ''), M + half + 30, half);
    y -= 48;
    text(`${tenant?.city ?? '____________'}, ____ de ______________ de ________.`, M, 9);

    // Rodapé
    page.drawText(`Gerado pelo sistema de gestão de frota em ${new Date().toLocaleString('pt-BR')} · confira os dados antes de assinar e protocolar.`, {
        x: M, y: M - 10, size: 7, font, color: MUTED,
    });

    const bytes = await pdf.save();
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const filename = `FICI-${String(i.ait ?? i.plate ?? infractionId).replace(/[^\w-]/g, '')}.pdf`;
    return { blob, filename };
}
