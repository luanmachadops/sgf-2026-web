import React from 'react';
import type { IconType } from './icons';

/** Botão em pílula, como no app: verde da marca, tinta escura, contorno, fantasma e perigo. */
export interface SGFButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: IconType;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  loading?: boolean;
}

const VARIANTS = {
  primary: 'bg-[var(--rt-brand)] text-white hover:brightness-105 focus-visible:ring-[var(--rt-brand)]/30',
  secondary: 'bg-[var(--rt-ink900)] text-white hover:bg-[#163b40] focus-visible:ring-[var(--rt-ink900)]/25',
  outline: 'bg-white text-[var(--rt-ink900)] shadow-[inset_0_0_0_1px_var(--rt-hairline)] hover:bg-[var(--rt-paper)] focus-visible:ring-[var(--rt-ink900)]/15',
  ghost: 'text-[var(--rt-ink500)] hover:bg-[var(--rt-paper2)] hover:text-[var(--rt-ink900)] focus-visible:ring-[var(--rt-ink900)]/10',
  danger: 'bg-[var(--rt-red600)] text-white hover:brightness-105 focus-visible:ring-[var(--rt-red600)]/30',
};
const SIZES = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-12 px-6 text-[15px] gap-2',
  xl: 'h-14 px-8 text-base gap-2.5',
};
const ICON = { sm: 15, md: 17, lg: 18, xl: 20 };

export const SGFButton = React.forwardRef<HTMLButtonElement, SGFButtonProps>(
  ({ variant = 'primary', size = 'md', icon: Icon, iconPosition = 'left', fullWidth, loading, disabled, className = '', children, ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold transition active:scale-[0.98] focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin" width={ICON[size]} height={ICON[size]} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="4" />
          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
      )}
      {!loading && Icon && iconPosition === 'left' && <Icon width={ICON[size]} height={ICON[size]} />}
      {children}
      {!loading && Icon && iconPosition === 'right' && <Icon width={ICON[size]} height={ICON[size]} />}
    </button>
  ),
);

SGFButton.displayName = 'SGFButton';
