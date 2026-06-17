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
    const name = (b.name || '').trim();
    const slug = (b.slug || '').trim().toLowerCase();
    if (!name || !slug) throw Object.assign(new Error('Nome e slug são obrigatórios'), { status: 400 });
    if (!b.adminEmail || !b.adminPassword || b.adminPassword.length < 6) {
      throw Object.assign(new Error('Admin: e-mail e senha (mín. 6) são obrigatórios'), { status: 400 });
    }

    // 1) cria o tenant
    const { data: tenant, error: tErr } = await admin.from('tenants').insert({
      name, slug, city: b.city || null, state: b.state || null, cnpj: b.cnpj || null,
      app_name: 'Frota Municipal', login_eyebrow: `PREFEITURA DE ${name.toUpperCase()}`,
    }).select('id').single();
    if (tErr) throw Object.assign(new Error(tErr.message), { status: 400 });

    // 2) cria o primeiro admin do tenant
    const { data: authData, error: aErr } = await admin.auth.admin.createUser({
      email: (b.adminEmail as string).trim().toLowerCase(),
      password: b.adminPassword,
      email_confirm: true,
      user_metadata: { full_name: b.adminName || 'Administrador', role: 'admin', tenant_id: tenant.id },
    });
    if (aErr || !authData.user) {
      await admin.from('tenants').delete().eq('id', tenant.id);
      throw Object.assign(new Error(aErr?.message || 'Falha ao criar administrador'), { status: 400 });
    }

    const { error: pErr } = await admin.from('profiles').update({
      full_name: b.adminName || 'Administrador',
      email: (b.adminEmail as string).trim().toLowerCase(),
      role: 'admin',
      tenant_id: tenant.id,
    }).eq('id', authData.user.id);
    if (pErr) {
      await admin.auth.admin.deleteUser(authData.user.id);
      await admin.from('tenants').delete().eq('id', tenant.id);
      throw Object.assign(new Error(pErr.message), { status: 400 });
    }

    return res.status(201).json({ tenantId: tenant.id });
  } catch (e) {
    const status = (e as any)?.status ?? 400;
    return res.status(status).json({ message: e instanceof Error ? e.message : 'Erro' });
  }
}
