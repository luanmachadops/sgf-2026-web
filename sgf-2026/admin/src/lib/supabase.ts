import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn('Faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no .env do admin.');
}

const ref = (() => { try { return new URL(url).hostname.split('.')[0]; } catch { return 'admin'; } })();

export const supabase = createClient<Database>(url || 'https://placeholder.supabase.co', anon || 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: `sb-${ref}-admin-auth` },
});
