import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, Mail, Lock, AlertCircle } from '@/components/sgf/icons';
import { useAuth } from '@/contexts/AuthContext';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';

import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function Login() {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [view, setView] = useState<'login' | 'forgot'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');
        setIsLoading(true);

        try {
            if (view === 'login') {
                await login(email, password);
                navigate('/');
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
        } catch (err: any) {
            console.error(err);
            if (view === 'login') {
                setError(err.response?.data?.message || 'Erro ao fazer login. Verifique suas credenciais.');
            } else {
                setError(err.message || 'Erro ao enviar email de recuperação.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-gradient-to-br from-[var(--sgf-dark)] to-[var(--sgf-primary)]">
            <div className="m-auto w-full max-w-md space-y-8 rounded-[2.5rem] bg-white p-12 shadow-2xl">
                {/* Logo */}
                <div className="text-center">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--sgf-primary)] shadow-lg shadow-emerald-500/30">
                        <Car className="h-10 w-10 text-white" />
                    </div>
                    <h1 className="mt-6 text-3xl font-bold text-gray-900">SGF 2026</h1>
                    <p className="mt-2 text-sm text-gray-600">Sistema de Gestão de Frotas</p>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--sgf-primary)] mt-1">Painel de Gestão</p>
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
                            label="Email Institucional"
                            type="email"
                            placeholder="usuario@prefeitura.gov.br"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            icon={Mail}
                            required
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
                        className="mt-6 shadow-xl shadow-emerald-500/20"
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
                    <p>© 2026 Prefeitura Municipal</p>
                    <p className="mt-1">Setor de Obras e Garagem</p>
                </div>
            </div>
        </div>
    );
}
