import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, CalendarClock, Fuel, Wrench } from '@/components/sgf/icons';
import { procurementApi, type ProcurementAlert } from '@/lib/procurement-api';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function alertCopy(alert: ProcurementAlert): { title: string; body: string } {
    if (alert.code === 'contract_expired') {
        return {
            title: `Licitação vencida · ${alert.partnerName}`,
            body: `Venceu há ${Math.abs(alert.daysRemaining ?? 0)} dia(s). Novas operações estão bloqueadas; histórico e registros anteriores permanecem disponíveis.`,
        };
    }
    if (alert.code === 'contract_expiring') {
        return {
            title: `Contrato vence ${alert.daysRemaining === 0 ? 'hoje' : `em ${alert.daysRemaining} dias`} · ${alert.partnerName}`,
            body: `Vigência até ${alert.contractEnd ? new Date(`${alert.contractEnd}T12:00:00`).toLocaleDateString('pt-BR') : 'data não informada'}. Renove antes do prazo para evitar bloqueio.`,
        };
    }
    if (alert.code === 'budget_exhausted') {
        return {
            title: `Orçamento 100% comprometido · ${alert.partnerName}`,
            body: `${currency.format(alert.committedValue)} de ${currency.format(alert.contractValue ?? 0)} comprometidos. Novas operações estão bloqueadas; histórico preservado.`,
        };
    }
    return {
        title: `Orçamento da licitação chegando ao fim · ${alert.partnerName}`,
        body: `Restam ${percent.format(alert.remainingPercent ?? 0)}% = ${currency.format(alert.remainingValue ?? 0)} de ${currency.format(alert.contractValue ?? 0)}.`,
    };
}

export function ProcurementAlertsPanel() {
    const query = useQuery({
        queryKey: ['procurement-alerts'],
        queryFn: procurementApi.getAlerts,
        staleTime: 60_000,
    });
    const alerts = query.data ?? [];
    if (!query.isLoading && alerts.length === 0) return null;

    return (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
                <div>
                    <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-amber-500" />
                        <h2 className="font-bold text-slate-900">Licitações que precisam da sua atenção</h2>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Vigência e saldo financeiro de postos e oficinas.</p>
                </div>
                {!query.isLoading && (
                    <span className="grid h-8 min-w-8 place-items-center rounded-full bg-amber-50 px-2 text-sm font-black text-amber-700">
                        {alerts.length}
                    </span>
                )}
            </div>

            {query.isLoading ? (
                <div className="grid gap-3 p-5 md:grid-cols-2">
                    {[0, 1].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}
                </div>
            ) : query.error ? (
                <p className="p-5 text-sm text-red-600">Não foi possível carregar os avisos de licitação.</p>
            ) : (
                <div className="grid gap-3 p-5 md:grid-cols-2">
                    {alerts.slice(0, 6).map((alert) => {
                        const copy = alertCopy(alert);
                        const error = alert.severity === 'error';
                        const Icon = alert.partnerKind === 'posto' ? Fuel : Wrench;
                        const target = alert.partnerKind === 'posto'
                            ? `/postos/${alert.partnerId}`
                            : `/oficinas/${alert.partnerId}`;
                        return (
                            <Link
                                key={`${alert.partnerKind}-${alert.partnerId}-${alert.code}`}
                                to={target}
                                className={`group rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${
                                    error ? 'border-red-200 bg-red-50/70' : 'border-amber-200 bg-amber-50/70'
                                }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                                        error ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                    }`}>
                                        {alert.code.startsWith('contract') ? <CalendarClock className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-bold text-slate-900">{copy.title}</p>
                                        <p className="mt-1 text-xs leading-5 text-slate-600">{copy.body}</p>
                                        <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-slate-700">
                                            Ver contrato <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
