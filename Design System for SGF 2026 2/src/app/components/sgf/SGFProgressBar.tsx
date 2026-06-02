import React from 'react';

export interface SGFProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  variant?: 'default' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const SGFProgressBar: React.FC<SGFProgressBarProps> = ({
  value,
  max = 100,
  label,
  showPercentage = false,
  variant = 'default',
  size = 'md',
  className = '',
}) => {
  const percentage = Math.min((value / max) * 100, 100);

  const variantColors = {
    default: 'bg-[var(--sgf-primary)]',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
  };

  const sizeStyles = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3',
  };

  return (
    <div className={className}>
      {(label || showPercentage) && (
        <div className="flex justify-between items-center mb-2">
          {label && <span className="text-xs font-bold text-slate-600">{label}</span>}
          {showPercentage && (
            <span className="text-xs font-black text-slate-400 uppercase">
              {percentage.toFixed(0)}%
            </span>
          )}
        </div>
      )}

      <div className={`w-full bg-slate-100 rounded-full overflow-hidden ${sizeStyles[size]}`}>
        <div
          className={`${sizeStyles[size]} ${variantColors[variant]} rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
