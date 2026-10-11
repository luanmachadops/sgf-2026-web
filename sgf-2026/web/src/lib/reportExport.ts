import ExcelJS from 'exceljs';
import {
    formatReportValue,
    type ReportChart,
    type ReportColumn,
    type ReportDataset,
    type ReportRow,
} from './reportData';
import {
    REPORT_FORMAT_VERSION,
    buildCanonicalText,
    buildReportCsv,
    formatVerificationCode,
    sha256Hex,
    verificationUrl,
} from './reportIntegrity';
import { reportSnapshotsApi } from './report-snapshots-api';
import type { Json } from '@/types/database.types';

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
    driverLabel?: string;
    vehicleLabel?: string;
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

/** Dados de autenticidade impressos no arquivo. */
export interface ReportIntegrityInfo {
    /** Código no formato XXXX-XXXX-XXXX. */
    code: string;
    hash: string;
    generatedAt: string;
    url: string;
    formatVersion: string;
    qrDataUrl?: string;
}

export interface ReportSnapshotRequest {
    /** Identificador do relatório (ex.: 'trip-analysis'); vira report_type. */
    reportId: string;
    /** Filtros extras de tela a guardar junto ao registro (secretaria, condutor, etc.). */
    extraFilters?: Record<string, Json>;
}

export interface ReportExportOptions {
    reportTitle: string;
    reportDescription: string;
    dataset: ReportDataset;
    filters: ReportFilters;
    branding?: ReportBranding;
    layout?: ReportLayoutOptions;
    /** Quando informado, o relatório é registrado (hash + código) ao exportar. */
    snapshot?: ReportSnapshotRequest;
    /** Preenchido internamente após o registro; usado pela renderização. */
    integrity?: ReportIntegrityInfo;
}

export type ReportExportKind = 'pdf' | 'xlsx' | 'csv';

export interface ReportExportResult {
    /** true se o arquivo saiu com código de verificação. */
    registered: boolean;
    /** Motivo da falha no registro (o arquivo é exportado mesmo assim). */
    registrationError?: string;
    code?: string;
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
    if (filters.vehicleLabel) parts.push(`Veículo: ${filters.vehicleLabel}`);
    if (filters.driverLabel) parts.push(`Condutor: ${filters.driverLabel}`);
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
    if (chart.type === 'gauge') {
        return `
          <section class="chart-block">
            <div class="chart-heading">
              <h2>${escapeHtml(chart.title)}</h2>
              ${chart.description ? `<p>${escapeHtml(chart.description)}</p>` : ''}
            </div>
            <div class="chart-gauges">
              ${data.slice(0, 4).map((item) => {
                  const bounded = Math.min(Math.max(item.value, 0), 100);
                  return `
                    <div class="print-gauge">
                      <strong>${escapeHtml(item.label)}</strong>
                      <svg viewBox="0 0 100 58" aria-hidden="true">
                        <path d="M 12 48 A 38 38 0 0 1 88 48" pathLength="100" fill="none" stroke="#22c55e" stroke-width="10" stroke-dasharray="58 42"/>
                        <path d="M 12 48 A 38 38 0 0 1 88 48" pathLength="100" fill="none" stroke="#facc15" stroke-width="10" stroke-dasharray="18 82" stroke-dashoffset="-60"/>
                        <path d="M 12 48 A 38 38 0 0 1 88 48" pathLength="100" fill="none" stroke="#f59e0b" stroke-width="10" stroke-dasharray="13 87" stroke-dashoffset="-80"/>
                        <path d="M 12 48 A 38 38 0 0 1 88 48" pathLength="100" fill="none" stroke="#dc2626" stroke-width="10" stroke-dasharray="5 95" stroke-dashoffset="-95"/>
                        <line x1="50" y1="48" x2="16" y2="48" stroke="#0f2b2f" stroke-width="2.5" stroke-linecap="round" transform="rotate(${(bounded * 1.8).toFixed(1)} 50 48)"/>
                        <circle cx="50" cy="48" r="4" fill="#0f2b2f"/>
                      </svg>
                      <span>${escapeHtml(formatReportValue(item.value, 'percent'))} consumido</span>
                    </div>`;
              }).join('')}
            </div>
          </section>`;
    }
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

// ── Registro de autenticidade ──────────────────────────────────────────────

function compactFilters(
    entries: Record<string, Json | undefined>,
): Record<string, Json> {
    const result: Record<string, Json> = {};
    for (const [key, value] of Object.entries(entries)) {
        if (value !== undefined && value !== '') result[key] = value;
    }
    return result;
}

async function buildQrDataUrl(url: string): Promise<string | undefined> {
    try {
        const { default: QRCodeStyling } = await import('qr-code-styling');
        const qr = new QRCodeStyling({
            width: 160,
            height: 160,
            type: 'svg',
            data: url,
            margin: 0,
            qrOptions: { errorCorrectionLevel: 'M' },
            backgroundOptions: { color: '#FFFFFF' },
            dotsOptions: { type: 'square', color: '#000000' },
            cornersSquareOptions: { type: 'square', color: '#000000' },
            cornersDotOptions: { type: 'square', color: '#000000' },
        });
        const raw = await qr.getRawData('svg');
        if (!raw || !(raw instanceof Blob)) return undefined;
        return await new Promise<string | undefined>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined);
            reader.onerror = () => resolve(undefined);
            reader.readAsDataURL(raw);
        });
    } catch {
        return undefined;
    }
}

