import { supabase } from './supabase';
import { resizeAndConvertToWebP } from './imageUtils';

export interface ExtractedDriver {
    name?: string | null;
    cpf?: string | null;
    birthDate?: string | null;   // YYYY-MM-DD
    cnhNumber?: string | null;
    cnhCategory?: string | null;
    cnhExpiry?: string | null;   // YYYY-MM-DD
    confidence?: number;
}

/**
 * Envia foto(s) da CNH para a edge function `driver-cnh-extract` (mesma config de IA
 * usada na identificação de veículos — OpenRouter) e retorna os dados do condutor.
 */
export async function extractDriverFromCNH(files: File[]): Promise<ExtractedDriver> {
    const valid = files.filter(Boolean);
    if (valid.length === 0) throw new Error('Selecione a foto da CNH.');

    const urls: string[] = [];
    for (const file of valid) {
        const blob = await resizeAndConvertToWebP(file, 1400);
        const fileName = `drivers/ai/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
        const { error: upErr } = await supabase.storage
            .from('fotos')
            .upload(fileName, blob, { contentType: 'image/webp', upsert: true });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('fotos').getPublicUrl(fileName);
        urls.push(publicUrl);
    }

    const { data, error } = await supabase.functions.invoke('driver-cnh-extract', {
        body: { images: urls },
    });
    if (error) {
        const ctx = (error as { context?: { body?: unknown } }).context;
        throw new Error((ctx as { body?: { error?: string } })?.body?.error ?? error.message ?? 'Falha na leitura da CNH por IA.');
    }
    if ((data as { error?: string })?.error) {
        throw new Error((data as { error: string }).error);
    }
    return ((data as { data?: ExtractedDriver })?.data ?? {}) as ExtractedDriver;
}
