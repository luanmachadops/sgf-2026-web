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
    const generatedId = React.useId();
    const textareaId = id || `textarea-${generatedId.replace(/:/g, '')}`;
    const currentLength = typeof value === 'string' ? value.length : 0;

    const baseStyles = `
      w-full
      px-4 py-3
      bg-white
      border
      rounded-2xl
      text-[var(--sgf-text-sm)]
      transition-all duration-[var(--sgf-transition-base)]
      shadow-[var(--sgf-shadow-xs)]
      focus:outline-none focus:ring-4 focus:bg-white
      disabled:opacity-50 disabled:cursor-not-allowed
      resize-none
      placeholder:text-slate-400
    `;

    const stateStyles = error
      ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10'
      : 'border-slate-200 hover:border-slate-300 focus:border-[var(--sgf-primary)] focus:ring-emerald-500/10';

    return (
      <div className={`${fullWidth ? 'w-full' : ''} ${className}`}>
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-[var(--sgf-text-sm)] font-[var(--sgf-font-semibold)] text-[var(--sgf-text-primary)] mb-[var(--sgf-space-2)]"
          >
            {label}
          </label>
        )}

        <textarea
          ref={ref}
          id={textareaId}
          className={`${baseStyles} ${stateStyles}`.trim().replace(/\s+/g, ' ')}
          maxLength={maxLength}
          value={value}
          {...props}
        />

        <div className="flex justify-between items-center mt-[var(--sgf-space-2)]">
          <div className="flex-1">
            {error && (
              <p className="text-[var(--sgf-text-xs)] font-[var(--sgf-font-medium)] text-red-600">{error}</p>
            )}
            {!error && hint && (
              <p className="text-[var(--sgf-text-xs)] text-slate-500">{hint}</p>
            )}
          </div>

          {showCount && maxLength && (
            <p className="text-[var(--sgf-text-xs)] text-slate-400 font-[var(--sgf-font-medium)]">
              {currentLength}/{maxLength}
            </p>
          )}
        </div>
      </div>
    );
  }
);

SGFTextarea.displayName = 'SGFTextarea';