/**
 * Calcula o hash canônico do que será exportado e registra o relatório no
 * banco. Nunca lança: se o registro falhar, o arquivo sai sem código.
 */
async function issueIntegrity(
    options: ReportExportOptions,
    kind: ReportExportKind,
): Promise<{ integrity: ReportIntegrityInfo | null; error?: string }> {
    if (!options.snapshot) return { integrity: null };
    try {
        const { dataset, filters, reportTitle, snapshot } = options;
        const hash = await sha256Hex(buildCanonicalText(dataset));
        const registered = await reportSnapshotsApi.register({
            reportType: snapshot.reportId.slice(0, 80),
            title: reportTitle,
            periodStart: filters.dateFrom ?? null,
            periodEnd: filters.dateTo ?? null,
            filters: compactFilters({
                ...(snapshot.extraFilters ?? {}),
                period: filters.periodLabel,
                department: filters.departmentLabel,
                driver: filters.driverLabel,
                vehicle: filters.vehicleLabel,
                context: filters.contextLabel,
                search: filters.searchLabel,
                columns: dataset.columns.map((column) => column.key),
                export_format: kind,
                format_version: REPORT_FORMAT_VERSION,
            }),
            contentHash: hash,
            rowCount: dataset.rows.length,
        });
        const url = verificationUrl(registered.code);
        const integrity: ReportIntegrityInfo = {
            code: formatVerificationCode(registered.code),
            hash,
            generatedAt: new Date(registered.generatedAt).toLocaleString('pt-BR'),
            url,
            formatVersion: REPORT_FORMAT_VERSION,
        };
        if (kind === 'pdf') integrity.qrDataUrl = await buildQrDataUrl(url);
        return { integrity };
    } catch (error) {
        return {
            integrity: null,
            error: error instanceof Error ? error.message : 'Falha ao registrar o relatório.',
        };
    }
}

