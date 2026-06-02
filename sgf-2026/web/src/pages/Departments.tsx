import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
    ArrowLeft,
    BarChart3,
    Building2,
    Car,
    DollarSign,
    Fuel,
    Gauge,
    Pencil,
    Plus,
    Route,
    ShieldAlert,
    Users,
    UserSquare2,
    Wrench,
} from '@/components/sgf/icons';
import { DepartmentFormModal } from '@/components/departments/DepartmentFormModal';
import type { Tables } from '@/types/database.types';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { useHeader } from '@/contexts/HeaderContext';
import {
    departmentsApi,
    type DepartmentDetail,
    type DepartmentOverview,
} from '@/lib/supabase-api';
import {
    cn,
    formatCurrency,
    formatDate,
    formatDistance,
    formatDistanceToNow,
    getStatusLabel,
} from '@/lib/utils';
import {
    SGFBadge,
    SGFButton,
    SGFCard,
    SGFKPICard,
    SGFTable,
    PeriodSelect,
    makePeriod,
    resolvePeriod,
    type PeriodValue,
} from '@/components/sgf';

const fuelTypeColors = ['#00A86B', '#3B82F6', '#F59E0B', '#F97316', '#8B5CF6', '#EC4899'];

function Metric({
    icon: Icon,
    tint,
    label,
    value,
}: {
    icon: typeof Car;
    tint: string;
    label: string;
    value: string | number;
}) {
    return (
        <div className="flex items-center gap-2.5">
            <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tint)}>
                <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-slate-400">{label}</p>
                <p className="truncate text-sm font-semibold text-slate-900">{value}</p>
            </div>
        </div>
    );
}

const CHART_PERIOD_OPTIONS = [
    { value: '1', label: 'Mês atual' },
    { value: '3', label: 'Últimos 3 meses' },
    { value: '6', label: 'Últimos 6 meses' },
    { value: '12', label: 'Últimos 12 meses' },
];

type ChartTooltipProps = {
    active?: boolean;
    payload?: Array<{ payload: DepartmentOverview }>;
};

function FuelTooltip({ active, payload }: ChartTooltipProps) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <div className="min-w-[180px] rounded-2xl border border-slate-100 bg-white p-4 shadow-xl">
            <p className="mb-3 border-b border-slate-50 pb-2 text-sm font-bold text-slate-800">{d.name}</p>
            <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">Gasto com combustível</span>
                    <span className="font-bold text-emerald-600">{formatCurrency(d.fuelCost)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">Litros</span>
                    <span className="font-semibold text-slate-800">{d.fuelLiters.toLocaleString('pt-BR')} L</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">Rodagem</span>
                    <span className="font-semibold text-slate-800">{formatDistance(d.totalTripKm)}</span>
                </div>
            </div>
        </div>
    );
}

function MaintenanceTooltip({ active, payload }: ChartTooltipProps) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <div className="min-w-[180px] rounded-2xl border border-slate-100 bg-white p-4 shadow-xl">
            <p className="mb-3 border-b border-slate-50 pb-2 text-sm font-bold text-slate-800">{d.name}</p>
            <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">Ordens de serviço</span>
                    <span className="font-bold text-amber-600">{d.maintenanceCount}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">Pendentes / em execução</span>
                    <span className="font-semibold text-slate-800">{d.pendingMaintenances}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">Veículos em manutenção</span>
                    <span className="font-semibold text-slate-800">{d.maintenanceVehicles}</span>
                </div>
            </div>
        </div>
    );
}

