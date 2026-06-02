import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton, SGFInput } from '@/components/sgf';
import { departmentsApi } from '@/lib/supabase-api';
import type { Tables } from '@/types/database.types';

export interface DepartmentFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Quando fornecido, o modal opera em modo "editar"; sem ele, é "criar". */
    department?: Tables<'departments'> | null;
}

export function DepartmentFormModal({ isOpen, onClose, department }: DepartmentFormModalProps) {
    const queryClient = useQueryClient();
    const isEditing = Boolean(department);

    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Sincroniza form com a secretaria a editar (ou limpa para criar)
    useEffect(() => {
        if (isOpen) {
            setName(department?.name ?? '');
            setCode(department?.code ?? '');
            setError(null);
        }
    }, [isOpen, department]);

    const createMutation = useMutation({
        mutationFn: (payload: { name: string; code: string }) =>
            departmentsApi.create({ name: payload.name, code: payload.code }),
    });

    const updateMutation = useMutation({
        mutationFn: (payload: { id: string; name: string; code: string }) =>
            departmentsApi.update(payload.id, { name: payload.name, code: payload.code }),
    });

    const isSaving = createMutation.isPending || updateMutation.isPending;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const trimmedName = name.trim();
        const trimmedCode = code.trim().toUpperCase();

        if (!trimmedName) {
            setError('Informe o nome da secretaria.');
            return;
        }
        if (!trimmedCode) {
            setError('Informe um código curto (ex.: SAUDE, OBRAS).');
            return;
        }

        try {
            if (isEditing && department) {
                await updateMutation.mutateAsync({ id: department.id, name: trimmedName, code: trimmedCode });
            } else {
                await createMutation.mutateAsync({ name: trimmedName, code: trimmedCode });
            }
            // Invalida tudo que depende de secretarias (overview, distribuições, detail)
            await queryClient.invalidateQueries({ queryKey: ['departments'] });
            await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            onClose();
        } catch (err) {
            const message = (err as { message?: string })?.message
                ?? 'Não foi possível salvar a secretaria.';
            // Erro comum: code duplicado (constraint UNIQUE)
            if (message.toLowerCase().includes('duplicate') || message.includes('23505')) {
                setError('Já existe uma secretaria com esse código.');
            } else {
                setError(message);
            }
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditing ? 'Editar secretaria' : 'Nova secretaria'}
            description={isEditing
                ? 'Atualize os dados desta pasta.'
                : 'Cadastre uma pasta para vincular veículos, motoristas e gastos.'}
            size="md"
            footer={(
                <ModalFooter>
                    <SGFButton variant="ghost" onClick={onClose} disabled={isSaving}>
                        Cancelar
                    </SGFButton>
                    <SGFButton onClick={handleSubmit as unknown as () => void} disabled={isSaving}>
                        {isSaving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Cadastrar secretaria'}
                    </SGFButton>
                </ModalFooter>
            )}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <SGFInput
                    label="Nome"
                    placeholder="Ex.: Secretaria de Saúde"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    fullWidth
                    autoFocus
                />
                <SGFInput
                    label="Código"
                    placeholder="Ex.: SAUDE"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    hint="Letras e números, em maiúsculo. Único por secretaria."
                    fullWidth
                />
                {error && (
                    <div className="rounded-[var(--sgf-radius-base)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
                        {error}
                    </div>
                )}
            </form>
        </Modal>
    );
}

export default DepartmentFormModal;
