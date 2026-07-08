import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

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

async function assertRole(req: any, admin: ReturnType<typeof getAdmin>, roles: string[]) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw Object.assign(new Error('Não autenticado'), { status: 401 });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Sessão inválida'), { status: 401 });
  const { data: profile } = await admin.from('profiles').select('role, tenant_id').eq('id', data.user.id).single();
  if (!profile || !roles.includes(profile.role)) throw Object.assign(new Error('Sem permissão'), { status: 403 });
  return { userId: data.user.id, role: profile.role as string, tenantId: (profile.tenant_id as string | null) ?? null };
}

const md5 = (s: string) => createHash('md5').update(s).digest('hex');

/** Obtém (e cacheia) um accessToken IOPGPS a partir da credencial salva. */
async function iopgpsToken(admin: ReturnType<typeof getAdmin>, tenantId: string | null) {
  // Credencial do tenant; se não houver, cai apenas na credencial GLOBAL (tenant_id NULL).
  // Nunca usa credencial de outro tenant.
  let row = tenantId
    ? (await admin.from('iopgps_credentials').select('*').eq('active', true).eq('tenant_id', tenantId).maybeSingle()).data
    : null;
  if (!row) {
    row = (await admin.from('iopgps_credentials').select('*').eq('active', true).is('tenant_id', null).maybeSingle()).data;
  }
  if (!row) throw Object.assign(new Error('Credencial IOPGPS não configurada'), { status: 412 });

  const now = Date.now();
  if (row.access_token && row.token_expires_at && new Date(row.token_expires_at).getTime() - 60_000 > now) {
    return { token: row.access_token as string, baseUrl: row.base_url as string };
  }
  const time = Math.floor(now / 1000);
  const signature = md5(md5(row.app_secret) + time);
  const res = await fetch(`${row.base_url}/api/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appid: row.appid, time, signature }),
  });
  const json: any = await res.json();
  if (json.code && json.code !== 0) throw Object.assign(new Error(`IOPGPS auth (code=${json.code})`), { status: 502 });
  const token = json.accessToken as string;
  const expiresIn = json.expiresIn ?? 7200000;
  const expiresAtMs = now + (expiresIn < 100_000 ? expiresIn * 1000 : expiresIn);
  await admin.from('iopgps_credentials').update({ access_token: token, token_expires_at: new Date(expiresAtMs).toISOString(), updated_at: new Date().toISOString() }).eq('id', row.id);
  return { token, baseUrl: row.base_url as string };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ message: 'Method not allowed' }); }
  try {
    const admin = getAdmin();
    const caller = await assertRole(req, admin, ['superadmin', 'admin', 'gestor']);
    const b = parseBody(req);
    const imei = String(b.imei ?? '').trim();
    if (!imei) throw Object.assign(new Error('IMEI obrigatório'), { status: 400 });

    // Tenant SEMPRE derivado do chamador; só superadmin pode consultar outro tenant.
    const tenantId = caller.role === 'superadmin' ? (b.tenantId ?? null) : caller.tenantId;
    const { token, baseUrl } = await iopgpsToken(admin, tenantId);
    const r = await fetch(`${baseUrl}/api/device/type?imei=${encodeURIComponent(imei)}`, { headers: { accessToken: token } });
    const json: any = await r.json();

    // Dispositivo não encontrado na conta IOPGPS.
    const rb = json.resultBean;
    if ((rb && rb.code && rb.code !== 0) || (json.code && json.code !== 0)) {
      return res.status(200).json({ found: false, message: rb?.message || json?.message || 'Dispositivo não encontrado na IOPGPS' });
    }

    const t = json.deviceTypeBean ?? {};
    const st = json.deviceStatusBean ?? {};
    return res.status(200).json({
      found: true,
      model: t.typeName ?? t.innerTypeName ?? null,
      deviceName: json.name ?? null,
      wireless: !!t.wireless,
      instructions: t.instructions ?? null, // ids de comandos suportados pelo modelo
      online: st.status != null ? st.status !== 0 : null,
    });
  } catch (e) {
    const status = (e as any)?.status ?? 400;
    return res.status(status).json({ message: e instanceof Error ? e.message : 'Erro' });
  }
}
