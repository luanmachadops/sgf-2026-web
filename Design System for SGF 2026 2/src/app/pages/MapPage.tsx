/**
 * SGF 2026 - Centro de Comando (Mapa)
 * Visualização em tempo real da frota no mapa
 */

import React, { useState } from 'react';
import {
  SGFCard,
  SGFBadge,
  SGFButton,
  SGFProgressBar,
} from '@/app/components/sgf';
import {
  MapPin,
  Navigation,
  Truck,
  AlertTriangle,
  Fuel,
  Activity,
  Maximize2,
  Filter,
  Layers,
} from 'lucide-react';

interface Vehicle {
  id: string;
  plate: string;
  model: string;
  driver: string;
  lat: number;
  lng: number;
  status: 'moving' | 'idle' | 'stopped' | 'alert';
  speed: number;
  fuel: number;
  dept: string;
}

const MOCK_VEHICLES: Vehicle[] = [
  {
    id: '1',
    plate: 'ABC-1234',
    model: 'VW Constellation',
    driver: 'João Silva',
    lat: -23.5505,
    lng: -46.6333,
    status: 'moving',
    speed: 45,
    fuel: 75,
    dept: 'Obras',
  },
  {
    id: '2',
    plate: 'SGF-2026',
    model: 'Toyota Hilux',
    driver: 'Maria Santos',
    lat: -23.5615,
    lng: -46.6562,
    status: 'idle',
    speed: 0,
    fuel: 42,
    dept: 'Saúde',
  },
  {
    id: '3',
    plate: 'OBR-900',
    model: 'M. Benz Axor',
    driver: 'Carlos Lima',
    lat: -23.5489,
    lng: -46.6388,
    status: 'stopped',
    speed: 0,
    fuel: 15,
    dept: 'Obras',
  },
  {
    id: '4',
    plate: 'GOV-5566',
    model: 'Fiat Cronos',
    driver: 'Ana Paula',
    lat: -23.5558,
    lng: -46.6396,
    status: 'alert',
    speed: 12,
    fuel: 5,
    dept: 'Gabinete',
  },
];

