import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
        'Supabase URLs are missing. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.'
    );
}

// Deriva um "project ref" da URL (parte antes de .supabase.co) para namespace do storage.
// Assim, se o projeto Supabase muda (ex.: migração), tokens antigos NÃO conflitam com os novos.
function projectRef(url: string | undefined): string {
    try {
        if (!url) return 'unknown';
        const host = new URL(url).hostname; // ex: kgxdrgbxpfoebzrphtqg.supabase.co
        return host.split('.')[0];
    } catch {
        return 'unknown';
    }
}

const ref = projectRef(supabaseUrl);
const storageKey = `sb-${ref}-auth-token`;

// Boot-time cleanup: ao mudar de projeto, qualquer token de projeto antigo persistido
// em localStorage causaria refresh-token requests bloqueantes (timeout no AuthContext).
// Removemos chaves de auth Supabase que NÃO pertencem ao projeto atual.
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
        const stale: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            // Token Supabase tem o padrão sb-<ref>-auth-token
            if (k.startsWith('sb-') && k.endsWith('-auth-token') && k !== storageKey) {
                stale.push(k);
            }
        }
        for (const k of stale) {
            localStorage.removeItem(k);
        }
        // Limpa também o "user" / "token" antigos que o AuthContext salvava — vamos repovoar.
        // Apenas se forem de projeto antigo (heurística: presença de chave stale).
        if (stale.length > 0) {
            localStorage.removeItem('user');
            localStorage.removeItem('token');
            // eslint-disable-next-line no-console
            console.info(`[supabase] limpei ${stale.length} token(s) de projeto(s) anterior(es)`);
        }
    } catch {
        // ignore storage access errors (privacy mode, etc.)
    }
}

// Lock customizado para o GoTrue:
// - O `navigatorLock` padrão usa AbortController e gera "signal is aborted without reason"
//   em StrictMode/HMR.
// - Um lock no-op (executa fn() direto) permite chamadas concorrentes ao GoTrue, e isso
//   resulta em JWTs intermediários sendo gravados/lidos com race — o storage client acaba
//   enviando um header de auth corrompido e o RLS rejeita os uploads.
// Solução: serializar via Promise-chain, sem AbortController.
let lockChain: Promise<unknown> = Promise.resolve();
async function singleTabLock<R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
    const next = lockChain.then(() => fn());
    // Não deixa erros de uma execução quebrarem a fila para as próximas.
    lockChain = next.catch(() => undefined);
    return next as Promise<R>;
}

export const supabase = createClient<Database>(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key',
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey,
            lock: singleTabLock,
        },
    },
);
