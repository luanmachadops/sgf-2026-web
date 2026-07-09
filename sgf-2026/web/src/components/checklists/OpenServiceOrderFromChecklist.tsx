import { useMemo, useState } from 'react';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { SGFTextarea } from '@/components/sgf/SGFTextarea';
import { SGFButton } from '@/components/sgf/SGFButton';
import { Loader2, Save, Car, User } from '@/components/sgf/icons';
import { toast } from 'sonner';
import { useCreateMaintenance } from '@/hooks/useMaintenances';
import { isCriticalItem, CHECKLIST_STATE_LABEL } from '@/components/checklists/ChecklistItemsList';
import type { ChecklistListRecord } from '@/lib/supabase-api';
import type { Tables } from '@/types/database.types';

type ChecklistItemRow = { id: string; item_key: string; label: string; state: Tables<'checklist_items'>['state'] };

const priorityOptions = [
    { value: 'baixa', label: 'Baixa' },
    { value: 'media', label: 'Média' },
    { value: 'alta', label: 'Alta' },
];

interface Props {
    checklist: ChecklistListRecord;
    items: ChecklistItemRow[];
    onSuccess: () => void;
    onCancel: () => void;
}

/**
 * Modal de criação de O.S. pré-preenchida a partir de um checklist com item
 * problemático. Vincula `checklist_id` para o registro aparecer como "O.S. aberta"
 * na página Checklists.
 */
export function OpenServiceOrderFromChecklist({ checklist, items, onSuccess, onCancel }: Props) {
    const createMaintenance = useCreateMaintenance();

    const problemItems = useMemo(() => items.filter((i) => i.state !== 'ok'), [items]);
    const hasCriticalProblem = useMemo(() => problemItems.some((i) => isCriticalItem(i.item_key)), [problemItems]);

    const defaultDescription = useMemo(() => {
        if (problemItems.length === 0) return '';
        const lines = problemItems.map((i) => `- ${i.label}: ${CHECKLIST_STATE_LABEL[i.state] ?? i.state}`);
        return `Itens reprovados no checklist:\n${lines.join('\n')}`;
    }, [problemItems]);

    const [priority, setPriority] = useState<'baixa' | 'media' | 'alta'>(hasCriticalProblem ? 'alta' : 'media');
    const [description, setDescription] = useState(defaultDescription);
    const [category, setCategory] = useState('Revisão geral');

    const vehicleLabel = [checklist.vehicles?.brand, checklist.vehicles?.model].filter(Boolean).join(' ') || checklist.vehicles?.plate || 'Veículo';
    const driverName = checklist.profiles?.full_name ?? '—';

    const handleSubmit = async () => {
        if (!checklist.vehicle_id) {
            toast.error('Checklist sem veículo vinculado.');
            return;
        }
        if (description.trim().length < 5) {
            toast.error('Descreva o problema (mínimo 5 caracteres).');
            return;
        }
        try {
            await createMaintenance.mutateAsync({
                vehicle_id: checklist.vehicle_id,
                driver_id: checklist.driver_id,
                checklist_id: checklist.id,
                category,
                priority,
                description: description.trim(),
                status: 'pendente',
            });
            toast.success('Ordem de serviço aberta a partir do checklist.');
            onSuccess();
        } catch {
            toast.error('Erro ao abrir a ordem de serviço.');
        }
    };

    return (
        <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <Car className="h-5 w-5 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Veículo</p>
                        <p className="truncate text-sm font-semibold text-slate-800">{vehicleLabel}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <User className="h-5 w-5 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Motorista</p>
                        <p className="truncate text-sm font-semibold text-slate-800">{driverName}</p>
                    </div>
                </div>
            </div>

            <SGFSelect
                label="Prioridade"
                options={priorityOptions}
                value={priority}
                onChange={(v) => setPriority(v as 'baixa' | 'media' | 'alta')}
                hint={hasCriticalProblem ? 'Sugerida em "Alta" por item crítico (freios/pneus/luzes) reprovado.' : undefined}
                fullWidth
            />

            <SGFSelect
                label="Categoria"
                options={[
                    { value: 'Revisão geral', label: 'Revisão geral' },
                    { value: 'Freios', label: 'Freios' },
                    { value: 'Pneus', label: 'Pneus' },
                    { value: 'Elétrica', label: 'Elétrica' },
                    { value: 'Motor', label: 'Motor' },
                    { value: 'Outro', label: 'Outro' },
                ]}
                value={category}
                onChange={setCategory}
                fullWidth
            />

            <SGFTextarea
                label="Descrição do Problema"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                maxLength={800}
                showCount
                fullWidth
            />

            <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                <SGFButton type="button" variant="ghost" onClick={onCancel} disabled={createMaintenance.isPending}>
                    Cancelar
                </SGFButton>
                <SGFButton
                    type="button"
                    icon={createMaintenance.isPending ? Loader2 : Save}
                    disabled={createMaintenance.isPending}
                    onClick={handleSubmit}
                >
                    {createMaintenance.isPending ? 'Abrindo...' : 'Abrir O.S.'}
                </SGFButton>
            </div>
        </div>
    );
}

export default OpenServiceOrderFromChecklist;
