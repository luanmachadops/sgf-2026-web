import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface SGFButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: LucideIcon;
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
    const baseStyles = 'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 focus:outline-none focus:ring-4 disabled:opacity-50 disabled:cursor-not-allowed';

    const variantStyles = {
      primary: 'bg-[var(--sgf-primary)] text-white hover:bg-[#009960] focus:ring-emerald-500/20 shadow-md hover:shadow-lg active:scale-95',
      secondary: 'bg-[var(--sgf-dark)] text-white hover:bg-[#1a3d42] focus:ring-slate-500/20 shadow-md hover:shadow-lg active:scale-95',
      outline: 'border-2 border-[var(--sgf-primary)] text-[var(--sgf-primary)] hover:bg-emerald-50 focus:ring-emerald-500/20 active:scale-95',
      ghost: 'text-[var(--sgf-text-secondary)] hover:bg-slate-100 hover:text-[var(--sgf-text-primary)] focus:ring-slate-500/20',
      danger: 'bg-[var(--sgf-error)] text-white hover:bg-red-700 focus:ring-red-500/20 shadow-md hover:shadow-lg active:scale-95',
    };

    const sizeStyles = {
      sm: 'px-3 py-1.5 text-xs rounded-xl',
      md: 'px-4 py-2.5 text-sm rounded-2xl',
      lg: 'px-6 py-3.5 text-base rounded-2xl',
      xl: 'px-8 py-4 text-lg rounded-[2rem]',
    };

    const iconSizes = {
      sm: 14,
      md: 18,
      lg: 20,
      xl: 24,
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
        `}
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
        {!loading && Icon && iconPosition === 'left' && <Icon size={iconSizes[size]} />}
        {children}
        {!loading && Icon && iconPosition === 'right' && <Icon size={iconSizes[size]} />}
      </button>
    );
  }
);

SGFButton.displayName = 'SGFButton';
