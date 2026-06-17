import React, { useMemo, useState } from 'react';

export interface SGFTableColumn<T> {
  header: string | React.ReactNode;
  accessor: keyof T | ((row: T) => React.ReactNode);
  className?: string;
  headerClassName?: string;
  /** Habilita o botão de ordenação (estilo Excel) no cabeçalho desta coluna. */
  sortable?: boolean;
  /**
   * Valor usado para ordenar. Obrigatório para colunas com `accessor` em função.
   * Para `accessor` por chave, cai automaticamente no valor do campo.
   * Datas: retorne um Date (ou ISO string que o tipo abaixo detecta).
   */
  sortValue?: (row: T) => string | number | Date | null | undefined;
  /** Dica do tipo para escolher a comparação. Default: inferido do valor. */
  sortType?: 'text' | 'number' | 'date';
}

export interface SGFTableProps<T> {
  columns: SGFTableColumn<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: string;
  /** Habilita a ordenação por cabeçalho em todas as colunas (default: true).
   *  Desative por coluna com `sortable: false`. */
  sortable?: boolean;
}

type SortDir = 'asc' | 'desc';

/** Extrai o texto exibido de um ReactNode para permitir ordenação automática. */
function extractText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join(' ');
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode; alt?: string; title?: string };
    if (props.children != null) return extractText(props.children);
    return props.title ?? props.alt ?? '';
  }
  return '';
}

function SortIcon({ state }: { state: SortDir | null }) {
  // Setas duplas; a ativa fica em verde, a outra esmaecida.
  const up = state === 'asc' ? 'text-emerald-600' : 'text-slate-300';
  const down = state === 'desc' ? 'text-emerald-600' : 'text-slate-300';
  return (
    <span className="ml-1 inline-flex flex-col leading-none">
      <svg viewBox="0 0 10 6" className={`h-[5px] w-2.5 ${up}`} fill="currentColor" aria-hidden>
        <path d="M5 0L10 6H0z" />
      </svg>
      <svg viewBox="0 0 10 6" className={`mt-[1px] h-[5px] w-2.5 ${down}`} fill="currentColor" aria-hidden>
        <path d="M5 6L0 0h10z" />
      </svg>
    </span>
  );
}

