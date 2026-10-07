import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Loader2, Lock } from '@/components/sgf/icons';
import { INICIO_LAYERS, INICIO_VIEWBOX } from '@/components/pwa/inicioLogo';
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
    const tenantLogo = branding.logoUrl || branding.sealUrl;
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
        <div className="sgf-auth-background flex min-h-screen w-full flex-col items-center">
            <div className="flex w-full max-w-[412px] flex-1 flex-col items-center px-[37px]">
                <div className="mt-[72px] flex flex-col items-center">
                    {tenantLogo ? (
                        <>
                            <img src={tenantLogo} alt={branding.name} className="h-24 w-24 object-contain" />
                            <h1 className="mt-4 text-center text-2xl font-bold text-white">{branding.name}</h1>
                        </>
                    ) : (
                        <svg
                            className="pwa-launch-logo !w-[180px]"
                            viewBox={`0 0 ${INICIO_VIEWBOX.width} ${INICIO_VIEWBOX.height}`}
                            role="img"
                            aria-label="Exattus Rotta — Gestão de frota Municipal"
                        >
                            {INICIO_LAYERS.map((layer) => (
                                <path key={layer.id} className={`pwa-layer-${layer.id}`} d={layer.d} fill={layer.fill} />
                            ))}
                        </svg>
                    )}
                </div>

                <div className="mt-[72px] flex w-full flex-col gap-[19px]">
                    <p className="text-center text-[14px] font-medium text-white">Definir nova senha</p>

                    {done ? (
                        <div role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-2.5 text-sm text-emerald-200">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>Senha alterada com sucesso. Redirecionando para o login…</span>
                        </div>
                    ) : !ready ? (
                        <p className="text-center text-sm text-white/70">
                            Validando o link de recuperação… Se você não veio pelo e-mail, solicite um novo link na tela de login.
                        </p>
                    ) : (
                        <form onSubmit={submit} className="flex flex-col gap-[19px]">
                            {error && (
                                <div role="alert" className="flex items-center gap-2 rounded-2xl border border-red-400/40 bg-red-500/15 px-3 py-2.5 text-sm text-red-300">
                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}
                            <label className="auth-field">
                                <Lock className="h-6 w-6 shrink-0 text-white/90" />
                                <input
                                    type="password"
                                    autoComplete="new-password"
                                    aria-label="Nova senha"
                                    placeholder={PASSWORD_PLACEHOLDER}
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    required
                                />
                            </label>
                            <label className="auth-field">
                                <Lock className="h-6 w-6 shrink-0 text-white/90" />
                                <input
                                    type="password"
                                    autoComplete="new-password"
                                    aria-label="Confirmar nova senha"
                                    placeholder="Confirmar nova senha"
                                    value={confirm}
                                    onChange={(event) => setConfirm(event.target.value)}
                                    required
                                />
                            </label>
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex h-[55px] w-full items-center justify-center gap-[10px] rounded-[27.5px] bg-[var(--sgf-primary)] text-[16px] font-bold text-white transition-opacity active:scale-[.98] disabled:opacity-70"
                            >
                                {loading
                                    ? <><Loader2 className="h-[18px] w-[18px] animate-spin" /> Salvando...</>
                                    : <>Salvar nova senha <ArrowRight className="h-[18px] w-[18px]" /></>}
                            </button>
                        </form>
                    )}

                    <button
                        type="button"
                        onClick={() => navigate(loginPathForHost(), { replace: true })}
                        className="text-center text-sm font-semibold text-white/80 hover:text-white"
                    >
                        Voltar para o login
                    </button>
                </div>

                <p className="mb-[36px] mt-auto pt-10 text-center text-[11.667px] font-medium text-white/80">
                    © Exattus Rotta {new Date().getFullYear()}
                </p>
            </div>
        </div>
    );
}
