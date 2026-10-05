import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from './icons';

/**
 * Painel modal no padrão do app: fundo escurecido, cartão branco de 28px,
 * cabeçalho com título e botão circular de fechar; rodapé fixo para as ações.
 * Fecha com Esc e com clique fora.
 */
export function Sheet({ open, onClose, title, subtitle, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  const width = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : 'max-w-2xl';

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-[var(--rt-ink900)]/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`rt-rise relative flex max-h-[92vh] w-full ${width} flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_24px_64px_rgb(15_43_47/0.28)] sm:rounded-[28px]`}>
        <div className="flex shrink-0 items-start justify-between gap-4 px-6 pb-4 pt-6">
          <div>
            <h2 className="text-xl font-bold tracking-[-0.01em] text-[var(--rt-ink900)]">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-[var(--rt-ink500)]">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--rt-paper)] text-[var(--rt-ink700)] transition hover:bg-[var(--rt-paper2)]" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="rt-scroll flex-1 overflow-y-auto px-6 pb-6">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--rt-hairline)] px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Campo de arquivo de imagem com prévia, no estilo do app. */
export function ImageDrop({ label, file, onChange, hint }: { label: string; file: File | null; onChange: (f: File | null) => void; hint?: string }) {
  const preview = file ? URL.createObjectURL(file) : null;
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  return (
    <label className="block cursor-pointer">
      <span className="mb-2 block text-[13px] font-medium text-[var(--rt-ink500)]">{label}</span>
      <span className="flex items-center gap-3 rounded-2xl bg-[var(--rt-paper)] p-2.5 transition hover:bg-[var(--rt-paper2)]">
        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white text-[var(--rt-ink400)]">
          {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" strokeLinecap="round" />
            </svg>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[var(--rt-ink900)]">{file ? file.name : 'Escolher imagem'}</span>
          <span className="block text-xs text-[var(--rt-ink400)]">{hint ?? 'PNG ou JPG'}</span>
        </span>
        {file && (
          <button type="button" onClick={(e) => { e.preventDefault(); onChange(null); }} className="rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--rt-ink500)] hover:bg-white">
            Remover
          </button>
        )}
      </span>
      <input type="file" accept="image/*" className="sr-only" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
    </label>
  );
}

/** Filtro em pílula com contagem (como os Chips do app). */
export function FilterChip({ label, count, active, onClick }: { label: string; count?: number; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
        active ? 'bg-[var(--rt-ink900)] text-white' : 'bg-white text-[var(--rt-ink700)] shadow-[var(--rt-shadow-card)] hover:bg-[var(--rt-paper2)]'
      }`}
    >
      {label}
      {count != null && (
        <span className={`rt-num grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs ${active ? 'bg-white/15' : 'bg-[var(--rt-paper)] text-[var(--rt-ink500)]'}`}>{count}</span>
      )}
    </button>
  );
}

/** Busca em pílula. */
export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block w-full sm:w-72">
      <svg className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--rt-ink400)]" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-full bg-white pl-11 pr-4 text-sm text-[var(--rt-ink900)] shadow-[var(--rt-shadow-card)] placeholder:text-[var(--rt-ink400)] focus:outline-none focus:ring-4 focus:ring-[var(--rt-brand)]/10"
      />
    </label>
  );
}
