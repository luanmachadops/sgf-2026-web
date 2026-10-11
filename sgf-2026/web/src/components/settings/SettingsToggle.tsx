import { cn } from '@/lib/utils';

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                checked ? 'bg-[var(--sgf-primary)]' : 'bg-slate-300',
                disabled && 'cursor-default',
            )}
        >
            <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
        </button>
    );
}

export function ToggleRow({ title, desc, checked, onChange, disabled }: { title: string; desc: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3.5">
            <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{title}</p>
                <p className="text-xs text-slate-500">{desc}</p>
            </div>
            <Toggle checked={checked} onChange={onChange} disabled={disabled} />
        </div>
    );
}
