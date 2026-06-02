/**
 * SGF 2026 - Frota Municipal
 * Gestão completa de veículos da frota
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
  SGFProgressBar,
  SGFAlert,
} from '@/app/components/sgf';
import {
  Truck,
  Plus,
  Search,
  Filter,
  Download,
  Edit,
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  MoreHorizontal,
} from 'lucide-react';

interface Vehicle {
  id: string;
  plate: string;
  model: string;
  year: number;
  type: 'light' | 'heavy' | 'utility';
  dept: string;
  status: 'active' | 'maintenance' | 'inactive';
  km: number;
  lastMaintenance: string;
  nextMaintenance: string;
  fuel: number;
  documents: 'ok' | 'expiring' | 'expired';
}

const MOCK_VEHICLES: Vehicle[] = [
  {
    id: '1',
    plate: 'ABC-1234',
    model: 'VW Constellation 24.280',
    year: 2023,
    type: 'heavy',
    dept: 'Obras Públicas',
    status: 'active',
    km: 45230,
    lastMaintenance: '15/12/2025',
    nextMaintenance: '15/03/2026',
    fuel: 75,
    documents: 'ok',
  },
  {
    id: '2',
    plate: 'SGF-2026',
    model: 'Toyota Hilux SRV 4x4',
    year: 2024,
    type: 'utility',
    dept: 'Saúde',
    status: 'active',
    km: 28450,
    lastMaintenance: '20/11/2025',
    nextMaintenance: '20/02/2026',
    fuel: 42,
    documents: 'ok',
  },
  {
    id: '3',
    plate: 'OBR-900',
    model: 'Mercedes-Benz Axor 2644',
    year: 2022,
    type: 'heavy',
    dept: 'Obras Públicas',
    status: 'maintenance',
    km: 89120,
    lastMaintenance: '05/01/2026',
    nextMaintenance: '05/04/2026',
    fuel: 15,
    documents: 'expiring',
  },
  {
    id: '4',
    plate: 'GOV-5566',
    model: 'Fiat Cronos 1.8',
    year: 2023,
    type: 'light',
    dept: 'Gabinete',
    status: 'active',
    km: 12580,
    lastMaintenance: '10/12/2025',
    nextMaintenance: '10/06/2026',
    fuel: 5,
    documents: 'ok',
  },
  {
    id: '5',
    plate: 'EDU-7788',
    model: 'Volkswagen Kombi',
    year: 2021,
    type: 'utility',
    dept: 'Educação',
    status: 'inactive',
    km: 156340,
    lastMaintenance: '02/10/2025',
    nextMaintenance: 'Aguardando',
    fuel: 0,
    documents: 'expired',
  },
];

export const FleetPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredVehicles = MOCK_VEHICLES.filter((vehicle) => {
    const matchesSearch =
      vehicle.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vehicle.model.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = filterDept === 'all' || vehicle.dept === filterDept;
    const matchesStatus = filterStatus === 'all' || vehicle.status === filterStatus;

    return matchesSearch && matchesDept && matchesStatus;
  });

  const vehicleTypeLabels = {
    light: 'Leve',
    heavy: 'Pesado',
    utility: 'Utilitário',
  };

  const tableColumns = [
    {
      header: 'Veículo',
      accessor: (row: Vehicle) => (
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-[var(--sgf-primary)] group-hover:text-white transition-all duration-500">
            <Truck size={24} />
          </div>
          <div>
            <p className="text-sm font-black text-slate-800">{row.plate}</p>
            <p className="text-[11px] text-slate-400 font-medium">
              {row.model} • {row.year}
            </p>
          </div>
        </div>
      ),
    },
    {
      header: 'Tipo',
      accessor: (row: Vehicle) => (
        <SGFBadge variant="default" size="sm">
          {vehicleTypeLabels[row.type]}
        </SGFBadge>
      ),
    },
    {
      header: 'Departamento',
      accessor: (row: Vehicle) => (
        <span className="text-sm font-bold text-slate-600">{row.dept}</span>
      ),
    },
    {
      header: 'Status',
      accessor: (row: Vehicle) => (
        <SGFBadge
          variant={
            row.status === 'active'
              ? 'success'
              : row.status === 'maintenance'
              ? 'warning'
              : 'default'
          }
          dot
          size="sm"
        >
          {row.status === 'active'
            ? 'Ativo'
            : row.status === 'maintenance'
            ? 'Manutenção'
            : 'Inativo'}
        </SGFBadge>
      ),
    },
    {
      header: 'Quilometragem',
      accessor: (row: Vehicle) => (
        <span className="text-sm font-black text-slate-700">
          {row.km.toLocaleString('pt-BR')}{' '}
          <span className="text-[10px] text-slate-400 uppercase">km</span>
        </span>
      ),
    },
    {
      header: 'Documentos',
      accessor: (row: Vehicle) => (
        <SGFBadge
          variant={
            row.documents === 'ok'
              ? 'success'
              : row.documents === 'expiring'
              ? 'warning'
              : 'alert'
          }
          size="sm"
          icon={
            row.documents === 'ok'
              ? CheckCircle
              : row.documents === 'expiring'
              ? Clock
              : AlertTriangle
          }
        >
          {row.documents === 'ok'
            ? 'OK'
            : row.documents === 'expiring'
            ? 'Vencendo'
            : 'Vencido'}
        </SGFBadge>
      ),
    },
    {
      header: 'Ações',
      headerClassName: 'text-right',
      className: 'text-right',
      accessor: (row: Vehicle) => (
        <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-all">
          <button className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all">
            <Eye size={16} />
          </button>
          <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all">
            <Edit size={16} />
          </button>
          <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
            <MoreHorizontal size={16} />
          </button>
        </div>
      ),
    },
  ];

  const stats = {
    total: MOCK_VEHICLES.length,
    active: MOCK_VEHICLES.filter((v) => v.status === 'active').length,
    maintenance: MOCK_VEHICLES.filter((v) => v.status === 'maintenance').length,
    docsIssue: MOCK_VEHICLES.filter((v) => v.documents !== 'ok').length,
  };

  return (
    <div className="space-y-8">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SGFKPICard
          title="Total de Veículos"
          value={stats.total.toString()}
          icon={Truck}
          iconColor="text-emerald-600"
        />
        <SGFKPICard
          title="Veículos Ativos"
          value={stats.active.toString()}
          percentage={15}
          trend="up"
          icon={CheckCircle}
          iconColor="text-blue-600"
        />
        <SGFKPICard
          title="Em Manutenção"
          value={stats.maintenance.toString()}
          icon={AlertTriangle}
          iconColor="text-amber-600"
        />
        <SGFKPICard
          title="Docs. Vencidos"
          value={stats.docsIssue.toString()}
          percentage={25}
          trend="down"
          icon={Clock}
          iconColor="text-rose-600"
        />
      </div>

      {/* Filters and Actions */}
      <SGFCard padding="lg">
        <div className="flex flex-col lg:flex-row gap-4 items-end">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
            <SGFInput
              label="Buscar Veículo"
              placeholder="Placa ou modelo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={Search}
            />

            <SGFSelect
              label="Departamento"
              value={filterDept}
              onChange={setFilterDept}
              options={[
                { value: 'all', label: 'Todos os Departamentos' },
                { value: 'Obras Públicas', label: 'Obras Públicas' },
                { value: 'Saúde', label: 'Saúde' },
                { value: 'Educação', label: 'Educação' },
                { value: 'Gabinete', label: 'Gabinete' },
              ]}
            />

            <SGFSelect
              label="Status"
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: 'all', label: 'Todos os Status' },
                { value: 'active', label: 'Ativos' },
                { value: 'maintenance', label: 'Em Manutenção' },
                { value: 'inactive', label: 'Inativos' },
              ]}
            />
          </div>

          <div className="flex gap-3">
            <SGFButton variant="outline" icon={Filter} size="md">
              Filtros Avançados
            </SGFButton>
            <SGFButton variant="primary" icon={Plus} size="md">
              Novo Veículo
            </SGFButton>
          </div>
        </div>
      </SGFCard>

      {/* Alerts */}
      {stats.docsIssue > 0 && (
        <SGFAlert
          variant="warning"
          title="Atenção: Documentos Vencidos"
          message={`${stats.docsIssue} veículo(s) com documentação vencida ou vencendo. Regularize para evitar multas.`}
          dismissible
        />
      )}

      {/* Vehicles Table */}
      <SGFCard padding="none" className="overflow-hidden">
        <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
          <div>
            <h4 className="font-bold text-xl text-slate-800">
              Cadastro de Veículos
            </h4>
            <p className="text-xs text-slate-400 font-medium">
              {filteredVehicles.length} veículo(s) encontrado(s)
            </p>
          </div>
          <SGFButton variant="outline" icon={Download} size="sm">
            Exportar Excel
          </SGFButton>
        </div>

        <SGFTable
          columns={tableColumns}
          data={filteredVehicles}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => console.log('Clicked vehicle:', row)}
        />
      </SGFCard>

      {/* Vehicle Details Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Por Tipo de Veículo
          </h4>
          <div className="space-y-4">
            {[
              { type: 'Pesados', count: 2, color: 'bg-emerald-500' },
              { type: 'Utilitários', count: 2, color: 'bg-blue-500' },
              { type: 'Leves', count: 1, color: 'bg-amber-500' },
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

        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Por Departamento
          </h4>
          <div className="space-y-3">
            {[
              { dept: 'Obras Públicas', count: 2 },
              { dept: 'Saúde', count: 1 },
              { dept: 'Educação', count: 1 },
              { dept: 'Gabinete', count: 1 },
            ].map((item) => (
              <div
                key={item.dept}
                className="flex justify-between items-center p-3 bg-slate-50 rounded-2xl"
              >
                <span className="text-sm font-bold text-slate-600">
                  {item.dept}
                </span>
                <SGFBadge variant="default" size="sm">
                  {item.count}
                </SGFBadge>
              </div>
            ))}
          </div>
        </SGFCard>

        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Manutenções Próximas
          </h4>
          <div className="space-y-3">
            {MOCK_VEHICLES.slice(0, 3).map((vehicle) => (
              <div
                key={vehicle.id}
                className="p-3 bg-slate-50 rounded-2xl hover:bg-emerald-50 transition-all cursor-pointer"
              >
                <div className="flex justify-between items-start mb-1">
                  <p className="text-sm font-black text-slate-800">
                    {vehicle.plate}
                  </p>
                  <span className="text-[10px] text-slate-400 font-bold">
                    {vehicle.nextMaintenance}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{vehicle.model}</p>
              </div>
            ))}
          </div>
        </SGFCard>
      </div>
    </div>
  );
};

export default FleetPage;
