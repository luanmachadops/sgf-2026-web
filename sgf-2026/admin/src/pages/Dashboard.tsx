import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api';
import { fmtBrl, fmtBrlCompact, fmtUsdSmart } from '@/lib/ui';
import { SGFKPICard, PeriodSelect, PageHeader, SectionTitle, makePeriod, resolvePeriod, type PeriodValue } from '@/components/sgf';
import { AreaTrend, BarTrend, ChartCard, EmptyChart, MultiLineTrend } from '@/components/charts';
import { Building2, Sparkle, User, FileText, Car } from '@/components/sgf/icons';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export default function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-kpis'], queryFn: dashboardApi.kpis });
  // Um período para todos os gráficos: mudar em um muda em todos.
  const [period, setPeriod] = useState<PeriodValue>(() => makePeriod('6'));
  const { data: trend = [] } = useQuery({
    queryKey: ['admin-trend', period],
    queryFn: () => dashboardApi.trend(resolvePeriod(period)),
  });
  const s = data?.series;
  const total = data?.tenants ?? 0;
  const active = data?.activeTenants ?? 0;
  const activePct = total > 0 ? Math.round((active / total) * 100) : 0;
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={today.charAt(0).toUpperCase() + today.slice(1)} title={`${greeting()}!`} subtitle="Como está a plataforma em todas as prefeituras." />

      {/* Destaque: o mesmo hero escuro do app do motorista */}
      <section className="rt-rise relative overflow-hidden rounded-[var(--rt-radius-card)] bg-[var(--rt-ink900)] p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[var(--rt-brand)]/20 blur-3xl" aria-hidden />
        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-[#3EF074]" /> Prefeituras ativas
            </span>
            <div className="mt-5 flex items-end gap-3">
              <span className="rt-num text-[64px] font-light leading-none">{isLoading ? '—' : active}</span>
              <span className="pb-2 text-lg text-white/60">de {isLoading ? '—' : total}</span>
            </div>
            <div className="mt-5 h-2 w-full max-w-md overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={activePct} aria-valuemin={0} aria-valuemax={100} aria-label="Prefeituras ativas">
              <div className="h-full rounded-full bg-[var(--rt-brand)] transition-[width] duration-700" style={{ width: `${activePct}%` }} />
            </div>
            <p className="mt-2 text-sm text-white/55">{activePct}% das prefeituras cadastradas estão ativas</p>
          </div>
          <div className="grid grid-cols-3 gap-3 border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            {[
              { label: 'Veículos', value: data?.vehicles ?? 0, icon: Car },
              { label: 'Motoristas', value: data?.drivers ?? 0, icon: User },
              { label: 'Faturas pendentes', value: data?.pendingInvoices ?? 0, icon: FileText },
            ].map((f) => (
              <div key={f.label}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-white/10"><f.icon width={20} height={20} /></span>
                <p className="rt-num mt-4 text-[28px] font-light leading-none">{isLoading ? '—' : f.value.toLocaleString('pt-BR')}</p>
                <p className="mt-1.5 text-xs text-white/55">{f.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div>
        <SectionTitle>Indicadores</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SGFKPICard title="Prefeituras cadastradas" value={total} hint="novas por mês" loading={isLoading} icon={Building2} tone="brand" chartData={s?.tenants ?? []} />
          <SGFKPICard title="Veículos na plataforma" value={(data?.vehicles ?? 0).toLocaleString('pt-BR')} hint="cadastros por mês" loading={isLoading} icon={Car} tone="blue" chartData={s?.vehicles ?? []} />
          <SGFKPICard title="Motoristas cadastrados" value={(data?.drivers ?? 0).toLocaleString('pt-BR')} hint="cadastros por mês" loading={isLoading} icon={User} tone="brand" chartData={s?.drivers ?? []} />
          <SGFKPICard title="Custo de IA no mês" value={fmtUsdSmart(data?.aiCostMonth ?? 0)} hint="gasto por mês" loading={isLoading} icon={Sparkle} tone="amber" chartData={s?.aiCost ?? []} format={fmtUsdSmart} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <ChartCard
          className="xl:col-span-3"
          title="Custo de IA"
          subtitle="Gasto mensal com inteligência artificial, em dólar"
          action={<PeriodSelect value={period} onChange={setPeriod} />}
        >
          {trend.every((d) => d.aiCost === 0)
            ? <EmptyChart message="Nenhum custo de IA no período." />
            : <AreaTrend data={trend as never} dataKey="aiCost" format={fmtUsdSmart} compact={(n) => `$${n.toLocaleString('pt-BR', { maximumSignificantDigits: 2 })}`} unitLabel="Custo" />}
        </ChartCard>
        <ChartCard className="xl:col-span-2" title="Faturamento" subtitle="Faturas emitidas por mês" action={<PeriodSelect value={period} onChange={setPeriod} />}>
          {trend.every((d) => d.invoices === 0)
            ? <EmptyChart message="Nenhuma fatura no período." />
            : <BarTrend data={trend as never} dataKey="invoices" format={fmtBrl} compact={fmtBrlCompact} unitLabel="Faturado" />}
        </ChartCard>
      </div>

      <ChartCard
        title="Crescimento da plataforma"
        subtitle="Veículos e motoristas cadastrados, acumulado ao fim de cada mês"
        action={<PeriodSelect value={period} onChange={setPeriod} />}
      >
        {trend.every((d) => d.vehicles === 0 && d.drivers === 0)
          ? <EmptyChart message="Nenhum cadastro no período." />
          : (
            <MultiLineTrend
              data={trend as never}
              format={(n) => n.toLocaleString('pt-BR')}
              series={[
                { key: 'vehicles', label: 'Veículos', color: '#2A78D6' },
                { key: 'drivers', label: 'Motoristas', color: '#EB6834' },
              ]}
            />
          )}
      </ChartCard>
    </div>
  );
}
