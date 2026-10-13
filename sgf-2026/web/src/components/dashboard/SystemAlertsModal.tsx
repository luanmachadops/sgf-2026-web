import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
    AlertCircle,
    ArrowRight,
    CalendarClock,
    Fuel,
    Check,
    Bell,
    ChevronRight,
    FileText,
    User,
    Route,
    Gauge,
    Clock,
} from '@/components/sgf/icons';
import { Modal } from '@/components/ui/Modal';
import { departmentBudgetApi } from '@/lib/department-budget-api';
import { useDashboardAlerts } from '@/hooks/useDashboard';
import { SGFButton } from '@/components/sgf/SGFButton';
import { supabase } from '@/lib/supabase';
import { signFotos } from '@/lib/fotoStorage';
import { formatDate } from '@/lib/utils';
import type { IconType } from '@/components/sgf/icons';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

interface CommitmentAlert {
    key: string;
    title: string;
    body: string;
    severity: 'error' | 'warning';
}

/** Secretarias com o empenho da licitação acima de 80% (aviso) ou esgotado (crítico). */
async function fetchCommitmentAlerts(): Promise<CommitmentAlert[]> {
    const contracts = await departmentBudgetApi.list(new Date().getFullYear());
    return contracts.flatMap((contract) => contract.allocations.flatMap((a) => {
        if (a.spending_limit <= 0) return [];
        const usage = ((a.spending_limit - a.available) / a.spending_limit) * 100;
        if (usage < 80) return [];
        const exhausted = a.available <= 0;
        return [{
            key: `${contract.id}-${a.department_id}`,
            title: `${a.department_name} · ${contract.reference}`,
            body: exhausted
                ? `Empenho esgotado (${currency.format(a.spending_limit)}). Novas despesas desta secretaria estão bloqueadas: peça reforço à contabilidade.`
                : `${percent.format(usage)}% do empenho consumido. Restam ${currency.format(a.available)} de ${currency.format(a.spending_limit)}.`,
            severity: exhausted ? 'error' as const : 'warning' as const,
        }];
    })).sort((x, y) => (x.severity === y.severity ? 0 : x.severity === 'error' ? -1 : 1));
}

const OPERATIONAL_STYLE: Record<string, { card: string; badge: string; icon: string }> = {
    critical: { card: 'border-red-200 bg-red-50/70 hover:bg-red-100/80', badge: 'bg-red-600 text-white', icon: 'text-red-600' },
    warning:  { card: 'border-amber-200 bg-amber-50/70 hover:bg-amber-100/80', badge: 'bg-amber-500 text-white', icon: 'text-amber-600' },
    info:     { card: 'border-blue-200 bg-blue-50/60 hover:bg-blue-100/80', badge: 'bg-blue-600 text-white', icon: 'text-blue-600' },
};

const OPERATIONAL_ICONS: Record<string, IconType> = {
    km_regressivo: Gauge,
    salto_km: Route,
    fora_expediente: Clock,
    abast_consumo_baixo: Fuel,
};

const SESSION_STORAGE_KEY = 'sgf_system_alerts_dismissed';

interface SystemAlertsModalProps {
    isOpen?: boolean;
    onClose?: () => void;
    /** Renderiza só a lista, sem modal (aba Alertas da Central de Notificações). */
    inline?: boolean;
}