function exportResult(integrity: ReportIntegrityInfo | null, error?: string): ReportExportResult {
    return {
        registered: integrity !== null,
        registrationError: error,
        code: integrity?.code,
    };
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function exportFileName(title: string, extension: string, integrity: ReportIntegrityInfo | null): string {
    const base = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    return `${base}${integrity ? `-${integrity.code}` : ''}.${extension}`;
}

// ── PDF / impressão ────────────────────────────────────────────────────────

const LOG_TRIPS_PER_PAGE = 10;
const LOG_FUEL_PER_PAGE = 12;

function cellText(row: ReportRow, column: ReportColumn | undefined): string {
    if (!column) return '—';
    return formatReportValue(row[column.key], column.format);
}

function vehicleLogPages(
    dataset: ReportDataset,
    branding: ReportBranding | undefined,
): string[] {
    const columnByKey = new Map(dataset.columns.map((column) => [column.key, column]));
    const col = (key: string) => columnByKey.get(key);
    const fuelTable = dataset.extraTables?.[0];
    const orgName = (branding?.name || 'Prefeitura Municipal').toUpperCase();

    // Agrupa por veículo (placa) e mês, preservando a ordem do dataset.
    const groups = new Map<string, ReportRow[]>();
    for (const row of dataset.rows) {
        const key = `${String(row.plate ?? '')}|${String(row.month ?? '')}`;
        const list = groups.get(key) ?? [];
        list.push(row);
        groups.set(key, list);
    }
    if (groups.size === 0) {
        return [`<div class="log-empty">Nenhuma viagem encontrada para os filtros selecionados.</div>`];
    }

    const num = (value: unknown) => (typeof value === 'number' ? value : 0);
    const pages: string[] = [];
    for (const [key, trips] of groups) {
        const first = trips[0];
        const fuelRows = (fuelTable?.rows ?? []).filter(
            (row) => `${String(row.plate ?? '')}|${String(row.month ?? '')}` === key,
        );
        const validTrips = trips.filter((trip) => !String(trip.situation ?? '').startsWith('Cancelada'));
        const totalKm = trips.reduce((sum, trip) => sum + num(trip.distance), 0);
        const liters = fuelRows.reduce((sum, row) => sum + num(row.liters), 0);
        const cost = fuelRows.reduce((sum, row) => sum + num(row.cost), 0);

        const titleBlock = (continued: boolean) => `
          <div class="log-title">
            <h1>Mapa mensal de uso do veículo${continued ? ' <small>(continuação)</small>' : ''}</h1>
            <span>Mês/ano: <strong>${escapeHtml(String(first.month ?? ''))}</strong></span>
          </div>
          <div class="log-info">
            <div><label>Órgão</label>${escapeHtml(orgName)}</div>
            <div><label>Secretaria</label>${escapeHtml(String(first.department || '—'))}</div>
            <div><label>Placa</label>${escapeHtml(String(first.plate || '—'))}</div>
            <div><label>Prefixo</label>${escapeHtml(String(first.prefix || '—'))}</div>
            <div><label>Modelo</label>${escapeHtml(String(first.model || '—'))}</div>
          </div>`;

        const tripsTable = (chunk: ReportRow[]) => `
          <table class="log-table">
            <colgroup>
              <col style="width:3%"/><col style="width:7.5%"/><col style="width:7.5%"/>
              <col style="width:4.5%"/><col style="width:4.5%"/><col style="width:4.5%"/>
              <col style="width:8%"/><col style="width:8%"/><col style="width:9%"/>
              <col style="width:10%"/><col style="width:9.5%"/><col style="width:8%"/><col style="width:7.5%"/>
            </colgroup>
            <thead><tr>
              <th>Nº</th><th>Saída</th><th>Chegada</th><th>Km inicial</th><th>Km final</th><th>Km rodado</th>
              <th>Origem</th><th>Paradas</th><th>Destino</th><th>Finalidade</th><th>Condutor</th>
              <th>Passageiros</th><th>Situação</th>
            </tr></thead>
            <tbody>${chunk.map((trip) => `
              <tr class="${String(trip.situation ?? '').startsWith('Cancelada') ? 'cancelled' : ''}">
                <td class="r">${escapeHtml(cellText(trip, col('number')))}</td>
                <td>${escapeHtml(cellText(trip, col('departure')))}</td>
                <td>${escapeHtml(cellText(trip, col('arrival')))}</td>
                <td class="r">${escapeHtml(cellText(trip, col('startKm')))}</td>
                <td class="r">${escapeHtml(cellText(trip, col('endKm')))}</td>
                <td class="r">${escapeHtml(cellText(trip, col('distance')))}</td>
                <td>${escapeHtml(cellText(trip, col('origin')))}</td>
                <td>${escapeHtml(cellText(trip, col('stops')))}</td>
                <td>${escapeHtml(cellText(trip, col('destination')))}</td>
                <td>${escapeHtml(cellText(trip, col('purpose')))}</td>
                <td>${escapeHtml(String(trip.driver || '—'))}<br/><span class="sub">Mat. ${escapeHtml(String(trip.registration || '—'))} · CNH ${escapeHtml(String(trip.cnh || '—'))}</span></td>
                <td>${escapeHtml(cellText(trip, col('passengers')))}</td>
                <td>${escapeHtml(cellText(trip, col('situation')))}</td>
              </tr>`).join('')}
            </tbody>
          </table>`;

        const fuelBlock = (chunk: ReportRow[], showEmpty: boolean) => `
          <div class="log-section-title">Abastecimentos do período</div>
          ${chunk.length === 0 && showEmpty
              ? '<p class="log-muted">Nenhum abastecimento registrado no período.</p>'
              : `<table class="log-table log-fuel">
              <thead><tr><th>Data</th><th>Litros</th><th>Valor</th><th>Nota fiscal</th><th>Km/L</th></tr></thead>
              <tbody>${chunk.map((row) => `
                <tr>
                  <td>${escapeHtml(cellText(row, fuelTable?.columns.find((c) => c.key === 'date')))}</td>
                  <td class="r">${escapeHtml(cellText(row, fuelTable?.columns.find((c) => c.key === 'liters')))}</td>
                  <td class="r">${escapeHtml(cellText(row, fuelTable?.columns.find((c) => c.key === 'cost')))}</td>
                  <td>${escapeHtml(cellText(row, fuelTable?.columns.find((c) => c.key === 'invoice')))}</td>
                  <td class="r">${escapeHtml(cellText(row, fuelTable?.columns.find((c) => c.key === 'kmPerLiter')))}</td>
                </tr>`).join('')}
              </tbody></table>`}`;

        const trailer = `
          <div class="log-totals">
            <span>Viagens (sem canceladas): <strong>${formatReportValue(validTrips.length, 'integer')}</strong></span>
            <span>Km rodados: <strong>${formatReportValue(totalKm, 'decimal')}</strong></span>
            <span>Combustível: <strong>${formatReportValue(liters, 'decimal')} L</strong></span>
            <span>Valor: <strong>${formatReportValue(cost, 'currency')}</strong></span>
          </div>
          <div class="log-signatures">
            <div><i></i>Condutor responsável<br/><span class="sub">Nome, matrícula e data</span></div>
            <div><i></i>Gestor da frota / secretaria<br/><span class="sub">Nome, cargo e data</span></div>
          </div>`;

        const tripChunks: ReportRow[][] = [];
        for (let i = 0; i < trips.length; i += LOG_TRIPS_PER_PAGE) {
            tripChunks.push(trips.slice(i, i + LOG_TRIPS_PER_PAGE));
        }
        const fuelChunks: ReportRow[][] = [];
        for (let i = 0; i < fuelRows.length; i += LOG_FUEL_PER_PAGE) {
            fuelChunks.push(fuelRows.slice(i, i + LOG_FUEL_PER_PAGE));
        }
        if (fuelChunks.length === 0) fuelChunks.push([]);

        const lastTripChunk = tripChunks[tripChunks.length - 1];
        const fitsOnLastTripPage = lastTripChunk.length <= 4 && fuelChunks.length === 1 && fuelChunks[0].length <= 3;
        tripChunks.forEach((chunk, index) => {
            const isLast = index === tripChunks.length - 1;
            pages.push(`${titleBlock(index > 0)}${tripsTable(chunk)}${
                isLast && fitsOnLastTripPage ? `${fuelBlock(fuelChunks[0], true)}${trailer}` : ''}`);
        });
        if (!fitsOnLastTripPage) {
            fuelChunks.forEach((chunk, index) => {
                pages.push(`${titleBlock(true)}${fuelBlock(chunk, index === 0)}${
                    index === fuelChunks.length - 1 ? trailer : ''}`);
            });
        }
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
        integrity,
    } = options;
    const isVehicleLog = dataset.layout === 'vehicle-log';
    const layout: ReportLayoutOptions = isVehicleLog
        ? { ...(options.layout ?? DEFAULT_LAYOUT), orientation: 'landscape' }
        : options.layout ?? DEFAULT_LAYOUT;
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
    const rowCapacity = (layout.orientation === 'landscape' ? 30 : 24) - (integrity ? 1 : 0);
    const fontAdjustment = Math.round((10 - layout.fontSize) * 1.5);
    const firstPageAdjustment = (dataset.kpis.length > 0 ? 4 : 0)
        + ((dataset.charts?.length ?? 0) > 0 ? 9 : 0)
        + ((dataset.notes?.length ?? 0) > 0 ? 3 : 0);
    const firstPageSize = Math.max(8, rowCapacity + fontAdjustment - firstPageAdjustment);
    const nextPageSize = Math.max(12, rowCapacity + fontAdjustment);
    const widths = columnWidths(dataset.columns, layout.columnScale);
    const generated = integrity?.generatedAt ?? generatedAt();

    interface PageContent { body: string }
    let pageContents: PageContent[];
    if (isVehicleLog) {
        pageContents = vehicleLogPages(dataset, branding).map((body) => ({ body }));
    } else {
        const rowPages = splitRows(dataset.rows, firstPageSize, nextPageSize);
        pageContents = rowPages.map((rows, pageIndex) => {
            const pageDataset = { ...dataset, rows };
            const isFirst = pageIndex === 0;
            return {
                body: `
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
              </section>` : ''}`,
            };
        });
    }

    const total = pageContents.length;
    const sheets = pageContents.map(({ body }, pageIndex) => `
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
                ${integrity ? `<span class="code">Cód. de verificação: ${escapeHtml(integrity.code)}</span>` : ''}
              </div>
              ${integrity?.qrDataUrl ? `<div class="qr-box"><img src="${escapeHtml(integrity.qrDataUrl)}" alt="QR Code de verificação" /></div>` : ''}
            </header>
            ${body}
            ${integrity ? `
            <div class="auth-line">
              <span><strong>Autenticidade</strong> · Código ${escapeHtml(integrity.code)} · SHA-256 (${escapeHtml(integrity.formatVersion)}) <span class="hash">${escapeHtml(integrity.hash)}</span></span>
              <span>Confira a autenticidade em ${escapeHtml(integrity.url)}</span>
            </div>` : ''}
            <footer class="report-footer">
              <span>${escapeHtml(footerText)}</span>
              <span>Emissão: ${escapeHtml(generated)} · Página ${pageIndex + 1} de ${total}</span>
            </footer>
          </section>`).join('');

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
  .sheet { position:relative; width:${pageWidth}; min-height:${pageHeight}; margin:10mm auto; padding:11mm 11mm ${integrity ? 24 : 18}mm; overflow:hidden; background:#fff; break-after:page; page-break-after:always; }
  .sheet:last-child { break-after:auto; page-break-after:auto; }
  .institution-header { display:grid; grid-template-columns:58px 1fr auto${integrity?.qrDataUrl ? ' 58px' : ''}; gap:12px; align-items:center; padding-bottom:10px; border-bottom:3px solid #${primary}; }
  .institution-logo { width:52px; height:52px; display:flex; align-items:center; justify-content:center; }
  .institution-logo img { width:52px; height:52px; object-fit:contain; }
  .qr-box img { display:block; width:56px; height:56px; }
  .institution-copy { font-size:8.2px; line-height:1.45; color:#475569; text-transform:uppercase; letter-spacing:.035em; }
  .institution-name { margin-bottom:2px; color:#${dark}; font-size:13px; font-weight:850; letter-spacing:.02em; }
  .document-meta { display:flex; flex-direction:column; align-items:flex-end; gap:3px; color:#${DEFAULT_BRAND.muted}; font-size:8px; white-space:nowrap; }
  .document-meta strong { color:#${primary}; letter-spacing:.08em; }
  .document-meta .code { color:#${dark}; font-weight:700; }
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
  .chart-gauges { display:grid; grid-template-columns:repeat(4,1fr); gap:7px; margin-top:7px; }
  .print-gauge { min-width:0; padding:5px 6px; border-radius:6px; background:#f8fafc; text-align:center; }
  .print-gauge strong { display:block; overflow:hidden; color:#${dark}; font-size:6.8px; text-overflow:ellipsis; white-space:nowrap; }
  .print-gauge svg { display:block; width:100%; height:48px; margin:1px auto -3px; }
  .print-gauge span { color:#475569; font-size:6.5px; font-weight:750; }
  .table-scroll { width:100%; margin-top:10px; overflow:hidden; }
  table { width:${tableRenderWidth}px; border-collapse:collapse; table-layout:fixed; font-size:${layout.fontSize}px; zoom:${tableZoom}; }
  thead { display:table-header-group; }
  thead th { padding:6px 7px; background:#${dark}; color:#fff; font-size:${Math.max(6.5, layout.fontSize - 1.5)}px; font-weight:750; letter-spacing:.035em; text-transform:uppercase; vertical-align:bottom; }
  tbody td { padding:5px 7px; border-bottom:1px solid #e8edf0; color:#334155; line-height:1.2; overflow-wrap:anywhere; vertical-align:top; }
  tbody tr:nth-child(even) { background:#f8fafb; }
  .notes { margin-top:8px; padding:6px 8px; border:1px solid #dfe7e5; border-radius:6px; color:#64748b; font-size:6.8px; line-height:1.35; }
  .notes strong { color:#${dark}; }
  .notes p { margin:2px 0 0; }
  .log-title { display:flex; align-items:baseline; justify-content:space-between; margin-top:10px; }
  .log-title h1 { margin:0; color:#${dark}; font-size:15px; letter-spacing:-.01em; text-transform:uppercase; }
  .log-title h1 small { font-size:8px; color:#64748b; text-transform:none; }
  .log-title span { font-size:10px; color:#334155; }
  .log-info { display:grid; grid-template-columns:2fr 2fr 1fr 1fr 2fr; gap:6px; margin-top:7px; }
  .log-info div { padding:5px 7px; border:1px solid #dfe7e5; border-radius:5px; font-size:9px; font-weight:700; color:#${dark}; }
  .log-info label { display:block; font-size:6.3px; font-weight:750; color:#64748b; text-transform:uppercase; letter-spacing:.06em; }
  .log-table { width:100%; margin-top:8px; zoom:1; font-size:7px; }
  .log-table thead th { padding:4px 4px; font-size:6.2px; text-align:left; }
  .log-table tbody td { padding:4px 4px; font-size:7px; }
  .log-table td.r { text-align:right; white-space:nowrap; }
  .log-table .sub { color:#64748b; font-size:6px; }
  .log-table tr.cancelled td { color:#94a3b8; text-decoration:line-through; }
  .log-fuel { width:60%; }
  .log-section-title { margin-top:10px; color:#${dark}; font-size:8px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; }
  .log-muted, .log-empty { margin:6px 0 0; color:#64748b; font-size:8px; }
  .log-totals { display:flex; flex-wrap:wrap; gap:14px; margin-top:10px; padding:6px 8px; border:1px solid #dfe7e5; border-radius:6px; background:#f8fafb; font-size:8px; color:#334155; }
  .log-signatures { display:grid; grid-template-columns:1fr 1fr; gap:36px; margin-top:26px; }
  .log-signatures div { padding-top:3px; text-align:center; font-size:8px; font-weight:700; color:#${dark}; }
  .log-signatures i { display:block; margin-bottom:3px; border-top:1px solid #334155; }
  .log-signatures .sub { color:#64748b; font-size:6.5px; font-weight:500; }
  .auth-line { position:absolute; right:11mm; bottom:14mm; left:11mm; display:flex; justify-content:space-between; gap:12px; color:#334155; font-size:6.2px; line-height:1.3; }
  .auth-line .hash { font-family:ui-monospace,Menlo,Consolas,monospace; word-break:break-all; }
  .auth-line > span:last-child { white-space:nowrap; font-weight:700; }
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

/**
 * Abre a janela de impressão. A janela é aberta de imediato (dentro do clique,
 * para não ser bloqueada) e preenchida depois do registro de autenticidade.
 */
export async function exportReportToPDF(options: ReportExportOptions): Promise<ReportExportResult> {
    const printWindow = window.open('', '_blank', 'width=1100,height=900');
    if (!printWindow) {
        throw new Error('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.');
    }
    printWindow.document.write('<!DOCTYPE html><title>Gerando relatório…</title><p style="font-family:sans-serif;padding:24px">Gerando relatório…</p>');
    const { integrity, error } = await issueIntegrity(options, 'pdf');
    if (printWindow.closed) return exportResult(integrity, error);
    printWindow.document.open();
    printWindow.document.write(buildReportPrintHtml({ ...options, integrity: integrity ?? undefined }));
    printWindow.document.close();
    return exportResult(integrity, error);
}

// ── Excel ──────────────────────────────────────────────────────────────────

function excelFormat(column: ReportColumn): string | undefined {
    if (column.format === 'currency') return 'R$ #,##0.00';
    if (column.format === 'integer') return '#,##0';
    if (column.format === 'decimal') return '#,##0.00';
    if (column.format === 'percent') return '0.0"%"';
    return undefined;
}

export async function exportReportToExcel(options: ReportExportOptions): Promise<ReportExportResult> {
    const { integrity, error } = await issueIntegrity(options, 'xlsx');
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
    const emitted = integrity?.generatedAt ?? generatedAt();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = softwareName;
    workbook.created = new Date();
    workbook.subject = reportTitle;
    workbook.description = integrity
        ? `${reportDescription} — Código de verificação ${integrity.code}`
        : reportDescription;
    if (integrity) workbook.keywords = integrity.code;

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
            oddFooter: `&L${footerText}${integrity ? ` · Cód. ${integrity.code}` : ''}&R&D &T  |  Página &P de &N`,
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
    filtersCell.value = `${filtersSummary(filters)}  |  Emissão: ${emitted}${integrity ? `  |  Cód. de verificação: ${integrity.code}` : ''}`;
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
            const raw = row[column.key];
            cell.value = raw === '' || raw === undefined || raw === null ? '—' : raw;
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

    let nextRow = headerRowIndex + dataset.rows.length + 2;
    if (dataset.notes?.length) {
        worksheet.mergeCells(nextRow, 1, nextRow, columnCount);
        const noteCell = worksheet.getCell(nextRow, 1);
        noteCell.value = `Critérios: ${dataset.notes.join(' • ')}`;
        noteCell.font = { size: 8, italic: true, color: { argb: `FF${DEFAULT_BRAND.muted}` } };
        noteCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
        noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        worksheet.getRow(nextRow).height = 34;
        nextRow += 2;
    }

    const authLines = integrity
        ? [
            `Código de verificação: ${integrity.code}`,
            `Hash SHA-256 (${integrity.formatVersion}): ${integrity.hash}`,
            `Gerado em: ${integrity.generatedAt}`,
        ]
        : ['Sem código de verificação (registro indisponível na emissão).'];
    authLines.forEach((line) => {
        worksheet.mergeCells(nextRow, 1, nextRow, columnCount);
        const authCell = worksheet.getCell(nextRow, 1);
        authCell.value = line;
        authCell.font = { size: 8, bold: true, color: { argb: `FF${dark}` } };
        authCell.alignment = { vertical: 'middle', horizontal: 'left' };
        nextRow += 1;
    });
    if (integrity) {
        worksheet.mergeCells(nextRow, 1, nextRow, columnCount);
        const linkCell = worksheet.getCell(nextRow, 1);
        linkCell.value = { text: `Confira a autenticidade em ${integrity.url}`, hyperlink: integrity.url };
        linkCell.font = { size: 8, underline: true, color: { argb: 'FF0563C1' } };
    }

    (dataset.extraTables ?? []).forEach((table, tableIndex) => {
        const sheet = workbook.addWorksheet(
            (table.title || `Tabela ${tableIndex + 2}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31),
        );
        sheet.addRow([table.title]).font = { bold: true, size: 12, color: { argb: `FF${dark}` } };
        sheet.addRow([]);
        const head = sheet.addRow(table.columns.map((column) => column.label));
        head.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${primary}` } };
        });
        table.rows.forEach((row) => {
            const added = sheet.addRow(table.columns.map((column) => {
                const raw = row[column.key];
                return raw === '' || raw === undefined || raw === null ? '—' : raw;
            }));
            table.columns.forEach((column, index) => {
                const format = excelFormat(column);
                if (format) added.getCell(index + 1).numFmt = format;
            });
        });
        table.columns.forEach((column, index) => {
            sheet.getColumn(index + 1).width = Math.max(12, Math.min((column.minWidth ?? 110) / 6, 40));
        });
        if (integrity) {
            sheet.addRow([]);
            sheet.addRow([`Código de verificação: ${integrity.code}`]);
        }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        exportFileName(reportTitle, 'xlsx', integrity),
    );
    return exportResult(integrity, error);
}

// ── CSV ────────────────────────────────────────────────────────────────────

export async function exportReportToCsv(options: ReportExportOptions): Promise<ReportExportResult> {
    const { integrity, error } = await issueIntegrity(options, 'csv');
    const csv = buildReportCsv(options.dataset, {
        reportTitle: options.reportTitle,
        code: integrity?.code,
        hash: integrity?.hash,
        generatedAt: integrity?.generatedAt ?? generatedAt(),
        url: integrity?.url,
    });
    downloadBlob(
        new Blob([csv], { type: 'text/csv;charset=utf-8' }),
        exportFileName(options.reportTitle, 'csv', integrity),
    );
    return exportResult(integrity, error);
}
