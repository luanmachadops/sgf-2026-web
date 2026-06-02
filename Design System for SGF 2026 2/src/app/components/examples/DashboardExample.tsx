/**
 * SGF 2026 - Dashboard Example
 * Exemplo completo de uso do DashboardLayout com conteúdo real
 */

import React, { useState } from 'react';
import { DashboardLayout } from '@/app/components/templates/DashboardLayout';
import {
  SGFKPICard,
  SGFCard,
  SGFTable,
  SGFBadge,
  SGFAlert,
  SGFProgressBar,
  SGFButton,
} from '@/app/components/sgf';
import {
  Truck,
  Activity,
  Fuel,
  AlertTriangle,
  Bell,
  Filter,
  MoreHorizontal,
} from 'lucide-react';
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  MapPage,
  TelemetryPage,
  FleetPage,
  DriversPage,
  FuelPage,
  MaintenancePage,
  ReportsPage,
} from '@/app/pages';

// Mock data for chart
const chartData = [
  { name: 'Saúde', efficiency: 85, consumption: 420 },
  { name: 'Educação', efficiency: 45, consumption: 320 },
  { name: 'Obras', efficiency: 95, consumption: 580 },
  { name: 'Gabinete', efficiency: 30, consumption: 180 },
  { name: 'Social', efficiency: 60, consumption: 280 },
  { name: 'Esporte', efficiency: 25, consumption: 150 },
];

// Mock data
const VEHICLES = [
  {
    id: '1',
    plate: 'ABC-1234',
    model: 'VW Constellation',
    driver: 'João Silva',
    status: 'moving' as const,
    fuel: 75,
    speed: 45,
    dept: 'Obras',
  },
  {
    id: '2',
    plate: 'SGF-2026',
    model: 'Toyota Hilux',
    driver: 'Maria Santos',
    status: 'idle' as const,
    fuel: 42,
    speed: 0,
    dept: 'Saúde',
  },
  {
    id: '3',
    plate: 'OBR-900',
    model: 'M. Benz Axor',
    driver: 'Carlos Lima',
    status: 'stopped' as const,
    fuel: 15,
    speed: 0,
    dept: 'Obras',
  },
  {
    id: '4',
    plate: 'GOV-5566',
    model: 'Fiat Cronos',
    driver: 'Ana Paula',
    status: 'alert' as const,
    fuel: 5,
    speed: 12,
    dept: 'Gabinete',
  },
];

const ALERTS = [
  { id: 1, type: 'critical', msg: 'Desvio de rota detectado: ABC-1234', time: '2 min atrás' },
  { id: 2, type: 'warning', msg: 'Abastecimento acima da capacidade: OBR-900', time: '15 min atrás' },
  { id: 3, type: 'info', msg: 'Manutenção agendada para amanhã: Hilux', time: '1h atrás' },
];

