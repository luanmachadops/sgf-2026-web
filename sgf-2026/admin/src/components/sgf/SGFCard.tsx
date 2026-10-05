import React from 'react';
import type { IconType } from './icons';

/**
 * Cartão no padrão do app do motorista: branco, cantos de 28px e sombra suave.
 * `hero` é o cartão escuro de destaque (#0F2B2F) com texto claro.
 */
export interface SGFCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'bordered' | 'glass' | 'hero' | 'soft';
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  hover?: boolean;
  title?: string;
  icon?: IconType;
}

const PADDING = { none: '0', sm: '16px', md: '20px', lg: '24px', xl: '32px' };

export const SGFCard = React.forwardRef<HTMLDivElement, SGFCardProps>(
  ({ variant = 'default', padding = 'md', hover = false, className = '', children, title, icon: Icon, style, ...props }, ref) => {
    const variants: Record<NonNullable<SGFCardProps['variant']>, string> = {
      default: 'bg-white shadow-[var(--rt-shadow-card)]',
      elevated: 'bg-white shadow-[var(--rt-shadow-float)]',
      bordered: 'bg-white shadow-[var(--rt-shadow-card)]',
      glass: 'bg-white/80 backdrop-blur-md shadow-[var(--rt-shadow-card)]',
      soft: 'bg-[var(--rt-paper2)]',
      hero: 'bg-[var(--rt-ink900)] text-white',
    };
    const hoverCls = hover ? 'cursor-pointer transition hover:-translate-y-0.5 hover:shadow-[var(--rt-shadow-float)]' : '';
    return (
      <div
        ref={ref}
        className={`rounded-[var(--rt-radius-card)] ${variants[variant]} ${hoverCls} ${className}`}
        style={{ padding: PADDING[padding], ...style }}
        {...props}
      >
        {(title || Icon) && (
          <div className="mb-4 flex items-center gap-2.5">
            {Icon && (
              <span className={`grid h-9 w-9 place-items-center rounded-full ${variant === 'hero' ? 'bg-white/10 text-white' : 'bg-[var(--rt-brand-100)] text-[var(--rt-brand)]'}`}>
                <Icon width={18} height={18} />
              </span>
            )}
            {title && <h3 className={`text-[15px] font-semibold ${variant === 'hero' ? 'text-white' : 'text-[var(--rt-ink900)]'}`}>{title}</h3>}
          </div>
        )}
        {children}
      </div>
    );
  },
);

SGFCard.displayName = 'SGFCard';
