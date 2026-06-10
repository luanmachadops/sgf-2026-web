import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { dashboardApi } from '@/lib/api';
import { fmtUsd, fmtBrl } from '@/lib/ui';
import { SGFKPICard, SGFCard, PeriodSelect, makePeriod, resolvePeriod, type PeriodValue } from '@/components/sgf';
import { Building2, Activity, Sparkle, Receipt, User, FileText } from '@/components/sgf/icons';

export default function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-kpis'], queryFn: dashboardApi.kpis });
  const [period, setPeriod] = useState<PeriodValue>(() => makePeriod('6'));
  const { data: trend = [] } = useQuery({
    queryKey: ['admin-trend', period],
    queryFn: () => dashboardApi.trend(resolvePeriod(period)),
  });
  const s = data?.series;

  return (
    <div className="space-y-8">
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Visão Geral</h1>
        <p className="text-sm text-slate-500">Indicadores de todas as prefeituras atendidas.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700 md:grid-cols-2 lg:grid-cols-4">
        <SGFKPICard title="Prefeituras" value={data?.tenants ?? 0} loading={isLoading} icon={Building2}
          iconColor="text-emerald-500" chartColor="#10b981" chartData={s?.tenants ?? []} />
        <SGFKPICard title="Prefeituras ativas" value={data?.activeTenants ?? 0} loading={isLoading} icon={Activity}
          iconColor="text-teal-500" chartColor="#14b8a6" chartData={s?.tenants ?? []} />
        <SGFKPICard title="Veículos (total)" value={data?.vehicles ?? 0} loading={isLoading} icon={Receipt}
          iconColor="text-blue-500" chartColor="#3b82f6" chartData={s?.vehicles ?? []} />
        <SGFKPICard title="Motoristas (total)" value={data?.drivers ?? 0} loading={isLoading} icon={User}
          iconColor="text-violet-500" chartColor="#8b5cf6" chartData={s?.drivers ?? []} />
        <SGFKPICard title="Custo de IA (mês)" value={fmtUsd(data?.aiCostMonth ?? 0)} loading={isLoading} icon={Sparkle}
          iconColor="text-amber-500" chartColor="#f59e0b" chartData={s?.aiCost ?? []} />
        <SGFKPICard title="Faturas pendentes" value={data?.pendingInvoices ?? 0} loading={isLoading} icon={FileText}
          iconColor="text-rose-500" chartColor="#f43f5e" chartData={s?.invoices ?? []} />
      </div>

      {/* Gráficos grandes */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SGFCard padding="lg" className="h-full">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-base font-semibold text-slate-800">Custo de IA</h4>
                <p className="text-sm font-medium text-slate-400">Gasto com IA por mês (USD)</p>
              </div>
              <PeriodSelect value={period} onChange={setPeriod} />
            </div>
            <div className="h-[250px] w-full min-w-0 sm:h-[320px]">
              {trend.every((d) => d.aiCost === 0) ? (
                <div className="flex h-full w-full items-center justify-center rounded-2xl bg-slate-50/50">
                  <p className="px-6 text-center text-sm font-medium text-slate-400">Nenhum custo de IA no período.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="aiGreen" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} width={48} tickFormatter={(v) => `$${v}`} />
                    <Tooltip formatter={((v: number | string) => fmtUsd(Number(v))) as never} contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0' }} />
                    <Area type="monotone" dataKey="aiCost" stroke="#10b981" strokeWidth={2.5} fill="url(#aiGreen)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </SGFCard>
        </div>

        <div className="lg:col-span-1">
          <SGFCard padding="lg" className="h-full">
            <div className="mb-8">
              <h4 className="text-base font-semibold text-slate-800">Faturamento</h4>
              <p className="text-sm font-medium text-slate-400">Faturas emitidas por mês (R$)</p>
            </div>
            <div className="h-[250px] w-full min-w-0 sm:h-[320px]">
              {trend.every((d) => d.invoices === 0) ? (
                <div className="flex h-full w-full items-center justify-center rounded-2xl bg-slate-50/50">
                  <p className="px-6 text-center text-sm font-medium text-slate-400">Nenhuma fatura no período.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }} dy={10} />
                    <Tooltip formatter={((v: number | string) => fmtBrl(Number(v))) as never} contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0' }} cursor={{ fill: '#f1f5f9' }} />
                    <Bar dataKey="invoices" radius={[6, 6, 0, 0]} barSize={22}>
                      {trend.map((_e, i) => <Cell key={i} fill="#00A86B" fillOpacity={0.5 + (i / Math.max(trend.length - 1, 1)) * 0.5} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </SGFCard>
        </div>
      </div>
    </div>
  );
}
