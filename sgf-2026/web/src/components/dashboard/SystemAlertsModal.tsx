import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
    AlertCircle,
    ArrowRight,
    CalendarClock,
    Fuel,
    Wrench,
    Check,
    Bell,
    ChevronRight,
    FileText,
    User,
} from '@/components/sgf/icons';
import { Modal } from '@/components/ui/Modal';
import { procurementApi, type ProcurementAlert } from '@/lib/procurement-api';
import { useDashboardAlerts } from '@/hooks/useDashboard';
import { SGFButton } from '@/components/sgf/SGFButton';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function procurementAlertCopy(alert: ProcurementAlert): { title: string; body: string } {
    const numText = alert.contractNumber ? ` · Contrato ${alert.contractNumber}` : '';
    if (alert.code === 'contract_expired') {
        return {
            title: `${alert.partnerName}${numText}`,
            body: `Licitação vencida há ${Math.abs(alert.daysRemaining ?? 0)} dia(s). Operações bloqueadas.`,
        };
    }
    if (alert.code === 'contract_expiring') {
        return {
            title: `${alert.partnerName}${numText}`,
            body: `Contrato vence ${alert.daysRemaining === 0 ? 'hoje' : `em ${alert.daysRemaining} dia(s)`} (${alert.contractEnd ? formatDate(alert.contractEnd) : 'sem data'}).`,
        };
    }
    if (alert.code === 'budget_exhausted') {
        return {
            title: `${alert.partnerName}${numText}`,
            body: `Orçamento 100% comprometido (${currency.format(alert.committedValue)} de ${currency.format(alert.contractValue ?? 0)}).`,
        };
    }
    return {
        title: `${alert.partnerName}${numText}`,
        body: `Restam ${percent.format(alert.remainingPercent ?? 0)}% = ${currency.format(alert.remainingValue ?? 0)} de ${currency.format(alert.contractValue ?? 0)}.`,
    };
}

const OPERATIONAL_STYLE: Record<string, { card: string; badge: string; icon: string }> = {
    critical: { card: 'border-red-200 bg-red-50/70 hover:bg-red-100/80', badge: 'bg-red-600 text-white', icon: 'text-red-600' },
    warning:  { card: 'border-amber-200 bg-amber-50/70 hover:bg-amber-100/80', badge: 'bg-amber-500 text-white', icon: 'text-amber-600' },
    info:     { card: 'border-blue-200 bg-blue-50/60 hover:bg-blue-100/80', badge: 'bg-blue-600 text-white', icon: 'text-blue-600' },
};

const SESSION_STORAGE_KEY = 'sgf_system_alerts_dismissed';

interface SystemAlertsModalProps {
    isOpen?: boolean;
    onClose?: () => void;
}

