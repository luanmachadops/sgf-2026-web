import { useState } from 'react';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { AlertTriangle, Loader2 } from '@/components/sgf/icons';
import type { Tables } from '@/types/database.types';
import { CHECKLIST_STATE_LABEL, CHECKLIST_STATE_BADGE, isCriticalItem } from './checklistItems';

type ChecklistItemRow = Pick<Tables<'checklist_items'>, 'id' | 'item_key' | 'label' | 'state'>
    & Partial<Pick<Tables<'checklist_items'>, 'damage_description' | 'photo_urls'>>;

interface ChecklistItemsListProps {
    items: ChecklistItemRow[];
    loading?: boolean;
    /** Mostra o alerta de resumo ("N itens precisam de atenção") no topo. */
    showSummary?: boolean;
}

/**
 * Lista de itens de um checklist (ok/atenção/pendente), com o alerta de resumo
 * quando há itens fora do "ok". Compartilhado entre VehicleChecklistsTab e a
 * página Checklists do painel do gestor.
 */
export function ChecklistItemsList({ items, loading, showSummary = true }: ChecklistItemsListProps) {
    const problemItems = items.filter((i) => i.state !== 'ok');
    const [viewer, setViewer] = useState<{ images: string[]; index: number } | null>(null);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
            </div>
        );
    }

    if (items.length === 0) {
        return <p className="py-6 text-center text-sm text-slate-400">Nenhum item registrado neste checklist.</p>;
    }

    return (
        <div className="space-y-4">
            {showSummary && problemItems.length > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
                    <p className="text-sm font-semibold text-rose-700">
                        {problemItems.length} {problemItems.length === 1 ? 'item precisa' : 'itens precisam'} de atenção.
                    </p>
                </div>
            )}
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {items.map((item) => {
                    const photos = (item.photo_urls ?? []).filter(Boolean);
                    return (
                        <div key={item.id} className={`px-4 py-3 ${item.state !== 'ok' ? 'bg-rose-50/40' : ''}`}>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-medium text-slate-700">
                                    {item.label}
                                    {isCriticalItem(item.item_key) && (
                                        <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-rose-400">crítico</span>
                                    )}
                                </span>
                                <SGFBadge variant={CHECKLIST_STATE_BADGE[item.state] ?? 'default'}>
                                    {CHECKLIST_STATE_LABEL[item.state] ?? item.state}
                                </SGFBadge>
                            </div>
                            {item.damage_description && (
                                <p className="mt-1.5 text-xs text-slate-600">
                                    <span className="font-semibold text-slate-500">Avaria: </span>{item.damage_description}
                                </p>
                            )}
                            {photos.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {photos.map((url, index) => (
                                        <button
                                            key={`${url}-${index}`}
                                            type="button"
                                            onClick={() => setViewer({ images: photos, index })}
                                            className="h-16 w-16 overflow-hidden rounded-lg border border-slate-200"
                                        >
                                            <img src={url} alt={`Foto de ${item.label}`} className="h-full w-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <PhotoViewer images={viewer?.images} startIndex={viewer?.index ?? 0} onClose={() => setViewer(null)} />
        </div>
    );
}

export default ChecklistItemsList;
