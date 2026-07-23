import { supabase } from './supabase';

/** Linha crua no formato que o parser do modal (processRowsWithAI) espera. */
export type ImportRawRow = Record<string, string>;

interface AIVehicle {
    plate?: string | null;
    brand?: string | null;
    model?: string | null;
    year?: number | string | null;
    color?: string | null;
    fuel?: string | null;
    department?: string | null;
    tankCapacity?: number | string | null;
    odometer?: number | string | null;
    renavam?: string | null;
    chassis?: string | null;
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

/**
 * Envia o texto extraído (de PDF, lista colada, etc.) para a edge function que
 * usa a IA (OpenRouter) e devolve as linhas de veículos já separadas por coluna.
 *
 * As chaves devolvidas (placa, marca, modelo, ...) casam com FIELD_SYNONYMS do
 * ImportVehiclesModal, então caem direto no fluxo de validação existente.
 */
export async function extractVehicleRowsFromText(text: string): Promise<ImportRawRow[]> {
    if (!text.trim()) return [];
    return invokeAndMap({ text });
}

/**
 * OCR visual: envia as páginas do PDF (renderizadas como imagens data:URL) para a
 * IA ler por reconhecimento visual — usado quando o PDF é digitalizado/scanner
 * e não tem texto selecionável.
 */
export async function extractVehicleRowsFromImages(images: string[]): Promise<ImportRawRow[]> {
    const valid = images.filter(Boolean);
    if (valid.length === 0) return [];
    return invokeAndMap({ images: valid });
}

async function invokeAndMap(payload: { text?: string; images?: string[] }): Promise<ImportRawRow[]> {
    const { data, error } = await supabase.functions.invoke('vehicles-import-extract', {
        body: payload,
    });
    if (error) {
        const ctx = (error as { context?: { body?: unknown } }).context;
        throw new Error((ctx as { body?: { error?: string } })?.body?.error ?? error.message ?? 'Falha na análise por IA.');
    }
    if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);

    const vehicles = ((data as { data?: AIVehicle[] })?.data ?? []) as AIVehicle[];

    return vehicles
        .map((v): ImportRawRow => ({
            placa: str(v.plate),
            marca: str(v.brand),
            modelo: str(v.model),
            ano: str(v.year),
            cor: str(v.color),
            combustivel: str(v.fuel),
            secretaria: str(v.department),
            tanque: str(v.tankCapacity),
            odometro: str(v.odometer),
            renavam: str(v.renavam),
            chassi: str(v.chassis),
        }))
        // Descarta linhas totalmente vazias que a IA porventura devolva.
        .filter((r) => Object.values(r).some((val) => val !== ''));
}
