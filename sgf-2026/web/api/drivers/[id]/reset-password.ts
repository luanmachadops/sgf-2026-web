import { resetDriverPassword, type DriverAccessPayload } from '../../_lib/driver-access.js';
import { getCaller, assertCanManageDrivers, assertCanActOnDriver } from '../../_lib/caller.js';
import { checkRateLimit, getClientIp, logRateLimitBlocked, sendRateLimited } from '../../_lib/rate-limit.js';

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
    if (typeof req.body === 'string') {
        return JSON.parse(req.body) as Record<string, unknown>;
    }

    return (req.body as Record<string, unknown>) ?? {};
}

// Sem isto, um token de gestor válido (ou vazado) troca a senha de qualquer
// número de motoristas em laço, sem freio nem alerta.
const WINDOW_SECONDS = 60;
const MAX_HITS = 10;

export default async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return sendJson(res, 405, { message: 'Method not allowed' });
    }

    try {
        const caller = await getCaller(req);
        assertCanManageDrivers(caller);
        const driverId = req.query.id as string;
        await assertCanActOnDriver(caller, driverId);

        const ip = getClientIp(req);
        const check = await checkRateLimit('drivers-reset-password', caller.id, ip, WINDOW_SECONDS, MAX_HITS);
        if (!check.allowed) {
            await logRateLimitBlocked(caller.id, `Limite de reset de senha de motorista atingido (${check.currentCount} chamadas/min), IP ${ip}.`);
            return sendRateLimited(res, check, 'Muitos resets de senha em pouco tempo. Aguarde e tente novamente.');
        }

        const result = await resetDriverPassword(driverId, { ...parseBody(req), actorId: caller.id } as DriverAccessPayload);
        return sendJson(res, 200, result);
    } catch (error) {
        const status = typeof error === 'object' && error !== null && 'status' in error
            && typeof (error as { status?: unknown }).status === 'number'
            ? (error as { status: number }).status
            : 400;
        const message = error instanceof Error ? error.message : 'Erro ao redefinir senha';
        return sendJson(res, status, { message });
    }
}
