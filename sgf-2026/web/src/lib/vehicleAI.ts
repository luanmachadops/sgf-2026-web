import { supabase } from './supabase';
import { resizeAndConvertToWebP } from './imageUtils';
import { uploadPrivateDoc } from './docStorage';

const DOC_BUCKET = 'documentos';
const SIGNED_URL_TTL_SEC = 300;

export interface ExtractedVehicle {
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    year?: number | null;
    color?: string | null;
    fuelType?: 'GASOLINE' | 'ETHANOL' | 'DIESEL' | 'FLEX' | null;
    tankCapacity?: number | null;
    vehicleType?: string | null;
    renavam?: string | null;
    chassis?: string | null;
    /** Odômetro lido da foto do painel (km). */
    odometer?: number | null;
    confidence?: number;
}

export type VehiclePhotoSlot = 'foto' | 'placa' | 'documento' | 'hodometro';

// Slots sensíveis (CRLV/placa/hodômetro) vão para o bucket PRIVADO e são salvos como PATH.
// O slot `foto` (foto do veículo, exibida na UI) permanece no bucket público `fotos`.
const SENSITIVE_SLOTS: VehiclePhotoSlot[] = ['placa', 'documento', 'hodometro'];

export interface ExtractWithPhotosResult {
    data: ExtractedVehicle;
    /** `url` é uma URL pública (slot `foto`) OU um path do bucket privado `documentos` (demais slots). */
    photos: { type: VehiclePhotoSlot; url: string }[];
}

// ── Normalização (rede de segurança): garante pt-BR e tipo dentro da lista ──
const COLOR_PT: Record<string, string> = {
    white: 'Branco', silver: 'Prata', gray: 'Cinza', grey: 'Cinza', black: 'Preto',
    red: 'Vermelho', blue: 'Azul', green: 'Verde', yellow: 'Amarelo', brown: 'Marrom',
    beige: 'Bege', gold: 'Dourado', orange: 'Laranja', purple: 'Roxo', wine: 'Vinho',
    'dark gray': 'Cinza-escuro', 'dark grey': 'Cinza-escuro', 'light gray': 'Cinza-claro', 'light grey': 'Cinza-claro',
};

export const VEHICLE_TYPES = ['Hatch', 'Sedan', 'SUV', 'Picape', 'Furgão', 'Van', 'Minivan', 'Ônibus', 'Micro-ônibus', 'Caminhão', 'Motocicleta', 'Trator', 'Máquina', 'Outro'];
const TYPE_ALIASES: Record<string, string> = {
    pickup: 'Picape', 'pick-up': 'Picape', 'pickup truck': 'Picape', truck: 'Caminhão',
    hatchback: 'Hatch', hatch: 'Hatch', sedan: 'Sedan', saloon: 'Sedan', wagon: 'Sedan',
    suv: 'SUV', crossover: 'SUV', van: 'Van', minivan: 'Minivan',
    bus: 'Ônibus', microbus: 'Micro-ônibus', minibus: 'Micro-ônibus',
    motorcycle: 'Motocicleta', motorbike: 'Motocicleta', tractor: 'Trator',
    'panel van': 'Furgão', 'cargo van': 'Furgão', caminhonete: 'Picape',
};

function normalizeColor(c?: string | null): string | null {
    if (!c) return c ?? null;
    const key = c.trim().toLowerCase();
    if (COLOR_PT[key]) return COLOR_PT[key];
    return c.charAt(0).toUpperCase() + c.slice(1);
}

function normalizeType(t?: string | null): string | null {
    if (!t) return t ?? null;
    const key = t.trim().toLowerCase();
    if (TYPE_ALIASES[key]) return TYPE_ALIASES[key];
    const match = VEHICLE_TYPES.find((v) => v.toLowerCase() === key);
    return match ?? t;
}

function normalizeExtracted(d: ExtractedVehicle): ExtractedVehicle {
    return { ...d, color: normalizeColor(d.color), vehicleType: normalizeType(d.vehicleType) };
}

