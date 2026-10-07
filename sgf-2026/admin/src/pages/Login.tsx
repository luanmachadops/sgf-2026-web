import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { authErrorMessage } from '@/lib/authErrors';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from '@/components/sgf/icons';
import { AuthShell, AuthAlert, AUTH_SUBMIT_CLS } from '@/components/AuthShell';

/** Login do superadmin no mesmo padrão visual do painel do gestor. */
export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const switchMode = (next: 'login' | 'forgot') => { setMode(next); setErr(''); setInfo(''); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setInfo(''); setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        nav('/');
      } else {
        // Volta para a tela de definição de senha do admin.
        const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}reset-password`;
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (error) throw error;
        setInfo('Se este e-mail estiver cadastrado, enviamos um link de recuperação. Verifique sua caixa de entrada (e o spam).');
      }
    } catch (e) {
      setErr(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle="Superadmin">
      <form onSubmit={submit} className="flex w-full flex-col gap-[19px]">
        <p className="text-center text-[14px] font-medium text-white">
          {mode === 'login' ? 'Entre com sua conta' : 'Recuperar senha'}
        </p>

        {err && <AuthAlert tone="error">{err}</AuthAlert>}
        {info && <AuthAlert tone="success">{info}</AuthAlert>}

        <label className="auth-field">
          <Mail className="h-6 w-6 shrink-0 text-white/90" />
          <input
            type="email"
            placeholder="e-mail de acesso"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        {mode === 'login' && (
          <>
            <label className="auth-field">
              <Lock className="h-6 w-6 shrink-0 text-white/90" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="shrink-0 text-white/70 transition-colors hover:text-white"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </label>
            <button
              type="button"
              onClick={() => switchMode('forgot')}
              className="-mt-1 self-end text-[12px] font-bold text-[var(--sgf-primary)] hover:underline"
            >
              Esqueceu a senha?
            </button>
          </>
        )}

        <button type="submit" disabled={loading} className={AUTH_SUBMIT_CLS}>
          {loading ? (
            <>
              <Loader2 className="h-[18px] w-[18px] animate-spin" />
              {mode === 'login' ? 'Entrando...' : 'Enviando...'}
            </>
          ) : (
            <>
              {mode === 'login' ? 'Entrar' : 'Enviar link de recuperação'}
              <ArrowRight className="h-[18px] w-[18px]" />
            </>
          )}
        </button>

        {mode === 'forgot' && (
          <button type="button" onClick={() => switchMode('login')} className="text-center text-sm font-semibold text-white/80 hover:text-white">
            Voltar para o login
          </button>
        )}
      </form>
    </AuthShell>
  );
}
