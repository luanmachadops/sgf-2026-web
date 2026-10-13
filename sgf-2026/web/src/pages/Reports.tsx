import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from 'react';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFButton } from '@/components/sgf/SGFButton';
import { QrLabelGenerator } from '@/components/reports/QrLabelGenerator';
import { IssuedReportsCard } from '@/components/reports/IssuedReportsCard';
import {
    AlertTriangle,
    Calendar,
    Car,
    CheckCircle,
    Fuel,
    Money,
    PieChart,
    Qr,
    Receipt,
    Route,
    Search,
    ShieldCheck,
    Users,
    Wrench,
    X,
} from '@/components/sgf/icons';
import { useHeader } from '@/contexts/HeaderContext';
import {
    REPORTS,
    REPORT_SUBJECTS,
    type ReportDefinition,
    type ReportIconKey,
    type ReportSubject,
} from '@/lib/reports/registry';
import { matchesSearch } from '@/lib/utils';

const ReportViewerModal = lazy(() => import('@/components/reports/ReportViewerModal'));

const ICONS: Record<ReportIconKey, ComponentType<{ className?: string }>> = {
    car: Car,
    route: Route,
    cost: Money,
    pie: PieChart,
    fuel: Fuel,
    alert: AlertTriangle,
    wrench: Wrench,
    check: CheckCircle,
    users: Users,
    receipt: Receipt,
    calendar: Calendar,
    shield: ShieldCheck,
};

function ReportCard({ report, onOpen }: { report: ReportDefinition; onOpen: () => void }) {
    const Icon = ICONS[report.icon];
    return (
        <button
            type="button"
            onClick={onOpen}
            className="group flex h-full w-full flex-col rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-[var(--sgf-shadow-xs)] transition hover:border-[var(--sgf-primary)]/50 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--sgf-primary)]/20"
        >
            <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--sgf-primary)]/10 text-[var(--sgf-primary)]">
                    <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                    <h3 className="text-sm font-bold tracking-tight text-slate-900 group-hover:text-[var(--sgf-dark)]">{report.title}</h3>
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--sgf-primary)]">{report.question}</p>
                </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">{report.description}</p>
            {(report.signatures || report.snapshot) && (
                <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                    {report.signatures && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Com assinaturas</span>
                    )}
                    {report.snapshot && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Situação atual</span>
                    )}
                </div>
            )}
        </button>
    );
}

export default function Reports() {
    const [selectedReport, setSelectedReport] = useState<ReportDefinition | null>(null);
    const [subjectFilter, setSubjectFilter] = useState<ReportSubject | ''>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [showQrGen, setShowQrGen] = useState(false);
    const { setTitle, setDescription } = useHeader();

    useEffect(() => {
        setTitle('Relatórios');
        setDescription('Documentos da frota para gestão, controle interno e prestação de contas, em PDF e Excel.');
    }, [setTitle, setDescription]);

    const filtered = useMemo(() => REPORTS.filter((report) =>
        (!subjectFilter || report.subject === subjectFilter)
        && matchesSearch(searchTerm, report.title, report.description, report.question)), [searchTerm, subjectFilter]);
    const sections = REPORT_SUBJECTS
        .map((subject) => ({ ...subject, reports: filtered.filter((report) => report.subject === subject.id) }))
        .filter((section) => section.reports.length > 0);

    const chip = (active: boolean) =>
        'px-4 py-2 rounded-full text-sm font-semibold border transition whitespace-nowrap '
        + (active
            ? 'bg-[var(--sgf-primary)] text-white border-[var(--sgf-primary)]'
            : 'bg-white text-slate-600 border-slate-200 hover:border-[var(--sgf-primary)]/50');

    return (
        <div className="space-y-8 pb-10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Assuntos">
                    <button type="button" role="tab" aria-selected={subjectFilter === ''} onClick={() => setSubjectFilter('')} className={chip(subjectFilter === '')}>
                        Todos
                    </button>
                    {REPORT_SUBJECTS.map((subject) => (
                        <button
                            key={subject.id}
                            type="button"
                            role="tab"
                            aria-selected={subjectFilter === subject.id}
                            onClick={() => setSubjectFilter(subject.id)}
                            className={chip(subjectFilter === subject.id)}
                        >
                            {subject.label}
                        </button>
                    ))}
                </div>
                <div className="group relative w-full shrink-0 lg:w-72">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[var(--sgf-primary)]" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Buscar relatório ou pergunta..."
                        aria-label="Buscar relatório"
                        className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-9 text-sm font-medium text-slate-700 shadow-[var(--sgf-shadow-xs)] transition-all placeholder:text-slate-400 hover:border-[var(--sgf-primary)]/50 focus:border-[var(--sgf-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--sgf-primary)]/10"
                    />
                    {searchTerm && (
                        <button
                            type="button"
                            onClick={() => setSearchTerm('')}
                            aria-label="Limpar busca"
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {sections.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-12 text-center">
                    <p className="text-sm font-medium text-slate-400">
                        Nenhum relatório encontrado{searchTerm ? ` para "${searchTerm}"` : ''}.
                    </p>
                </div>
            )}

            {sections.map((section) => (
                <section key={section.id} aria-labelledby={`subject-${section.id}`}>
                    <h2 id={`subject-${section.id}`} className="mb-3 text-base font-bold text-[var(--sgf-dark)]">{section.label}</h2>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {section.reports.map((report) => (
                            <ReportCard key={report.id} report={report} onOpen={() => setSelectedReport(report)} />
                        ))}
                    </div>
                </section>
            ))}

            <SGFCard padding="lg" className="overflow-hidden border border-slate-200/80">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--sgf-dark)] to-[var(--sgf-primary)] text-white">
                            <Qr className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Etiquetas QR dos veículos</h3>
                            <p className="text-sm text-slate-500">
                                Etiquetas com o QR Code (placa) por secretaria e tipo, em PDF vetorial para impressão.
                            </p>
                        </div>
                    </div>
                    <SGFButton icon={Qr} onClick={() => setShowQrGen(true)} className="shrink-0">
                        Abrir gerador
                    </SGFButton>
                </div>
            </SGFCard>

            <IssuedReportsCard />

            {selectedReport && (
                <Suspense fallback={null}>
                <ReportViewerModal
                    key={selectedReport.id}
                    isOpen
                    onClose={() => {
                        setSelectedReport(null);
                    }}
                    reportId={selectedReport.id}
                    title={selectedReport.title}
                    description={selectedReport.description}
                />
                </Suspense>
            )}

            <QrLabelGenerator isOpen={showQrGen} onClose={() => setShowQrGen(false)} />
        </div>
    );
}
