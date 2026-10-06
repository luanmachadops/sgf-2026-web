import { assertServerSession } from '../../web/api/_lib/session-access.js';
import { createClient } from '@supabase/supabase-js';

/**
 * Assina fotos de veículos (bucket privado `fotos`) para o superadmin.
 * O RLS do storage restringe a leitura ao tenant do usuário; o superadmin
 * precisa ver fotos de todas as prefeituras, então a assinatura é feita aqui
 * com service_role, depois de confirmar o papel.
 */

const MAX_PATHS = 300;
const TTL_SECONDS = 60 * 60;
const PATH_RE = /^tenant\/[0-9a-f-]{36}\/vehicles\/[A-Za-z0-9._\/-]+$/;

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
  await assertServerSession(admin, data.user.id, token);
  const { data: profile } = await admin.from('profiles').select('role').eq('id', data.user.id).single();
  if (profile?.role !== 'superadmin') throw Object.assign(new Error('Apenas superusuário'), { status: 403 });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ message: 'Method not allowed' }); }
  try {
    const admin = getAdmin();
    await assertSuperadmin(req, admin);
    const b = parseBody(req);
    const raw: unknown = b.paths;
    if (!Array.isArray(raw)) throw Object.assign(new Error('paths deve ser uma lista'), { status: 400 });
    const paths = [...new Set(raw.filter((p): p is string => typeof p === 'string' && PATH_RE.test(p) && !p.includes('..')))].slice(0, MAX_PATHS);
    if (!paths.length) return res.status(200).json({ urls: {} });

    const { data, error } = await admin.storage.from('fotos').createSignedUrls(paths, TTL_SECONDS);
    if (error) throw Object.assign(new Error(error.message), { status: 400 });
    const urls: Record<string, string> = {};
    for (const item of data ?? []) if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
    return res.status(200).json({ urls });
  } catch (e: any) {
    return res.status(e?.status ?? 500).json({ message: e?.message ?? 'Erro interno' });
  }
}
