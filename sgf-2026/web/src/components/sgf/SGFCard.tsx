import React from 'react';
import type { IconType } from './icons';

export interface SGFCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'bordered' | 'glass';
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  hover?: boolean;
  title?: string;
  icon?: IconType;
}

export const SGFCard = React.forwardRef<HTMLDivElement, SGFCardProps>(
  (
    {
      variant = 'default',
      padding = 'md',
      hover = false,
      className = '',
      children,
      title,
      icon: Icon,
      ...props
    },
    ref
  ) => {
    // Using CSS custom properties for global control
    const baseStyles = `
      rounded-[var(--sgf-card-radius)]
      transition-all
      duration-[var(--sgf-transition-base)]
    `;

    const variantStyles = {
      default: 'bg-white',
      elevated: 'bg-white shadow-[var(--sgf-shadow-lg)]',
      bordered: 'bg-white border border-slate-200',
      glass: 'bg-white/80 backdrop-blur-md',
    };

    // Padding uses CSS tokens via inline styles for precise control
    const paddingMap = {
      none: '0',
      sm: 'var(--sgf-card-padding-sm)',
      md: 'var(--sgf-card-padding)',
      lg: 'var(--sgf-card-padding-lg)',
      xl: 'var(--sgf-space-10)',
    };

    const hoverStyles = hover
      ? 'hover:shadow-[var(--sgf-shadow-xl)] hover:-translate-y-0.5 cursor-pointer'
      : '';

    return (
      <div
        ref={ref}
        className={`
          ${baseStyles}
          ${variantStyles[variant]}
          ${hoverStyles}
          ${className}
        `.trim().replace(/\s+/g, ' ')}
        style={{ padding: paddingMap[padding] }}
        {...props}
      >
        {(title || Icon) && (
          <div className="flex items-center gap-2 mb-4">
            {Icon && <Icon width={18} height={18} className="text-slate-500" />}
            {title && <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>}
          </div>
        )}
        {children}
      </div>
    );
  }
);

SGFCard.displayName = 'SGFCard';
