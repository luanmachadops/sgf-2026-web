import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CaretDown, Check } from './icons';
import { cn } from '@/lib/utils';

export interface SGFSelectOption {
  value: string;
  label: string;
  icon?: React.ElementType;
}

export interface SGFSelectProps {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ElementType;
  options: SGFSelectOption[];
  fullWidth?: boolean;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  className?: string;
  /** sobrescreve estilos do gatilho (altura/padding/fonte) */
  triggerClassName?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
}

const MENU_MAX_HEIGHT = 240;

export const SGFSelect = React.forwardRef<HTMLDivElement, SGFSelectProps>(
  (
    {
      label,
      error,
      hint,
      icon: Icon,
      options,
      fullWidth = false,
      value: controlledValue,
      defaultValue,
      placeholder = 'Selecione...',
      onChange,
      className = '',
      triggerClassName,
      id,
      disabled,
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [internalValue, setInternalValue] = useState(defaultValue || '');
    const [coords, setCoords] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number }>({ left: 0, width: 0, maxHeight: MENU_MAX_HEIGHT });
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;

    const currentValue = controlledValue !== undefined ? controlledValue : internalValue;
    const selectedOption = options.find((opt) => opt.value === currentValue);

    // Posiciona o menu (portal) a partir do gatilho; abre para cima se faltar espaço.
    const updatePosition = useCallback(() => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUp = spaceBelow < Math.min(MENU_MAX_HEIGHT, 200) && spaceAbove > spaceBelow;
      const maxHeight = Math.max(120, Math.min(MENU_MAX_HEIGHT, (openUp ? spaceAbove : spaceBelow) - 16));
      setCoords({
        left: rect.left,
        width: rect.width,
        maxHeight,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + 8 }
          : { top: rect.bottom + 8 }),
      });
    }, []);

    // Recalcula ao abrir + em scroll/resize.
    useEffect(() => {
      if (!isOpen) return;
      updatePosition();
      const onScroll = () => updatePosition();
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onScroll);
      return () => {
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', onScroll);
      };
    }, [isOpen, updatePosition]);

    // Fecha ao clicar fora (considerando o gatilho E o menu no portal).
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node;
        if (
          containerRef.current && !containerRef.current.contains(target) &&
          menuRef.current && !menuRef.current.contains(target)
        ) {
          setIsOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (optionValue: string) => {
      if (disabled) return;
      setInternalValue(optionValue);
      onChange?.(optionValue);
      setIsOpen(false);
    };

    return (
      <div
        ref={containerRef}
        className={cn('flex flex-col relative', fullWidth && 'w-full', className)}
      >
        {label && (
          <label
            htmlFor={selectId}
            className="block text-[var(--sgf-text-sm)] font-[var(--sgf-font-semibold)] text-[var(--sgf-text-primary)] mb-[var(--sgf-space-2)]"
          >
            {label}
          </label>
        )}

        <div
          ref={(node) => {
            triggerRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }}
          id={selectId}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={cn(
            'group relative flex w-full items-center justify-between',
            'px-[var(--sgf-select-padding-x)] py-[var(--sgf-select-padding-y)]',
            'text-[var(--sgf-text-sm)] bg-white border',
            'rounded-[var(--sgf-select-radius)]',
            'transition-all duration-[var(--sgf-transition-base)]',
            'outline-none cursor-pointer',
            'hover:border-emerald-500/50 hover:bg-slate-50/50',
            isOpen ? 'ring-4 ring-emerald-500/10 border-[var(--sgf-primary)] bg-white' : 'border-slate-200 shadow-[var(--sgf-shadow-xs)]',
            disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : '',
            error && 'border-red-300 focus:border-red-500 focus:ring-red-500/10',
            triggerClassName
          )}
        >
          <span className={cn('flex items-center gap-2 truncate pr-2', selectedOption ? 'text-slate-900 font-medium' : 'text-slate-400')}>
            {selectedOption?.icon && <selectedOption.icon className="h-4 w-4 shrink-0 text-slate-400" />}
            {!selectedOption?.icon && Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" />}
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <CaretDown
            className={cn(
              "h-2.5 w-2.5 text-slate-400 transition-transform duration-[var(--sgf-transition-base)] shrink-0",
              isOpen && 'transform rotate-180 text-emerald-600'
            )}
          />
        </div>

        {/* Dropdown Menu — renderizado em portal para não ser cortado por modais/overflow */}
        {isOpen && createPortal(
          <div
            ref={menuRef}
            className="fixed z-[2000] bg-white rounded-2xl border border-slate-100 shadow-[var(--sgf-shadow-lg)] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
            style={{
              left: coords.left,
              width: coords.width,
              ...(coords.top !== undefined ? { top: coords.top } : {}),
              ...(coords.bottom !== undefined ? { bottom: coords.bottom } : {}),
            }}
          >
            <div className="overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar" style={{ maxHeight: coords.maxHeight }}>
              {options.map((option) => (
                <div
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    'relative flex w-full cursor-pointer select-none items-center',
                    'rounded-full py-1.5 px-3',
                    'text-sm leading-tight outline-none',
                    'transition-all duration-[var(--sgf-transition-fast)]',
                    'hover:bg-emerald-50 hover:text-emerald-900',
                    currentValue === option.value
                      ? 'bg-emerald-50/80 text-emerald-700 font-bold'
                      : 'text-slate-600 font-medium'
                  )}
                >
                  <span className="flex-1 flex items-center gap-2.5 truncate">
                    {option.icon && (
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center transition-colors",
                        currentValue === option.value ? "bg-emerald-100 text-emerald-600" : "bg-slate-50 text-slate-400"
                      )}>
                        <option.icon className="h-4 w-4" />
                      </div>
                    )}
                    {option.label}
                  </span>
                  {currentValue === option.value && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 shadow-sm animate-in zoom-in-50 duration-300">
                      <Check className="h-3 w-3 text-white stroke-[3]" />
                    </div>
                  )}
                </div>
              ))}
              {options.length === 0 && (
                <div className="py-[var(--sgf-space-8)] px-[var(--sgf-space-4)] text-center">
                  <p className="text-[var(--sgf-text-sm)] font-medium text-slate-400 italic">Nenhuma opção disponível</p>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

        {error && (
          <p className="mt-[var(--sgf-space-2)] text-[var(--sgf-text-xs)] font-[var(--sgf-font-medium)] text-red-600">{error}</p>
        )}

        {!error && hint && <p className="mt-[var(--sgf-space-2)] text-[var(--sgf-text-xs)] text-slate-500">{hint}</p>}
      </div>
    );
  }
);

SGFSelect.displayName = 'SGFSelect';
