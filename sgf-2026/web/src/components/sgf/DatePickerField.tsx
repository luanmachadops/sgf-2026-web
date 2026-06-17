import { useState, type CSSProperties } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { DayPicker } from 'react-day-picker';
import { ptBR } from 'date-fns/locale';
import { format, parse } from 'date-fns';
import 'react-day-picker/style.css';
import { Calendar } from './icons';
import { cn } from '@/lib/utils';

export interface DatePickerFieldProps {
    /** valor em 'yyyy-MM-dd' (vazio = sem data) */
    value: string;
    onChange: (value: string) => void;
    label?: string;
    className?: string;
    /** alinhamento do calendário em relação ao botão. 'start' abre para a direita. */
    align?: 'start' | 'center' | 'end';
}

// Variáveis do react-day-picker mapeadas para a paleta do site.
const RDP_THEME: CSSProperties = {
    // @ts-expect-error custom props do react-day-picker
    '--rdp-accent-color': '#00A86B',
    '--rdp-accent-background-color': '#d1fae5',
    '--rdp-today-color': '#00A86B',
    '--rdp-day_button-border-radius': '9999px',
    '--rdp-day-width': '2rem',
    '--rdp-day-height': '2rem',
    '--rdp-day_button-width': '2rem',
    '--rdp-day_button-height': '2rem',
};

export function DatePickerField({ value, onChange, label = 'Selecionar data', className, align = 'end' }: DatePickerFieldProps) {
    const [open, setOpen] = useState(false);

    const selected = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
    const display = selected ? format(selected, 'dd/MM/yyyy') : 'dd/mm/aaaa';

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    aria-label={label}
                    className={cn(
                        'relative inline-flex w-[120px] items-center gap-2 rounded-full border bg-slate-50 py-1 pl-3 pr-2.5 text-xs font-medium transition-colors',
                        'hover:border-emerald-500/50 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10',
                        value ? 'border-emerald-300 text-slate-700' : 'border-slate-200 text-slate-400',
                        className
                    )}
                >
                    <Calendar className={cn('h-4 w-4 shrink-0', value ? 'text-emerald-600' : 'text-slate-400')} />
                    <span className="truncate">{display}</span>
                </button>
            </Popover.Trigger>

            <Popover.Portal>
                <Popover.Content
                    align={align}
                    sideOffset={6}
                    className="z-[200] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl animate-in fade-in zoom-in-95 duration-150"
                >
                    <DayPicker
                        mode="single"
                        locale={ptBR}
                        captionLayout="dropdown"
                        startMonth={new Date(2015, 0)}
                        endMonth={new Date(2035, 11)}
                        defaultMonth={selected ?? new Date()}
                        selected={selected}
                        onSelect={(d) => {
                            onChange(d ? format(d, 'yyyy-MM-dd') : '');
                            setOpen(false);
                        }}
                        style={RDP_THEME}
                        className="sgf-rdp text-slate-700 [&_.rdp-day_button:hover]:bg-emerald-50 [&_.rdp-chevron]:fill-emerald-600"
                        classNames={{
                            month_caption: 'flex items-center justify-center gap-2 px-1 pb-2 text-sm font-semibold text-slate-800',
                            caption_label: 'hidden',
                            dropdowns: 'flex items-center gap-2',
                            dropdown_root: 'relative inline-flex items-center',
                            dropdown:
                                'cursor-pointer appearance-none rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-semibold text-slate-700 hover:border-emerald-500/50 focus:border-emerald-500 focus:outline-none',
                            weekday: 'text-[11px] font-semibold uppercase tracking-wide text-slate-400',
                            day_button: 'rounded-full text-sm font-medium transition-colors',
                            today: 'font-bold text-emerald-600',
                            outside: 'text-slate-300',
                            disabled: 'text-slate-200',
                        }}
                    />
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

export default DatePickerField;
