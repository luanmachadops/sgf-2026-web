import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
    Area,
    AreaChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart as RechartsPieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { PartnerPortalLayout, type PartnerNavItem } from '@/components/partners/PartnerPortalLayout';
import { ContractStatusAlerts } from '@/components/partners/ContractStatusAlerts';
import { SGFBadge, SGFButton, SGFCard, SGFInput, SGFKPICard } from '@/components/sgf';
import {
    AlertCircle,
    BarChart3,
    Camera,
    Car,
    CheckCircle,
    Clock,
    DollarSign,
    Droplet,
    FileText,
    Fuel,
    Home,
    Info,
    LayoutDashboard,
    Receipt,
    RefreshCw,
    User,
    X,
} from '@/components/sgf/icons';
import {
    stationPortalApi,
    type StationAuthorization,
    type StationHistoryItem,
    type StationMonthlySummary,
} from '@/lib/station-portal-api';
import {
    procurementApi,
    type PartnerContractStatus,
    type PartnerDashboardData,
} from '@/lib/procurement-api';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
const PAGE_SIZE = 25;

type PortalTab = 'dashboard' | 'pending' | 'history' | 'closing' | 'details';

function isoDate(value: Date): string {
    return value.toISOString().slice(0, 10);
}

function tabFromPath(path: string): PortalTab {
    if (path.endsWith('/autorizacoes')) return 'pending';
    if (path.endsWith('/historico')) return 'history';
    if (path.endsWith('/fechamento')) return 'closing';
    if (path.endsWith('/dados')) return 'details';
    return 'dashboard';
}

function currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function safeDateTime(value: string | null): string {
    if (!value) return 'Sem prazo';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : dateTime.format(parsed);
}

function ErrorState({ message, retry }: { message: string; retry: () => void }) {
    return (
        <SGFCard className="border border-red-100 text-center" padding="xl">
            <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
            <h2 className="mt-3 font-bold text-slate-900">Não foi possível carregar</h2>
            <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">{message}</p>
            <SGFButton className="mt-5" variant="outline" icon={RefreshCw} onClick={retry}>
                Tentar novamente
            </SGFButton>
        </SGFCard>
    );
}

function LoadingCards() {
    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((item) => (
                <div key={item} className="h-64 animate-pulse rounded-3xl bg-white shadow-sm" />
            ))}
        </div>
    );
}

const monthLabel = (key: string) => {
    const [year, month] = key.split('-').map(Number);
    if (!year || !month) return key;
    return new Intl.DateTimeFormat('pt-BR', { month: 'short' })
        .format(new Date(year, month - 1, 1))
        .replace('.', '');
};

const stationStatusLabel: Record<string, string> = {
    autorizado: 'Autorizado',
    concluido: 'Aguardando validação',
    validado: 'Validado',
    rejeitado_admin: 'Rejeitado',
    lancado_direto: 'Lançamento direto',
};

