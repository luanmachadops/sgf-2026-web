import ExcelJS from 'exceljs';
import {
    formatReportValue,
    type ReportChart,
    type ReportColumn,
    type ReportDataset,
} from './reportData';

const DEFAULT_BRAND = {
    primary: '00A86B',
    primaryDark: '0F2B2F',
    accent: '70C4A8',
    light: 'F1F5F9',
    text: '0F172A',
    muted: '64748B',
};

export interface ReportFilters {
    periodLabel: string;
    dateFrom?: string;
    dateTo?: string;
    departmentLabel: string;
    contextLabel?: string;
    searchLabel?: string;
}

export interface ReportBranding {
    name: string;
    appName?: string;
    logoUrl?: string;
    sealUrl?: string;
    city?: string;
    state?: string;
    cnpj?: string;
    address?: string;
    postalCode?: string;
    supportPhone?: string;
    mayorName?: string;
    reportFooter?: string;
    primaryColor?: string;
    darkColor?: string;
    accentColor?: string;
}

export interface ReportLayoutOptions {
    orientation: 'portrait' | 'landscape';
    fontSize: number;
    columnScale: number;
}

export interface ReportExportOptions {
    reportTitle: string;
    reportDescription: string;
    dataset: ReportDataset;
    filters: ReportFilters;
    branding?: ReportBranding;
    layout?: ReportLayoutOptions;
}

const DEFAULT_LAYOUT: ReportLayoutOptions = {
    orientation: 'portrait',
    fontSize: 9,
    columnScale: 100,
};

