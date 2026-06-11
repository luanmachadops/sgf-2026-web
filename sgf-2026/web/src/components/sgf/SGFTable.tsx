import React from 'react';

export interface SGFTableColumn<T> {
  header: string | React.ReactNode;
  accessor: keyof T | ((row: T) => React.ReactNode);
  className?: string;
  headerClassName?: string;
}

export interface SGFTableProps<T> {
  columns: SGFTableColumn<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: string;
}

export function SGFTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  loading = false,
  emptyMessage = 'Nenhum dado disponível',
}: SGFTableProps<T>) {
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
        {data.map((row, rowIndex) => {
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
              {columns.map((column, index) => (
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
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>

          {/* ── Body ───────────────────────────────────── */}
          <tbody className="divide-y divide-slate-100/70">
            {data.map((row, rowIndex) => (
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
