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
  // Tabela dentro de um card do app: cabeçalho discreto, linhas com divisória fina
  // e respiro lateral; sem bordas pesadas nem zebra.
  const shell = 'overflow-hidden rounded-[var(--rt-radius-card)] bg-white shadow-[var(--rt-shadow-card)]';

  if (loading) {
    return (
      <div className={`${shell} p-6`}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="mb-3 h-12 animate-pulse rounded-2xl bg-[var(--rt-paper)] last:mb-0" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={`${shell} grid place-items-center px-6 py-14`}>
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--rt-paper)] text-[var(--rt-ink400)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" /></svg>
          </span>
          <p className="text-sm text-[var(--rt-ink500)]">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className="rt-scroll overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th
                  key={index}
                  className={`whitespace-nowrap px-5 pb-3 pt-5 text-xs font-medium text-[var(--rt-ink500)] first:pl-6 last:pr-6 ${column.headerClassName || ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr
                key={keyExtractor(row, rowIndex)}
                className={`group border-t border-[var(--rt-hairline)] transition-colors hover:bg-[var(--rt-paper)]/70 ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((column, colIndex) => (
                  <td
                    key={colIndex}
                    className={`px-5 py-4 text-sm text-[var(--rt-ink700)] first:pl-6 last:pr-6 ${column.className || ''}`}
                  >
                    {typeof column.accessor === 'function' ? column.accessor(row) : String(row[column.accessor])}
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
