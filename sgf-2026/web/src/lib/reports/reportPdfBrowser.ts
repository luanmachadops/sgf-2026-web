// Parte do navegador do PDF de relatórios: carrega o brasão reduzido ao
// tamanho impresso e entrega o arquivo (baixar ou abrir para imprimir).
// O motor (`./pdf`) é carregado sob demanda para não pesar no bundle inicial.

import { supabase } from '../supabase';
import type { Json } from '@/types/database.types';
import type { ReportLogo, ReportVerification } from './pdf';
import type { ReportExportOptions } from './types';

/**
 * O brasão sai com 44 pt (~15,5 mm) na 1ª página. A 300 dpi isso dá ~185 px;
 * 240 px dá folga sem inflar o arquivo. Imagens maiores são reduzidas.
 */
const LOGO_MAX_PX = 240;

const logoCache = new Map<string, Promise<ReportLogo | null>>();

function sniff(bytes: Uint8Array): 'png' | 'jpg' | null {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
    return null;
}

async function loadLogo(url: string): Promise<ReportLogo | null> {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const type = sniff(bytes);
    const bitmap = await createImageBitmap(blob);
    try {
        const largest = Math.max(bitmap.width, bitmap.height);
        if (type && largest <= LOGO_MAX_PX) return { bytes, type };
        // Maior que o necessário (ou SVG/WebP): redesenha no tamanho impresso,
        // em PNG para preservar a transparência do brasão.
        const ratio = Math.min(1, LOGO_MAX_PX / largest);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
        canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
        const context = canvas.getContext('2d');
        if (!context) return type ? { bytes, type } : null;
        context.imageSmoothingQuality = 'high';
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!png) return type ? { bytes, type } : null;
        return { bytes: new Uint8Array(await png.arrayBuffer()), type: 'png' };
    } finally {
        bitmap.close();
    }
}

export function loadReportLogo(url?: string): Promise<ReportLogo | null> {
    if (!url) return Promise.resolve(null);
    let cached = logoCache.get(url);
    if (!cached) {
        // Sem brasão (falha de rede/CORS) o PDF usa o escudo vetorial padrão.
        cached = loadLogo(url).catch(() => null);
        logoCache.set(url, cached);
    }
    return cached;
}

export interface GeneratedReportPdf {
    blob: Blob;
    /** Código de verificação registrado no servidor (null = não registrado). */
    verificationCode: string | null;
    /** Motivo de não ter registrado, para avisar o usuário. */
    registrationError?: string;
}

/**
 * Registra o relatório no servidor (report_snapshots, imutável) e devolve o
 * código de verificação público. Só admin, gestor e secretário registram.
 */
async function registerReport(
    options: ReportExportOptions,
    reportId: string,
    hash: string,
): Promise<{ code: string | null; error?: string }> {
    const { data, error } = await supabase.rpc('register_report_snapshot', {
        p_report_type: reportId,
        p_title: options.reportTitle,
        // A função aceita período nulo (relatórios de situação atual); os tipos gerados não refletem isso.
        p_period_start: (options.filters.dateFrom ?? null) as unknown as string,
        p_period_end: (options.filters.dateTo ?? null) as unknown as string,
        p_filters: {
            ...options.filters,
            columns: options.dataset.columns.map((column) => column.key),
            groupBy: options.groupBy ?? null,
        } as unknown as Json,
        p_content_hash: hash,
        p_row_count: options.dataset.rows.length,
    });
    if (error) return { code: null, error: error.message };
    return { code: data?.[0]?.verification_code ?? null };
}

export async function generateReportPdf(
    options: ReportExportOptions,
    registration?: { reportId: string },
): Promise<GeneratedReportPdf> {
    const [pdfModule, logo] = await Promise.all([
        import('./pdf'),
        loadReportLogo(options.branding?.sealUrl || options.branding?.logoUrl),
    ]);
    const issuedAt = new Date();
    let verification: ReportVerification | null = null;
    let registrationError: string | undefined;
    if (registration) {
        const hash = await pdfModule.reportContentHash(options, issuedAt);
        const result = await registerReport(options, registration.reportId, hash);
        if (result.code) {
            verification = { code: result.code, url: `${window.location.origin}/verificar/${result.code}` };
        } else {
            registrationError = result.error ?? 'Registro não confirmado pelo servidor.';
        }
    }
    const bytes = await pdfModule.buildReportPdf({ ...options, logo, issuedAt, verification });
    return {
        blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
        verificationCode: verification?.code ?? null,
        registrationError,
    };
}

export function reportFileName(title: string, extension: 'pdf' | 'xlsx' | 'csv'): string {
    const date = new Date().toISOString().slice(0, 10);
    const base = title
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase();
    return `${base || 'relatorio'}-${date}.${extension}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Abre o PDF numa aba para imprimir. A aba precisa ser aberta no clique
 * (antes do `await`), senão o bloqueador de pop-up do navegador a barra.
 */
export function openPendingPdfTab(): Window | null {
    const tab = window.open('', '_blank');
    if (tab) {
        tab.document.title = 'Gerando PDF…';
        tab.document.body.style.fontFamily = 'Inter, Arial, sans-serif';
        tab.document.body.textContent = 'Gerando o PDF do relatório…';
    }
    return tab;
}

export function showPdfInTab(tab: Window | null, blob: Blob, fileName: string): void {
    if (!tab || tab.closed) {
        downloadBlob(blob, fileName);
        return;
    }
    tab.location.href = URL.createObjectURL(blob);
}

/**
 * Foto para PDF: reduzida ao tamanho impresso e recodificada em JPEG. `maxSide`
 * padrão (900 px) ≈ 200 dpi numa foto de meia largura da folha A4.
 */
export async function loadPhotoForPdf(url: string, maxSide = 900): Promise<ReportLogo | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const bitmap = await createImageBitmap(await response.blob());
        try {
            const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
            canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
            const context = canvas.getContext('2d');
            if (!context) return null;
            context.fillStyle = '#FFFFFF';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.imageSmoothingQuality = 'high';
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
            return jpeg ? { bytes: new Uint8Array(await jpeg.arrayBuffer()), type: 'jpg' } : null;
        } finally {
            bitmap.close();
        }
    } catch {
        return null;
    }
}
