import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
    User,
    Wrench,
} from '@/components/sgf/icons';
import { DepartmentFormModal } from '@/components/departments/DepartmentFormModal';
import { NewSecretarioModal } from '@/components/settings/NewSecretarioModal';
import { TripDetailsModal } from '@/components/trips/TripDetailsModal';
import { RefuelingDetailsModal } from '@/components/refuelings/RefuelingDetailsModal';
import { MaintenanceDetailsModal } from '@/components/maintenances/MaintenanceDetailsModal';
import type { Tables } from '@/types/database.types';
import { differenceInDays, parseISO } from 'date-fns';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
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
    getStatusLabel,
    formatPlate,
    formatPhone,
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

function getInitials(name: string) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '–';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getLicenseStatus(expiryDate: string | null | undefined, alertDays = 30) {
    if (!expiryDate) {
        return { label: 'Não cadastrada', variant: 'default' as const, urgent: false };
    }
    const today = new Date();
    const expiry = parseISO(expiryDate);
    if (Number.isNaN(expiry.getTime())) {
        return { label: 'Não cadastrada', variant: 'default' as const, urgent: false };
    }
    const daysUntilExpiry = differenceInDays(expiry, today);

    if (daysUntilExpiry < 0) {
        return { label: 'Vencida', variant: 'error' as const, urgent: true };
    }
    if (daysUntilExpiry <= alertDays) {
        return { label: `Vence em ${daysUntilExpiry} dias`, variant: 'warning' as const, urgent: true };
    }
    if (daysUntilExpiry <= alertDays * 3) {
        return { label: `Vence em ${daysUntilExpiry} dias`, variant: 'info' as const, urgent: false };
    }

    return { label: 'Regular', variant: 'success' as const, urgent: false };
}

