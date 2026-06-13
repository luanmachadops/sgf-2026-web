import React from 'react';
import type { IconType } from './icons';

export interface SGFBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'moving' | 'idle' | 'stopped' | 'alert';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconType;
  dot?: boolean;
}

export const SGFBadge = React.forwardRef<HTMLSpanElement, SGFBadgeProps>(
  (
    {
      variant = 'default',
      size = 'md',
      icon: Icon,
      dot = false,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles = `
      inline-flex items-center gap-1.5
      font-semibold whitespace-nowrap
      rounded-full ring-1 ring-inset
      transition-colors duration-[var(--sgf-transition-fast)]
    `;

    // Estilo "soft": fundo bem claro + texto forte + anel sutil (menos chamativo, padronizado).
    const variantStyles = {
      default: 'bg-slate-50 text-slate-600 ring-slate-200',
      success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      warning: 'bg-amber-50 text-amber-700 ring-amber-200',
      error: 'bg-red-50 text-red-700 ring-red-200',
      info: 'bg-blue-50 text-blue-700 ring-blue-200',
      moving: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      idle: 'bg-blue-50 text-blue-700 ring-blue-200',
      stopped: 'bg-slate-50 text-slate-600 ring-slate-200',
      alert: 'bg-red-50 text-red-700 ring-red-200',
    };

    // Tamanhos consistentes em todo o site.
    const sizeStyles = {
      sm: 'px-2 py-[1px] text-[10px]',
      md: 'px-2.5 py-0.5 text-[11px]',
      lg: 'px-3 py-1 text-xs',
    };

    const dotColors = {
      default: 'bg-slate-500',
      success: 'bg-emerald-500',
      warning: 'bg-amber-500',
      error: 'bg-red-500',
      info: 'bg-blue-500',
      moving: 'bg-[var(--sgf-status-moving)]',
      idle: 'bg-[var(--sgf-status-idle)]',
      stopped: 'bg-[var(--sgf-status-stopped)]',
      alert: 'bg-[var(--sgf-status-alert)]',
    };

    const iconSizes = {
      sm: 10,
      md: 12,
      lg: 14,
    };

    return (
      <span
        ref={ref}
        className={`
          ${baseStyles}
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `.trim().replace(/\s+/g, ' ')}
        {...props}
      >
        {dot && (
          <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />
        )}
        {Icon && <Icon width={iconSizes[size]} height={iconSizes[size]} />}
        {children}
      </span>
    );
  }
);

SGFBadge.displayName = 'SGFBadge';
