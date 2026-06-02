/**
 * SGF 2026 - Abastecimentos
 * Controle de combustível e custos
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
} from '@/app/components/sgf';
import {
  Fuel,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Plus,
  Search,
  Filter,
  Download,
  AlertTriangle,
  MapPin,
  Calendar,
  BarChart3,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface FuelRecord {
  id: string;
  date: string;
  time: string;
  vehicle: string;
  driver: string;
  liters: number;
  pricePerLiter: number;
  total: number;
  odometer: number;
  station: string;
  fuelType: 'diesel' | 'gasoline' | 'ethanol';
  location: string;
  validated: boolean;
}

const MOCK_FUEL_RECORDS: FuelRecord[] = [
  {
    id: '1',
    date: '02/01/2026',
    time: '14:32',
    vehicle: 'ABC-1234',
    driver: 'João Silva',
    liters: 180,
    pricePerLiter: 6.20,
    total: 1116.0,
    odometer: 45230,
    station: 'Posto BR Centro',
    fuelType: 'diesel',
    location: 'Centro, São Paulo',
    validated: true,
  },
  {
    id: '2',
    date: '02/01/2026',
    time: '10:15',
    vehicle: 'SGF-2026',
    driver: 'Maria Santos',
    liters: 42,
    pricePerLiter: 5.85,
    total: 245.7,
    odometer: 28450,
    station: 'Posto Shell Zona Norte',
    fuelType: 'gasoline',
    location: 'Santana, São Paulo',
    validated: true,
  },
  {
    id: '3',
    date: '01/01/2026',
    time: '16:45',
    vehicle: 'OBR-900',
    driver: 'Carlos Lima',
    liters: 220,
    pricePerLiter: 6.25,
    total: 1375.0,
    odometer: 89050,
    station: 'Posto Ipiranga Rodovia',
    fuelType: 'diesel',
    location: 'Marginal Tietê, São Paulo',
    validated: false,
  },
  {
    id: '4',
    date: '01/01/2026',
    time: '09:20',
    vehicle: 'GOV-5566',
    driver: 'Ana Paula Costa',
    liters: 38,
    pricePerLiter: 5.92,
    total: 224.96,
    odometer: 12580,
    station: 'Posto BR Centro',
    fuelType: 'gasoline',
    location: 'Centro, São Paulo',
    validated: true,
  },
];

const monthlyData = [
  { month: 'Jul', liters: 2450, cost: 15180 },
  { month: 'Ago', liters: 2680, cost: 16590 },
  { month: 'Set', liters: 2320, cost: 14384 },
  { month: 'Out', liters: 2890, cost: 17918 },
  { month: 'Nov', liters: 3120, cost: 19344 },
  { month: 'Dez', liters: 2950, cost: 18290 },
];

export const FuelPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFuelType, setFilterFuelType] = useState('all');
  const [filterValidated, setFilterValidated] = useState('all');

  const filteredRecords = MOCK_FUEL_RECORDS.filter((record) => {
    const matchesSearch =
      record.vehicle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.driver.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.station.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFuelType =
      filterFuelType === 'all' || record.fuelType === filterFuelType;
    const matchesValidated =
      filterValidated === 'all' ||
      (filterValidated === 'validated' && record.validated) ||
      (filterValidated === 'pending' && !record.validated);

    return matchesSearch && matchesFuelType && matchesValidated;
  });

  const fuelTypeLabels = {
    diesel: 'Diesel',
    gasoline: 'Gasolina',
    ethanol: 'Etanol',
  };

  const tableColumns = [
    {
      header: 'Data/Hora',
      accessor: (row: FuelRecord) => (
        <div>
          <p className="text-sm font-black text-slate-800">{row.date}</p>
          <p className="text-[11px] text-slate-400">{row.time}</p>
        </div>
      ),
    },
    {
      header: 'Veículo',
      accessor: (row: FuelRecord) => (
        <div>
          <p className="text-sm font-black text-slate-800">{row.vehicle}</p>
          <p className="text-[11px] text-slate-400">{row.driver}</p>
        </div>
      ),
    },
    {
      header: 'Combustível',
      accessor: (row: FuelRecord) => (
        <SGFBadge
          variant={
            row.fuelType === 'diesel'
              ? 'default'
              : row.fuelType === 'gasoline'
              ? 'warning'
              : 'success'
          }
          size="sm"
        >
          {fuelTypeLabels[row.fuelType]}
        </SGFBadge>
      ),
    },
    {
      header: 'Litros',
      accessor: (row: FuelRecord) => (
        <span className="text-sm font-black text-slate-700">
          {row.liters.toFixed(1)} L
        </span>
      ),
    },
    {
      header: 'Valor Total',
      accessor: (row: FuelRecord) => (
        <div>
          <p className="text-sm font-black text-emerald-600">
            R$ {row.total.toFixed(2)}
          </p>
          <p className="text-[10px] text-slate-400">
            R$ {row.pricePerLiter.toFixed(2)}/L
          </p>
        </div>
      ),
    },
    {
      header: 'Posto',
      accessor: (row: FuelRecord) => (
        <div>
          <p className="text-sm font-bold text-slate-700">{row.station}</p>
          <p className="text-[10px] text-slate-400 flex items-center gap-1">
            <MapPin size={10} /> {row.location}
          </p>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (row: FuelRecord) => (
        <SGFBadge
          variant={row.validated ? 'success' : 'warning'}
          size="sm"
          icon={row.validated ? undefined : AlertTriangle}
        >
          {row.validated ? 'Validado' : 'Pendente'}
        </SGFBadge>
      ),
    },
  ];

  const totalLiters = MOCK_FUEL_RECORDS.reduce((acc, r) => acc + r.liters, 0);
  const totalCost = MOCK_FUEL_RECORDS.reduce((acc, r) => acc + r.total, 0);
  const avgPricePerLiter = totalCost / totalLiters;
  const pendingValidation = MOCK_FUEL_RECORDS.filter((r) => !r.validated).length;

  return (
    <div className="space-y-8">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SGFKPICard
          title="Custo Total (Mês)"
          value={`R$ ${(totalCost / 1000).toFixed(1)}k`}
          percentage={8.5}
          trend="up"
          icon={DollarSign}
          iconColor="text-emerald-600"
        />
        <SGFKPICard
          title="Total Litros (Mês)"
          value={totalLiters.toFixed(0)}
          percentage={5.2}
          trend="down"
          icon={Fuel}
          iconColor="text-blue-600"
        />
        <SGFKPICard
          title="Preço Médio/L"
          value={`R$ ${avgPricePerLiter.toFixed(2)}`}
          percentage={12.3}
          trend="up"
          icon={TrendingUp}
          iconColor="text-amber-600"
        />
        <SGFKPICard
          title="Pendentes"
          value={pendingValidation.toString()}
          icon={AlertTriangle}
          iconColor="text-rose-600"
        />
      </div>

      {/* Alerts */}
      {pendingValidation > 0 && (
        <SGFAlert
          variant="warning"
          title="Validação Pendente"
          message={`${pendingValidation} abastecimento(s) aguardando validação. Revise os comprovantes enviados.`}
          dismissible
        />
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Consumo Mensal (Litros)
          </h4>
          <div style={{ minHeight: '280px', minWidth: '300px' }}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
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
                <Bar
                  dataKey="liters"
                  fill="hsl(160, 100%, 33%)"
                  radius={[8, 8, 0, 0]}
                  name="Litros"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SGFCard>

        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Custo Mensal (R$)
          </h4>
          <div style={{ minHeight: '280px', minWidth: '300px' }}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
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
                  name="Custo (R$)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SGFCard>
      </div>

      {/* Filters */}
      <SGFCard padding="lg">
        <div className="flex flex-col lg:flex-row gap-4 items-end">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
            <SGFInput
              label="Buscar"
              placeholder="Veículo, motorista ou posto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={Search}
            />

            <SGFSelect
              label="Tipo de Combustível"
              value={filterFuelType}
              onChange={setFilterFuelType}
              options={[
                { value: 'all', label: 'Todos os Tipos' },
                { value: 'diesel', label: 'Diesel' },
                { value: 'gasoline', label: 'Gasolina' },
                { value: 'ethanol', label: 'Etanol' },
              ]}
            />

            <SGFSelect
              label="Status"
              value={filterValidated}
              onChange={setFilterValidated}
              options={[
                { value: 'all', label: 'Todos os Status' },
                { value: 'validated', label: 'Validados' },
                { value: 'pending', label: 'Pendentes' },
              ]}
            />
          </div>

          <div className="flex gap-3">
            <SGFButton variant="outline" icon={Calendar} size="md">
              Período
            </SGFButton>
            <SGFButton variant="primary" icon={Plus} size="md">
              Registrar Abastecimento
            </SGFButton>
          </div>
        </div>
      </SGFCard>

      {/* Fuel Records Table */}
      <SGFCard padding="none" className="overflow-hidden">
        <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
          <div>
            <h4 className="font-bold text-xl text-slate-800">
              Histórico de Abastecimentos
            </h4>
            <p className="text-xs text-slate-400 font-medium">
              {filteredRecords.length} registro(s) encontrado(s)
            </p>
          </div>
          <SGFButton variant="outline" icon={Download} size="sm">
            Exportar Relatório
          </SGFButton>
        </div>

        <SGFTable
          columns={tableColumns}
          data={filteredRecords}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => console.log('Clicked fuel record:', row)}
        />
      </SGFCard>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Por Tipo de Combustível
          </h4>
          <div className="space-y-4">
            {[
              { type: 'Diesel', count: 2, color: 'bg-slate-600', liters: 400 },
              { type: 'Gasolina', count: 2, color: 'bg-amber-500', liters: 80 },
              { type: 'Etanol', count: 0, color: 'bg-emerald-500', liters: 0 },
            ].map((item) => (
              <div key={item.type}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-slate-600">
                    {item.type}
                  </span>
                  <span className="text-sm font-black text-slate-800">
                    {item.liters}L
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3">
                  <div
                    className={`${item.color} h-3 rounded-full transition-all duration-500`}
                    style={{ width: `${(item.liters / totalLiters) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </SGFCard>

        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Postos Mais Usados
          </h4>
          <div className="space-y-3">
            {[
              { name: 'Posto BR Centro', count: 2, total: 1340.96 },
              { name: 'Posto Shell Zona Norte', count: 1, total: 245.7 },
              { name: 'Posto Ipiranga Rodovia', count: 1, total: 1375.0 },
            ].map((station) => (
              <div
                key={station.name}
                className="flex justify-between items-center p-3 bg-slate-50 rounded-2xl hover:bg-emerald-50 transition-all cursor-pointer"
              >
                <div>
                  <p className="text-sm font-bold text-slate-800">{station.name}</p>
                  <p className="text-xs text-slate-400">{station.count} abastecimento(s)</p>
                </div>
                <p className="text-sm font-black text-emerald-600">
                  R$ {station.total.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </SGFCard>

        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Maiores Consumidores
          </h4>
          <div className="space-y-3">
            {MOCK_FUEL_RECORDS.sort((a, b) => b.liters - a.liters)
              .slice(0, 3)
              .map((record, index) => (
                <div
                  key={record.id}
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl"
                >
                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-xs font-black text-emerald-600">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-black text-slate-800">
                      {record.vehicle}
                    </p>
                    <p className="text-xs text-slate-400">{record.driver}</p>
                  </div>
                  <p className="text-sm font-black text-slate-700">
                    {record.liters}L
                  </p>
                </div>
              ))}
          </div>
        </SGFCard>
      </div>
    </div>
  );
};

export default FuelPage;
