import { createClient } from '@supabase/supabase-js';

function getAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw Object.assign(new Error('SUPABASE_URL/SERVICE_ROLE_KEY ausentes'), { status: 500 });
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function parseBody(req: any) {
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body ?? {};
}

async function assertSuperadmin(req: any, admin: ReturnType<typeof getAdmin>) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw Object.assign(new Error('Não autenticado'), { status: 401 });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Sessão inválida'), { status: 401 });
  const { data: profile } = await admin.from('profiles').select('role').eq('id', data.user.id).single();
  if (profile?.role !== 'superadmin') throw Object.assign(new Error('Apenas superusuário'), { status: 403 });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ message: 'Method not allowed' }); }
  try {
    const admin = getAdmin();
    await assertSuperadmin(req, admin);
    const b = parseBody(req);

    if (b.action === 'saveCredentials') {
      const appid = (b.appid || '').trim();
      const appSecret = (b.app_secret || '').trim();
      if (!appid || !appSecret) throw Object.assign(new Error('appid e app_secret são obrigatórios'), { status: 400 });
      const tenantId = b.tenant_id ?? null;

      // Upsert manual (índice único é sobre coalesce(tenant_id,...), não casa com on_conflict).
      const q = admin.from('iopgps_credentials').select('id');
      const { data: existing } = tenantId
        ? await q.eq('tenant_id', tenantId).maybeSingle()
        : await q.is('tenant_id', null).maybeSingle();

      const row = {
        tenant_id: tenantId,
        base_url: (b.base_url || 'https://open.iopgps.com').trim(),
        appid, app_secret: appSecret, active: true, updated_at: new Date().toISOString(),
      };

      if (existing?.id) {
        // Token antigo invalidado: limpa cache para forçar re-auth com a nova credencial.
        const { error } = await admin.from('iopgps_credentials')
          .update({ ...row, access_token: null, token_expires_at: null }).eq('id', existing.id);
        if (error) throw Object.assign(new Error(error.message), { status: 400 });
      } else {
        const { error } = await admin.from('iopgps_credentials').insert(row);
        if (error) throw Object.assign(new Error(error.message), { status: 400 });
      }
      return res.status(200).json({ ok: true });
    }

    throw Object.assign(new Error('Ação desconhecida'), { status: 400 });
  } catch (e) {
    const status = (e as any)?.status ?? 400;
    return res.status(status).json({ message: e instanceof Error ? e.message : 'Erro' });
  }
}
