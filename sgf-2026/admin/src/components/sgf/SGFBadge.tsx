import React from 'react';
import type { IconType } from './icons';

/** Pílula de status no padrão do app: fundo suave + ponto opcional, texto em tinta da cor. */
export interface SGFBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'moving' | 'idle' | 'stopped' | 'alert';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconType;
  dot?: boolean;
}

const TONE: Record<NonNullable<SGFBadgeProps['variant']>, { box: string; dot: string }> = {
  default: { box: 'bg-[var(--rt-paper2)] text-[var(--rt-ink700)]', dot: 'bg-[var(--rt-ink400)]' },
  success: { box: 'bg-[var(--rt-brand-100)] text-[#0B7A50]', dot: 'bg-[var(--rt-brand)]' },
  warning: { box: 'bg-[var(--rt-amber100)] text-[var(--rt-amber600)]', dot: 'bg-[#F59E0B]' },
  error: { box: 'bg-[var(--rt-red100)] text-[var(--rt-red600)]', dot: 'bg-[var(--rt-red600)]' },
  info: { box: 'bg-[var(--rt-blue100)] text-[var(--rt-blue600)]', dot: 'bg-[var(--rt-blue600)]' },
  moving: { box: 'bg-[var(--rt-green100)] text-[var(--rt-green600)]', dot: 'bg-[#22C55E]' },
  idle: { box: 'bg-[var(--rt-blue100)] text-[var(--rt-blue600)]', dot: 'bg-[#3B82F6]' },
  stopped: { box: 'bg-[var(--rt-paper2)] text-[var(--rt-ink500)]', dot: 'bg-[#9CA3AF]' },
  alert: { box: 'bg-[var(--rt-red100)] text-[var(--rt-red600)]', dot: 'bg-[#EF4444] animate-pulse' },
};
const SIZE = { sm: 'h-6 px-2.5 text-[11px]', md: 'h-7 px-3 text-xs', lg: 'h-8 px-3.5 text-[13px]' };
const ICON = { sm: 11, md: 12, lg: 14 };

export const SGFBadge = React.forwardRef<HTMLSpanElement, SGFBadgeProps>(
  ({ variant = 'default', size = 'md', icon: Icon, dot = false, className = '', children, ...props }, ref) => {
    const t = TONE[variant];
    return (
      <span ref={ref} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${t.box} ${SIZE[size]} ${className}`} {...props}>
        {dot && <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />}
        {Icon && <Icon width={ICON[size]} height={ICON[size]} />}
        {children}
      </span>
    );
  },
);

SGFBadge.displayName = 'SGFBadge';
