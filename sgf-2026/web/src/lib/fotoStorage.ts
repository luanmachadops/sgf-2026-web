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

/**
 * Validade da URL assinada no painel web.
 *
 * 1 h. O limite inferior é "quanto tempo uma tela fica aberta com a mesma
 * imagem montada": o painel é usado em sessões de trabalho, e telas como o
 * mapa ao vivo ou uma OS aberta ao lado do telefone ficam horas sem remontar.
 * Um TTL de minutos quebraria essas telas silenciosamente (a imagem some no
 * meio do expediente e ninguém liga o fato à migração). O limite superior é o
 * motivo de fechar o bucket: a URL não pode virar um link permanente
 * compartilhável. 1 h cobre a sessão de trabalho típica e ainda é curto o
 * bastante para que um link vazado não seja um link eterno.
 */
const TTL_WEB = 60 * 60;

/** Margem de segurança: reusa do cache só enquanto sobrar mais que isto. */
const TTL_SKEW = 5 * 60;

let cachedTenantId: string | null = null;

/** Memo por path → URL assinada, para não reassinar a mesma foto a cada render. */
const signedCache = new Map<string, { url: string; exp: number }>();

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
    signedCache.clear();
}

/** Monta o caminho com o tenant na frente: `tenant/{id}/{suffix}`. */
export function tenantFotoPath(tenantId: string, suffix: string): string {
    return `tenant/${tenantId}/${suffix.replace(/^\/+/, '')}`;
}

/**
 * Envia para o bucket `fotos` sob o caminho da prefeitura.
 *
 * `publicUrl` deixou de ser uma URL pública: o bucket vai fechar, e
 * `getPublicUrl` num bucket privado devolve uma URL que dá 400. Agora é uma
 * URL **assinada**, útil para o preview imediato depois do upload. O nome do
 * campo foi mantido para não tocar nos ~12 chamadores; quem persiste esse
 * valor está coberto pelo `stripFotoUrls` da camada de API, que grava o path.
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

    return { path, publicUrl: (await resolveFotoUrl(path)) ?? path };
}

// ============================================================================
// LEITURA — resolver central
// ============================================================================

/**
 * Reconhece qualquer forma que um valor do bucket `fotos` já teve no banco:
 * URL pública (`/object/public/fotos/…`), URL assinada (`/object/sign/fotos/…`),
 * URL de transformação (`/render/image/{public,sign}/fotos/…`) ou path puro
 * (`tenant/<id>/…`). O grupo 1 é o path dentro do bucket.
 */
