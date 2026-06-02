/**
 * SGF 2026 - Telemetria Real
 * Monitoramento de telemetria em tempo real
 */

import React, { useState, useEffect } from 'react';
import {
  SGFCard,
  SGFBadge,
  SGFButton,
  SGFProgressBar,
  SGFKPICard,
} from '@/app/components/sgf';
import {
  Activity,
  Gauge,
  Thermometer,
  Zap,
  Navigation,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
} from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// Mock telemetry data generator
const generateTelemetryData = () => {
  const now = Date.now();
  return Array.from({ length: 20 }, (_, i) => ({
    time: new Date(now - (20 - i) * 3000).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    speed: Math.floor(Math.random() * 80) + 20,
    rpm: Math.floor(Math.random() * 3000) + 1000,
    fuel: 75 - i * 0.5,
    temp: 85 + Math.random() * 10,
  }));
};

export const TelemetryPage: React.FC = () => {
  const [telemetryData, setTelemetryData] = useState(generateTelemetryData());
  const [isLive, setIsLive] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState('ABC-1234');

  // Simulate real-time updates
  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      setTelemetryData((prev) => {
        const newData = [...prev.slice(1)];
        const lastPoint = prev[prev.length - 1];
        newData.push({
          time: new Date().toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          speed: Math.max(0, lastPoint.speed + (Math.random() - 0.5) * 20),
          rpm: Math.max(800, lastPoint.rpm + (Math.random() - 0.5) * 500),
          fuel: Math.max(0, lastPoint.fuel - 0.1),
          temp: Math.max(70, Math.min(100, lastPoint.temp + (Math.random() - 0.5) * 5)),
        });
        return newData;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [isLive]);

  const currentData = telemetryData[telemetryData.length - 1];

  return (
    <div className="space-y-8">
      {/* Header Controls */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-black text-slate-800">
            Veículo: {selectedVehicle}
          </h3>
          <p className="text-sm text-slate-400 font-medium flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            {isLive ? 'Transmissão ao vivo' : 'Pausado'}
          </p>
        </div>

        <div className="flex gap-3">
          <SGFButton
            variant={isLive ? 'secondary' : 'primary'}
            icon={RefreshCw}
            onClick={() => setIsLive(!isLive)}
            size="sm"
          >
            {isLive ? 'Pausar' : 'Retomar'}
          </SGFButton>
        </div>
      </div>

      {/* Real-time KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SGFCard padding="lg" className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-bl-[100px]" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center">
                <Gauge size={24} className="text-emerald-600" />
              </div>
              <SGFBadge variant="success" size="sm">
                <TrendingUp size={12} className="mr-1" />
                Normal
              </SGFBadge>
            </div>
            <p className="text-sm text-slate-400 font-bold mb-2">Velocidade</p>
            <p className="text-4xl font-black text-slate-800">
              {currentData.speed.toFixed(0)}
              <span className="text-lg text-slate-400 ml-2">km/h</span>
            </p>
          </div>
        </SGFCard>

        <SGFCard padding="lg" className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-[100px]" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center">
                <Activity size={24} className="text-blue-600" />
              </div>
              <SGFBadge variant="default" size="sm">
                Normal
              </SGFBadge>
            </div>
            <p className="text-sm text-slate-400 font-bold mb-2">RPM Motor</p>
            <p className="text-4xl font-black text-slate-800">
              {currentData.rpm.toFixed(0)}
              <span className="text-lg text-slate-400 ml-2">rpm</span>
            </p>
          </div>
        </SGFCard>

        <SGFCard padding="lg" className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-500/10 to-transparent rounded-bl-[100px]" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center">
                <Thermometer size={24} className="text-amber-600" />
              </div>
              <SGFBadge
                variant={currentData.temp > 95 ? 'alert' : 'default'}
                size="sm"
              >
                {currentData.temp > 95 ? (
                  <>
                    <AlertTriangle size={12} className="mr-1" />
                    Alto
                  </>
                ) : (
                  'Normal'
                )}
              </SGFBadge>
            </div>
            <p className="text-sm text-slate-400 font-bold mb-2">Temperatura</p>
            <p className="text-4xl font-black text-slate-800">
              {currentData.temp.toFixed(1)}
              <span className="text-lg text-slate-400 ml-2">°C</span>
            </p>
          </div>
        </SGFCard>

        <SGFCard padding="lg" className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-rose-500/10 to-transparent rounded-bl-[100px]" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center">
                <Zap size={24} className="text-rose-600" />
              </div>
              <SGFBadge variant={currentData.fuel < 20 ? 'alert' : 'success'} size="sm">
                {currentData.fuel < 20 ? (
                  <>
                    <TrendingDown size={12} className="mr-1" />
                    Baixo
                  </>
                ) : (
                  'OK'
                )}
              </SGFBadge>
            </div>
            <p className="text-sm text-slate-400 font-bold mb-2">Combustível</p>
            <p className="text-4xl font-black text-slate-800">
              {currentData.fuel.toFixed(1)}
              <span className="text-lg text-slate-400 ml-2">%</span>
            </p>
          </div>
        </SGFCard>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Speed Chart */}
        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Velocidade em Tempo Real
          </h4>
          <div style={{ minHeight: '280px', minWidth: '300px' }}>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={telemetryData}>
                <defs>
                  <linearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(160, 100%, 33%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(160, 100%, 33%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
                  interval={4}
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                  domain={[0, 120]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '8px 12px',
                  }}
                  labelStyle={{ color: '#10b981', fontWeight: 700, fontSize: '11px' }}
                  itemStyle={{ color: '#f1f5f9', fontSize: '11px', fontWeight: 600 }}
                />
                <Area
                  type="monotone"
                  dataKey="speed"
                  stroke="hsl(160, 100%, 33%)"
                  strokeWidth={3}
                  fill="url(#speedGradient)"
                  name="Velocidade (km/h)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SGFCard>

        {/* RPM Chart */}
        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Rotação do Motor (RPM)
          </h4>
          <div style={{ minHeight: '280px', minWidth: '300px' }}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={telemetryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
                  interval={4}
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                  domain={[0, 4000]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '8px 12px',
                  }}
                  labelStyle={{ color: '#10b981', fontWeight: 700, fontSize: '11px' }}
                  itemStyle={{ color: '#f1f5f9', fontSize: '11px', fontWeight: 600 }}
                />
                <Line
                  type="monotone"
                  dataKey="rpm"
                  stroke="hsl(217, 91%, 60%)"
                  strokeWidth={3}
                  dot={false}
                  name="RPM"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SGFCard>

        {/* Temperature Chart */}
        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Temperatura do Motor
          </h4>
          <div style={{ minHeight: '280px', minWidth: '300px' }}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={telemetryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
                  interval={4}
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                  domain={[60, 110]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '8px 12px',
                  }}
                  labelStyle={{ color: '#10b981', fontWeight: 700, fontSize: '11px' }}
                  itemStyle={{ color: '#f1f5f9', fontSize: '11px', fontWeight: 600 }}
                />
                <Line
                  type="monotone"
                  dataKey="temp"
                  stroke="hsl(32, 98%, 58%)"
                  strokeWidth={3}
                  dot={false}
                  name="Temperatura (°C)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SGFCard>

        {/* Fuel Chart */}
        <SGFCard padding="lg">
          <h4 className="font-bold text-lg text-slate-800 mb-6">
            Consumo de Combustível
          </h4>
          <div style={{ minHeight: '280px', minWidth: '300px' }}>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={telemetryData}>
                <defs>
                  <linearGradient id="fuelGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(338, 78%, 55%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(338, 78%, 55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
                  interval={4}
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '8px 12px',
                  }}
                  labelStyle={{ color: '#10b981', fontWeight: 700, fontSize: '11px' }}
                  itemStyle={{ color: '#f1f5f9', fontSize: '11px', fontWeight: 600 }}
                />
                <Area
                  type="monotone"
                  dataKey="fuel"
                  stroke="hsl(338, 78%, 55%)"
                  strokeWidth={3}
                  fill="url(#fuelGradient)"
                  name="Combustível (%)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SGFCard>
      </div>

      {/* Alerts */}
      <SGFCard padding="lg">
        <h4 className="font-bold text-lg text-slate-800 mb-6">
          Eventos de Telemetria
        </h4>
        <div className="space-y-3">
          {[
            {
              time: '14:32:15',
              event: 'RPM acima de 3500 detectado',
              severity: 'warning',
            },
            {
              time: '14:28:42',
              event: 'Velocidade acima do limite em zona urbana',
              severity: 'alert',
            },
            {
              time: '14:15:03',
              event: 'Temperatura estável - Motor aquecido',
              severity: 'info',
            },
          ].map((alert, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-2 h-2 rounded-full ${
                    alert.severity === 'alert'
                      ? 'bg-rose-500'
                      : alert.severity === 'warning'
                      ? 'bg-amber-500'
                      : 'bg-blue-500'
                  }`}
                />
                <div>
                  <p className="text-sm font-bold text-slate-800">{alert.event}</p>
                  <p className="text-xs text-slate-400">{alert.time}</p>
                </div>
              </div>
              <SGFBadge variant={alert.severity as any} size="sm">
                {alert.severity}
              </SGFBadge>
            </div>
          ))}
        </div>
      </SGFCard>
    </div>
  );
};

export default TelemetryPage;
