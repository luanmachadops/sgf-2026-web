import React from 'react';

export interface SGFTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  fullWidth?: boolean;
  maxLength?: number;
  showCount?: boolean;
}

export const SGFTextarea = React.forwardRef<HTMLTextAreaElement, SGFTextareaProps>(
  (
    {
      label,
      error,
      hint,
      fullWidth = false,
      maxLength,
      showCount = false,
      className = '',
      id,
      value,
      ...props
    },
    ref
  ) => {
    const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;
    const currentLength = typeof value === 'string' ? value.length : 0;

    const baseStyles =
      'w-full px-4 py-3 bg-slate-50 border rounded-2xl text-sm transition-all duration-200 focus:outline-none focus:ring-4 focus:bg-white disabled:opacity-50 disabled:cursor-not-allowed resize-none';

    const stateStyles = error
      ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10'
      : 'border-slate-200 focus:border-[var(--sgf-primary)] focus:ring-emerald-500/10';

    return (
      <div className={`${fullWidth ? 'w-full' : ''} ${className}`}>
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-semibold text-[var(--sgf-text-primary)] mb-2"
          >
            {label}
          </label>
        )}

        <textarea
          ref={ref}
          id={textareaId}
          className={`${baseStyles} ${stateStyles}`}
          maxLength={maxLength}
          value={value}
          {...props}
        />

        <div className="flex justify-between items-center mt-2">
          <div className="flex-1">
            {error && (
              <p className="text-xs font-medium text-red-600">{error}</p>
            )}
            {!error && hint && (
              <p className="text-xs text-slate-500">{hint}</p>
            )}
          </div>

          {showCount && maxLength && (
            <p className="text-xs text-slate-400 font-medium">
              {currentLength}/{maxLength}
            </p>
          )}
        </div>
      </div>
    );
  }
);

SGFTextarea.displayName = 'SGFTextarea';
