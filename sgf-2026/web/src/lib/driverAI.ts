import { supabase } from './supabase';
import { uploadPrivateDoc } from './docStorage';

const DOC_BUCKET = 'documentos';
const SIGNED_URL_TTL_SEC = 300;

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
 *
 * A CNH é um documento sensível: a imagem é enviada ao bucket PRIVADO `documentos`
 * (pasta temporária escopada por prefeitura), uma URL assinada de curta duração é
 * gerada só para a IA ler, e o objeto é removido do storage logo em seguida — essa
 * função é extração pura, não persiste nada.
 */
export async function extractDriverFromCNH(files: File[], tenantId: string): Promise<ExtractedDriver> {
    const valid = files.filter(Boolean);
    if (valid.length === 0) throw new Error('Selecione a foto da CNH.');
    if (!tenantId) throw new Error('Sem prefeitura definida para a leitura da CNH.');

    const paths: string[] = [];
    const urls: string[] = [];
    try {
        for (const file of valid) {
            const path = await uploadPrivateDoc(file, 'ai-temp', tenantId, 'cnh');
            paths.push(path);
            const { data, error } = await supabase.storage
                .from(DOC_BUCKET)
                .createSignedUrl(path, SIGNED_URL_TTL_SEC);
            if (error) throw error;
            if (data?.signedUrl) urls.push(data.signedUrl);
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
    } finally {
        if (paths.length > 0) {
            await supabase.storage.from(DOC_BUCKET).remove(paths).catch(() => { /* best-effort cleanup */ });
        }
    }
}
