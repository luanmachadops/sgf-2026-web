// Rótulos e regras dos itens do checklist (compartilhados por lista e O.S.).

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
