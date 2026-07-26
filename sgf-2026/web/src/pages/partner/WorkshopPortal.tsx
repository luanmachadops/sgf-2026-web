import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { OrderDetailsModal } from '@/components/partners/workshop/OrderDetailsModal';
import { PartnerNotificationBell } from '@/components/partners/PartnerNotificationBell';
import { SGFBadge, SGFButton, SGFCard } from '@/components/sgf';
import {
    AlertCircle,
    Calendar,
    CheckCircle,
    FileText,
    Home,
    Info,
    LogOut,
    MapPin,
    Phone,
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
    FINANCIAL_LABELS,
    OPERATIONAL_LABELS,
    nextAction,
    operationalGroup,
} from '@/lib/workshop-status';

const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

type PortalTab = 'orders' | 'details';

function tabFromPath(path: string): PortalTab {
    return path.endsWith('/dados') ? 'details' : 'orders';
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

function OrderCard({ order, onOpen }: { order: WorkshopOrder; onOpen: () => void }) {
    const priorityVariant = order.priority === 'urgente' || order.priority === 'alta'
        ? 'error'
        : order.priority === 'normal'
            ? 'info'
            : 'default';

    return (
        <button type="button" onClick={onOpen} className="h-full text-left">
            <SGFCard hover variant="bordered" className="flex h-full flex-col">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{order.category}</p>
                        <h3 className="mt-1 text-xl font-black text-slate-950">{order.plate}</h3>
                        <p className="truncate text-sm text-slate-500">{order.brand} {order.model}{order.year ? ` · ${order.year}` : ''}</p>
                    </div>
                    <SGFBadge variant={priorityVariant}>{order.priority}</SGFBadge>
                </div>

                <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">{order.description}</p>

                <div className="mt-5 flex flex-wrap gap-2">
                    <SGFBadge dot variant={order.operationalStatus === 'received' ? 'success' : order.operationalStatus === 'in_progress' ? 'info' : 'warning'}>
                        {OPERATIONAL_LABELS[order.operationalStatus]}
                    </SGFBadge>
                    <SGFBadge variant={order.financialStatus === 'paid' ? 'success' : 'default'}>
                        {FINANCIAL_LABELS[order.financialStatus]}
                    </SGFBadge>
                </div>

                <div className="mt-auto pt-5">
                    <div className="rounded-2xl bg-blue-50 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600">Próxima etapa</p>
                        <p className="mt-1 text-sm font-bold text-blue-950">
                            {nextAction(order.operationalStatus, order.financialStatus)}
                        </p>
                    </div>
                    <p className="mt-3 text-xs font-semibold text-blue-700">Abrir detalhes →</p>
                </div>
            </SGFCard>
        </button>
    );
}

function OrderGroup({
    title,
    subtitle,
    orders,
    emptyMessage,
    onOpen,
}: {
    title: string;
    subtitle: string;
    orders: WorkshopOrder[];
    emptyMessage: string;
    onOpen: (order: WorkshopOrder) => void;
}) {
    return (
        <section>
            <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                    <h3 className="text-lg font-black text-slate-950">{title}</h3>
                    <p className="text-sm text-slate-500">{subtitle}</p>
                </div>
                <span className="grid h-8 min-w-8 place-items-center rounded-full bg-white px-2 text-sm font-black text-slate-700 shadow-sm">
                    {orders.length}
                </span>
            </div>
            {orders.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-white/50 p-7 text-center text-sm text-slate-400">
                    {emptyMessage}
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {orders.map((order) => (
                        <OrderCard key={order.orderId} order={order} onOpen={() => onOpen(order)} />
                    ))}
                </div>
            )}
        </section>
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

    return (
        <>
            <div className="space-y-8">
                {(ordersQuery.data ?? []).length === 0 ? (
                    <SGFCard className="text-center" padding="xl">
                        <CheckCircle className="mx-auto h-12 w-12 text-emerald-500" />
                        <h3 className="mt-4 text-lg font-black text-slate-900">Nenhuma OS vinculada</h3>
                        <p className="mt-1 text-sm text-slate-500">
                            Novas ordens autorizadas pela prefeitura aparecerão aqui automaticamente.
                        </p>
                    </SGFCard>
                ) : (
                    <>
                        <OrderGroup
                            title="Sua atenção"
                            subtitle="Orçamentos, empenhos e veículos aguardando uma etapa"
                            orders={groups.attention}
                            emptyMessage="Nenhuma ordem aguardando ação."
                            onOpen={setSelectedOrder}
                        />
                        <OrderGroup
                            title="Em execução"
                            subtitle="Serviços iniciados ou prontos para retirada"
                            orders={groups.execution}
                            emptyMessage="Nenhum serviço em execução."
                            onOpen={setSelectedOrder}
                        />
                        <OrderGroup
                            title="Finalizadas"
                            subtitle="Veículos recebidos pela prefeitura"
                            orders={groups.done}
                            emptyMessage="Nenhuma ordem finalizada."
                            onOpen={setSelectedOrder}
                        />
                    </>
                )}
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

function DetailsView({ context }: { context: WorkshopContext }) {
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
    );
}

export default function WorkshopPortal() {
    const { user, logout } = useAuth();
    const { branding } = useBranding();
    const location = useLocation();
    const navigate = useNavigate();
    const activeTab = tabFromPath(location.pathname);
    const [selectedOrder, setSelectedOrder] = useState<WorkshopOrder | null>(null);

    const contextQuery = useQuery({
        queryKey: ['workshop-context', user?.id],
        queryFn: workshopPortalApi.getContext,
        staleTime: 5 * 60_000,
    });
    const context = contextQuery.data;

    return (
        <div className="min-h-screen bg-[#F5F7F9]">
            <header className="border-b border-white/10 bg-[var(--sgf-dark)] text-white shadow-lg">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/10">
                            {branding.logoUrl || branding.sealUrl ? (
                                <img src={branding.logoUrl || branding.sealUrl} alt="" className="h-full w-full object-contain p-1" />
                            ) : (
                                <Wrench className="h-6 w-6 text-blue-300" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-white/60">{branding.name}</p>
                            <h1 className="truncate text-base font-bold sm:text-lg">Sistema de Manutenção</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {user?.id && <PartnerNotificationBell userId={user.id} fallbackPath="/oficina" />}
                        <button type="button" onClick={() => void logout()}
                            className="flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white">
                            <LogOut className="h-5 w-5" />
                            <span className="hidden sm:inline">Sair</span>
                        </button>
                    </div>
                </div>
            </header>

            <div className="border-b border-slate-200 bg-white">
                <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 py-2 sm:px-6" aria-label="Navegação da oficina">
                    <button type="button" onClick={() => navigate('/oficina')}
                        className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                            activeTab === 'orders'
                                ? 'bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200'
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                        }`}>
                        <Home className="h-4 w-4" /> Ordens de serviço
                    </button>
                    <button type="button" onClick={() => navigate('/oficina/dados')}
                        className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                            activeTab === 'details'
                                ? 'bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200'
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                        }`}>
                        <User className="h-4 w-4" /> Meus dados
                    </button>
                </nav>
            </div>

            <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
                <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">
                            {context?.repairShopName || 'Portal da oficina'}
                        </p>
                        <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                            {activeTab === 'orders' ? 'Ordens de serviço' : 'Dados da oficina'}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            {activeTab === 'orders'
                                ? 'Acompanhe orçamento, execução, retirada e faturamento de cada veículo.'
                                : 'Consulte cadastro, contrato e especialidades vinculadas.'}
                        </p>
                    </div>
                    {activeTab === 'orders' && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                            <RefreshCw className="h-3.5 w-3.5" />
                            Atualização automática a cada 30 s
                        </div>
                    )}
                </div>

                {contextQuery.isLoading ? (
                    <LoadingCards />
                ) : contextQuery.error || !context ? (
                    <ErrorState
                        message={(contextQuery.error as Error)?.message ?? 'Vínculo da oficina não encontrado.'}
                        retry={() => void contextQuery.refetch()}
                    />
                ) : activeTab === 'orders' ? (
                    <OrdersView
                        context={context}
                        selectedOrder={selectedOrder}
                        setSelectedOrder={setSelectedOrder}
                    />
                ) : (
                    <DetailsView context={context} />
                )}
            </main>

            <footer className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-8 text-xs text-slate-400 sm:px-6">
                <span>SGF 2026 · {branding.name}</span>
                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Portal do parceiro</span>
            </footer>
        </div>
    );
}
