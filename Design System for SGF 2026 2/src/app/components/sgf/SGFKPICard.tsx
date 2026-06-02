import React from 'react';
import { LucideIcon, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { SGFCard } from './SGFCard';

export interface SGFKPICardProps {
  title: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  percentage?: number;
  icon: LucideIcon;
  iconColor?: string;
  loading?: boolean;
  onClick?: () => void;
}

export const SGFKPICard: React.FC<SGFKPICardProps> = ({
  title,
  value,
  trend = 'neutral',
  percentage,
  icon: Icon,
  iconColor = 'text-emerald-600',
  loading = false,
  onClick,
}) => {
  const trendColors = {
    up: 'text-emerald-500',
    down: 'text-rose-500',
    neutral: 'text-slate-400',
  };

  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : null;

  return (
    <SGFCard hover={!!onClick} onClick={onClick} className={onClick ? 'cursor-pointer' : ''}>
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 bg-emerald-50 rounded-2xl ${iconColor}`}>
          <Icon size={24} />
        </div>
        {percentage !== undefined && TrendIcon && (
          <div className={`flex items-center gap-1 text-xs font-bold ${trendColors[trend]}`}>
            <TrendIcon size={14} />
            {percentage}%
          </div>
        )}
      </div>

      <p className="text-slate-400 text-sm font-medium mb-1">{title}</p>

      {loading ? (
        <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
      ) : (
        <h3 className="text-3xl font-bold text-slate-900">{value}</h3>
      )}
    </SGFCard>
  );
};