export const MapPage: React.FC = () => {
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [mapView, setMapView] = useState<'standard' | 'satellite'>('standard');

  return (
    <div className="h-full flex gap-6">
      {/* Map Container */}
      <div className="flex-1 relative">
        <SGFCard padding="none" className="h-full overflow-hidden">
          {/* Map Placeholder */}
          <div className="relative w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
            {/* Grid Pattern */}
            <div className="absolute inset-0 opacity-20">
              <div
                className="w-full h-full"
                style={{
                  backgroundImage: `
                    linear-gradient(to right, #cbd5e1 1px, transparent 1px),
                    linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)
                  `,
                  backgroundSize: '40px 40px',
                }}
              />
            </div>

            {/* Vehicle Markers */}
            {MOCK_VEHICLES.map((vehicle, index) => {
              const statusColors = {
                moving: 'bg-emerald-500',
                idle: 'bg-blue-500',
                stopped: 'bg-slate-400',
                alert: 'bg-rose-500',
              };

              return (
                <button
                  key={vehicle.id}
                  onClick={() => setSelectedVehicle(vehicle)}
                  className="absolute group cursor-pointer z-10 transition-all hover:scale-110"
                  style={{
                    left: `${20 + index * 18}%`,
                    top: `${30 + index * 12}%`,
                  }}
                >
                  {/* Pulse Animation */}
                  <div
                    className={`absolute inset-0 ${statusColors[vehicle.status]} rounded-full animate-ping opacity-75`}
                  />

                  {/* Marker */}
                  <div
                    className={`relative w-8 h-8 ${statusColors[vehicle.status]} rounded-full border-4 border-white shadow-2xl flex items-center justify-center`}
                  >
                    <Truck size={16} className="text-white" />
                  </div>

                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-all pointer-events-none">
                    <div className="bg-slate-900 text-white px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap shadow-xl">
                      <div className="flex items-center gap-2">
                        <span>{vehicle.plate}</span>
                        <SGFBadge size="sm" variant={vehicle.status}>
                          {vehicle.status}
                        </SGFBadge>
                      </div>
                    </div>
                    <div className="w-2 h-2 bg-slate-900 transform rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2" />
                  </div>
                </button>
              );
            })}

            {/* Map Center Text */}
            <div className="text-center">
              <MapPin size={64} className="text-slate-300 mx-auto mb-4" />
              <h3 className="text-2xl font-black text-slate-400 mb-2">
                Mapa de Rastreamento em Tempo Real
              </h3>
              <p className="text-sm text-slate-400 font-medium">
                Integração com GPS • Atualização a cada 30 segundos
              </p>
            </div>

            {/* Map Controls */}
            <div className="absolute top-6 right-6 flex flex-col gap-3">
              <button className="p-3 bg-white rounded-2xl shadow-xl hover:scale-110 transition-all">
                <Maximize2 size={20} className="text-slate-600" />
              </button>
              <button className="p-3 bg-white rounded-2xl shadow-xl hover:scale-110 transition-all">
                <Layers size={20} className="text-slate-600" />
              </button>
              <button className="p-3 bg-white rounded-2xl shadow-xl hover:scale-110 transition-all">
                <Filter size={20} className="text-slate-600" />
              </button>
            </div>

            {/* Legend */}
            <div className="absolute bottom-6 left-6 bg-white/95 backdrop-blur-sm p-4 rounded-2xl shadow-xl">
              <p className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">
                Legenda
              </p>
              <div className="space-y-2">
                {[
                  { status: 'moving', label: 'Em Movimento', count: 1 },
                  { status: 'idle', label: 'Parado/Motor Ligado', count: 1 },
                  { status: 'stopped', label: 'Estacionado', count: 1 },
                  { status: 'alert', label: 'Alerta Crítico', count: 1 },
                ].map((item) => (
                  <div
                    key={item.status}
                    className="flex items-center gap-3 text-xs font-bold text-slate-600"
                  >
                    <div
                      className={`w-3 h-3 rounded-full ${
                        item.status === 'moving'
                          ? 'bg-emerald-500'
                          : item.status === 'idle'
                          ? 'bg-blue-500'
                          : item.status === 'stopped'
                          ? 'bg-slate-400'
                          : 'bg-rose-500'
                      }`}
                    />
                    <span className="flex-1">{item.label}</span>
                    <span className="text-slate-400">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SGFCard>
      </div>

      {/* Sidebar */}
      <div className="w-96 space-y-6 overflow-y-auto">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <SGFCard padding="md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <Activity size={20} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold">Ativos</p>
                <p className="text-2xl font-black text-slate-800">4</p>
              </div>
            </div>
          </SGFCard>

          <SGFCard padding="md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center">
                <AlertTriangle size={20} className="text-rose-600" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold">Alertas</p>
                <p className="text-2xl font-black text-slate-800">3</p>
              </div>
            </div>
          </SGFCard>
        </div>

        {/* Vehicle List */}
        <SGFCard padding="lg">
          <div className="flex justify-between items-center mb-6">
            <h4 className="font-bold text-lg text-slate-800">Veículos Ativos</h4>
            <SGFBadge variant="default">{MOCK_VEHICLES.length}</SGFBadge>
          </div>

          <div className="space-y-3">
            {MOCK_VEHICLES.map((vehicle) => (
              <button
                key={vehicle.id}
                onClick={() => setSelectedVehicle(vehicle)}
                className={`w-full p-4 rounded-2xl border-2 transition-all text-left ${
                  selectedVehicle?.id === vehicle.id
                    ? 'border-[var(--sgf-primary)] bg-emerald-50'
                    : 'border-slate-100 hover:border-emerald-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                      <Truck size={20} className="text-slate-600" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800">
                        {vehicle.plate}
                      </p>
                      <p className="text-xs text-slate-400">{vehicle.model}</p>
                    </div>
                  </div>
                  <SGFBadge variant={vehicle.status} dot size="sm">
                    {vehicle.status}
                  </SGFBadge>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold mb-1">
                      Velocidade
                    </p>
                    <p className="text-sm font-black text-slate-700">
                      {vehicle.speed}{' '}
                      <span className="text-xs text-slate-400">km/h</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold mb-1">
                      Combustível
                    </p>
                    <SGFProgressBar
                      value={vehicle.fuel}
                      max={100}
                      variant={vehicle.fuel < 20 ? 'error' : 'success'}
                      size="sm"
                      showPercentage
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </SGFCard>

        {/* Selected Vehicle Details */}
        {selectedVehicle && (
          <SGFCard padding="lg" className="animate-in slide-in-from-bottom-4">
            <h4 className="font-bold text-lg text-slate-800 mb-6">
              Detalhes do Veículo
            </h4>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400 font-bold">Motorista</span>
                <span className="text-sm font-black text-slate-800">
                  {selectedVehicle.driver}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400 font-bold">
                  Departamento
                </span>
                <SGFBadge variant="default">{selectedVehicle.dept}</SGFBadge>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400 font-bold">Coordenadas</span>
                <span className="text-xs font-mono text-slate-600">
                  {selectedVehicle.lat.toFixed(4)}, {selectedVehicle.lng.toFixed(4)}
                </span>
              </div>

              <SGFButton variant="primary" fullWidth icon={Navigation}>
                Rastrear Veículo
              </SGFButton>
            </div>
          </SGFCard>
        )}
      </div>
    </div>
  );
};

export default MapPage;
