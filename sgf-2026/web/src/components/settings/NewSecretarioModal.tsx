import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { Eye, EyeOff, Loader2, Save, Sparkles } from '@/components/sgf/icons';
import { departmentsApi } from '@/lib/supabase-api';
import { managerAccessApi } from '@/lib/backend-api';

interface NewSecretarioModalProps {
    isOpen: boolean;
    onClose: () => void;
    defaultDepartmentId?: string;
}

function WhatsAppIcon({ className = 'h-4 w-4' }: { className?: string }) {
    return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l.999 1.59-1.048 3.83 3.916-1.027.876.518z" />
        </svg>
    );
}

function generateRandomPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let res = '';
    for (let i = 0; i < 8; i++) {
        res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
}

export function NewSecretarioModal({ isOpen, onClose, defaultDepartmentId }: NewSecretarioModalProps) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [departmentId, setDepartmentId] = useState(defaultDepartmentId || '');
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        if (isOpen && defaultDepartmentId) {
            setDepartmentId(defaultDepartmentId);
        }
    }, [isOpen, defaultDepartmentId]);

    const { data: departments = [] } = useQuery({
        queryKey: ['departments', 'list-all'],
        queryFn: () => departmentsApi.getAll(),
    });
    const departmentOptions = useMemo(
        () => departments.map((d) => ({ value: d.id, label: d.name })),
        [departments],
    );

    const createSecretario = useMutation({
        mutationFn: () => managerAccessApi.createSecretario({ name: name.trim(), email: email.trim(), password, departmentId }),
    });

    const reset = () => {
        setName('');
        setEmail('');
        setPassword('');
        setDepartmentId(defaultDepartmentId || '');
        setShowPassword(false);
    };

    const handleGeneratePassword = () => {
        const newPwd = generateRandomPassword();
        setPassword(newPwd);
        setShowPassword(true);
        toast.success('Senha aleatória gerada com sucesso!');
    };

    const handleSendWhatsApp = () => {
        if (!email.trim() || !password) {
            return toast.error('Preencha ao menos o e-mail e a senha para enviar o acesso por WhatsApp.');
        }
        const deptName = departmentOptions.find(d => d.value === departmentId)?.label || 'Secretaria';
        const msg = `*Acesso ao SGF 2026 - Painel do Gestor*\n\n` +
            `Olá${name ? `, *${name.trim()}*` : ''}!\n` +
            `Seu acesso de Secretário no sistema de gestão de frota foi criado:\n\n` +
            `📧 *E-mail:* ${email.trim()}\n` +
            `🔑 *Senha:* ${password}\n` +
            `🏛️ *Secretaria:* ${deptName}\n\n` +
            `Acesse o painel para gerenciar a frota municipal.`;

        const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    };

    const handleSubmit = async () => {
        if (!name.trim()) return toast.error('Informe o nome.');
        if (!email.includes('@')) return toast.error('E-mail inválido.');
        if (password.length < 6) return toast.error('Senha deve ter ao menos 6 caracteres.');
        if (!departmentId) return toast.error('Selecione a secretaria.');
        try {
            await createSecretario.mutateAsync();
            toast.success('Secretário criado! Ele acessa o painel com e-mail e senha.');
            reset();
            onClose();
        } catch (err) {
            toast.error((err as { message?: string })?.message ?? 'Erro ao criar secretário.');
        }
    };

    const isBusy = createSecretario.isPending;

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => { reset(); onClose(); }}
            title="Novo secretário"
            description="O secretário acessa o painel restrito à secretaria escolhida (vê e gerencia apenas a própria pasta)."
            size="md"
            surfaceBg
            footer={(
                <ModalFooter className="flex-wrap sm:flex-nowrap gap-2">
                    <SGFButton
                        type="button"
                        onClick={handleSendWhatsApp}
                        icon={WhatsAppIcon}
                        className="!rounded-full !bg-[#25D366] hover:!bg-[#20ba5a] !text-white !border-0 shadow-sm transition-all active:scale-[0.98]"
                    >
                        Enviar Acesso
                    </SGFButton>
                    <SGFButton icon={isBusy ? Loader2 : Save} onClick={handleSubmit} disabled={isBusy} className="!rounded-full">
                        {isBusy ? 'Criando...' : 'Criar secretário'}
                    </SGFButton>
                </ModalFooter>
            )}
        >
            <div className="space-y-4">
                <SGFInput
                    label="Nome completo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome do secretário"
                    fullWidth
                    inputClassName="!rounded-full !bg-white !border !border-slate-200 !py-2.5 !shadow-[var(--sgf-shadow-xs)] hover:!border-slate-300 focus:!border-[var(--sgf-primary)] focus:!outline-none focus:!ring-4 focus:!ring-emerald-500/10 focus:!bg-white"
                />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFInput
                        label="E-mail (login)"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="email@prefeitura.gov.br"
                        fullWidth
                        inputClassName="!rounded-full !bg-white !border !border-slate-200 !py-2.5 !shadow-[var(--sgf-shadow-xs)] hover:!border-slate-300 focus:!border-[var(--sgf-primary)] focus:!outline-none focus:!ring-4 focus:!ring-emerald-500/10 focus:!bg-white"
                    />
                    
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-[var(--sgf-text-sm)] font-[var(--sgf-font-semibold)] text-[var(--sgf-text-primary)]">
                                Senha inicial
                            </label>
                            <button
                                type="button"
                                onClick={handleGeneratePassword}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                            >
                                <Sparkles className="h-3.5 w-3.5" />
                                Gerar senha
                            </button>
                        </div>
                        <SGFInput
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Mínimo 6 caracteres"
                            fullWidth
                            icon={showPassword ? EyeOff : Eye}
                            iconPosition="right"
                            onIconClick={() => setShowPassword(!showPassword)}
                            inputClassName="!rounded-full !bg-white !border !border-slate-200 !py-2.5 !shadow-[var(--sgf-shadow-xs)] hover:!border-slate-300 focus:!border-[var(--sgf-primary)] focus:!outline-none focus:!ring-4 focus:!ring-emerald-500/10 focus:!bg-white"
                        />
                    </div>
                </div>

                <SGFSelect
                    label="Secretaria"
                    options={departmentOptions}
                    value={departmentId}
                    onChange={setDepartmentId}
                    placeholder="Selecione a secretaria"
                    fullWidth
                    triggerClassName="!rounded-full !bg-white !border !border-slate-200 !py-2.5 !shadow-[var(--sgf-shadow-xs)] hover:!border-slate-300 focus:!border-[var(--sgf-primary)] focus:!ring-4 focus:!ring-emerald-500/10"
                />

                <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-xs text-slate-500">
                    🔒 O secretário só verá e gerenciará dados (motoristas, veículos, manutenções, abastecimentos) da <strong>secretaria selecionada</strong>.
                </div>
            </div>
        </Modal>
    );
}

export default NewSecretarioModal;
