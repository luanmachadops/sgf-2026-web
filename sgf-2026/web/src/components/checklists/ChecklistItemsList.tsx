import { SGFBadge } from '@/components/sgf/SGFBadge';
import { AlertTriangle, Loader2 } from '@/components/sgf/icons';
import type { Tables } from '@/types/database.types';

type ChecklistItemRow = Pick<Tables<'checklist_items'>, 'id' | 'item_key' | 'label' | 'state'>;

export const CHECKLIST_STATE_LABEL: Record<string, string> = {
    ok: 'OK',
    atencao: 'Atenção',
    pendente: 'Pendente',
};

export const CHECKLIST_STATE_BADGE: Record<string, 'success' | 'warning' | 'error'> = {
    ok: 'success',
    atencao: 'warning',
    pendente: 'error',
};

/** Itens do checklist considerados "críticos": bloqueiam viagem e sugerem prioridade alta na O.S. */
export const CRITICAL_ITEM_KEYS = ['freios', 'pneus', 'luzes'];

export function isCriticalItem(itemKey: string): boolean {
    return CRITICAL_ITEM_KEYS.includes(itemKey);
}

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
                {items.map((item) => (
                    <div
                        key={item.id}
                        className={`flex items-center justify-between gap-3 px-4 py-3 ${item.state !== 'ok' ? 'bg-rose-50/40' : ''}`}
                    >
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
                ))}
            </div>
        </div>
    );
}

export default ChecklistItemsList;
