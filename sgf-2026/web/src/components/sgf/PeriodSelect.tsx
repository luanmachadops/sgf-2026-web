import { SGFSelect, type SGFSelectOption } from './SGFSelect';
import { DatePickerField } from './DatePickerField';

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

export interface PeriodSelectProps {
    value: PeriodValue;
    onChange: (next: PeriodValue) => void;
    options?: SGFSelectOption[];
    className?: string;
}

/**
 * Listbox de período reutilizável: presets + opção "Personalizado" que revela
 * um calendário de/até (inputs nativos de data).
 */
/** Apenas o dropdown de presets (sem os campos de data). */
export function PeriodPresetSelect({
    value,
    onChange,
    options,
    className,
}: {
    value: PeriodValue;
    onChange: (next: PeriodValue) => void;
    options?: SGFSelectOption[];
    className?: string;
}) {
    return (
        <div className={['w-40', className].filter(Boolean).join(' ')}>
            <SGFSelect
                options={options ?? PERIOD_PRESETS}
                value={value.preset}
                onChange={(preset) => onChange({ ...value, preset })}
                placeholder="Período"
                triggerClassName="!py-2.5 !px-4 !text-sm !font-medium !rounded-full"
            />
        </div>
    );
}

/** Apenas a linha de/até (renderiza somente quando o preset é "custom"). */
export function PeriodRangeFields({
    value,
    onChange,
    className,
    fieldClassName,
    align,
}: {
    value: PeriodValue;
    onChange: (next: PeriodValue) => void;
    className?: string;
    /** classes extras aplicadas a cada campo de data (ex.: para igualar a altura do listbox). */
    fieldClassName?: string;
    /** alinhamento do calendário. 'start' abre para a direita. */
    align?: 'start' | 'center' | 'end';
}) {
    if (value.preset !== 'custom') return null;
    return (
        <div className={['flex items-center justify-end gap-2', className].filter(Boolean).join(' ')}>
            <DatePickerField label="Data inicial" value={value.from} onChange={(from) => onChange({ ...value, from })} className={fieldClassName} align={align} />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">até</span>
            <DatePickerField label="Data final" value={value.to} onChange={(to) => onChange({ ...value, to })} className={fieldClassName} align={align} />
        </div>
    );
}

export function PeriodSelect({ value, onChange, options, className }: PeriodSelectProps) {
    return (
        <div className={['flex flex-col items-end gap-2', className].filter(Boolean).join(' ')}>
            <PeriodPresetSelect value={value} onChange={onChange} options={options} />
            {value.preset === 'custom' && (
                <PeriodRangeFields value={value} onChange={onChange} />
            )}
        </div>
    );
}

export default PeriodSelect;
