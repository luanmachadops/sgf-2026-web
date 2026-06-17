import { supabase } from './supabase';
import { resizeAndConvertToWebP } from './imageUtils';

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

export interface ExtractWithPhotosResult {
    data: ExtractedVehicle;
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
 * os dados extraídos + as URLs públicas de cada foto (para salvar como documentos).
 */
export async function extractVehicleWithPhotos(
    slots: { type: VehiclePhotoSlot; file: File }[],
    vehicleId?: string,
): Promise<ExtractWithPhotosResult> {
    const valid = slots.filter((s) => s.file);
    if (valid.length === 0) throw new Error('Selecione ao menos uma foto.');

    const photos: { type: VehiclePhotoSlot; url: string }[] = [];
    for (const s of valid) {
        const blob = await resizeAndConvertToWebP(s.file, 1000);
        const dir = vehicleId ? `vehicles/${vehicleId}` : 'vehicles/ai';
        const fileName = `${dir}/${s.type}-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
        const { error: upErr } = await supabase.storage.from('fotos').upload(fileName, blob, { contentType: 'image/webp', upsert: true });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('fotos').getPublicUrl(fileName);
        photos.push({ type: s.type, url: publicUrl });
    }

    const { data, error } = await supabase.functions.invoke('vehicle-ai-extract', {
        body: { images: photos.map((p) => p.url) },
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
 */
export async function extractVehicleFromImages(files: File[]): Promise<ExtractedVehicle> {
    const valid = files.filter(Boolean);
    if (valid.length === 0) throw new Error('Selecione ao menos uma foto.');

    // Otimiza e sobe as imagens (a IA recebe URLs públicas).
    const urls: string[] = [];
    for (const file of valid) {
        const blob = await resizeAndConvertToWebP(file, 1000);
        const fileName = `vehicles/ai/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
        const { error: upErr } = await supabase.storage
            .from('fotos')
            .upload(fileName, blob, { contentType: 'image/webp', upsert: true });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('fotos').getPublicUrl(fileName);
        urls.push(publicUrl);
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
}
