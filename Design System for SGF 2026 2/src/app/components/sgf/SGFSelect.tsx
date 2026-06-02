import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SGFSelectOption {
  value: string;
  label: string;
}

export interface SGFSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  error?: string;
  hint?: string;
  options: SGFSelectOption[];
  fullWidth?: boolean;
  onChange?: (value: string) => void;
}

export const SGFSelect = React.forwardRef<HTMLSelectElement, SGFSelectProps>(
  (
    {
      label,
      error,
      hint,
      options,
      fullWidth = false,
      className = '',
      id,
      onChange,
      ...props
    },
    ref
  ) => {
    const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;

    const baseStyles =
      'w-full px-4 py-3 pr-10 bg-slate-50 border rounded-2xl text-sm appearance-none transition-all duration-200 focus:outline-none focus:ring-4 focus:bg-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

    const stateStyles = error
      ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10'
      : 'border-slate-200 focus:border-[var(--sgf-primary)] focus:ring-emerald-500/10';

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange?.(e.target.value);
    };

    return (
      <div className={`${fullWidth ? 'w-full' : ''} ${className}`}>
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-semibold text-[var(--sgf-text-primary)] mb-2"
          >
            {label}
          </label>
        )}

        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={`${baseStyles} ${stateStyles}`}
            onChange={handleChange}
            {...props}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            <ChevronDown size={18} />
          </div>
        </div>

        {error && (
          <p className="mt-2 text-xs font-medium text-red-600">{error}</p>
        )}

        {!error && hint && (
          <p className="mt-2 text-xs text-slate-500">{hint}</p>
        )}
      </div>
    );
  }
);

SGFSelect.displayName = 'SGFSelect';
