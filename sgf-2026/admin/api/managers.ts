import { createClient } from '@supabase/supabase-js';
import { assertStrongPassword } from './_lib/password-policy.js';
import { checkRateLimit, getClientIp, logRateLimitBlocked, sendRateLimited } from './_lib/rate-limit.js';

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

/** Retorna o id do superadmin autenticado, ou lança 401/403. */
async function assertSuperadmin(req: any, admin: ReturnType<typeof getAdmin>): Promise<string> {
  const header = req.headers?.authorization || req.headers?.Authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw Object.assign(new Error('Não autenticado'), { status: 401 });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Sessão inválida'), { status: 401 });
  const { data: profile } = await admin.from('profiles').select('role').eq('id', data.user.id).single();
  if (profile?.role !== 'superadmin') throw Object.assign(new Error('Apenas superusuário'), { status: 403 });
  return data.user.id;
}

const WINDOW_SECONDS = 60;
const MAX_HITS = 10;

async function findUserByEmail(admin: ReturnType<typeof getAdmin>, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw Object.assign(new Error(error.message), { status: 400 });
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 1000) break;
  }
  return null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ message: 'Method not allowed' }); }
  try {
    const admin = getAdmin();
    const callerId = await assertSuperadmin(req, admin);
    const b = parseBody(req);
    const action = b.action as string;

    const ip = getClientIp(req);
    const check = await checkRateLimit(`admin-managers-${action}`, callerId, ip, WINDOW_SECONDS, MAX_HITS);
    if (!check.allowed) {
      await logRateLimitBlocked(callerId, `Limite de ação '${action}' em admin/managers atingido (${check.currentCount} chamadas/min), IP ${ip}.`);
      return sendRateLimited(res, check, 'Muitas requisições em pouco tempo. Aguarde e tente novamente.');
    }

    if (action === 'create') {
      const role = b.role === 'admin' ? 'admin' : 'gestor';
      const email = (b.email || '').trim().toLowerCase();
      if (!b.tenantId) throw Object.assign(new Error('Prefeitura é obrigatória'), { status: 400 });
      if (!email.includes('@')) throw Object.assign(new Error('E-mail inválido'), { status: 400 });
      assertStrongPassword(b.password);

      const { data: authData, error: aErr } = await admin.auth.admin.createUser({
        email, password: b.password, email_confirm: true,
        user_metadata: { full_name: b.name || 'Gestor', role, tenant_id: b.tenantId },
      });
      let authUser = authData.user;
      let createdNow = !!authUser;

      // Um e-mail pode já existir por cadastro anterior, convite ou acesso
      // bloqueado. Nesse caso, o superadmin deve conseguir vinculá-lo novamente
      // sem receber "User already registered".
      if (!authUser && aErr) {
        authUser = await findUserByEmail(admin, email);
        createdNow = false;
      }
      if (!authUser) throw Object.assign(new Error(aErr?.message || 'Falha ao criar gestor'), { status: 400 });
      const fullName = (b.name || '').trim() || String(authUser.user_metadata?.full_name || 'Gestor');

      const { error: updateAuthError } = await admin.auth.admin.updateUserById(authUser.id, {
        email,
        password: b.password,
        email_confirm: true,
        ban_duration: 'none',
        user_metadata: {
          ...(authUser.user_metadata ?? {}),
          full_name: fullName,
          role,
          tenant_id: b.tenantId,
        },
      });
      if (updateAuthError) {
        if (createdNow) await admin.auth.admin.deleteUser(authUser.id);
        throw Object.assign(new Error(updateAuthError.message), { status: 400 });
      }

      const { error: pErr } = await admin.from('profiles').upsert({
        id: authUser.id,
        full_name: fullName,
        email,
        role,
        tenant_id: b.tenantId,
        access_blocked: false,
      }, { onConflict: 'id' });
      if (pErr) {
        if (createdNow) await admin.auth.admin.deleteUser(authUser.id);
        throw Object.assign(new Error(pErr.message), { status: 400 });
      }
      return res.status(createdNow ? 201 : 200).json({ ok: true, userId: authUser.id, reused: !createdNow });
    }

    if (action === 'setBlocked') {
      const { userId, blocked } = b;
      if (!userId) throw Object.assign(new Error('userId obrigatório'), { status: 400 });
      const { error: authError } = await admin.auth.admin.updateUserById(userId, { ban_duration: blocked ? '876000h' : 'none' });
      if (authError) throw Object.assign(new Error(authError.message), { status: 400 });
      const { error: profileError } = await admin.from('profiles').update({ access_blocked: !!blocked }).eq('id', userId);
      if (profileError) throw Object.assign(new Error(profileError.message), { status: 400 });
      return res.status(200).json({ ok: true });
    }

    if (action === 'resetPassword') {
      const { userId, password } = b;
      if (!userId) throw Object.assign(new Error('userId obrigatório'), { status: 400 });
      assertStrongPassword(password);
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) throw Object.assign(new Error(error.message), { status: 400 });
      return res.status(200).json({ ok: true });
    }

    throw Object.assign(new Error('Ação desconhecida'), { status: 400 });
  } catch (e) {
    const status = (e as any)?.status ?? 400;
    return res.status(status).json({ message: e instanceof Error ? e.message : 'Erro' });
  }
}
