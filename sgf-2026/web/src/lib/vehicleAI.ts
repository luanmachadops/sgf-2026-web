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
    confidence?: number;
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
        const blob = await resizeAndConvertToWebP(file, 1100);
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
    return ((data as { data?: ExtractedVehicle })?.data ?? {}) as ExtractedVehicle;
}
