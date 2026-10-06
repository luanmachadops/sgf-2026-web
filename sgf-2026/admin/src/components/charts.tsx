import { useId } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

/**
 * Gráficos do superadmin. Uma série por gráfico (nunca dois eixos Y), traço fino
 * na cor da marca, grade só horizontal e discreta, eixos em tinta clara, e dica
 * ao passar o mouse com mês + valor. Sem dados, mostra um estado vazio em vez de
 * um gráfico achatado em zero.
 */

const BRAND = '#00A86B';
const GRID = '#E6ECE9';
const AXIS = { fill: '#8FA1A3', fontSize: 12 };

type Point = Record<string, string | number>;

function Tip({ active, payload, label, format, unitLabel }: {
  active?: boolean; payload?: { value: number }[]; label?: string; format: (n: number) => string; unitLabel: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl bg-white px-3.5 py-2.5 shadow-[0_12px_32px_rgb(15_43_47/0.16)]">
      <p className="text-xs font-medium capitalize text-[var(--rt-ink500)]">{label}</p>
      <p className="mt-0.5 flex items-center gap-2 text-sm">
        <span className="h-2 w-2 rounded-full" style={{ background: BRAND }} />
        <span className="text-[var(--rt-ink500)]">{unitLabel}</span>
        <span className="rt-num font-semibold text-[var(--rt-ink900)]">{format(payload[0].value)}</span>
      </p>
    </div>
  );
}

export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="grid h-full w-full place-items-center rounded-[22px] bg-[var(--rt-paper)]">
      <div className="flex flex-col items-center gap-2 px-6 text-center">
        <svg width="40" height="28" viewBox="0 0 40 28" fill="none" aria-hidden>
          <rect x="2" y="16" width="6" height="10" rx="3" fill="#C3CFCE" />
          <rect x="12" y="10" width="6" height="16" rx="3" fill="#C3CFCE" />
          <rect x="22" y="13" width="6" height="13" rx="3" fill="#C3CFCE" />
          <rect x="32" y="4" width="6" height="22" rx="3" fill="#C3CFCE" />
        </svg>
        <p className="text-sm text-[var(--rt-ink500)]">{message}</p>
      </div>
    </div>
  );
}

export function AreaTrend({ data, dataKey, format, unitLabel, compact }: {
  data: Point[]; dataKey: string; format: (n: number) => string; unitLabel: string; compact?: (n: number) => string;
}) {
  const gid = useId().replace(/:/g, '');
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND} stopOpacity={0.18} />
            <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={AXIS} dy={8} />
        <YAxis axisLine={false} tickLine={false} tick={AXIS} width={64} tickFormatter={(v: number) => (compact ?? format)(v)} />
        <Tooltip
          content={<Tip format={format} unitLabel={unitLabel} />}
          cursor={{ stroke: '#0F2B2F', strokeOpacity: 0.18, strokeWidth: 1 }}
          wrapperStyle={{ outline: 'none' }}
        />
        <Area
          type="linear"
          dataKey={dataKey}
          stroke={BRAND}
          strokeWidth={2}
          fill={`url(#${gid})`}
          dot={{ r: 3.5, fill: '#fff', stroke: BRAND, strokeWidth: 2 }}
          activeDot={{ r: 5, fill: BRAND, stroke: '#fff', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BarTrend({ data, dataKey, format, unitLabel, compact }: {
  data: Point[]; dataKey: string; format: (n: number) => string; unitLabel: string; compact?: (n: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="38%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={AXIS} dy={8} />
        <YAxis axisLine={false} tickLine={false} tick={AXIS} width={64} tickFormatter={(v: number) => (compact ?? format)(v)} />
        <Tooltip
          content={<Tip format={format} unitLabel={unitLabel} />}
          cursor={{ fill: '#0F2B2F', fillOpacity: 0.04, radius: 8 } as never}
          wrapperStyle={{ outline: 'none' }}
        />
        <Bar dataKey={dataKey} fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Cartão de gráfico: título, apoio, ação (ex.: período) e área do gráfico. */
export function ChartCard({ title, subtitle, action, children, className = '' }: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`flex h-full flex-col rounded-[var(--rt-radius-card)] bg-white p-6 shadow-[var(--rt-shadow-card)] ${className}`}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-semibold text-[var(--rt-ink900)]">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-[var(--rt-ink500)]">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="h-[260px] w-full min-w-0 sm:h-[300px]">{children}</div>
    </section>
  );
}

/**
 * Duas séries da mesma unidade (contagem) num eixo só: cores categóricas 1 e 2
 * da paleta validada (azul e laranja), legenda sempre visível e valor final
 * escrito na ponta de cada linha — a cor nunca é a única pista.
 */
export function MultiLineTrend({ data, series, format }: {
  data: Point[];
  series: { key: string; label: string; color: string }[];
  format: (n: number) => string;
}) {
  const last = data[data.length - 1];
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap gap-4">
        {series.map((sr) => (
          <span key={sr.key} className="inline-flex items-center gap-2 text-sm text-[var(--rt-ink700)]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: sr.color }} />
            {sr.label}
            {last && <span className="rt-num font-semibold text-[var(--rt-ink900)]">{format(Number(last[sr.key] ?? 0))}</span>}
          </span>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={AXIS} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={AXIS} width={48} allowDecimals={false} tickFormatter={(v: number) => format(v)} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-2xl bg-white px-3.5 py-2.5 shadow-[0_12px_32px_rgb(15_43_47/0.16)]">
                    <p className="text-xs font-medium capitalize text-[var(--rt-ink500)]">{label}</p>
                    {payload.map((p) => (
                      <p key={String(p.dataKey)} className="mt-0.5 flex items-center gap-2 text-sm">
                        <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                        <span className="text-[var(--rt-ink500)]">{series.find((x) => x.key === p.dataKey)?.label}</span>
                        <span className="rt-num ml-auto pl-3 font-semibold text-[var(--rt-ink900)]">{format(Number(p.value))}</span>
                      </p>
                    ))}
                  </div>
                );
              }}
              cursor={{ stroke: '#0F2B2F', strokeOpacity: 0.18, strokeWidth: 1 }}
              wrapperStyle={{ outline: 'none' }}
            />
            {series.map((sr) => (
              <Line
                key={sr.key}
                type="linear"
                dataKey={sr.key}
                stroke={sr.color}
                strokeWidth={2}
                dot={{ r: 3.5, fill: '#fff', stroke: sr.color, strokeWidth: 2 }}
                activeDot={{ r: 5, fill: sr.color, stroke: '#fff', strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
