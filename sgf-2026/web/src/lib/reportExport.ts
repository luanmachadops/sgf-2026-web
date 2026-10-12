// Exportação Excel dos relatórios. O PDF é gerado em `./reports/pdf.ts`
// (vetorial, via pdf-lib); a impressão em HTML foi removida.

import ExcelJS from 'exceljs';
import {
    computeTotals,
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
        || `${softwareName} — Gestão pública de frotas por protocolo digital`;
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

    dataset.rows.forEach((row, rowIndex) => {
        const dataRow = worksheet.getRow(headerRowIndex + 1 + rowIndex);
        dataset.columns.forEach((column, columnIndex) => {
            const cell = dataRow.getCell(columnIndex + 1);
            const raw = row[column.key];
            // Datas vão como data de verdade (ordenam e filtram no Excel).
            cell.value = (column.format === 'date' ? parseBrazilianDate(raw) : null) ?? raw ?? '—';
            cell.font = { size: EXCEL_FONT_SIZE, color: { argb: `FF${DEFAULT_BRAND.text}` } };
            cell.alignment = {
                vertical: 'middle',
                horizontal: column.align ?? 'left',
                wrapText: true,
            };
            cell.numFmt = excelFormat(column) ?? 'General';
            if (rowIndex % 2 === 1) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            }
            cell.border = { bottom: { style: 'hair', color: { argb: 'FFDFE7E5' } } };
        });
    });

    const lastDataRow = headerRowIndex + dataset.rows.length;
    const totals = computeTotals(dataset.columns, dataset.rows);
    let lastTableRow = lastDataRow;
    if (totals && dataset.rows.length > 0) {
        lastTableRow = lastDataRow + 1;
        const totalRow = worksheet.getRow(lastTableRow);
        const labelIndex = dataset.columns.findIndex((column) => !(column.key in totals));
        dataset.columns.forEach((column, index) => {
            const cell = totalRow.getCell(index + 1);
            if (column.key in totals) {
                const letter = worksheet.getColumn(index + 1).letter;
                // Fórmula: continua certa se o usuário editar valores na planilha.
                cell.value = {
                    formula: `SUBTOTAL(9,${letter}${headerRowIndex + 1}:${letter}${lastDataRow})`,
                    result: totals[column.key],
                };
                cell.numFmt = excelFormat(column) ?? 'General';
            } else if (index === labelIndex) {
                cell.value = totalsLabel(dataset.rows.length);
            }
            cell.font = { bold: true, size: EXCEL_FONT_SIZE, color: { argb: `FF${dark}` } };
            cell.alignment = { vertical: 'middle', horizontal: column.align ?? 'left' };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F4' } };
            cell.border = { top: { style: 'thin', color: { argb: `FF${dark}` } } };
        });
        totalRow.height = 22;
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
