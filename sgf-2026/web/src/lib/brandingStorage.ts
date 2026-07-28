import { supabase } from '@/lib/supabase';

/**
 * Bucket `branding` — logo, brasão e foto da prefeitura.
 *
 * POR QUE UM BUCKET SEPARADO
 * O `fotos` vai ficar privado. Marca de prefeitura, porém, precisa renderizar
 * ANTES de existir sessão: tela de login do painel, tela de login do app e a
 * página pública de convite. Nenhuma delas pode assinar URL — não há usuário.
 * Pior: `applyBrandingColors()` usa a logo como favicon e o app mobile guarda
 * a URL da marca em AsyncStorage; URL assinada nesses dois lugares expira em
 * silêncio, sem nenhum hook que a renove.
 *
 * Logo e brasão de prefeitura são informação pública por natureza (a RPC
 * `get_tenant_branding` já tem grant para `anon`), então não há o que
 * proteger. Um bucket público separado deixa a regra do `fotos` dizível numa
 * frase: nada no `fotos` é público, nunca.
 *
 * A ESCRITA continua restrita: a policy `branding_write` só aceita gravação de
 * `authenticated` na pasta `<tenant_id>/` do próprio tenant. Por isso o path
 * começa com o tenant e não pode ser montado pelo cliente com outro id — a
 * policy rejeitaria.
 */

const BUCKET = 'branding';

/** Id de arquivo não enumerável — timestamp em ms deixa adivinhar os vizinhos. */
function randomId(): string {
    return typeof crypto?.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Envia uma imagem de marca e devolve a **URL pública** do bucket `branding`.
 *
 * O path é `<tenantId>/<kind>-<id aleatório>.<ext>`, sem o prefixo
 * `tenant/` — este bucket é escopado por pasta de tenant na raiz, e o
 * `uploadFoto` (que prefixa `tenant/`) NÃO serve aqui: o arquivo cairia em
 * `tenant/<id>/branding/…` dentro do `fotos`, isto é, inalcançável antes do
 * login. Era exatamente assim que a logo sumiria da tela de login na primeira
 * troca de marca depois do fechamento do bucket.
 */
export async function uploadBranding(
    tenantId: string,
    kind: string,
    body: Blob | File,
    contentType: string,
    ext: string,
): Promise<{ path: string; publicUrl: string }> {
    if (!tenantId) throw new Error('Sem prefeitura definida para o upload da marca.');
    const path = `${tenantId}/${kind}-${randomId()}.${ext}`;

    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, body, { contentType, upsert: false });
    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { path, publicUrl: data.publicUrl };
}
