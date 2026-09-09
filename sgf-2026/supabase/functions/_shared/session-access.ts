import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/** Token must already have been verified by auth.getUser. */
export async function sessionAllowed(sb: SupabaseClient, userId: string, token: string, module?: string, allowDriver = false): Promise<boolean> {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '='))) as { session_id?: unknown };
    if (typeof claims.session_id !== 'string') return false;
    const { error } = await sb.rpc('assert_server_session', { p_user_id: userId, p_session_id: claims.session_id });
    if (error) return false;
    if (!module) return true;
    const { data: profile, error: profileError } = await sb.from('profiles').select('role, allowed_modules').eq('id', userId).maybeSingle();
    if (profileError || !profile) return false;
    return profile.role === 'superadmin'
      || (allowDriver && profile.role === 'motorista')
      || (['admin','gestor','secretario'].includes(profile.role) && Array.isArray(profile.allowed_modules) && profile.allowed_modules.includes(module));
  } catch { return false; }
}