function getFuelLabel(fuelType: string | null | undefined) {
    if (!fuelType) return '—';
    const labels: Record<string, string> = {
        GASOLINE: 'Gasolina',
        ETHANOL: 'Etanol',
        DIESEL: 'Diesel',
        FLEX: 'Flex',
    };

    return labels[fuelType] || fuelType;
}

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
    const [isSecretarioOpen, setSecretarioOpen] = useState(false);

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
            <div className="flex items-center gap-2">
                <SGFButton variant="outline" onClick={() => setSecretarioOpen(true)} icon={User} className="!rounded-full !h-[37px] !border-slate-200 hover:!bg-slate-50">
                    Novo secretário
                </SGFButton>
                <SGFButton variant="primary" onClick={() => setFormOpen(true)} icon={Plus} className="!rounded-full !h-[37px]">
                    Nova secretaria
                </SGFButton>
            </div>
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
            <NewSecretarioModal isOpen={isSecretarioOpen} onClose={() => setSecretarioOpen(false)} />
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
    const [isSecretarioOpen, setSecretarioOpen] = useState(false);
    const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
    const [selectedRefuelId, setSelectedRefuelId] = useState<string | null>(null);
    const [selectedMaintId, setSelectedMaintId] = useState<string | null>(null);
    const tabsRef = useRef<HTMLDivElement>(null);

    const { data: detail, isLoading } = useQuery({
        queryKey: ['departments', 'operational-detail', departmentId],
        queryFn: () => departmentsApi.getOperationalDetail(departmentId),
    });

    useEffect(() => {
        setTitle('Secretarias');
        setDescription(detail ? `Painel detalhado da secretaria ${detail.department.code}.` : 'Painel detalhado.');
        setSearchPlaceholder('Pesquisar veículo ou motorista desta secretaria...');
        setSearchHandler(() => { });
        setHeaderAction(null);

        return () => {
            setSearchHandler(() => { });
            setHeaderAction(null);
        };
    }, [setTitle, setDescription, setSearchPlaceholder, setSearchHandler, setHeaderAction, detail]);

    const vehicleColumns = [
        {
            header: 'Veículo',
            accessor: (row: DepartmentDetail['vehicles'][number]) => {
                const name = `${row.brand} ${row.model}`;
                return (
                    <div className="flex items-center gap-2.5">
                        {row.photo_url ? (
                            <img src={row.photo_url} alt={name} className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-slate-200 bg-white" />
                        ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                                <Car className="h-4 w-4" />
                            </div>
                        )}
                        <div>
                            <p className="font-semibold text-slate-800">{row.plate}</p>
                            <p className="text-xs text-slate-500">{name}</p>
                        </div>
                    </div>
                );
            },
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
            accessor: (row: DepartmentDetail['drivers'][number]) => {
                const name = row.name || '—';
                return (
                    <div className="flex items-center gap-2.5">
                        {row.photo_url ? (
                            <img src={row.photo_url} alt={name} className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-slate-200 bg-white" />
                        ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-xs font-bold text-white shadow-sm">
                                {getInitials(name)}
                            </div>
                        )}
                        <div>
                            <p className="font-semibold text-slate-800">{name}</p>
                            <p className="text-xs text-slate-500">{row.registration_number}</p>
                        </div>
                    </div>
                );
            },
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

    const tripColumns = [
        {
            header: 'Data',
            accessor: (row: DepartmentDetail['recentTrips'][number]) => formatDate(row.start_time),
        },
        {
            header: 'Destino',
            accessor: (row: DepartmentDetail['recentTrips'][number]) => row.destination || 'Sem destino',
        },
        {
            header: 'Veículo',
            accessor: (row: DepartmentDetail['recentTrips'][number]) => {
                const brand = row.vehicles?.brand || '';
                const model = row.vehicles?.model || '';
                const name = [brand, model].filter(Boolean).join(' ') || '—';
                const photo = row.vehicles?.photo_url;
                return (
                    <div className="flex items-center gap-2.5">
                        {photo ? (
                            <img src={photo} alt={name} className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-slate-200 bg-white" />
                        ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                                <Car className="h-4 w-4" />
                            </div>
                        )}
                        <div>
                            <span className="font-semibold text-slate-800 text-sm block">{name}</span>
                            <span className="font-mono text-xs text-slate-500">{row.vehicles?.plate ? formatPlate(row.vehicles.plate) : '—'}</span>
                        </div>
                    </div>
                );
            },
        },
        {
            header: 'Motorista',
            accessor: (row: DepartmentDetail['recentTrips'][number]) => {
                const name = row.drivers?.name || '—';
                const photo = row.drivers?.photo_url;
                return (
                    <div className="flex items-center gap-2.5">
                        {photo ? (
                            <img src={photo} alt={name} className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-slate-200 bg-white" />
                        ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-xs font-bold text-white shadow-sm">
                                {getInitials(name)}
                            </div>
                        )}
                        <span className="font-semibold text-slate-800 text-sm">{name}</span>
                    </div>
                );
            },
        },
        {
            header: 'Distância',
            accessor: (row: DepartmentDetail['recentTrips'][number]) => row.actual_distance_km != null ? formatDistance(Number(row.actual_distance_km)) : '—',
        },
        {
            header: 'Status',
            accessor: (row: DepartmentDetail['recentTrips'][number]) => (
                <SGFBadge variant={row.status === 'IN_PROGRESS' ? 'info' : row.status === 'COMPLETED' ? 'success' : 'error'}>
                    {getStatusLabel(row.status)}
                </SGFBadge>
            ),
        },
    ];

    const refuelingColumns = [
        {
            header: 'Data',
            accessor: (row: DepartmentDetail['recentRefuelings'][number]) => row.date ? formatDate(row.date) : 'Sem data',
        },
        {
            header: 'Veículo',
            accessor: (row: DepartmentDetail['recentRefuelings'][number]) => {
                const brand = row.vehicles?.brand || '';
                const model = row.vehicles?.model || '';
                const name = [brand, model].filter(Boolean).join(' ') || '—';
                const photo = row.vehicles?.photo_url;
                return (
                    <div className="flex items-center gap-2.5">
                        {photo ? (
                            <img src={photo} alt={name} className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-slate-200 bg-white" />
                        ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                                <Car className="h-4 w-4" />
                            </div>
                        )}
                        <div>
                            <span className="font-semibold text-slate-800 text-sm block">{name}</span>
                            <span className="font-mono text-xs text-slate-500">{row.vehicles?.plate ? formatPlate(row.vehicles.plate) : '—'}</span>
                        </div>
                    </div>
                );
            },
        },
        {
            header: 'Motorista',
            accessor: (row: DepartmentDetail['recentRefuelings'][number]) => {
                const name = row.drivers?.name || '—';
                const photo = row.drivers?.photo_url;
                return (
                    <div className="flex items-center gap-2.5">
                        {photo ? (
                            <img src={photo} alt={name} className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-slate-200 bg-white" />
                        ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-xs font-bold text-white shadow-sm">
                                {getInitials(name)}
                            </div>
                        )}
                        <span className="font-semibold text-slate-800 text-sm">{name}</span>
                    </div>
                );
            },
        },
        {
            header: 'Combustível',
            accessor: (row: DepartmentDetail['recentRefuelings'][number]) => row.fuel_type || '—',
        },
        {
            header: 'Litros',
            accessor: (row: DepartmentDetail['recentRefuelings'][number]) => row.liters != null ? `${row.liters.toLocaleString('pt-BR')} L` : '—',
        },
        {
            header: 'Valor Total',
            accessor: (row: DepartmentDetail['recentRefuelings'][number]) => formatCurrency(row.total_cost),
        },
        {
            header: 'Posto',
            accessor: (row: DepartmentDetail['recentRefuelings'][number]) => row.supplier_name || '—',
        },
    ];

    const maintenanceColumns = [
        {
            header: 'Data',
            accessor: (row: DepartmentDetail['recentMaintenances'][number]) => row.created_at ? formatDate(row.created_at) : 'Sem data',
        },
        {
            header: 'Veículo',
            accessor: (row: DepartmentDetail['recentMaintenances'][number]) => {
                const brand = row.vehicles?.brand || '';
                const model = row.vehicles?.model || '';
                const name = [brand, model].filter(Boolean).join(' ') || '—';
                const photo = row.vehicles?.photo_url;
                return (
                    <div className="flex items-center gap-2.5">
                        {photo ? (
                            <img src={photo} alt={name} className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-slate-200 bg-white" />
                        ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                                <Car className="h-4 w-4" />
                            </div>
                        )}
                        <div>
                            <span className="font-semibold text-slate-800 text-sm block">{name}</span>
                            <span className="font-mono text-xs text-slate-500">{row.vehicles?.plate ? formatPlate(row.vehicles.plate) : '—'}</span>
                        </div>
                    </div>
                );
            },
        },
        {
            header: 'Tipo',
            accessor: (row: DepartmentDetail['recentMaintenances'][number]) => row.type || '—',
        },
        {
            header: 'Categoria',
            accessor: (row: DepartmentDetail['recentMaintenances'][number]) => row.category || '—',
        },
        {
            header: 'Descrição',
            accessor: (row: DepartmentDetail['recentMaintenances'][number]) => row.description || '—',
        },
        {
            header: 'Status',
            accessor: (row: DepartmentDetail['recentMaintenances'][number]) => (
                <SGFBadge variant={row.status === 'COMPLETED' ? 'success' : row.status === 'REJECTED' ? 'error' : 'warning'}>
                    {getStatusLabel(row.status)}
                </SGFBadge>
            ),
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
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <Link to="/secretarias" className="shrink-0">
                        <SGFButton variant="ghost" size="sm" icon={ArrowLeft}><span className="hidden md:inline">Voltar</span></SGFButton>
                    </Link>
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">
                            {detail.department.name}
                        </h1>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {detail && (
                        <>
                            <SGFButton variant="outline" icon={User} onClick={() => setSecretarioOpen(true)} className="!h-[37px] !rounded-full">
                                <span className="hidden sm:inline">Novo Secretário</span>
                            </SGFButton>
                            <SGFButton variant="secondary" icon={Pencil} onClick={() => setEditOpen(true)} className="!h-[37px] !rounded-full">
                                <span className="hidden sm:inline">Editar</span>
                            </SGFButton>
                        </>
                    )}
                </div>
            </div>

            <DetailKpis detail={detail} />

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

            <div ref={tabsRef} className="scroll-mt-28 w-full">
                <Tabs
                    defaultValue="vehicles"
                    className="w-full"
                    onValueChange={() => {
                        setTimeout(() => {
                            tabsRef.current?.scrollIntoView({ behavior: 'smooth' });
                        }, 50);
                    }}
                >
                <TabsList className="flex overflow-x-auto sm:grid w-full sm:grid-cols-5 max-w-[650px] mx-auto bg-slate-100/50 p-1 rounded-xl scrollbar-none whitespace-nowrap">
                    <TabsTrigger value="vehicles" className="rounded-lg data-[state=active]:bg-[#00A86B] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-xs sm:text-sm px-3 shrink-0 flex-1">Veículos</TabsTrigger>
                    <TabsTrigger value="drivers" className="rounded-lg data-[state=active]:bg-[#00A86B] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-xs sm:text-sm px-3 shrink-0 flex-1">Motoristas</TabsTrigger>
                    <TabsTrigger value="trips" className="rounded-lg data-[state=active]:bg-[#00A86B] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-xs sm:text-sm px-3 shrink-0 flex-1">Viagens</TabsTrigger>
                    <TabsTrigger value="refuelings" className="rounded-lg data-[state=active]:bg-[#00A86B] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-xs sm:text-sm px-3 shrink-0 flex-1">Abastecimentos</TabsTrigger>
                    <TabsTrigger value="maintenances" className="rounded-lg data-[state=active]:bg-[#00A86B] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-xs sm:text-sm px-3 shrink-0 flex-1">Manutenções</TabsTrigger>
                </TabsList>

                <TabsContent value="vehicles" className="mt-4">
                    {/* Tabela (desktop) */}
                    <div className="-mx-4 hidden md:mx-0 md:block">
                        <SGFTable
                            columns={vehicleColumns}
                            data={detail.vehicles}
                            keyExtractor={(row) => row.id}
                            onRowClick={(row) => navigate(`/veiculos/${row.id}`, { state: { backTo: `/secretarias/${departmentId}` } })}
                            emptyMessage="Nenhum veículo vinculado a esta secretaria."
                        />
                    </div>

                    {/* Cards (mobile) */}
                    <div className="space-y-3 md:hidden">
                        {detail.vehicles.length === 0 ? (
                            <div className="rounded-[18px] bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
                                Nenhum veículo vinculado a esta secretaria.
                            </div>
                        ) : (
                            detail.vehicles.map((row) => {
                                const barColor = row.status === 'AVAILABLE' ? '#5BCE72' : row.status === 'MAINTENANCE' ? '#F59E0B' : row.status === 'IN_USE' ? '#3B82F6' : '#9CA3AF';
                                return (
                                    <div
                                        key={row.id}
                                        onClick={() => navigate(`/veiculos/${row.id}`, { state: { backTo: `/secretarias/${departmentId}` } })}
                                        className="relative flex cursor-pointer items-center gap-3.5 overflow-hidden rounded-[18px] bg-white py-3.5 pl-4 pr-3.5 text-[#2F2F2F] shadow-sm active:scale-[0.98] transition-all duration-150 active:bg-slate-50"
                                    >
                                        <div className="relative h-[62px] w-[62px] shrink-0">
                                            {/* Fallback por baixo */}
                                            <div className="absolute inset-0 flex items-center justify-center rounded-[14px] bg-[#D9D9D9]">
                                                <Car className="h-7 w-7 text-slate-500/70" />
                                            </div>
                                            {row.photo_url && (
                                                <img
                                                    src={row.photo_url}
                                                    alt={row.plate ?? ''}
                                                    loading="lazy"
                                                    className="absolute inset-0 h-[62px] w-[62px] rounded-[14px] object-cover ring-1 ring-slate-200 bg-white"
                                                    onError={(e) => {
                                                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="min-w-0 truncate text-[16px] font-bold leading-tight">{row.brand} {row.model}</p>
                                                <span className="max-w-[42%] shrink-0 truncate rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                                                    {getStatusLabel(row.status)}
                                                </span>
                                            </div>
                                            <div className="mt-1.5 grid grid-cols-2 text-[13.5px] leading-snug">
                                                <div className="space-y-0.5 pr-3">
                                                    <p className="truncate font-mono text-slate-600 font-medium">{formatPlate(row.plate)}</p>
                                                    <p className="truncate text-slate-500">{getFuelLabel(row.fuel_type)}</p>
                                                </div>
                                                <div className="space-y-0.5 border-l border-slate-200 pl-3">
                                                    <p className="truncate text-slate-600">{formatDistance(row.current_odometer)}</p>
                                                    <p className="truncate text-slate-500">{row.year ?? '—'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="drivers" className="mt-4">
                    {/* Tabela (desktop) */}
                    <div className="-mx-4 hidden md:mx-0 md:block">
                        <SGFTable
                            columns={driverColumns}
                            data={detail.drivers}
                            keyExtractor={(row) => row.id}
                            onRowClick={(row) => navigate(`/motoristas/${row.id}`, { state: { backTo: `/secretarias/${departmentId}` } })}
                            emptyMessage="Nenhum motorista vinculado a esta secretaria."
                        />
                    </div>

                    {/* Cards (mobile) */}
                    <div className="space-y-3 md:hidden">
                        {detail.drivers.length === 0 ? (
                            <div className="rounded-[18px] bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
                                Nenhum motorista vinculado a esta secretaria.
                            </div>
                        ) : (
                            detail.drivers.map((row) => {
                                const barColor = row.status === 'ACTIVE' ? '#5BCE72' : row.status === 'SUSPENDED' ? '#EF4444' : '#9CA3AF';
                                const cnhStatus = getLicenseStatus(row.cnh_expiry_date);
                                return (
                                    <div
                                        key={row.id}
                                        onClick={() => navigate(`/motoristas/${row.id}`, { state: { backTo: `/secretarias/${departmentId}` } })}
                                        className="relative flex cursor-pointer items-center gap-3.5 overflow-hidden rounded-[18px] bg-white py-3.5 pl-4 pr-3.5 text-[#2F2F2F] shadow-sm transition-all duration-150 active:scale-[0.98] active:bg-slate-50"
                                    >
                                        <div className="relative h-[62px] w-[62px] shrink-0">
                                            {/* Fallback por baixo */}
                                            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-base font-bold text-white shadow-sm">
                                                {getInitials(row.name)}
                                            </div>
                                            {row.photo_url && (
                                                <img
                                                    src={row.photo_url}
                                                    alt={row.name}
                                                    loading="lazy"
                                                    className="absolute inset-0 h-[62px] w-[62px] rounded-full object-cover ring-1 ring-slate-200 bg-white"
                                                    onError={(e) => {
                                                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="min-w-0 truncate text-[16px] font-bold leading-tight">{row.name}</p>
                                                <span className="max-w-[42%] shrink-0 truncate rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                                                    {getStatusLabel(row.status)}
                                                </span>
                                            </div>
                                            <div className="mt-1.5 grid grid-cols-2 text-[13.5px] leading-snug">
                                                <div className="space-y-0.5 pr-3 text-slate-500">
                                                    <p className="truncate font-mono text-slate-600 font-medium">CNH: {row.cnh_number || '—'}</p>
                                                    <p className="truncate uppercase font-bold text-[11px] tracking-wider text-slate-400">Cat. {row.cnh_category || '—'}</p>
                                                </div>
                                                <div className="space-y-0.5 border-l border-slate-200 pl-3">
                                                    <p className={`truncate font-medium text-slate-600 ${cnhStatus.urgent ? 'text-red-600 font-bold' : ''}`}>
                                                        Val. {row.cnh_expiry_date ? formatDate(row.cnh_expiry_date) : '—'}
                                                    </p>
                                                    <div className="truncate text-[12px] font-bold">
                                                        <span className="text-slate-500 font-normal">{row.phone ? formatPhone(row.phone) : 'Sem telefone'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="trips" className="mt-4">
                    {/* Tabela (desktop) */}
                    <div className="-mx-4 hidden md:mx-0 md:block">
                        <SGFTable
                            columns={tripColumns}
                            data={detail.recentTrips}
                            keyExtractor={(row) => row.id}
                            onRowClick={(row) => setSelectedTripId(row.id)}
                            emptyMessage="Nenhuma viagem registrada para esta secretaria."
                        />
                    </div>

                    {/* Cards (mobile) */}
                    <div className="space-y-3 md:hidden">
                        {detail.recentTrips.length === 0 ? (
                            <div className="rounded-[18px] bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
                                Nenhuma viagem registrada para esta secretaria.
                            </div>
                        ) : (
                            detail.recentTrips.map((trip) => {
                                const barColor = trip.status === 'COMPLETED' ? '#5BCE72' : trip.status === 'IN_PROGRESS' ? '#3B82F6' : '#EF4444';
                                return (
                                    <div
                                        key={trip.id}
                                        onClick={() => setSelectedTripId(trip.id)}
                                        className="relative flex cursor-pointer items-center gap-3.5 overflow-hidden rounded-[18px] bg-white py-3.5 pl-4 pr-3.5 text-[#2F2F2F] shadow-sm transition-all duration-150 active:scale-[0.98] active:bg-slate-50"
                                    >
                                        <div className="flex h-[62px] w-[62px] shrink-0 flex-col items-center justify-center rounded-[14px] bg-[#E0E8E6] text-[#0F2B2F]">
                                            <span className="text-[17px] font-black leading-none">
                                                {trip.actual_distance_km != null ? Math.round(Number(trip.actual_distance_km)) : '—'}
                                            </span>
                                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">km</span>
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="min-w-0 truncate text-[16px] font-bold leading-tight">
                                                    {trip.destination || 'Sem destino'}
                                                </p>
                                                <span className="shrink-0 text-[11px] font-bold text-slate-400">
                                                    {formatDate(trip.start_time)}
                                                </span>
                                            </div>
                                            <div className="mt-1.5 grid grid-cols-2 text-[13.5px] leading-snug">
                                                <div className="space-y-0.5 pr-3">
                                                    <p className="truncate text-slate-700 font-semibold text-[13.5px]">
                                                        {trip.vehicles ? `${trip.vehicles.brand} ${trip.vehicles.model}` : 'Veículo não informado'}
                                                    </p>
                                                    <p className="truncate font-mono text-[12px] text-slate-400">
                                                        {trip.vehicles?.plate ? formatPlate(trip.vehicles.plate) : '—'}
                                                    </p>
                                                </div>
                                                <div className="space-y-0.5 border-l border-slate-200 pl-3 flex flex-col justify-center">
                                                    <p className="truncate text-slate-600 font-medium text-[13px]">
                                                        {trip.drivers?.name || 'Sem motorista'}
                                                    </p>
                                                    <p className="truncate text-[11px] font-bold text-emerald-600">
                                                        {getStatusLabel(trip.status)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="refuelings" className="mt-4">
                    {/* Tabela (desktop) */}
                    <div className="-mx-4 hidden md:mx-0 md:block">
                        <SGFTable
                            columns={refuelingColumns}
                            data={detail.recentRefuelings}
                            keyExtractor={(row) => row.id}
                            onRowClick={(row) => setSelectedRefuelId(row.id)}
                            emptyMessage="Nenhum abastecimento registrado para esta secretaria."
                        />
                    </div>

                    {/* Cards (mobile) */}
                    <div className="space-y-3 md:hidden">
                        {detail.recentRefuelings.length === 0 ? (
                            <div className="rounded-[18px] bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
                                Nenhum abastecimento registrado para esta secretaria.
                            </div>
                        ) : (
                            detail.recentRefuelings.map((item) => {
                                const barColor = item.has_anomaly ? '#EF4444' : '#5BCE72';
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => setSelectedRefuelId(item.id)}
                                        className="relative flex cursor-pointer items-center gap-3.5 overflow-hidden rounded-[18px] bg-white py-3.5 pl-4 pr-3.5 text-[#2F2F2F] shadow-sm transition-all duration-150 active:scale-[0.98] active:bg-slate-50"
                                    >
                                        <div className="flex h-[62px] w-[62px] shrink-0 flex-col items-center justify-center rounded-[14px] bg-emerald-50 text-[#00A86B]">
                                            <Fuel className="h-6 w-6" />
                                            <span className="text-[10px] font-bold mt-1 truncate max-w-full px-1">{item.fuel_type}</span>
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="min-w-0 truncate text-[16px] font-bold leading-tight">
                                                    {item.vehicles ? `${item.vehicles.brand} ${item.vehicles.model}` : 'Veículo não informado'}
                                                </p>
                                                <span className="shrink-0 text-[14px] font-bold text-slate-900">
                                                    {formatCurrency(item.total_cost)}
                                                </span>
                                            </div>
                                            <div className="mt-1.5 grid grid-cols-2 text-[13.5px] leading-snug">
                                                <div className="space-y-0.5 pr-3">
                                                    <p className="truncate font-mono text-[12.5px] text-slate-600 font-medium">
                                                        {item.vehicles?.plate ? formatPlate(item.vehicles.plate) : '—'}
                                                    </p>
                                                    <p className="truncate text-[12px] text-slate-400">
                                                        {item.supplier_name || 'Posto não informado'}
                                                    </p>
                                                </div>
                                                <div className="space-y-0.5 border-l border-slate-200 pl-3 flex flex-col justify-center">
                                                    <p className="truncate text-slate-600 font-medium text-[13px]">
                                                        {item.drivers?.name || 'Sem motorista'}
                                                    </p>
                                                    <p className="truncate text-xs text-slate-500">
                                                        {item.date ? formatDate(item.date) : 'Sem data'} • {item.liters.toLocaleString('pt-BR')} L
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="maintenances" className="mt-4">
                    {/* Tabela (desktop) */}
                    <div className="-mx-4 hidden md:mx-0 md:block">
                        <SGFTable
                            columns={maintenanceColumns}
                            data={detail.recentMaintenances}
                            keyExtractor={(row) => row.id}
                            onRowClick={(row) => setSelectedMaintId(row.id)}
                            emptyMessage="Nenhuma ordem de serviço de manutenção registrada para esta secretaria."
                        />
                    </div>

                    {/* Cards (mobile) */}
                    <div className="space-y-3 md:hidden">
                        {detail.recentMaintenances.length === 0 ? (
                            <div className="rounded-[18px] bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
                                Nenhuma ordem de serviço registrada para esta secretaria.
                            </div>
                        ) : (
                            detail.recentMaintenances.map((item) => {
                                const barColor = item.status === 'COMPLETED' ? '#5BCE72' : item.status === 'REJECTED' ? '#EF4444' : '#F59E0B';
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => setSelectedMaintId(item.id)}
                                        className="relative flex cursor-pointer items-center gap-3.5 overflow-hidden rounded-[18px] bg-white py-3.5 pl-4 pr-3.5 text-[#2F2F2F] shadow-sm transition-all duration-150 active:scale-[0.98] active:bg-slate-50"
                                    >
                                        <div className="flex h-[62px] w-[62px] shrink-0 flex-col items-center justify-center rounded-[14px] bg-amber-50 text-[#F59E0B]">
                                            <Wrench className="h-6 w-6" />
                                            <span className="text-[10px] font-bold mt-1 truncate max-w-full px-1">{item.type}</span>
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="min-w-0 truncate text-[16px] font-bold leading-tight">
                                                    {item.vehicles ? `${item.vehicles.brand} ${item.vehicles.model}` : 'Veículo não informado'}
                                                </p>
                                                <span className="max-w-[42%] shrink-0 truncate rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                                                    {getStatusLabel(item.status)}
                                                </span>
                                            </div>
                                            <div className="mt-1.5 grid grid-cols-2 text-[13.5px] leading-snug">
                                                <div className="space-y-0.5 pr-3">
                                                    <p className="truncate font-mono text-[12.5px] text-slate-600 font-medium">
                                                        {item.vehicles?.plate ? formatPlate(item.vehicles.plate) : '—'}
                                                    </p>
                                                    <p className="truncate text-[12px] text-slate-400">
                                                        {item.description || 'Sem descrição'}
                                                    </p>
                                                </div>
                                                <div className="space-y-0.5 border-l border-slate-200 pl-3 flex flex-col justify-center">
                                                    <p className="truncate text-slate-600 font-medium text-[13px]">
                                                        Cat: {item.category || '—'}
                                                    </p>
                                                    <p className="truncate text-xs text-slate-500">
                                                        {item.created_at ? formatDate(item.created_at) : 'Sem data'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </TabsContent>
            </Tabs>
            </div>

            {detail && (
                <DepartmentFormModal
                    isOpen={isEditOpen}
                    onClose={() => setEditOpen(false)}
                    department={detail.department as Tables<'departments'>}
                />
            )}

            <TripDetailsModal tripId={selectedTripId} onClose={() => setSelectedTripId(null)} />
            <RefuelingDetailsModal refuelingId={selectedRefuelId} onClose={() => setSelectedRefuelId(null)} />
            <MaintenanceDetailsModal maintenanceId={selectedMaintId} onClose={() => setSelectedMaintId(null)} />
            <NewSecretarioModal isOpen={isSecretarioOpen} onClose={() => setSecretarioOpen(false)} defaultDepartmentId={departmentId} />
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