export function SystemAlertsModal({ isOpen: externalIsOpen, onClose: externalOnClose, inline = false }: SystemAlertsModalProps) {
    const navigate = useNavigate();
    const [dismissed, setDismissed] = useState(
        () => typeof window !== 'undefined' && sessionStorage.getItem(SESSION_STORAGE_KEY) === 'true',
    );

    // 1. Empenho por secretaria (Limites por secretaria)
    const procurementQuery = useQuery({
        queryKey: ['department-budget-alerts'],
        queryFn: fetchCommitmentAlerts,
        staleTime: 60_000,
    });

    // 3. Motoristas com CNH vencendo ou vencida (detalhado por motorista)
    const driverCnhQuery = useQuery({
        queryKey: ['drivers-cnh-alerts'],
        queryFn: async () => {
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name, photo_url, cnh_expiry, cnh_category')
                .eq('role', 'motorista')
                .is('archived_at', null)
                .not('cnh_expiry', 'is', null);
            await signFotos(data);

            const now = new Date();
            now.setHours(0, 0, 0, 0);

            return (data || [])
                .map((d) => {
                    const expiry = new Date(`${d.cnh_expiry}T12:00:00`);
                    const diffTime = expiry.getTime() - now.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return {
                        id: d.id,
                        name: d.full_name,
                        photoUrl: d.photo_url,
                        cnhCategory: d.cnh_category,
                        cnhExpiry: d.cnh_expiry,
                        daysRemaining: diffDays,
                        isExpired: diffDays <= 0,
                    };
                })
                .filter((d) => d.daysRemaining <= 30)
                .sort((a, b) => a.daysRemaining - b.daysRemaining);
        },
        staleTime: 60_000,
    });

    // 4. Outras Pendências Operacionais (Abastecimentos, Manutenções, Checklists)
    const dashboardAlertsQuery = useDashboardAlerts();

    const procurementAlerts = procurementQuery.data ?? [];
    const driverAlerts = driverCnhQuery.data ?? [];

    // Filtra qualquer alerta genérico de CNH para manter APENAS o card detalhado com foto do motorista
    const rawOperationalAlerts = dashboardAlertsQuery.data ?? [];
    const otherOperationalAlerts = rawOperationalAlerts.filter(
        (a) => !a.kind.toLowerCase().includes('cnh') && !a.title.toLowerCase().includes('cnh'),
    );

    const totalAlerts = procurementAlerts.length + driverAlerts.length + otherOperationalAlerts.length;

    const isVisible = externalIsOpen !== undefined
        ? externalIsOpen
        : !dismissed
            && totalAlerts > 0
            && !procurementQuery.isLoading
            && !dashboardAlertsQuery.isLoading;

    const handleClose = () => {
        sessionStorage.setItem(SESSION_STORAGE_KEY, 'true');
        setDismissed(true);
        if (externalOnClose) externalOnClose();
    };

    const handleNavigate = (link: string) => {
        if (!inline) handleClose();
        navigate(link);
    };

    if (!inline && !isVisible) return null;

    const criticalCount =
        procurementAlerts.filter((a) => a.severity === 'error').length +
        driverAlerts.filter((d) => d.isExpired).length +
        otherOperationalAlerts.filter((a) => a.severity === 'critical').length;

    const body = (
            <div className={inline ? "space-y-6" : "space-y-6 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar"}>
                {totalAlerts === 0 ? (
                    <div className="py-8 text-center text-slate-500">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-2">
                            <Check className="h-6 w-6" />
                        </div>
                        <p className="font-bold text-slate-800">Tudo em dia!</p>
                        <p className="text-xs text-slate-500">Nenhum aviso de empenho, motorista ou frota.</p>
                    </div>
                ) : (
                    <>
                        {/* Seção 1: Empenho por secretaria */}
                        {procurementAlerts.length > 0 && (
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <FileText className="h-4 w-4 text-amber-600" />
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                                        Empenho por secretaria ({procurementAlerts.length})
                                    </h3>
                                </div>

                                <div className="space-y-2.5">
                                    {procurementAlerts.map((alert) => {
                                        const isError = alert.severity === 'error';
                                        return (
                                            <div
                                                key={alert.key}
                                                onClick={() => handleNavigate('/limites')}
                                                className={`group flex cursor-pointer items-center gap-3.5 rounded-2xl border p-3.5 transition-all hover:shadow-md ${
                                                    isError ? 'border-red-200 bg-red-50/70 hover:bg-red-100/80' : 'border-amber-200 bg-amber-50/70 hover:bg-amber-100/80'
                                                }`}
                                            >
                                                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${isError ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    <CalendarClock className="h-5 w-5" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                                                        {alert.title}
                                                    </span>
                                                    <p className="mt-0.5 text-xs text-slate-600">{alert.body}</p>
                                                </div>
                                                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-slate-700 group-hover:text-slate-900 group-hover:translate-x-0.5 transition-all self-center">
                                                    Ver limites <ArrowRight className="h-3.5 w-3.5" />
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Seção 2: CNH de Motoristas (Com foto, nome e contagem exata de dias) */}
                        {driverAlerts.length > 0 && (
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <User className="h-4 w-4 text-amber-600" />
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                                        Motoristas · Vencimento de CNH ({driverAlerts.length})
                                    </h3>
                                </div>

                                <div className="space-y-2.5">
                                    {driverAlerts.map((driver) => {
                                        const isExpired = driver.isExpired;
                                        const target = `/motoristas/${driver.id}`;

                                        return (
                                            <div
                                                key={driver.id}
                                                onClick={() => handleNavigate(target)}
                                                className={`group flex cursor-pointer items-center gap-3.5 rounded-2xl border p-3.5 transition-all hover:shadow-md ${
                                                    isExpired
                                                        ? 'border-red-200 bg-red-50/80 hover:bg-red-100'
                                                        : 'border-amber-200 bg-amber-50/80 hover:bg-amber-100'
                                                }`}
                                            >
                                                {/* Foto do Motorista */}
                                                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-white">
                                                    {driver.photoUrl ? (
                                                        <img
                                                            src={driver.photoUrl}
                                                            alt={driver.name}
                                                            className="h-full w-full object-cover"
                                                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                                        />
                                                    ) : (
                                                        <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-500">
                                                            <User className="h-5 w-5" />
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="truncate text-sm font-bold text-slate-900 group-hover:text-amber-800 transition-colors">
                                                            {driver.name}
                                                        </span>
                                                        {driver.cnhCategory && (
                                                            <span className="shrink-0 rounded-md bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                                                                Cat. {driver.cnhCategory}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className={`mt-0.5 text-xs font-semibold ${isExpired ? 'text-red-700' : 'text-amber-800'}`}>
                                                        {isExpired
                                                            ? `CNH Vencida há ${Math.abs(driver.daysRemaining)} dia(s) (${formatDate(driver.cnhExpiry)})`
                                                            : driver.daysRemaining === 0
                                                            ? `CNH vence hoje! (${formatDate(driver.cnhExpiry)})`
                                                            : `CNH vence em ${driver.daysRemaining} dia(s) (${formatDate(driver.cnhExpiry)})`}
                                                    </p>
                                                </div>

                                                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-slate-700 group-hover:text-slate-900 group-hover:translate-x-0.5 transition-all self-center">
                                                    Ver cadastro <ArrowRight className="h-3.5 w-3.5" />
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Seção 3: Outras Pendências Operacionais (Abastecimentos, Manutenções, Checklists) */}
                        {otherOperationalAlerts.length > 0 && (
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <Bell className="h-4 w-4 text-slate-600" />
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                                        Outras Pendências ({otherOperationalAlerts.length})
                                    </h3>
                                </div>

                                <div className="space-y-2.5">
                                    {otherOperationalAlerts.map((a) => {
                                        const st = OPERATIONAL_STYLE[a.severity] ?? OPERATIONAL_STYLE.info;
                                        const KindIcon = OPERATIONAL_ICONS[a.kind];
                                        return (
                                            <div
                                                key={a.kind}
                                                onClick={() => handleNavigate(a.link)}
                                                className={`group flex cursor-pointer items-center gap-3.5 rounded-2xl border px-4 py-3.5 transition-all hover:shadow-md ${st.card}`}
                                            >
                                                <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-black ${st.badge}`}>
                                                    {a.count}
                                                </span>
                                                {KindIcon && <KindIcon className={`h-5 w-5 shrink-0 ${st.icon}`} />}
                                                <div className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                                                        {a.title}
                                                    </span>
                                                    <span className="block truncate text-xs text-slate-600">{a.detail}</span>
                                                </div>
                                                <ChevronRight className={`h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${st.icon}`} />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
    );

    if (inline) {
        if (procurementQuery.isLoading || dashboardAlertsQuery.isLoading) {
            return <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />;
        }
        return body;
    }

    return (
        <Modal
            isOpen={isVisible}
            onClose={handleClose}
            size="lg"
            surfaceBg={false}
            title={undefined}
            showCloseButton={false}
            footer={
                <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-slate-500">
                        {totalAlerts} {totalAlerts === 1 ? 'aviso pendente' : 'avisos pendentes'}
                        {criticalCount > 0 ? ` · ${criticalCount} crítico(s)` : ''}
                    </span>
                    <SGFButton
                        onClick={handleClose}
                        variant="primary"
                        icon={Check}
                        className="!rounded-xl !px-6 shadow-sm"
                    >
                        Entendido e Fechar
                    </SGFButton>
                </div>
            }
        >
            {/* Header Customizado */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4 mb-5">
                <div className="flex items-center gap-3">
                    <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
                        criticalCount > 0 ? 'bg-red-100 text-red-600 ring-4 ring-red-50' : 'bg-amber-100 text-amber-600 ring-4 ring-amber-50'
                    }`}>
                        <AlertCircle className="h-6 w-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Avisos Importantes do Sistema</h2>
                        <p className="text-xs text-slate-500">
                            Licitações, CNHs de motoristas e pendências operacionais da frota.
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                >
                    <span className="text-sm font-bold">✕</span>
                </button>
            </div>

            {body}
        </Modal>
    );
}
