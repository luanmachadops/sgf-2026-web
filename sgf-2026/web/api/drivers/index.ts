import { createDriver, type CreateDriverPayload } from '../_lib/driver-access.js';
import { getCaller, assertCanManageDrivers, resolveScopedDepartment } from '../_lib/caller.js';
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
        const caller = await getCaller(req);
        assertCanManageDrivers(caller);

        const ip = getClientIp(req);
        const check = await checkRateLimit('drivers-create', caller.id, ip, WINDOW_SECONDS, MAX_HITS);
        if (!check.allowed) {
            await logRateLimitBlocked(caller.id, `Limite de criação de motoristas atingido (${check.currentCount} chamadas/min), IP ${ip}.`);
            return sendRateLimited(res, check, 'Muitas requisições em pouco tempo. Aguarde e tente novamente.');
        }

        const body = parseBody(req);
        body.departmentId = resolveScopedDepartment(caller, body.departmentId as string | null | undefined);
        body.tenantId = caller.tenantId;
        body.actorId = caller.id;

        const driver = await createDriver(body as unknown as CreateDriverPayload);
        return sendJson(res, 201, driver);
    } catch (error) {
        const status = typeof error === 'object' && error !== null && 'status' in error
            && typeof (error as { status?: unknown }).status === 'number'
            ? (error as { status: number }).status
            : 400;
        const message = error instanceof Error ? error.message : 'Erro ao criar motorista';
        return sendJson(res, status, { message });
    }
}
