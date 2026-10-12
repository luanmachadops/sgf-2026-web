import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    Calendar,
    Check,
    Download,
    FileSpreadsheet as ExcelIcon,
    Plus,
    Printer,
    Save,
    Search,
    Settings,
    ShieldCheck,
    Trash2,
    X,
} from '@/components/sgf/icons';
import { fetchDepartmentOptions, fetchReportDataset } from '@/lib/reportData';
import { exportReportToExcel } from '@/lib/reportExport';
import { institutionLines } from '@/lib/reports/format';
import {
    DEFAULT_PRINT_FONT_PT,
    MAX_PRINT_FONT_PT,
    MIN_PRINT_FONT_PT,
    computeTableLayout,
    describeLayout,
    type TextMeasurer,
} from '@/lib/reports/layout';
import { findReport } from '@/lib/reports/registry';
import {
    DEFAULT_SIGNATURES,
    reportSettingsApi,
    type ReportLayoutConfig,
} from '@/lib/reports/reportSettingsApi';
import { formatVerificationCode } from '@/lib/reports/verification';
import {
    downloadBlob,
    generateReportPdf,
    openPendingPdfTab,
    reportFileName,
    showPdfInTab,
} from '@/lib/reports/reportPdfBrowser';
import type {
    ReportBranding,
    ReportColumn,
    ReportDataset,
    ReportExportOptions,
    ReportFilters,
    ReportOrientation,
    ReportSignature,
} from '@/lib/reports/types';
import {
    arrangeRows,
    nextSort,
    rememberRecentReport,
    type ReportSort,
} from '@/lib/reports/viewerState';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
import { matchesSearch } from '@/lib/utils';
import { canAccessModule } from '@/lib/accessModules';
import { toast } from 'sonner';
import { LegacyReconciliationDialog, type LegacyReportRow } from './LegacyReconciliationDialog';
import { ReportTable } from './ReportTable';

const EMPTY_DATASET: ReportDataset = { columns: [], rows: [], kpis: [], charts: [] };
const CHART_COLORS = ['#00A86B', '#0F2B2F', '#70C4A8', '#3B82F6', '#F59E0B', '#8B5CF6', '#DC2626', '#64748B'];

const periodOptions = [
    { value: 'week', label: 'Última semana' },
    { value: 'month', label: 'Último mês' },
    { value: 'quarter', label: 'Último trimestre' },
    { value: 'year', label: 'Último ano' },
    { value: 'all', label: 'Todo o período' },
    { value: 'custom', label: 'Personalizado' },
];

const PRIORITY_GROUPS: { priority: 1 | 2 | 3; label: string }[] = [
    { priority: 1, label: 'Essenciais' },
    { priority: 2, label: 'Normais' },
    { priority: 3, label: 'Complementares' },
];

const pillInput = 'w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-medium text-slate-700 focus:border-[var(--sgf-primary)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--sgf-primary)]/10';
const pillSelect = '!rounded-full !px-4 !py-2.5 !text-sm !font-medium';

export interface ReportViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    reportId: string;
    title: string;
    description: string;
}

function chartTick(value: number, format?: string): string {
    if (format === 'currency') {
        return new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL' }).format(value);
    }
    if (format === 'percent') return `${Math.round(value)}%`;
    return new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(value);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">{children}</p>;
}

