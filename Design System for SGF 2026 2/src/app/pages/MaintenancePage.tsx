/**
 * SGF 2026 - Manutenção
 * Gestão de ordens de serviço e manutenções
 */

import React, { useState } from 'react';
import {
  SGFCard,
  SGFBadge,
  SGFButton,
  SGFTable,
  SGFInput,
  SGFSelect,
  SGFKPICard,
  SGFAlert,
  SGFProgressBar,
} from '@/app/components/sgf';
import {
  Wrench,
  AlertTriangle,
  CheckCircle,
  Clock,
  Plus,
  Search,
  Filter,
  Download,
  Eye,
  Calendar,
  DollarSign,
  TrendingUp,
} from 'lucide-react';

interface MaintenanceOrder {
  id: string;
  orderNumber: string;
  vehicle: string;
  type: 'preventive' | 'corrective' | 'emergency';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  requestDate: string;
  scheduledDate: string;
  completedDate: string | null;
  mechanic: string | null;
  estimatedCost: number;
  actualCost: number | null;
  km: number;
  parts: string[];
}

const MOCK_MAINTENANCE: MaintenanceOrder[] = [
  {
    id: '1',
    orderNumber: 'OS-2026-001',
    vehicle: 'ABC-1234',
    type: 'preventive',
    status: 'completed',
    priority: 'medium',
    description: 'Troca de óleo e filtros - Revisão 50.000 km',
    requestDate: '20/12/2025',
    scheduledDate: '28/12/2025',
    completedDate: '28/12/2025',
    mechanic: 'Roberto Mecânico',
    estimatedCost: 850.0,
    actualCost: 820.0,
    km: 45230,
    parts: ['Óleo 15W40', 'Filtro de óleo', 'Filtro de ar', 'Filtro de combustível'],
  },
  {
    id: '2',
    orderNumber: 'OS-2026-002',
    vehicle: 'SGF-2026',
    type: 'corrective',
    status: 'in_progress',
    priority: 'high',
    description: 'Substituição de pastilhas de freio dianteiras',
    requestDate: '28/12/2025',
    scheduledDate: '02/01/2026',
    completedDate: null,
    mechanic: 'José Silva',
    estimatedCost: 580.0,
    actualCost: null,
    km: 28450,
    parts: ['Pastilhas de freio', 'Fluido de freio DOT4'],
  },
  {
    id: '3',
    orderNumber: 'OS-2026-003',
    vehicle: 'OBR-900',
    type: 'emergency',
    status: 'in_progress',
    priority: 'critical',
    description: 'Reparo urgente em sistema de arrefecimento - Superaquecimento',
    requestDate: '01/01/2026',
    scheduledDate: '01/01/2026',
    completedDate: null,
    mechanic: 'Carlos Técnico',
    estimatedCost: 1850.0,
    actualCost: null,
    km: 89120,
    parts: ['Radiador', 'Mangueiras', 'Aditivo', 'Válvula termostática'],
  },
  {
    id: '4',
    orderNumber: 'OS-2026-004',
    vehicle: 'GOV-5566',
    type: 'preventive',
    status: 'pending',
    priority: 'low',
    description: 'Alinhamento e balanceamento',
    requestDate: '30/12/2025',
    scheduledDate: '05/01/2026',
    completedDate: null,
    mechanic: null,
    estimatedCost: 180.0,
    actualCost: null,
    km: 12580,
    parts: ['Serviço de alinhamento', 'Serviço de balanceamento'],
  },
];

