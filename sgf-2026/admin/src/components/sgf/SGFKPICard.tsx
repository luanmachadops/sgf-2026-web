import React from 'react';
import type { IconType } from './icons';
import { SGFCard } from './SGFCard';
import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

export interface SGFKPIChartData {
  month: string;
  value: number;
}

export interface SGFKPICardProps {
  title: string;
  value: string | number;
  icon: IconType;
  iconColor?: string;
  chartData?: SGFKPIChartData[];
  chartColor?: string;
  percentage?: number;
  trend?: 'up' | 'down' | string;
  loading?: boolean;
  onClick?: () => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0F2B2F]/50 border border-white/10 p-[var(--sgf-space-2)] rounded-[var(--sgf-radius-base)] shadow-[var(--sgf-shadow-xl)] backdrop-blur-md text-center">
        <p className="text-[var(--sgf-text-2xs)] text-white/40 font-[var(--sgf-font-bold)] uppercase tracking-wider mb-[var(--sgf-space-1)]">{label}</p>
        <p className="text-[var(--sgf-text-sm)] font-[var(--sgf-font-black)] text-white">{payload[0].value.toLocaleString('pt-BR')}</p>
      </div>
    );
  }
  return null;
};

export const SGFKPICard: React.FC<SGFKPICardProps> = ({
  title,
  value,
  icon: Icon,
  iconColor = 'text-emerald-500',
  chartData = [],
  chartColor = '#10b981', // emerald-500
  percentage,
  trend,
  loading = false,
  onClick,
}) => {
  return (
    <SGFCard
      hover={!!onClick}
      onClick={onClick}
      className={`group h-full ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-center justify-between h-full gap-[var(--sgf-space-4)]">
        {/* Left Side: Info */}
        <div className="flex flex-col gap-[var(--sgf-space-2)] flex-1 min-w-0">
          <div className={`p-2 w-fit rounded-[var(--sgf-radius-base)] bg-slate-50 group-hover:scale-110 transition-transform duration-500 ${iconColor}`}>
            <Icon width={18} height={18} />
          </div>
          <div>
            <p className="text-slate-400 text-[11px] font-semibold tracking-[0.03em] mb-0.5 truncate">{title}</p>
            {loading ? (
              <div className="h-9 bg-slate-100 rounded-[var(--sgf-radius-md)] animate-pulse w-24" />
            ) : (
              <>
                <h3 className="text-[var(--sgf-text-2xl)] font-bold text-slate-800 tracking-tight leading-tight">{value}</h3>
                {percentage !== undefined && trend && (
                  <p className={`mt-1 text-[var(--sgf-text-xs)] font-[var(--sgf-font-bold)] ${trend === 'up' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {trend === 'up' ? '+' : '-'}{percentage}% vs. periodo anterior
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Side: Chart */}
        <div className="w-[80px] h-[80px] shrink-0 opacity-60 group-hover:opacity-100 transition-opacity duration-500">
          {chartData.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="month" hide />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  content={<CustomTooltip />}
                />
                <Bar
                  dataKey="value"
                  radius={[4, 4, 0, 0]}
                  fill={chartColor}
                  barSize={6}
                >
                  {chartData.map((_entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={chartColor}
                      fillOpacity={0.4 + (index / (chartData.length - 1)) * 0.6}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </SGFCard>
  );
};
