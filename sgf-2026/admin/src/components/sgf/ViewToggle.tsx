import { useEffect, useState } from 'react';
import { LayoutGrid, LayoutTable } from './icons';

export type ViewMode = 'cards' | 'table';

/** Lembra a visualização escolhida por tela (por navegador). */
export function useViewMode(key: string, initial: ViewMode = 'cards') {
  const storageKey = `rt:view:${key}`;
  const [mode, setMode] = useState<ViewMode>(() => {
    try { const v = localStorage.getItem(storageKey); return v === 'table' || v === 'cards' ? v : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(storageKey, mode); } catch { /* sem storage: só não lembra */ } }, [mode, storageKey]);
  return [mode, setMode] as const;
}

/**
 * Alternância Cartões/Tabela no padrão do painel do gestor (pílula com o ativo
 * em verde), com ícone + texto.
 */
export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const items = [
    { v: 'cards' as const, label: 'Cartões', Icon: LayoutGrid },
    { v: 'table' as const, label: 'Tabela', Icon: LayoutTable },
  ];
  return (
    <div className="inline-flex rounded-full bg-white p-1 shadow-[var(--rt-shadow-card)]" role="group" aria-label="Modo de visualização">
      {items.map(({ v, label, Icon }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition ${
            value === v ? 'bg-[var(--rt-brand)] text-white' : 'text-[var(--rt-ink500)] hover:text-[var(--rt-ink900)]'
          }`}
        >
          <Icon width={16} height={16} /> {label}
        </button>
      ))}
    </div>
  );
}
