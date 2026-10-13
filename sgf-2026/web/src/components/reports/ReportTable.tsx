import { Fragment, useMemo, useState, type ReactNode } from 'react';
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

export function ReportTable({ columns: allColumns, rows, groupColumn, sort, onSort, renderAction }: ReportTableProps) {
    // Agrupado, o valor do grupo já está no cabeçalho do grupo: a coluna sai da tabela (igual ao PDF).
    const columns = useMemo(
        () => (groupColumn && allColumns.length > 1 ? allColumns.filter((column) => column.key !== groupColumn.key) : allColumns),
        [allColumns, groupColumn],
    );
    const totals = useMemo(() => computeTotals(columns, rows), [columns, rows]);

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

    // O rótulo (Total/Subtotal) ocupa as colunas de texto antes do primeiro valor somado.
    const totalsRow = (values: Record<string, number>, label: string, tone: 'total' | 'subtotal', key?: string) => {
        const firstValue = columns.findIndex((column) => column.key in values);
        const span = Math.max(1, firstValue === -1 ? columns.length : firstValue);
        const rest = columns.slice(firstValue <= 0 ? 1 : span);
        const labelValue = firstValue === 0 ? formatReportValue(values[columns[0].key], columns[0].format) : null;
        return (
            <tr key={key} className={tone === 'total'
                ? 'border-t-2 border-[var(--sgf-dark)] bg-slate-100 text-[13px] font-bold text-[var(--sgf-dark)]'
                : 'border-t border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600'}
            >
                <td colSpan={span} className={`px-3 tabular-nums ${tone === 'total' ? 'py-3' : 'py-2'}`}>
                    {labelValue !== null ? <><span className="mr-2">{label}:</span>{labelValue}</> : label}
                </td>
                {rest.map((column) => (
                    <td key={column.key} className={`whitespace-nowrap px-3 tabular-nums ${tone === 'total' ? 'py-3' : 'py-2'}`} style={{ textAlign: column.align ?? 'left' }}>
                        {column.key in values ? formatReportValue(values[column.key], column.format) : ''}
                    </td>
                ))}
                {renderAction && <td />}
            </tr>
        );
    };

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
                                    <Fragment key={`g-${page}-${index}`}>
                                        {index > 0 && (
                                            <tr aria-hidden="true">
                                                <td colSpan={colSpan} className="h-5 border-0 bg-white p-0" />
                                            </tr>
                                        )}
                                        <tr className="border-y border-emerald-100 bg-emerald-50/80">
                                            <td colSpan={colSpan} className="border-l-[3px] border-l-[var(--sgf-primary)] px-3 py-2.5 text-[13px] font-bold text-[var(--sgf-dark)]">
                                                <span className="font-semibold text-slate-500">{groupColumn?.label}:</span> {item.label}
                                                <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                                                    {item.count.toLocaleString('pt-BR')} {item.count === 1 ? 'registro' : 'registros'}
                                                </span>
                                            </td>
                                        </tr>
                                    </Fragment>
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
                                            className="px-3 py-2.5 align-top text-slate-700 tabular-nums"
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
