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
      font-[var(--sgf-font-bold)]
      rounded-[var(--sgf-radius-full)]
      transition-colors duration-[var(--sgf-transition-fast)]
    `;

    const variantStyles = {
      default: 'bg-slate-100 text-slate-700',
      success: 'bg-emerald-100 text-emerald-700',
      warning: 'bg-amber-100 text-amber-700',
      error: 'bg-red-100 text-red-700',
      info: 'bg-blue-100 text-blue-700',
      moving: 'bg-emerald-100 text-emerald-700',
      idle: 'bg-blue-100 text-blue-700',
      stopped: 'bg-slate-100 text-slate-600',
      alert: 'bg-red-100 text-red-700 animate-pulse',
    };

    // Using design tokens for consistent spacing
    const sizeStyles = {
      sm: 'px-[var(--sgf-space-2)] py-[2px] text-[var(--sgf-text-2xs)]',
      md: 'px-[var(--sgf-space-3)] py-[var(--sgf-space-1)] text-[var(--sgf-text-xs)]',
      lg: 'px-[var(--sgf-space-4)] py-[6px] text-[var(--sgf-text-sm)]',
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
