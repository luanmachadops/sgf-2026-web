import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { Modal } from '@/components/ui/Modal';
import { Clipboard, User, Calendar, CheckCircle, Loader2 } from '@/components/sgf/icons';
import { checklistsApi } from '@/lib/supabase-api';
import { formatDateTime } from '@/lib/utils';
import { ChecklistItemsList } from '@/components/checklists/ChecklistItemsList';
import type { Tables } from '@/types/database.types';

interface Props {
    vehicleId: string;
}

type ChecklistRow = Tables<'checklists'> & {
    vehicles?: { id: string; plate: string } | null;
    profiles?: { id: string; full_name: string } | null;
};

type ChecklistItemRow = Tables<'checklist_items'>;

export function VehicleChecklistsTab({ vehicleId }: Props) {
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const { data: checklists = [], isLoading } = useQuery({
        queryKey: ['vehicle', vehicleId, 'checklists'],
        queryFn: () => checklistsApi.getAll({ vehicleId, limit: 50 }),
        enabled: Boolean(vehicleId),
    });

    const { data: items = [], isLoading: itemsLoading } = useQuery({
        queryKey: ['checklist', selectedId, 'items'],
        queryFn: () => checklistsApi.getItems(selectedId!),
        enabled: Boolean(selectedId),
    });

    const rows = checklists as unknown as ChecklistRow[];
    const selected = rows.find((c) => c.id === selectedId) ?? null;
    const itemRows = items as ChecklistItemRow[];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <SGFCard>
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <Clipboard className="h-8 w-8 text-slate-300" />
                    <p className="text-sm font-medium text-slate-500">Nenhum checklist registrado para este veículo.</p>
                </div>
            </SGFCard>
        );
    }

    return (
        <div className="space-y-3">
            {rows.map((c) => {
                const driverName = c.profiles?.full_name ?? '—';
                return (
                    <button
                        key={c.id}
                        onClick={() => setSelectedId(c.id)}
                        className="w-full text-left"
                    >
                        <SGFCard padding="sm" className="transition-colors hover:border-emerald-300">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="flex items-center gap-1.5 text-sm text-slate-600">
                                        <Calendar className="h-4 w-4 text-slate-400" />
                                        {formatDateTime(c.created_at)}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                                        <User className="h-4 w-4 text-slate-400" />
                                        {driverName}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {c.notes && (
                                        <span className="hidden sm:inline text-xs text-slate-400 truncate max-w-[240px]">{c.notes}</span>
                                    )}
                                    {c.quick_confirm ? (
                                        <SGFBadge variant="default" icon={CheckCircle}>Confirmação rápida</SGFBadge>
                                    ) : null}
                                </div>
                            </div>
                        </SGFCard>
                    </button>
                );
            })}

            <Modal
                isOpen={Boolean(selectedId)}
                onClose={() => setSelectedId(null)}
                title="Detalhes do checklist"
                description={selected ? `${formatDateTime(selected.created_at)} — ${selected.profiles?.full_name ?? '—'}` : undefined}
                size="md"
            >
                <ChecklistItemsList items={itemRows} loading={itemsLoading} />
            </Modal>
        </div>
    );
}

export default VehicleChecklistsTab;
