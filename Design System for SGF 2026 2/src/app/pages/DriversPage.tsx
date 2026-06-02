/**
 * SGF 2026 - Motoristas
 * Gestão completa de motoristas
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
} from '@/app/components/sgf';
import {
  Users,
  UserCheck,
  UserX,
  AlertTriangle,
  Plus,
  Search,
  Filter,
  Download,
  Edit,
  Eye,
  Phone,
  Mail,
  Award,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

interface Driver {
  id: string;
  name: string;
  cpf: string;
  cnh: string;
  category: string;
  dept: string;
  status: 'active' | 'suspended' | 'vacation' | 'inactive';
  phone: string;
  email: string;
  currentVehicle: string | null;
  violations: number;
  trips: number;
  score: number;
  cnhExpiry: string;
  lastTrip: string;
}

const MOCK_DRIVERS: Driver[] = [
  {
    id: '1',
    name: 'João Silva',
    cpf: '123.456.789-00',
    cnh: '12345678900',
    category: 'D',
    dept: 'Obras Públicas',
    status: 'active',
    phone: '(11) 98765-4321',
    email: 'joao.silva@cidade.gov.br',
    currentVehicle: 'ABC-1234',
    violations: 0,
    trips: 342,
    score: 98,
    cnhExpiry: '15/08/2027',
    lastTrip: '02/01/2026',
  },
  {
    id: '2',
    name: 'Maria Santos',
    cpf: '234.567.890-11',
    cnh: '23456789011',
    category: 'B',
    dept: 'Saúde',
    status: 'active',
    phone: '(11) 98765-1234',
    email: 'maria.santos@cidade.gov.br',
    currentVehicle: 'SGF-2026',
    violations: 1,
    trips: 156,
    score: 92,
    cnhExpiry: '20/03/2026',
    lastTrip: '02/01/2026',
  },
  {
    id: '3',
    name: 'Carlos Lima',
    cpf: '345.678.901-22',
    cnh: '34567890122',
    category: 'E',
    dept: 'Obras Públicas',
    status: 'active',
    phone: '(11) 98765-5678',
    email: 'carlos.lima@cidade.gov.br',
    currentVehicle: null,
    violations: 2,
    trips: 521,
    score: 85,
    cnhExpiry: '10/11/2026',
    lastTrip: '28/12/2025',
  },
  {
    id: '4',
    name: 'Ana Paula Costa',
    cpf: '456.789.012-33',
    cnh: '45678901233',
    category: 'B',
    dept: 'Gabinete',
    status: 'active',
    phone: '(11) 98765-9012',
    email: 'ana.costa@cidade.gov.br',
    currentVehicle: 'GOV-5566',
    violations: 0,
    trips: 89,
    score: 100,
    cnhExpiry: '05/07/2028',
    lastTrip: '02/01/2026',
  },
  {
    id: '5',
    name: 'Roberto Oliveira',
    cpf: '567.890.123-44',
    cnh: '56789012344',
    category: 'C',
    dept: 'Educação',
    status: 'suspended',
    phone: '(11) 98765-3456',
    email: 'roberto.oliveira@cidade.gov.br',
    currentVehicle: null,
    violations: 5,
    trips: 234,
    score: 62,
    cnhExpiry: '15/02/2026',
    lastTrip: '15/12/2025',
  },
];

export const DriversPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredDrivers = MOCK_DRIVERS.filter((driver) => {
    const matchesSearch =
      driver.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.cpf.includes(searchTerm) ||
      driver.cnh.includes(searchTerm);
    const matchesDept = filterDept === 'all' || driver.dept === filterDept;
    const matchesStatus = filterStatus === 'all' || driver.status === filterStatus;

    return matchesSearch && matchesDept && matchesStatus;
  });

  const tableColumns = [
    {
      header: 'Motorista',
      accessor: (row: Driver) => (
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg group-hover:scale-110 transition-all duration-500">
            {row.name
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')}
          </div>
          <div>
            <p className="text-sm font-black text-slate-800">{row.name}</p>
            <p className="text-[11px] text-slate-400 font-medium">
              CNH: {row.cnh} • Cat. {row.category}
            </p>
          </div>
        </div>
      ),
    },
    {
      header: 'Departamento',
      accessor: (row: Driver) => (
        <span className="text-sm font-bold text-slate-600">{row.dept}</span>
      ),
    },
    {
      header: 'Status',
      accessor: (row: Driver) => (
        <SGFBadge
          variant={
            row.status === 'active'
              ? 'success'
              : row.status === 'suspended'
              ? 'alert'
              : 'default'
          }
          dot
          size="sm"
        >
          {row.status === 'active'
            ? 'Ativo'
            : row.status === 'suspended'
            ? 'Suspenso'
            : row.status === 'vacation'
            ? 'Férias'
            : 'Inativo'}
        </SGFBadge>
      ),
    },
    {
      header: 'Veículo Atual',
      accessor: (row: Driver) =>
        row.currentVehicle ? (
          <SGFBadge variant="default" size="sm">
            {row.currentVehicle}
          </SGFBadge>
        ) : (
          <span className="text-xs text-slate-400">Sem veículo</span>
        ),
    },
    {
      header: 'Performance',
      accessor: (row: Driver) => (
        <div className="flex items-center gap-3">
          <div className="w-16">
            <SGFProgressBar
              value={row.score}
              max={100}
              variant={row.score >= 90 ? 'success' : row.score >= 70 ? 'default' : 'error'}
              size="sm"
            />
          </div>
          <span className="text-sm font-black text-slate-700">{row.score}</span>
          {row.score >= 90 ? (
            <Award size={16} className="text-amber-500" />
          ) : null}
        </div>
      ),
    },
    {
      header: 'Infrações',
      accessor: (row: Driver) => (
        <div className="flex items-center gap-2">
          {row.violations > 0 ? (
            <AlertTriangle size={16} className="text-rose-500" />
          ) : null}
          <span
            className={`text-sm font-black ${
              row.violations > 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            {row.violations}
          </span>
        </div>
      ),
    },
    {
      header: 'Viagens',
      accessor: (row: Driver) => (
        <span className="text-sm font-black text-slate-700">{row.trips}</span>
      ),
    },
    {
      header: 'Ações',
      headerClassName: 'text-right',
      className: 'text-right',
      accessor: (row: Driver) => (
        <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-all">
          <button className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all">
            <Eye size={16} />
          </button>
          <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all">
            <Edit size={16} />
          </button>
        </div>
      ),
    },
  ];

  const stats = {
    total: MOCK_DRIVERS.length,
    active: MOCK_DRIVERS.filter((d) => d.status === 'active').length,
    suspended: MOCK_DRIVERS.filter((d) => d.status === 'suspended').length,
    avgScore: Math.round(
      MOCK_DRIVERS.reduce((acc, d) => acc + d.score, 0) / MOCK_DRIVERS.length
    ),
  };

  return (
    <div className="space-y-8">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SGFKPICard
          title="Total de Motoristas"
          value={stats.total.toString()}
          icon={Users}
          iconColor="text-emerald-600"
        />
        <SGFKPICard
          title="Motoristas Ativos"
          value={stats.active.toString()}
          percentage={12}
          trend="up"
          icon={UserCheck}
          iconColor="text-blue-600"
        />
        <SGFKPICard
          title="Suspensos"
          value={stats.suspended.toString()}
          percentage={20}
          trend="down"
          icon={UserX}
          iconColor="text-rose-600"
        />
        <SGFKPICard
          title="Performance Média"
          value={stats.avgScore.toString()}
          percentage={5}
          trend="up"
          icon={Award}
          iconColor="text-amber-600"
        />
      </div>

      {/* Filters */}
      <SGFCard padding="lg">
        <div className="flex flex-col lg:flex-row gap-4 items-end">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
            <SGFInput
              label="Buscar Motorista"
              placeholder="Nome, CPF ou CNH..."
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
                { value: 'suspended', label: 'Suspensos' },
                { value: 'vacation', label: 'Em Férias' },
                { value: 'inactive', label: 'Inativos' },
              ]}
            />
          </div>

          <div className="flex gap-3">
            <SGFButton variant="outline" icon={Filter} size="md">
              Filtros Avançados
            </SGFButton>
            <SGFButton variant="primary" icon={Plus} size="md">
              Novo Motorista
            </SGFButton>
          </div>
        </div>
      </SGFCard>

      {/* Drivers Table */}
      <SGFCard padding="none" className="overflow-hidden">
        <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
          <div>
            <h4 className="font-bold text-xl text-slate-800">
              Cadastro de Motoristas
            </h4>
            <p className="text-xs text-slate-400 font-medium">
              {filteredDrivers.length} motorista(s) encontrado(s)
            </p>
          </div>
          <SGFButton variant="outline" icon={Download} size="sm">
            Exportar Excel
          </SGFButton>
        </div>

        <SGFTable
          columns={tableColumns}
          data={filteredDrivers}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => console.log('Clicked driver:', row)}
        />
      </SGFCard>

      {/* Additional Info Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Performers */}
        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6 flex items-center gap-2">
            <Award size={20} className="text-amber-500" />
            Melhores Condutores
          </h4>
          <div className="space-y-3">
            {MOCK_DRIVERS.sort((a, b) => b.score - a.score)
              .slice(0, 3)
              .map((driver, index) => (
                <div
                  key={driver.id}
                  className="flex items-center gap-3 p-3 bg-gradient-to-r from-amber-50 to-transparent rounded-2xl"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${
                      index === 0
                        ? 'bg-amber-400 text-white'
                        : index === 1
                        ? 'bg-slate-300 text-white'
                        : 'bg-amber-200 text-amber-800'
                    }`}
                  >
                    {index + 1}º
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-black text-slate-800">
                      {driver.name}
                    </p>
                    <p className="text-xs text-slate-400">{driver.dept}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-emerald-600">
                      {driver.score}
                    </p>
                    <p className="text-[10px] text-slate-400">pontos</p>
                  </div>
                </div>
              ))}
          </div>
        </SGFCard>

        {/* CNH Expiring */}
        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6 flex items-center gap-2">
            <AlertTriangle size={20} className="text-amber-500" />
            CNH Vencendo
          </h4>
          <div className="space-y-3">
            {MOCK_DRIVERS.filter((d) => {
              const expiry = new Date(d.cnhExpiry.split('/').reverse().join('-'));
              const today = new Date();
              const diffDays = Math.floor(
                (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
              );
              return diffDays < 90 && diffDays > 0;
            }).map((driver) => (
              <div
                key={driver.id}
                className="p-3 bg-amber-50 rounded-2xl hover:bg-amber-100 transition-all cursor-pointer"
              >
                <div className="flex justify-between items-start mb-1">
                  <p className="text-sm font-black text-slate-800">
                    {driver.name}
                  </p>
                  <SGFBadge variant="warning" size="sm">
                    {driver.cnhExpiry}
                  </SGFBadge>
                </div>
                <p className="text-xs text-slate-500">CNH: {driver.cnh}</p>
              </div>
            ))}
          </div>
        </SGFCard>

        {/* Violations */}
        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Infrações por Motorista
          </h4>
          <div className="space-y-4">
            {MOCK_DRIVERS.filter((d) => d.violations > 0)
              .sort((a, b) => b.violations - a.violations)
              .map((driver) => (
                <div key={driver.id}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold text-slate-600 truncate">
                      {driver.name}
                    </span>
                    <span className="text-sm font-black text-rose-600">
                      {driver.violations}
                    </span>
                  </div>
                  <SGFProgressBar
                    value={(driver.violations / 5) * 100}
                    variant="error"
                    size="sm"
                  />
                </div>
              ))}
          </div>
        </SGFCard>
      </div>
    </div>
  );
};

export default DriversPage;
