import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { SGFTable, type SGFTableColumn } from '@/components/sgf/SGFTable';
import { X, ShieldCheck, FileText as FileIcon, FileSpreadsheet as ExcelIcon, Calendar, ArrowLeft } from '@/components/sgf/icons';
import { fetchReportDataset, fetchDepartmentOptions, type ReportDataset } from '@/lib/reportData';
import {
    exportReportToPDF,
    exportReportToExcel,
    type ReportFilters,
    type ReportBranding,
} from '@/lib/reportExport';
import { useBranding } from '@/contexts/BrandingContext';
import { toast } from 'sonner';

const EMPTY_DATASET: ReportDataset = { columns: [], rows: [], kpis: [] };

const periodOptions = [
    { value: 'week', label: 'Última semana' },
    { value: 'month', label: 'Último mês' },
    { value: 'quarter', label: 'Último trimestre' },
    { value: 'year', label: 'Último ano' },
    { value: 'custom', label: 'Personalizado' },
];

export interface ReportViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    reportId: string;
    title: string;
    description: string;
}

type Row = Record<string, string | number>;

export function ReportViewerModal({ isOpen, onClose, reportId, title, description }: ReportViewerModalProps) {
    const { branding: tenantBranding } = useBranding();
    const reportBranding: ReportBranding = useMemo(() => ({
        name: tenantBranding.name,
        logoUrl: tenantBranding.logoUrl,
        sealUrl: tenantBranding.sealUrl,
        city: tenantBranding.city,
        state: tenantBranding.state,
        cnpj: tenantBranding.cnpj,
        mayorName: tenantBranding.mayorName,
        reportFooter: tenantBranding.reportFooter,
    }), [tenantBranding]);
    const [period, setPeriod] = useState('month');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [department, setDepartment] = useState('');
    const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);

    const { data: departmentOptions = [{ value: '', label: 'Todas as secretarias' }] } = useQuery({
        queryKey: ['report-departments'],
        queryFn: fetchDepartmentOptions,
        staleTime: 5 * 60 * 1000,
    });

    // Converte período/custom em intervalo de datas (ISO yyyy-mm-dd) para a consulta.
    const range = useMemo(() => {
        if (period === 'custom') {
            return { from: dateFrom || undefined, to: dateTo || undefined };
        }
        const to = new Date();
        const from = new Date();
        if (period === 'week') from.setDate(from.getDate() - 7);
        else if (period === 'month') from.setMonth(from.getMonth() - 1);
        else if (period === 'quarter') from.setMonth(from.getMonth() - 3);
        else if (period === 'year') from.setFullYear(from.getFullYear() - 1);
        const iso = (d: Date) => d.toISOString().slice(0, 10);
        return { from: iso(from), to: iso(to) };
    }, [period, dateFrom, dateTo]);

    const { data: dataset = EMPTY_DATASET, isLoading, isError } = useQuery({
        queryKey: ['report-dataset', reportId, department, range.from, range.to],
        queryFn: () =>
            fetchReportDataset(reportId, {
                departmentId: department || undefined,
                dateFrom: range.from,
                dateTo: range.to,
            }),
        enabled: isOpen,
    });

    const filters: ReportFilters = useMemo(() => ({
        periodLabel: periodOptions.find((p) => p.value === period)?.label ?? '—',
        dateFrom: range.from,
        dateTo: range.to,
        departmentLabel: departmentOptions.find((d) => d.value === department)?.label ?? 'Todas as secretarias',
    }), [period, range.from, range.to, department, departmentOptions]);

    const columns: SGFTableColumn<Row>[] = useMemo(
        () => dataset.columns.map((c) => ({
            header: c.label,
            className: c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : undefined,
            accessor: (row: Row) => {
                const v = row[c.key];
                return typeof v === 'number' ? v.toLocaleString('pt-BR') : (v ?? '—');
            },
        })),
        [dataset.columns]
    );

    const handlePDF = () => {
        if (isLoading || dataset.rows.length === 0) {
            toast.warning('Sem dados para exportar.');
            return;
        }
        exportReportToPDF({ reportTitle: title, reportDescription: description, dataset, filters, branding: reportBranding });
    };

    const handleExcel = async () => {
        if (isLoading || dataset.rows.length === 0) {
            toast.warning('Sem dados para exportar.');
            return;
        }
        try {
            setExporting('excel');
            await exportReportToExcel({ reportTitle: title, reportDescription: description, dataset, filters, branding: reportBranding });
            toast.success('Planilha Excel gerada com sucesso!');
        } catch (e) {
            console.error(e);
            toast.error('Erro ao gerar a planilha Excel.');
        } finally {
            setExporting(null);
        }
    };

    // Fechar com ESC.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[2000] bg-slate-100 flex flex-col">
            {/* Barra superior */}
            <header className="shrink-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-3">
                <button
                    onClick={onClose}
                    className="rounded-lg p-2 -ml-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors shrink-0"
                    aria-label="Voltar"
                    title="Voltar (Esc)"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-sm shrink-0">
                    <ShieldCheck className="text-white h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <h2 className="text-lg font-bold text-slate-900 truncate">{title}</h2>
                    <p className="text-xs text-slate-500 truncate">{description}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <SGFButton
                        variant="secondary"
                        size="sm"
                        icon={FileIcon}
                        onClick={handlePDF}
                        loading={exporting === 'pdf'}
                    >
                        <span className="hidden sm:inline">Exportar </span>PDF
                    </SGFButton>
                    <SGFButton
                        variant="primary"
                        size="sm"
                        icon={ExcelIcon}
                        onClick={handleExcel}
                        loading={exporting === 'excel'}
                    >
                        <span className="hidden sm:inline">Exportar </span>Excel
                    </SGFButton>
                    <button
                        onClick={onClose}
                        className="ml-1 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                        aria-label="Fechar"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
            </header>

            {/* Barra de filtros */}
            <div className="shrink-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-3">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="w-full sm:w-48">
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Período</label>
                        <SGFSelect
                            value={period}
                            onChange={setPeriod}
                            options={periodOptions}
                            triggerClassName="!py-2.5 !px-4 !text-sm !font-medium !rounded-full"
                        />
                    </div>
                    {period === 'custom' && (
                        <>
                            <div className="w-full sm:w-40">
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Data inicial</label>
                                <div className="relative">
                                    <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="date"
                                        value={dateFrom}
                                        onChange={(e) => setDateFrom(e.target.value)}
                                        className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-medium text-slate-700 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
                                    />
                                </div>
                            </div>
                            <div className="w-full sm:w-40">
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Data final</label>
                                <div className="relative">
                                    <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => setDateTo(e.target.value)}
                                        className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-medium text-slate-700 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
                                    />
                                </div>
                            </div>
                        </>
                    )}
                    <div className="w-full sm:w-56">
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Secretaria</label>
                        <SGFSelect
                            value={department}
                            onChange={setDepartment}
                            options={departmentOptions}
                            triggerClassName="!py-2.5 !px-4 !text-sm !font-medium !rounded-full"
                        />
                    </div>
                </div>
            </div>

            {/* Pré-visualização (documento) */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8">
                <div className="mx-auto max-w-5xl bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Cabeçalho do documento */}
                    <div className="px-6 sm:px-10 pt-8 pb-6 border-b-[3px] border-emerald-500">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-sm">
                                <ShieldCheck className="text-white h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-base font-extrabold text-[#0F2B2F] leading-none">SGF 2026</p>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Gestão Pública de Frota</p>
                            </div>
                            <div className="ml-auto text-right text-[11px] text-slate-400">
                                Gerado em {new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>

                        <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-[#0F2B2F]">{title}</h1>
                        <p className="mt-1.5 text-sm text-slate-500">{description}</p>

                        <div className="mt-4 inline-flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-600">
                            <span>Período: {filters.periodLabel}</span>
                            <span className="text-slate-300">•</span>
                            <span>{filters.departmentLabel}</span>
                            {filters.dateFrom && (<><span className="text-slate-300">•</span><span>De: {filters.dateFrom}</span></>)}
                            {filters.dateTo && (<><span className="text-slate-300">•</span><span>Até: {filters.dateTo}</span></>)}
                        </div>
                    </div>

                    {/* KPIs */}
                    {dataset.kpis.length > 0 && (
                        <div className="px-6 sm:px-10 py-6 grid grid-cols-2 lg:grid-cols-4 gap-4 border-b border-slate-100">
                            {dataset.kpis.map((kpi) => (
                                <div key={kpi.label} className="p-4 rounded-2xl border border-slate-200 bg-white">
                                    <p className="text-xl font-extrabold text-[#0F2B2F]">{kpi.value}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{kpi.label}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Tabela */}
                    <div className="px-2 sm:px-6 py-4">
                        {isLoading ? (
                            <div className="py-16 text-center text-sm text-slate-400">Carregando dados…</div>
                        ) : isError ? (
                            <div className="py-16 text-center text-sm text-red-500">Erro ao carregar os dados do relatório.</div>
                        ) : (
                            <SGFTable
                                columns={columns}
                                data={dataset.rows}
                                keyExtractor={(_, index) => String(index)}
                                emptyMessage="Sem dados para os filtros selecionados."
                            />
                        )}
                    </div>

                    {/* Rodapé */}
                    <div className="px-6 sm:px-10 py-4 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                        <span>SGF 2026 — Sistema de Gestão de Frota</span>
                        <span>{title}</span>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default ReportViewerModal;
