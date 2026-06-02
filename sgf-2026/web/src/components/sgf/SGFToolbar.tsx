import React from 'react';
import { Search } from './icons';
import { SGFSelect, type SGFSelectOption } from './SGFSelect';
import { cn } from '@/lib/utils';

export interface SGFToolbarFilter {
  /** chave única opcional (default: índice) */
  key?: string;
  value: string;
  onChange: (value: string) => void;
  options: SGFSelectOption[];
  placeholder?: string;
  icon?: React.ElementType;
  /** controla a largura do filtro (default: w-full sm:w-44) */
  className?: string;
}

export interface SGFToolbarProps {
  /** valor do campo de busca. Omita para esconder a busca. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** filtros (selects) renderizados à direita */
  filters?: SGFToolbarFilter[];
  /** controles extras à direita (toggles, abas, etc.) — renderizados antes dos filtros */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Barra padrão de busca + filtros posicionada acima das tabelas/listagens.
 * Padroniza o local, o estilo e o espaçamento em todas as páginas.
 */
export function SGFToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Pesquisar...',
  filters = [],
  children,
  className,
}: SGFToolbarProps) {
  const hasSearch = typeof onSearchChange === 'function';
  const hasRight = filters.length > 0 || Boolean(children);

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-[var(--sgf-card-radius)] py-3 pr-3 pl-0',
        'md:flex-row md:items-center md:justify-between',
        className
      )}
    >
      {hasSearch && (
        <div className="group relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-emerald-500" />
          <input
            type="text"
            value={searchValue ?? ''}
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-slate-700 shadow-[var(--sgf-shadow-xs)] transition-all placeholder:text-slate-400 hover:border-emerald-500/50 hover:bg-slate-50/50 focus:border-[var(--sgf-primary)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
          />
        </div>
      )}

      {hasRight && (
        <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:justify-end">
          {children}
          {filters.map((filter, index) => (
            <div key={filter.key ?? index} className={cn('w-full sm:w-44', filter.className)}>
              <SGFSelect
                value={filter.value}
                onChange={filter.onChange}
                options={filter.options}
                placeholder={filter.placeholder}
                icon={filter.icon}
                triggerClassName="!py-2.5 !px-4 !text-sm !font-medium !rounded-full !shadow-[var(--sgf-shadow-xs)] hover:!border-emerald-500/50 hover:!bg-slate-50/50"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
