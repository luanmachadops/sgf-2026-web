import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Car, Search } from '@/components/sgf/icons';
import { formatPlate, type VehicleOption } from '@/lib/api';

/**
 * Busca de veículo por placa — réplica do seletor do modal "Nova infração":
 * campo de texto com dropdown mostrando foto, placa · secretaria e, embaixo, o veículo.
 * Ao selecionar, exibe o "chip" do veículo com botão "Alterar veículo".
 *
 * O dropdown é renderizado em PORTAL (document.body) com posição fixa, para não
 * ser cortado por containers com overflow (ex.: linha de tabela).
 * `compact`: variante enxuta para uso em linha de tabela.
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
  const anchorRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number; width: number } | null>(null);

  const selected = useMemo(() => vehicles.find((v) => v.id === value) ?? null, [vehicles, value]);

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return vehicles;
    return vehicles.filter((v) =>
      (v.plate || '').toLowerCase().includes(s) ||
      (v.brand || '').toLowerCase().includes(s) ||
      (v.model || '').toLowerCase().includes(s));
  }, [vehicles, query]);

  // Posiciona o portal abaixo do campo e reposiciona em scroll/resize.
  useEffect(() => {
    if (!open) { setCoords(null); return; }
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCoords({ left: r.left, top: r.bottom + 6, width: Math.max(r.width, 260) });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [open]);

  // Fecha ao clicar fora (considerando o portal).
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || portalRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const dropdown = open && !disabled && coords && filtered.length > 0
    ? createPortal(
      <div
        ref={portalRef}
        style={{ position: 'fixed', left: coords.left, top: coords.top, width: coords.width, zIndex: 4000 }}
        className="max-h-60 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-2xl ring-1 ring-slate-200/70 custom-scrollbar"
      >
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
      </div>,
      document.body,
    )
    : null;

  // Variante enxuta (tabela): botão com o veículo atual; ao abrir, campo de busca + dropdown.
  if (compact) {
    return (
      <>
        <div className="relative" ref={anchorRef}>
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
        </div>
        {dropdown}
      </>
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
    <>
      <div className="relative" ref={anchorRef}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          placeholder={disabled ? (emptyLabel ?? placeholder) : placeholder}
          className="h-11 w-full rounded-[var(--sgf-input-radius)] border border-slate-200 bg-slate-50 pl-10 pr-3 text-[var(--sgf-text-sm)] transition-all placeholder:text-slate-400 focus:border-[var(--sgf-primary)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-500/10 disabled:opacity-60"
        />
      </div>
      {dropdown}
    </>
  );
}

export default VehiclePicker;
