// Helpers compartilhados pelas Edge Functions IOPGPS.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { IopgpsClient } from './iopgps.ts';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

/** Cliente Supabase com service-role (ignora RLS). */
export function admin(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * Monta um IopgpsClient a partir das credenciais persistidas (tabela
 * iopgps_credentials) para um tenant — ou da credencial global (tenant_id NULL).
 * Persiste o token renovado de volta no banco (cache compartilhado).
 */
export async function iopgpsFor(db: SupabaseClient, tenantId: string | null): Promise<IopgpsClient | null> {
  const { data } = await db
    .from('iopgps_credentials')
    .select('*')
    .eq('active', true)
    .or(`tenant_id.eq.${tenantId ?? '00000000-0000-0000-0000-000000000000'},tenant_id.is.null`)
    .order('tenant_id', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const client = new IopgpsClient({
    baseUrl: data.base_url,
    appid: data.appid,
    appSecret: data.app_secret,
    accessToken: data.access_token,
    tokenExpiresAt: data.token_expires_at ? new Date(data.token_expires_at).getTime() : null,
  });
  client.onToken = async (token, expiresAtMs) => {
    await db.from('iopgps_credentials')
      .update({ access_token: token, token_expires_at: new Date(expiresAtMs).toISOString(), updated_at: new Date().toISOString() })
      .eq('id', data.id);
  };
  return client;
}

/** Valida Bearer e exige um dos papéis informados. Retorna { userId, tenantId, role }. */
export async function requireRole(db: SupabaseClient, req: Request, roles: string[]) {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) throw Object.assign(new Error('Não autenticado'), { status: 401 });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Sessão inválida'), { status: 401 });
  const { data: profile } = await db.from('profiles').select('role, tenant_id').eq('id', data.user.id).single();
  if (!profile || !roles.includes(profile.role)) throw Object.assign(new Error('Sem permissão'), { status: 403 });
  return { userId: data.user.id, tenantId: profile.tenant_id as string | null, role: profile.role as string };
}
