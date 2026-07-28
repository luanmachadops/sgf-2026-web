import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { useBranding } from '@/contexts/BrandingContext';
import { PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH_MESSAGE, PASSWORD_PLACEHOLDER } from '@/lib/passwordPolicy';
import { supabase } from '@/lib/supabase';

function loginPathForHost(): string {
    if (typeof window === 'undefined') return '/login';
    const subdomain = window.location.hostname.split('.')[0]?.toLowerCase();
    if (subdomain === 'posto') return '/posto/login';
    if (subdomain === 'oficina') return '/oficina/login';
    return '/login';
}

export default function ResetPassword() {
    const navigate = useNavigate();
    const { branding } = useBranding();
    const [ready, setReady] = useState(false);
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
        });
        void supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) setReady(true);
        });
        return () => subscription.unsubscribe();
    }, []);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setError('');
        if (password.length < PASSWORD_MIN_LENGTH) {
            setError(PASSWORD_MIN_LENGTH_MESSAGE);
            return;
        }
        if (password !== confirm) {
            setError('As senhas não coincidem.');
            return;
        }

        setLoading(true);
        try {
            const { error: updateError } = await supabase.auth.updateUser({ password });
            if (updateError) throw updateError;
            setDone(true);
            await supabase.auth.signOut();
            window.setTimeout(() => navigate(loginPathForHost(), { replace: true }), 2200);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a senha.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="grid min-h-screen place-items-center bg-gradient-to-br from-[var(--sgf-dark)] to-[var(--sgf-primary)] p-6">
            <div className="w-full max-w-sm space-y-5 rounded-3xl bg-white p-8 shadow-2xl">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-slate-900">Definir nova senha</h1>
                    <p className="mt-1 text-sm text-slate-500">{branding.name}</p>
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
                        {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
                        <SGFInput
                            label="Nova senha"
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder={PASSWORD_PLACEHOLDER}
                            required
                            fullWidth
                        />
                        <SGFInput
                            label="Confirmar nova senha"
                            type="password"
                            value={confirm}
                            onChange={(event) => setConfirm(event.target.value)}
                            required
                            fullWidth
                        />
                        <SGFButton type="submit" loading={loading} fullWidth>
                            Salvar nova senha
                        </SGFButton>
                    </form>
                )}
            </div>
        </div>
    );
}
