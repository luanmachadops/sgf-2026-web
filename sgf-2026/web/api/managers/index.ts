import { createManager } from '../_lib/manager-access.js';
import { getCaller } from '../_lib/caller.js';
import { checkRateLimit, getClientIp, logRateLimitBlocked, sendRateLimited } from '../_lib/rate-limit.js';

function sendJson(res: any, status: number, body: unknown) {
    res.status(status).json(body);
}

function parseBody(req: any) {
    if (typeof req.body === 'string') {
        return JSON.parse(req.body);
    }
    return req.body ?? {};
}

const WINDOW_SECONDS = 60;
const MAX_HITS = 10;

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return sendJson(res, 405, { message: 'Method not allowed' });
    }

    try {
        // Apenas o ADMIN cria usuários do painel (secretários/gestores).
        const caller = await getCaller(req);
        if (!caller) throw Object.assign(new Error('Não autenticado'), { status: 401 });
        if (caller.role !== 'admin') throw Object.assign(new Error('Apenas o administrador pode criar secretários'), { status: 403 });

        const ip = getClientIp(req);
        const check = await checkRateLimit('managers-create', caller.id, ip, WINDOW_SECONDS, MAX_HITS);
        if (!check.allowed) {
            await logRateLimitBlocked(caller.id, `Limite de criação de gestores/secretários atingido (${check.currentCount} chamadas/min), IP ${ip}.`);
            return sendRateLimited(res, check, 'Muitas requisições em pouco tempo. Aguarde e tente novamente.');
        }

        const manager = await createManager({ ...parseBody(req), tenantId: caller.tenantId, actorId: caller.id });
        return sendJson(res, 201, manager);
    } catch (error) {
        const status = (error as any)?.status ?? 400;
        const message = error instanceof Error ? error.message : 'Erro ao criar acesso';
        return sendJson(res, status, { message });
    }
}
