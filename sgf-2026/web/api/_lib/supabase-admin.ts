import { createClient } from '@supabase/supabase-js';

function getEnv(name: 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY') {
    const value = process.env[name] ||
        (name === 'SUPABASE_URL'
            ? (process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
            : (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY));

    if (!value) {
        throw new Error(`${name} não configurada nas variáveis de ambiente do servidor.`);
    }

    return value;
}

export function getSupabaseAdmin() {
    return createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
