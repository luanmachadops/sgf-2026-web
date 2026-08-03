import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
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
import { OrderDetailsModal } from '@/components/partners/workshop/OrderDetailsModal';
import { PartnerPortalLayout, type PartnerNavItem } from '@/components/partners/PartnerPortalLayout';
import { ContractStatusAlerts } from '@/components/partners/ContractStatusAlerts';
import { ContractUsagePanel } from '@/components/procurement/ContractUsageGauge';
import { SGFBadge, SGFButton, SGFCard, SGFKPICard } from '@/components/sgf';
import {
    AlertCircle,
    Clock,
    DollarSign,
    FileText,
    Home,
    Info,
    LayoutDashboard,
    MapPin,
    Phone,
    Receipt,
    RefreshCw,
    User,
    Wrench,
} from '@/components/sgf/icons';
import {
    workshopPortalApi,
    type WorkshopContext,
    type WorkshopDetails,
    type WorkshopOrder,
} from '@/lib/workshop-portal-api';
import {
    procurementApi,
    type PartnerDashboardData,
    type ProcurementContractUsage,
} from '@/lib/procurement-api';
import {
    FINANCIAL_LABELS,
    OPERATIONAL_LABELS,
    nextAction,
    operationalGroup,
} from '@/lib/workshop-status';

const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

type PortalTab = 'dashboard' | 'orders' | 'closing' | 'details';

/** Competência atual no formato do <input type="month">. */
function currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

function tabFromPath(path: string): PortalTab {
    if (path.endsWith('/dados')) return 'details';
    if (path.endsWith('/ordens')) return 'orders';
    if (path.endsWith('/fechamento')) return 'closing';
    return 'dashboard';
}

