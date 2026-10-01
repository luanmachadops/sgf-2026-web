import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, AlertCircle, Eye, EyeOff, ArrowRight, Loader2 } from '@/components/sgf/icons';
import { INICIO_LAYERS, INICIO_VIEWBOX } from '@/components/pwa/inicioLogo';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';

import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { User } from '@/types';
import { authErrorMessage } from '@/lib/authErrors';

interface LoginProps {
    portal?: 'panel' | 'posto' | 'oficina';
}

function homeForRole(role: User['role']): string {
    if (role === 'POSTO') return '/posto';
    if (role === 'OFICINA') return '/oficina';
    return '/';
}

function errorMessage(error: unknown): string {
    return authErrorMessage(error);
}

export default function Login({ portal = 'panel' }: LoginProps) {
    const navigate = useNavigate();
    const { login, user, isLoading: authLoading } = useAuth();
    const { branding } = useBranding();
    const [view, setView] = useState<'login' | 'forgot'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Só redireciona com a sessão JÁ verificada. Enquanto `isLoading`, o `user`
    // ainda pode ser a cópia cacheada em localStorage de quem acabou de sair —
    // e mandar o recém-deslogado de volta ao portal é exatamente o sintoma que
    // se quer evitar aqui.
    useEffect(() => {
        if (!authLoading && user) navigate(homeForRole(user.role), { replace: true });
    }, [authLoading, navigate, user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');
        setIsLoading(true);

        try {
            if (view === 'login') {
                const loggedUser = await login(email, password);
                navigate(homeForRole(loggedUser.role), { replace: true });
            } else {
                // Forgot Password Logic with Supabase
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/reset-password`,
                });

                if (error) throw error;

                setSuccessMessage('Email de recuperação enviado! Verifique sua caixa de entrada.');
                toast.success('Email de recuperação enviado!');
                // Optional: return to login view after a delay or let user choose
            }
        } catch (err: unknown) {
            if (view === 'login') {
                const message = errorMessage(err);
                setError(message);
            } else {
                setError(errorMessage(err));
            }
        } finally {
            setIsLoading(false);
        }
    };

    const subtitle = portal === 'posto'
        ? 'Sistema de Abastecimento'
        : portal === 'oficina'
            ? 'Sistema de Manutenção'
            : branding.city && branding.state
                ? `${branding.city} - ${branding.state}`
                : null;
    const tenantLogo = branding.logoUrl || branding.sealUrl;

    return (
        <div className="sgf-auth-background flex min-h-screen w-full flex-col items-center">
            <div className="flex w-full max-w-[412px] flex-1 flex-col items-center px-[37px]">
                {/* Logo da tela de início (ou o da prefeitura, quando cadastrado) */}
                <div className="mt-[72px] flex flex-col items-center">
                    {tenantLogo ? (
                        <>
                            <img src={tenantLogo} alt={branding.name} className="h-24 w-24 object-contain" />
                            <h1 className="mt-4 text-2xl font-bold text-white">{branding.name}</h1>
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
                    {subtitle && <p className="mt-3 text-sm font-medium text-white/70">{subtitle}</p>}
                </div>

                <form onSubmit={handleSubmit} className="mt-[72px] flex w-full flex-col gap-[19px]">
                    <p className="text-center text-[14px] font-medium text-white">
                        {view === 'login' ? 'Entre com sua conta' : 'Recuperar senha'}
                    </p>

                    {error && (
                        <div className="flex items-center gap-2 rounded-2xl border border-red-400/40 bg-red-500/15 px-3 py-2.5 text-sm text-red-300">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {successMessage && (
                        <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-2.5 text-sm text-emerald-200">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>{successMessage}</span>
                        </div>
                    )}

                    <label className="auth-field">
                        <Mail className="h-6 w-6 shrink-0 text-white/90" />
                        <input
                            type="email"
                            placeholder={portal === 'panel' ? 'e-mail institucional' : 'e-mail de acesso'}
                            autoComplete="username"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </label>

                    {view === 'login' && (
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
                                onClick={() => {
                                    setView('forgot');
                                    setError('');
                                    setSuccessMessage('');
                                }}
                                className="-mt-1 self-end text-[12px] font-bold text-[var(--sgf-primary)] hover:underline"
                            >
                                Esqueceu a senha?
                            </button>
                        </>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="flex h-[55px] w-full items-center justify-center gap-[10px] rounded-[27.5px] bg-[var(--sgf-primary)] text-[16px] font-bold text-white transition-opacity active:scale-[.98] disabled:opacity-70"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="h-[18px] w-[18px] animate-spin" />
                                {view === 'login' ? 'Entrando...' : 'Enviando...'}
                            </>
                        ) : (
                            <>
                                {view === 'login' ? 'Entrar' : 'Enviar link de recuperação'}
                                <ArrowRight className="h-[18px] w-[18px]" />
                            </>
                        )}
                    </button>

                    {view === 'forgot' && (
                        <button
                            type="button"
                            onClick={() => {
                                setView('login');
                                setError('');
                                setSuccessMessage('');
                            }}
                            className="text-center text-sm font-semibold text-white/80 hover:text-white"
                        >
                            Voltar para o login
                        </button>
                    )}
                </form>

                <p className="mb-[36px] mt-auto pt-10 text-center text-[11.667px] font-medium text-white/80">
                    © Exattus Rotta {new Date().getFullYear()}
                </p>
            </div>
        </div>
    );
}
