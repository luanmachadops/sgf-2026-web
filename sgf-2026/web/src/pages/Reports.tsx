import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SGFCard } from '@/components/sgf/SGFCard';
import { ReportViewerModal } from '@/components/reports/ReportViewerModal';
import {
    Car,
    Fuel,
    Wrench,
    Route,
    Users,
    TrendingUp,
    BarChart3,
    PieChart,
    Clock,
    Receipt,
} from '@/components/sgf/icons';
import { cn } from '@/lib/utils';
import { useHeader } from '@/contexts/HeaderContext';
import { useEffect } from 'react';
import { SGFKPICard } from '@/components/sgf/SGFKPICard';
import { motion, AnimatePresence } from 'framer-motion';
import { dashboardApi } from '@/lib/supabase-api';
import { formatCurrency } from '@/lib/utils';

interface Report {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    category: 'fleet' | 'financial' | 'operational';
}

const reports: Report[] = [
    {
        id: 'fleet-summary',
        title: 'Resumo da Frota',
        description: 'Visão geral de todos os veículos, status e distribuição por secretaria.',
        icon: <Car className="h-6 w-6" />,
        category: 'fleet',
    },
    {
        id: 'fuel-consumption',
        title: 'Consumo de Combustível',
        description: 'Análise detalhada de consumo, gastos e eficiência por veículo.',
        icon: <Fuel className="h-6 w-6" />,
        category: 'financial',
    },
    {
        id: 'maintenance-history',
        title: 'Histórico de Manutenções',
        description: 'Registro completo de manutenções realizadas e custos.',
        icon: <Wrench className="h-6 w-6" />,
        category: 'operational',
    },
    {
        id: 'trip-analysis',
        title: 'Análise de Viagens',
        description: 'Estatísticas de viagens, quilometragem e utilização.',
        icon: <Route className="h-6 w-6" />,
        category: 'operational',
    },
    {
        id: 'driver-performance',
        title: 'Desempenho de Motoristas',
        description: 'Avaliação de motoristas, viagens realizadas e indicadores.',
        icon: <Users className="h-6 w-6" />,
        category: 'operational',
    },
    {
        id: 'cost-analysis',
        title: 'Análise de Custos',
        description: 'Relatório financeiro detalhado com projeções e comparativos.',
        icon: <TrendingUp className="h-6 w-6" />,
        category: 'financial',
    },
    {
        id: 'department-usage',
        title: 'Uso por Secretaria',
        description: 'Distribuição de recursos e gastos por secretaria.',
        icon: <PieChart className="h-6 w-6" />,
        category: 'fleet',
    },
    {
        id: 'efficiency-report',
        title: 'Relatório de Eficiência',
        description: 'KPIs de eficiência operacional e utilização da frota.',
        icon: <BarChart3 className="h-6 w-6" />,
        category: 'operational',
    },
    {
        id: 'infractions',
        title: 'Infrações de Trânsito',
        description: 'Multas registradas, condutor indicado, valores e situação.',
        icon: <Receipt className="h-6 w-6" />,
        category: 'operational',
    },
];

const categoryLabels: Record<string, string> = {
    fleet: 'Frota',
    financial: 'Financeiro',
    operational: 'Operacional',
};

const categoryColors: Record<string, string> = {
    fleet: 'bg-amber-100 text-amber-700',
    financial: 'bg-green-100 text-green-700',
    operational: 'bg-blue-100 text-blue-700',
};

