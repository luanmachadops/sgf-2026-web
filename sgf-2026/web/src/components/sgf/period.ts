import type { SGFSelectOption } from './SGFSelect';

export interface PeriodValue {
    /** preset selecionado: '1' | '3' | '6' | '12' | 'custom' */
    preset: string;
    /** data inicial (yyyy-mm-dd), usada quando preset = 'custom' */
    from: string;
    /** data final (yyyy-mm-dd), usada quando preset = 'custom' */
    to: string;
}

/** Filtro resolvido consumido pelas APIs/hooks. */
export interface ResolvedPeriod {
    monthsBack?: number;
    from?: string;
    to?: string;
}

export const PERIOD_PRESETS: SGFSelectOption[] = [
    { value: '1', label: 'Mês atual' },
    { value: '3', label: 'Últimos 3 meses' },
    { value: '6', label: 'Últimos 6 meses' },
    { value: '12', label: 'Últimos 12 meses' },
    { value: 'custom', label: 'Personalizado' },
];

export function makePeriod(preset = '6'): PeriodValue {
    return { preset, from: '', to: '' };
}

export function resolvePeriod(v: PeriodValue): ResolvedPeriod {
    if (v.preset === 'custom' && v.from && v.to) {
        return { from: v.from, to: v.to };
    }
    return { monthsBack: Number(v.preset) || 1 };
}