function safeDate(value: string | null): string {
    if (!value) return 'Não informado';
    const parsed = new Date(`${value}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? '—' : date.format(parsed);
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

function WorkshopDashboard({ usage }: { usage?: ProcurementContractUsage }) {
    const query = useQuery({
        queryKey: ['partner-dashboard', 'oficina'],
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
        name: OPERATIONAL_LABELS[item.status as keyof typeof OPERATIONAL_LABELS] ?? item.status.replaceAll('_', ' '),
    }));
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b'];

    return (
        <div className="space-y-6">
            {usage ? <ContractUsagePanel usage={usage} /> : null}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SGFKPICard
                    title="Ordens em aberto"
                    value={data.metrics.open ?? 0}
                    icon={Wrench}
                    iconColor="text-blue-500"
                    chartColor="#3b82f6"
                    chartData={monthly.map((item) => ({ month: item.month, value: item.count }))}
                />
                <SGFKPICard
                    title="Precisam de atenção"
                    value={data.metrics.attention ?? 0}
                    icon={AlertCircle}
                    iconColor="text-amber-500"
                    chartColor="#f59e0b"
                    chartData={monthly.map((item) => ({ month: item.month, value: item.count }))}
                />
                <SGFKPICard
                    title="Em execução"
                    value={data.metrics.inProgress ?? 0}
                    icon={Clock}
                    iconColor="text-emerald-500"
                    chartColor="#10b981"
                    chartData={monthly.map((item) => ({ month: item.month, value: item.count }))}
                />
                <SGFKPICard
                    title="Faturado no mês"
                    value={currency.format(data.metrics.monthInvoiced ?? 0)}
                    icon={DollarSign}
                    iconColor="text-emerald-600"
                    chartColor="#00A86B"
                    chartData={monthly.map((item) => ({ month: item.month, value: item.amount }))}
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <SGFCard className="lg:col-span-2" padding="lg">
                    <h3 className="font-semibold text-slate-800">Evolução das ordens de serviço</h3>
                    <p className="text-sm text-slate-400">Orçamentos vinculados nos últimos 6 meses</p>
                    <div className="mt-6 h-[300px]">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
                            <AreaChart data={monthly}>
                                <defs>
                                    <linearGradient id="workshopAmount" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#00A86B" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#00A86B" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                                    tickFormatter={(value) => `R$ ${value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}`}
                                />
                                <Tooltip formatter={(value) => currency.format(Number(value))} />
                                <Area type="monotone" dataKey="amount" stroke="#00A86B" strokeWidth={2} fill="url(#workshopAmount)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </SGFCard>

                <SGFCard padding="lg">
                    <h3 className="font-semibold text-slate-800">Situação operacional</h3>
                    <p className="text-sm text-slate-400">Distribuição das ordens vinculadas</p>
                    <div className="mt-4 h-[210px]">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
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
                    <h3 className="font-semibold text-slate-800">Resumo operacional</h3>
                    <p className="text-sm text-slate-400">Indicadores antes da tabela completa de ordens</p>
                </div>
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                        <tr><th className="px-5 py-3">Situação</th><th className="px-5 py-3 text-right">Ordens</th></tr>
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

function OrdersView({
    context,
    selectedOrder,
    requestedOrderId,
    onSelectOrder,
    onCloseOrder,
}: {
    context: WorkshopContext;
    selectedOrder: WorkshopOrder | null;
    requestedOrderId: string | null;
    onSelectOrder: (order: WorkshopOrder) => void;
    onCloseOrder: () => void;
}) {
    const ordersQuery = useQuery({
        queryKey: ['workshop-orders', context.repairShopId],
        queryFn: workshopPortalApi.getOrders,
    });

    const groups = useMemo(() => {
        const result = {
            attention: [] as WorkshopOrder[],
            execution: [] as WorkshopOrder[],
            done: [] as WorkshopOrder[],
        };
        for (const order of ordersQuery.data ?? []) {
            result[operationalGroup(order.operationalStatus)].push(order);
        }
        return result;
    }, [ordersQuery.data]);

    if (ordersQuery.isLoading) return <LoadingCards />;
    if (ordersQuery.error) {
        return <ErrorState message={(ordersQuery.error as Error).message} retry={() => void ordersQuery.refetch()} />;
    }
    const orders = ordersQuery.data ?? [];
    const invoicing = orders.filter((order) => ['invoiced', 'attested'].includes(order.financialStatus)).length;
    const chartData = [
        { month: 'Atenção', value: groups.attention.length },
        { month: 'Execução', value: groups.execution.length },
        { month: 'Finalizadas', value: groups.done.length },
    ];
    const requestedOrder = requestedOrderId
        ? orders.find((order) => order.orderId === requestedOrderId) ?? null
        : null;
    const activeSelectedOrder = selectedOrder
        ? orders.find((order) => order.orderId === selectedOrder.orderId) ?? selectedOrder
        : requestedOrder;

    return (
        <>
            <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <SGFKPICard title="Total de ordens" value={orders.length} icon={Wrench} iconColor="text-blue-500" chartColor="#3b82f6" chartData={chartData} />
                    <SGFKPICard title="Precisam de atenção" value={groups.attention.length} icon={AlertCircle} iconColor="text-amber-500" chartColor="#f59e0b" chartData={chartData} />
                    <SGFKPICard title="Em execução / retirada" value={groups.execution.length} icon={Clock} iconColor="text-emerald-500" chartColor="#10b981" chartData={chartData} />
                    <SGFKPICard title="Em faturamento" value={invoicing} icon={Receipt} iconColor="text-violet-500" chartColor="#8b5cf6" chartData={chartData} />
                </div>

                <SGFCard padding="none" className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1000px] text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                                <tr>
                                    <th className="px-5 py-3">Veículo / serviço</th>
                                    <th className="px-5 py-3">Prioridade</th>
                                    <th className="px-5 py-3">Situação operacional</th>
                                    <th className="px-5 py-3">Financeiro</th>
                                    <th className="px-5 py-3">Próxima etapa</th>
                                    <th className="px-5 py-3 text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {orders.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-5 py-12 text-center">
                                            <p className="font-black text-slate-900">Nenhuma OS vinculada</p>
                                            <p className="mt-1 text-sm text-slate-500">
                                                Novas ordens autorizadas pela prefeitura aparecerão aqui automaticamente.
                                            </p>
                                        </td>
                                    </tr>
                                ) : (
                                    orders.map((order) => {
                                        const priorityVariant = order.priority === 'urgente' || order.priority === 'alta'
                                            ? 'error'
                                            : order.priority === 'normal'
                                                ? 'info'
                                                : 'default';
                                        return (
                                            <tr key={order.orderId} className="hover:bg-slate-50/70">
                                                <td className="px-5 py-4">
                                                    <p className="font-black text-slate-900">{order.plate}</p>
                                                    <p className="text-xs text-slate-500">{order.brand} {order.model} · {order.category}</p>
                                                </td>
                                                <td className="px-5 py-4"><SGFBadge variant={priorityVariant}>{order.priority}</SGFBadge></td>
                                                <td className="px-5 py-4">
                                                    <SGFBadge dot variant={order.operationalStatus === 'received' ? 'success' : order.operationalStatus === 'in_progress' ? 'info' : 'warning'}>
                                                        {OPERATIONAL_LABELS[order.operationalStatus]}
                                                    </SGFBadge>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <SGFBadge variant={order.financialStatus === 'paid' ? 'success' : 'default'}>
                                                        {FINANCIAL_LABELS[order.financialStatus]}
                                                    </SGFBadge>
                                                </td>
                                                <td className="px-5 py-4 font-semibold text-slate-700">
                                                    {nextAction(order.operationalStatus, order.financialStatus)}
                                                </td>
                                                <td className="px-5 py-4 text-right">
                                                    <SGFButton size="sm" variant="outline" onClick={() => onSelectOrder(order)}>Abrir detalhes</SGFButton>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </SGFCard>
            </div>
            {activeSelectedOrder && (
                <OrderDetailsModal
                    order={activeSelectedOrder}
                    context={context}
                    onClose={onCloseOrder}
                    onChanged={() => {
                        onCloseOrder();
                        void ordersQuery.refetch();
                    }}
                />
            )}
        </>
    );
}

function DetailsView({
    context,
    contractUsage,
}: {
    context: WorkshopContext;
    contractUsage?: ProcurementContractUsage;
}) {
    const detailsQuery = useQuery({
        queryKey: ['workshop-details', context.repairShopId],
        queryFn: () => workshopPortalApi.getDetails(context.repairShopId),
        staleTime: 10 * 60_000,
    });

    if (detailsQuery.isLoading) return <LoadingCards />;
    if (detailsQuery.error || !detailsQuery.data) {
        return (
            <ErrorState
                message={(detailsQuery.error as Error)?.message ?? 'Cadastro da oficina não encontrado.'}
                retry={() => void detailsQuery.refetch()}
            />
        );
    }

    const details: WorkshopDetails = detailsQuery.data;
    return (
        <div className="space-y-6">
            {contractUsage ? <ContractUsagePanel usage={contractUsage} /> : null}

            <div className="grid gap-5 lg:grid-cols-3">
            <SGFCard variant="bordered" className="lg:col-span-2" padding="lg">
                <div className="flex items-start gap-4">
                    <div className="h-16 w-24 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        {details.photoUrl ? (
                            <img src={details.photoUrl} alt={details.name} className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center bg-blue-50 text-blue-700">
                                <Wrench className="h-6 w-6" />
                            </div>
                        )}
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Oficina credenciada</p>
                        <h3 className="mt-1 text-xl font-black text-slate-950">{details.name}</h3>
                        <p className="mt-1 text-sm text-slate-500">CNPJ: {details.cnpj || 'não informado'}</p>
                    </div>
                </div>
                <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                        <dt className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                            <MapPin className="h-4 w-4" /> Endereço
                        </dt>
                        <dd className="mt-2 text-sm font-semibold text-slate-800">
                            {[details.address, details.city].filter(Boolean).join(' · ') || 'Não informado'}
                        </dd>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                        <dt className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                            <Phone className="h-4 w-4" /> Telefone
                        </dt>
                        <dd className="mt-2 text-sm font-semibold text-slate-800">{details.phone || 'Não informado'}</dd>
                    </div>
                </dl>
                <div className="mt-5">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Especialidades</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {details.specialties.length > 0
                            ? details.specialties.map((specialty) => <SGFBadge key={specialty} variant="info">{specialty}</SGFBadge>)
                            : <span className="text-sm text-slate-500">Nenhuma especialidade informada.</span>}
                    </div>
                </div>
            </SGFCard>

            <SGFCard variant="bordered" padding="lg">
                <FileText className="h-7 w-7 text-blue-700" />
                <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">Contrato</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">{details.contractNumber || 'Não informado'}</h3>
                <dl className="mt-5 space-y-4 text-sm">
                    <div>
                        <dt className="text-slate-400">Início</dt>
                        <dd className="font-semibold text-slate-800">{safeDate(details.contractStart)}</dd>
                    </div>
                    <div>
                        <dt className="text-slate-400">Vencimento</dt>
                        <dd className="font-semibold text-slate-800">{safeDate(details.contractEnd)}</dd>
                    </div>
                </dl>
                <div className="mt-5 flex gap-2 rounded-2xl bg-blue-50 p-4 text-sm text-blue-700">
                    <Info className="mt-0.5 h-5 w-5 shrink-0" />
                    <p>Alterações cadastrais e contratuais são feitas pela prefeitura.</p>
                </div>
            </SGFCard>
            </div>
        </div>
    );
}


/** Rótulo curto do eixo financeiro, para a coluna da tabela. */
const FIN_LABEL: Record<string, string> = {
    not_started: 'Não iniciado', awaiting_commitment: 'Aguardando empenho',
    committed: 'Empenhado', invoiced: 'Faturado', attested: 'Atestado', paid: 'Pago',
};

/**
 * Fechamento mensal da oficina — o espelho do que o posto já tinha.
 *
 * Responde a pergunta que a empresa faz todo mês: "o que entreguei e quanto
 * tenho a receber?". O saldo é faturado − pago, então pagamento parcial fica
 * visível em vez de sumir num status.
 */
function WorkshopClosing() {
    const [month, setMonth] = useState(currentMonth);
    const summaryQuery = useQuery({
        queryKey: ['workshop-closing', month],
        queryFn: () => workshopPortalApi.getMonthlySummary(month),
    });

    const rows = summaryQuery.data ?? [];
    const totals = rows.reduce(
        (acc, r) => ({
            orders: acc.orders + 1,
            quoted: acc.quoted + r.quotedAmount,
            invoiced: acc.invoiced + r.invoicedAmount,
            attested: acc.attested + r.attestedAmount,
            paid: acc.paid + r.paidAmount,
            balance: acc.balance + r.balance,
        }),
        { orders: 0, quoted: 0, invoiced: 0, attested: 0, paid: 0, balance: 0 },
    );

    if (summaryQuery.error) {
        return <ErrorState message={(summaryQuery.error as Error).message} retry={() => void summaryQuery.refetch()} />;
    }

    return (
        <div className="space-y-5">
            <SGFCard variant="bordered" padding="lg">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Competência</p>
                        <h3 className="mt-1 text-lg font-black text-slate-950">Conferência para faturamento</h3>
                        <p className="mt-1 text-sm text-slate-500">
                            Entram as ordens cujo veículo foi <strong>recebido</strong> pela prefeitura no mês —
                            é quando o serviço passa a ser faturável.
                        </p>
                    </div>
                    <label className="text-sm font-semibold text-slate-700">
                        Mês
                        <input type="month" value={month} max={currentMonth()} onChange={(e) => setMonth(e.target.value)}
                            className="mt-1 block rounded-full border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-[var(--sgf-primary)] focus:ring-4 focus:ring-blue-500/10" />
                    </label>
                </div>
            </SGFCard>

            {summaryQuery.isLoading ? (
                <LoadingCards />
            ) : rows.length === 0 ? (
                <SGFCard className="text-center" padding="xl">
                    <Receipt className="mx-auto h-10 w-10 text-slate-300" />
                    <h3 className="mt-3 font-bold text-slate-900">Nenhum veículo entregue no período</h3>
                    <p className="mt-1 text-sm text-slate-500">Selecione outro mês para consultar.</p>
                </SGFCard>
            ) : (
                <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <SGFCard variant="bordered">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Faturado</p>
                            <p className="mt-2 text-2xl font-black text-slate-950">{currency.format(totals.invoiced)}</p>
                            <p className="mt-1 text-xs text-slate-500">{totals.orders} ordem(ns) no mês</p>
                        </SGFCard>
                        <SGFCard variant="bordered">
                            <p className="text-xs font-bold uppercase tracking-wide text-blue-600">Atestado</p>
                            <p className="mt-2 text-2xl font-black text-blue-800">{currency.format(totals.attested)}</p>
                            <p className="mt-1 text-xs text-slate-500">Liberado para pagamento</p>
                        </SGFCard>
                        <SGFCard variant="bordered">
                            <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Recebido</p>
                            <p className="mt-2 text-2xl font-black text-emerald-800">{currency.format(totals.paid)}</p>
                            <p className="mt-1 text-xs text-slate-500">Pagamentos registrados</p>
                        </SGFCard>
                        <SGFCard variant="bordered">
                            <p className="text-xs font-bold uppercase tracking-wide text-amber-600">A receber</p>
                            <p className="mt-2 text-2xl font-black text-amber-800">{currency.format(totals.balance)}</p>
                            <p className="mt-1 text-xs text-slate-500">Faturado menos pago</p>
                        </SGFCard>
                    </div>

                    <SGFCard padding="none">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[720px] text-sm">
                                <thead className="border-b border-slate-100 text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                                    <tr>
                                        <th className="px-5 py-3">Veículo</th>
                                        <th className="px-5 py-3">Entregue em</th>
                                        <th className="px-5 py-3 text-right">Orçado</th>
                                        <th className="px-5 py-3 text-right">Faturado</th>
                                        <th className="px-5 py-3 text-right">Recebido</th>
                                        <th className="px-5 py-3 text-right">A receber</th>
                                        <th className="px-5 py-3">Situação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {rows.map((r) => (
                                        <tr key={r.orderId}>
                                            <td className="px-5 py-3">
                                                <p className="font-bold text-slate-900">{r.plate ?? '—'}</p>
                                                <p className="text-xs text-slate-500">{r.category ?? '—'}</p>
                                            </td>
                                            <td className="px-5 py-3 text-slate-600">
                                                {r.receivedAt ? date.format(new Date(r.receivedAt)) : '—'}
                                            </td>
                                            <td className="px-5 py-3 text-right tabular-nums text-slate-600">{currency.format(r.quotedAmount)}</td>
                                            <td className="px-5 py-3 text-right tabular-nums font-semibold text-slate-900">{currency.format(r.invoicedAmount)}</td>
                                            <td className="px-5 py-3 text-right tabular-nums text-emerald-700">{currency.format(r.paidAmount)}</td>
                                            <td className={`px-5 py-3 text-right tabular-nums font-bold ${r.balance > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                                                {currency.format(r.balance)}
                                            </td>
                                            <td className="px-5 py-3">
                                                <SGFBadge variant={r.financialStatus === 'paid' ? 'success' : r.financialStatus === 'attested' ? 'info' : 'warning'}>
                                                    {FIN_LABEL[r.financialStatus] ?? r.financialStatus}
                                                </SGFBadge>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SGFCard>
                </>
            )}
        </div>
    );
}