function generatedAt(): string {
    return new Date().toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function safeHex(value: string | undefined, fallback: string): string {
    const normalized = (value ?? '').replace('#', '').trim();
    return /^[\da-f]{6}$/i.test(normalized) ? normalized.toUpperCase() : fallback;
}

function stateName(state?: string): string {
    const states: Record<string, string> = {
        PR: 'PARANÁ',
        SC: 'SANTA CATARINA',
        RS: 'RIO GRANDE DO SUL',
        SP: 'SÃO PAULO',
        MG: 'MINAS GERAIS',
        RJ: 'RIO DE JANEIRO',
        MS: 'MATO GROSSO DO SUL',
        MT: 'MATO GROSSO',
        GO: 'GOIÁS',
    };
    const code = state?.trim().toUpperCase() ?? '';
    return states[code] ?? code;
}

function institutionLines(branding?: ReportBranding): string[] {
    const city = branding?.city?.trim();
    const state = branding?.state?.trim();
    const isTapejara = city?.localeCompare('Tapejara', 'pt-BR', { sensitivity: 'base' }) === 0
        && (!state || state.toUpperCase() === 'PR');
    const postalCode = branding?.postalCode || (isTapejara ? '87430-000' : '');
    const lines: string[] = [];
    if (branding?.cnpj) lines.push(`CNPJ: ${branding.cnpj}`);
    const addressLine = [
        branding?.address?.trim(),
        branding?.supportPhone ? `Fone: ${branding.supportPhone}` : '',
    ].filter(Boolean).join(' — ');
    if (addressLine) lines.push(addressLine);
    const locationLine = [
        postalCode ? `CEP ${postalCode}` : '',
        city?.toUpperCase(),
        stateName(state),
    ].filter(Boolean).join(' — ');
    if (locationLine) lines.push(locationLine);
    return lines;
}

function filtersSummary(filters: ReportFilters): string {
    const parts: string[] = [
        `Período: ${filters.periodLabel}`,
        `Secretaria: ${filters.departmentLabel}`,
    ];
    if (filters.dateFrom) parts.push(`De: ${formatFilterDate(filters.dateFrom)}`);
    if (filters.dateTo) parts.push(`Até: ${formatFilterDate(filters.dateTo)}`);
    if (filters.contextLabel) parts.push(filters.contextLabel);
    if (filters.searchLabel) parts.push(`Busca: ${filters.searchLabel}`);
    return parts.join('  •  ');
}

function formatFilterDate(value: string): string {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
}

const LOGO_SVG = `
<svg width="50" height="50" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect width="24" height="24" rx="7" fill="#00A86B"/>
  <path d="M12 5l4.5 1.8v3.6c0 2.8-1.9 5.4-4.5 6.3-2.6-.9-4.5-3.5-4.5-6.3V6.8L12 5z" fill="#fff" fill-opacity="0.25"/>
  <path d="M10.6 12.2l-1.3-1.3-1 1 2.3 2.4 4-4.1-1-1-3 3z" fill="#fff"/>
</svg>`;

function chartHtml(chart: ReportChart, primary: string): string {
    const data = chart.data.filter((item) => item.value >= 0).slice(0, 8);
    if (data.length === 0) return '';
    const max = Math.max(...data.map((item) => item.value), 1);
    return `
      <section class="chart-block">
        <div class="chart-heading">
          <div>
            <h2>${escapeHtml(chart.title)}</h2>
            ${chart.description ? `<p>${escapeHtml(chart.description)}</p>` : ''}
          </div>
        </div>
        <div class="chart-bars">
          ${data.map((item) => `
            <div class="chart-row">
              <span class="chart-label">${escapeHtml(item.label)}</span>
              <span class="chart-track"><span class="chart-fill" style="width:${Math.max(2, (item.value / max) * 100)}%;background:#${primary}"></span></span>
              <strong>${escapeHtml(formatReportValue(item.value, chart.valueFormat ?? 'integer'))}</strong>
            </div>
          `).join('')}
        </div>
      </section>`;
}

function columnWidths(columns: ReportColumn[], scale: number): number[] {
    return columns.map((column) => Math.round((column.minWidth ?? 110) * (scale / 100)));
}

function tableHtml(
    dataset: ReportDataset,
    widths: number[],
): string {
    const headHtml = dataset.columns
        .map((column) => `<th style="text-align:${column.align ?? 'left'}">${escapeHtml(column.label)}</th>`)
        .join('');
    const rowsHtml = dataset.rows.map((row) => `
      <tr>${dataset.columns.map((column) => `
        <td style="text-align:${column.align ?? 'left'}">${escapeHtml(formatReportValue(row[column.key], column.format))}</td>
      `).join('')}</tr>`).join('');
    return `
      <div class="table-scroll">
        <table>
          <colgroup>${widths.map((width) => `<col style="width:${width}px" />`).join('')}</colgroup>
          <thead><tr>${headHtml}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
}

function splitRows(
    rows: ReportDataset['rows'],
    firstPageSize: number,
    nextPageSize: number,
): ReportDataset['rows'][] {
    if (rows.length === 0) return [[]];
    const pages: ReportDataset['rows'][] = [rows.slice(0, firstPageSize)];
    for (let index = firstPageSize; index < rows.length; index += nextPageSize) {
        pages.push(rows.slice(index, index + nextPageSize));
    }
    return pages;
}

export function buildReportPrintHtml(
    options: ReportExportOptions,
    autoPrint = true,
): string {
    const {
        reportTitle,
        reportDescription,
        dataset,
        filters,
        branding,
        layout = DEFAULT_LAYOUT,
    } = options;
    const primary = safeHex(branding?.primaryColor, DEFAULT_BRAND.primary);
    const dark = safeHex(branding?.darkColor, DEFAULT_BRAND.primaryDark);
    const accent = safeHex(branding?.accentColor, DEFAULT_BRAND.accent);
    const institutionName = (branding?.name || 'PREFEITURA MUNICIPAL').toUpperCase();
    const softwareName = branding?.appName || 'Exattus Rotta';
    const footerText = branding?.reportFooter
        || `${softwareName} — Sistema de gestão pública de frotas, rastreamento, abastecimentos e manutenções por protocolo digital.`;
    const logoUrl = branding?.sealUrl || branding?.logoUrl;
    const logoHtml = logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(institutionName)}" />`
        : LOGO_SVG;
    const lines = institutionLines(branding);
    const rowCapacity = layout.orientation === 'landscape' ? 30 : 24;
    const fontAdjustment = Math.round((10 - layout.fontSize) * 1.5);
    const firstPageAdjustment = (dataset.kpis.length > 0 ? 4 : 0)
        + ((dataset.charts?.length ?? 0) > 0 ? 9 : 0)
        + ((dataset.notes?.length ?? 0) > 0 ? 3 : 0);
    const firstPageSize = Math.max(8, rowCapacity + fontAdjustment - firstPageAdjustment);
    const nextPageSize = Math.max(12, rowCapacity + fontAdjustment);
    const rowPages = splitRows(dataset.rows, firstPageSize, nextPageSize);
    const widths = columnWidths(dataset.columns, layout.columnScale);
    const generated = generatedAt();

    const sheets = rowPages.map((rows, pageIndex) => {
        const pageDataset = { ...dataset, rows };
        const isFirst = pageIndex === 0;
        return `
          <section class="sheet">
            <header class="institution-header">
              <div class="institution-logo">${logoHtml}</div>
              <div class="institution-copy">
                <div class="institution-name">${escapeHtml(institutionName)}</div>
                ${lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
              </div>
              <div class="document-meta">
                <strong>RELATÓRIO OFICIAL</strong>
                <span>Emissão: ${escapeHtml(generated)}</span>
              </div>
            </header>

            <div class="report-heading">
              <div>
                <h1>${escapeHtml(reportTitle)}</h1>
                <p>${escapeHtml(reportDescription)}</p>
              </div>
              ${pageIndex > 0 ? `<span>Continuação</span>` : ''}
            </div>

            ${isFirst ? `<div class="filters">${escapeHtml(filtersSummary(filters))}</div>` : ''}

            ${isFirst && dataset.kpis.length > 0 ? `
              <section class="kpis">
                ${dataset.kpis.map((kpi) => `
                  <div class="kpi">
                    <div class="kpi-value">${escapeHtml(kpi.value)}</div>
                    <div class="kpi-label">${escapeHtml(kpi.label)}</div>
                  </div>`).join('')}
              </section>` : ''}

            ${isFirst && dataset.charts?.[0] ? chartHtml(dataset.charts[0], primary) : ''}
            ${tableHtml(pageDataset, widths)}

            ${isFirst && dataset.notes?.length ? `
              <section class="notes">
                <strong>Critérios do relatório</strong>
                ${dataset.notes.map((note) => `<p>• ${escapeHtml(note)}</p>`).join('')}
              </section>` : ''}

            <footer class="report-footer">
              <span>${escapeHtml(footerText)}</span>
              <span>Emissão: ${escapeHtml(generated)} · Página ${pageIndex + 1} de ${rowPages.length}</span>
            </footer>
          </section>`;
    }).join('');

    const pageSize = layout.orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait';
    const pageWidth = layout.orientation === 'landscape' ? '297mm' : '210mm';
    const pageHeight = layout.orientation === 'landscape' ? '210mm' : '297mm';
    const tableWidth = widths.reduce((sum, width) => sum + width, 0);
    const availableTableWidth = layout.orientation === 'landscape' ? 1000 : 700;
    const tableRenderWidth = Math.max(availableTableWidth, tableWidth);
    const tableZoom = Math.min(1, availableTableWidth / tableRenderWidth);

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(reportTitle)}</title>
<style>
  * { box-sizing:border-box; }
  html, body { margin:0; padding:0; background:#e8edf0; color:#${DEFAULT_BRAND.text}; font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif; }
  @page { size:${pageSize}; margin:0; }
  .sheet { position:relative; width:${pageWidth}; min-height:${pageHeight}; margin:10mm auto; padding:11mm 11mm 18mm; overflow:hidden; background:#fff; break-after:page; page-break-after:always; }
  .sheet:last-child { break-after:auto; page-break-after:auto; }
  .institution-header { display:grid; grid-template-columns:58px 1fr auto; gap:12px; align-items:center; padding-bottom:10px; border-bottom:3px solid #${primary}; }
  .institution-logo { width:52px; height:52px; display:flex; align-items:center; justify-content:center; }
  .institution-logo img { width:52px; height:52px; object-fit:contain; }
  .institution-copy { font-size:8.2px; line-height:1.45; color:#475569; text-transform:uppercase; letter-spacing:.035em; }
  .institution-name { margin-bottom:2px; color:#${dark}; font-size:13px; font-weight:850; letter-spacing:.02em; }
  .document-meta { display:flex; flex-direction:column; align-items:flex-end; gap:3px; color:#${DEFAULT_BRAND.muted}; font-size:8px; white-space:nowrap; }
  .document-meta strong { color:#${primary}; letter-spacing:.08em; }
  .report-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-top:12px; }
  .report-heading h1 { margin:0; color:#${dark}; font-size:17px; line-height:1.15; letter-spacing:-.02em; }
  .report-heading p { margin:4px 0 0; color:#${DEFAULT_BRAND.muted}; font-size:9px; }
  .report-heading > span { padding:4px 8px; border:1px solid #cbd5e1; border-radius:999px; color:#64748b; font-size:7px; font-weight:700; text-transform:uppercase; }
  .filters { margin-top:9px; padding:7px 9px; border-left:3px solid #${accent}; border-radius:4px; background:#f4f7f8; color:#334155; font-size:8px; font-weight:650; }
  .kpis { display:grid; grid-template-columns:repeat(${Math.min(Math.max(dataset.kpis.length, 1), 4)},1fr); gap:6px; margin-top:10px; }
  .kpi { min-width:0; padding:8px 9px; border:1px solid #dfe7e5; border-radius:7px; background:#fff; }
  .kpi-value { color:#${dark}; font-size:13px; font-weight:850; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .kpi-label { margin-top:2px; color:#64748b; font-size:6.8px; font-weight:750; text-transform:uppercase; letter-spacing:.06em; }
  .chart-block { margin-top:10px; padding:8px 10px; border:1px solid #e2e8f0; border-radius:8px; }
  .chart-heading h2 { margin:0; color:#${dark}; font-size:9px; }
  .chart-heading p { margin:2px 0 0; color:#64748b; font-size:7px; }
  .chart-bars { display:grid; gap:3px; margin-top:6px; }
  .chart-row { display:grid; grid-template-columns:92px 1fr 70px; gap:6px; align-items:center; min-height:9px; font-size:6.8px; }
  .chart-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#475569; }
  .chart-track { height:5px; overflow:hidden; border-radius:999px; background:#e8efed; }
  .chart-fill { display:block; height:100%; border-radius:999px; }
  .chart-row strong { color:#${dark}; text-align:right; }
  .table-scroll { width:100%; margin-top:10px; overflow:hidden; }
  table { width:${tableRenderWidth}px; border-collapse:collapse; table-layout:fixed; font-size:${layout.fontSize}px; zoom:${tableZoom}; }
  thead { display:table-header-group; }
  thead th { padding:6px 7px; background:#${dark}; color:#fff; font-size:${Math.max(6.5, layout.fontSize - 1.5)}px; font-weight:750; letter-spacing:.035em; text-transform:uppercase; vertical-align:bottom; }
  tbody td { padding:5px 7px; border-bottom:1px solid #e8edf0; color:#334155; line-height:1.2; overflow-wrap:anywhere; vertical-align:top; }
  tbody tr:nth-child(even) { background:#f8fafb; }
  .notes { margin-top:8px; padding:6px 8px; border:1px solid #dfe7e5; border-radius:6px; color:#64748b; font-size:6.8px; line-height:1.35; }
  .notes strong { color:#${dark}; }
  .notes p { margin:2px 0 0; }
  .report-footer { position:absolute; right:11mm; bottom:7mm; left:11mm; display:flex; align-items:flex-end; justify-content:space-between; gap:16px; padding-top:5px; border-top:1px solid #dbe4e2; color:#64748b; font-size:6.5px; line-height:1.25; }
  .report-footer span:first-child { max-width:68%; }
  .report-footer span:last-child { white-space:nowrap; text-align:right; }
  @media print {
    html, body { background:#fff; }
    .sheet { margin:0; box-shadow:none; }
  }
</style>
</head>
<body>
${sheets}
${autoPrint ? `<script>
  window.onload = function () {
    setTimeout(function () { window.print(); }, 450);
  };
</script>` : ''}
</body>
</html>`;
}

export function exportReportToPDF(options: ReportExportOptions): void {
    const printWindow = window.open('', '_blank', 'width=1100,height=900');
    if (!printWindow) return;
    printWindow.document.write(buildReportPrintHtml(options));
    printWindow.document.close();
}

function excelFormat(column: ReportColumn): string | undefined {
    if (column.format === 'currency') return 'R$ #,##0.00';
    if (column.format === 'integer') return '#,##0';
    if (column.format === 'decimal') return '#,##0.00';
    if (column.format === 'percent') return '0.0"%"';
    return undefined;
}

export async function exportReportToExcel(options: ReportExportOptions): Promise<void> {
    const {
        reportTitle,
        reportDescription,
        dataset,
        filters,
        branding,
        layout = DEFAULT_LAYOUT,
    } = options;
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
            defaultRowHeight: Math.max(16, layout.fontSize + 8),
        },
        pageSetup: {
            orientation: layout.orientation,
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
        views: [{ showGridLines: false, state: 'frozen', ySplit: 8 }],
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
        cell.font = { bold: true, size: Math.max(8, layout.fontSize), color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${primary}` } };
        cell.alignment = { vertical: 'middle', horizontal: column.align ?? 'left', wrapText: true };
    });
    headerRow.height = 26;

    dataset.rows.forEach((row, rowIndex) => {
        const dataRow = worksheet.getRow(headerRowIndex + 1 + rowIndex);
        dataset.columns.forEach((column, columnIndex) => {
            const cell = dataRow.getCell(columnIndex + 1);
            cell.value = row[column.key] ?? '—';
            cell.font = { size: layout.fontSize, color: { argb: `FF${DEFAULT_BRAND.text}` } };
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

    worksheet.autoFilter = {
        from: { row: headerRowIndex, column: 1 },
        to: { row: headerRowIndex, column: dataset.columns.length },
    };
    worksheet.pageSetup.printTitlesRow = `${headerRowIndex}:${headerRowIndex}`;
    worksheet.pageSetup.printArea = `A1:${worksheet.getColumn(dataset.columns.length).letter}${headerRowIndex + dataset.rows.length}`;

    dataset.columns.forEach((column, index) => {
        const observedLength = Math.max(
            column.label.length,
            ...dataset.rows.slice(0, 500).map((row) => formatReportValue(row[column.key], column.format).length),
        );
        const scaledWidth = Math.min(Math.max(observedLength + 3, 11), 38) * (layout.columnScale / 100);
        worksheet.getColumn(index + 1).width = Math.max(8, Math.min(scaledWidth, 50));
    });

    if (dataset.notes?.length) {
        const noteRowIndex = headerRowIndex + dataset.rows.length + 2;
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
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${reportTitle.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