export function ReportViewerModal({ isOpen, onClose, reportId, title, description }: ReportViewerModalProps) {
    const definition = findReport(reportId);
    const { branding: tenantBranding } = useBranding();
    const { user } = useAuth();
    const [legacyRow, setLegacyRow] = useState<LegacyReportRow | null>(null);
    const canReconcileLegacy = ['admin', 'gestor', 'superadmin'].includes(user?.accountRole ?? '')
        && user?.allowedModules?.includes('procurement') === true
        && user?.allowedModules?.includes('budgets') === true
        && user?.allowedModules?.includes('reports') === true;
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
    const identityLines = useMemo(() => institutionLines(reportBranding), [reportBranding]);

    const [period, setPeriod] = useState('month');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [department, setDepartment] = useState('');
    const [rowSearch, setRowSearch] = useState('');
    const [contextValue, setContextValue] = useState('');
    const [columnOrder, setColumnOrder] = useState<string[]>([]);
    const [showPanel, setShowPanel] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'sheet'>('table');
    const [orientation, setOrientation] = useState<ReportOrientation>('auto');
    const [fontSize, setFontSize] = useState(DEFAULT_PRINT_FONT_PT);
    const [sort, setSort] = useState<ReportSort | null>(null);
    const [groupBy, setGroupBy] = useState<string | null>(definition?.groupBy ?? null);
    const [signaturesEnabled, setSignaturesEnabled] = useState(Boolean(definition?.signatures));
    const queryClient = useQueryClient();
    const canManageDefaults = ['admin', 'gestor', 'superadmin'].includes(user?.accountRole ?? '');
    // Gravar o padrão escreve em app_settings, que o filtro de módulos liga a Configurações.
    const canSaveDefaultSignatures = canManageDefaults && canAccessModule(user?.allowedModules, 'settings');
    // Assinaturas: padrão da prefeitura (app_settings), editáveis só para este documento.
    const signaturesQuery = useQuery({
        queryKey: ['report-signatures'],
        queryFn: reportSettingsApi.getSignatures,
        staleTime: 5 * 60 * 1000,
        enabled: isOpen,
    });
    const [signatureEdits, setSignatureEdits] = useState<ReportSignature[] | null>(null);
    const signatures = signatureEdits ?? signaturesQuery.data ?? DEFAULT_SIGNATURES;
    const saveDefaultSignatures = useMutation({
        mutationFn: () => reportSettingsApi.saveSignatures(signatures),
        onSuccess: () => {
            toast.success('Assinaturas salvas como padrão da prefeitura.');
            setSignatureEdits(null);
            void queryClient.invalidateQueries({ queryKey: ['report-signatures'] });
        },
        onError: (saveError) => toast.error(saveError instanceof Error ? saveError.message : 'Não foi possível salvar.'),
    });
    // Modelos de layout compartilhados pela prefeitura.
    const modelsQuery = useQuery({
        queryKey: ['report-models', reportId],
        queryFn: () => reportSettingsApi.listModels(reportId),
        enabled: isOpen,
    });
    const models = modelsQuery.data ?? [];
    const [modelName, setModelName] = useState('');
    const saveModelMutation = useMutation({
        mutationFn: (input: { name: string; config: ReportLayoutConfig }) =>
            reportSettingsApi.saveModel(reportId, input.name, input.config),
        onSuccess: (_, input) => {
            toast.success(`Modelo "${input.name}" salvo para toda a prefeitura.`);
            void queryClient.invalidateQueries({ queryKey: ['report-models', reportId] });
        },
        onError: (saveError) => toast.error(saveError instanceof Error ? saveError.message : 'Não foi possível salvar o modelo.'),
    });
    const deleteModelMutation = useMutation({
        mutationFn: (id: string) => reportSettingsApi.deleteModel(id),
        onSuccess: () => {
            setModelName('');
            void queryClient.invalidateQueries({ queryKey: ['report-models', reportId] });
        },
        onError: (deleteError) => toast.error(deleteError instanceof Error ? deleteError.message : 'Não foi possível excluir o modelo.'),
    });
    const [exporting, setExporting] = useState<'pdf' | 'print' | 'excel' | null>(null);

    useEffect(() => {
        if (isOpen) rememberRecentReport(reportId);
    }, [isOpen, reportId]);

    const { data: pdfMeasurer } = useQuery<TextMeasurer>({
        queryKey: ['report-pdf-measurer'],
        queryFn: async () => (await import('@/lib/reports/pdf')).getPdfTextMeasurer(),
        staleTime: Infinity,
        enabled: isOpen,
    });

    const { data: departmentOptions = [{ value: '', label: 'Todas as secretarias' }] } = useQuery({
        queryKey: ['report-departments'],
        queryFn: fetchDepartmentOptions,
        staleTime: 5 * 60 * 1000,
    });

    const range = useMemo(() => {
        if (period === 'all') return { from: undefined, to: undefined };
        if (period === 'custom') return { from: dateFrom || undefined, to: dateTo || undefined };
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
    const { data: dataset = EMPTY_DATASET, isLoading, isError, error } = useQuery({
        queryKey: ['report-dataset', reportId, department, range.from, range.to],
        queryFn: () => fetchReportDataset(reportId, {
            departmentId: department || undefined,
            dateFrom: range.from,
            dateTo: range.to,
        }),
        enabled: isOpen && rangeIsValid,
    });

    const columnSignature = dataset.columns.map((column) => `${column.key}:${column.defaultVisible !== false}`).join('|');
    useEffect(() => {
        setColumnOrder(dataset.columns.filter((column) => column.defaultVisible !== false).map((column) => column.key));
        setContextValue('');
        setRowSearch('');
    }, [reportId, columnSignature, dataset.columns]);

    const columnByKey = useMemo(() => new Map(dataset.columns.map((column) => [column.key, column])), [dataset.columns]);
    const visibleColumns = useMemo(
        () => columnOrder.map((key) => columnByKey.get(key)).filter((column): column is ReportColumn => Boolean(column)),
        [columnByKey, columnOrder],
    );

    const contextColumn = useMemo(() => columnByKey.get(definition?.contextKey ?? '')
        ?? dataset.columns.find((column) => column.filterable), [columnByKey, dataset.columns, definition?.contextKey]);
    const contextOptions = useMemo(() => {
        if (!contextColumn) return [];
        const values = [...new Set(dataset.rows.map((row) => String(row[contextColumn.key] ?? '')).filter(Boolean))]
            .sort((left, right) => left.localeCompare(right, 'pt-BR'));
        return [{ value: '', label: `Todos: ${contextColumn.label}` }, ...values.map((value) => ({ value, label: value }))];
    }, [contextColumn, dataset.rows]);

    const filteredRows = useMemo(() => dataset.rows.filter((row) => {
        if (contextColumn && contextValue && String(row[contextColumn.key] ?? '') !== contextValue) return false;
        return matchesSearch(rowSearch, ...dataset.columns.map((column) => String(row[column.key] ?? '')));
    }), [contextColumn, contextValue, dataset.columns, dataset.rows, rowSearch]);

    const groupColumn = groupBy ? columnByKey.get(groupBy) : undefined;
    const arrangedRows = useMemo(
        () => arrangeRows(filteredRows, dataset.columns, sort, groupColumn ? groupColumn.key : null),
        [dataset.columns, filteredRows, groupColumn, sort],
    );
    const groupOptions = useMemo(() => [
        { value: '', label: 'Sem agrupamento' },
        ...dataset.columns.filter((column) => column.filterable).map((column) => ({ value: column.key, label: column.label })),
    ], [dataset.columns]);

    const printLayout = useMemo(() => {
        if (!pdfMeasurer || visibleColumns.length === 0) return null;
        return computeTableLayout({ columns: visibleColumns, rows: arrangedRows, orientation, fontSize }, pdfMeasurer);
    }, [arrangedRows, fontSize, orientation, pdfMeasurer, visibleColumns]);
    const printFit = printLayout ? describeLayout(printLayout) : null;
    const removableVisible = printLayout?.removableColumns ?? [];

    const hasClientFilters = Boolean(contextValue || rowSearch.trim());
    const filters: ReportFilters = useMemo(() => ({
        periodLabel: definition?.snapshot
            ? 'Situação na data de emissão'
            : periodOptions.find((option) => option.value === period)?.label ?? '—',
        dateFrom: definition?.snapshot ? undefined : range.from,
        dateTo: definition?.snapshot ? undefined : range.to,
        departmentLabel: departmentOptions.find((option) => option.value === department)?.label ?? 'Todas as secretarias',
        contextLabel: contextColumn && contextValue ? `${contextColumn.label}: ${contextValue}` : undefined,
        searchLabel: rowSearch.trim() || undefined,
    }), [contextColumn, contextValue, definition?.snapshot, department, departmentOptions, period, range.from, range.to, rowSearch]);

    const exportOptions: ReportExportOptions = useMemo(() => ({
        reportTitle: title,
        reportDescription: description,
        dataset: {
            ...dataset,
            columns: visibleColumns,
            rows: arrangedRows,
            charts: hasClientFilters ? [] : dataset.charts,
        },
        filters,
        branding: reportBranding,
        layout: { orientation, fontSize },
        groupBy: groupColumn?.key,
        groupColumn,
        signatures: signaturesEnabled ? signatures : undefined,
        issuer: user?.name,
    }), [arrangedRows, dataset, description, filters, fontSize, groupColumn, hasClientFilters, orientation,
        reportBranding, signatures, signaturesEnabled, title, user?.name, visibleColumns]);

    // Pré-visualização em folha: o próprio PDF, gerado com atraso para não
    // refazer a cada tecla.
    const [sheetUrl, setSheetUrl] = useState<string | null>(null);
    const [sheetState, setSheetState] = useState<'idle' | 'loading' | 'error'>('idle');
    const sheetUrlRef = useRef<string | null>(null);
    useEffect(() => {
        if (!isOpen || viewMode !== 'sheet' || isLoading || visibleColumns.length === 0) return;
        let cancelled = false;
        setSheetState('loading');
        const timer = window.setTimeout(() => {
            // Pré-visualização não registra: só o PDF baixado/impresso ganha código.
            generateReportPdf(exportOptions)
                .then(({ blob }) => {
                    if (cancelled) return;
                    const url = URL.createObjectURL(blob);
                    if (sheetUrlRef.current) URL.revokeObjectURL(sheetUrlRef.current);
                    sheetUrlRef.current = url;
                    setSheetUrl(url);
                    setSheetState('idle');
                })
                .catch(() => {
                    if (!cancelled) setSheetState('error');
                });
        }, 600);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [exportOptions, isLoading, isOpen, viewMode, visibleColumns.length]);
    useEffect(() => () => {
        if (sheetUrlRef.current) URL.revokeObjectURL(sheetUrlRef.current);
    }, []);

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

    const handlePDF = async (mode: 'pdf' | 'print') => {
        if (!validateExport()) return;
        const tab = mode === 'print' ? openPendingPdfTab() : null;
        try {
            setExporting(mode);
            const result = await generateReportPdf(exportOptions, { reportId });
            const fileName = reportFileName(title, 'pdf');
            if (mode === 'print') showPdfInTab(tab, result.blob, fileName);
            else downloadBlob(result.blob, fileName);
            if (result.verificationCode) {
                toast.success(`Relatório registrado. Código de verificação: ${formatVerificationCode(result.verificationCode)}`);
            } else {
                toast.warning('PDF gerado sem registro de autenticidade (só o código de integridade local).', {
                    description: result.registrationError,
                });
            }
        } catch (exportError) {
            tab?.close();
            console.error(exportError);
            toast.error('Erro ao gerar o PDF do relatório.');
        } finally {
            setExporting(null);
        }
    };

    const handleExcel = async () => {
        if (!validateExport()) return;
        try {
            setExporting('excel');
            await exportReportToExcel(exportOptions);
            toast.success('Planilha Excel gerada com sucesso.');
        } catch (exportError) {
            console.error(exportError);
            toast.error('Erro ao gerar a planilha Excel.');
        } finally {
            setExporting(null);
        }
    };

    const toggleColumn = (column: ReportColumn) => {
        setColumnOrder((current) => {
            if (current.includes(column.key)) return current.length > 1 ? current.filter((key) => key !== column.key) : current;
            // Reinsere na posição original do relatório.
            const original = dataset.columns.map((item) => item.key);
            const next = [...current, column.key];
            return next.sort((left, right) => {
                const leftIndex = current.indexOf(left);
                const rightIndex = current.indexOf(right);
                if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
                return original.indexOf(left) - original.indexOf(right);
            });
        });
    };
    const moveColumn = (key: string, delta: -1 | 1) => {
        setColumnOrder((current) => {
            const index = current.indexOf(key);
            const target = index + delta;
            if (index < 0 || target < 0 || target >= current.length) return current;
            const next = [...current];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const applyModel = (id: string) => {
        const model = models.find((item) => item.id === id);
        if (!model) return;
        const { config } = model;
        const known = config.columns.filter((key) => columnByKey.has(key));
        if (known.length) setColumnOrder(known);
        setOrientation(config.orientation);
        setFontSize(config.fontSize);
        setGroupBy(config.groupBy && columnByKey.has(config.groupBy) ? config.groupBy : null);
        setSort(config.sort && columnByKey.has(config.sort.key) ? config.sort : null);
        setSignaturesEnabled(config.signaturesEnabled);
        setModelName(model.name);
        toast.success(`Modelo "${model.name}" aplicado.`);
    };
    const saveModel = () => {
        const name = modelName.trim();
        if (!name) {
            toast.warning('Dê um nome ao modelo.');
            return;
        }
        saveModelMutation.mutate({
            name,
            config: { columns: columnOrder, orientation, fontSize, groupBy, sort, signaturesEnabled },
        });
    };
    const selectedModel = models.find((model) => model.name === modelName.trim());
    const canDeleteSelected = Boolean(selectedModel)
        && (selectedModel?.createdBy === user?.id || canManageDefaults);
    const deleteModel = () => {
        if (selectedModel) deleteModelMutation.mutate(selectedModel.id);
    };
    const updateSignatures = (next: ReportSignature[]) => setSignatureEdits(next);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (keyboardEvent: KeyboardEvent) => {
            if (keyboardEvent.key === 'Escape' && !legacyRow) onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, legacyRow, onClose]);

    if (!isOpen) return null;
    const showLegacyAction = reportId === 'procurement-legacy-reconciliation' && canReconcileLegacy;
    const fitTone = printFit?.tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : printFit?.tone === 'info'
            ? 'border-blue-200 bg-blue-50 text-blue-800'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800';

    const panel = (
        <aside className="flex w-full shrink-0 flex-col gap-6 overflow-y-auto border-l border-slate-200 bg-white p-5 sm:w-96" aria-label="Layout de impressão">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--sgf-dark)]">Layout de impressão</h3>
                <button type="button" onClick={() => setShowPanel(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Fechar painel">
                    <X className="h-4 w-4" />
                </button>
            </div>

            {printFit && (
                <div role="status" className={`rounded-xl border px-3 py-2.5 text-xs font-semibold ${fitTone}`}>
                    {printFit.message}
                    {printLayout?.status === 'split' && removableVisible.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setColumnOrder((current) => current.filter((key) => !removableVisible.some((column) => column.key === key)))}
                            className="mt-2 block rounded-full border border-amber-300 bg-white px-3 py-1 text-amber-800 hover:bg-amber-100"
                        >
                            Remover colunas complementares
                        </button>
                    )}
                </div>
            )}

            <div>
                <SectionTitle>Modelos salvos</SectionTitle>
                {models.length > 0 && (
                    <SGFSelect
                        fullWidth
                        value=""
                        onChange={applyModel}
                        options={[{ value: '', label: 'Aplicar um modelo…' }, ...models.map((model) => ({ value: model.id, label: model.name }))]}
                        triggerClassName="!rounded-xl !py-2 !text-sm"
                    />
                )}
                <div className="mt-2 flex gap-2">
                    <input
                        value={modelName}
                        onChange={(event) => setModelName(event.target.value)}
                        maxLength={60}
                        placeholder="Nome do modelo (ex.: Prestação de contas)"
                        aria-label="Nome do modelo"
                        className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[var(--sgf-primary)] focus:outline-none"
                    />
                    <SGFButton size="sm" variant="secondary" icon={Save} onClick={saveModel} loading={saveModelMutation.isPending} aria-label="Salvar modelo" />
                    {canDeleteSelected && (
                        <SGFButton size="sm" variant="ghost" icon={Trash2} onClick={deleteModel} loading={deleteModelMutation.isPending} aria-label="Excluir modelo" />
                    )}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Guarda campos, ordem, agrupamento e impressão para todos os usuários da prefeitura.</p>
            </div>

            <div>
                <SectionTitle>Agrupar por</SectionTitle>
                <SGFSelect
                    fullWidth
                    value={groupBy ?? ''}
                    onChange={(value) => setGroupBy(value || null)}
                    options={groupOptions}
                    triggerClassName="!rounded-xl !py-2 !text-sm"
                />
                <p className="mt-1 text-[11px] text-slate-400">Cada grupo ganha cabeçalho e subtotal, na tela e no PDF.</p>
            </div>

            <div>
                <SectionTitle>Campos e ordem</SectionTitle>
                <div className="space-y-3">
                    {PRIORITY_GROUPS.map(({ priority, label }) => {
                        const columns = dataset.columns.filter((column) => (column.priority ?? 2) === priority);
                        if (columns.length === 0) return null;
                        return (
                            <div key={priority}>
                                <p className="mb-1 text-[11px] font-semibold text-slate-400">{label}</p>
                                <ul className="space-y-1">
                                    {columns.map((column) => {
                                        const checked = columnOrder.includes(column.key);
                                        return (
                                            <li key={column.key} className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    role="checkbox"
                                                    aria-checked={checked}
                                                    onClick={() => toggleColumn(column)}
                                                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${checked ? 'text-slate-800' : 'text-slate-400'} hover:bg-slate-50`}
                                                >
                                                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${checked ? 'bg-[var(--sgf-primary)] text-white' : 'border border-slate-300'}`}>
                                                        {checked && <Check className="h-3 w-3" />}
                                                    </span>
                                                    <span className="truncate">{column.label}</span>
                                                </button>
                                                {checked && (
                                                    <>
                                                        <button type="button" onClick={() => moveColumn(column.key, -1)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Mover ${column.label} para a esquerda`}>
                                                            <ArrowUp className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button type="button" onClick={() => moveColumn(column.key, 1)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Mover ${column.label} para a direita`}>
                                                            <ArrowDown className="h-3.5 w-3.5" />
                                                        </button>
                                                    </>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div>
                <SectionTitle>Orientação</SectionTitle>
                <div className="flex rounded-full border border-slate-200 bg-white p-1">
                    {([['auto', 'Automática'], ['portrait', 'Vertical'], ['landscape', 'Horizontal']] as const).map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setOrientation(value)}
                            aria-pressed={orientation === value}
                            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold ${orientation === value ? 'bg-[var(--sgf-dark)] text-white' : 'text-slate-500'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <label className="block">
                <span className="mb-2 flex justify-between text-xs font-bold uppercase tracking-wide text-slate-600">
                    Fonte impressa <strong className="text-[var(--sgf-primary)]">{fontSize.toLocaleString('pt-BR')} pt</strong>
                </span>
                <input
                    type="range"
                    min={MIN_PRINT_FONT_PT}
                    max={MAX_PRINT_FONT_PT}
                    step="0.5"
                    value={fontSize}
                    onChange={(event) => setFontSize(Number(event.target.value))}
                    className="w-full accent-[var(--sgf-primary)]"
                />
            </label>

            <div>
                <div className="mb-2 flex items-center justify-between">
                    <SectionTitle>Assinaturas</SectionTitle>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={signaturesEnabled}
                        onClick={() => setSignaturesEnabled((current) => !current)}
                        className={`relative h-5 w-9 rounded-full transition ${signaturesEnabled ? 'bg-[var(--sgf-primary)]' : 'bg-slate-300'}`}
                        aria-label="Incluir bloco de assinaturas"
                    >
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${signaturesEnabled ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                </div>
                {signaturesEnabled && (
                    <div className="space-y-2">
                        {signatures.map((signature, index) => (
                            <div key={index} className="flex gap-2">
                                <div className="grid min-w-0 flex-1 gap-1">
                                    <input
                                        value={signature.name}
                                        maxLength={80}
                                        onChange={(event) => updateSignatures(signatures.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))}
                                        placeholder="Nome (em branco = linha para assinar)"
                                        aria-label={`Nome da assinatura ${index + 1}`}
                                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-[var(--sgf-primary)] focus:outline-none"
                                    />
                                    <input
                                        value={signature.role}
                                        maxLength={80}
                                        onChange={(event) => updateSignatures(signatures.map((item, i) => (i === index ? { ...item, role: event.target.value } : item)))}
                                        placeholder="Cargo"
                                        aria-label={`Cargo da assinatura ${index + 1}`}
                                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 focus:border-[var(--sgf-primary)] focus:outline-none"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => updateSignatures(signatures.filter((_, i) => i !== index))}
                                    className="self-start rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                                    aria-label="Remover assinatura"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                        {signatures.length < 6 && (
                            <SGFButton size="sm" variant="ghost" icon={Plus} onClick={() => updateSignatures([...signatures, { name: '', role: '' }])}>
                                Adicionar assinatura
                            </SGFButton>
                        )}
                        <p className="text-[11px] text-slate-400">
                            As alterações valem para este documento. O padrão da prefeitura também pode ser editado em Configurações.
                        </p>
                        {canSaveDefaultSignatures && signatureEdits && (
                            <SGFButton size="sm" variant="secondary" loading={saveDefaultSignatures.isPending} onClick={() => saveDefaultSignatures.mutate()}>
                                Salvar como padrão da prefeitura
                            </SGFButton>
                        )}
                    </div>
                )}
            </div>
        </aside>
    );

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
                <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold text-slate-900">{title}</h2>
                    <p className="hidden truncate text-xs text-slate-500 md:block">{definition?.question ?? description}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <SGFButton variant={showPanel ? 'primary' : 'secondary'} size="sm" icon={Settings} onClick={() => setShowPanel((current) => !current)}>
                        <span className="hidden lg:inline">Layout</span>
                    </SGFButton>
                    <SGFButton
                        variant="secondary"
                        size="sm"
                        icon={Printer}
                        onClick={() => void handlePDF('print')}
                        loading={exporting === 'print'}
                        disabled={exporting !== null && exporting !== 'print'}
                    >
                        <span className="hidden sm:inline">Imprimir</span>
                    </SGFButton>
                    <SGFButton
                        variant="secondary"
                        size="sm"
                        icon={Download}
                        onClick={() => void handlePDF('pdf')}
                        loading={exporting === 'pdf'}
                        disabled={exporting !== null && exporting !== 'pdf'}
                    >
                        PDF
                    </SGFButton>
                    <SGFButton
                        variant="primary"
                        size="sm"
                        icon={ExcelIcon}
                        onClick={handleExcel}
                        loading={exporting === 'excel'}
                        disabled={exporting !== null && exporting !== 'excel'}
                    >
                        Excel
                    </SGFButton>
                    <button type="button" onClick={onClose} className="ml-1 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900" aria-label="Fechar">
                        <X className="h-5 w-5" />
                    </button>
                </div>
            </header>

            <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
                <div className="flex flex-wrap items-end gap-3">
                    {!definition?.snapshot && (
                        <div className="w-full sm:w-48">
                            <label className="mb-1 block text-xs font-semibold text-slate-500">Período</label>
                            <SGFSelect value={period} onChange={setPeriod} options={periodOptions} triggerClassName={pillSelect} />
                        </div>
                    )}
                    {!definition?.snapshot && period === 'custom' && (
                        <>
                            <div className="w-full sm:w-40">
                                <label className="mb-1 block text-xs font-semibold text-slate-500">Data inicial</label>
                                <div className="relative">
                                    <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className={pillInput} aria-label="Data inicial" />
                                </div>
                            </div>
                            <div className="w-full sm:w-40">
                                <label className="mb-1 block text-xs font-semibold text-slate-500">Data final</label>
                                <div className="relative">
                                    <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className={pillInput} aria-label="Data final" />
                                </div>
                            </div>
                        </>
                    )}
                    <div className="w-full sm:w-56">
                        <label className="mb-1 block text-xs font-semibold text-slate-500">Secretaria</label>
                        <SGFSelect value={department} onChange={setDepartment} options={departmentOptions} triggerClassName={pillSelect} />
                    </div>
                    {contextColumn && contextOptions.length > 1 && (
                        <div className="w-full sm:w-56">
                            <label className="mb-1 block text-xs font-semibold text-slate-500">{contextColumn.label}</label>
                            <SGFSelect value={contextValue} onChange={setContextValue} options={contextOptions} triggerClassName={pillSelect} searchable={contextOptions.length > 10} />
                        </div>
                    )}
                    <div className="w-full min-w-52 flex-1 sm:max-w-72">
                        <label className="mb-1 block text-xs font-semibold text-slate-500">Buscar nos dados</label>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input type="search" value={rowSearch} onChange={(event) => setRowSearch(event.target.value)} placeholder="Placa, motorista, fornecedor..." className={pillInput} aria-label="Buscar nos dados" />
                        </div>
                    </div>
                    <div className="ml-auto flex rounded-full border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="Modo de visualização">
                        {([['table', 'Tabela'], ['sheet', 'Folha A4']] as const).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                role="tab"
                                aria-selected={viewMode === value}
                                onClick={() => setViewMode(value)}
                                className={`rounded-full px-4 py-1.5 text-xs font-semibold ${viewMode === value ? 'bg-white text-[var(--sgf-dark)] shadow-sm' : 'text-slate-500'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
                {!rangeIsValid && <p className="mt-2 text-xs font-semibold text-red-600">A data inicial deve ser anterior ou igual à data final.</p>}
            </div>

            <div className="flex min-h-0 flex-1">
                <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
                    {viewMode === 'sheet' ? (
                        <div className="mx-auto flex h-full max-w-6xl flex-col">
                            {printFit && <p className={`mb-3 rounded-xl border px-4 py-2 text-xs font-semibold ${fitTone}`}>{printFit.message}</p>}
                            <div className="relative min-h-[70vh] flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                {sheetUrl && <iframe title={`Pré-visualização do PDF: ${title}`} src={sheetUrl} className="h-full min-h-[70vh] w-full" />}
                                {(sheetState === 'loading' || !sheetUrl) && sheetState !== 'error' && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-slate-500" role="status">
                                        Montando a folha A4…
                                    </div>
                                )}
                                {sheetState === 'error' && (
                                    <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600" role="alert">
                                        Não foi possível montar a pré-visualização. Use o botão PDF.
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="mx-auto max-w-7xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <div className="border-b-[3px] border-[var(--sgf-primary)] px-6 pb-6 pt-8 sm:px-10">
                                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4">
                                    {reportBranding.sealUrl || reportBranding.logoUrl ? (
                                        <img src={reportBranding.sealUrl || reportBranding.logoUrl} alt={reportBranding.name} className="h-14 w-14 object-contain" />
                                    ) : (
                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--sgf-light)] to-[var(--sgf-primary)] shadow-sm">
                                            <ShieldCheck className="h-7 w-7 text-white" />
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-sm font-extrabold uppercase tracking-wide text-[var(--sgf-dark)] sm:text-base">{reportBranding.name}</p>
                                        {identityLines.map((line) => (
                                            <p key={line} className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">{line}</p>
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
                                    {filters.contextLabel && (<><span className="text-slate-300">•</span><span>{filters.contextLabel}</span></>)}
                                    <span className="text-slate-300">•</span>
                                    <span>{filteredRows.length.toLocaleString('pt-BR')} registro(s)</span>
                                </div>
                            </div>

                            {dataset.kpis.length > 0 && (
                                <div className="grid grid-cols-2 gap-4 border-b border-slate-100 px-6 py-6 sm:px-10 lg:grid-cols-5">
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
                                                {chart.data.length === 0 ? (
                                                    <p className="flex h-full items-center justify-center text-sm text-slate-400">Sem dados no período.</p>
                                                ) : chart.type === 'gauge' ? (
                                                    <div className="grid h-full grid-cols-2 gap-3 overflow-y-auto">
                                                        {chart.data.slice(0, 6).map((item) => (
                                                            <div key={item.label} className="rounded-xl bg-slate-50 px-2 pt-2">
                                                                <p className="truncate text-center text-xs font-bold text-slate-700" title={item.label}>{item.label}</p>
                                                                <ContractUsageGauge value={item.value} className="max-w-[180px]" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        {chart.type === 'donut' ? (
                                                            <PieChart>
                                                                <Pie data={chart.data} dataKey="value" nameKey="label" innerRadius={52} outerRadius={82} paddingAngle={2}>
                                                                    {chart.data.map((item, index) => <Cell key={item.label} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                                                                </Pie>
                                                                <Tooltip />
                                                                <Legend verticalAlign="bottom" height={32} formatter={(value) => <span className="text-xs text-slate-600">{value}</span>} />
                                                            </PieChart>
                                                        ) : (
                                                            <BarChart data={chart.data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                                                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                                                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={(value) => chartTick(Number(value), chart.valueFormat)} />
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
                                    <div className="py-16 text-center text-sm text-slate-400" role="status">Carregando todos os registros…</div>
                                ) : isError ? (
                                    <div className="py-16 text-center text-sm text-red-500" role="alert">
                                        Erro ao carregar os dados: {error instanceof Error ? error.message : 'tente novamente.'}
                                    </div>
                                ) : visibleColumns.length === 0 ? (
                                    <div className="py-16 text-center text-sm text-amber-600">Selecione ao menos uma coluna.</div>
                                ) : arrangedRows.length === 0 ? (
                                    <div className="py-16 text-center text-sm text-slate-400">Sem dados para os filtros selecionados.</div>
                                ) : (
                                    <ReportTable
                                        columns={visibleColumns}
                                        rows={arrangedRows}
                                        groupColumn={groupColumn}
                                        sort={sort}
                                        onSort={(key) => setSort((current) => nextSort(current, key))}
                                        renderAction={showLegacyAction ? (row) => (
                                            <SGFButton type="button" size="sm" variant="secondary" onClick={() => setLegacyRow(row)}>
                                                Conciliar
                                            </SGFButton>
                                        ) : undefined}
                                    />
                                )}
                            </div>

                            {dataset.notes && dataset.notes.length > 0 && (
                                <div className="mx-6 mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 sm:mx-10">
                                    <p className="font-bold text-[var(--sgf-dark)]">Critérios do relatório</p>
                                    {dataset.notes.map((note) => <p key={note} className="mt-1">• {note}</p>)}
                                </div>
                            )}

                            <div className="flex items-center justify-between gap-4 border-t border-slate-100 px-6 py-4 text-[10px] text-slate-400 sm:px-10">
                                <span>{reportBranding.reportFooter || `${reportBranding.appName || 'Exattus Rotta'} — Gestão pública de frotas por protocolo digital`}</span>
                                <span className="whitespace-nowrap">Paginação, assinaturas e código de integridade no PDF</span>
                            </div>
                        </div>
                    )}
                </main>
                {showPanel && (
                    <div className="fixed inset-0 z-10 flex justify-end bg-slate-900/20 lg:static lg:z-auto lg:bg-transparent">
                        {panel}
                    </div>
                )}
            </div>
            {showLegacyAction && (
                <LegacyReconciliationDialog
                    key={legacyRow ? `${String(legacyRow.sourceType)}:${String(legacyRow.sourceId)}` : 'closed'}
                    row={legacyRow}
                    isOpen={legacyRow !== null}
                    onClose={() => setLegacyRow(null)}
                    onCompleted={() => {
                        setLegacyRow(null);
                        toast.success('Lançamento legado conciliado com auditoria.');
                    }}
                />
            )}
        </div>,
        document.body,
    );
}

export default ReportViewerModal;
