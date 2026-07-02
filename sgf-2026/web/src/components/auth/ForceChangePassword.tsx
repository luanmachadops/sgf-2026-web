import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Bloqueio de primeiro acesso: motorista pré-cadastrado com senha = CPF precisa
 * definir uma nova senha antes de usar o sistema (mitiga senha inicial previsível).
 */
export default function ForceChangePassword() {
    const { user, logout, refreshUser } = useAuth();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErr('');
        if (password.length < 8) { setErr('A senha deve ter ao menos 8 caracteres.'); return; }
        if (password !== confirm) { setErr('As senhas não coincidem.'); return; }
        setLoading(true);
        try {
            const { error: pErr } = await supabase.auth.updateUser({ password });
            if (pErr) throw new Error(pErr.message);
            const { error: uErr } = await supabase
                .from('profiles')
                .update({ must_change_password: false })
                .eq('id', user!.id);
            if (uErr) throw new Error(uErr.message);
            await refreshUser();
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="grid min-h-screen place-items-center bg-slate-50 p-6">
            <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-3xl bg-white p-8 shadow-xl">
                <div className="text-center">
                    <h1 className="text-xl font-bold text-slate-900">Defina sua senha</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Por segurança, seu primeiro acesso exige a criação de uma nova senha.
                    </p>
                </div>
                {err && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}
                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Nova senha</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-sgf-primary focus:outline-none" />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Confirmar nova senha</label>
                    <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-sgf-primary focus:outline-none" />
                </div>
                <button type="submit" disabled={loading}
                    className="w-full rounded-xl bg-sgf-primary py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                    {loading ? 'Salvando…' : 'Salvar e continuar'}
                </button>
                <button type="button" onClick={logout} className="block w-full text-center text-xs font-medium text-slate-400 hover:underline">
                    Sair
                </button>
            </form>
        </div>
    );
}
