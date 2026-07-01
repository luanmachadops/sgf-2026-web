import { useEffect, useMemo, useRef, useState } from 'react';
import { Car, Search } from '@/components/sgf/icons';
import { formatPlate, type VehicleOption } from '@/lib/api';

/**
 * Busca de veículo por placa — réplica do seletor do modal "Nova infração":
 * campo de texto com dropdown mostrando foto, placa · secretaria e, embaixo, o veículo.
 * Ao selecionar, exibe o "chip" do veículo com botão "Alterar veículo".
 *
 * - `compact`: variante enxuta para uso em linha de tabela (sem o chip grande).
 */
export function VehiclePicker({
  vehicles, value, onChange, disabled, compact, placeholder = 'Buscar placa ou modelo…', emptyLabel,
}: {
  vehicles: VehicleOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  compact?: boolean;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => vehicles.find((v) => v.id === value) ?? null, [vehicles, value]);

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return vehicles;
    return vehicles.filter((v) =>
      (v.plate || '').toLowerCase().includes(s) ||
      (v.brand || '').toLowerCase().includes(s) ||
      (v.model || '').toLowerCase().includes(s));
  }, [vehicles, query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const Dropdown = (
    open && !disabled && filtered.length > 0 ? (
      <div className="absolute z-[3000] left-0 right-0 top-full mt-1.5 max-h-60 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-lg custom-scrollbar">
        {filtered.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => { onChange(v.id); setOpen(false); setQuery(''); }}
            className="flex w-full items-center gap-3 rounded-full px-3 py-2 text-left transition-colors hover:bg-emerald-50"
          >
            {v.photo_url ? (
              <img src={v.photo_url} alt={`${v.brand ?? ''} ${v.model ?? ''}`} className="h-8 w-8 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Car className="h-[18px] w-[18px]" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm font-bold text-slate-900">
                {formatPlate(v.plate)}
                {v.departmentName && <span className="ml-2 font-sans text-xs font-normal text-slate-400">· {v.departmentName}</span>}
              </p>
              <p className="truncate text-xs text-slate-500">{[v.brand, v.model].filter(Boolean).join(' ') || 'Veículo'}</p>
            </div>
          </button>
        ))}
      </div>
    ) : null
  );

  // Variante enxuta (tabela): botão com o veículo atual; ao abrir, campo de busca + dropdown.
  if (compact) {
    return (
      <div className="relative" ref={ref}>
        {!open ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(true)}
            className="flex max-w-[240px] items-center gap-2 rounded-lg border border-slate-300 px-2 py-1.5 text-left text-xs hover:border-[var(--sgf-primary)] disabled:opacity-50"
          >
            {selected ? (
              <>
                {selected.photo_url
                  ? <img src={selected.photo_url} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
                  : <Car className="h-4 w-4 shrink-0 text-slate-400" />}
                <span className="truncate font-mono font-semibold text-slate-800">{formatPlate(selected.plate)}</span>
              </>
            ) : (
              <span className="text-slate-400">{emptyLabel ?? 'Vincular veículo'}</span>
            )}
          </button>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-[240px] rounded-lg border border-[var(--sgf-primary)] py-1.5 pl-8 pr-2 text-xs focus:outline-none"
            />
          </div>
        )}
        {open && selected && (
          <button type="button" onClick={() => { onChange(null); setOpen(false); }} className="mt-1 block text-[10px] font-semibold text-rose-500 hover:underline">
            Desvincular
          </button>
        )}
        {Dropdown}
      </div>
    );
  }

  // Variante completa (formulário): chip do selecionado OU campo de busca.
  if (selected) {
    return (
      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3.5">
        {selected.photo_url ? (
          <img src={selected.photo_url} alt="" className="h-14 w-14 shrink-0 rounded-xl border border-slate-100 object-cover" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
            <Car className="h-7 w-7" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-mono text-base font-bold text-slate-900">{formatPlate(selected.plate)}</p>
          <p className="text-xs font-semibold text-slate-700">{[selected.brand, selected.model].filter(Boolean).join(' ') || 'Veículo'}</p>
          {selected.departmentName && <p className="text-[11px] text-slate-400">{selected.departmentName}</p>}
        </div>
        <button
          type="button"
          onClick={() => { onChange(null); setQuery(''); setOpen(true); }}
          className="shrink-0 rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
        >
          Alterar veículo
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        disabled={disabled}
        placeholder={disabled ? (emptyLabel ?? placeholder) : placeholder}
        className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-[var(--sgf-primary)] focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
      />
      {Dropdown}
    </div>
  );
}

export default VehiclePicker;
