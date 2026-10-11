import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { DollarSign, Loader2, Plus } from '@/components/sgf/icons';
import { departmentsApi } from '@/lib/supabase-api';
import { costCentersApi, type CostCenter } from '@/lib/fleet-api';
import { useAuth } from '@/contexts/AuthContext';

/** Gestão de centros de custo (listar, criar, editar, ativar/desativar). */
export function CostCentersSection() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const canManage = ['admin', 'gestor', 'superadmin'].includes(user?.accountRole ?? '');
    const [editing, setEditing] = useState<CostCenter | 'new' | null>(null);

    const { data: centers = [], isLoading, isError } = useQuery({
        queryKey: ['cost-centers'],
        queryFn: () => costCentersApi.getAll(),
    });

    const toggle = useMutation({
        mutationFn: ({ id, active }: { id: string; active: boolean }) => costCentersApi.update(id, { active }),
        onSuccess: (_, v) => {
            toast.success(v.active ? 'Centro de custo ativado.' : 'Centro de custo desativado.');
            queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
        },
        onError: (e) => toast.error((e as Error).message || 'Não foi possível alterar o centro de custo.'),
    });

    return (
        <SGFCard title="Centros de custo" icon={DollarSign} padding="lg" className="border border-slate-200/80">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500">Usados para ratear as despesas da frota. Cada veículo pode ser vinculado a um centro.</p>
                {canManage && (
                    <SGFButton size="sm" icon={Plus} onClick={() => setEditing('new')} className="!rounded-full">
                        Novo centro de custo
                    </SGFButton>
                )}
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                </div>
            ) : isError ? (
                <p className="py-6 text-center text-sm text-rose-600">Não foi possível carregar os centros de custo.</p>
            ) : centers.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">Nenhum centro de custo cadastrado.</p>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {centers.map((c) => (
                        <li key={c.id} className={`flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between ${c.active ? '' : 'opacity-60'}`}>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-sm font-bold text-slate-900">{c.code}</span>
                                    <span className="text-sm text-slate-700">{c.name}</span>
                                    <SGFBadge variant={c.active ? 'success' : 'default'} size="sm">{c.active ? 'Ativo' : 'Inativo'}</SGFBadge>
                                </div>
                                <p className="text-xs text-slate-500">{c.departments?.name ?? 'Sem secretaria vinculada'}</p>
                            </div>
                            {canManage && (
                                <div className="flex shrink-0 gap-2">
                                    <SGFButton size="sm" variant="outline" onClick={() => setEditing(c)} className="!rounded-full">Editar</SGFButton>
                                    <SGFButton
                                        size="sm"
                                        variant="ghost"
                                        disabled={toggle.isPending}
                                        onClick={() => toggle.mutate({ id: c.id, active: !c.active })}
                                        className="!rounded-full"
                                    >
                                        {c.active ? 'Desativar' : 'Ativar'}
                                    </SGFButton>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <Modal
                isOpen={editing !== null}
                onClose={() => setEditing(null)}
                title={editing && editing !== 'new' ? 'Editar centro de custo' : 'Novo centro de custo'}
                size="md"
            >
                {editing !== null && (
                    <CostCenterForm
                        key={editing === 'new' ? 'new' : editing.id}
                        center={editing === 'new' ? null : editing}
                        onClose={() => setEditing(null)}
                        onSaved={() => queryClient.invalidateQueries({ queryKey: ['cost-centers'] })}
                    />
                )}
            </Modal>
        </SGFCard>
    );
}

function CostCenterForm({ center, onClose, onSaved }: {
    center: CostCenter | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [code, setCode] = useState(center?.code ?? '');
    const [name, setName] = useState(center?.name ?? '');
    const [departmentId, setDepartmentId] = useState(center?.department_id ?? '');
    const [error, setError] = useState<string | null>(null);

    const { data: departments = [] } = useQuery({
        queryKey: ['departments'],
        queryFn: () => departmentsApi.getAll(),
    });

    const mutation = useMutation({
        mutationFn: () => {
            const payload = { code: code.trim(), name: name.trim(), department_id: departmentId || null };
            return center ? costCentersApi.update(center.id, payload) : costCentersApi.create(payload);
        },
        onSuccess: () => {
            toast.success(center ? 'Centro de custo atualizado.' : 'Centro de custo criado.');
            onSaved();
            onClose();
        },
        onError: (e) => setError((e as Error).message || 'Não foi possível salvar.'),
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!code.trim()) return setError('Informe o código.');
        if (!name.trim()) return setError('Informe o nome.');
        mutation.mutate();
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            <SGFInput label="Código" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex.: 02.05.01" fullWidth />
            <SGFInput label="Nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Transporte escolar" fullWidth />
            <SGFSelect
                label="Secretaria (opcional)"
                options={[{ value: '', label: 'Sem secretaria' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
                value={departmentId}
                onChange={setDepartmentId}
                fullWidth
            />
            {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
            <ModalFooter>
                <SGFButton type="button" variant="ghost" onClick={onClose}>Cancelar</SGFButton>
                <SGFButton type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Salvando...' : 'Salvar'}</SGFButton>
            </ModalFooter>
        </form>
    );
}
