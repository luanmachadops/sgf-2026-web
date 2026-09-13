import { preRegisterDriver, preRegisterDriversBulk, type PreRegisterDriverPayload } from '../_lib/driver-access.js';
import { getCaller, assertCanManageDrivers, resolveScopedDepartment } from '../_lib/caller.js';
import { checkRateLimit, checkRateLimitByKey, getClientIp, logRateLimitBlocked, sendRateLimited } from '../_lib/rate-limit.js';

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

const MAX_BULK_DRIVERS = 200;

// Freio por chamador+IP: no máximo 5 POSTs de pré-cadastro por minuto,
// venha ele único ou em lote. Cobre o pior caso do achado (laço de POSTs).
const CALLER_WINDOW_SECONDS = 60;
const CALLER_MAX_HITS = 5;

// Teto diário de motoristas pré-cadastrados por prefeitura, independente de
// quantos POSTs isso levou. Conservador de propósito: soma o tamanho do lote
// PEDIDO (não só o efetivamente criado) antes de processar, então uma
// importação com CPFs duplicados "gasta" cota mesmo quando falha — prefere
// subcontar capacidade a permitir estouro por retries em rajada.
const TENANT_DAILY_WINDOW_SECONDS = 24 * 60 * 60;
const TENANT_DAILY_MAX_PREREGISTERED = 500;

export default async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return sendJson(res, 405, { message: 'Method not allowed' });
    }

    try {
        const caller = await getCaller(req);
        assertCanManageDrivers(caller);
        const ip = getClientIp(req);

        const callerCheck = await checkRateLimit(
            'drivers-pre-register', caller.id, ip, CALLER_WINDOW_SECONDS, CALLER_MAX_HITS,
        );
        if (!callerCheck.allowed) {
            await logRateLimitBlocked(caller.id, `Limite de pré-cadastros por minuto atingido (${callerCheck.currentCount} chamadas), IP ${ip}.`);
            return sendRateLimited(res, callerCheck, 'Muitas requisições de pré-cadastro em pouco tempo. Aguarde e tente novamente.');
        }

        const body = parseBody(req);

        // Import em lote: { drivers: [...] }
        if (Array.isArray(body?.drivers)) {
            if (body.drivers.length > MAX_BULK_DRIVERS) {
                return sendJson(res, 400, {
                    message: `Máximo de ${MAX_BULK_DRIVERS} motoristas por importação em lote. Envie em requisições menores.`,
                });
            }

            const dayKey = new Date().toISOString().slice(0, 10);
            const tenantCheck = await checkRateLimitByKey(
                `drivers-pre-register-daily:${caller.tenantId}:${dayKey}`,
                TENANT_DAILY_WINDOW_SECONDS, TENANT_DAILY_MAX_PREREGISTERED, body.drivers.length,
            );
            if (!tenantCheck.allowed) {
                await logRateLimitBlocked(caller.id, `Teto diário de pré-cadastros da prefeitura atingido (${tenantCheck.currentCount}/${TENANT_DAILY_MAX_PREREGISTERED} hoje).`);
                return sendRateLimited(res, tenantCheck, `Teto diário de pré-cadastros desta prefeitura atingido. Tente novamente amanhã ou fale com o suporte.`);
            }

            const rows = (body.drivers as Record<string, unknown>[]).map((r) => ({
                ...r,
                departmentId: resolveScopedDepartment(caller, r?.departmentId as string | null | undefined),
                tenantId: caller.tenantId,
                actorId: caller.id,
            })) as PreRegisterDriverPayload[];
            const result = await preRegisterDriversBulk(rows);
            return sendJson(res, 200, result);
        }

        const dayKey = new Date().toISOString().slice(0, 10);
        const tenantCheck = await checkRateLimitByKey(
            `drivers-pre-register-daily:${caller.tenantId}:${dayKey}`,
            TENANT_DAILY_WINDOW_SECONDS, TENANT_DAILY_MAX_PREREGISTERED, 1,
        );
        if (!tenantCheck.allowed) {
            await logRateLimitBlocked(caller.id, `Teto diário de pré-cadastros da prefeitura atingido (${tenantCheck.currentCount}/${TENANT_DAILY_MAX_PREREGISTERED} hoje).`);
            return sendRateLimited(res, tenantCheck, `Teto diário de pré-cadastros desta prefeitura atingido. Tente novamente amanhã ou fale com o suporte.`);
        }

        body.departmentId = resolveScopedDepartment(caller, body.departmentId as string | null | undefined);
        body.tenantId = caller.tenantId;
        body.actorId = caller.id;
        const driver = await preRegisterDriver(body as unknown as PreRegisterDriverPayload);
        return sendJson(res, 201, driver);
    } catch (error) {
        console.error('[API pre-register error]', error);
        const status = typeof error === 'object' && error !== null && 'status' in error
            && typeof (error as { status?: unknown }).status === 'number'
            ? (error as { status: number }).status
            : 500;
        const message = error instanceof Error ? error.message : 'Erro no pré-cadastro';
        return sendJson(res, status, { message, error: message });
    }
}
