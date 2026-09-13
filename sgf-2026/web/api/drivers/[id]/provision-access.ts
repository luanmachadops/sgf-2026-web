import { provisionDriverAccess, type DriverAccessPayload } from '../../_lib/driver-access.js';
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
        const check = await checkRateLimit('drivers-provision-access', caller.id, ip, WINDOW_SECONDS, MAX_HITS);
        if (!check.allowed) {
            await logRateLimitBlocked(caller.id, `Limite de provisionamento de acesso atingido (${check.currentCount} chamadas/min), IP ${ip}.`);
            return sendRateLimited(res, check, 'Muitas operações em pouco tempo. Aguarde e tente novamente.');
        }

        const driver = await provisionDriverAccess(driverId, { ...parseBody(req), actorId: caller.id } as DriverAccessPayload);
        return sendJson(res, 200, driver);
    } catch (error) {
        const status = typeof error === 'object' && error !== null && 'status' in error
            && typeof (error as { status?: unknown }).status === 'number'
            ? (error as { status: number }).status
            : 400;
        const message = error instanceof Error ? error.message : 'Erro ao provisionar acesso';
        return sendJson(res, status, { message });
    }
}
