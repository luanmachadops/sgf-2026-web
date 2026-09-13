import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { authErrorMessage } from './authErrors';

interface AuthState {
  userId: string | null;
  email: string | null;
  isSuperadmin: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | undefined>(undefined);

async function loadRole(userId: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
  return data?.role === 'superadmin';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let disposed = false;
    const check = async () => {
      const { error } = await supabase.rpc('check_current_access');
      if (!disposed && error?.code === '42501') {
        setUserId(null); setEmail(null); setIsSuperadmin(false);
        await supabase.auth.signOut({ scope: 'local' });
        window.location.replace(`${import.meta.env.BASE_URL}login`);
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 30_000);
    const focus = () => void check();
    window.addEventListener('focus', focus);
    return () => { disposed = true; window.clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [userId]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return;
      if (session?.user) {
        setUserId(session.user.id);
        setEmail(session.user.email ?? null);
        setIsSuperadmin(await loadRole(session.user.id));
      }
      setIsLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) { setUserId(null); setEmail(null); setIsSuperadmin(false); }
    });
    return () => { active = false; subscription?.unsubscribe(); };
  }, []);

  const login = async (e: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: e, password });
    if (error) throw new Error(authErrorMessage(error));
    const ok = await loadRole(data.user.id);
    if (!ok) {
      await supabase.auth.signOut();
      throw new Error('Acesso restrito ao superusuário.');
    }
    setUserId(data.user.id); setEmail(data.user.email ?? null); setIsSuperadmin(true);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUserId(null); setEmail(null); setIsSuperadmin(false);
    // BASE_URL = '/admin/' em produção; garante o caminho certo sob o proxy.
    window.location.href = `${import.meta.env.BASE_URL}login`;
  };

  return <Ctx.Provider value={{ userId, email, isSuperadmin, isLoading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
