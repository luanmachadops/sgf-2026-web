/**
 * Utilitários de imagem — otimização para upload (economia de espaço no banco/storage).
 *
 * Estratégia (padrão usado por apps profissionais):
 *  - Redimensiona mantendo proporção até a maior dimensão = maxSize (default 1000px).
 *  - Codifica em WebP e em JPEG e escolhe o MENOR arquivo (WebP quase sempre vence,
 *    mas garantimos o melhor caso a caso).
 *  - Qualidade 0.8 (ótimo equilíbrio qualidade × tamanho).
 *  - Preserva transparência: se a origem tem canal alfa (PNG/WebP), só usa WebP.
 */

export interface OptimizedImage {
    blob: Blob;
    ext: 'webp' | 'jpg';
    contentType: 'image/webp' | 'image/jpeg';
    width: number;
    height: number;
    bytes: number;
}

export interface OptimizeOptions {
    /** Maior dimensão (largura ou altura) em px. Default 1000. */
    maxSize?: number;
    /** Qualidade de compressão 0–1. Default 0.8. */
    quality?: number;
}

/** Presets prontos para os diferentes tipos de imagem do sistema. */
export const IMAGE_PRESETS = {
    /** Fotos de veículos, postos, hodômetro, documentos fotografados. */
    photo: { maxSize: 1000, quality: 0.8 },
    /** Fotos de perfil / avatares (não precisam ser grandes). */
    avatar: { maxSize: 512, quality: 0.8 },
    /** Logos / brasões (menores, transparência preservada). */
    logo: { maxSize: 512, quality: 0.85 },
} as const;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

function hasAlpha(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
    try {
        // Amostra alguns pixels (não a imagem toda, por performance).
        const step = Math.max(1, Math.floor(Math.min(width, height) / 32));
        const data = ctx.getImageData(0, 0, width, height).data;
        for (let y = 0; y < height; y += step) {
            for (let x = 0; x < width; x += step) {
                if (data[(y * width + x) * 4 + 3] < 250) return true;
            }
        }
        return false;
    } catch {
        return false;
    }
}

/** Carrega o arquivo num canvas já redimensionado (≤ maxSize na maior dimensão). */
async function drawResized(file: File, maxSize: number): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; width: number; height: number }> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(new Error('Falha ao ler a imagem.'));
        reader.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('Falha ao carregar a imagem.'));
        i.src = dataUrl;
    });
    let { width, height } = img;
    const ratio = width / height;
    if (width >= height && width > maxSize) { width = maxSize; height = Math.round(width / ratio); }
    else if (height > width && height > maxSize) { height = maxSize; width = Math.round(height * ratio); }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Falha ao obter o contexto do canvas.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    return { canvas, ctx, width, height };
}

/**
 * Otimiza uma imagem para upload, retornando o menor formato (WebP ou JPEG).
 */
export async function optimizeImage(file: File, opts: OptimizeOptions = {}): Promise<OptimizedImage> {
    const maxSize = opts.maxSize ?? 1000;
    const quality = opts.quality ?? 0.8;
    const { canvas, ctx, width, height } = await drawResized(file, maxSize);

    const alpha = hasAlpha(ctx, width, height);
    const webp = await canvasToBlob(canvas, 'image/webp', quality);
    const jpeg = alpha ? null : await canvasToBlob(canvas, 'image/jpeg', quality);

    let best: { blob: Blob; ext: 'webp' | 'jpg'; contentType: 'image/webp' | 'image/jpeg' } | null = null;
    if (webp) best = { blob: webp, ext: 'webp', contentType: 'image/webp' };
    if (jpeg && (!best || jpeg.size < best.blob.size)) best = { blob: jpeg, ext: 'jpg', contentType: 'image/jpeg' };
    if (!best) throw new Error('Falha ao comprimir a imagem.');

    return { ...best, width, height, bytes: best.blob.size };
}

/**
 * Atalho: otimiza e devolve um File pronto para upload (com nome/extensão corretos).
 */
export async function optimizeImageToFile(file: File, baseName: string, opts?: OptimizeOptions): Promise<{ file: File; ext: string; contentType: string }> {
    const o = await optimizeImage(file, opts);
    const out = new File([o.blob], `${baseName}.${o.ext}`, { type: o.contentType });
    return { file: out, ext: o.ext, contentType: o.contentType };
}

/**
 * Compatibilidade: mantém a assinatura antiga. Retorna sempre WebP em 1000px/0.8
 * (para callers que nomeiam o arquivo como .webp).
 */
export async function resizeAndConvertToWebP(file: File, maxSize: number = 1000): Promise<Blob> {
    if (!file.type.startsWith('image/')) throw new Error('Selecione uma imagem válida.');
    if (file.size > MAX_UPLOAD_BYTES) throw new Error(`Imagem muito grande (máx. ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`);
    const { canvas } = await drawResized(file, maxSize);
    const blob = await canvasToBlob(canvas, 'image/webp', 0.8);
    if (!blob) throw new Error('Falha ao converter a imagem para WebP.');
    return blob;
}

export function isImageFile(file: File): boolean {
    return file.type.startsWith('image/');
}

/**
 * Prepara um arquivo para upload: se for imagem, otimiza (WebP/JPEG, ≤maxSize);
 * caso contrário (PDF etc.), envia como está. Retorna blob + extensão + content-type.
 */
/** Tamanho máximo de arquivo aceito (imagem é otimizada; documentos vão como estão). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/** Valida tipo (imagem ou PDF) e tamanho de um arquivo antes do upload. Lança em caso de erro. */
export function validateUploadFile(file: File, maxBytes: number = MAX_UPLOAD_BYTES): void {
    const okType = file.type.startsWith('image/') || file.type === 'application/pdf';
    if (!okType) throw new Error('Tipo de arquivo não permitido. Envie uma imagem ou PDF.');
    if (file.size > maxBytes) throw new Error(`Arquivo muito grande (máx. ${Math.round(maxBytes / 1024 / 1024)} MB).`);
}

export async function prepareUpload(file: File, opts?: OptimizeOptions): Promise<{ blob: Blob; ext: string; contentType: string }> {
    validateUploadFile(file);
    if (isImageFile(file)) {
        const o = await optimizeImage(file, opts);
        return { blob: o.blob, ext: o.ext, contentType: o.contentType };
    }
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    return { blob: file, ext, contentType: file.type || 'application/octet-stream' };
}

export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
