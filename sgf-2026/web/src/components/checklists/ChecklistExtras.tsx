import type { Json, Tables } from '@/types/database.types';

const FUEL_LEVEL_LABEL: Record<string, string> = {
    vazio: 'Vazio',
    um_quarto: '1/4',
    meio: '1/2',
    tres_quartos: '3/4',
    cheio: 'Cheio',
};

const FUEL_LEVEL_FILL: Record<string, number> = {
    vazio: 0,
    um_quarto: 25,
    meio: 50,
    tres_quartos: 75,
    cheio: 100,
};

const SAFETY_LABEL: Record<string, string> = {
    triangulo: 'Triângulo',
    extintor: 'Extintor',
    macaco: 'Macaco',
    chave_roda: 'Chave de roda',
    chave_de_roda: 'Chave de roda',
    estepe: 'Estepe',
    cinto: 'Cinto de segurança',
    primeiros_socorros: 'Kit de primeiros socorros',
    kit_primeiros_socorros: 'Kit de primeiros socorros',
};

function humanize(key: string): string {
    if (SAFETY_LABEL[key]) return SAFETY_LABEL[key];
    const text = key.replace(/_/g, ' ').trim();
    return text.charAt(0).toUpperCase() + text.slice(1);
}

interface SafetyEntry {
    label: string;
    ok: boolean;
}

/** Aceita {chave: boolean} ou [{key|label, ok}] ou lista de chaves presentes. */
function parseSafetyItems(value: Json | null | undefined): SafetyEntry[] {
    if (value == null) return [];
    if (Array.isArray(value)) {
        return value.flatMap((entry): SafetyEntry[] => {
            if (typeof entry === 'string') return [{ label: humanize(entry), ok: true }];
            if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
                const record = entry as Record<string, Json | undefined>;
                const name = String(record.label ?? record.name ?? record.key ?? record.item ?? '');
                if (!name) return [];
                const flag = record.ok ?? record.present ?? record.presente ?? record.value;
                return [{ label: humanize(name), ok: flag === undefined ? true : Boolean(flag) }];
            }
            return [];
        });
    }
    if (typeof value === 'object') {
        return Object.entries(value as Record<string, Json | undefined>)
            .filter(([, flag]) => typeof flag === 'boolean')
            .map(([key, flag]) => ({ label: humanize(key), ok: Boolean(flag) }));
    }
    return [];
}

interface ChecklistExtrasProps {
    checklist: Pick<Tables<'checklists'>, 'fuel_level' | 'spare_tire_ok' | 'safety_items'>;
}

/**
 * Dados complementares do checklist enviados pelo app: nível de combustível,
 * estepe e itens de segurança. Não renderiza nada quando nenhum veio preenchido.
 */
export function ChecklistExtras({ checklist }: ChecklistExtrasProps) {
    const safety = parseSafetyItems(checklist.safety_items);
    const hasFuel = Boolean(checklist.fuel_level);
    const hasSpare = checklist.spare_tire_ok != null;
    if (!hasFuel && !hasSpare && safety.length === 0) return null;

    return (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-2 gap-4">
                {hasFuel && checklist.fuel_level && (
                    <div>
                        <p className="text-xs font-semibold text-slate-500">Combustível na saída</p>
                        <p className="mt-0.5 text-sm font-medium text-slate-900">{FUEL_LEVEL_LABEL[checklist.fuel_level] ?? checklist.fuel_level}</p>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${FUEL_LEVEL_FILL[checklist.fuel_level] ?? 0}%` }} />
                        </div>
                    </div>
                )}
                {hasSpare && (
                    <div>
                        <p className="text-xs font-semibold text-slate-500">Estepe</p>
                        <p className={`mt-0.5 text-sm font-medium ${checklist.spare_tire_ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {checklist.spare_tire_ok ? 'Em condições' : 'Com problema / ausente'}
                        </p>
                    </div>
                )}
            </div>
            {safety.length > 0 && (
                <div>
                    <p className="mb-1.5 text-xs font-semibold text-slate-500">Itens de segurança</p>
                    <div className="flex flex-wrap gap-1.5">
                        {safety.map((entry) => (
                            <span
                                key={entry.label}
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${entry.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
                            >
                                {entry.label}{entry.ok ? '' : ' — ausente'}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default ChecklistExtras;