/**
 * Sobe fotos ROTULADAS (veículo, placa, CRLV, hodômetro), chama a IA e devolve
 * os dados extraídos + as referências de cada foto (para salvar como documentos).
 *
 * A foto do veículo (`foto`) vai para o bucket público `fotos` (URL pública, usada na UI).
 * Placa, CRLV e hodômetro são documentos sensíveis: vão para o bucket privado `documentos`
 * e o `url` retornado é na verdade um PATH — persista-o como está (não é uma URL pública).
 */
export async function extractVehicleWithPhotos(
    slots: { type: VehiclePhotoSlot; file: File }[],
    vehicleId: string | undefined,
    tenantId: string,
): Promise<ExtractWithPhotosResult> {
    const valid = slots.filter((s) => s.file);
    if (valid.length === 0) throw new Error('Selecione ao menos uma foto.');
    if (!tenantId) throw new Error('Sem prefeitura definida para o envio das fotos.');

    const photos: { type: VehiclePhotoSlot; url: string }[] = [];
    const imagesForAI: string[] = [];
    for (const s of valid) {
        if (SENSITIVE_SLOTS.includes(s.type)) {
            const path = await uploadPrivateDoc(s.file, 'vehicles', tenantId, s.type);
            photos.push({ type: s.type, url: path });
            const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SEC);
            if (error) throw error;
            if (data?.signedUrl) imagesForAI.push(data.signedUrl);
        } else {
            const blob = await resizeAndConvertToWebP(s.file, 1000);
            const dir = vehicleId ? `vehicles/${vehicleId}` : 'vehicles/ai';
            const fileName = `${dir}/${s.type}-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
            const { error: upErr } = await supabase.storage.from('fotos').upload(fileName, blob, { contentType: 'image/webp', upsert: true });
            if (upErr) throw upErr;
            const { data: { publicUrl } } = supabase.storage.from('fotos').getPublicUrl(fileName);
            photos.push({ type: s.type, url: publicUrl });
            imagesForAI.push(publicUrl);
        }
    }

    const { data, error } = await supabase.functions.invoke('vehicle-ai-extract', {
        body: { images: imagesForAI },
    });
    if (error) {
        const ctx = (error as { context?: { body?: unknown } }).context;
        throw new Error((ctx as { body?: { error?: string } })?.body?.error ?? error.message ?? 'Falha na análise por IA.');
    }
    if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);

    const extracted = normalizeExtracted(((data as { data?: ExtractedVehicle })?.data ?? {}) as ExtractedVehicle);
    return { data: extracted, photos };
}

/**
 * Envia as fotos (veículo, placa, documento) para a edge function que consulta a IA
 * (OpenRouter) e retorna os dados extraídos do veículo.
 *
 * Extração pura — não persiste nada. As imagens sobem para o bucket PRIVADO `documentos`
 * numa pasta temporária escopada por prefeitura, uma URL assinada de curta duração é
 * gerada só para a IA ler, e os objetos são removidos do storage em seguida.
 */
export async function extractVehicleFromImages(files: File[], tenantId: string): Promise<ExtractedVehicle> {
    const valid = files.filter(Boolean);
    if (valid.length === 0) throw new Error('Selecione ao menos uma foto.');
    if (!tenantId) throw new Error('Sem prefeitura definida para o envio das fotos.');

    const paths: string[] = [];
    const urls: string[] = [];
    try {
        for (const file of valid) {
            const path = await uploadPrivateDoc(file, 'ai-temp', tenantId, 'vehicle');
            paths.push(path);
            const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SEC);
            if (error) throw error;
            if (data?.signedUrl) urls.push(data.signedUrl);
        }

        const { data, error } = await supabase.functions.invoke('vehicle-ai-extract', {
            body: { images: urls },
        });
        if (error) {
            // Tenta extrair a mensagem detalhada do corpo da resposta.
            const ctx = (error as { context?: { body?: unknown } }).context;
            throw new Error((ctx as { body?: { error?: string } })?.body?.error ?? error.message ?? 'Falha na análise por IA.');
        }
        if ((data as { error?: string })?.error) {
            throw new Error((data as { error: string }).error);
        }
        return normalizeExtracted(((data as { data?: ExtractedVehicle })?.data ?? {}) as ExtractedVehicle);
    } finally {
        if (paths.length > 0) {
            await supabase.storage.from(DOC_BUCKET).remove(paths).catch(() => { /* best-effort cleanup */ });
        }
    }
}
