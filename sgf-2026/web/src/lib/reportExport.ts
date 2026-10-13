// Exportação Excel e CSV dos relatórios. O PDF é gerado em `./reports/pdf.ts`
// (vetorial, via pdf-lib); a impressão em HTML foi removida.

import ExcelJS from 'exceljs';
import {
    computeTotals,
    defaultReportFooter,
    filtersSummary,
    formatReportValue,
    generatedAt,
    institutionLines,
    parseBrazilianDate,
    safeHex,
    totalsLabel,
} from './reports/format';
import { downloadBlob, reportFileName } from './reports/reportPdfBrowser';
import type { ReportColumn, ReportExportOptions } from './reports/types';

export type {
    ReportBranding,
    ReportExportOptions,
    ReportFilters,
    ReportLayoutOptions,
} from './reports/types';

const DEFAULT_BRAND = {
    primary: '00A86B',
    primaryDark: '0F2B2F',
    light: 'F1F5F9',
    text: '0F172A',
    muted: '64748B',
};

const EXCEL_FONT_SIZE = 10;

function excelFormat(column: ReportColumn): string | undefined {
    if (column.format === 'currency') return 'R$ #,##0.00';
    if (column.format === 'integer') return '#,##0';
    if (column.format === 'decimal') return '#,##0.00';
    if (column.format === 'percent') return '0.0"%"';
    if (column.format === 'date') return 'dd/mm/yyyy';
    return undefined;
}