export const MaintenancePage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredOrders = MOCK_MAINTENANCE.filter((order) => {
    const matchesSearch =
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.vehicle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || order.type === filterType;
    const matchesStatus = filterStatus === 'all' || order.status === filterStatus;

    return matchesSearch && matchesType && matchesStatus;
  });

  const typeLabels = {
    preventive: 'Preventiva',
    corrective: 'Corretiva',
    emergency: 'Emergencial',
  };

  const statusLabels = {
    pending: 'Pendente',
    in_progress: 'Em Andamento',
    completed: 'Concluída',
    cancelled: 'Cancelada',
  };

  const priorityLabels = {
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta',
    critical: 'Crítica',
  };

  const tableColumns = [
    {
      header: 'Ordem de Serviço',
      accessor: (row: MaintenanceOrder) => (
        <div>
          <p className="text-sm font-black text-slate-800">{row.orderNumber}</p>
          <p className="text-[11px] text-slate-400">{row.requestDate}</p>
        </div>
      ),
    },
    {
      header: 'Veículo',
      accessor: (row: MaintenanceOrder) => (
        <SGFBadge variant="default" size="sm">
          {row.vehicle}
        </SGFBadge>
      ),
    },
    {
      header: 'Tipo',
      accessor: (row: MaintenanceOrder) => (
        <SGFBadge
          variant={
            row.type === 'emergency'
              ? 'alert'
              : row.type === 'corrective'
              ? 'warning'
              : 'default'
          }
          size="sm"
        >
          {typeLabels[row.type]}
        </SGFBadge>
      ),
    },
    {
      header: 'Prioridade',
      accessor: (row: MaintenanceOrder) => (
        <SGFBadge
          variant={
            row.priority === 'critical' || row.priority === 'high'
              ? 'alert'
              : row.priority === 'medium'
              ? 'warning'
              : 'default'
          }
          size="sm"
        >
          {priorityLabels[row.priority]}
        </SGFBadge>
      ),
    },
    {
      header: 'Descrição',
      accessor: (row: MaintenanceOrder) => (
        <p className="text-sm text-slate-600 max-w-xs truncate">
          {row.description}
        </p>
      ),
    },
    {
      header: 'Status',
      accessor: (row: MaintenanceOrder) => (
        <SGFBadge
          variant={
            row.status === 'completed'
              ? 'success'
              : row.status === 'in_progress'
              ? 'warning'
              : row.status === 'cancelled'
              ? 'default'
              : 'alert'
          }
          dot
          size="sm"
          icon={
            row.status === 'completed'
              ? CheckCircle
              : row.status === 'in_progress'
              ? Clock
              : undefined
          }
        >
          {statusLabels[row.status]}
        </SGFBadge>
      ),
    },
    {
      header: 'Custo Estimado',
      accessor: (row: MaintenanceOrder) => (
        <span className="text-sm font-black text-emerald-600">
          R$ {row.estimatedCost.toFixed(2)}
        </span>
      ),
    },
    {
      header: 'Ações',
      headerClassName: 'text-right',
      className: 'text-right',
      accessor: (row: MaintenanceOrder) => (
        <button className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all opacity-0 group-hover:opacity-100">
          <Eye size={16} />
        </button>
      ),
    },
  ];

  const stats = {
    total: MOCK_MAINTENANCE.length,
    pending: MOCK_MAINTENANCE.filter((m) => m.status === 'pending').length,
    inProgress: MOCK_MAINTENANCE.filter((m) => m.status === 'in_progress').length,
    completed: MOCK_MAINTENANCE.filter((m) => m.status === 'completed').length,
    totalCost: MOCK_MAINTENANCE.reduce((acc, m) => acc + m.estimatedCost, 0),
  };

  return (
    <div className="space-y-8">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <SGFKPICard
          title="Total de OS"
          value={stats.total.toString()}
          icon={Wrench}
          iconColor="text-emerald-600"
        />
        <SGFKPICard
          title="Pendentes"
          value={stats.pending.toString()}
          icon={AlertTriangle}
          iconColor="text-rose-600"
        />
        <SGFKPICard
          title="Em Andamento"
          value={stats.inProgress.toString()}
          icon={Clock}
          iconColor="text-amber-600"
        />
        <SGFKPICard
          title="Concluídas"
          value={stats.completed.toString()}
          percentage={20}
          trend="up"
          icon={CheckCircle}
          iconColor="text-blue-600"
        />
        <SGFKPICard
          title="Custo Total"
          value={`R$ ${(stats.totalCost / 1000).toFixed(1)}k`}
          percentage={8}
          trend="down"
          icon={DollarSign}
          iconColor="text-emerald-600"
        />
      </div>

      {/* Alerts */}
      {MOCK_MAINTENANCE.some((m) => m.priority === 'critical') && (
        <SGFAlert
          variant="error"
          title="Atenção: Manutenções Críticas"
          message="Existem manutenções críticas aguardando atendimento. Priorize estas ordens de serviço."
          dismissible
        />
      )}

      {/* Filters */}
      <SGFCard padding="lg">
        <div className="flex flex-col lg:flex-row gap-4 items-end">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
            <SGFInput
              label="Buscar"
              placeholder="OS, veículo ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={Search}
            />

            <SGFSelect
              label="Tipo de Manutenção"
              value={filterType}
              onChange={setFilterType}
              options={[
                { value: 'all', label: 'Todos os Tipos' },
                { value: 'preventive', label: 'Preventiva' },
                { value: 'corrective', label: 'Corretiva' },
                { value: 'emergency', label: 'Emergencial' },
              ]}
            />

            <SGFSelect
              label="Status"
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: 'all', label: 'Todos os Status' },
                { value: 'pending', label: 'Pendentes' },
                { value: 'in_progress', label: 'Em Andamento' },
                { value: 'completed', label: 'Concluídas' },
                { value: 'cancelled', label: 'Canceladas' },
              ]}
            />
          </div>

          <div className="flex gap-3">
            <SGFButton variant="outline" icon={Calendar} size="md">
              Período
            </SGFButton>
            <SGFButton variant="primary" icon={Plus} size="md">
              Nova OS
            </SGFButton>
          </div>
        </div>
      </SGFCard>

      {/* Maintenance Orders Table */}
      <SGFCard padding="none" className="overflow-hidden">
        <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
          <div>
            <h4 className="font-bold text-xl text-slate-800">
              Ordens de Serviço
            </h4>
            <p className="text-xs text-slate-400 font-medium">
              {filteredOrders.length} ordem(ns) encontrada(s)
            </p>
          </div>
          <SGFButton variant="outline" icon={Download} size="sm">
            Exportar Relatório
          </SGFButton>
        </div>

        <SGFTable
          columns={tableColumns}
          data={filteredOrders}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => console.log('Clicked maintenance order:', row)}
        />
      </SGFCard>

      {/* Additional Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* By Type */}
        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Por Tipo de Manutenção
          </h4>
          <div className="space-y-4">
            {[
              {
                type: 'Preventiva',
                count: MOCK_MAINTENANCE.filter((m) => m.type === 'preventive')
                  .length,
              },
              {
                type: 'Corretiva',
                count: MOCK_MAINTENANCE.filter((m) => m.type === 'corrective')
                  .length,
              },
              {
                type: 'Emergencial',
                count: MOCK_MAINTENANCE.filter((m) => m.type === 'emergency')
                  .length,
              },
            ].map((item) => (
              <div key={item.type}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-slate-600">
                    {item.type}
                  </span>
                  <span className="text-sm font-black text-slate-800">
                    {item.count}
                  </span>
                </div>
                <SGFProgressBar
                  value={(item.count / stats.total) * 100}
                  variant="default"
                  size="md"
                />
              </div>
            ))}
          </div>
        </SGFCard>

        {/* Top Costs */}
        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Maiores Custos
          </h4>
          <div className="space-y-3">
            {MOCK_MAINTENANCE.sort((a, b) => b.estimatedCost - a.estimatedCost)
              .slice(0, 3)
              .map((order) => (
                <div
                  key={order.id}
                  className="p-3 bg-slate-50 rounded-2xl hover:bg-emerald-50 transition-all cursor-pointer"
                >
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-sm font-black text-slate-800">
                      {order.orderNumber}
                    </p>
                    <p className="text-sm font-black text-emerald-600">
                      R$ {order.estimatedCost.toFixed(2)}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    {order.description}
                  </p>
                  <div className="mt-2">
                    <SGFBadge variant="default" size="sm">
                      {order.vehicle}
                    </SGFBadge>
                  </div>
                </div>
              ))}
          </div>
        </SGFCard>

        {/* Mechanics Performance */}
        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Mecânicos Ativos
          </h4>
          <div className="space-y-3">
            {[
              { name: 'Roberto Mecânico', orders: 1, status: 'available' },
              { name: 'José Silva', orders: 1, status: 'busy' },
              { name: 'Carlos Técnico', orders: 1, status: 'busy' },
            ].map((mechanic) => (
              <div
                key={mechanic.name}
                className="flex justify-between items-center p-3 bg-slate-50 rounded-2xl"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      mechanic.status === 'available'
                        ? 'bg-emerald-500'
                        : 'bg-amber-500'
                    }`}
                  />
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      {mechanic.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {mechanic.orders} OS ativa(s)
                    </p>
                  </div>
                </div>
                <SGFBadge
                  variant={mechanic.status === 'available' ? 'success' : 'warning'}
                  size="sm"
                >
                  {mechanic.status === 'available' ? 'Disponível' : 'Ocupado'}
                </SGFBadge>
              </div>
            ))}
          </div>
        </SGFCard>
      </div>
    </div>
  );
};

export default MaintenancePage;
