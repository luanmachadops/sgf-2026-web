import { createManager } from '../_lib/manager-access.js';
import { getCaller } from '../_lib/caller.js';

function sendJson(res: any, status: number, body: unknown) {
    res.status(status).json(body);
}

function parseBody(req: any) {
    if (typeof req.body === 'string') {
        return JSON.parse(req.body);
    }
    return req.body ?? {};
}

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

        const manager = await createManager({ ...parseBody(req), tenantId: caller.tenantId });
        return sendJson(res, 201, manager);
    } catch (error) {
        const status = (error as any)?.status ?? 400;
        const message = error instanceof Error ? error.message : 'Erro ao criar acesso';
        return sendJson(res, status, { message });
    }
}
