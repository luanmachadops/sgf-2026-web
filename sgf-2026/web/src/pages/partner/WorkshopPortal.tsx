import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
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
import { SGFBadge, SGFButton, SGFCard, SGFKPICard } from '@/components/sgf';
import {
    AlertCircle,
    BarChart3,
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
    type PartnerContractStatus,
    type PartnerDashboardData,
} from '@/lib/procurement-api';
import {
    FINANCIAL_LABELS,
    OPERATIONAL_LABELS,
    nextAction,
    operationalGroup,
} from '@/lib/workshop-status';

const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

type PortalTab = 'dashboard' | 'orders' | 'details';

function tabFromPath(path: string): PortalTab {
    if (path.endsWith('/dados')) return 'details';
    if (path.endsWith('/ordens')) return 'orders';
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

function WorkshopDashboard({ status }: { status?: PartnerContractStatus }) {
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
                    title={status?.remainingValue == null ? 'Faturado no mês' : 'Saldo da licitação'}
                    value={currency.format(status?.remainingValue ?? data.metrics.monthInvoiced ?? 0)}
                    icon={DollarSign}
                    iconColor={status?.remainingValue === 0 ? 'text-red-500' : 'text-emerald-600'}
                    chartColor="#00A86B"
                    chartData={monthly.map((item) => ({ month: item.month, value: item.amount }))}
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <SGFCard className="lg:col-span-2" padding="lg">
                    <h3 className="font-semibold text-slate-800">Evolução das ordens de serviço</h3>
                    <p className="text-sm text-slate-400">Orçamentos vinculados nos últimos 6 meses</p>
                    <div className="mt-6 h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
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
    setSelectedOrder,
}: {
    context: WorkshopContext;
    selectedOrder: WorkshopOrder | null;
    setSelectedOrder: (order: WorkshopOrder | null) => void;
}) {
    const ordersQuery = useQuery({
        queryKey: ['workshop-orders', context.repairShopId],
        queryFn: workshopPortalApi.getOrders,
        refetchInterval: 30_000,
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
                                                    <SGFButton size="sm" variant="outline" onClick={() => setSelectedOrder(order)}>Abrir detalhes</SGFButton>
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
            {selectedOrder && (
                <OrderDetailsModal
                    order={selectedOrder}
                    context={context}
                    onClose={() => setSelectedOrder(null)}
                    onChanged={() => {
                        setSelectedOrder(null);
                        void ordersQuery.refetch();
                    }}
                />
            )}
        </>
    );
}

function DetailsView({
    context,
    contractStatus,
}: {
    context: WorkshopContext;
    contractStatus?: PartnerContractStatus;
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SGFKPICard title="Valor da licitação" value={details.contractValue == null ? 'Não informado' : currency.format(details.contractValue)} icon={FileText} iconColor="text-blue-500" />
                <SGFKPICard title="Valor comprometido" value={currency.format(contractStatus?.committedValue ?? 0)} icon={DollarSign} iconColor="text-amber-500" />
                <SGFKPICard title="Saldo disponível" value={contractStatus?.remainingValue == null ? 'Não calculado' : currency.format(contractStatus.remainingValue)} icon={DollarSign} iconColor={contractStatus?.remainingValue === 0 ? 'text-red-500' : 'text-emerald-500'} />
                <SGFKPICard title="Saldo percentual" value={contractStatus?.remainingPercent == null ? '—' : `${contractStatus.remainingPercent.toLocaleString('pt-BR')}%`} icon={BarChart3} iconColor="text-emerald-500" />
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
            <SGFCard variant="bordered" className="lg:col-span-2" padding="lg">
                <div className="flex items-start gap-4">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700">
                        <Wrench className="h-6 w-6" />
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

export default function WorkshopPortal() {
    const location = useLocation();
    const activeTab = tabFromPath(location.pathname);
    const [selectedOrder, setSelectedOrder] = useState<WorkshopOrder | null>(null);

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

    const navItems: PartnerNavItem[] = [
        { label: 'Dashboard', path: '/oficina', icon: LayoutDashboard, end: true },
        { label: 'Ordens de serviço', path: '/oficina/ordens', icon: Home },
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
                        message={(contextQuery.error as Error)?.message ?? 'Vínculo da oficina não encontrado.'}
                        retry={() => void contextQuery.refetch()}
                    />
                ) : activeTab === 'dashboard' ? (
                    <WorkshopDashboard status={contractStatus} />
                ) : activeTab === 'orders' ? (
                    <OrdersView
                        context={context}
                        selectedOrder={selectedOrder}
                        setSelectedOrder={setSelectedOrder}
                    />
                ) : (
                    <DetailsView context={context} contractStatus={contractStatus} />
                )}
            </div>
        </PartnerPortalLayout>
    );
}