export default function WorkshopPortal() {
    const location = useLocation();
    const navigate = useNavigate();
    const activeTab = tabFromPath(location.pathname);
    const [selectedOrder, setSelectedOrder] = useState<WorkshopOrder | null>(null);
    const requestedOrderId = useMemo(
        () => new URLSearchParams(location.search).get('id')
            ?? new URLSearchParams(location.search).get('orderId'),
        [location.search],
    );

    const openOrder = useCallback((order: WorkshopOrder) => {
        setSelectedOrder(order);
        navigate(`/oficina/ordens?id=${encodeURIComponent(order.orderId)}`, { replace: true });
    }, [navigate]);

    const closeOrder = useCallback(() => {
        setSelectedOrder(null);
        navigate('/oficina/ordens', { replace: true });
    }, [navigate]);

    const contextQuery = useQuery({
        queryKey: ['workshop-context'],
        queryFn: workshopPortalApi.getContext,
        staleTime: 5 * 60_000,
    });
    const context = contextQuery.data;
    const contractQuery = useQuery({
        queryKey: ['partner-contract-status', 'oficina'],
        queryFn: procurementApi.getPartnerContractStatus,
        enabled: Boolean(context),
        staleTime: 30_000,
    });
    const contractStatus = contractQuery.data;
    const contractUsageQuery = useQuery({
        queryKey: ['partner-contract-usage', 'oficina'],
        queryFn: procurementApi.getPartnerContractUsage,
        enabled: Boolean(context),
        staleTime: 30_000,
    });
    const contractUsage = contractUsageQuery.data;

    const navItems: PartnerNavItem[] = [
        { label: 'Dashboard', path: '/oficina', icon: LayoutDashboard, end: true },
        { label: 'Ordens de serviço', path: '/oficina/ordens', icon: Home },
        { label: 'Fechamento', path: '/oficina/fechamento', icon: Receipt },
        { label: 'Meus dados', path: '/oficina/dados', icon: User },
    ];
    const titles: Record<PortalTab, { title: string; description: string }> = {
        dashboard: {
            title: 'Dashboard da oficina',
            description: 'Indicadores de ordens, faturamento, contrato e saldo da licitação.',
        },
        orders: {
            title: 'Ordens de serviço',
            description: 'Acompanhe orçamento, execução, retirada e faturamento de cada veículo.',
        },
        closing: {
            title: 'Fechamento mensal',
            description: 'Confira o que foi entregue no mês e quanto há a receber da prefeitura.',
        },
        details: {
            title: 'Dados da oficina',
            description: 'Consulte cadastro, contrato, saldo e especialidades vinculadas.',
        },
    };
    const page = titles[activeTab];

    return (
        <PartnerPortalLayout
            portal="oficina"
            systemName="Sistema de Manutenção"
            partnerName={context?.repairShopName}
            title={page.title}
            description={page.description}
            navItems={navItems}
            headerMeta={activeTab === 'orders' ? (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Atualização em tempo real
                </div>
            ) : undefined}
        >
            <div className="space-y-6">
                <ContractStatusAlerts status={contractStatus} />
                {contextQuery.isLoading ? (
                    <LoadingCards />
                ) : contextQuery.error || !context ? (
                    <ErrorState
                        message={(contextQuery.error as Error)?.message ?? 'Vínculo da oficina não encontrado.'}
                        retry={() => void contextQuery.refetch()}
                    />
                ) : activeTab === 'dashboard' ? (
                    <WorkshopDashboard usage={contractUsage} />
                ) : activeTab === 'orders' ? (
                    <OrdersView
                        context={context}
                        selectedOrder={selectedOrder}
                        requestedOrderId={requestedOrderId}
                        onSelectOrder={openOrder}
                        onCloseOrder={closeOrder}
                    />
                ) : activeTab === 'closing' ? (
                    <WorkshopClosing />
                ) : (
                    <DetailsView context={context} contractUsage={contractUsage} />
                )}
            </div>
        </PartnerPortalLayout>
    );
}