export default function Reports() {
    const [selectedReport, setSelectedReport] = useState<Report | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const { setTitle, setDescription } = useHeader();

    useEffect(() => {
        setTitle('Relatórios');
        setDescription('Gere e exporte relatórios operacionais e financeiros em PDF e Excel.');
    }, [setTitle, setDescription]);

    const { data: kpis, isLoading: kpisLoading } = useQuery({
        queryKey: ['reports-kpis'],
        queryFn: () => dashboardApi.getKPIs(),
        staleTime: 5 * 60 * 1000,
    });
    const { data: expenseChart } = useQuery({
        queryKey: ['reports-expense-chart'],
        queryFn: () => dashboardApi.getExpenseChart(6),
        staleTime: 5 * 60 * 1000,
    });

    const fuelChartData = (expenseChart ?? []).map((d) => ({ month: d.month, value: d.fuel }));

    const filteredReports = reports.filter((r) => {
        const matchesCategory = !categoryFilter || r.category === categoryFilter;
        const matchesSearch = !searchTerm ||
            r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.description.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    return (
        <div className="space-y-8 pb-10">
            {/* KPIs Section — dados reais da frota */}
            <div className="grid gap-4 md:grid-cols-4">
                <SGFKPICard
                    title="Veículos na Frota"
                    value={kpis?.fleet.totalVehicles ?? 0}
                    icon={Car}
                    iconColor="text-emerald-500"
                    chartColor="#10b981"
                    loading={kpisLoading}
                />
                <SGFKPICard
                    title="Viagens no Mês"
                    value={kpis?.trips.totalTripsMonth ?? 0}
                    icon={Route}
                    iconColor="text-blue-500"
                    chartColor="#3b82f6"
                    loading={kpisLoading}
                />
                <SGFKPICard
                    title="Combustível (mês)"
                    value={formatCurrency(kpis?.fuel.totalCostMonth ?? 0)}
                    icon={Fuel}
                    iconColor="text-amber-500"
                    chartColor="#f59e0b"
                    chartData={fuelChartData}
                    loading={kpisLoading}
                />
                <SGFKPICard
                    title="Disponibilidade"
                    value={`${Math.round(kpis?.fleet.availabilityRate ?? 0)}%`}
                    icon={TrendingUp}
                    iconColor="text-emerald-600"
                    chartColor="#059669"
                    loading={kpisLoading}
                />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    <button
                        type="button"
                        onClick={() => setCategoryFilter('')}
                        className={
                            'px-4 py-2.5 rounded-full text-sm font-semibold border transition whitespace-nowrap ' +
                            (categoryFilter === ''
                                ? 'bg-emerald-500 text-white border-emerald-500'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300')
                        }
                    >
                        Todos
                    </button>
                    {Object.entries(categoryLabels).map(([key, label]) => {
                        const isActive = categoryFilter === key;
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setCategoryFilter(key)}
                                className={
                                    'px-4 py-2.5 rounded-full text-sm font-semibold border transition whitespace-nowrap ' +
                                    (isActive
                                        ? 'bg-emerald-500 text-white border-emerald-500'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300')
                                }
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>

                {searchTerm && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 animate-in fade-in slide-in-from-right-4 duration-500">
                        <span className="text-[10px] uppercase font-black">Filtrando por:</span>
                        <span className="text-sm font-bold italic">"{searchTerm}"</span>
                        <button onClick={() => setSearchTerm('')} className="p-0.5 hover:bg-emerald-100 rounded-full transition-colors">
                            <Clock className="h-3 w-3 rotate-45" />
                        </button>
                    </div>
                )}
            </div>

            {/* Reports Grid */}
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                <AnimatePresence mode="popLayout">
                    {filteredReports.map((report) => (
                        <motion.div
                            key={report.id}
                            layout
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            className="h-full"
                        >
                            <SGFCard
                                className="group relative h-full overflow-hidden border border-slate-100 hover:border-slate-200"
                                onClick={() => setSelectedReport(report)}
                                padding="md"
                                hover
                            >
                                {/* Subtle Background Pattern */}
                                <div className={cn(
                                    "absolute -right-6 -top-6 h-32 w-32 rounded-full blur-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-500",
                                    (categoryColors[report.category] || '').split(' ')[0]
                                )} />

                                <div className="relative z-10 flex h-full flex-col">
                                    {/* Topo: ícone + categoria */}
                                    <div className="flex items-start justify-between gap-3">
                                        <div className={cn("p-2 rounded-xl [&>svg]:h-5 [&>svg]:w-5", categoryColors[report.category])}>
                                            {report.icon}
                                        </div>
                                        <span className={cn(
                                            "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider",
                                            categoryColors[report.category]
                                        )}>
                                            {categoryLabels[report.category]}
                                        </span>
                                    </div>

                                    {/* Conteúdo */}
                                    <div className="mt-3 flex-1">
                                        <h3 className="font-bold text-slate-900 tracking-tight text-sm mb-1 line-clamp-1">{report.title}</h3>
                                        <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-2">{report.description}</p>
                                    </div>
                                </div>
                            </SGFCard>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Visualizador de relatório (tela cheia) */}
            {selectedReport && (
                <ReportViewerModal
                    isOpen={!!selectedReport}
                    onClose={() => setSelectedReport(null)}
                    reportId={selectedReport.id}
                    title={selectedReport.title}
                    description={selectedReport.description}
                />
            )}
        </div>
    );
}
