import { useRef, useState } from 'react';
import { Search, X } from './icons';

/**
 * Busca compacta: no computador fica só o ícone e expande ao clicar (recolhe
 * ao sair se estiver vazia); no celular é sempre o campo inteiro.
 */
export function ExpandableSearch({ value, onChange, placeholder }: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
}) {
    const [open, setOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const expanded = open || value.length > 0;

    return (
        <div className="relative flex min-w-0 flex-1 items-center lg:flex-none">
            {!expanded && (
                <button
                    type="button"
                    aria-label={placeholder}
                    title="Buscar"
                    onClick={() => { setOpen(true); requestAnimationFrame(() => inputRef.current?.focus()); }}
                    className="hidden h-10 w-10 place-items-center rounded-full bg-white text-slate-500 shadow-sm transition hover:text-[var(--sgf-primary)] lg:grid"
                >
                    <Search className="h-5 w-5" />
                </button>
            )}
            <label className={`relative w-full items-center ${expanded ? 'flex lg:w-72' : 'flex lg:hidden'}`}>
                <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />
                <input
                    ref={inputRef}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    onBlur={() => { if (!value) setOpen(false); }}
                    onKeyDown={(event) => { if (event.key === 'Escape') { onChange(''); setOpen(false); } }}
                    placeholder={placeholder}
                    aria-label={placeholder}
                    className="h-10 w-full rounded-full border border-transparent bg-white pl-10 pr-9 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--sgf-primary)] focus:ring-4 focus:ring-[var(--sgf-focus-ring)]"
                />
                {value && (
                    <button type="button" aria-label="Limpar busca" onClick={() => { onChange(''); setOpen(false); }}
                        className="absolute right-2.5 grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </label>
        </div>
    );
}