function StationDashboard({ status }: { status?: PartnerContractStatus }) {
    const query = useQuery({
        queryKey: ['partner-dashboard', 'posto'],
        queryFn: procurementApi.getPartnerDashboard,
        staleTime: 30_000,
    });
    if (query.isLoading) return <LoadingCards />;
    if (query.error || !query.data) {
        return <ErrorState message={(query.error as Error)?.message ?? 'Dashboard indisponível.'} retry={() => void query.refetch()} />;
    }

    const data: PartnerDashboardData = query.data;
    const monthly = data.monthly.map((item) => ({ ...item, month: monthLabel(item.key) }));
    const pie = data.statuses.map((item) => ({
        ...item,
        name: stationStatusLabel[item.status] ?? item.status.replaceAll('_', ' '),
    }));
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#64748b'];
    const remaining = status?.remainingValue;

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SGFKPICard
                    title="Autorizações pendentes"
                    value={data.metrics.pending ?? 0}
                    icon={Fuel}
                    iconColor="text-amber-500"
                    chartColor="#f59e0b"
                    chartData={monthly.map((item) => ({ month: item.month, value: item.count }))}
                />
                <SGFKPICard
                    title="Abastecimentos no mês"
                    value={data.metrics.monthCount ?? 0}
                    icon={Receipt}
                    iconColor="text-blue-500"
                    chartColor="#3b82f6"
                    chartData={monthly.map((item) => ({ month: item.month, value: item.count }))}
                />
                <SGFKPICard
                    title="Litros no mês"
                    value={`${number.format(data.metrics.monthLiters ?? 0)} L`}
                    icon={Droplet}
                    iconColor="text-emerald-500"
                    chartColor="#10b981"
                    chartData={monthly.map((item) => ({ month: item.month, value: item.liters ?? 0 }))}
                />
                <SGFKPICard
                    title={remaining == null ? 'Gasto no mês' : 'Saldo da licitação'}
                    value={currency.format(remaining ?? data.metrics.monthAmount ?? 0)}
                    icon={DollarSign}
                    iconColor={remaining != null && remaining <= 0 ? 'text-red-500' : 'text-emerald-600'}
                    chartColor="#00A86B"
                    chartData={monthly.map((item) => ({ month: item.month, value: item.amount }))}
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <SGFCard className="lg:col-span-2" padding="lg">
                    <div>
                        <h3 className="font-semibold text-slate-800">Evolução dos abastecimentos</h3>
                        <p className="text-sm text-slate-400">Valores registrados nos últimos 6 meses</p>
                    </div>
                    <div className="mt-6 h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={monthly}>
                                <defs>
                                    <linearGradient id="stationAmount" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#00A86B" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#00A86B" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }}
                                    tickFormatter={(value) => `R$ ${value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}`} />
                                <Tooltip formatter={(value) => currency.format(Number(value))} />
                                <Area type="monotone" dataKey="amount" stroke="#00A86B" strokeWidth={2} fill="url(#stationAmount)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </SGFCard>

                <SGFCard padding="lg">
                    <h3 className="font-semibold text-slate-800">Situação dos registros</h3>
                    <p className="text-sm text-slate-400">Distribuição do histórico do posto</p>
                    <div className="mt-4 h-[210px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <RechartsPieChart>
                                <Pie data={pie} dataKey="count" nameKey="name" innerRadius={55} outerRadius={82} paddingAngle={3}>
                                    {pie.map((item, index) => <Cell key={item.status} fill={colors[index % colors.length]} />)}
                                </Pie>
                                <Tooltip />
                            </RechartsPieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="space-y-2">
                        {pie.map((item, index) => (
                            <div key={item.status} className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-2 text-slate-500">
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                                    {item.name}
                                </span>
                                <strong className="text-slate-800">{item.count}</strong>
                            </div>
                        ))}
                    </div>
                </SGFCard>
            </div>

            <SGFCard padding="none" className="overflow-hidden">
                <div className="border-b border-slate-100 px-5 py-4">
                    <h3 className="font-semibold text-slate-800">Resumo por situação</h3>
                    <p className="text-sm text-slate-400">Indicadores antes da consulta detalhada</p>
                </div>
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                        <tr><th className="px-5 py-3">Situação</th><th className="px-5 py-3 text-right">Registros</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {pie.map((item) => (
                            <tr key={item.status}>
                                <td className="px-5 py-4 font-semibold text-slate-800">{item.name}</td>
                                <td className="px-5 py-4 text-right font-bold text-slate-900">{item.count}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </SGFCard>
        </div>
    );
}

function FuelingModal({
    authorization,
    tenantId,
    stationId,
    onClose,
}: {
    authorization: StationAuthorization;
    tenantId: string;
    stationId: string;
    onClose: () => void;
}) {
    const queryClient = useQueryClient();
    const [liters, setLiters] = useState('');
    const [odometer, setOdometer] = useState('');
    const [receiptNo, setReceiptNo] = useState('');
    const [photo, setPhoto] = useState<File | null>(null);
    const [error, setError] = useState('');

    const litersValue = Number(liters.replace(',', '.'));
    const odometerValue = Number(odometer);
    const estimatedTotal = Number.isFinite(litersValue) && authorization.pricePerLiter
        ? litersValue * authorization.pricePerLiter
        : 0;

    const mutation = useMutation({
        mutationFn: async () => {
            if (!Number.isFinite(litersValue) || litersValue <= 0) {
                throw new Error('Informe uma quantidade válida de litros.');
            }
            if (authorization.maxLiters != null && litersValue > authorization.maxLiters) {
                throw new Error(`O máximo autorizado é ${number.format(authorization.maxLiters)} L.`);
            }
            if (!Number.isInteger(odometerValue) || odometerValue <= 0) {
                throw new Error('Informe o hodômetro em quilômetros inteiros.');
            }
            if (!receiptNo.trim()) throw new Error('Informe o número do cupom.');
            if (!photo) throw new Error('Tire ou selecione a foto do bico da bomba.');

            return stationPortalApi.completeFueling({
                authorization,
                liters: litersValue,
                odometer: odometerValue,
                receiptNo,
                photo,
                tenantId,
                stationId,
            });
        },
        onSuccess: (result) => {
            void queryClient.invalidateQueries({ queryKey: ['station-pending'] });
            void queryClient.invalidateQueries({ queryKey: ['station-history'] });
            toast.success(`Abastecimento registrado: ${currency.format(result.totalCost)}.`);
            onClose();
        },
        onError: (reason) => setError(reason instanceof Error ? reason.message : 'Falha ao registrar abastecimento.'),
    });

    useEffect(() => {
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !mutation.isPending) onClose();
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [mutation.isPending, onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-6">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="fueling-title"
                className="max-h-[95vh] w-full overflow-y-auto rounded-t-[2rem] bg-white shadow-2xl sm:max-w-xl sm:rounded-[2rem]"
            >
                <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 px-6 py-5 backdrop-blur">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-600">Autorização</p>
                        <h2 id="fueling-title" className="mt-1 text-xl font-bold text-slate-950">
                            Registrar {authorization.plate}
                        </h2>
                        <p className="text-sm text-slate-500">{authorization.brand} {authorization.model}</p>
                    </div>
                    <button
                        type="button"
                        aria-label="Fechar"
                        disabled={mutation.isPending}
                        onClick={onClose}
                        className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form
                    className="space-y-5 p-6"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setError('');
                        mutation.mutate();
                    }}
                >
                    <div className="grid grid-cols-2 gap-3 rounded-2xl bg-amber-50 p-4">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Combustível</p>
                            <p className="mt-1 font-bold capitalize text-slate-900">{authorization.fuelType}</p>
                        </div>
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Limite</p>
                            <p className="mt-1 font-bold text-slate-900">
                                {authorization.maxLiters == null ? 'Sem teto' : `${number.format(authorization.maxLiters)} L`}
                            </p>
                        </div>
                    </div>

                    {error && (
                        <div className="flex gap-2 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                            <p>{error}</p>
                        </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                        <SGFInput
                            label="Litros abastecidos"
                            type="number"
                            inputMode="decimal"
                            min="0.01"
                            step="0.01"
                            max={authorization.maxLiters ?? undefined}
                            value={liters}
                            onChange={(event) => setLiters(event.target.value)}
                            placeholder="0,00"
                            required
                            fullWidth
                        />
                        <SGFInput
                            label="Hodômetro (km)"
                            type="number"
                            inputMode="numeric"
                            min="1"
                            step="1"
                            value={odometer}
                            onChange={(event) => setOdometer(event.target.value)}
                            placeholder="000000"
                            required
                            fullWidth
                        />
                    </div>

                    <SGFInput
                        label="Número do cupom"
                        value={receiptNo}
                        onChange={(event) => setReceiptNo(event.target.value)}
                        maxLength={100}
                        icon={Receipt}
                        placeholder="Número impresso no comprovante"
                        required
                        fullWidth
                    />

                    <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-800">Foto do bico da bomba</label>
                        <label className={`flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed p-4 transition ${
                            photo ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-amber-300 hover:bg-amber-50/50'
                        }`}>
                            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                                photo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                                {photo ? <CheckCircle className="h-6 w-6" /> : <Camera className="h-6 w-6" />}
                            </span>
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-slate-800">
                                    {photo ? photo.name : 'Tirar ou selecionar foto'}
                                </span>
                                <span className="block text-xs text-slate-500">Imagem de até 10 MB</span>
                            </span>
                            <input
                                className="sr-only"
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
                                required
                            />
                        </label>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-4 text-sm">
                            <span className="text-slate-500">Preço contratual</span>
                            <strong className="text-slate-900">
                                {authorization.pricePerLiter == null
                                    ? 'Não cadastrado'
                                    : `${currency.format(authorization.pricePerLiter)}/L`}
                            </strong>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-4 border-t border-slate-200 pt-3">
                            <span className="font-semibold text-slate-600">Total calculado</span>
                            <strong className="text-xl text-slate-950">{currency.format(estimatedTotal)}</strong>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">
                            Preço e total são calculados pelo contrato no servidor e não podem ser alterados aqui.
                        </p>
                    </div>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <SGFButton type="button" variant="ghost" disabled={mutation.isPending} onClick={onClose}>
                            Cancelar
                        </SGFButton>
                        <SGFButton type="submit" loading={mutation.isPending} icon={Fuel}>
                            Confirmar abastecimento
                        </SGFButton>
                    </div>
                </form>
            </div>
        </div>
    );
}

function PendingAuthorizations({
    tenantId,
    stationId,
    contractStatus,
}: {
    tenantId: string;
    stationId: string;
    contractStatus?: PartnerContractStatus;
}) {
    const [selected, setSelected] = useState<StationAuthorization | null>(null);
    const query = useQuery({
        queryKey: ['station-pending'],
        queryFn: stationPortalApi.getPending,
        refetchInterval: 30_000,
        staleTime: 10_000,
    });

    if (query.isLoading) return <LoadingCards />;
    if (query.error) {
        return <ErrorState message={(query.error as Error).message} retry={() => void query.refetch()} />;
    }
    const authorizations = query.data ?? [];
    const estimatedAmount = authorizations.reduce(
        (sum, item) => sum + (item.maxLiters ?? 0) * (item.pricePerLiter ?? 0),
        0,
    );
    const estimatedLiters = authorizations.reduce((sum, item) => sum + (item.maxLiters ?? 0), 0);
    const nextExpiry = authorizations
        .map((item) => item.expiresAt)
        .filter((value): value is string => Boolean(value))
        .sort()[0];
    const chartData = authorizations.slice(0, 6).map((item) => ({
        month: item.plate,
        value: item.maxLiters ?? 0,
    }));

    return (
        <>
            <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SGFKPICard title="Aguardando" value={authorizations.length} icon={Clock} iconColor="text-amber-500" chartColor="#f59e0b" chartData={chartData} />
                <SGFKPICard title="Volume autorizado" value={`${number.format(estimatedLiters)} L`} icon={Droplet} iconColor="text-blue-500" chartColor="#3b82f6" chartData={chartData} />
                <SGFKPICard title="Valor reservado" value={currency.format(estimatedAmount)} icon={DollarSign} iconColor="text-emerald-500" chartColor="#10b981" chartData={chartData} />
                <SGFKPICard title="Próximo vencimento" value={nextExpiry ? safeDateTime(nextExpiry) : 'Sem pendências'} icon={Clock} iconColor="text-slate-500" />
            </div>

            <SGFCard padding="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                            <tr>
                                <th className="px-5 py-3">Veículo</th>
                                <th className="px-5 py-3">Combustível</th>
                                <th className="px-5 py-3">Limite</th>
                                <th className="px-5 py-3">Preço</th>
                                <th className="px-5 py-3">Expira</th>
                                <th className="px-5 py-3 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {authorizations.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-5 py-12 text-center">
                                        <CheckCircle className="mx-auto h-10 w-10 text-emerald-500" />
                                        <p className="mt-3 font-bold text-slate-900">Tudo em dia</p>
                                        <p className="mt-1 text-sm text-slate-500">
                                            Não há autorizações aguardando abastecimento neste posto.
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                authorizations.map((item) => {
                                    const operationBlocked = contractStatus && !contractStatus.canExecuteExisting;
                                    const disabled = operationBlocked || item.pricePerLiter == null;
                                    return (
                                        <tr key={item.fuelingId} className="hover:bg-slate-50/70">
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
                                                        <Car className="h-5 w-5" />
                                                    </div>
                                                    <div>
                                                        <p className="font-black text-slate-900">{item.plate}</p>
                                                        <p className="text-xs text-slate-500">{item.brand} {item.model}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 capitalize text-slate-700">{item.fuelType}</td>
                                            <td className="px-5 py-4 font-semibold text-slate-800">
                                                {item.maxLiters == null ? 'Sem teto' : `${number.format(item.maxLiters)} L`}
                                            </td>
                                            <td className="px-5 py-4 text-slate-700">
                                                {item.pricePerLiter == null ? 'Não cadastrado' : `${currency.format(item.pricePerLiter)}/L`}
                                            </td>
                                            <td className="px-5 py-4 text-slate-700">{safeDateTime(item.expiresAt)}</td>
                                            <td className="px-5 py-4 text-right">
                                                <SGFButton
                                                    size="sm"
                                                    icon={Fuel}
                                                    disabled={disabled}
                                                    title={operationBlocked ? contractStatus?.blockMessage ?? undefined : undefined}
                                                    onClick={() => setSelected(item)}
                                                >
                                                    {operationBlocked
                                                        ? contractStatus?.blockTitle ?? 'Operação bloqueada'
                                                        : item.pricePerLiter == null
                                                            ? 'Preço não cadastrado'
                                                            : 'Registrar'}
                                                </SGFButton>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </SGFCard>

            {selected && (
                <FuelingModal
                    authorization={selected}
                    tenantId={tenantId}
                    stationId={stationId}
                    onClose={() => setSelected(null)}
                />
            )}
        </>
    );
}

function historyStatus(item: StationHistoryItem): {
    label: string;
    variant: 'success' | 'warning' | 'error' | 'default';
} {
    if (item.workflowStatus === 'validado') return { label: 'Validado', variant: 'success' };
    if (item.workflowStatus === 'rejeitado_admin') return { label: 'Rejeitado', variant: 'error' };
    if (item.workflowStatus === 'concluido') return { label: 'Aguardando validação', variant: 'warning' };
    return { label: item.workflowStatus.replaceAll('_', ' '), variant: 'default' };
}

function StationHistory() {
    const today = useMemo(() => new Date(), []);
    const initialFrom = useMemo(() => {
        const value = new Date(today);
        value.setDate(value.getDate() - 30);
        return isoDate(value);
    }, [today]);
    const [from, setFrom] = useState(initialFrom);
    const [to, setTo] = useState(isoDate(today));
    const [page, setPage] = useState(0);

    const query = useQuery({
        queryKey: ['station-history', from, to, page],
        queryFn: () => stationPortalApi.getHistory({ from, to, page, pageSize: PAGE_SIZE }),
        placeholderData: (previous) => previous,
    });

    const items = query.data?.items ?? [];
    const total = query.data?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const pageLiters = items.reduce((sum, item) => sum + item.liters, 0);
    const pageAmount = items.reduce((sum, item) => sum + item.totalCost, 0);
    const anomalyCount = items.filter((item) => item.hasAnomaly || item.workflowStatus === 'rejeitado_admin').length;
    const historyChart = [...items].reverse().slice(-6).map((item) => ({
        month: item.plate,
        value: item.totalCost,
    }));

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SGFKPICard title="Registros no período" value={total} icon={Receipt} iconColor="text-blue-500" chartColor="#3b82f6" chartData={historyChart} />
                <SGFKPICard title="Litros nesta página" value={`${number.format(pageLiters)} L`} icon={Droplet} iconColor="text-emerald-500" chartColor="#10b981" chartData={historyChart} />
                <SGFKPICard title="Valor nesta página" value={currency.format(pageAmount)} icon={DollarSign} iconColor="text-emerald-600" chartColor="#00A86B" chartData={historyChart} />
                <SGFKPICard title="Com ressalva nesta página" value={anomalyCount} icon={AlertCircle} iconColor={anomalyCount > 0 ? 'text-red-500' : 'text-slate-400'} chartColor="#ef4444" />
            </div>

            <SGFCard className="border border-slate-100 shadow-sm">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <SGFInput label="De" type="date" value={from} max={to} onChange={(event) => {
                        setFrom(event.target.value);
                        setPage(0);
                    }} fullWidth />
                    <SGFInput label="Até" type="date" value={to} min={from} max={isoDate(today)} onChange={(event) => {
                        setTo(event.target.value);
                        setPage(0);
                    }} fullWidth />
                    <SGFButton variant="outline" icon={RefreshCw} loading={query.isFetching} onClick={() => void query.refetch()}>
                        Atualizar
                    </SGFButton>
                </div>
            </SGFCard>

            {query.isLoading ? <LoadingCards /> : query.error ? (
                <ErrorState message={(query.error as Error).message} retry={() => void query.refetch()} />
            ) : items.length === 0 ? (
                <SGFCard className="border border-dashed border-slate-200 text-center" padding="xl">
                    <Clock className="mx-auto h-11 w-11 text-slate-300" />
                    <h2 className="mt-3 font-bold text-slate-900">Nenhum registro no período</h2>
                    <p className="mt-1 text-sm text-slate-500">Ajuste as datas para consultar outros abastecimentos.</p>
                </SGFCard>
            ) : (
                <>
                    <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
                        <div className="hidden grid-cols-[1.3fr_1fr_1fr_1fr_1fr] gap-4 border-b border-slate-100 bg-slate-50 px-6 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 lg:grid">
                            <span>Veículo</span><span>Data</span><span>Quantidade</span><span>Total</span><span>Situação</span>
                        </div>
                        {items.map((item) => {
                            const status = historyStatus(item);
                            return (
                                <div key={item.fuelingId} className="grid gap-3 border-b border-slate-100 px-5 py-4 last:border-0 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr] lg:items-center lg:gap-4 lg:px-6">
                                    <div>
                                        <p className="font-black text-slate-900">{item.plate}</p>
                                        <p className="text-xs text-slate-500">{item.brand} {item.model} · <span className="capitalize">{item.fuelType}</span></p>
                                    </div>
                                    <div className="flex items-center justify-between text-sm lg:block">
                                        <span className="text-xs font-semibold text-slate-400 lg:hidden">Data</span>
                                        <span className="text-slate-700">{safeDateTime(item.filledAt)}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm lg:block">
                                        <span className="text-xs font-semibold text-slate-400 lg:hidden">Quantidade</span>
                                        <span className="font-semibold text-slate-700">{number.format(item.liters)} L</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm lg:block">
                                        <span className="text-xs font-semibold text-slate-400 lg:hidden">Total</span>
                                        <span className="font-semibold text-slate-900">{currency.format(item.totalCost)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 lg:block">
                                        <span className="text-xs font-semibold text-slate-400 lg:hidden">Situação</span>
                                        <SGFBadge variant={status.variant}>{status.label}</SGFBadge>
                                    </div>
                                    {item.rejectionReason && (
                                        <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 lg:col-span-5">
                                            <strong>Motivo:</strong> {item.rejectionReason}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <p className="text-xs text-slate-500">{total} registro{total === 1 ? '' : 's'} no período</p>
                        <div className="flex items-center gap-2">
                            <SGFButton variant="ghost" size="sm" disabled={page === 0 || query.isFetching} onClick={() => setPage((value) => value - 1)}>
                                Anterior
                            </SGFButton>
                            <span className="text-xs font-semibold text-slate-500">{page + 1} / {pages}</span>
                            <SGFButton variant="ghost" size="sm" disabled={page + 1 >= pages || query.isFetching} onClick={() => setPage((value) => value + 1)}>
                                Próxima
                            </SGFButton>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function StationDetails({
    stationId,
    contractStatus,
}: {
    stationId: string;
    contractStatus?: PartnerContractStatus;
}) {
    const query = useQuery({
        queryKey: ['station-details', stationId],
        queryFn: () => stationPortalApi.getDetails(stationId),
    });

    if (query.isLoading) return <LoadingCards />;
    if (query.error || !query.data) {
        return <ErrorState message={(query.error as Error)?.message ?? 'Cadastro não encontrado.'} retry={() => void query.refetch()} />;
    }

    const station = query.data;
    const prices = station.fuelPrices && typeof station.fuelPrices === 'object' && !Array.isArray(station.fuelPrices)
        ? Object.entries(station.fuelPrices)
        : [];

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SGFKPICard title="Valor da licitação" value={station.contractValue == null ? 'Não informado' : currency.format(station.contractValue)} icon={FileText} iconColor="text-blue-500" />
                <SGFKPICard title="Valor comprometido" value={currency.format(contractStatus?.committedValue ?? 0)} icon={DollarSign} iconColor="text-amber-500" />
                <SGFKPICard title="Saldo disponível" value={contractStatus?.remainingValue == null ? 'Não calculado' : currency.format(contractStatus.remainingValue)} icon={DollarSign} iconColor={contractStatus?.remainingValue === 0 ? 'text-red-500' : 'text-emerald-500'} />
                <SGFKPICard title="Saldo percentual" value={contractStatus?.remainingPercent == null ? '—' : `${number.format(contractStatus.remainingPercent)}%`} icon={BarChart3} iconColor="text-emerald-500" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
            <SGFCard className="border border-slate-100 shadow-sm" padding="lg">
                <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-amber-700">
                        <User className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Fornecedor</p>
                        <h2 className="font-bold text-slate-900">{station.name}</h2>
                    </div>
                </div>
                <dl className="mt-5 space-y-3 text-sm">
                    {[
                        ['CNPJ', station.cnpj],
                        ['Telefone', station.phone],
                        ['Cidade', station.city],
                        ['Endereço', station.address],
                    ].map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-4 border-b border-slate-100 pb-3 last:border-0">
                            <dt className="text-slate-500">{label}</dt>
                            <dd className="text-right font-semibold text-slate-800">{value || '—'}</dd>
                        </div>
                    ))}
                </dl>
            </SGFCard>

            <SGFCard className="border border-slate-100 shadow-sm" padding="lg">
                <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700">
                        <FileText className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Contrato</p>
                        <h2 className="font-bold text-slate-900">{station.contractNumber || 'Sem número informado'}</h2>
                    </div>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                        <dt className="text-xs text-slate-500">Início</dt>
                        <dd className="mt-1 font-bold text-slate-800">{station.contractStart ? date.format(new Date(`${station.contractStart}T12:00:00`)) : '—'}</dd>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                        <dt className="text-xs text-slate-500">Vencimento</dt>
                        <dd className="mt-1 font-bold text-slate-800">{station.contractEnd ? date.format(new Date(`${station.contractEnd}T12:00:00`)) : '—'}</dd>
                    </div>
                </dl>
            </SGFCard>

            <SGFCard className="border border-slate-100 shadow-sm lg:col-span-2" padding="lg">
                <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                        <Droplet className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Preços vigentes</p>
                        <h2 className="font-bold text-slate-900">Valores definidos no contrato</h2>
                    </div>
                </div>
                {prices.length === 0 ? (
                    <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">
                        Nenhum preço foi cadastrado. Procure a prefeitura antes de abastecer.
                    </p>
                ) : (
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {prices.map(([fuelType, value]) => (
                            <div key={fuelType} className="rounded-2xl border border-slate-100 p-4">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{fuelType}</p>
                                <p className="mt-1 text-xl font-black text-slate-900">
                                    {currency.format(Number(value))}<span className="text-xs font-medium text-slate-400"> / litro</span>
                                </p>
                            </div>
                        ))}
                    </div>
                )}
                <div className="mt-5 flex gap-2 rounded-2xl bg-blue-50 p-4 text-sm text-blue-700">
                    <Info className="mt-0.5 h-5 w-5 shrink-0" />
                    <p>Alterações de preço são feitas pela prefeitura. O valor aplicado a cada abastecimento é calculado no servidor.</p>
                </div>
            </SGFCard>
            </div>
        </div>
    );
}

function summaryTotals(rows: StationMonthlySummary[]) {
    return rows.reduce((total, row) => ({
        count: total.count + row.totalCount,
        liters: total.liters + row.totalLiters,
        amount: total.amount + row.totalAmount,
        pending: total.pending + row.pendingCount,
        pendingAmount: total.pendingAmount + row.pendingAmount,
        validated: total.validated + row.validatedCount,
        validatedAmount: total.validatedAmount + row.validatedAmount,
        rejected: total.rejected + row.rejectedCount,
    }), {
        count: 0,
        liters: 0,
        amount: 0,
        pending: 0,
        pendingAmount: 0,
        validated: 0,
        validatedAmount: 0,
        rejected: 0,
    });
}

function StationClosing() {
    const [month, setMonth] = useState(currentMonth);
    const summaryQuery = useQuery({
        queryKey: ['station-closing', month],
        queryFn: () => stationPortalApi.getMonthlySummary(month),
    });
    const totals = summaryTotals(summaryQuery.data ?? []);

    if (summaryQuery.error) {
        return (
            <ErrorState
                message={(summaryQuery.error as Error).message}
                retry={() => void summaryQuery.refetch()}
            />
        );
    }

    return (
        <div className="space-y-5">
            <SGFCard variant="bordered" padding="lg">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Competência</p>
                        <h3 className="mt-1 text-lg font-black text-slate-950">Conferência para faturamento</h3>
                        <p className="mt-1 text-sm text-slate-500">
                            O valor validado é a base para conferir a nota fiscal com a prefeitura.
                        </p>
                    </div>
                    <label className="text-sm font-semibold text-slate-700">
                        Mês
                        <input type="month" value={month} max={currentMonth()} onChange={(event) => setMonth(event.target.value)}
                            className="mt-1 block rounded-full border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-[var(--sgf-primary)] focus:ring-4 focus:ring-emerald-500/10" />
                    </label>
                </div>
            </SGFCard>

            {summaryQuery.isLoading ? (
                <LoadingCards />
            ) : (summaryQuery.data ?? []).length === 0 ? (
                <SGFCard className="text-center" padding="xl">
                    <Receipt className="mx-auto h-10 w-10 text-slate-300" />
                    <h3 className="mt-3 font-bold text-slate-900">Nenhum abastecimento no período</h3>
                    <p className="mt-1 text-sm text-slate-500">Selecione outro mês para consultar.</p>
                </SGFCard>
            ) : (
                <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <SGFCard variant="bordered">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Apresentado</p>
                            <p className="mt-2 text-2xl font-black text-slate-950">{currency.format(totals.amount)}</p>
                            <p className="mt-1 text-xs text-slate-500">{number.format(totals.liters)} L · {totals.count} registros</p>
                        </SGFCard>
                        <SGFCard variant="bordered">
                            <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Validado</p>
                            <p className="mt-2 text-2xl font-black text-emerald-800">{currency.format(totals.validatedAmount)}</p>
                            <p className="mt-1 text-xs text-slate-500">{totals.validated} registros</p>
                        </SGFCard>
                        <SGFCard variant="bordered">
                            <p className="text-xs font-bold uppercase tracking-wide text-amber-600">Em conferência</p>
                            <p className="mt-2 text-2xl font-black text-amber-800">{currency.format(totals.pendingAmount)}</p>
                            <p className="mt-1 text-xs text-slate-500">{totals.pending} registros</p>
                        </SGFCard>
                        <SGFCard variant="bordered">
                            <p className="text-xs font-bold uppercase tracking-wide text-red-600">Rejeitados</p>
                            <p className="mt-2 text-2xl font-black text-red-700">{totals.rejected}</p>
                            <p className="mt-1 text-xs text-slate-500">Não entram no faturamento</p>
                        </SGFCard>
                    </div>

                    <SGFCard variant="bordered" padding="none" className="overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[680px] text-sm">
                                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                                    <tr>
                                        <th className="px-5 py-3">Combustível</th>
                                        <th className="px-5 py-3 text-right">Litros</th>
                                        <th className="px-5 py-3 text-right">Apresentado</th>
                                        <th className="px-5 py-3 text-right">Validado</th>
                                        <th className="px-5 py-3 text-right">Em conferência</th>
                                        <th className="px-5 py-3 text-right">Rejeitados</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {summaryQuery.data?.map((row) => (
                                        <tr key={row.fuelType}>
                                            <td className="px-5 py-4 font-bold capitalize text-slate-900">{row.fuelType}</td>
                                            <td className="px-5 py-4 text-right text-slate-600">{number.format(row.totalLiters)} L</td>
                                            <td className="px-5 py-4 text-right font-semibold text-slate-900">{currency.format(row.totalAmount)}</td>
                                            <td className="px-5 py-4 text-right text-emerald-700">{currency.format(row.validatedAmount)}</td>
                                            <td className="px-5 py-4 text-right text-amber-700">{currency.format(row.pendingAmount)}</td>
                                            <td className="px-5 py-4 text-right text-red-700">{row.rejectedCount}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SGFCard>

                    {totals.pending > 0 && (
                        <div className="flex gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
                            <Info className="mt-0.5 h-5 w-5 shrink-0" />
                            <p>Existem lançamentos aguardando validação. Aguarde a conferência antes de emitir a NF definitiva.</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default function StationPortal() {
    const location = useLocation();
    const activeTab = tabFromPath(location.pathname);

    const contextQuery = useQuery({
        queryKey: ['station-context'],
        queryFn: stationPortalApi.getContext,
        staleTime: 5 * 60_000,
    });
    const context = contextQuery.data;
    const contractQuery = useQuery({
        queryKey: ['partner-contract-status', 'posto'],
        queryFn: procurementApi.getPartnerContractStatus,
        enabled: Boolean(context),
        staleTime: 30_000,
    });
    const contractStatus = contractQuery.data;

    const navItems: PartnerNavItem[] = [
        { label: 'Dashboard', path: '/posto', icon: LayoutDashboard, end: true },
        { label: 'Autorizações', path: '/posto/autorizacoes', icon: Home },
        { label: 'Histórico', path: '/posto/historico', icon: Clock },
        { label: 'Fechamento', path: '/posto/fechamento', icon: Receipt },
        { label: 'Meus dados', path: '/posto/dados', icon: User },
    ];
    const titles: Record<PortalTab, { title: string; description: string }> = {
        dashboard: {
            title: 'Dashboard do posto',
            description: 'Indicadores de abastecimento, contrato e situação financeira.',
        },
        pending: {
            title: 'Autorizações pendentes',
            description: 'Registre apenas abastecimentos previamente autorizados pela prefeitura.',
        },
        history: {
            title: 'Histórico de abastecimentos',
            description: 'Consulte todos os registros anteriores, mesmo após o fim do contrato.',
        },
        closing: {
            title: 'Fechamento mensal',
            description: 'Confira volumes e valores validados antes de emitir a nota fiscal.',
        },
        details: {
            title: 'Dados do fornecedor',
            description: 'Consulte cadastro, licitação, vigência, saldo e preços contratados.',
        },
    };
    const page = titles[activeTab];

    return (
        <PartnerPortalLayout
            portal="posto"
            systemName="Sistema de Abastecimento"
            partnerName={context?.stationName}
            title={page.title}
            description={page.description}
            navItems={navItems}
            headerMeta={activeTab === 'pending' ? (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Atualização automática a cada 30 s
                </div>
            ) : undefined}
        >
            <div className="space-y-6">
                <ContractStatusAlerts status={contractStatus} />
                {contextQuery.isLoading ? (
                    <LoadingCards />
                ) : contextQuery.error || !context ? (
                    <ErrorState
                        message={(contextQuery.error as Error)?.message ?? 'Vínculo do posto não encontrado.'}
                        retry={() => void contextQuery.refetch()}
                    />
                ) : activeTab === 'dashboard' ? (
                    <StationDashboard status={contractStatus} />
                ) : activeTab === 'pending' ? (
                    <PendingAuthorizations
                        tenantId={context.tenantId}
                        stationId={context.stationId}
                        contractStatus={contractStatus}
                    />
                ) : activeTab === 'history' ? (
                    <StationHistory />
                ) : activeTab === 'closing' ? (
                    <StationClosing />
                ) : (
                    <StationDetails stationId={context.stationId} contractStatus={contractStatus} />
                )}
            </div>
        </PartnerPortalLayout>
    );
}
