import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { ContractUsageGauge } from '@/components/procurement/ContractUsageGauge';
import {
    ArrowLeft,
    Calendar,
    Check,
    FileSpreadsheet as ExcelIcon,
    Filter,
    Printer,
    Search,
    Settings,
    ShieldCheck,
    X,
} from '@/components/sgf/icons';
import {
    fetchDepartmentOptions,
    fetchReportDataset,
    formatReportValue,
    type ReportColumn,
    type ReportDataset,
} from '@/lib/reportData';
import {
    exportReportToExcel,
    exportReportToPDF,
    type ReportBranding,
    type ReportFilters,
    type ReportLayoutOptions,
} from '@/lib/reportExport';
import { useBranding } from '@/contexts/BrandingContext';
import { toast } from 'sonner';

const EMPTY_DATASET: ReportDataset = { columns: [], rows: [], kpis: [], charts: [] };
const CHART_COLORS = ['#00A86B', '#0F2B2F', '#70C4A8', '#3B82F6', '#F59E0B', '#8B5CF6', '#DC2626', '#64748B'];
const PREVIEW_PAGE_SIZE = 50;

const periodOptions = [
    { value: 'week', label: 'Última semana' },
    { value: 'month', label: 'Último mês' },
    { value: 'quarter', label: 'Último trimestre' },
    { value: 'year', label: 'Último ano' },
    { value: 'all', label: 'Todo o período' },
    { value: 'custom', label: 'Personalizado' },
];

const contextKeyByReport: Record<string, string> = {
    'fleet-summary': 'status',
    'fuel-consumption': 'station',
    'maintenance-history': 'operationalStatus',
    'trip-analysis': 'status',
    'driver-performance': 'department',
    'cost-analysis': 'department',
    'department-usage': 'department',
    'efficiency-report': 'department',
    infractions: 'status',
    'fuel-by-station': 'station',
    'station-fiscal-closing': 'station',
    'maintenance-by-shop': 'shop',
};

export interface ReportViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    reportId: string;
    title: string;
    description: string;
}

function reportIdentityLines(branding: ReportBranding): string[] {
    const isTapejara = branding.city?.localeCompare('Tapejara', 'pt-BR', { sensitivity: 'base' }) === 0
        && (!branding.state || branding.state.toUpperCase() === 'PR');
    const lines: string[] = [];
    if (branding.cnpj) lines.push(`CNPJ: ${branding.cnpj}`);
    const address = [
        branding.address,
        branding.supportPhone ? `Fone: ${branding.supportPhone}` : '',
    ].filter(Boolean).join(' — ');
    if (address) lines.push(address);
    const location = [
        branding.postalCode || (isTapejara ? 'CEP 87430-000' : ''),
        branding.city?.toUpperCase(),
        branding.state?.toUpperCase() === 'PR' ? 'PARANÁ' : branding.state?.toUpperCase(),
    ].filter(Boolean).join(' — ');
    if (location) lines.push(location);
    return lines;
}

function normalizeSearch(value: unknown): string {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLocaleLowerCase('pt-BR');
}

function chartTick(value: number, format?: string): string {
    if (format === 'currency') {
        return new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL' }).format(value);
    }
    if (format === 'percent') return `${Math.round(value)}%`;
    return new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(value);
}

