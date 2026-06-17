import { provisionDriverAccess } from '../../_lib/driver-access.js';
import { getCaller, assertCanManageDrivers, assertCanActOnDriver } from '../../_lib/caller.js';

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
        const caller = await getCaller(req);
        assertCanManageDrivers(caller);
        await assertCanActOnDriver(caller, req.query.id);

        const driver = await provisionDriverAccess(req.query.id, parseBody(req));
        return sendJson(res, 200, driver);
    } catch (error) {
        const status = (error as any)?.status ?? 400;
        const message = error instanceof Error ? error.message : 'Erro ao provisionar acesso';
        return sendJson(res, status, { message });
    }
}
