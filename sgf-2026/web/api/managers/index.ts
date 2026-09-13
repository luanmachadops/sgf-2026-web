import { createManager, type CreateManagerPayload } from '../_lib/manager-access.js';
import { getCaller } from '../_lib/caller.js';
import { checkRateLimit, getClientIp, logRateLimitBlocked, sendRateLimited } from '../_lib/rate-limit.js';

interface ApiRequest {
    method?: string;
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
    if (typeof req.body === 'string') {
        return JSON.parse(req.body) as Record<string, unknown>;
    }
    return (req.body as Record<string, unknown>) ?? {};
}

const WINDOW_SECONDS = 60;
const MAX_HITS = 10;

export default async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return sendJson(res, 405, { message: 'Method not allowed' });
    }

    try {
        // Administrador e gestor podem criar secretários da própria prefeitura.
        const caller = await getCaller(req);
        if (!caller) throw Object.assign(new Error('Não autenticado'), { status: 401 });
        if (!['admin', 'gestor'].includes(caller.role)) {
            throw Object.assign(new Error('Apenas administradores e gestores podem criar secretários'), { status: 403 });
        }

        const ip = getClientIp(req);
        const check = await checkRateLimit('managers-create', caller.id, ip, WINDOW_SECONDS, MAX_HITS);
        if (!check.allowed) {
            await logRateLimitBlocked(caller.id, `Limite de criação de gestores/secretários atingido (${check.currentCount} chamadas/min), IP ${ip}.`);
            return sendRateLimited(res, check, 'Muitas requisições em pouco tempo. Aguarde e tente novamente.');
        }

        const manager = await createManager({ ...parseBody(req), tenantId: caller.tenantId, actorId: caller.id } as CreateManagerPayload);
        return sendJson(res, 201, manager);
    } catch (error) {
        const status = typeof error === 'object' && error !== null && 'status' in error
            && typeof (error as { status?: unknown }).status === 'number'
            ? (error as { status: number }).status
            : 400;
        const message = error instanceof Error ? error.message : 'Erro ao criar acesso';
        return sendJson(res, status, { message });
    }
}
