import { resetDriverPassword } from '../../_lib/driver-access.js';
import { getCaller, assertCanManageDrivers, assertCanActOnDriver } from '../../_lib/caller.js';
import { checkRateLimit, getClientIp, logRateLimitBlocked, sendRateLimited } from '../../_lib/rate-limit.js';

function sendJson(res: any, status: number, body: unknown) {
    res.status(status).json(body);
}

function parseBody(req: any) {
    if (typeof req.body === 'string') {
        return JSON.parse(req.body);
    }

    return req.body ?? {};
}

// Sem isto, um token de gestor válido (ou vazado) troca a senha de qualquer
// número de motoristas em laço, sem freio nem alerta.
const WINDOW_SECONDS = 60;
const MAX_HITS = 10;

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return sendJson(res, 405, { message: 'Method not allowed' });
    }

    try {
        const caller = await getCaller(req);
        assertCanManageDrivers(caller);
        await assertCanActOnDriver(caller, req.query.id);

        const ip = getClientIp(req);
        const check = await checkRateLimit('drivers-reset-password', caller.id, ip, WINDOW_SECONDS, MAX_HITS);
        if (!check.allowed) {
            await logRateLimitBlocked(caller.id, `Limite de reset de senha de motorista atingido (${check.currentCount} chamadas/min), IP ${ip}.`);
            return sendRateLimited(res, check, 'Muitos resets de senha em pouco tempo. Aguarde e tente novamente.');
        }

        const result = await resetDriverPassword(req.query.id, { ...parseBody(req), actorId: caller.id });
        return sendJson(res, 200, result);
    } catch (error) {
        const status = (error as any)?.status ?? 400;
        const message = error instanceof Error ? error.message : 'Erro ao redefinir senha';
        return sendJson(res, status, { message });
    }
}
