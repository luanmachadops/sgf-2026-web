import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, Mail, Lock, AlertCircle } from '@/components/sgf/icons';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';

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

    return (
        <div className="sgf-auth-background flex min-h-screen p-4 sm:p-6">
            <div className="relative z-[1] m-auto w-full max-w-md space-y-8 rounded-[2.5rem] bg-white p-8 shadow-2xl sm:p-12">
                {/* Logo */}
                <div className="text-center">
                    <div className={`mx-auto flex h-20 w-20 items-center justify-center ${branding.logoUrl || branding.sealUrl ? '' : 'overflow-hidden rounded-3xl bg-[var(--sgf-primary)] shadow-lg shadow-emerald-500/30'}`}>
                        {branding.logoUrl || branding.sealUrl ? (
                            <img src={branding.logoUrl || branding.sealUrl} alt={branding.name} className="h-full w-full object-contain" />
                        ) : (
                            <Car className="h-10 w-10 text-white" />
                        )}
                    </div>
                    <h1 className="mt-6 text-3xl font-bold text-gray-900">{branding.name}</h1>
                    <p className="mt-2 text-sm text-slate-500">
                        {portal === 'posto'
                            ? 'Sistema de Abastecimento'
                            : portal === 'oficina'
                                ? 'Sistema de Manutenção'
                                : branding.city && branding.state
                                    ? `${branding.city} - ${branding.state}`
                                    : 'Gestão inteligente de frotas'}
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                    {error && (
                        <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-4 text-sm text-red-800 animate-in fade-in slide-in-from-top-2">
                            <AlertCircle className="h-5 w-5 flex-shrink-0" />
                            <p>{error}</p>
                        </div>
                    )}

                    {successMessage && (
                        <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800 animate-in fade-in slide-in-from-top-2">
                            <AlertCircle className="h-5 w-5 flex-shrink-0" />
                            <p>{successMessage}</p>
                        </div>
                    )}

                    <div className="space-y-4">
                        <SGFInput
                            label={portal === 'panel' ? 'E-mail institucional' : 'E-mail de acesso'}
                            type="email"
                            placeholder={portal === 'panel' ? 'usuario@prefeitura.gov.br' : 'contato@empresa.com.br'}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            icon={Mail}
                            required
                            inputClassName={`!rounded-full transition-colors duration-200 autofill:!shadow-[inset_0_0_0_1000px_#E3E9E7] ${
                                email 
                                    ? '!bg-[#E3E9E7] focus:!bg-[#E3E9E7]' 
                                    : '!bg-white focus:!bg-white'
                            }`}
                        />

                        {view === 'login' && (
                            <>
                                <SGFInput
                                    label="Senha"
                                    type="password"
                                    placeholder="Digite sua senha"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    icon={Lock}
                                    required
                                    inputClassName={`!rounded-full transition-colors duration-200 autofill:!shadow-[inset_0_0_0_1000px_#E3E9E7] ${
                                        password 
                                            ? '!bg-[#E3E9E7] focus:!bg-[#E3E9E7]' 
                                            : '!bg-white focus:!bg-white'
                                    }`}
                                />
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setView('forgot');
                                            setError('');
                                            setSuccessMessage('');
                                        }}
                                        className="text-sm font-medium text-[var(--sgf-primary)] hover:text-emerald-700 transition-colors"
                                    >
                                        Esqueci minha senha
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    <SGFButton
                        type="submit"
                        variant="primary"
                        size="lg"
                        loading={isLoading}
                        fullWidth
                        className="mt-6 shadow-xl shadow-emerald-500/20 !rounded-full"
                    >
                        {view === 'login' ? 'Entrar' : 'Enviar Link de Recuperação'}
                    </SGFButton>

                    {view === 'forgot' && (
                        <button
                            type="button"
                            onClick={() => {
                                setView('login');
                                setError('');
                                setSuccessMessage('');
                            }}
                            className="w-full text-center text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors mt-4"
                        >
                            Voltar para o Login
                        </button>
                    )}
                </form>

                {/* Footer */}
                <div className="text-center text-xs text-slate-400">
                    <p>© 2026 Exattus Rotta — Todos os direitos reservados</p>
                    <p className="mt-1">Setor de Obras e Garagem</p>
                </div>
            </div>
        </div>
    );
}
