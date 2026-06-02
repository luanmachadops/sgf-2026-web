import React from 'react';
import type { IconType } from './icons';

export interface SGFButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: IconType;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  loading?: boolean;
}

export const SGFButton = React.forwardRef<HTMLButtonElement, SGFButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      icon: Icon,
      iconPosition = 'left',
      fullWidth = false,
      loading = false,
      className = '',
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles = `
      inline-flex items-center justify-center gap-2
      font-semibold
      transition-all duration-[var(--sgf-transition-base)]
      focus:outline-none focus:ring-4
      disabled:opacity-50 disabled:cursor-not-allowed
      rounded-[var(--sgf-btn-radius)]
    `;

    const variantStyles = {
      primary: 'bg-[var(--sgf-primary)] text-white hover:brightness-110 focus:ring-emerald-500/20 shadow-[var(--sgf-shadow-sm)] hover:shadow-[var(--sgf-shadow-md)] active:scale-[0.98]',
      secondary: 'bg-[var(--sgf-dark)] text-white hover:brightness-110 focus:ring-slate-500/20 shadow-[var(--sgf-shadow-sm)] hover:shadow-[var(--sgf-shadow-md)] active:scale-[0.98]',
      outline: 'border-2 border-[var(--sgf-primary)] text-[var(--sgf-primary)] hover:bg-emerald-50 focus:ring-emerald-500/20 active:scale-[0.98]',
      ghost: 'text-[var(--sgf-text-secondary)] hover:bg-slate-100 hover:text-[var(--sgf-text-primary)] focus:ring-slate-500/20',
      danger: 'bg-[var(--sgf-error)] text-white hover:brightness-110 focus:ring-red-500/20 shadow-[var(--sgf-shadow-sm)] hover:shadow-[var(--sgf-shadow-md)] active:scale-[0.98]',
    };

    // Size uses CSS tokens for consistent 8px grid
    const sizeStyles = {
      sm: 'px-[var(--sgf-btn-padding-x-sm)] py-[var(--sgf-btn-padding-y-sm)] text-[var(--sgf-text-xs)]',
      md: 'px-[var(--sgf-btn-padding-x)] py-[var(--sgf-btn-padding-y)] text-[var(--sgf-text-sm)]',
      lg: 'px-[var(--sgf-btn-padding-x-lg)] py-[var(--sgf-btn-padding-y-lg)] text-[var(--sgf-text-base)]',
      xl: 'px-[var(--sgf-space-8)] py-[var(--sgf-space-5)] text-[var(--sgf-text-lg)]',
    };

    const iconSizes = {
      sm: 14,
      md: 16,
      lg: 18,
      xl: 20,
    };

    return (
      <button
        ref={ref}
        className={`
          ${baseStyles}
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `.trim().replace(/\s+/g, ' ')}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin"
            width={iconSizes[size]}
            height={iconSizes[size]}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {!loading && Icon && iconPosition === 'left' && <Icon width={iconSizes[size]} height={iconSizes[size]} />}
        {children}
        {!loading && Icon && iconPosition === 'right' && <Icon width={iconSizes[size]} height={iconSizes[size]} />}
      </button>
    );
  }
);

SGFButton.displayName = 'SGFButton';
