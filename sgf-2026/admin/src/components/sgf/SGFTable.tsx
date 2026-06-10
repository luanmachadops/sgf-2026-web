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

  return (
    <div className="bg-white border border-slate-100 rounded-[var(--sgf-card-radius)] overflow-hidden shadow-sm">
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
  );
}
