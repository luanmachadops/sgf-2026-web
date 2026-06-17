import ExcelJS from 'exceljs';
import type { ReportDataset } from './reportData';

const BRAND = {
    primary: '00A86B',
    primaryDark: '0F2B2F',
    light: 'F1F5F9',
    text: '0F172A',
    muted: '64748B',
};

export interface ReportFilters {
    periodLabel: string;
    dateFrom?: string;
    dateTo?: string;
    departmentLabel: string;
}

export interface ReportBranding {
    name: string;
    logoUrl?: string;
    sealUrl?: string;
    city?: string;
    state?: string;
    cnpj?: string;
    mayorName?: string;
    reportFooter?: string;
}

export interface ReportExportOptions {
    reportTitle: string;
    reportDescription: string;
    dataset: ReportDataset;
    filters: ReportFilters;
    branding?: ReportBranding;
}

function generatedAt(): string {
    return new Date().toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function filtersSummary(f: ReportFilters): string {
    const parts: string[] = [`Período: ${f.periodLabel}`, `Secretaria: ${f.departmentLabel}`];
    if (f.dateFrom) parts.push(`De: ${f.dateFrom}`);
    if (f.dateTo) parts.push(`Até: ${f.dateTo}`);
    return parts.join('  •  ');
}

// ── Logo (escudo) como SVG inline para o PDF ──────────────────────────────
const LOGO_SVG = `
<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="7" fill="#00A86B"/>
  <path d="M12 5l4.5 1.8v3.6c0 2.8-1.9 5.4-4.5 6.3-2.6-.9-4.5-3.5-4.5-6.3V6.8L12 5z" fill="#fff" fill-opacity="0.25"/>
  <path d="M10.6 12.2l-1.3-1.3-1 1 2.3 2.4 4-4.1-1-1-3 3z" fill="#fff"/>
</svg>`;

// ──────────────────────────────────────────────────────────────────────────
// PDF — abre janela com HTML elegante (mesma paleta/identidade) e imprime
// ──────────────────────────────────────────────────────────────────────────
export function exportReportToPDF(opts: ReportExportOptions): void {
    const { reportTitle, reportDescription, dataset, filters, branding } = opts;
    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) return;

    const brandName = branding?.name || 'SGF 2026';
    const brandSub = [branding?.city ? `${branding.city}${branding.state ? '/' + branding.state : ''}` : '', branding?.cnpj ? `CNPJ ${branding.cnpj}` : '']
        .filter(Boolean).join('  •  ') || 'Gestão Pública de Frota';
    const logoImg = branding?.sealUrl || branding?.logoUrl;
    const logoHtml = logoImg ? `<img src="${logoImg}" alt="${brandName}" style="width:48px;height:48px;object-fit:contain" />` : LOGO_SVG;
    const footerLeft = branding?.reportFooter || `${brandName} — Sistema de Gestão de Frota`;

    const kpisHtml = dataset.kpis.map((k) => `
        <div class="kpi">
            <div class="kpi-value">${k.value}</div>
            <div class="kpi-label">${k.label}</div>
        </div>`).join('');

    const headHtml = dataset.columns.map((c) =>
        `<th style="text-align:${c.align ?? 'left'}">${c.label}</th>`).join('');

    const rowsHtml = dataset.rows.map((row) => `
        <tr>${dataset.columns.map((c) => {
        const v = row[c.key];
        const val = typeof v === 'number' ? v.toLocaleString('pt-BR') : (v ?? '—');
        return `<td style="text-align:${c.align ?? 'left'}">${val}</td>`;
    }).join('')}</tr>`).join('');

    win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${reportTitle}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#${BRAND.text}; padding:40px; }
  .header { display:flex; align-items:center; gap:16px; padding-bottom:20px; border-bottom:3px solid #${BRAND.primary}; }
  .brand { display:flex; flex-direction:column; }
  .brand-name { font-size:18px; font-weight:800; color:#${BRAND.primaryDark}; letter-spacing:-0.02em; }
  .brand-sub { font-size:11px; font-weight:600; color:#${BRAND.primary}; text-transform:uppercase; letter-spacing:0.08em; }
  .meta { margin-left:auto; text-align:right; font-size:11px; color:#${BRAND.muted}; }
  .title { margin-top:28px; }
  .title h1 { font-size:24px; font-weight:800; letter-spacing:-0.02em; color:#${BRAND.primaryDark}; }
  .title p { margin-top:6px; font-size:13px; color:#${BRAND.muted}; }
  .filters { margin-top:16px; padding:12px 16px; background:#${BRAND.light}; border-radius:12px; font-size:12px; font-weight:600; color:#334155; }
  .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:24px; }
  .kpi { padding:16px; border:1px solid #E2E8F0; border-radius:14px; background:#fff; }
  .kpi-value { font-size:22px; font-weight:800; color:#${BRAND.primaryDark}; }
  .kpi-label { margin-top:4px; font-size:11px; color:#${BRAND.muted}; text-transform:uppercase; letter-spacing:0.05em; font-weight:700; }
  table { width:100%; border-collapse:collapse; margin-top:28px; font-size:12px; }
  thead th { background:#${BRAND.primary}; color:#fff; padding:10px 12px; font-weight:700; text-transform:uppercase; font-size:10px; letter-spacing:0.05em; }
  thead th:first-child { border-top-left-radius:10px; }
  thead th:last-child { border-top-right-radius:10px; }
  tbody td { padding:10px 12px; border-bottom:1px solid #EEF2F6; }
  tbody tr:nth-child(even) { background:#F8FAFC; }
  .footer { margin-top:40px; padding-top:16px; border-top:1px solid #E2E8F0; font-size:10px; color:#94A3B8; display:flex; justify-content:space-between; }
  @media print { body { padding:24px; } .kpi, table { break-inside:avoid; } }
</style>
</head>
<body>
  <div class="header">
    ${logoHtml}
    <div class="brand">
      <span class="brand-name">${brandName}</span>
      <span class="brand-sub">${brandSub}</span>
    </div>
    <div class="meta">
      Gerado em ${generatedAt()}<br/>
      ${branding?.mayorName ? 'Prefeito(a): ' + branding.mayorName : 'Documento confidencial'}
    </div>
  </div>

  <div class="title">
    <h1>${reportTitle}</h1>
    <p>${reportDescription}</p>
  </div>

  <div class="filters">${filtersSummary(filters)}</div>

  <div class="kpis">${kpisHtml}</div>

  <table>
    <thead><tr>${headHtml}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="footer">
    <span>${footerLeft}</span>
    <span>${reportTitle}</span>
  </div>

  <script>
    window.onload = function () { setTimeout(function () { window.print(); }, 300); };
  </script>
</body>
</html>`);
    win.document.close();
}

// ──────────────────────────────────────────────────────────────────────────
// Excel — gerado com ExcelJS (cabeçalho com a paleta, cores e formatação)
// ──────────────────────────────────────────────────────────────────────────
export async function exportReportToExcel(opts: ReportExportOptions): Promise<void> {
    const { reportTitle, reportDescription, dataset, filters, branding } = opts;
    const brandLine = branding?.name
        ? `${branding.name}${branding.city ? '  •  ' + branding.city + (branding.state ? '/' + branding.state : '') : ''}`
        : 'SGF 2026  •  Gestão Pública de Frota';
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SGF 2026';
    wb.created = new Date();

    const ws = wb.addWorksheet('Relatório', {
        properties: { defaultRowHeight: 18 },
        views: [{ showGridLines: false }],
    });

    const colCount = Math.max(dataset.columns.length, 4);
    const lastCol = String.fromCharCode(64 + colCount); // ex.: 'E'

    // Faixa de marca (linha 1)
    ws.mergeCells(`A1:${lastCol}1`);
    const brandCell = ws.getCell('A1');
    brandCell.value = brandLine;
    brandCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    brandCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    brandCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.primary}` } };
    ws.getRow(1).height = 34;

    // Título do relatório (linha 2)
    ws.mergeCells(`A2:${lastCol}2`);
    const titleCell = ws.getCell('A2');
    titleCell.value = reportTitle;
    titleCell.font = { bold: true, size: 14, color: { argb: `FF${BRAND.primaryDark}` } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(2).height = 24;

    // Descrição (linha 3)
    ws.mergeCells(`A3:${lastCol}3`);
    const descCell = ws.getCell('A3');
    descCell.value = reportDescription;
    descCell.font = { size: 10, color: { argb: `FF${BRAND.muted}` } };
    descCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    // Filtros + data (linha 4)
    ws.mergeCells(`A4:${lastCol}4`);
    const filtCell = ws.getCell('A4');
    filtCell.value = `${filtersSummary(filters)}    |    Gerado em ${generatedAt()}`;
    filtCell.font = { size: 9, italic: true, color: { argb: '64748B' } };
    filtCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    filtCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.light}` } };
    ws.getRow(4).height = 20;

    // KPIs (linha 6)
    let kpiRowIdx = 6;
    if (dataset.kpis.length) {
        dataset.kpis.forEach((kpi, i) => {
            const col = i + 1;
            const labelCell = ws.getCell(kpiRowIdx, col);
            labelCell.value = kpi.label.toUpperCase();
            labelCell.font = { size: 8, bold: true, color: { argb: '94A3B8' } };
            const valueCell = ws.getCell(kpiRowIdx + 1, col);
            valueCell.value = kpi.value;
            valueCell.font = { size: 13, bold: true, color: { argb: `FF${BRAND.primaryDark}` } };
        });
        ws.getRow(kpiRowIdx + 1).height = 22;
        kpiRowIdx += 3;
    }

    // Cabeçalho da tabela
    const headerRowIdx = kpiRowIdx + 1;
    const headerRow = ws.getRow(headerRowIdx);
    dataset.columns.forEach((c, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = c.label;
        cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.primary}` } };
        cell.alignment = { vertical: 'middle', horizontal: c.align ?? 'left' };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
    });
    headerRow.height = 22;

    // Linhas de dados
    dataset.rows.forEach((row, r) => {
        const dataRow = ws.getRow(headerRowIdx + 1 + r);
        dataset.columns.forEach((c, i) => {
            const cell = dataRow.getCell(i + 1);
            cell.value = row[c.key] ?? '—';
            cell.font = { size: 10, color: { argb: `FF${BRAND.text}` } };
            cell.alignment = { vertical: 'middle', horizontal: c.align ?? 'left' };
            if (r % 2 === 1) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            }
            cell.border = { bottom: { style: 'hair', color: { argb: 'FFEEF2F6' } } };
        });
    });

    // Larguras de coluna
    dataset.columns.forEach((c, i) => {
        const maxLen = Math.max(
            c.label.length,
            ...dataset.rows.map((row) => String(row[c.key] ?? '').length)
        );
        ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 4, 12), 40);
    });

    // Download
    const buffer = await wb.xlsx.writeBuffer();
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