const FOTO_URL_RE = /\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/fotos\/([^?#]+)/i;

/**
 * Extrai o path dentro do bucket `fotos`.
 *
 * Devolve `null` quando o valor é uma URL http que **não** aponta para o
 * `fotos` — logo/brasão vivem no bucket público `branding` e precisam passar
 * intactos, senão a assinatura os quebraria.
 */
export function fotoPath(value: string | null | undefined): string | null {
    if (!value) return null;
    const v = value.trim();
    if (!v) return null;
    if (/^(https?:|data:|blob:)/i.test(v)) {
        const m = v.match(FOTO_URL_RE);
        return m ? decodeURIComponent(m[1]) : null;
    }
    return v.replace(/^\/+/, '');
}

/**
 * Um valor "de foto" reconhecível sem saber de que coluna veio: ou é uma URL
 * do bucket `fotos`, ou é um path sob `tenant/`. O prefixo `tenant/` só existe
 * no `fotos` (o `documentos` usa `repair_shops/…` e `driver-registration/…`),
 * então não há colisão — é o que permite resolver por valor, e não por nome de
 * campo, e assim cobrir `photo_url`, `photo`, `driverPhoto`, `attachment_path`
 * e o que mais vier sem manter uma lista de nomes.
 */
function looksLikeFoto(v: string): boolean {
    if (v.startsWith('tenant/')) return true;
    return /^https?:/i.test(v) && FOTO_URL_RE.test(v);
}

function cachedSignedUrl(path: string): string | null {
    const hit = signedCache.get(path);
    if (hit && hit.exp - TTL_SKEW > Date.now() / 1000) return hit.url;
    if (hit) signedCache.delete(path);
    return null;
}

function rememberSignedUrl(path: string, url: string, ttl: number): void {
    signedCache.set(path, { url, exp: Date.now() / 1000 + ttl });
}

/**
 * Aceita URL antiga (pública/assinada) OU path puro e devolve uma URL
 * utilizável. URL de outro bucket (branding) volta como está.
 */
export async function resolveFotoUrl(
    value: string | null | undefined,
    ttl = TTL_WEB,
): Promise<string | null> {
    if (!value) return null;
    const path = fotoPath(value);
    if (!path) return value; // não é do `fotos` — branding, data:, externo
    const cached = cachedSignedUrl(path);
    if (cached) return cached;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, ttl);
    if (error || !data?.signedUrl) return null;
    rememberSignedUrl(path, data.signedUrl, ttl);
    return data.signedUrl;
}

/**
 * Versão em lote. Uma chamada de rede para N paths — obrigatório nas
 * listagens: a tela de veículos renderiza ~94 cards, e uma assinatura por card
 * é uma tela travada, não só uma lentidão.
 */
export async function resolveFotoUrls(
    values: (string | null | undefined)[],
    ttl = TTL_WEB,
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const pending: string[] = [];

    for (const v of values) {
        const path = fotoPath(v);
        if (!path || out.has(path)) continue;
        const cached = cachedSignedUrl(path);
        if (cached) out.set(path, cached);
        else if (!pending.includes(path)) pending.push(path);
    }
    if (pending.length === 0) return out;

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(pending, ttl);
    if (error || !data) return out;
    for (const item of data) {
        // `createSignedUrls` reporta erro por item (objeto apagado, por
        // exemplo) sem derrubar o lote inteiro. Item com erro simplesmente
        // fica de fora e o chamador mantém o valor original.
        if (item.error || !item.signedUrl || !item.path) continue;
        rememberSignedUrl(item.path, item.signedUrl, ttl);
        out.set(item.path, item.signedUrl);
    }
    return out;
}

const MAX_DEPTH = 8;

function collectFotoValues(node: unknown, acc: Set<string>, seen: WeakSet<object>, depth: number): void {
    if (depth > MAX_DEPTH || node == null) return;
    if (typeof node === 'string') {
        if (looksLikeFoto(node)) acc.add(node);
        return;
    }
    if (typeof node !== 'object') return;
    if (seen.has(node as object)) return;
    seen.add(node as object);
    if (Array.isArray(node)) {
        for (const item of node) collectFotoValues(item, acc, seen, depth + 1);
        return;
    }
    const proto = Object.getPrototypeOf(node);
    if (proto !== Object.prototype && proto !== null) return; // Date, File, canal realtime…
    for (const v of Object.values(node as Record<string, unknown>)) {
        collectFotoValues(v, acc, seen, depth + 1);
    }
}

function applySigned(node: unknown, urls: Map<string, string>, seen: WeakSet<object>, depth: number): void {
    if (depth > MAX_DEPTH || node == null || typeof node !== 'object') return;
    if (seen.has(node as object)) return;
    seen.add(node as object);
    const proto = Object.getPrototypeOf(node);
    if (!Array.isArray(node) && proto !== Object.prototype && proto !== null) return;
    const entries: [string | number, unknown][] = Array.isArray(node)
        ? node.map((v, i) => [i, v])
        : Object.entries(node as Record<string, unknown>);
    for (const [key, value] of entries) {
        if (typeof value === 'string') {
            if (!looksLikeFoto(value)) continue;
            const path = fotoPath(value);
            const signed = path ? urls.get(path) : undefined;
            if (signed) (node as Record<string | number, unknown>)[key] = signed;
        } else {
            applySigned(value, urls, seen, depth + 1);
        }
    }
}

/**
 * Assina, in place, todo valor de foto encontrado no resultado de uma consulta.
 *
 * É aplicado na camada de API (onde a linha é montada), então os ~33
 * componentes que leem `photo_url` continuam recebendo uma URL utilizável e
 * não mudam. Trabalha sobre linhas recém-buscadas, que ninguém mais referencia
 * — por isso pode mutar sem clonar.
 */
export async function signFotos<T>(value: T, ttl = TTL_WEB): Promise<T> {
    if (value == null || typeof value !== 'object') return value;
    const found = new Set<string>();
    collectFotoValues(value, found, new WeakSet(), 0);
    if (found.size === 0) return value;
    const urls = await resolveFotoUrls([...found], ttl);
    if (urls.size === 0) return value;
    applySigned(value, urls, new WeakSet(), 0);
    return value;
}

/**
 * Caminho inverso, para a escrita: troca qualquer URL do `fotos` pelo path.
 *
 * Sem isto, todo formulário que lê um registro e o salva de volta sem mexer na
 * foto (EditVehicleModal, EditDriverModal, os formulários de posto e oficina)
 * gravaria a URL **assinada** que acabou de receber — e a imagem morreria
 * quando o token expirasse. Clona só o que muda; se nada casar, devolve a
 * mesma referência (o payload costuma ser estado do React).
 */
export function stripFotoUrls<T>(value: T, depth = 0): T {
    if (depth > MAX_DEPTH || value == null) return value;
    if (typeof value === 'string') {
        if (!/^https?:/i.test(value)) return value;
        const path = fotoPath(value);
        return (path ?? value) as unknown as T;
    }
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) {
        let changed = false;
        const next = value.map((item) => {
            const s = stripFotoUrls(item, depth + 1);
            if (s !== item) changed = true;
            return s;
        });
        return (changed ? next : value) as unknown as T;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value; // File, Blob, Date…
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const s = stripFotoUrls(v, depth + 1);
        if (s !== v) changed = true;
        next[k] = s;
    }
    return (changed ? next : value) as unknown as T;
}

/**
 * Envelopa um objeto de API: normaliza os argumentos (escrita grava path) e
 * assina o resultado (leitura devolve URL utilizável). Um único ponto por
 * grupo de endpoints, em vez de um `await signFotos()` em cada método.
 */
export function withFotoUrls<T extends Record<string, unknown>>(api: T): T {
    const out: Record<string, unknown> = {};
    for (const [name, member] of Object.entries(api)) {
        if (typeof member !== 'function') {
            out[name] = member;
            continue;
        }
        const fn = member as (...args: unknown[]) => unknown;
        out[name] = async (...args: unknown[]) => {
            const result = await fn(...args.map((a) => stripFotoUrls(a)));
            return signFotos(result);
        };
    }
    return out as T;
}
