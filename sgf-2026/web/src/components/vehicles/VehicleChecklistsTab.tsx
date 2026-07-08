import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { Modal } from '@/components/ui/Modal';
import { Clipboard, User, Calendar, CheckCircle, AlertTriangle, Loader2 } from '@/components/sgf/icons';
import { checklistsApi } from '@/lib/supabase-api';
import { formatDateTime } from '@/lib/utils';
import type { Tables } from '@/types/database.types';

interface Props {
    vehicleId: string;
}

type ChecklistRow = Tables<'checklists'> & {
    vehicles?: { id: string; plate: string } | null;
    profiles?: { id: string; full_name: string } | null;
};

type ChecklistItemRow = Tables<'checklist_items'>;

const STATE_LABEL: Record<string, string> = {
    ok: 'OK',
    atencao: 'Atenção',
    pendente: 'Pendente',
};

const STATE_BADGE: Record<string, 'success' | 'warning' | 'error'> = {
    ok: 'success',
    atencao: 'warning',
    pendente: 'error',
};

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
    const problemItems = itemRows.filter((i) => i.state !== 'ok');

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
                {itemsLoading ? (
                    <div className="flex items-center justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                    </div>
                ) : itemRows.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-400">Nenhum item registrado neste checklist.</p>
                ) : (
                    <div className="space-y-4">
                        {problemItems.length > 0 && (
                            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                                <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
                                <p className="text-sm font-semibold text-rose-700">
                                    {problemItems.length} {problemItems.length === 1 ? 'item precisa' : 'itens precisam'} de atenção.
                                </p>
                            </div>
                        )}
                        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                            {itemRows.map((item) => (
                                <div
                                    key={item.id}
                                    className={`flex items-center justify-between gap-3 px-4 py-3 ${item.state !== 'ok' ? 'bg-rose-50/40' : ''}`}
                                >
                                    <span className="text-sm font-medium text-slate-700">{item.label}</span>
                                    <SGFBadge variant={STATE_BADGE[item.state] ?? 'default'}>
                                        {STATE_LABEL[item.state] ?? item.state}
                                    </SGFBadge>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

export default VehicleChecklistsTab;