function DepartmentOverviewPage() {
    const navigate = useNavigate();
    const { setTitle, setDescription, setSearchPlaceholder, setSearchHandler, setHeaderAction } = useHeader();
    const [searchTerm, setSearchTerm] = useState('');
    const [isFormOpen, setFormOpen] = useState(false);

    const { data = [], isLoading } = useQuery({
        queryKey: ['departments', 'operational-overview'],
        queryFn: () => departmentsApi.getOperationalOverview(),
    });

    // Período dos gráficos (igual aos gráficos do dashboard).
    const [chartPeriod, setChartPeriod] = useState<PeriodValue>(() => makePeriod('6'));
    const resolvedChartPeriod = resolvePeriod(chartPeriod);
    const { data: chartSource = [] } = useQuery({
        queryKey: ['departments', 'operational-overview', 'charts', resolvedChartPeriod],
        queryFn: () => departmentsApi.getOperationalOverview(resolvedChartPeriod.monthsBack, {
            from: resolvedChartPeriod.from,
            to: resolvedChartPeriod.to,
        }),
    });

    useEffect(() => {
        setTitle('Secretarias');
        setDescription('Consumo detalhado e visão operacional de cada pasta.');
        setSearchPlaceholder('Pesquisar secretaria ou código...');
        setSearchHandler((term) => setSearchTerm(term.trim().toLowerCase()));
        setHeaderAction(
            <SGFButton variant="primary" onClick={() => setFormOpen(true)} icon={Plus} className="!rounded-full !h-[37px]">
                Nova secretaria
            </SGFButton>
        );
        return () => {
            setSearchHandler(() => { });
            setHeaderAction(null);
        };
    }, [setDescription, setHeaderAction, setSearchHandler, setSearchPlaceholder, setTitle]);

    const filtered = useMemo(() => {
        if (!searchTerm) return data;
        return data.filter((item) =>
            item.name.toLowerCase().includes(searchTerm) ||
            item.code.toLowerCase().includes(searchTerm),
        );
    }, [data, searchTerm]);

    const totalVehicles = filtered.reduce((sum, item) => sum + item.vehicleCount, 0);
    const totalDrivers = filtered.reduce((sum, item) => sum + item.driverCount, 0);
    const totalFuelCost = filtered.reduce((sum, item) => sum + item.fuelCost, 0);
    const totalTripKm = filtered.reduce((sum, item) => sum + item.totalTripKm, 0);

    // Dados dos gráficos vêm da query com período aplicado, respeitando a busca.
    const chartFiltered = useMemo(() => {
        if (!searchTerm) return chartSource;
        return chartSource.filter((item) =>
            item.name.toLowerCase().includes(searchTerm) ||
            item.code.toLowerCase().includes(searchTerm),
        );
    }, [chartSource, searchTerm]);

    const fuelChartData = [...chartFiltered].sort((a, b) => b.fuelCost - a.fuelCost).slice(0, 8);
    const maintChartData = [...chartFiltered].sort((a, b) => b.maintenanceCount - a.maintenanceCount).slice(0, 8);

    if (isLoading) {
        return (
            <div className="space-y-8">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-36 animate-pulse rounded-[var(--sgf-card-radius)] bg-slate-100" />
                    ))}
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-52 animate-pulse rounded-[var(--sgf-card-radius)] bg-slate-100" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* KPIs */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
                <SGFKPICard title="Secretarias monitoradas" value={filtered.length} icon={Building2} iconColor="text-emerald-500" />
                <SGFKPICard title="Veículos vinculados" value={totalVehicles} icon={Car} iconColor="text-blue-500" />
                <SGFKPICard title="Motoristas vinculados" value={totalDrivers} icon={UserSquare2} iconColor="text-amber-500" />
                <SGFKPICard title="Consumo acumulado" value={formatCurrency(totalFuelCost)} icon={Fuel} iconColor="text-rose-500" />
            </div>

            {/* Gráficos comparativos: consumo de combustível + manutenções */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                {/* Consumo de combustível */}
                <SGFCard padding="lg" className="border border-slate-200/80">
                    <div className="mb-6 flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Consumo de combustível</h3>
                            <p className="text-sm text-slate-500">Gasto com abastecimento por secretaria.</p>
                        </div>
                        <PeriodSelect value={chartPeriod} onChange={setChartPeriod} className="shrink-0" />
                    </div>
                    <div className="h-[360px] w-full">
                        {fuelChartData.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-sm text-slate-400">Sem dados no período.</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={fuelChartData} layout="vertical" margin={{ top: 6, right: 12, left: 0, bottom: 6 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                                    <XAxis type="number" hide />
                                    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={120} tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }} />
                                    <Tooltip cursor={{ fill: '#f8fafc' }} content={<FuelTooltip />} />
                                    <Bar dataKey="fuelCost" radius={[0, 10, 10, 0]} barSize={18}>
                                        {fuelChartData.map((entry, index) => (
                                            <Cell key={entry.id} fill={index === 0 ? '#00A86B' : '#A7F3D0'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </SGFCard>

                {/* Manutenção por secretaria */}
                <SGFCard padding="lg" className="border border-slate-200/80">
                    <div className="mb-6 flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Manutenções por secretaria</h3>
                            <p className="text-sm text-slate-500">Ordens de serviço abertas por secretaria.</p>
                        </div>
                        <PeriodSelect value={chartPeriod} onChange={setChartPeriod} className="shrink-0" />
                    </div>
                    <div className="h-[360px] w-full">
                        {maintChartData.length === 0 || maintChartData.every((d) => d.maintenanceCount === 0) ? (
                            <div className="flex h-full items-center justify-center text-sm text-slate-400">Sem manutenções no período.</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={maintChartData} layout="vertical" margin={{ top: 6, right: 12, left: 0, bottom: 6 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                                    <XAxis type="number" allowDecimals={false} hide />
                                    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={120} tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }} />
                                    <Tooltip cursor={{ fill: '#f8fafc' }} content={<MaintenanceTooltip />} />
                                    <Bar dataKey="maintenanceCount" radius={[0, 10, 10, 0]} barSize={18}>
                                        {maintChartData.map((entry, index) => (
                                            <Cell key={entry.id} fill={index === 0 ? '#F59E0B' : '#FCD9A0'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </SGFCard>
            </div>

            {/* Grade de secretarias (cards clicáveis) */}
            <div>
                <div className="mb-5 flex items-end justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-900">Painéis por secretaria</h3>
                        <p className="text-sm text-slate-500">Clique em uma pasta para abrir o painel detalhado.</p>
                    </div>
                    <SGFBadge variant="default">{filtered.length} resultados</SGFBadge>
                </div>

                {filtered.length === 0 ? (
                    <SGFCard padding="lg" className="border border-slate-200/80">
                        <p className="py-10 text-center text-sm text-slate-400">Nenhuma secretaria encontrada para os filtros atuais.</p>
                    </SGFCard>
                ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {filtered.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => navigate(`/secretarias/${item.id}`)}
                                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all hover:border-emerald-200 hover:shadow-[var(--sgf-shadow-md)]"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <h4 className="truncate text-base font-semibold leading-tight text-slate-900">{item.name}</h4>
                                    <span className={cn(
                                        "h-2.5 w-2.5 shrink-0 rounded-full",
                                        item.anomalyCount > 0 ? "bg-rose-500" : "bg-emerald-500"
                                    )} />
                                </div>

                                <div className="mt-5 grid grid-cols-2 gap-y-5 gap-x-4">
                                    <Metric icon={Car} tint="text-blue-500 bg-blue-50" label="Veículos" value={item.vehicleCount} />
                                    <Metric icon={Users} tint="text-emerald-500 bg-emerald-50" label="Motoristas" value={item.driverCount} />
                                    <Metric icon={Route} tint="text-sky-500 bg-sky-50" label="Viagens" value={item.totalTrips} />
                                    <Metric icon={DollarSign} tint="text-amber-500 bg-amber-50" label="Custo Total" value={formatCurrency(item.fuelCost)} />
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <DepartmentFormModal isOpen={isFormOpen} onClose={() => setFormOpen(false)} />
        </div>
    );
}

function DetailKpis({ detail }: { detail: DepartmentDetail }) {
    return (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            <SGFKPICard title="Consumo de combustível" value={formatCurrency(detail.overview.fuelCost)} icon={Fuel} iconColor="text-emerald-500" />
            <SGFKPICard title="Quilometragem rodada" value={formatDistance(detail.overview.totalTripKm)} icon={Gauge} iconColor="text-blue-500" />
            <SGFKPICard title="Frota da pasta" value={detail.overview.vehicleCount} icon={Car} iconColor="text-amber-500" />
            <SGFKPICard title="Alertas operacionais" value={detail.overview.anomalyCount} icon={ShieldAlert} iconColor="text-rose-500" />
        </div>
    );
}

function DepartmentDetailPage({ departmentId }: { departmentId: string }) {
    const navigate = useNavigate();
    const { setTitle, setDescription, setSearchPlaceholder, setSearchHandler, setHeaderAction } = useHeader();
    const [isEditOpen, setEditOpen] = useState(false);

    const { data: detail, isLoading } = useQuery({
        queryKey: ['departments', 'operational-detail', departmentId],
        queryFn: () => departmentsApi.getOperationalDetail(departmentId),
    });

    useEffect(() => {
        setSearchPlaceholder('Pesquisar veículo ou motorista desta secretaria...');
        setSearchHandler(() => { });
        setHeaderAction(
            <div className="flex items-center gap-2">
                <SGFButton variant="ghost" size="md" icon={ArrowLeft} onClick={() => navigate('/secretarias')}>
                    Voltar
                </SGFButton>
                {detail && (
                    <SGFButton variant="secondary" size="md" onClick={() => setEditOpen(true)}>
                        <Pencil className="h-4 w-4" />
                        Editar
                    </SGFButton>
                )}
            </div>
        );

        return () => {
            setSearchHandler(() => { });
            setHeaderAction(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigate, setHeaderAction, setSearchHandler, setSearchPlaceholder, detail?.department.id]);

    useEffect(() => {
        if (!detail) return;
        setTitle(detail.department.name);
        setDescription(`Painel detalhado da secretaria ${detail.department.code}.`);
    }, [detail, setDescription, setTitle]);

    const vehicleColumns = [
        {
            header: 'Veículo',
            accessor: (row: DepartmentDetail['vehicles'][number]) => (
                <div>
                    <p className="font-semibold text-slate-800">{row.plate}</p>
                    <p className="text-xs text-slate-500">{row.brand} {row.model}</p>
                </div>
            ),
        },
        {
            header: 'Status',
            accessor: (row: DepartmentDetail['vehicles'][number]) => (
                <SGFBadge variant={row.status === 'IN_USE' ? 'info' : row.status === 'MAINTENANCE' ? 'warning' : 'success'}>
                    {getStatusLabel(row.status)}
                </SGFBadge>
            ),
        },
        {
            header: 'Odômetro',
            accessor: (row: DepartmentDetail['vehicles'][number]) => formatDistance(row.current_odometer),
        },
        {
            header: 'Combustível',
            accessor: (row: DepartmentDetail['vehicles'][number]) => row.fuel_type,
        },
    ];

    const driverColumns = [
        {
            header: 'Motorista',
            accessor: (row: DepartmentDetail['drivers'][number]) => (
                <div>
                    <p className="font-semibold text-slate-800">{row.name}</p>
                    <p className="text-xs text-slate-500">{row.registration_number}</p>
                </div>
            ),
        },
        {
            header: 'Status',
            accessor: (row: DepartmentDetail['drivers'][number]) => (
                <SGFBadge variant={row.status === 'ACTIVE' ? 'success' : row.status === 'SUSPENDED' ? 'error' : 'default'}>
                    {getStatusLabel(row.status)}
                </SGFBadge>
            ),
        },
        {
            header: 'Contato',
            accessor: (row: DepartmentDetail['drivers'][number]) => row.phone || row.email || 'Não informado',
        },
        {
            header: 'Score',
            accessor: (row: DepartmentDetail['drivers'][number]) => row.score ?? '-',
            className: 'text-right',
            headerClassName: 'text-right',
        },
    ];

    if (isLoading || !detail) {
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="h-36 animate-pulse rounded-[var(--sgf-card-radius)] bg-slate-100" />
                    ))}
                </div>
                <div className="h-[360px] animate-pulse rounded-[var(--sgf-card-radius)] bg-slate-100" />
                <div className="h-[320px] animate-pulse rounded-[var(--sgf-card-radius)] bg-slate-100" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <DetailKpis detail={detail} />

            <SGFCard padding="lg" className="border border-slate-200/80">
                <div className="mb-5">
                    <h3 className="text-lg font-semibold text-slate-900">Resumo da pasta</h3>
                    <p className="text-sm text-slate-500">
                        Frota, abastecimento, viagens, manutenção e equipe vinculados à secretaria {detail.department.code}.
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div className="rounded-[18px] bg-slate-50 px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Veículos</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">{detail.overview.vehicleCount}</p>
                    </div>
                    <div className="rounded-[18px] bg-slate-50 px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Motoristas</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">{detail.overview.driverCount}</p>
                    </div>
                    <div className="rounded-[18px] bg-slate-50 px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Viagens</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">{detail.overview.totalTrips}</p>
                    </div>
                    <div className="rounded-[18px] bg-slate-50 px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Última atividade</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">
                            {detail.overview.lastActivityAt ? formatDistanceToNow(detail.overview.lastActivityAt) : 'Sem registro'}
                        </p>
                    </div>
                </div>
            </SGFCard>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_0.9fr]">
                <SGFCard padding="lg" className="border border-slate-200/80">
                    <div className="mb-6">
                        <h3 className="text-lg font-semibold text-slate-900">Evolução do consumo</h3>
                        <p className="text-sm text-slate-500">Abastecimento acumulado nos últimos 6 meses.</p>
                    </div>

                    <div className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={detail.monthlyFuelCost} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="departmentFuel" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#00A86B" stopOpacity={0.28} />
                                        <stop offset="95%" stopColor="#00A86B" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(value) => `R$${Math.round(value / 1000)}k`} />
                                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                <Area type="monotone" dataKey="totalCost" stroke="#00A86B" strokeWidth={2.5} fill="url(#departmentFuel)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </SGFCard>

                <SGFCard padding="lg" className="border border-slate-200/80">
                    <div className="mb-6">
                        <h3 className="text-lg font-semibold text-slate-900">Rodagem mensal</h3>
                        <p className="text-sm text-slate-500">Distância rodada e volume de viagens.</p>
                    </div>

                    <div className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={detail.monthlyTripDistance} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(value) => `${Math.round(value)} km`} />
                                <Tooltip formatter={(value: number, _name, item) => (item as { dataKey?: string })?.dataKey === 'trips' ? `${value} viagens` : formatDistance(value)} />
                                <Bar dataKey="totalKm" radius={[10, 10, 0, 0]} fill="#3B82F6" barSize={28} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </SGFCard>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1.1fr]">
                <SGFCard padding="lg" className="border border-slate-200/80">
                    <div className="mb-6 flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Composição do combustível</h3>
                            <p className="text-sm text-slate-500">Distribuição do consumo por tipo de combustível.</p>
                        </div>
                        <SGFBadge variant="default">{detail.fuelTypeBreakdown.length} tipos</SGFBadge>
                    </div>

                    <div className="space-y-4">
                        {detail.fuelTypeBreakdown.map((item, index) => (
                            <div key={item.fuelType} className="rounded-[18px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <span
                                            className="h-3 w-3 rounded-full"
                                            style={{ backgroundColor: fuelTypeColors[index % fuelTypeColors.length] }}
                                        />
                                        <div>
                                            <p className="font-semibold text-slate-900">{item.fuelType}</p>
                                            <p className="text-xs text-slate-500">{item.liters.toLocaleString('pt-BR')} litros</p>
                                        </div>
                                    </div>
                                    <p className="font-semibold text-slate-900">{formatCurrency(item.totalCost)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </SGFCard>

                <SGFCard padding="lg" className="border border-slate-200/80">
                    <div className="mb-6">
                        <h3 className="text-lg font-semibold text-slate-900">Saúde operacional</h3>
                        <p className="text-sm text-slate-500">Resumo rápido da situação atual da secretaria.</p>
                    </div>

                    <div className="space-y-4">
                        <div className="rounded-[18px] border border-slate-200 bg-white px-5 py-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-500">Veículos disponíveis</span>
                                <span className="text-lg font-bold text-slate-900">{detail.overview.availableVehicles}</span>
                            </div>
                        </div>
                        <div className="rounded-[18px] border border-slate-200 bg-white px-5 py-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-500">Em manutenção</span>
                                <span className="text-lg font-bold text-slate-900">{detail.overview.maintenanceVehicles}</span>
                            </div>
                        </div>
                        <div className="rounded-[18px] border border-slate-200 bg-white px-5 py-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-500">Pendências de manutenção</span>
                                <span className="text-lg font-bold text-slate-900">{detail.overview.pendingMaintenances}</span>
                            </div>
                        </div>
                        <div className="rounded-[18px] border border-slate-200 bg-white px-5 py-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-500">Checklists com problema</span>
                                <span className="text-lg font-bold text-slate-900">{detail.checklistIssues}</span>
                            </div>
                        </div>
                        <div className="rounded-[18px] border border-slate-200 bg-white px-5 py-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-500">Média km/L</span>
                                <span className="text-lg font-bold text-slate-900">{detail.overview.avgKmPerLiter.toLocaleString('pt-BR')}</span>
                            </div>
                        </div>
                    </div>
                </SGFCard>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <SGFTable
                    columns={vehicleColumns}
                    data={detail.vehicles}
                    keyExtractor={(row) => row.id}
                    emptyMessage="Nenhum veículo vinculado a esta secretaria."
                />
                <SGFTable
                    columns={driverColumns}
                    data={detail.drivers}
                    keyExtractor={(row) => row.id}
                    emptyMessage="Nenhum motorista vinculado a esta secretaria."
                />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <SGFCard padding="lg" className="border border-slate-200/80">
                    <div className="mb-5 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Viagens recentes</h3>
                            <p className="text-sm text-slate-500">Últimas operações desta pasta.</p>
                        </div>
                        <BarChart3 className="h-5 w-5 text-slate-300" />
                    </div>

                    <div className="space-y-3">
                        {detail.recentTrips.slice(0, 6).map((trip) => (
                            <div key={trip.id} className="rounded-[18px] border border-slate-200 bg-slate-50/60 px-4 py-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="font-semibold text-slate-900">{trip.destination}</p>
                                        <p className="text-xs text-slate-500">{trip.vehicles?.plate || 'Veículo'} • {trip.drivers?.name || 'Motorista'}</p>
                                    </div>
                                    <SGFBadge variant={trip.status === 'IN_PROGRESS' ? 'info' : trip.status === 'COMPLETED' ? 'success' : 'error'} size="sm">
                                        {getStatusLabel(trip.status)}
                                    </SGFBadge>
                                </div>
                                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                                    <span>{formatDate(trip.start_time)}</span>
                                    <span>{formatDistance(trip.actual_distance_km || 0)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </SGFCard>

                <SGFCard padding="lg" className="border border-slate-200/80">
                    <div className="mb-5 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Abastecimentos recentes</h3>
                            <p className="text-sm text-slate-500">Últimos lançamentos vinculados à pasta.</p>
                        </div>
                        <Fuel className="h-5 w-5 text-slate-300" />
                    </div>

                    <div className="space-y-3">
                        {detail.recentRefuelings.slice(0, 6).map((item) => (
                            <div key={item.id} className="rounded-[18px] border border-slate-200 bg-slate-50/60 px-4 py-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="font-semibold text-slate-900">{item.vehicles?.plate || 'Veículo'} • {item.fuel_type}</p>
                                        <p className="text-xs text-slate-500">{item.drivers?.name || 'Motorista'} • {item.supplier_name}</p>
                                    </div>
                                    <p className="text-sm font-semibold text-slate-900">{formatCurrency(item.total_cost)}</p>
                                </div>
                                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                                    <span>{item.date ? formatDate(item.date) : 'Sem data'}</span>
                                    <span>{item.liters.toLocaleString('pt-BR')} L</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </SGFCard>

                <SGFCard padding="lg" className="border border-slate-200/80">
                    <div className="mb-5 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Manutenções</h3>
                            <p className="text-sm text-slate-500">Demandas abertas e histórico recente.</p>
                        </div>
                        <Wrench className="h-5 w-5 text-slate-300" />
                    </div>

                    <div className="space-y-3">
                        {detail.recentMaintenances.slice(0, 6).map((item) => (
                            <div key={item.id} className="rounded-[18px] border border-slate-200 bg-slate-50/60 px-4 py-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="font-semibold text-slate-900">{item.type} • {item.category}</p>
                                        <p className="text-xs text-slate-500">{item.vehicles?.plate || 'Veículo'} • {item.description}</p>
                                    </div>
                                    <SGFBadge
                                        size="sm"
                                        variant={item.status === 'COMPLETED' ? 'success' : item.status === 'REJECTED' ? 'error' : 'warning'}
                                    >
                                        {getStatusLabel(item.status)}
                                    </SGFBadge>
                                </div>
                                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                                    <span>{item.created_at ? formatDate(item.created_at) : 'Sem data'}</span>
                                    <span>{formatCurrency(item.actual_cost ?? item.estimated_cost ?? 0)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </SGFCard>
            </div>

            {detail && (
                <DepartmentFormModal
                    isOpen={isEditOpen}
                    onClose={() => setEditOpen(false)}
                    department={detail.department as Tables<'departments'>}
                />
            )}
        </div>
    );
}

export default function Departments() {
    const { id } = useParams();

    if (id) {
        return <DepartmentDetailPage departmentId={id} />;
    }

    return <DepartmentOverviewPage />;
}