export async function exportReportToExcel(options: ReportExportOptions): Promise<void> {
    const {
        reportTitle,
        reportDescription,
        dataset,
        filters,
        branding,
        layout,
    } = options;
    const orientation = layout?.orientation === 'portrait' || layout?.orientation === 'landscape'
        ? layout.orientation
        : dataset.columns.length > 7 ? 'landscape' : 'portrait';
    const primary = safeHex(branding?.primaryColor, DEFAULT_BRAND.primary);
    const dark = safeHex(branding?.darkColor, DEFAULT_BRAND.primaryDark);
    const institutionName = (branding?.name || 'PREFEITURA MUNICIPAL').toUpperCase();
    const softwareName = branding?.appName || 'Exattus Rotta';
    const footerText = branding?.reportFooter
        || defaultReportFooter(softwareName);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = softwareName;
    workbook.created = new Date();
    workbook.subject = reportTitle;
    workbook.description = reportDescription;

    const worksheet = workbook.addWorksheet('Relatório', {
        properties: {
            defaultRowHeight: 18,
        },
        pageSetup: {
            orientation,
            paperSize: 9,
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            horizontalCentered: true,
            margins: {
                left: 0.25,
                right: 0.25,
                top: 0.35,
                bottom: 0.45,
                header: 0.15,
                footer: 0.2,
            },
        },
        views: [{ showGridLines: false, state: 'frozen', ySplit: 9 }],
        headerFooter: {
            oddFooter: `&L${footerText}&R&D &T  |  Página &P de &N`,
        },
    });

    const columnCount = Math.max(dataset.columns.length, 4);
    const mergeRow = (row: number) => worksheet.mergeCells(row, 1, row, columnCount);
    mergeRow(1);
    const institutionCell = worksheet.getCell(1, 1);
    institutionCell.value = institutionName;
    institutionCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    institutionCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    institutionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${dark}` } };
    worksheet.getRow(1).height = 32;

    const identityLines = institutionLines(branding);
    mergeRow(2);
    const identityCell = worksheet.getCell(2, 1);
    identityCell.value = identityLines.join('  •  ') || 'Administração Municipal';
    identityCell.font = { size: 9, color: { argb: `FF${DEFAULT_BRAND.muted}` } };
    identityCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    worksheet.getRow(2).height = 20;

    mergeRow(3);
    const titleCell = worksheet.getCell(3, 1);
    titleCell.value = reportTitle;
    titleCell.font = { bold: true, size: 14, color: { argb: `FF${dark}` } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    worksheet.getRow(3).height = 24;

    mergeRow(4);
    const descriptionCell = worksheet.getCell(4, 1);
    descriptionCell.value = reportDescription;
    descriptionCell.font = { size: 9, color: { argb: `FF${DEFAULT_BRAND.muted}` } };
    descriptionCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
    worksheet.getRow(4).height = 22;

    mergeRow(5);
    const filtersCell = worksheet.getCell(5, 1);
    filtersCell.value = `${filtersSummary(filters)}  |  Emissão: ${generatedAt()}`;
    filtersCell.font = { size: 8, italic: true, color: { argb: 'FF475569' } };
    filtersCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
    filtersCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${DEFAULT_BRAND.light}` } };
    worksheet.getRow(5).height = 22;

    const kpiLabelRow = worksheet.getRow(6);
    const kpiValueRow = worksheet.getRow(7);
    dataset.kpis.slice(0, columnCount).forEach((kpi, index) => {
        const columnIndex = index + 1;
        kpiLabelRow.getCell(columnIndex).value = kpi.label.toUpperCase();
        kpiLabelRow.getCell(columnIndex).font = { size: 8, bold: true, color: { argb: 'FF94A3B8' } };
        kpiValueRow.getCell(columnIndex).value = kpi.value;
        kpiValueRow.getCell(columnIndex).font = { size: 12, bold: true, color: { argb: `FF${dark}` } };
    });
    kpiValueRow.height = 22;

    const headerRowIndex = 9;
    const headerRow = worksheet.getRow(headerRowIndex);
    dataset.columns.forEach((column, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.value = column.label;
        cell.font = { bold: true, size: EXCEL_FONT_SIZE, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${primary}` } };
        cell.alignment = { vertical: 'middle', horizontal: column.align ?? 'left', wrapText: true };
    });
    headerRow.height = 26;

    const writeDataRow = (rowNumber: number, row: ReportExportOptions['dataset']['rows'][number], zebra: boolean) => {
        const dataRow = worksheet.getRow(rowNumber);
        dataset.columns.forEach((column, columnIndex) => {
            const cell = dataRow.getCell(columnIndex + 1);
            const raw = row[column.key];
            // Datas vão como data de verdade (ordenam e filtram no Excel).
            cell.value = (column.format === 'date' ? parseBrazilianDate(raw) : null) ?? raw ?? '—';
            cell.font = { size: EXCEL_FONT_SIZE, color: { argb: `FF${DEFAULT_BRAND.text}` } };
            cell.alignment = { vertical: 'middle', horizontal: column.align ?? 'left', wrapText: true };
            cell.numFmt = excelFormat(column) ?? 'General';
            if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            cell.border = { bottom: { style: 'hair', color: { argb: 'FFDFE7E5' } } };
        });
    };
    // SUBTOTAL(9, …) ignora outros SUBTOTAL do intervalo: subtotais de grupo e
    // total geral convivem sem somar duas vezes, e acompanham edições na planilha.
    const writeTotalsRow = (
        rowNumber: number,
        values: Record<string, number>,
        label: string,
        fromRow: number,
        toRow: number,
        tone: 'total' | 'subtotal',
    ) => {
        const totalRow = worksheet.getRow(rowNumber);
        const labelIndex = dataset.columns.findIndex((column) => !(column.key in values));
        dataset.columns.forEach((column, index) => {
            const cell = totalRow.getCell(index + 1);
            if (column.key in values) {
                const letter = worksheet.getColumn(index + 1).letter;
                cell.value = { formula: `SUBTOTAL(9,${letter}${fromRow}:${letter}${toRow})`, result: values[column.key] };
                cell.numFmt = excelFormat(column) ?? 'General';
            } else if (index === labelIndex) {
                cell.value = label;
            }
            cell.font = { bold: true, size: EXCEL_FONT_SIZE, color: { argb: `FF${tone === 'total' ? dark : '334155'}` } };
            cell.alignment = { vertical: 'middle', horizontal: column.align ?? 'left' };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tone === 'total' ? 'FFEEF2F4' : 'FFF4F7F8' } };
            cell.border = tone === 'total'
                ? { top: { style: 'thin', color: { argb: `FF${dark}` } } }
                : { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
        });
        totalRow.height = 20;
    };

    const groupColumn = options.groupBy
        ? dataset.columns.find((column) => column.key === options.groupBy) ?? options.groupColumn
        : undefined;
    let cursor = headerRowIndex + 1;
    if (groupColumn) {
        let start = 0;
        const groupCount = new Set(dataset.rows.map((row) => formatReportValue(row[groupColumn.key], groupColumn.format))).size;
        while (start < dataset.rows.length) {
            const label = formatReportValue(dataset.rows[start][groupColumn.key], groupColumn.format);
            let end = start;
            while (end < dataset.rows.length && formatReportValue(dataset.rows[end][groupColumn.key], groupColumn.format) === label) end += 1;
            const groupRows = dataset.rows.slice(start, end);
            worksheet.mergeCells(cursor, 1, cursor, Math.max(dataset.columns.length, 1));
            const headCell = worksheet.getCell(cursor, 1);
            headCell.value = `${groupColumn.label}: ${label} · ${groupRows.length} ${groupRows.length === 1 ? 'registro' : 'registros'}`;
            headCell.font = { bold: true, size: EXCEL_FONT_SIZE, color: { argb: `FF${dark}` } };
            headCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF4F0' } };
            cursor += 1;
            const firstDataRow = cursor;
            groupRows.forEach((row, index) => writeDataRow(cursor + index, row, index % 2 === 1));
            cursor += groupRows.length;
            const subtotals = computeTotals(dataset.columns, groupRows);
            if (subtotals && groupCount > 1) {
                writeTotalsRow(cursor, subtotals, `Subtotal — ${label}`, firstDataRow, cursor - 1, 'subtotal');
                cursor += 1;
            }
            start = end;
        }
    } else {
        dataset.rows.forEach((row, index) => writeDataRow(cursor + index, row, index % 2 === 1));
        cursor += dataset.rows.length;
    }

    const lastDataRow = cursor - 1;
    const totals = computeTotals(dataset.columns, dataset.rows);
    let lastTableRow = lastDataRow;
    if (totals && dataset.rows.length > 0) {
        lastTableRow = lastDataRow + 1;
        writeTotalsRow(lastTableRow, totals, totalsLabel(dataset.rows.length), headerRowIndex + 1, lastDataRow, 'total');
        worksheet.getRow(lastTableRow).height = 22;
    }

    worksheet.autoFilter = {
        from: { row: headerRowIndex, column: 1 },
        to: { row: headerRowIndex, column: dataset.columns.length },
    };
    worksheet.pageSetup.printTitlesRow = `${headerRowIndex}:${headerRowIndex}`;
    worksheet.pageSetup.printArea = `A1:${worksheet.getColumn(dataset.columns.length).letter}${lastTableRow}`;

    dataset.columns.forEach((column, index) => {
        const observedLength = Math.max(
            column.label.length,
            ...dataset.rows.slice(0, 500).map((row) => formatReportValue(row[column.key], column.format).length),
        );
        worksheet.getColumn(index + 1).width = Math.min(Math.max(observedLength + 3, 11), 42);
    });

    if (dataset.notes?.length) {
        const noteRowIndex = lastTableRow + 2;
        worksheet.mergeCells(noteRowIndex, 1, noteRowIndex, columnCount);
        const noteCell = worksheet.getCell(noteRowIndex, 1);
        noteCell.value = `Critérios: ${dataset.notes.join(' • ')}`;
        noteCell.font = { size: 8, italic: true, color: { argb: `FF${DEFAULT_BRAND.muted}` } };
        noteCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
        noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        worksheet.getRow(noteRowIndex).height = 34;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlob(blob, reportFileName(reportTitle, 'xlsx'));
}

/**
 * Célula CSV: aspas quando há separador, aspas ou quebra de linha, e prefixo
 * `'` em textos que o Excel interpretaria como fórmula (=, +, -, @).
 */
function csvCell(value: string): string {
    const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d[\d.,]*$/.test(value) ? `'${value}` : value;
    return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV com `;` e BOM UTF-8, no formato que o Excel em pt-BR abre direto. */
export function buildReportCsv(options: ReportExportOptions): string {
    const { dataset, filters, reportTitle } = options;
    const line = (cells: string[]) => cells.map(csvCell).join(';');
    const lines = [
        line(dataset.columns.map((column) => column.label)),
        ...dataset.rows.map((row) => line(dataset.columns.map((column) => {
            const value = row[column.key];
            if (value === undefined || value === null) return '';
            return typeof value === 'number' ? formatReportValue(value, column.format) : String(value);
        }))),
        '',
        line(['Relatório', reportTitle]),
        line(['Filtros', filtersSummary(filters)]),
        line(['Gerado em', generatedAt()]),
    ];
    return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function exportReportToCsv(options: ReportExportOptions): void {
    const blob = new Blob([buildReportCsv(options)], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, reportFileName(options.reportTitle, 'csv'));
}
