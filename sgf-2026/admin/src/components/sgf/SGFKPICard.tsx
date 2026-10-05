import React from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import { SGFCard } from './SGFCard';
import type { IconType } from './icons';

/**
 * Indicador no padrão do app: ícone em círculo, rótulo inteiro (sem cortar),
 * número grande e, quando há tendência real, uma minilinha da série com o valor
 * do mês ao passar o mouse. Sem série (ou tudo zero) não desenha gráfico vazio.
 */
export interface SGFKPIChartData {
  month: string;
  value: number;
}

export interface SGFKPICardProps {
  title: string;
  value: string | number;
  icon: IconType;
  /** Mantido por compatibilidade; o tom vem de `tone`. */
  iconColor?: string;
  chartData?: SGFKPIChartData[];
  chartColor?: string;
  percentage?: number;
  trend?: 'up' | 'down' | string;
  loading?: boolean;
  onClick?: () => void;
  /** Linha de apoio abaixo do número (ex.: "de 3 cadastradas"). */
  hint?: string;
  tone?: 'brand' | 'blue' | 'amber' | 'red' | 'neutral';
  format?: (n: number) => string;
}

const TONES = {
  brand: { bg: 'bg-[var(--rt-brand-100)]', fg: 'text-[var(--rt-brand)]', stroke: '#00A86B' },
  blue: { bg: 'bg-[var(--rt-blue100)]', fg: 'text-[var(--rt-blue600)]', stroke: '#2A78D6' },
  amber: { bg: 'bg-[var(--rt-amber100)]', fg: 'text-[var(--rt-amber600)]', stroke: '#EDA100' },
  red: { bg: 'bg-[var(--rt-red100)]', fg: 'text-[var(--rt-red600)]', stroke: '#E34948' },
  neutral: { bg: 'bg-[var(--rt-paper2)]', fg: 'text-[var(--rt-ink500)]', stroke: '#5E7376' },
};

function SparkTip({ active, payload, format }: { active?: boolean; payload?: { payload: SGFKPIChartData }[]; format?: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl bg-[var(--rt-ink900)] px-2.5 py-1.5 text-[11px] text-white shadow-lg">
      <span className="text-white/60">{p.month}</span>{' '}
      <span className="rt-num font-semibold">{format ? format(p.value) : p.value.toLocaleString('pt-BR')}</span>
    </div>
  );
}

export const SGFKPICard: React.FC<SGFKPICardProps> = ({
  title, value, icon: Icon, chartData = [], chartColor, loading = false, onClick, hint, tone = 'brand', format,
}) => {
  const t = TONES[tone];
  const hasTrend = chartData.length > 1 && chartData.some((d) => d.value !== 0);
  const gid = React.useId().replace(/:/g, '');

  return (
    <SGFCard hover={!!onClick} onClick={onClick} padding="lg" className="flex h-full flex-col">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${t.bg} ${t.fg}`}>
          <Icon width={20} height={20} />
        </span>
        <p className="text-sm font-medium leading-snug text-[var(--rt-ink500)]">{title}</p>
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {loading ? (
            <div className="h-9 w-24 animate-pulse rounded-xl bg-[var(--rt-paper)]" />
          ) : (
            <p className="rt-num truncate text-[32px] font-light leading-none text-[var(--rt-ink900)]">{value}</p>
          )}
          {hint && !loading && <p className="mt-2 text-xs text-[var(--rt-ink400)]">{hint}</p>}
        </div>

        {hasTrend && !loading && (
          <div className="h-12 w-28 shrink-0" aria-label={`${title}: ${chartData.map((d) => `${d.month} ${d.value}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={chartData} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
                <defs>
                  <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColor ?? t.stroke} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={chartColor ?? t.stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip content={<SparkTip format={format} />} cursor={false} wrapperStyle={{ outline: 'none' }} />
                <Area type="linear" dataKey="value" stroke={chartColor ?? t.stroke} strokeWidth={2} fill={`url(#${gid})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </SGFCard>
  );
};
