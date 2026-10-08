import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Filter, Search, X } from './icons';
import { SGFSelect, type SGFSelectOption } from './SGFSelect';
import { cn } from '@/lib/utils';

export interface SGFToolbarFilter {
  /** chave única opcional (default: índice) */
  key?: string;
  value: string;
  onChange: (value: string) => void;
  options: SGFSelectOption[];
  /** nome do filtro, mostrado no gatilho ("Secretaria: Todas") */
  placeholder?: string;
  icon?: React.ElementType;
  /** controla a largura do filtro no computador (default: sm:w-auto, cresce com o texto) */
  className?: string;
}

export interface SGFToolbarProps {
  /** valor do campo de busca. Omita para esconder a busca. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** filtros (selects) renderizados à direita */
  filters?: SGFToolbarFilter[];
  /** controles extras (período, abas…) — antes dos filtros; no celular vão para o painel de filtros */
  children?: React.ReactNode;
  className?: string;
}

const TRIGGER = '!py-2.5 !px-4 !text-sm !font-medium !rounded-full !shadow-[var(--sgf-shadow-xs)] hover:!border-[var(--sgf-primary)] hover:!bg-slate-50/50';

/**
 * Barra padrão de busca + filtros acima das tabelas/listagens.
 *
 * Computador: busca à esquerda, filtros à direita.
 * Celular: busca + botão de filtro (com quantos estão ativos); o botão abre um
 * painel com os filtros empilhados, para a barra não ocupar meia tela.
 */
export function SGFToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Pesquisar...',
  filters = [],
  children,
  className,
}: SGFToolbarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const hasSearch = typeof onSearchChange === 'function';
  const hasRight = filters.length > 0 || Boolean(children);
  const activeCount = filters.filter((f) => f.value !== '' && f.value !== 'all').length;

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheetOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  const renderFilters = (mobile: boolean) => filters.map((filter, index) => (
    <div
      key={filter.key ?? index}
      className={mobile ? 'w-full' : cn('w-auto min-w-[170px] max-w-[280px]', filter.className)}
    >
      <SGFSelect
        value={filter.value}
        onChange={filter.onChange}
        options={filter.options}
        placeholder={filter.placeholder}
        inlineLabel={filter.placeholder}
        icon={filter.icon}
        triggerClassName={TRIGGER}
      />
    </div>
  ));

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-[var(--sgf-card-radius)] py-3 pr-3 pl-0',
        'md:flex-row md:items-center md:justify-between',
        className
      )}
    >
      {(hasSearch || hasRight) && (
        <div className="flex w-full items-center gap-2 md:max-w-sm">
          {hasSearch && (
            <div className="group relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[var(--sgf-primary)]" />
              <input
                type="text"
                value={searchValue ?? ''}
                onChange={(event) => onSearchChange?.(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-slate-700 shadow-[var(--sgf-shadow-xs)] transition-all placeholder:font-normal placeholder:text-slate-400 hover:border-[var(--sgf-primary)] hover:bg-slate-50/50 focus:border-[var(--sgf-primary)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--sgf-focus-ring)]"
              />
            </div>
          )}
          {hasRight && (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-label="Filtros"
              className={cn(
                'relative grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full border bg-white shadow-[var(--sgf-shadow-xs)] transition md:hidden',
                activeCount > 0 ? 'border-[var(--sgf-primary)] text-[var(--sgf-primary)]' : 'border-slate-200 text-slate-600',
              )}
            >
              <Filter className="h-5 w-5" />
              {activeCount > 0 && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--sgf-primary)] px-1 text-[10px] font-bold text-white">
                  {activeCount}
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {hasRight && (
        <div className="hidden items-center gap-2 md:flex md:flex-nowrap md:justify-end">
          {children}
          {renderFilters(false)}
        </div>
      )}

      {hasRight && sheetOpen && createPortal(
        <div className="fixed inset-0 z-[1500] md:hidden" role="dialog" aria-modal="true" aria-label="Filtros">
          <button type="button" aria-label="Fechar filtros" className="absolute inset-0 bg-slate-950/40" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-base font-bold text-slate-900">Filtros</p>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="Fechar" className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col gap-3 [&>*]:w-full [&_.w-48]:w-full [&_.w-48]:flex-1">
              {children}
              {renderFilters(true)}
            </div>
            <div className="mt-5 flex gap-2">
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={() => filters.forEach((f) => f.onChange(f.options[0]?.value ?? ''))}
                  className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-semibold text-slate-600"
                >
                  Limpar
                </button>
              )}
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="flex-1 rounded-full bg-[var(--sgf-primary)] py-3 text-sm font-semibold text-[var(--sgf-primary-contrast)]"
              >
                Ver resultados
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
