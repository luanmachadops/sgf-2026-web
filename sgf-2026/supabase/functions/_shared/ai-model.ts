import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/** Modelo padrão quando nada foi escolhido no superadmin. */
export const DEFAULT_AI_MODEL = Deno.env.get('OPENROUTER_MODEL') ?? 'google/gemini-3.6-flash';

const TTL_MS = 60_000;
let cache: { model: string; at: number } | null = null;

/**
 * Modelo OpenRouter usado na leitura de documentos, escolhido em
 * Configurações do superadmin (platform_settings.ai_document_model).
 * Cache de 1 min por isolate; qualquer falha cai no padrão.
 */
export async function resolveAiModel(sb: SupabaseClient): Promise<string> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.model;
  let model = DEFAULT_AI_MODEL;
  try {
    const { data } = await sb.from('platform_settings').select('ai_document_model').eq('id', true).maybeSingle();
    const chosen = (data as { ai_document_model?: string | null } | null)?.ai_document_model?.trim();
    if (chosen && /^[~\w.-]+\/[\w.:~-]+$/.test(chosen)) model = chosen;
  } catch { /* usa o padrão */ }
  cache = { model, at: Date.now() };
  return model;
}
