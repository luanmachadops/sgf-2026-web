import { useEffect, useState } from 'react';
import {
    SGFKPICard,
    SGFCard,
    FuelExpenseChart,
    DepartmentConsumptionChart,
    PeriodSelect,
    makePeriod,
    resolvePeriod,
    type PeriodValue,
} from '@/components/sgf';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import {
    Truck,
    Activity,
    Fuel,
    Wrench,
    Building2,
} from '@/components/sgf/icons';
import { useHeader } from '@/contexts/HeaderContext';
import { useBranding } from '@/contexts/BrandingContext';
import {
    useDashboardKPIs,
    useDashboardKpiTrends,
    useExpenseChart
} from '@/hooks/useDashboard';
import { formatCurrency } from '@/lib/utils';

export default function Dashboard() {
    const { setTitle, setDescription, setSearchPlaceholder, setSearchHandler } = useHeader();
    const { branding } = useBranding();
    const [expensePeriod, setExpensePeriod] = useState<PeriodValue>(() => makePeriod('6'));

    // Real Data Hooks
    const { data: kpis, isLoading: isLoadingKPIs } = useDashboardKPIs();
    const { data: trends } = useDashboardKpiTrends();
    const { data: expenseData, isLoading: isLoadingExpenses, isError: isErrorExpenses } = useExpenseChart(resolvePeriod(expensePeriod));

    useEffect(() => {
        setTitle('Dashboard');
        setDescription('Visão geral dos indicadores e alertas da frota.');
        setSearchPlaceholder('Pesquisar veículo, condutor ou secretaria...');
        setSearchHandler(() => { });
    }, [setTitle, setDescription, setSearchPlaceholder, setSearchHandler]);

    // Formatters for display
    const formatValue = (val: number | undefined) => {
        if (val === undefined) return '0';
        if (val >= 1000) return (val / 1000).toFixed(1) + 'k';
        return val.toString();
    };

    return (
        <div className="space-y-6">
            {/* Cabeçalho da Prefeitura (brasão + nome) */}
            <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center ${branding.sealUrl || branding.logoUrl ? '' : 'overflow-hidden rounded-xl bg-[var(--sgf-dark)]'}`}>
                    {branding.sealUrl || branding.logoUrl ? (
                        <img src={branding.sealUrl || branding.logoUrl} alt={branding.name} className="h-full w-full object-contain" />
                    ) : (
                        <Building2 className="h-6 w-6 text-white" />
                    )}
                </div>
                <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold text-slate-900">{branding.name}</h2>
                    <p className="text-xs font-medium text-slate-500">
                        {[branding.city ? `${branding.city}${branding.state ? '/' + branding.state : ''}` : '', branding.mayorName ? `Prefeito(a): ${branding.mayorName}` : '']
                            .filter(Boolean).join('  •  ') || 'Gestão Pública de Frota'}
                    </p>
                </div>
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                {/* KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
                    <SGFKPICard
                        title="Frota ativa"
                        value={formatValue(kpis?.fleet?.totalVehicles)}
                        loading={isLoadingKPIs}
                        icon={Truck}
                        iconColor="text-emerald-500"
                        chartColor="#10b981"
                        chartData={trends?.activeFleet ?? []}
                    />
                    <SGFKPICard
                        title="Combustível (L)"
                        value={formatValue(kpis?.fuel?.totalLitersMonth)}
                        loading={isLoadingKPIs}
                        icon={Fuel}
                        iconColor="text-blue-500"
                        chartColor="#3b82f6"
                        chartData={trends?.fuelLiters ?? []}
                    />
                    <SGFKPICard
                        title="Manutenção Prev."
                        value={formatValue(kpis?.fleet?.inMaintenance)}
                        loading={isLoadingKPIs}
                        icon={Wrench}
                        iconColor="text-amber-500"
                        chartColor="#f59e0b"
                        chartData={trends?.maintenance ?? []}
                    />
                    <SGFKPICard
                        title="Total Rodado"
                        value={formatValue(kpis?.trips?.totalKmMonth)}
                        loading={isLoadingKPIs}
                        icon={Activity}
                        iconColor="text-rose-500"
                        chartColor="#f43f5e"
                        chartData={trends?.distanceKm ?? []}
                    />
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                    <div className="lg:col-span-2">
                        <SGFCard padding="lg">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                                <div>
                                    <h4 className="font-semibold text-base text-slate-800">
                                        Evolução de Gastos
                                    </h4>
                                    <p className="text-sm text-slate-400 font-medium">
                                        Gastos operacionais por mês
                                    </p>
                                </div>
                                <PeriodSelect value={expensePeriod} onChange={setExpensePeriod} />
                            </div>

                            <div className="h-[250px] sm:h-[320px] w-full min-w-0">
                                {isErrorExpenses ? (
                                    <div className="w-full h-full flex items-center justify-center bg-rose-50/50 rounded-2xl">
                                        <p className="text-sm text-rose-500 font-bold">Erro ao carregar dados de gastos</p>
                                    </div>
                                ) : isLoadingExpenses ? (
                                    <div className="w-full h-full flex items-center justify-center bg-slate-50/50 rounded-2xl animate-pulse">
                                        <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">Carregando dados...</p>
                                    </div>
                                ) : !expenseData || expenseData.every((d) => d.total === 0) ? (
                                    <div className="w-full h-full flex items-center justify-center bg-slate-50/50 rounded-2xl">
                                        <p className="text-sm text-slate-400 font-medium px-6 text-center">
                                            Nenhum gasto registrado no período.
                                        </p>
                                    </div>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart
                                            data={expenseData || []}
                                            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                                        >
                                            <defs>
                                                <linearGradient id="colorGreen" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                            <XAxis
                                                dataKey="month"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }}
                                                dy={10}
                                            />
                                            <YAxis
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }}
                                                tickFormatter={(value) => `R$${value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value}`}
                                            />
                                            <Tooltip
                                                animationDuration={0}
                                                cursor={{ stroke: '#10b981', strokeWidth: 1, strokeDasharray: '4 4' }}
                                                content={({ active, payload, label }) => {
                                                    if (active && payload && payload.length) {
                                                        return (
                                                            <div className="bg-white border border-slate-100 p-3 rounded-2xl shadow-xl">
                                                                <p className="text-xs font-bold text-slate-400 uppercase mb-2">{label}</p>
                                                                <div className="space-y-1">
                                                                    <p className="text-sm font-black text-emerald-600 flex items-center gap-2">
                                                                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                                                        {formatCurrency(payload[0].value as number)}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                }}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="total"
                                                stroke="#10b981"
                                                strokeWidth={2}
                                                fillOpacity={1}
                                                fill="url(#colorGreen)"
                                                isAnimationActive={false}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </SGFCard>
                    </div>

                    <div className="space-y-6">
                        {/* h-full puxa altura do vizinho em lg; em mobile precisa de min-h próprio */}
                        <SGFCard className="relative overflow-hidden h-[360px] lg:h-full lg:min-h-[360px]" padding="lg">
                            <FuelExpenseChart />
                        </SGFCard>
                    </div>
                </div>

                <div className="mt-10">
                    {/* Altura explícita: o ResponsiveContainer do recharts precisa de um
                        pai com altura definida — só min-h não resolve o h-full interno. */}
                    <SGFCard padding="lg" className="overflow-hidden h-[460px]">
                        <DepartmentConsumptionChart />
                    </SGFCard>
                </div>
            </div>
        </div>
    );
}