export function ReportViewerModal({
    isOpen,
    onClose,
    reportId,
    title,
    description,
}: ReportViewerModalProps) {
    const { branding: tenantBranding } = useBranding();
    const reportBranding: ReportBranding = useMemo(() => ({
        name: tenantBranding.name,
        appName: tenantBranding.appName,
        logoUrl: tenantBranding.logoUrl,
        sealUrl: tenantBranding.sealUrl,
        city: tenantBranding.city,
        state: tenantBranding.state,
        cnpj: tenantBranding.cnpj,
        address: tenantBranding.address,
        supportPhone: tenantBranding.supportPhone,
        mayorName: tenantBranding.mayorName,
        reportFooter: tenantBranding.reportFooter,
        primaryColor: tenantBranding.primaryColor,
        darkColor: tenantBranding.darkColor,
        accentColor: tenantBranding.accentColor,
    }), [tenantBranding]);
    const identityLines = useMemo(() => reportIdentityLines(reportBranding), [reportBranding]);
    const [period, setPeriod] = useState('month');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [department, setDepartment] = useState('');
    const [rowSearch, setRowSearch] = useState('');
    const [contextValue, setContextValue] = useState('');
    const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>([]);
    const [showCustomization, setShowCustomization] = useState(false);
    const [orientation, setOrientation] = useState<ReportLayoutOptions['orientation']>('portrait');
    const [fontSize, setFontSize] = useState(9);
    const [columnScale, setColumnScale] = useState(100);
    const [previewPage, setPreviewPage] = useState(1);
    const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);

    const { data: departmentOptions = [{ value: '', label: 'Todas as secretarias' }] } = useQuery({
        queryKey: ['report-departments'],
        queryFn: fetchDepartmentOptions,
        staleTime: 5 * 60 * 1000,
    });

    const range = useMemo(() => {
        if (period === 'all') return { from: undefined, to: undefined };
        if (period === 'custom') {
            return { from: dateFrom || undefined, to: dateTo || undefined };
        }
        const to = new Date();
        const from = new Date();
        if (period === 'week') from.setDate(from.getDate() - 7);
        else if (period === 'month') from.setMonth(from.getMonth() - 1);
        else if (period === 'quarter') from.setMonth(from.getMonth() - 3);
        else if (period === 'year') from.setFullYear(from.getFullYear() - 1);
        const iso = (date: Date) => date.toISOString().slice(0, 10);
        return { from: iso(from), to: iso(to) };
    }, [period, dateFrom, dateTo]);

    const rangeIsValid = !range.from || !range.to || range.from <= range.to;
    const {
        data: dataset = EMPTY_DATASET,
        isLoading,
        isError,
        error,
    } = useQuery({
        queryKey: ['report-dataset', reportId, department, range.from, range.to],
        queryFn: () =>
            fetchReportDataset(reportId, {
                departmentId: department || undefined,
                dateFrom: range.from,
                dateTo: range.to,
            }),
        enabled: isOpen && rangeIsValid,
    });

    const columnSignature = dataset.columns
        .map((column) => `${column.key}:${column.defaultVisible !== false}`)
        .join('|');
    useEffect(() => {
        setVisibleColumnKeys(
            dataset.columns
                .filter((column) => column.defaultVisible !== false)
                .map((column) => column.key),
        );
        setContextValue('');
        setRowSearch('');
        setPreviewPage(1);
    }, [reportId, columnSignature, dataset.columns]);

    const contextColumn = useMemo(() => {
        const preferredKey = contextKeyByReport[reportId];
        return dataset.columns.find((column) => column.key === preferredKey)
            ?? dataset.columns.find((column) => column.filterable);
    }, [dataset.columns, reportId]);

    const contextOptions = useMemo(() => {
        if (!contextColumn) return [];
        const values = [...new Set(
            dataset.rows
                .map((row) => String(row[contextColumn.key] ?? ''))
                .filter(Boolean),
        )].sort((left, right) => left.localeCompare(right, 'pt-BR'));
        return [
            { value: '', label: `Todos: ${contextColumn.label}` },
            ...values.map((value) => ({ value, label: value })),
        ];
    }, [contextColumn, dataset.rows]);

    const filteredRows = useMemo(() => {
        const normalizedQuery = normalizeSearch(rowSearch.trim());
        return dataset.rows.filter((row) => {
            if (contextColumn && contextValue && String(row[contextColumn.key] ?? '') !== contextValue) {
                return false;
            }
            if (!normalizedQuery) return true;
            return dataset.columns.some((column) =>
                normalizeSearch(row[column.key]).includes(normalizedQuery)
            );
        });
    }, [contextColumn, contextValue, dataset.columns, dataset.rows, rowSearch]);

    const visibleColumns = useMemo(
        () => dataset.columns.filter((column) => visibleColumnKeys.includes(column.key)),
        [dataset.columns, visibleColumnKeys],
    );
    const visibleTableWidth = useMemo(
        () => visibleColumns.reduce(
            (total, column) => total + (column.minWidth ?? 110) * (columnScale / 100),
            0,
        ),
        [columnScale, visibleColumns],
    );
    const previewPageCount = Math.max(1, Math.ceil(filteredRows.length / PREVIEW_PAGE_SIZE));
    const previewRows = useMemo(
        () => filteredRows.slice(
            (previewPage - 1) * PREVIEW_PAGE_SIZE,
            previewPage * PREVIEW_PAGE_SIZE,
        ),
        [filteredRows, previewPage],
    );
    useEffect(() => {
        setPreviewPage((current) => Math.min(current, previewPageCount));
    }, [previewPageCount]);

    const hasClientFilters = Boolean(contextValue || rowSearch.trim());
    const exportDataset: ReportDataset = useMemo(() => ({
        ...dataset,
        columns: visibleColumns,
        rows: filteredRows,
        charts: hasClientFilters ? [] : dataset.charts,
    }), [dataset, filteredRows, hasClientFilters, visibleColumns]);

    const filters: ReportFilters = useMemo(() => ({
        periodLabel: periodOptions.find((option) => option.value === period)?.label ?? '—',
        dateFrom: range.from,
        dateTo: range.to,
        departmentLabel: departmentOptions.find((option) => option.value === department)?.label
            ?? 'Todas as secretarias',
        contextLabel: contextColumn && contextValue
            ? `${contextColumn.label}: ${contextValue}`
            : undefined,
        searchLabel: rowSearch.trim() || undefined,
    }), [
        contextColumn,
        contextValue,
        department,
        departmentOptions,
        period,
        range.from,
        range.to,
        rowSearch,
    ]);

    const layout: ReportLayoutOptions = useMemo(() => ({
        orientation,
        fontSize,
        columnScale,
    }), [columnScale, fontSize, orientation]);

    const validateExport = (): boolean => {
        if (!rangeIsValid) {
            toast.warning('A data inicial deve ser anterior à data final.');
            return false;
        }
        if (visibleColumns.length === 0) {
            toast.warning('Selecione ao menos uma coluna.');
            return false;
        }
        if (isLoading || filteredRows.length === 0) {
            toast.warning('Sem dados para exportar.');
            return false;
        }
        return true;
    };

    const handlePDF = () => {
        if (!validateExport()) return;
        setExporting('pdf');
        exportReportToPDF({
            reportTitle: title,
            reportDescription: description,
            dataset: exportDataset,
            filters,
            branding: reportBranding,
            layout,
        });
        window.setTimeout(() => setExporting(null), 500);
    };

    const handleExcel = async () => {
        if (!validateExport()) return;
        try {
            setExporting('excel');
            await exportReportToExcel({
                reportTitle: title,
                reportDescription: description,
                dataset: exportDataset,
                filters,
                branding: reportBranding,
                layout,
            });
            toast.success('Planilha Excel gerada com sucesso.');
        } catch (exportError) {
            console.error(exportError);
            toast.error('Erro ao gerar a planilha Excel.');
        } finally {
            setExporting(null);
        }
    };

    const toggleColumn = (column: ReportColumn) => {
        setVisibleColumnKeys((current) => {
            if (current.includes(column.key)) {
                return current.length > 1 ? current.filter((key) => key !== column.key) : current;
            }
            return [...current, column.key];
        });
    };

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (keyboardEvent: KeyboardEvent) => {
            if (keyboardEvent.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[2000] flex flex-col bg-slate-100">
            <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
                <button
                    type="button"
                    onClick={onClose}
                    className="-ml-1 shrink-0 rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    aria-label="Voltar"
                    title="Voltar (Esc)"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--sgf-light)] to-[var(--sgf-primary)] shadow-sm">
                    <ShieldCheck className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold text-slate-900">{title}</h2>
                    <p className="hidden truncate text-xs text-slate-500 md:block">{description}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <SGFButton
                        variant="secondary"
                        size="sm"
                        icon={Settings}
                        onClick={() => setShowCustomization((current) => !current)}
                    >
                        <span className="hidden lg:inline">Personalizar</span>
                    </SGFButton>
                    <SGFButton
                        variant="secondary"
                        size="sm"
                        icon={Printer}
                        onClick={handlePDF}
                        loading={exporting === 'pdf'}
                    >
                        <span className="hidden sm:inline">Imprimir / </span>PDF
                    </SGFButton>
                    <SGFButton
                        variant="primary"
                        size="sm"
                        icon={ExcelIcon}
                        onClick={handleExcel}
                        loading={exporting === 'excel'}
                    >
                        Excel
                    </SGFButton>
                    <button
                        type="button"
                        onClick={onClose}
                        className="ml-1 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
                        aria-label="Fechar"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
            </header>

            <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="w-full sm:w-48">
                        <label className="mb-1 block text-xs font-semibold text-slate-500">Período</label>
                        <SGFSelect
                            value={period}
                            onChange={setPeriod}
                            options={periodOptions}
                            triggerClassName="!rounded-full !px-4 !py-2.5 !text-sm !font-medium"
                        />
                    </div>
                    {period === 'custom' && (
                        <>
                            <div className="w-full sm:w-40">
                                <label className="mb-1 block text-xs font-semibold text-slate-500">Data inicial</label>
                                <div className="relative">
                                    <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="date"
                                        value={dateFrom}
                                        onChange={(event) => setDateFrom(event.target.value)}
                                        className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-medium text-slate-700 focus:border-[var(--sgf-primary)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--sgf-primary)]/10"
                                    />
                                </div>
                            </div>
                            <div className="w-full sm:w-40">
                                <label className="mb-1 block text-xs font-semibold text-slate-500">Data final</label>
                                <div className="relative">
                                    <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="date"
                                        value={dateTo}
                                        onChange={(event) => setDateTo(event.target.value)}
                                        className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-medium text-slate-700 focus:border-[var(--sgf-primary)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--sgf-primary)]/10"
                                    />
                                </div>
                            </div>
                        </>
                    )}
                    <div className="w-full sm:w-56">
                        <label className="mb-1 block text-xs font-semibold text-slate-500">Secretaria</label>
                        <SGFSelect
                            value={department}
                            onChange={setDepartment}
                            options={departmentOptions}
                            triggerClassName="!rounded-full !px-4 !py-2.5 !text-sm !font-medium"
                        />
                    </div>
                    {contextColumn && contextOptions.length > 1 && (
                        <div className="w-full sm:w-56">
                            <label className="mb-1 block text-xs font-semibold text-slate-500">
                                {contextColumn.label}
                            </label>
                            <SGFSelect
                                value={contextValue}
                                onChange={setContextValue}
                                options={contextOptions}
                                triggerClassName="!rounded-full !px-4 !py-2.5 !text-sm !font-medium"
                            />
                        </div>
                    )}
                    <div className="w-full min-w-52 flex-1 sm:max-w-72">
                        <label className="mb-1 block text-xs font-semibold text-slate-500">Buscar nos dados</label>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="search"
                                value={rowSearch}
                                onChange={(event) => setRowSearch(event.target.value)}
                                placeholder="Placa, motorista, fornecedor..."
                                className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-medium text-slate-700 focus:border-[var(--sgf-primary)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--sgf-primary)]/10"
                            />
                        </div>
                    </div>
                </div>
                {!rangeIsValid && (
                    <p className="mt-2 text-xs font-semibold text-red-600">
                        A data inicial deve ser anterior ou igual à data final.
                    </p>
                )}
            </div>

            {showCustomization && (
                <section className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-6">
                    <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[1fr_auto_auto_auto]">
                        <div>
                            <div className="mb-2 flex items-center gap-2">
                                <Filter className="h-4 w-4 text-[var(--sgf-primary)]" />
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                                    Campos do relatório
                                </p>
                            </div>
                            <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
                                {dataset.columns.map((column) => {
                                    const checked = visibleColumnKeys.includes(column.key);
                                    return (
                                        <button
                                            key={column.key}
                                            type="button"
                                            onClick={() => toggleColumn(column)}
                                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                                checked
                                                    ? 'border-[var(--sgf-primary)] bg-white text-[var(--sgf-dark)]'
                                                    : 'border-slate-200 bg-white text-slate-400'
                                            }`}
                                        >
                                            <span className={`flex h-4 w-4 items-center justify-center rounded-full ${
                                                checked ? 'bg-[var(--sgf-primary)] text-white' : 'bg-slate-100'
                                            }`}>
                                                {checked && <Check className="h-3 w-3" />}
                                            </span>
                                            {column.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Orientação</p>
                            <div className="flex rounded-full border border-slate-200 bg-white p-1">
                                {([
                                    ['portrait', 'Vertical'],
                                    ['landscape', 'Horizontal'],
                                ] as const).map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setOrientation(value)}
                                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                                            orientation === value
                                                ? 'bg-[var(--sgf-dark)] text-white'
                                                : 'text-slate-500'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <label className="min-w-40">
                            <span className="mb-2 flex justify-between text-xs font-bold uppercase tracking-wide text-slate-600">
                                Fonte <strong className="text-[var(--sgf-primary)]">{fontSize}px</strong>
                            </span>
                            <input
                                type="range"
                                min="7"
                                max="13"
                                step="1"
                                value={fontSize}
                                onChange={(event) => setFontSize(Number(event.target.value))}
                                className="accent-[var(--sgf-primary)]"
                            />
                        </label>
                        <label className="min-w-40">
                            <span className="mb-2 flex justify-between text-xs font-bold uppercase tracking-wide text-slate-600">
                                Colunas <strong className="text-[var(--sgf-primary)]">{columnScale}%</strong>
                            </span>
                            <input
                                type="range"
                                min="70"
                                max="140"
                                step="5"
                                value={columnScale}
                                onChange={(event) => setColumnScale(Number(event.target.value))}
                                className="accent-[var(--sgf-primary)]"
                            />
                        </label>
                    </div>
                </section>
            )}

            <div className="flex-1 overflow-y-auto p-4 sm:p-8">
                <div className={`mx-auto overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${
                    orientation === 'landscape' ? 'max-w-7xl' : 'max-w-5xl'
                }`}>
                    <div className="border-b-[3px] border-[var(--sgf-primary)] px-6 pb-6 pt-8 sm:px-10">
                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4">
                            {reportBranding.sealUrl || reportBranding.logoUrl ? (
                                <img
                                    src={reportBranding.sealUrl || reportBranding.logoUrl}
                                    alt={reportBranding.name}
                                    className="h-14 w-14 object-contain"
                                />
                            ) : (
                                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--sgf-light)] to-[var(--sgf-primary)] shadow-sm">
                                    <ShieldCheck className="h-7 w-7 text-white" />
                                </div>
                            )}
                            <div>
                                <p className="text-sm font-extrabold uppercase tracking-wide text-[var(--sgf-dark)] sm:text-base">
                                    {reportBranding.name}
                                </p>
                                {identityLines.map((line) => (
                                    <p key={line} className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                                        {line}
                                    </p>
                                ))}
                            </div>
                            <div className="text-right text-[10px] text-slate-400">
                                <p className="font-bold uppercase tracking-wider text-[var(--sgf-primary)]">Relatório oficial</p>
                                <p className="mt-1">Emissão: {new Date().toLocaleString('pt-BR')}</p>
                            </div>
                        </div>

                        <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-[var(--sgf-dark)]">{title}</h1>
                        <p className="mt-1.5 text-sm text-slate-500">{description}</p>

                        <div className="mt-4 inline-flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-600">
                            <span>Período: {filters.periodLabel}</span>
                            <span className="text-slate-300">•</span>
                            <span>{filters.departmentLabel}</span>
                            {filters.contextLabel && (
                                <>
                                    <span className="text-slate-300">•</span>
                                    <span>{filters.contextLabel}</span>
                                </>
                            )}
                            <span className="text-slate-300">•</span>
                            <span>{filteredRows.length.toLocaleString('pt-BR')} registro(s)</span>
                        </div>
                    </div>

                    {dataset.kpis.length > 0 && (
                        <div className="grid grid-cols-2 gap-4 border-b border-slate-100 px-6 py-6 sm:px-10 lg:grid-cols-4">
                            {dataset.kpis.map((kpi) => (
                                <div key={kpi.label} className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <p className="text-xl font-extrabold text-[var(--sgf-dark)]">{kpi.value}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{kpi.label}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {!hasClientFilters && dataset.charts && dataset.charts.length > 0 && (
                        <div className="grid gap-4 border-b border-slate-100 px-6 py-6 sm:px-10 lg:grid-cols-2">
                            {dataset.charts.slice(0, 2).map((chart) => (
                                <div key={chart.title} className="rounded-2xl border border-slate-200 p-4">
                                    <h3 className="font-bold text-[var(--sgf-dark)]">{chart.title}</h3>
                                    {chart.description && <p className="mt-1 text-xs text-slate-500">{chart.description}</p>}
                                    <div className="mt-4 h-64">
                                        {chart.type === 'gauge' ? (
                                            <div className="grid h-full grid-cols-2 gap-3 overflow-y-auto">
                                                {chart.data.slice(0, 6).map((item) => (
                                                    <div key={item.label} className="rounded-xl bg-slate-50 px-2 pt-2">
                                                        <p className="truncate text-center text-xs font-bold text-slate-700" title={item.label}>
                                                            {item.label}
                                                        </p>
                                                        <ContractUsageGauge value={item.value} className="max-w-[180px]" />
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <ResponsiveContainer width="100%" height="100%">
                                                {chart.type === 'donut' ? (
                                                <PieChart>
                                                    <Pie
                                                        data={chart.data}
                                                        dataKey="value"
                                                        nameKey="label"
                                                        innerRadius={52}
                                                        outerRadius={82}
                                                        paddingAngle={2}
                                                    >
                                                        {chart.data.map((item, index) => (
                                                            <Cell
                                                                key={item.label}
                                                                fill={CHART_COLORS[index % CHART_COLORS.length]}
                                                            />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip />
                                                    <Legend
                                                        verticalAlign="bottom"
                                                        height={32}
                                                        formatter={(value) => <span className="text-xs text-slate-600">{value}</span>}
                                                    />
                                                </PieChart>
                                                ) : (
                                                <BarChart data={chart.data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                                    <XAxis
                                                        dataKey="label"
                                                        tick={{ fontSize: 10, fill: '#64748B' }}
                                                        axisLine={false}
                                                        tickLine={false}
                                                    />
                                                    <YAxis
                                                        tick={{ fontSize: 10, fill: '#64748B' }}
                                                        axisLine={false}
                                                        tickLine={false}
                                                        tickFormatter={(value) => chartTick(Number(value), chart.valueFormat)}
                                                    />
                                                    <Tooltip />
                                                    <Bar dataKey="value" fill="var(--sgf-primary)" radius={[6, 6, 0, 0]} />
                                                </BarChart>
                                                )}
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="px-2 py-4 sm:px-6">
                        {isLoading ? (
                            <div className="py-16 text-center text-sm text-slate-400">Carregando todos os registros…</div>
                        ) : isError ? (
                            <div className="py-16 text-center text-sm text-red-500">
                                Erro ao carregar os dados: {error instanceof Error ? error.message : 'tente novamente.'}
                            </div>
                        ) : visibleColumns.length === 0 ? (
                            <div className="py-16 text-center text-sm text-amber-600">Selecione ao menos uma coluna.</div>
                        ) : previewRows.length === 0 ? (
                            <div className="py-16 text-center text-sm text-slate-400">Sem dados para os filtros selecionados.</div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-slate-200">
                                <table
                                    className="border-collapse text-left"
                                    style={{
                                        fontSize: `${fontSize}px`,
                                        width: `max(100%, ${Math.round(visibleTableWidth)}px)`,
                                    }}
                                >
                                    <colgroup>
                                        {visibleColumns.map((column) => (
                                            <col
                                                key={column.key}
                                                style={{ width: `${(column.minWidth ?? 110) * (columnScale / 100)}px` }}
                                            />
                                        ))}
                                    </colgroup>
                                    <thead>
                                        <tr className="bg-[var(--sgf-dark)] text-white">
                                            {visibleColumns.map((column) => (
                                                <th
                                                    key={column.key}
                                                    className="whitespace-nowrap px-3 py-3 text-[10px] font-bold uppercase tracking-wide"
                                                    style={{ textAlign: column.align ?? 'left' }}
                                                >
                                                    {column.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {previewRows.map((row, rowIndex) => (
                                            <tr key={`${previewPage}-${rowIndex}`} className="even:bg-slate-50/70">
                                                {visibleColumns.map((column) => (
                                                    <td
                                                        key={column.key}
                                                        className="px-3 py-2.5 align-top text-slate-700"
                                                        style={{ textAlign: column.align ?? 'left' }}
                                                    >
                                                        {formatReportValue(row[column.key], column.format)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {previewPageCount > 1 && (
                            <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                                <span>
                                    Exibindo {((previewPage - 1) * PREVIEW_PAGE_SIZE) + 1}–
                                    {Math.min(previewPage * PREVIEW_PAGE_SIZE, filteredRows.length)} de {filteredRows.length.toLocaleString('pt-BR')}
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={previewPage === 1}
                                        onClick={() => setPreviewPage((page) => Math.max(1, page - 1))}
                                        className="rounded-full border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"
                                    >
                                        Anterior
                                    </button>
                                    <span>Página {previewPage} de {previewPageCount}</span>
                                    <button
                                        type="button"
                                        disabled={previewPage === previewPageCount}
                                        onClick={() => setPreviewPage((page) => Math.min(previewPageCount, page + 1))}
                                        className="rounded-full border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"
                                    >
                                        Próxima
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {dataset.notes && dataset.notes.length > 0 && (
                        <div className="mx-6 mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 sm:mx-10">
                            <p className="font-bold text-[var(--sgf-dark)]">Critérios do relatório</p>
                            {dataset.notes.map((note) => <p key={note} className="mt-1">• {note}</p>)}
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-4 border-t border-slate-100 px-6 py-4 text-[10px] text-slate-400 sm:px-10">
                        <span>
                            {reportBranding.reportFooter
                                || `${reportBranding.appName || 'Exattus Rotta'} — Gestão pública de frotas por protocolo digital`}
                        </span>
                        <span className="whitespace-nowrap">Data de emissão e paginação aplicadas na impressão</span>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}

export default ReportViewerModal;
