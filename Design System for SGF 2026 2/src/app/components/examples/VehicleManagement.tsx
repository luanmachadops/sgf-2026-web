/**
 * SGF 2026 - Exemplo de Uso do Design System
 * Tela de Gestão de Veículos
 * 
 * Este componente demonstra o uso correto dos componentes SGF
 */

import React, { useState } from 'react';
import {
  SGFButton,
  SGFCard,
  SGFInput,
  SGFSelect,
  SGFBadge,
  SGFTable,
  SGFKPICard,
  SGFAlert,
  SGFProgressBar,
  SGFTextarea,
} from '@/app/components/sgf';
import {
  Truck,
  Plus,
  Search,
  Filter,
  Download,
  Activity,
  Fuel,
  Wrench,
} from 'lucide-react';

interface Vehicle {
  id: string;
  plate: string;
  model: string;
  department: string;
  status: 'moving' | 'idle' | 'stopped' | 'alert';
  fuel: number;
  odometer: number;
}

export const VehicleManagement: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [showAlert, setShowAlert] = useState(true);

  // Mock data
  const vehicles: Vehicle[] = [
    {
      id: '1',
      plate: 'ABC-1234',
      model: 'VW Constellation',
      department: 'Obras',
      status: 'moving',
      fuel: 75,
      odometer: 45230,
    },
    {
      id: '2',
      plate: 'SGF-2026',
      model: 'Toyota Hilux',
      department: 'Saúde',
      status: 'idle',
      fuel: 42,
      odometer: 23450,
    },
    {
      id: '3',
      plate: 'OBR-900',
      model: 'M. Benz Axor',
      department: 'Obras',
      status: 'stopped',
      fuel: 15,
      odometer: 78900,
    },
  ];

  const departments = [
    { value: 'all', label: 'Todas as Secretarias' },
    { value: 'obras', label: 'Obras' },
    { value: 'saude', label: 'Saúde' },
    { value: 'educacao', label: 'Educação' },
    { value: 'gabinete', label: 'Gabinete' },
  ];

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
            <p className="text-[11px] text-slate-400 font-medium">{row.model}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Departamento',
      accessor: (row: Vehicle) => (
        <SGFBadge variant="default">{row.department}</SGFBadge>
      ),
    },
    {
      header: 'Status',
      accessor: (row: Vehicle) => (
        <SGFBadge variant={row.status} dot>
          {row.status}
        </SGFBadge>
      ),
    },
    {
      header: 'Combustível',
      accessor: (row: Vehicle) => (
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
      header: 'Odômetro',
      accessor: (row: Vehicle) => (
        <span className="text-sm font-black text-slate-700">
          {row.odometer.toLocaleString()} <span className="text-[10px] text-slate-400">km</span>
        </span>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--sgf-surface)] p-10">
      {/* Page Header */}
      <div className="mb-10">
        <h1 className="text-4xl font-black text-slate-800 mb-2">
          Gestão de Veículos
        </h1>
        <p className="text-slate-500">
          Gerencie toda a frota municipal em um só lugar
        </p>
      </div>

      {/* Alert Example */}
      {showAlert && (
        <div className="mb-8">
          <SGFAlert
            variant="warning"
            title="Manutenção Programada"
            message="3 veículos estão com manutenção preventiva agendada para esta semana"
            dismissible
            onDismiss={() => setShowAlert(false)}
          />
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
        <SGFKPICard
          title="Total de Veículos"
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
          title="Em Manutenção"
          value="8"
          percentage={15}
          trend="down"
          icon={Wrench}
          iconColor="text-purple-600"
        />
      </div>

      {/* Filters Card */}
      <SGFCard padding="lg" className="mb-8">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <SGFInput
              placeholder="Pesquisar por placa, modelo ou departamento..."
              icon={Search}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              fullWidth
            />
          </div>
          <div className="w-full md:w-64">
            <SGFSelect
              options={departments}
              value={selectedDepartment}
              onChange={setSelectedDepartment}
              fullWidth
            />
          </div>
          <SGFButton variant="outline" icon={Filter}>
            Filtros
          </SGFButton>
          <SGFButton variant="primary" icon={Plus}>
            Novo Veículo
          </SGFButton>
        </div>
      </SGFCard>

      {/* Table */}
      <SGFTable
        columns={tableColumns}
        data={vehicles}
        keyExtractor={(row) => row.id}
        onRowClick={(row) => console.log('Clicked vehicle:', row)}
      />

      {/* Action Buttons */}
      <div className="mt-8 flex justify-end gap-4">
        <SGFButton variant="outline" icon={Download}>
          Exportar Relatório
        </SGFButton>
        <SGFButton variant="secondary">
          Gerar Análise
        </SGFButton>
      </div>

      {/* Example Form Card */}
      <SGFCard padding="lg" className="mt-10">
        <h3 className="text-xl font-bold text-slate-800 mb-6">
          Adicionar Observação
        </h3>
        <div className="space-y-4">
          <SGFInput
            label="Título da Observação"
            placeholder="Ex: Troca de pneus realizada"
            fullWidth
          />
          <SGFTextarea
            label="Descrição"
            placeholder="Descreva os detalhes..."
            rows={4}
            maxLength={500}
            showCount
            fullWidth
          />
          <div className="flex justify-end gap-3">
            <SGFButton variant="ghost">Cancelar</SGFButton>
            <SGFButton variant="primary">Salvar Observação</SGFButton>
          </div>
        </div>
      </SGFCard>
    </div>
  );
};

export default VehicleManagement;
