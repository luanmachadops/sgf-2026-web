import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button, Input } from '@/lib/ui';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setLoading(true);
    try { await login(email, password); nav('/'); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setInfo(''); setLoading(true);
    try {
      // Volta para a tela de definição de senha do admin (sob /admin).
      const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw new Error(error.message);
      setInfo('Se este e-mail estiver cadastrado, enviamos um link de recuperação. Verifique sua caixa de entrada (e o spam).');
    } catch (e) {
      setErr((e as Error).message);
    } finally { setLoading(false); }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-[var(--sgf-dark)] to-[var(--sgf-primary)] p-6">
      <form onSubmit={mode === 'login' ? submit : sendReset} className="w-full max-w-sm space-y-5 rounded-3xl bg-white p-8 shadow-2xl">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">SGF • Superusuário</h1>
          <p className="text-sm text-slate-500">
            {mode === 'login' ? 'Painel de gestão de prefeituras' : 'Recuperar acesso'}
          </p>
        </div>

        {err && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        {info && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{info}</div>}

        <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        {mode === 'login' && (
          <Input label="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        )}

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? (mode === 'login' ? 'Entrando…' : 'Enviando…') : (mode === 'login' ? 'Entrar' : 'Enviar link de recuperação')}
        </Button>

        <div className="text-center">
          {mode === 'login' ? (
            <button type="button" onClick={() => { setMode('forgot'); setErr(''); setInfo(''); }}
              className="text-sm font-medium text-[var(--sgf-primary)] hover:underline">
              Esqueci minha senha
            </button>
          ) : (
            <button type="button" onClick={() => { setMode('login'); setErr(''); setInfo(''); }}
              className="text-sm font-medium text-slate-500 hover:underline">
              ← Voltar ao login
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
