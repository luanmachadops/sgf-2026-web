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
        className="rt-scroll max-h-64 overflow-y-auto rounded-[22px] bg-white p-1.5 shadow-[0_16px_40px_rgb(15_43_47/0.16)]"
      >
        {filtered.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => { onChange(v.id); setOpen(false); setQuery(''); }}
            className="flex w-full items-center gap-3 rounded-full px-3 py-2 text-left transition-colors hover:bg-[var(--rt-paper)]"
          >
            {v.photo_url ? (
              <img src={v.photo_url} alt={`${v.brand ?? ''} ${v.model ?? ''}`} className="h-8 w-8 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--rt-paper)] text-[var(--rt-ink500)]">
                <Car className="h-[18px] w-[18px]" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[var(--rt-ink900)]">
                {formatPlate(v.plate)}
                {v.departmentName && <span className="ml-2 text-xs font-normal text-[var(--rt-ink400)]">· {v.departmentName}</span>}
              </p>
              <p className="truncate text-xs text-[var(--rt-ink500)]">{[v.brand, v.model].filter(Boolean).join(' ') || 'Veículo'}</p>
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
              className="flex h-9 max-w-[240px] items-center gap-2 rounded-full bg-[var(--rt-paper)] pl-1.5 pr-3.5 text-left text-[13px] transition hover:bg-[var(--rt-paper2)] disabled:opacity-50"
            >
              {selected ? (
                <>
                  {selected.photo_url
                    ? <img src={selected.photo_url} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                    : <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[var(--rt-ink500)]"><Car className="h-3.5 w-3.5" /></span>}
                  <span className="truncate font-semibold text-[var(--rt-ink900)]">{formatPlate(selected.plate)}</span>
                </>
              ) : (
                <span className="pl-2 font-medium text-[var(--rt-ink500)]">+ {emptyLabel ?? 'Vincular veículo'}</span>
              )}
            </button>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--rt-ink400)]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="h-9 w-[240px] rounded-full border border-[var(--rt-brand)] bg-white pl-8 pr-3 text-[13px] focus:outline-none focus:ring-4 focus:ring-[var(--rt-brand)]/10"
              />
            </div>
          )}
          {open && selected && (
            <button type="button" onClick={() => { onChange(null); setOpen(false); }} className="mt-1.5 block px-1 text-[11px] font-semibold text-[var(--rt-red600)] hover:underline">
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
      <div className="flex items-center gap-4 rounded-[22px] bg-[var(--rt-paper)] p-3">
        {selected.photo_url ? (
          <img src={selected.photo_url} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--rt-brand-100)] text-[var(--rt-brand)]">
            <Car className="h-7 w-7" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-[var(--rt-ink900)]">{formatPlate(selected.plate)}</p>
          <p className="text-xs font-medium text-[var(--rt-ink700)]">{[selected.brand, selected.model].filter(Boolean).join(' ') || 'Veículo'}</p>
          {selected.departmentName && <p className="text-[11px] text-[var(--rt-ink500)]">{selected.departmentName}</p>}
        </div>
        <button
          type="button"
          onClick={() => { onChange(null); setQuery(''); setOpen(true); }}
          className="h-9 shrink-0 rounded-full bg-white px-4 text-[13px] font-semibold text-[var(--rt-ink900)] shadow-[var(--rt-shadow-card)] hover:bg-[var(--rt-paper2)]"
        >
          Alterar veículo
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="relative" ref={anchorRef}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--rt-ink400)]" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          placeholder={disabled ? (emptyLabel ?? placeholder) : placeholder}
          className="h-12 w-full rounded-2xl border border-transparent bg-[var(--rt-paper)] pl-11 pr-3 text-[15px] text-[var(--rt-ink900)] transition placeholder:text-[var(--rt-ink400)] focus:border-[var(--rt-brand)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--rt-brand)]/10 disabled:opacity-60"
        />
      </div>
      {dropdown}
    </>
  );
}

export default VehiclePicker;
