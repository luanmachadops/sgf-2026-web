import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH_MESSAGE, PASSWORD_PLACEHOLDER } from '@/lib/passwordPolicy';
import { Lock, ArrowRight, Loader2 } from '@/components/sgf/icons';
import { AuthShell, AuthAlert, AUTH_SUBMIT_CLS } from '@/components/AuthShell';

/**
 * Tela de definição de nova senha. O usuário chega aqui pelo link do e-mail de
 * recuperação; o supabase-js processa o token da URL e cria uma sessão temporária
 * (evento PASSWORD_RECOVERY). Aí permitimos gravar a nova senha.
 */
export default function ResetPassword() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Sessão de recuperação vinda do link do e-mail.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
    });
    // Caso o token já tenha sido processado antes do listener montar.
    supabase.auth.getSession().then(({ data: { session } }) => { if (session) setReady(true); });
    return () => subscription?.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (password.length < PASSWORD_MIN_LENGTH) { setErr(PASSWORD_MIN_LENGTH_MESSAGE); return; }
    if (password !== confirm) { setErr('As senhas não coincidem.'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      setDone(true);
      await supabase.auth.signOut();
      setTimeout(() => nav('/login'), 2500);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setLoading(false); }
  };

  return (
    <AuthShell subtitle="Superadmin">
      <div className="flex w-full flex-col gap-[19px]">
        <p className="text-center text-[14px] font-medium text-white">Definir nova senha</p>
        {done ? (
          <AuthAlert tone="success">Senha alterada com sucesso. Redirecionando para o login…</AuthAlert>
        ) : !ready ? (
          <p className="text-center text-sm text-white/70">
            Validando o link de recuperação… Se você não veio pelo e-mail, solicite um novo link na tela de login.
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-[19px]">
            {err && <AuthAlert tone="error">{err}</AuthAlert>}
            <label className="auth-field">
              <Lock className="h-6 w-6 shrink-0 text-white/90" />
              <input type="password" autoComplete="new-password" placeholder={PASSWORD_PLACEHOLDER} value={password} onChange={(e) => setPassword(e.target.value)} required aria-label="Nova senha" />
            </label>
            <label className="auth-field">
              <Lock className="h-6 w-6 shrink-0 text-white/90" />
              <input type="password" autoComplete="new-password" placeholder="Confirmar nova senha" value={confirm} onChange={(e) => setConfirm(e.target.value)} required aria-label="Confirmar nova senha" />
            </label>
            <button type="submit" disabled={loading} className={AUTH_SUBMIT_CLS}>
              {loading ? <><Loader2 className="h-[18px] w-[18px] animate-spin" /> Salvando...</> : <>Salvar nova senha <ArrowRight className="h-[18px] w-[18px]" /></>}
            </button>
          </form>
        )}
        <button type="button" onClick={() => nav('/login')} className="text-center text-sm font-semibold text-white/80 hover:text-white">
          Voltar para o login
        </button>
      </div>
    </AuthShell>
  );
}
