import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from '@/components/sgf/icons';
import { computeTotals, formatReportValue, totalsLabel } from '@/lib/reports/format';
import type { ReportColumn, ReportDataset } from '@/lib/reports/types';
import type { ReportSort } from '@/lib/reports/viewerState';

const PAGE_SIZE = 60;

type Item =
    | { type: 'group'; label: string; count: number }
    | { type: 'row'; row: ReportDataset['rows'][number]; zebra: boolean }
    | { type: 'subtotal'; label: string; totals: Record<string, number> };

interface ReportTableProps {
    columns: ReportColumn[];
    /** Linhas já filtradas e ordenadas (inclusive pelo agrupamento). */
    rows: ReportDataset['rows'];
    groupColumn?: ReportColumn;
    sort: ReportSort | null;
    onSort: (key: string) => void;
    renderAction?: (row: ReportDataset['rows'][number]) => ReactNode;
}

export function ReportTable({ columns, rows, groupColumn, sort, onSort, renderAction }: ReportTableProps) {
    const totals = useMemo(() => computeTotals(columns, rows), [columns, rows]);
    const labelKey = totals ? columns.find((column) => !(column.key in totals))?.key : undefined;

    const items = useMemo<Item[]>(() => {
        if (!groupColumn) return rows.map((row, index) => ({ type: 'row', row, zebra: index % 2 === 1 }));
        const list: Item[] = [];
        let start = 0;
        while (start < rows.length) {
            const label = formatReportValue(rows[start][groupColumn.key], groupColumn.format);
            let end = start;
            while (end < rows.length && formatReportValue(rows[end][groupColumn.key], groupColumn.format) === label) end += 1;
            const groupRows = rows.slice(start, end);
            list.push({ type: 'group', label, count: groupRows.length });
            groupRows.forEach((row, index) => list.push({ type: 'row', row, zebra: index % 2 === 1 }));
            const subtotals = computeTotals(columns, groupRows);
            if (subtotals && end - start > 0 && rows.length > groupRows.length) {
                list.push({ type: 'subtotal', label: `Subtotal — ${label}`, totals: subtotals });
            }
            start = end;
        }
        return list;
    }, [columns, groupColumn, rows]);

    // A página volta para 1 quando as linhas mudam (filtro, ordem, grupo).
    const [pageState, setPageState] = useState<{ items: Item[]; page: number }>({ items, page: 1 });
    const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const page = pageState.items === items ? Math.min(pageState.page, pageCount) : 1;
    const setPage = (update: (current: number) => number) => setPageState({ items, page: update(page) });
    const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const colSpan = columns.length + (renderAction ? 1 : 0);
    const tableWidth = columns.reduce((sum, column) => sum + (column.minWidth ?? 110), 0);

    const totalsRow = (values: Record<string, number>, label: string, tone: 'total' | 'subtotal', key?: string) => (
        <tr key={key} className={tone === 'total'
            ? 'border-t-2 border-[var(--sgf-dark)] bg-slate-100 font-bold text-[var(--sgf-dark)]'
            : 'border-b border-slate-300 bg-slate-50 font-semibold text-slate-700'}
        >
            {columns.map((column) => (
                <td key={column.key} className="whitespace-nowrap px-3 py-2.5 align-top tabular-nums" style={{ textAlign: column.align ?? 'left' }}>
                    {column.key in values
                        ? formatReportValue(values[column.key], column.format)
                        : column.key === labelKey ? label : ''}
                </td>
            ))}
            {renderAction && <td />}
        </tr>
    );

    return (
        <>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="border-collapse text-left text-[13px]" style={{ width: `max(100%, ${tableWidth}px)` }}>
                    <colgroup>
                        {columns.map((column) => <col key={column.key} style={{ width: `${column.minWidth ?? 110}px` }} />)}
                    </colgroup>
                    <thead className="sticky top-0 z-10">
                        <tr className="border-b-2 border-[var(--sgf-dark)] bg-slate-100 text-[var(--sgf-dark)]">
                            {columns.map((column) => {
                                const active = sort?.key === column.key;
                                return (
                                    <th
                                        key={column.key}
                                        scope="col"
                                        aria-sort={active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                                        className="px-3 py-2.5 text-xs font-bold"
                                        style={{ textAlign: column.align ?? 'left' }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => onSort(column.key)}
                                            title="Ordenar por esta coluna"
                                            className={`inline-flex items-center gap-1 rounded hover:text-[var(--sgf-primary)] ${column.align === 'right' ? 'flex-row-reverse' : ''}`}
                                        >
                                            <span>{column.label}</span>
                                            {active && (sort!.direction === 'asc'
                                                ? <ChevronUp className="h-3.5 w-3.5" />
                                                : <ChevronDown className="h-3.5 w-3.5" />)}
                                        </button>
                                    </th>
                                );
                            })}
                            {renderAction && <th className="px-3 py-2.5 text-xs font-bold">Ação</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {pageItems.map((item, index) => {
                            if (item.type === 'group') {
                                return (
                                    <tr key={`g-${page}-${index}`} className="bg-emerald-50/70">
                                        <td colSpan={colSpan} className="border-l-[3px] border-[var(--sgf-primary)] px-3 py-2 text-xs font-bold text-[var(--sgf-dark)]">
                                            {groupColumn?.label}: {item.label}
                                            <span className="ml-2 font-medium text-slate-500">
                                                · {item.count.toLocaleString('pt-BR')} {item.count === 1 ? 'registro' : 'registros'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            }
                            if (item.type === 'subtotal') {
                                return totalsRow(item.totals, item.label, 'subtotal', `s-${page}-${index}`);
                            }
                            return (
                                <tr key={`r-${page}-${index}`} className={`border-b border-slate-100 ${item.zebra ? 'bg-slate-50/70' : ''}`}>
                                    {columns.map((column) => (
                                        <td
                                            key={column.key}
                                            className="px-3 py-2 align-top text-slate-700 tabular-nums"
                                            style={{ textAlign: column.align ?? 'left' }}
                                        >
                                            {formatReportValue(item.row[column.key], column.format)}
                                        </td>
                                    ))}
                                    {renderAction && <td className="px-3 py-2 align-top">{renderAction(item.row)}</td>}
                                </tr>
                            );
                        })}
                    </tbody>
                    {totals && page === pageCount && <tfoot>{totalsRow(totals, totalsLabel(rows.length), 'total')}</tfoot>}
                </table>
            </div>
            {pageCount > 1 && (
                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                    <span>Página {page} de {pageCount} · {rows.length.toLocaleString('pt-BR')} registros</span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={page === 1}
                            onClick={() => setPage((current) => Math.max(1, current - 1))}
                            className="rounded-full border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"
                        >
                            Anterior
                        </button>
                        <button
                            type="button"
                            disabled={page === pageCount}
                            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                            className="rounded-full border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"
                        >
                            Próxima
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