export const DashboardExample: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  const tableColumns = [
    {
      header: 'Veículo',
      accessor: (row: typeof VEHICLES[0]) => (
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-[var(--sgf-primary)] group-hover:text-white transition-all duration-500">
            <Truck size={24} />
          </div>
          <div>
            <p className="text-sm font-black text-slate-800">{row.plate}</p>
            <p className="text-[11px] text-slate-400 font-medium">{row.model}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Departamento',
      accessor: (row: typeof VEHICLES[0]) => (
        <SGFBadge variant="default">{row.dept}</SGFBadge>
      ),
    },
    {
      header: 'Status',
      accessor: (row: typeof VEHICLES[0]) => (
        <SGFBadge variant={row.status} dot>
          {row.status}
        </SGFBadge>
      ),
    },
    {
      header: 'Combustível',
      accessor: (row: typeof VEHICLES[0]) => (
        <div className="w-32">
          <SGFProgressBar
            value={row.fuel}
            max={100}
            variant={row.fuel < 20 ? 'error' : 'success'}
            size="sm"
            showPercentage
          />
        </div>
      ),
    },
    {
      header: 'Velocidade',
      accessor: (row: typeof VEHICLES[0]) => (
        <span className="text-sm font-black text-slate-700">
          {row.speed} <span className="text-[10px] text-slate-400 uppercase">km/h</span>
        </span>
      ),
    },
    {
      header: 'Ações',
      headerClassName: 'text-right',
      className: 'text-right',
      accessor: () => (
        <button className="p-2 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all opacity-0 group-hover:opacity-100">
          <MoreHorizontal size={20} />
        </button>
      ),
    },
  ];

  return (
    <DashboardLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'dashboard' && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            <SGFKPICard
              title="Veículos Ativos"
              value="128"
              percentage={8.2}
              trend="up"
              icon={Truck}
              iconColor="text-emerald-600"
            />
            <SGFKPICard
              title="Em Movimento"
              value="42"
              percentage={12.5}
              trend="up"
              icon={Activity}
              iconColor="text-blue-600"
            />
            <SGFKPICard
              title="Gasto Diesel (L)"
              value="15.420"
              percentage={3.1}
              trend="down"
              icon={Fuel}
              iconColor="text-amber-600"
            />
            <SGFKPICard
              title="Alertas Críticos"
              value="03"
              percentage={50}
              trend="down"
              icon={AlertTriangle}
              iconColor="text-red-600"
            />
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* Chart Card */}
            <div className="lg:col-span-2 space-y-10">
              <SGFCard padding="lg">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h4 className="font-bold text-xl text-slate-800">
                      Eficiência por Secretaria
                    </h4>
                    <p className="text-sm text-slate-400 font-medium">
                      Consumo médio km/l por departamento
                    </p>
                  </div>
                  <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                    <button className="px-4 py-2 text-xs font-bold bg-white text-emerald-600 shadow-sm rounded-xl">
                      7 Dias
                    </button>
                    <button className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">
                      30 Dias
                    </button>
                  </div>
                </div>

                {/* Recharts Interactive Chart */}
                <div className="h-80 w-full" style={{ minHeight: '320px', minWidth: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={chartData}
                      margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                    >
                      <defs>
                        <linearGradient id="colorEfficiency" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(160, 100%, 33%)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(160, 100%, 33%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                        axisLine={{ stroke: '#cbd5e1' }}
                      />
                      <YAxis
                        yAxisId="left"
                        tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        label={{ value: 'Eficiência (%)', angle: -90, position: 'insideLeft', style: { fill: '#64748b', fontWeight: 700, fontSize: 12 } }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        label={{ value: 'Consumo (L)', angle: 90, position: 'insideRight', style: { fill: '#64748b', fontWeight: 700, fontSize: 12 } }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          border: 'none',
                          borderRadius: '16px',
                          padding: '12px 16px',
                          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                        }}
                        labelStyle={{ color: '#10b981', fontWeight: 700, marginBottom: '4px' }}
                        itemStyle={{ color: '#f1f5f9', fontSize: '12px', fontWeight: 600 }}
                      />
                      <Legend
                        wrapperStyle={{ paddingTop: '20px' }}
                        iconType="circle"
                        formatter={(value) => (
                          <span style={{ color: '#475569', fontWeight: 600, fontSize: '12px' }}>
                            {value}
                          </span>
                        )}
                      />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="efficiency"
                        fill="url(#colorEfficiency)"
                        stroke="hsl(160, 100%, 33%)"
                        strokeWidth={3}
                        name="Eficiência (%)"
                      />
                      <Bar
                        yAxisId="right"
                        dataKey="consumption"
                        fill="hsl(161, 33%, 60%)"
                        radius={[8, 8, 0, 0]}
                        name="Consumo (L)"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </SGFCard>
            </div>

            {/* Alerts Sidebar */}
            <div className="space-y-6">
              <SGFCard padding="lg">
                <h4 className="font-bold text-xl text-slate-800 mb-6 flex items-center gap-2">
                  <Bell size={20} className="text-[var(--sgf-primary)]" /> Últimas Alertas
                </h4>
                <div className="space-y-4">
                  {ALERTS.map((alert) => (
                    <div
                      key={alert.id}
                      className="group p-4 rounded-3xl border border-slate-50 hover:border-emerald-100 hover:bg-emerald-50/30 transition-all cursor-pointer"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            alert.type === 'critical'
                              ? 'bg-rose-100 text-rose-600'
                              : 'bg-amber-100 text-amber-600'
                          }`}
                        >
                          {alert.type}
                        </span>
                        <span className="text-[10px] text-slate-300 font-bold">
                          {alert.time}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-700 leading-snug group-hover:text-emerald-900 transition-colors">
                        {alert.msg}
                      </p>
                    </div>
                  ))}
                </div>
                <SGFButton
                  variant="ghost"
                  fullWidth
                  className="mt-8 uppercase tracking-widest"
                  size="sm"
                >
                  Ver Central de Alertas
                </SGFButton>
              </SGFCard>
            </div>
          </div>

          {/* Fleet Table */}
          <div className="mt-10">
            <SGFCard padding="none" className="overflow-hidden">
              <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                <div>
                  <h4 className="font-bold text-xl text-slate-800">Monitoramento Ativo</h4>
                  <p className="text-xs text-slate-400 font-medium">
                    Dados processados a cada 30 segundos
                  </p>
                </div>
                <SGFButton variant="outline" icon={Filter} size="sm">
                  Filtros
                </SGFButton>
              </div>

              <SGFTable
                columns={tableColumns}
                data={VEHICLES}
                keyExtractor={(row) => row.id}
                onRowClick={(row) => console.log('Clicked:', row)}
              />
            </SGFCard>
          </div>
        </div>
      )}

      {activeTab === 'map' && (
        <MapPage />
      )}

      {activeTab === 'telemetry' && (
        <TelemetryPage />
      )}

      {activeTab === 'fleet' && (
        <FleetPage />
      )}

      {activeTab === 'drivers' && (
        <DriversPage />
      )}

      {activeTab === 'fuel' && (
        <FuelPage />
      )}

      {activeTab === 'maintenance' && (
        <MaintenancePage />
      )}

      {activeTab === 'reports' && (
        <ReportsPage />
      )}
    </DashboardLayout>
  );
};

export default DashboardExample;