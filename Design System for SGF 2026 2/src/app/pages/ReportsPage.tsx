/**
 * SGF 2026 - Relatórios & Auditoria
 * Geração de relatórios e análises
 */

import React, { useState } from 'react';
import {
  SGFCard,
  SGFBadge,
  SGFButton,
  SGFSelect,
  SGFKPICard,
} from '@/app/components/sgf';
import {
  FileText,
  Download,
  Calendar,
  TrendingUp,
  DollarSign,
  Fuel,
  Wrench,
  FileSpreadsheet,
  FilePlus,
  Eye,
  Printer,
  Mail,
  BarChart3,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const costByDepartment = [
  { name: 'Obras', fuel: 15420, maintenance: 8750, total: 24170 },
  { name: 'Saúde', fuel: 8920, maintenance: 4250, total: 13170 },
  { name: 'Educação', fuel: 5680, maintenance: 2890, total: 8570 },
  { name: 'Gabinete', fuel: 3240, maintenance: 1560, total: 4800 },
  { name: 'Social', fuel: 4150, maintenance: 2340, total: 6490 },
];

const monthlyTrend = [
  { month: 'Jul', cost: 45200 },
  { month: 'Ago', cost: 48650 },
  { month: 'Set', cost: 42300 },
  { month: 'Out', cost: 51200 },
  { month: 'Nov', cost: 53800 },
  { month: 'Dez', cost: 57200 },
];

const vehicleUsage = [
  { name: 'Ativos', value: 128, color: 'hsl(160, 100%, 33%)' },
  { name: 'Manutenção', value: 12, color: 'hsl(32, 98%, 58%)' },
  { name: 'Inativos', value: 8, color: 'hsl(215, 20%, 65%)' },
];

interface Report {
  id: string;
  title: string;
  type: 'fuel' | 'maintenance' | 'fleet' | 'financial' | 'audit';
  description: string;
  period: string;
  generatedDate: string;
  format: 'PDF' | 'Excel' | 'CSV';
  size: string;
  status: 'ready' | 'processing' | 'scheduled';
}

const MOCK_REPORTS: Report[] = [
  {
    id: '1',
    title: 'Relatório de Abastecimentos - Dezembro/2025',
    type: 'fuel',
    description: 'Análise completa de consumo e custos de combustível',
    period: 'Dezembro/2025',
    generatedDate: '01/01/2026',
    format: 'PDF',
    size: '2.4 MB',
    status: 'ready',
  },
  {
    id: '2',
    title: 'Ordens de Serviço - 4º Trimestre 2025',
    type: 'maintenance',
    description: 'Histórico de manutenções preventivas e corretivas',
    period: 'Out-Dez/2025',
    generatedDate: '30/12/2025',
    format: 'Excel',
    size: '1.8 MB',
    status: 'ready',
  },
  {
    id: '3',
    title: 'Auditoria de Viagens - Obras Públicas',
    type: 'audit',
    description: 'Rastreamento e validação de rotas e horários',
    period: 'Dezembro/2025',
    generatedDate: '28/12/2025',
    format: 'PDF',
    size: '5.2 MB',
    status: 'ready',
  },
  {
    id: '4',
    title: 'Análise Financeira - Consolidado Anual',
    type: 'financial',
    description: 'Custos totais por secretaria e categoria',
    period: '2025',
    generatedDate: 'Processando...',
    format: 'Excel',
    size: '-',
    status: 'processing',
  },
];

export const ReportsPage: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('current_month');
  const [selectedDept, setSelectedDept] = useState('all');

  const reportTypeIcons = {
    fuel: Fuel,
    maintenance: Wrench,
    fleet: FileText,
    financial: DollarSign,
    audit: BarChart3,
  };

  const reportTypeLabels = {
    fuel: 'Combustível',
    maintenance: 'Manutenção',
    fleet: 'Frota',
    financial: 'Financeiro',
    audit: 'Auditoria',
  };

  return (
    <div className="space-y-8">
      {/* Period Selector */}
      <SGFCard padding="lg">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <SGFSelect
              label="Período de Análise"
              value={selectedPeriod}
              onChange={setSelectedPeriod}
              options={[
                { value: 'current_month', label: 'Mês Atual' },
                { value: 'last_month', label: 'Mês Anterior' },
                { value: 'quarter', label: 'Trimestre' },
                { value: 'semester', label: 'Semestre' },
                { value: 'year', label: 'Ano' },
                { value: 'custom', label: 'Personalizado' },
              ]}
            />
          </div>

          <div>
            <SGFSelect
              label="Departamento"
              value={selectedDept}
              onChange={setSelectedDept}
              options={[
                { value: 'all', label: 'Todos os Departamentos' },
                { value: 'obras', label: 'Obras Públicas' },
                { value: 'saude', label: 'Saúde' },
                { value: 'educacao', label: 'Educação' },
                { value: 'gabinete', label: 'Gabinete' },
                { value: 'social', label: 'Social' },
              ]}
            />
          </div>

          <div className="flex items-end">
            <SGFButton variant="primary" icon={Download} fullWidth>
              Gerar Relatório Personalizado
            </SGFButton>
          </div>
        </div>
      </SGFCard>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SGFKPICard
          title="Custo Total (Mês)"
          value="R$ 57,2k"
          percentage={6.2}
          trend="up"
          icon={DollarSign}
          iconColor="text-emerald-600"
        />
        <SGFKPICard
          title="Combustível"
          value="R$ 37,4k"
          percentage={8.5}
          trend="up"
          icon={Fuel}
          iconColor="text-blue-600"
        />
        <SGFKPICard
          title="Manutenção"
          value="R$ 19,8k"
          percentage={3.2}
          trend="down"
          icon={Wrench}
          iconColor="text-amber-600"
        />
        <SGFKPICard
          title="Relatórios Gerados"
          value="24"
          percentage={15}
          trend="up"
          icon={FileText}
          iconColor="text-rose-600"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Cost by Department */}
        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Custos por Departamento
          </h4>
          <div style={{ minHeight: '300px', minWidth: '300px' }}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={costByDepartment}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                />
                <YAxis tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '8px 12px',
                  }}
                  labelStyle={{ color: '#10b981', fontWeight: 700 }}
                  itemStyle={{ color: '#f1f5f9', fontSize: '11px', fontWeight: 600 }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: '10px' }}
                  iconType="circle"
                  formatter={(value) => (
                    <span style={{ color: '#475569', fontWeight: 600, fontSize: '12px' }}>
                      {value}
                    </span>
                  )}
                />
                <Bar
                  dataKey="fuel"
                  fill="hsl(160, 100%, 33%)"
                  radius={[4, 4, 0, 0]}
                  name="Combustível (R$)"
                />
                <Bar
                  dataKey="maintenance"
                  fill="hsl(32, 98%, 58%)"
                  radius={[4, 4, 0, 0]}
                  name="Manutenção (R$)"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SGFCard>

        {/* Monthly Trend */}
        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Tendência de Custos (6 meses)
          </h4>
          <div style={{ minHeight: '300px', minWidth: '300px' }}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                />
                <YAxis tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '8px 12px',
                  }}
                  labelStyle={{ color: '#10b981', fontWeight: 700 }}
                  itemStyle={{ color: '#f1f5f9', fontSize: '11px', fontWeight: 600 }}
                />
                <Line
                  type="monotone"
                  dataKey="cost"
                  stroke="hsl(160, 100%, 33%)"
                  strokeWidth={3}
                  dot={{ fill: 'hsl(160, 100%, 33%)', r: 5 }}
                  name="Custo Total (R$)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SGFCard>

        {/* Vehicle Usage Pie */}
        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Status da Frota
          </h4>
          <div style={{ minHeight: '300px', minWidth: '300px' }}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={vehicleUsage}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {vehicleUsage.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '8px 12px',
                  }}
                  itemStyle={{ color: '#f1f5f9', fontSize: '11px', fontWeight: 600 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SGFCard>

        {/* Top Costs */}
        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Departamentos - Ranking de Custos
          </h4>
          <div className="space-y-4 pt-4">
            {costByDepartment
              .sort((a, b) => b.total - a.total)
              .map((dept, index) => (
                <div key={dept.name}>
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${
                          index === 0
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {index + 1}
                      </div>
                      <span className="text-sm font-bold text-slate-600">
                        {dept.name}
                      </span>
                    </div>
                    <span className="text-sm font-black text-slate-800">
                      R$ {(dept.total / 1000).toFixed(1)}k
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div
                      className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${(dept.total / costByDepartment[0].total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </SGFCard>
      </div>

      {/* Quick Reports */}
      <SGFCard padding="lg">
        <h4 className="font-bold text-xl text-slate-800 mb-6">
          Relatórios Rápidos
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              title: 'Abastecimentos',
              icon: Fuel,
              description: 'Últimos 30 dias',
              color: 'text-blue-600',
              bg: 'bg-blue-50',
            },
            {
              title: 'Manutenções',
              icon: Wrench,
              description: 'Ordens concluídas',
              color: 'text-amber-600',
              bg: 'bg-amber-50',
            },
            {
              title: 'Viagens',
              icon: BarChart3,
              description: 'Histórico completo',
              color: 'text-emerald-600',
              bg: 'bg-emerald-50',
            },
            {
              title: 'Financeiro',
              icon: DollarSign,
              description: 'Consolidado mensal',
              color: 'text-rose-600',
              bg: 'bg-rose-50',
            },
          ].map((report) => (
            <button
              key={report.title}
              className="p-6 bg-slate-50 rounded-2xl hover:shadow-lg transition-all border-2 border-transparent hover:border-emerald-200 group text-left"
            >
              <div
                className={`w-14 h-14 ${report.bg} rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-all`}
              >
                <report.icon size={28} className={report.color} />
              </div>
              <h5 className="font-bold text-slate-800 mb-1">{report.title}</h5>
              <p className="text-xs text-slate-400 mb-4">{report.description}</p>
              <div className="flex gap-2">
                <SGFButton variant="outline" size="sm" icon={Download}>
                  PDF
                </SGFButton>
                <SGFButton variant="ghost" size="sm" icon={FileSpreadsheet}>
                  Excel
                </SGFButton>
              </div>
            </button>
          ))}
        </div>
      </SGFCard>

      {/* Generated Reports */}
      <SGFCard padding="lg">
        <div className="flex justify-between items-center mb-6">
          <h4 className="font-bold text-xl text-slate-800">
            Relatórios Gerados Recentemente
          </h4>
          <SGFButton variant="outline" icon={FilePlus} size="sm">
            Novo Relatório
          </SGFButton>
        </div>

        <div className="space-y-3">
          {MOCK_REPORTS.map((report) => {
            const Icon = reportTypeIcons[report.type];

            return (
              <div
                key={report.id}
                className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-emerald-50 transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center group-hover:bg-emerald-100 transition-all">
                    <Icon size={24} className="text-emerald-600" />
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-black text-slate-800">
                      {report.title}
                    </p>
                    <p className="text-xs text-slate-400">{report.description}</p>
                    <div className="flex gap-3 mt-2">
                      <SGFBadge variant="default" size="sm">
                        {reportTypeLabels[report.type]}
                      </SGFBadge>
                      <span className="text-xs text-slate-400">
                        {report.period}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <SGFBadge
                      variant={
                        report.status === 'ready'
                          ? 'success'
                          : report.status === 'processing'
                          ? 'warning'
                          : 'default'
                      }
                      size="sm"
                    >
                      {report.status === 'ready'
                        ? 'Pronto'
                        : report.status === 'processing'
                        ? 'Processando'
                        : 'Agendado'}
                    </SGFBadge>
                    <p className="text-xs text-slate-400 mt-1">
                      {report.format} • {report.size}
                    </p>
                  </div>
                </div>

                {report.status === 'ready' && (
                  <div className="flex gap-2 ml-4 opacity-0 group-hover:opacity-100 transition-all">
                    <button className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-100 rounded-xl transition-all">
                      <Eye size={18} />
                    </button>
                    <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded-xl transition-all">
                      <Download size={18} />
                    </button>
                    <button className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-100 rounded-xl transition-all">
                      <Printer size={18} />
                    </button>
                    <button className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-100 rounded-xl transition-all">
                      <Mail size={18} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SGFCard>
    </div>
  );
};

export default ReportsPage;
