import { useEffect, useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton, SGFInput, SGFSelect } from '@/components/sgf';
import { User, Plus } from '@/components/sgf/icons';
import { departmentsApi } from '@/lib/supabase-api';
import { supabase } from '@/lib/supabase';
import { NewSecretarioModal } from '@/components/settings/NewSecretarioModal';
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
    const [selectedSecretarioId, setSelectedSecretarioId] = useState('');
    const [showNewSecretarioModal, setShowNewSecretarioModal] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Busca os secretários cadastrados
    const { data: secretarios = [] } = useQuery({
        queryKey: ['secretarios', 'list-profiles'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, email, department_id, role')
                .in('role', ['secretario', 'manager', 'ADMIN', 'gestor']);
            if (error) return [];
            return data || [];
        },
        enabled: isOpen,
    });

    const secretarioOptions = useMemo(() => {
        const list = secretarios.map((s) => ({
            value: s.id,
            label: s.full_name ? `${s.full_name} (${s.email || 'sem e-mail'})` : s.email || 'Secretário',
        }));
        return [{ value: '', label: 'Nenhum (selecionar depois)' }, ...list];
    }, [secretarios]);

    // Sincroniza form com a secretaria a editar (ou limpa para criar)
    useEffect(() => {
        if (isOpen) {
            setName(department?.name ?? '');
            setCode(department?.code ?? '');
            setError(null);
            
            // Encontra o secretário atualmente vinculado a essa secretaria
            if (department?.id && secretarios.length > 0) {
                const currentSec = secretarios.find((s) => s.department_id === department.id);
                setSelectedSecretarioId(currentSec?.id || '');
            } else {
                setSelectedSecretarioId('');
            }
        }
    }, [isOpen, department, secretarios]);

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
            let deptId = department?.id;

            if (isEditing && department) {
                await updateMutation.mutateAsync({ id: department.id, name: trimmedName, code: trimmedCode });
            } else {
                const created = await createMutation.mutateAsync({ name: trimmedName, code: trimmedCode });
                deptId = created?.id;
            }

            // Se selecionou um secretário, vincula ele a esta secretaria
            if (selectedSecretarioId && deptId) {
                await supabase
                    .from('profiles')
                    .update({ department_id: deptId })
                    .eq('id', selectedSecretarioId);
            }

            // Invalida tudo que depende de secretarias
            await queryClient.invalidateQueries({ queryKey: ['departments'] });
            await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            await queryClient.invalidateQueries({ queryKey: ['secretarios'] });
            onClose();
        } catch (err) {
            const message = (err as { message?: string })?.message
                ?? 'Não foi possível salvar a secretaria.';
            if (message.toLowerCase().includes('duplicate') || message.includes('23505')) {
                setError('Já existe uma secretaria com esse código.');
            } else {
                setError(message);
            }
        }
    };

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title={isEditing ? 'Editar secretaria' : 'Nova secretaria'}
                description={isEditing
                    ? 'Atualize os dados e o secretário responsável desta pasta.'
                    : 'Cadastre uma secretaria para vincular veículos, motoristas e o secretário responsável.'}
                size="md"
                surfaceBg
                footer={(
                    <ModalFooter>
                        <SGFButton variant="ghost" onClick={onClose} disabled={isSaving} className="!rounded-full">
                            Cancelar
                        </SGFButton>
                        <SGFButton onClick={handleSubmit as unknown as () => void} disabled={isSaving} className="!rounded-full">
                            {isSaving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Cadastrar secretaria'}
                        </SGFButton>
                    </ModalFooter>
                )}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <SGFInput
                        label="Nome da secretaria"
                        placeholder="Ex.: Secretaria de Saúde"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        fullWidth
                        autoFocus
                        inputClassName="!rounded-full !bg-white !border !border-slate-200 !py-2.5 !shadow-[var(--sgf-shadow-xs)] hover:!border-slate-300 focus:!border-[var(--sgf-primary)] focus:!outline-none focus:!ring-4 focus:!ring-emerald-500/10 focus:!bg-white"
                    />
                    <SGFInput
                        label="Código"
                        placeholder="Ex.: SAUDE"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        hint="Letras e números, em maiúsculo. Único por secretaria."
                        fullWidth
                        inputClassName="!rounded-full !bg-white !border !border-slate-200 !py-2.5 !shadow-[var(--sgf-shadow-xs)] hover:!border-slate-300 focus:!border-[var(--sgf-primary)] focus:!outline-none focus:!ring-4 focus:!ring-emerald-500/10 focus:!bg-white"
                    />

                    <div className="pt-2 border-t border-slate-200/60">
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-[var(--sgf-text-sm)] font-[var(--sgf-font-semibold)] text-[var(--sgf-text-primary)]">
                                Secretário responsável
                            </label>
                            <button
                                type="button"
                                onClick={() => setShowNewSecretarioModal(true)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Cadastrar novo secretário
                            </button>
                        </div>
                        <SGFSelect
                            options={secretarioOptions}
                            value={selectedSecretarioId}
                            onChange={setSelectedSecretarioId}
                            placeholder="Selecione o secretário..."
                            icon={User}
                            fullWidth
                            triggerClassName="!rounded-full !bg-white !border !border-slate-200 !py-2.5 !shadow-[var(--sgf-shadow-xs)] hover:!border-slate-300 focus:!border-[var(--sgf-primary)] focus:!ring-4 focus:!ring-emerald-500/10"
                        />
                        <p className="mt-1.5 text-xs text-slate-500">
                            Selecione o usuário que gerenciará os acessos desta pasta ou cadastre um novo.
                        </p>
                    </div>

                    {error && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
                            {error}
                        </div>
                    )}
                </form>
            </Modal>

            <NewSecretarioModal
                isOpen={showNewSecretarioModal}
                onClose={() => {
                    setShowNewSecretarioModal(false);
                    queryClient.invalidateQueries({ queryKey: ['secretarios'] });
                }}
                defaultDepartmentId={department?.id}
            />
        </>
    );
}

export default DepartmentFormModal;
