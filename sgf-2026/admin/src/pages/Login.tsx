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
    <div className="grid min-h-screen place-items-center bg-[var(--rt-ink900)] p-5">
      <form onSubmit={mode === 'login' ? submit : sendReset} className="rt-rise w-full max-w-[400px] space-y-5 rounded-[28px] bg-white p-7 shadow-[0_24px_64px_rgb(0_0_0/0.35)] sm:p-8">
        <div className="text-center">
          <img src="/exattus-rotta.svg" alt="" className="mx-auto mb-5 h-16 w-16" />
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[var(--rt-ink900)]">{mode === 'login' ? 'Superadmin' : 'Recuperar acesso'}</h1>
          <p className="mt-1 text-sm text-[var(--rt-ink500)]">
            {mode === 'login' ? 'Exattus Rotta · gestão das prefeituras' : 'Enviaremos um link para redefinir a senha.'}
          </p>
        </div>

        {err && <div role="alert" className="rounded-2xl bg-[var(--rt-red100)] px-4 py-3 text-sm font-medium text-[var(--rt-red600)]">{err}</div>}
        {info && <div role="status" className="rounded-2xl bg-[var(--rt-brand-100)] px-4 py-3 text-sm font-medium text-[#0B7A50]">{info}</div>}

        <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        {mode === 'login' && (
          <Input label="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        )}

        <Button type="submit" disabled={loading} className="h-12 w-full text-[15px]">
          {loading ? (mode === 'login' ? 'Entrando…' : 'Enviando…') : (mode === 'login' ? 'Entrar' : 'Enviar link de recuperação')}
        </Button>

        <div className="text-center">
          {mode === 'login' ? (
            <button type="button" onClick={() => { setMode('forgot'); setErr(''); setInfo(''); }}
              className="rounded-full px-3 py-1.5 text-sm font-semibold text-[var(--rt-brand)] hover:bg-[var(--rt-brand-50)]">
              Esqueci minha senha
            </button>
          ) : (
            <button type="button" onClick={() => { setMode('login'); setErr(''); setInfo(''); }}
              className="rounded-full px-3 py-1.5 text-sm font-semibold text-[var(--rt-ink500)] hover:bg-[var(--rt-paper)]">
              ← Voltar ao login
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
