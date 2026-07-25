import { supabase } from '@/lib/supabase';

/**
 * Upload no bucket público `fotos`, sempre sob o caminho da prefeitura.
 *
 * POR QUE ISSO EXISTE
 * Os caminhos antigos (`drivers/…`, `vehicles/…`, `hodometro/…`) não têm o
 * tenant, então a policy de SELECT do bucket precisa ser ampla
 * (`bucket_id = 'fotos'`) — e com isso QUALQUER usuário autenticado, de
 * QUALQUER prefeitura, consegue listar todos os arquivos. Como o bucket é
 * público, listar equivale a acessar: fotos de motorista, hodômetro e
 * ocorrências de outros municípios ficam ao alcance.
 *
 * Com o tenant no caminho (`tenant/{tenant_id}/drivers/…`), a policy passa a
 * ser escopada como já é a do bucket `documentos`
 * (`(storage.foldername(name))[2] = get_user_tenant_id()`), e o vazamento
 * fecha. O portal de postos e oficinas depende disso: parceiro não pode
 * enxergar anexo de outra prefeitura.
 *
 * MIGRAÇÃO
 * Os ~120 objetos já existentes continuam nos caminhos antigos e seguem
 * servidos por URL pública (leitura de bucket público não passa por RLS).
 * O que eles perdem, depois que a policy restritiva entrar, é a possibilidade
 * de serem sobrescritos ou apagados pelo painel — na prática nenhuma, porque
 * toda substituição grava num caminho novo.
 */

const BUCKET = 'fotos';

let cachedTenantId: string | null = null;

/** Resolve o tenant do usuário logado (cacheado por sessão). */
async function getMyTenantId(): Promise<string> {
    if (cachedTenantId) return cachedTenantId;

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) throw new Error('Sessão expirada. Entre novamente para enviar arquivos.');

    const { data, error } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', uid)
        .maybeSingle();

    const tenantId = (data as { tenant_id?: string } | null)?.tenant_id;
    if (error || !tenantId) {
        throw new Error('Não foi possível identificar a prefeitura do seu acesso.');
    }

    cachedTenantId = tenantId;
    return tenantId;
}

/** Zera o cache — chamar no logout, senão o próximo login herda o tenant anterior. */
export function resetFotoStorageCache() {
    cachedTenantId = null;
}

/** Monta o caminho com o tenant na frente: `tenant/{id}/{suffix}`. */
export function tenantFotoPath(tenantId: string, suffix: string): string {
    return `tenant/${tenantId}/${suffix.replace(/^\/+/, '')}`;
}

/**
 * Envia para o bucket `fotos` sob o caminho da prefeitura e devolve a URL
 * pública. `suffix` é o caminho antigo (ex.: `drivers/abc-123.webp`).
 */
export async function uploadFoto(
    suffix: string,
    body: Blob | ArrayBuffer | File,
    contentType: string,
    opts?: { upsert?: boolean; tenantId?: string },
): Promise<{ path: string; publicUrl: string }> {
    const tenantId = opts?.tenantId ?? (await getMyTenantId());
    const path = tenantFotoPath(tenantId, suffix);

    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, body, { contentType, upsert: opts?.upsert ?? true });
    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { path, publicUrl: data.publicUrl };
}
