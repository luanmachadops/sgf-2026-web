import React from 'react';
import type { IconType } from './icons';
import { Eye, EyeOff } from './icons';

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
      type,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id || `input-${generatedId.replace(/:/g, '')}`;
    const isPassword = type === 'password';
    const [passwordVisible, setPasswordVisible] = React.useState(false);

    // Campo do app: preenchimento papel, sem borda, cantos 16px; foco em verde.
    const baseInputStyles = `
      w-full h-12 px-4
      bg-[var(--rt-paper)]
      rounded-2xl border border-transparent
      text-[15px] text-[var(--rt-ink900)]
      transition
      focus:outline-none focus:bg-white focus:ring-4
      disabled:opacity-60 disabled:cursor-not-allowed
      read-only:bg-[var(--rt-paper)] read-only:text-[var(--rt-ink700)]
      placeholder:text-[var(--rt-ink400)]
    `;

    const stateStyles = error
      ? 'border-[var(--rt-red600)]/40 focus:ring-[var(--rt-red600)]/10'
      : 'focus:border-[var(--rt-brand)] focus:ring-[var(--rt-brand)]/10';

    const iconStyles = Icon
      ? iconPosition === 'left'
        ? 'pl-11'
        : 'pr-11'
      : '';
    const passwordStyles = isPassword ? 'pr-12' : '';

    return (
      <div className={`${fullWidth ? 'w-full' : ''} ${className}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="mb-2 block text-[13px] font-medium text-[var(--rt-ink500)]"
          >
            {label}
          </label>
        )}

        <div className="relative">
          {Icon && iconPosition === 'left' && (
            <div className="absolute left-[var(--sgf-space-4)] top-1/2 -translate-y-1/2 text-[var(--rt-ink400)]">
              <Icon width={18} height={18} />
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            type={isPassword && passwordVisible ? 'text' : type}
            className={`${baseInputStyles} ${stateStyles} ${iconStyles} ${passwordStyles}`.trim().replace(/\s+/g, ' ')}
            {...props}
          />

          {Icon && iconPosition === 'right' && (
            <div className="absolute right-[var(--sgf-space-4)] top-1/2 -translate-y-1/2 text-[var(--rt-ink400)]">
              <Icon width={18} height={18} />
            </div>
          )}

          {isPassword && (
            <button
              type="button"
              onClick={() => setPasswordVisible((visible) => !visible)}
              className="absolute right-[var(--sgf-space-4)] top-1/2 -translate-y-1/2 text-[var(--rt-ink400)] transition-colors hover:text-[var(--rt-ink900)] focus:outline-none"
              aria-label={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
              title={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {passwordVisible ? <EyeOff width={18} height={18} /> : <Eye width={18} height={18} />}
            </button>
          )}
        </div>

        {error && (
          <p className="mt-2 text-xs font-medium text-[var(--rt-red600)]">{error}</p>
        )}

        {!error && hint && (
          <p className="mt-2 text-xs text-[var(--rt-ink500)]">{hint}</p>
        )}
      </div>
    );
  }
);

SGFInput.displayName = 'SGFInput';
