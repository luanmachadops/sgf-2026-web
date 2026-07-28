import { getSupabaseAdmin } from './supabase-admin.js';

/**
 * Rate limit para rotas de escrita, apoiado em Postgres.
 *
 * POR QUÊ POSTGRES (E NÃO MEMÓRIA DE PROCESSO / REDIS-UPSTASH-VERCEL KV):
 * Estas rotas rodam como funções serverless (Vercel) sem estado compartilhado
 * entre invocações — um Map/contador em memória não sobreviveria de uma
 * chamada para a próxima. O projeto já paga por um Postgres (Supabase) e já
 * usa o padrão de RPC SECURITY DEFINER chamado pelo service_role para gravar
 * fatos que não passam por trigger de tabela (ver `log_manual_activity` em
 * `driver-access.ts`). Reaproveitar essa infra evita introduzir Upstash ou
 * Vercel KV — serviços pagos que exigiriam contratação nova só para isto.
 *
 * ISTO SÓ FUNCIONA DE VERDADE DEPOIS DE APLICAR A MIGRATION:
 * A função `rl_check_and_hit` e a tabela `api_rate_limits` estão em
 * `supabase/migrations/20260728220000_api_rate_limits.sql`, marcada como
 * NÃO APLICADA (por instrução explícita de não mexer em banco/deploy nesta
 * tarefa). Até alguém revisar e aplicar essa migration, o RPC abaixo falha
 * com "function does not exist" — e `checkRateLimit` trata isso como
 * fail-open (permite a operação, só loga o erro), para não derrubar rotas em
 * produção por causa de uma peça de infraestrutura ainda não implantada.
 */

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

/** Checa e incrementa um contador de janela deslizante por chave livre. */
export async function checkRateLimitByKey(
    key: string,
    windowSeconds: number,
    maxHits: number,
    increment = 1,
): Promise<RateLimitCheck> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc('rl_check_and_hit', {
        p_key: key,
        p_window_seconds: windowSeconds,
        p_max_hits: maxHits,
        p_increment: increment,
    });

    if (error) {
        // Infra de rate limit indisponível (ex.: migration ainda não aplicada)
        // não pode travar a operação real — mas fica visível no log do
        // servidor para investigação. Fail-open é intencional aqui.
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

/** Checa e incrementa por (ação, chamador, IP) — o caso comum de rota de escrita. */
export async function checkRateLimit(
    action: string,
    callerId: string | null,
    ip: string,
    windowSeconds: number,
    maxHits: number,
    increment = 1,
): Promise<RateLimitCheck> {
    const key = `${action}:${callerId ?? 'anon'}:${ip}`;
    return checkRateLimitByKey(key, windowSeconds, maxHits, increment);
}

/**
 * Registra na trilha de auditoria que um limite foi atingido — sinal para
 * investigação, não só um 429 silencioso que ninguém nunca vai ler.
 * Reaproveita o mesmo RPC que reset/provisionamento de senha já usa para
 * atos que não passam por trigger de tabela.
 */
export async function logRateLimitBlocked(actorId: string | null, note: string): Promise<void> {
    if (!actorId) return;
    const admin = getSupabaseAdmin();
    const { error } = await admin.rpc('log_manual_activity', {
        p_actor_id: actorId,
        p_entity_type: 'rate_limit',
        p_entity_id: actorId,
        p_action: 'block_access',
        p_note: note,
    });
    if (error) console.error('[rate-limit] log_manual_activity falhou:', error.message);
}

/** Responde 429 com Retry-After, no formato usado por todas as rotas daqui. */
export function sendRateLimited(res: any, check: RateLimitCheck, message: string): void {
    res.setHeader('Retry-After', String(Math.max(1, check.retryAfterSeconds)));
    res.status(429).json({ message, retryAfterSeconds: check.retryAfterSeconds });
}
