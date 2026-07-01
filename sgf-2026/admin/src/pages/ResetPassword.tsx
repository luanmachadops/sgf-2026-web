import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button, Input } from '@/lib/ui';

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
    if (password.length < 6) { setErr('A senha deve ter ao menos 6 caracteres.'); return; }
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
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-[var(--sgf-dark)] to-[var(--sgf-primary)] p-6">
      <div className="w-full max-w-sm space-y-5 rounded-3xl bg-white p-8 shadow-2xl">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Definir nova senha</h1>
          <p className="text-sm text-slate-500">SGF • Superusuário</p>
        </div>

        {done ? (
          <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
            Senha alterada com sucesso. Redirecionando para o login…
          </div>
        ) : !ready ? (
          <p className="text-center text-sm text-slate-500">
            Validando o link de recuperação… Se você não veio pelo e-mail, solicite um novo link na tela de login.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            {err && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}
            <Input label="Nova senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Input label="Confirmar nova senha" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            <Button type="submit" disabled={loading} className="w-full">{loading ? 'Salvando…' : 'Salvar nova senha'}</Button>
          </form>
        )}
      </div>
    </div>
  );
}
