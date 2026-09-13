import { getCaller } from '../_lib/caller.js';
import {
    assertCanManagePartners, createPartnerAccess, getPartnerAccess,
    resetPartnerPassword, setPartnerBlocked, type PartnerType, type PartnerAccessPayload,
} from '../_lib/partner-access.js';
import { checkRateLimit, getClientIp, logRateLimitBlocked, sendRateLimited } from '../_lib/rate-limit.js';

interface ApiRequest {
    method?: string;
    query: Record<string, string | string[] | undefined>;
    body?: unknown;
    headers?: Record<string, string | string[] | undefined>;
    get?: (name: string) => string | string[] | undefined | null;
    socket?: { remoteAddress?: string | null };
    connection?: { remoteAddress?: string | null };
}

interface ApiResponse {
    setHeader: (name: string, value: string) => void;
    status: (code: number) => { json: (body: unknown) => unknown };
}

function sendJson(res: ApiResponse, status: number, body: unknown) {
    res.status(status).json(body);
}

function parseBody(req: ApiRequest): Record<string, unknown> {
    if (typeof req.body === 'string') return JSON.parse(req.body) as Record<string, unknown>;
    return (req.body as Record<string, unknown>) ?? {};
}

// `reset` é o pior caso do achado (laço de resets gera custo de faturamento
// sem freio) — limite mais apertado que as demais ações desta rota.
const WINDOW_SECONDS = 60;
const MAX_HITS_BY_ACTION: Record<string, number> = {
    reset: 10,
    create: 10,
    block: 20,
    unblock: 20,
};
const DEFAULT_MAX_HITS = 10;

/**
 * Acesso de parceiro (posto / oficina). Uma rota só, com `action` no corpo:
 * a Vercel cobra por função serverless, e são todas variações da mesma
 * operação sobre o mesmo recurso.
 *
 *   GET  ?partnerType=posto&partnerId=…      → consulta o acesso
 *   POST { action: 'create'  | 'reset' | 'block' | 'unblock', … }
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
    try {
        res.setHeader('Cache-Control', 'no-store');
        const caller = await getCaller(req);
        assertCanManagePartners(caller);

        if (req.method === 'GET') {
            const partnerType = req.query.partnerType as PartnerType;
            const partnerId = req.query.partnerId as string;
            if (!partnerId) throw Object.assign(new Error('partnerId é obrigatório'), { status: 400 });
            return sendJson(res, 200, await getPartnerAccess(caller, partnerType, partnerId));
        }

        if (req.method !== 'POST') {
            res.setHeader('Allow', 'GET, POST');
            return sendJson(res, 405, { message: 'Method not allowed' });
        }

        const body = parseBody(req);
        const { action, partnerType, partnerId } = body as {
            action?: string; partnerType: PartnerType; partnerId: string;
        };
        if (!partnerId) throw Object.assign(new Error('partnerId é obrigatório'), { status: 400 });

        const ip = getClientIp(req);
        const maxHits = MAX_HITS_BY_ACTION[action ?? ''] ?? DEFAULT_MAX_HITS;
        const check = await checkRateLimit(`partners-${action}`, caller.id, ip, WINDOW_SECONDS, maxHits);
        if (!check.allowed) {
            await logRateLimitBlocked(caller.id, `Limite de ação '${action}' sobre acesso de parceiro atingido (${check.currentCount} chamadas/min), IP ${ip}.`);
            return sendRateLimited(res, check, 'Muitas requisições em pouco tempo. Aguarde e tente novamente.');
        }

        switch (action) {
            case 'create':
                return sendJson(res, 201, await createPartnerAccess(caller, body as unknown as PartnerAccessPayload));
            case 'reset':
                return sendJson(res, 200, await resetPartnerPassword(caller, partnerType, partnerId));
            case 'block':
                return sendJson(res, 200, await setPartnerBlocked(caller, partnerType, partnerId, true));
            case 'unblock':
                return sendJson(res, 200, await setPartnerBlocked(caller, partnerType, partnerId, false));
            default:
                throw Object.assign(new Error('Ação inválida'), { status: 400 });
        }
    } catch (error) {
        const status = typeof error === 'object' && error !== null && 'status' in error
            && typeof (error as { status?: unknown }).status === 'number'
            ? (error as { status: number }).status
            : 400;
        const message = error instanceof Error ? error.message : 'Erro ao gerenciar acesso do parceiro';
        return sendJson(res, status, { message });
    }
}