export function SystemAlertsModal({ isOpen: externalIsOpen, onClose: externalOnClose }: SystemAlertsModalProps) {
    const navigate = useNavigate();
    const [dismissed, setDismissed] = useState(
        () => typeof window !== 'undefined' && sessionStorage.getItem(SESSION_STORAGE_KEY) === 'true',
    );

    // 1. Licitações/Contratos
    const procurementQuery = useQuery({
        queryKey: ['procurement-alerts'],
        queryFn: procurementApi.getAlerts,
        staleTime: 60_000,
    });

    // 2. Fotos de Postos e Oficinas (comércio)
    const partnerPhotosQuery = useQuery({
        queryKey: ['partner-photos'],
        queryFn: async () => {
            const [stations, shops] = await Promise.all([
                supabase.from('fuel_stations').select('id, photo_url'),
                supabase.from('repair_shops').select('id, photo_url'),
            ]);
            const map = new Map<string, string>();
            (stations.data || []).forEach((s) => { if (s.photo_url) map.set(s.id, s.photo_url); });
            (shops.data || []).forEach((s) => { if (s.photo_url) map.set(s.id, s.photo_url); });
            return map;
        },
        staleTime: 5 * 60 * 1000,
    });

    // 3. Motoristas com CNH vencendo ou vencida (detalhado por motorista)
    const driverCnhQuery = useQuery({
        queryKey: ['drivers-cnh-alerts'],
        queryFn: async () => {
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name, photo_url, cnh_expiry, cnh_category')
                .eq('role', 'motorista')
                .not('cnh_expiry', 'is', null);

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
    const partnerPhotos = partnerPhotosQuery.data ?? new Map<string, string>();

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
        handleClose();
        navigate(link);
    };

    if (!isVisible) return null;

    const criticalCount =
        procurementAlerts.filter((a) => a.severity === 'error').length +
        driverAlerts.filter((d) => d.isExpired).length +
        otherOperationalAlerts.filter((a) => a.severity === 'critical').length;

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

            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
                {totalAlerts === 0 ? (
                    <div className="py-8 text-center text-slate-500">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-2">
                            <Check className="h-6 w-6" />
                        </div>
                        <p className="font-bold text-slate-800">Tudo em dia!</p>
                        <p className="text-xs text-slate-500">Nenhum aviso de licitação ou pendência de motorista ou frota.</p>
                    </div>
                ) : (
                    <>
                        {/* Seção 1: Licitações e Contratos (Com foto do comércio) */}
                        {procurementAlerts.length > 0 && (
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <FileText className="h-4 w-4 text-amber-600" />
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                                        Licitações e Contratos ({procurementAlerts.length})
                                    </h3>
                                </div>

                                <div className="space-y-2.5">
                                    {procurementAlerts.map((alert) => {
                                        const copy = procurementAlertCopy(alert);
                                        const isError = alert.severity === 'error';
                                        const DefaultIcon = alert.partnerKind === 'posto' ? Fuel : Wrench;
                                        const photo = partnerPhotos.get(alert.partnerId);
                                        const target = alert.partnerKind === 'posto'
                                            ? `/postos/${alert.partnerId}`
                                            : `/oficinas/${alert.partnerId}`;

                                        return (
                                            <div
                                                key={`${alert.partnerKind}-${alert.partnerId}-${alert.code}`}
                                                onClick={() => handleNavigate(target)}
                                                className={`group flex cursor-pointer items-center gap-3.5 rounded-2xl border p-3.5 transition-all hover:shadow-md ${
                                                    isError ? 'border-red-200 bg-red-50/70 hover:bg-red-100/80' : 'border-amber-200 bg-amber-50/70 hover:bg-amber-100/80'
                                                }`}
                                            >
                                                {/* Foto do Comércio / Estabelecimento */}
                                                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white">
                                                    {photo ? (
                                                        <img
                                                            src={photo}
                                                            alt={alert.partnerName}
                                                            className="h-full w-full object-cover"
                                                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                                        />
                                                    ) : (
                                                        <div className={`flex h-full w-full items-center justify-center ${isError ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                            {alert.code.startsWith('contract') ? <CalendarClock className="h-5 w-5" /> : <DefaultIcon className="h-5 w-5" />}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="truncate text-sm font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                                                            {copy.title}
                                                        </span>
                                                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                                            isError ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                                                        }`}>
                                                            {alert.partnerKind === 'posto' ? 'Posto' : 'Oficina'}
                                                        </span>
                                                    </div>
                                                    <p className="mt-0.5 truncate text-xs text-slate-600">{copy.body}</p>
                                                </div>
                                                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-slate-700 group-hover:text-slate-900 group-hover:translate-x-0.5 transition-all self-center">
                                                    Ver contrato <ArrowRight className="h-3.5 w-3.5" />
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
                                        return (
                                            <div
                                                key={a.kind}
                                                onClick={() => handleNavigate(a.link)}
                                                className={`group flex cursor-pointer items-center gap-3.5 rounded-2xl border px-4 py-3.5 transition-all hover:shadow-md ${st.card}`}
                                            >
                                                <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-black ${st.badge}`}>
                                                    {a.count}
                                                </span>
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
        </Modal>
    );
}
