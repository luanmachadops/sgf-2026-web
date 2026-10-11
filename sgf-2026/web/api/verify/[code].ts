/**
 * GET /api/verify/:code — verificação PÚBLICA de autenticidade de relatório.
 *
 * Chama a RPC `verify_report` (SECURITY DEFINER, GRANT para anon) pelo REST do
 * Supabase com a chave anon. Devolve apenas os dados não pessoais que a própria
 * RPC já limita (órgão, tipo, título, período, hash e signatário).
 *
 * Proteções: o código é validado por regex antes de qualquer chamada; limite
 * simples por IP em memória (30 req/min) para dificultar varredura de códigos;
 * respostas sempre com `Cache-Control: no-store`.
 *
 * Chave usada: SUPABASE_ANON_KEY ou VITE_SUPABASE_ANON_KEY. Rota pública: nunca
 * usa a service role; sem chave anon configurada, responde 503.
 */

const CODE_PATTERN = /^[A-HJ-KM-NP-Z2-9]{12}$/;
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const MAX_TRACKED_IPS = 5000;
const UPSTREAM_TIMEOUT_MS = 8000;

const hits = new Map<string, { count: number; resetAt: number }>();

interface ApiRequest {
    method?: string;
    ip?: string;
    query?: Record<string, string | string[] | undefined>;
    headers?: Record<string, string | string[] | undefined>;
    socket?: { remoteAddress?: string | null };
}

interface ApiResponse {
    status: (status: number) => ApiResponse;
    json: (value: unknown) => unknown;
    setHeader: (name: string, value: string) => void;
}

function clientKey(req: ApiRequest): string {
    if (req.ip) return req.ip;
    const forwarded = req.headers?.['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (typeof first === 'string' && first) return first.split(',').pop()?.trim() || 'unknown';
    return req.socket?.remoteAddress || 'unknown';
}

/** Retorna os segundos de espera quando o limite estourou; 0 quando liberado. */
function rateLimit(key: string, now = Date.now()): number {
    if (hits.size > MAX_TRACKED_IPS) {
        for (const [ip, entry] of hits) {
            if (entry.resetAt <= now) hits.delete(ip);
        }
        if (hits.size > MAX_TRACKED_IPS) hits.clear();
    }
    const current = hits.get(key);
    if (!current || current.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
        return 0;
    }
    current.count += 1;
    return current.count > MAX_REQUESTS ? Math.max(1, Math.ceil((current.resetAt - now) / 1000)) : 0;
}

function supabaseConfig(): { url: string; key: string } | null {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    return url && key ? { url: url.replace(/\/+$/, ''), key } : null;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ valid: false, message: 'Método não permitido.' });
    }

    const wait = rateLimit(clientKey(req));
    if (wait > 0) {
        res.setHeader('Retry-After', String(wait));
        return res.status(429).json({ valid: false, message: 'Muitas consultas. Tente novamente em instantes.' });
    }

    const raw = req.query?.code;
    const code = (Array.isArray(raw) ? raw[0] : raw ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!CODE_PATTERN.test(code)) {
        return res.status(400).json({ valid: false, message: 'Código de verificação inválido.' });
    }

    const config = supabaseConfig();
    if (!config) {
        return res.status(503).json({ valid: false, message: 'Verificação indisponível no momento.' });
    }

    try {
        const upstream = await fetch(`${config.url}/rest/v1/rpc/verify_report`, {
            method: 'POST',
            headers: {
                apikey: config.key,
                Authorization: `Bearer ${config.key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ p_code: code }),
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });
        if (!upstream.ok) {
            return res.status(502).json({ valid: false, message: 'Não foi possível consultar o registro agora.' });
        }
        const payload = (await upstream.json()) as Record<string, unknown> | null;
        return res.status(200).json(payload && typeof payload === 'object' ? payload : { valid: false });
    } catch {
        return res.status(502).json({ valid: false, message: 'Não foi possível consultar o registro agora.' });
    }
}
