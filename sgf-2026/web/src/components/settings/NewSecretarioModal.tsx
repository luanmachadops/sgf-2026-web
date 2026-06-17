import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { Loader2, Save } from '@/components/sgf/icons';
import { departmentsApi } from '@/lib/supabase-api';
import { managerAccessApi } from '@/lib/backend-api';

interface NewSecretarioModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function NewSecretarioModal({ isOpen, onClose }: NewSecretarioModalProps) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [departmentId, setDepartmentId] = useState('');

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

    const reset = () => { setName(''); setEmail(''); setPassword(''); setDepartmentId(''); };

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
            footer={(
                <ModalFooter>
                    <SGFButton variant="ghost" onClick={() => { reset(); onClose(); }} disabled={isBusy}>Cancelar</SGFButton>
                    <SGFButton icon={isBusy ? Loader2 : Save} onClick={handleSubmit} disabled={isBusy}>
                        {isBusy ? 'Criando...' : 'Criar secretário'}
                    </SGFButton>
                </ModalFooter>
            )}
        >
            <div className="space-y-4">
                <SGFInput label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do secretário" fullWidth />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFInput label="E-mail (login)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@prefeitura.gov.br" fullWidth />
                    <SGFInput label="Senha inicial" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" fullWidth />
                </div>
                <SGFSelect label="Secretaria" options={departmentOptions} value={departmentId} onChange={setDepartmentId} placeholder="Selecione a secretaria" fullWidth />
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-500">
                    🔒 O secretário só verá e gerenciará dados (motoristas, veículos, manutenções, abastecimentos) da <strong>secretaria selecionada</strong>.
                </div>
            </div>
        </Modal>
    );
}

export default NewSecretarioModal;
