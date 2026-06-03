import { preRegisterDriver, preRegisterDriversBulk } from '../_lib/driver-access.js';
import { getCaller, assertCanManageDrivers, resolveScopedDepartment } from '../_lib/caller.js';

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

        const body = parseBody(req);

        // Import em lote: { drivers: [...] }
        if (Array.isArray(body?.drivers)) {
            const rows = body.drivers.map((r: any) => ({
                ...r,
                departmentId: resolveScopedDepartment(caller, r?.departmentId),
            }));
            const result = await preRegisterDriversBulk(rows);
            return sendJson(res, 200, result);
        }

        body.departmentId = resolveScopedDepartment(caller, body.departmentId);
        const driver = await preRegisterDriver(body);
        return sendJson(res, 201, driver);
    } catch (error) {
        const status = (error as any)?.status ?? 400;
        const message = error instanceof Error ? error.message : 'Erro no pré-cadastro';
        return sendJson(res, status, { message });
    }
}
