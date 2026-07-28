import { createClient } from '@supabase/supabase-js';

/**
 * Rate limit para as rotas de escrita do painel superadmin, apoiado em
 * Postgres. Espelha `web/api/_lib/rate-limit.ts` — duplicado de propósito
 * (ver comentário em `admin/api/_lib/password-policy.ts` sobre por que
 * `admin/` e `web/` não compartilham arquivo: são dois deployables Vercel
 * separados).
 *
 * POR QUÊ POSTGRES: mesmo raciocínio do lado web — funções serverless sem
 * estado compartilhado entre invocações, e o projeto já tem um Postgres
 * (Supabase) com o padrão de RPC SECURITY DEFINER via service_role. Evita
 * introduzir Upstash/Vercel KV só para isto.
 *
 * SÓ FUNCIONA DE VERDADE APÓS APLICAR A MIGRATION:
 * `supabase/migrations/20260728220000_api_rate_limits.sql` cria a função
 * `rl_check_and_hit` e a tabela `api_rate_limits`, e está marcada como NÃO
 * APLICADA (instrução explícita desta tarefa: nada de banco/deploy). Até ser
 * revisada e aplicada, o RPC abaixo falha e `checkRateLimit` faz fail-open
 * (permite a operação, só loga o erro) — não derruba o painel por causa de
 * infraestrutura ainda não implantada.
 */

function getAdmin() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw Object.assign(new Error('SUPABASE_URL/SERVICE_ROLE_KEY ausentes'), { status: 500 });
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export interface RateLimitCheck {
    allowed: boolean;
    currentCount: number;
    retryAfterSeconds: number;
}

/** IP do chamador. A Vercel preenche `x-forwarded-for`; o primeiro valor é o cliente. */
export function getClientIp(req: any): string {
    const xff = req.headers?.['x-forwarded-for'] ?? req.headers?.['X-Forwarded-For'];
    const first = Array.isArray(xff) ? xff[0] : xff;
    if (typeof first === 'string' && first.length > 0) {
        return first.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

/** Checa e incrementa um contador de janela deslizante por (ação, chamador, IP). */
export async function checkRateLimit(
    action: string,
    callerId: string | null,
    ip: string,
    windowSeconds: number,
    maxHits: number,
    increment = 1,
): Promise<RateLimitCheck> {
    const key = `${action}:${callerId ?? 'anon'}:${ip}`;
    const admin = getAdmin();
    const { data, error } = await admin.rpc('rl_check_and_hit', {
        p_key: key,
        p_window_seconds: windowSeconds,
        p_max_hits: maxHits,
        p_increment: increment,
    });

    if (error) {
        console.error('[rate-limit] rl_check_and_hit falhou, permitindo por padrão:', error.message);
        return { allowed: true, currentCount: 0, retryAfterSeconds: 0 };
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
        allowed: Boolean(row?.allowed ?? true),
        currentCount: Number(row?.current_count ?? 0),
        retryAfterSeconds: Number(row?.retry_after_seconds ?? 0),
    };
}

/** Registra o bloqueio na trilha de auditoria — sinal para investigação. */
export async function logRateLimitBlocked(actorId: string | null, note: string): Promise<void> {
    if (!actorId) return;
    const admin = getAdmin();
    const { error } = await admin.rpc('log_manual_activity', {
        p_actor_id: actorId,
        p_entity_type: 'rate_limit',
        p_entity_id: actorId,
        p_action: 'block_access',
        p_note: note,
    });
    if (error) console.error('[rate-limit] log_manual_activity falhou:', error.message);
}

/** Responde 429 com Retry-After. */
export function sendRateLimited(res: any, check: RateLimitCheck, message: string): void {
    res.setHeader('Retry-After', String(Math.max(1, check.retryAfterSeconds)));
    res.status(429).json({ message, retryAfterSeconds: check.retryAfterSeconds });
}
