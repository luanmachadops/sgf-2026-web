import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button, Input } from '@/lib/ui';
import { PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH_MESSAGE, PASSWORD_PLACEHOLDER } from '@/lib/passwordPolicy';

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
    <div className="grid min-h-screen place-items-center bg-[var(--rt-ink900)] p-5">
      <div className="rt-rise w-full max-w-[400px] space-y-5 rounded-[28px] bg-white p-7 shadow-[0_24px_64px_rgb(0_0_0/0.35)] sm:p-8">
        <div className="text-center">
          <img src="/exattus-rotta.svg" alt="" className="mx-auto mb-5 h-16 w-16" />
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[var(--rt-ink900)]">Nova senha</h1>
          <p className="mt-1 text-sm text-[var(--rt-ink500)]">Exattus Rotta · Superadmin</p>
        </div>

        {done ? (
          <div role="status" className="rounded-2xl bg-[var(--rt-brand-100)] px-4 py-3 text-sm font-medium text-[#0B7A50]">
            Senha alterada com sucesso. Redirecionando para o login…
          </div>
        ) : !ready ? (
          <p className="text-center text-sm text-[var(--rt-ink500)]">
            Validando o link de recuperação… Se você não veio pelo e-mail, solicite um novo link na tela de login.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            {err && <div role="alert" className="rounded-2xl bg-[var(--rt-red100)] px-4 py-3 text-sm font-medium text-[var(--rt-red600)]">{err}</div>}
            <Input label="Nova senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={PASSWORD_PLACEHOLDER} required />
            <Input label="Confirmar nova senha" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            <Button type="submit" disabled={loading} className="h-12 w-full text-[15px]">{loading ? 'Salvando…' : 'Salvar nova senha'}</Button>
          </form>
        )}
      </div>
    </div>
  );
}