export function SGFTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  loading = false,
  emptyMessage = 'Nenhum dado disponível',
  sortable = true,
}: SGFTableProps<T>) {
  const [sortIndex, setSortIndex] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Coluna ordenável por padrão quando a tabela é ordenável e a coluna não opta por sair.
  // Para cabeçalhos não-textuais (ícones/ações), exige `sortable: true` explícito.
  const isSortable = (column: SGFTableColumn<T>): boolean => {
    if (!sortable || column.sortable === false) return false;
    if (column.sortable === true) return true;
    return typeof column.header === 'string' && column.header.trim() !== '';
  };

  const getSortValue = (column: SGFTableColumn<T>, row: T): string | number | Date | null | undefined => {
    if (column.sortValue) return column.sortValue(row);
    if (typeof column.accessor !== 'function') return row[column.accessor] as unknown as string | number;
    // Função: ordena pelo texto efetivamente exibido.
    return extractText(column.accessor(row));
  };

  const sortedData = useMemo(() => {
    if (sortIndex == null) return data;
    const column = columns[sortIndex];
    if (!column) return data;

    const dir = sortDir === 'asc' ? 1 : -1;
    const norm = (v: string | number | Date | null | undefined): { n?: number; s?: string } => {
      if (v == null || v === '') return {};
      if (v instanceof Date) return { n: v.getTime() };
      if (typeof v === 'number') return { n: v };
      const str = String(v).trim();
      if (str === '' || str === '—' || str === '-') return {};
      if (column.sortType === 'date') {
        const t = new Date(str).getTime();
        return Number.isNaN(t) ? { s: str.toLowerCase() } : { n: t };
      }
      if (column.sortType === 'number') {
        const num = Number(str.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'));
        return Number.isNaN(num) ? { s: str.toLowerCase() } : { n: num };
      }
      if (column.sortType === 'text') return { s: str.toLowerCase() };
      // Auto: detecta data dd/MM/yyyy, ISO e números puros; senão, texto.
      const br = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (br) return { n: new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1])).getTime() };
      if (/^\d{4}-\d{2}-\d{2}([T ]|$)/.test(str)) {
        const t = new Date(str).getTime();
        if (!Number.isNaN(t)) return { n: t };
      }
      const numeric = str.replace(/\s/g, '').match(/^-?(?:R\$)?\s?\d{1,3}(?:\.\d{3})*(?:,\d+)?$|^-?\d+(?:[.,]\d+)?%?$/);
      if (numeric) {
        const num = Number(str.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
        if (!Number.isNaN(num)) return { n: num };
      }
      return { s: str.toLowerCase() };
    };

    return [...data].sort((a, b) => {
      const av = norm(getSortValue(column, a));
      const bv = norm(getSortValue(column, b));
      // vazios sempre por último, independente da direção
      const aEmpty = av.n == null && av.s == null;
      const bEmpty = bv.n == null && bv.s == null;
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      if (av.n != null && bv.n != null) return (av.n - bv.n) * dir;
      return (av.s ?? '').localeCompare(bv.s ?? '', 'pt-BR') * dir;
    });
  }, [data, columns, sortIndex, sortDir]);

  const toggleSort = (index: number) => {
    if (sortIndex === index) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortIndex(index);
      setSortDir('asc');
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-100 rounded-[var(--sgf-card-radius)] overflow-hidden shadow-sm">
        <div className="p-6">
          <div className="h-7 bg-slate-100 rounded-[var(--sgf-radius-md)] animate-pulse mb-3" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-50 rounded-[var(--sgf-radius-md)] animate-pulse mb-2" />
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white border border-slate-100 rounded-[var(--sgf-card-radius)] overflow-hidden shadow-sm p-12">
        <div className="text-center">
          <p className="text-slate-400 text-sm">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  const renderCell = (column: SGFTableColumn<T>, row: T) =>
    typeof column.accessor === 'function' ? column.accessor(row) : String(row[column.accessor] ?? '');

  return (
    <>
      {/* ── Cards (mobile) ─────────────────────────────── */}
      <div className="space-y-2.5 md:hidden">
        {sortedData.map((row, rowIndex) => {
          const [head, ...rest] = columns;
          return (
            <div
              key={keyExtractor(row, rowIndex)}
              onClick={() => onRowClick?.(row)}
              className={`rounded-2xl border border-slate-100 bg-white px-3.5 py-3 shadow-sm ${onRowClick ? 'cursor-pointer active:bg-slate-50' : ''}`}
            >
              {/* Cabeçalho: primeira coluna (geralmente foto + nome) */}
              <div className="text-[15px] font-semibold text-slate-900">
                {renderCell(head, row)}
              </div>

              {/* Demais campos em grade compacta de 2 colunas */}
              {rest.length > 0 && (
                <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-50 pt-2.5">
                  {rest.map((column, colIndex) => (
                    <div key={colIndex} className="min-w-0">
                      <p className="text-[9.5px] font-bold uppercase tracking-[0.05em] text-slate-400">{column.header}</p>
                      <div className="mt-0.5 truncate text-[13px] font-medium text-slate-700">{renderCell(column, row)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Tabela (desktop) ───────────────────────────── */}
      <div className="hidden rounded-[var(--sgf-card-radius)] border border-slate-100 bg-white shadow-sm md:block overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          {/* ── Header ─────────────────────────────────── */}
          <thead className="border-b border-slate-100">
            <tr>
              {columns.map((column, index) => {
                const active = sortIndex === index;
                return (
                  <th
                    key={index}
                    className={`
                      px-[var(--sgf-table-cell-padding-x)]
                      py-3
                      text-[11px]
                      font-semibold
                      uppercase
                      tracking-[0.04em]
                      text-slate-400
                      bg-slate-50/80
                      whitespace-nowrap
                      ${column.headerClassName || ''}
                    `}
                  >
                    {isSortable(column) ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(index)}
                        className={`inline-flex items-center uppercase tracking-[0.04em] transition-colors hover:text-slate-600 ${active ? 'text-slate-600' : ''}`}
                      >
                        {column.header}
                        <SortIcon state={active ? sortDir : null} />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* ── Body ───────────────────────────────────── */}
          <tbody className="divide-y divide-slate-100/70">
            {sortedData.map((row, rowIndex) => (
              <tr
                key={keyExtractor(row, rowIndex)}
                className={`
                  hover:bg-slate-50/70
                  transition-colors duration-100
                  ${onRowClick ? 'cursor-pointer' : ''}
                `}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((column, colIndex) => (
                  <td
                    key={colIndex}
                    className={`
                      px-[var(--sgf-table-cell-padding-x)]
                      py-[var(--sgf-table-cell-padding-y)]
                      text-[var(--sgf-text-base)]
                      text-slate-700
                      ${column.className || ''}
                    `}
                  >
                    {typeof column.accessor === 'function'
                      ? column.accessor(row)
                      : String(row[column.accessor])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </>
  );
}
