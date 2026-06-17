import React from 'react';
import type { IconType } from './icons';

export interface SGFInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: IconType;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

export const SGFInput = React.forwardRef<HTMLInputElement, SGFInputProps>(
  (
    {
      label,
      error,
      hint,
      icon: Icon,
      iconPosition = 'left',
      fullWidth = false,
      className = '',
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

    const baseInputStyles = `
      w-full
      px-[var(--sgf-input-padding-x)]
      py-[var(--sgf-input-padding-y)]
      bg-slate-50
      border
      rounded-[var(--sgf-input-radius)]
      text-[var(--sgf-text-sm)]
      transition-all duration-[var(--sgf-transition-base)]
      focus:outline-none focus:ring-4 focus:bg-white
      disabled:opacity-50 disabled:cursor-not-allowed
      placeholder:text-slate-400
    `;

    const stateStyles = error
      ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10'
      : 'border-slate-200 focus:border-[var(--sgf-primary)] focus:ring-emerald-500/10';

    const iconStyles = Icon
      ? iconPosition === 'left'
        ? 'pl-11'
        : 'pr-11'
      : '';

    return (
      <div className={`${fullWidth ? 'w-full' : ''} ${className}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-[var(--sgf-text-sm)] font-[var(--sgf-font-semibold)] text-[var(--sgf-text-primary)] mb-[var(--sgf-space-2)]"
          >
            {label}
          </label>
        )}

        <div className="relative">
          {Icon && iconPosition === 'left' && (
            <div className="absolute left-[var(--sgf-space-4)] top-1/2 -translate-y-1/2 text-slate-400">
              <Icon width={18} height={18} />
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            className={`${baseInputStyles} ${stateStyles} ${iconStyles}`.trim().replace(/\s+/g, ' ')}
            {...props}
          />

          {Icon && iconPosition === 'right' && (
            <div className="absolute right-[var(--sgf-space-4)] top-1/2 -translate-y-1/2 text-slate-400">
              <Icon width={18} height={18} />
            </div>
          )}
        </div>

        {error && (
          <p className="mt-[var(--sgf-space-2)] text-[var(--sgf-text-xs)] font-[var(--sgf-font-medium)] text-red-600">{error}</p>
        )}

        {!error && hint && (
          <p className="mt-[var(--sgf-space-2)] text-[var(--sgf-text-xs)] text-slate-500">{hint}</p>
        )}
      </div>
    );
  }
);

SGFInput.displayName = 'SGFInput';
