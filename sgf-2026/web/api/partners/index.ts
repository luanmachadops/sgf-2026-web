import { getCaller } from '../_lib/caller.js';
import {
    assertCanManagePartners, createPartnerAccess, getPartnerAccess,
    resetPartnerPassword, setPartnerBlocked, type PartnerType,
} from '../_lib/partner-access.js';

function sendJson(res: any, status: number, body: unknown) {
    res.status(status).json(body);
}

function parseBody(req: any) {
    if (typeof req.body === 'string') return JSON.parse(req.body);
    return req.body ?? {};
}

/**
 * Acesso de parceiro (posto / oficina). Uma rota só, com `action` no corpo:
 * a Vercel cobra por função serverless, e são todas variações da mesma
 * operação sobre o mesmo recurso.
 *
 *   GET  ?partnerType=posto&partnerId=…      → consulta o acesso
 *   POST { action: 'create'  | 'reset' | 'block' | 'unblock', … }
 */
export default async function handler(req: any, res: any) {
    try {
        const caller = await getCaller(req);
        assertCanManagePartners(caller);

        if (req.method === 'GET') {
            const partnerType = req.query.partnerType as PartnerType;
            const partnerId = req.query.partnerId as string;
            if (!partnerId) throw Object.assign(new Error('partnerId é obrigatório'), { status: 400 });
            return sendJson(res, 200, await getPartnerAccess(caller, partnerType, partnerId));
        }

        if (req.method !== 'POST') {
            res.setHeader('Allow', 'GET, POST');
            return sendJson(res, 405, { message: 'Method not allowed' });
        }

        const body = parseBody(req);
        const { action, partnerType, partnerId } = body as {
            action?: string; partnerType: PartnerType; partnerId: string;
        };
        if (!partnerId) throw Object.assign(new Error('partnerId é obrigatório'), { status: 400 });

        switch (action) {
            case 'create':
                return sendJson(res, 201, await createPartnerAccess(caller, body));
            case 'reset':
                return sendJson(res, 200, await resetPartnerPassword(caller, partnerType, partnerId));
            case 'block':
                return sendJson(res, 200, await setPartnerBlocked(caller, partnerType, partnerId, true));
            case 'unblock':
                return sendJson(res, 200, await setPartnerBlocked(caller, partnerType, partnerId, false));
            default:
                throw Object.assign(new Error('Ação inválida'), { status: 400 });
        }
    } catch (error) {
        const status = (error as any)?.status ?? 400;
        const message = error instanceof Error ? error.message : 'Erro ao gerenciar acesso do parceiro';
        return sendJson(res, status, { message });
    }
}
