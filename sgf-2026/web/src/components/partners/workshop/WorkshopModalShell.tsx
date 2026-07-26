import { useEffect, type ReactNode } from 'react';
import { X } from '@/components/sgf/icons';

interface WorkshopModalShellProps {
    eyebrow: string;
    title: string;
    subtitle?: string;
    busy?: boolean;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
    maxWidthClass?: string;
    zIndexClass?: string;
}

export function WorkshopModalShell({
    eyebrow,
    title,
    subtitle,
    busy = false,
    onClose,
    children,
    footer,
    maxWidthClass = 'sm:max-w-2xl',
    zIndexClass = 'z-[60]',
}: WorkshopModalShellProps) {
    useEffect(() => {
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !busy) onClose();
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [busy, onClose]);

    return (
        <div className={`fixed inset-0 flex items-end justify-center bg-slate-950/55 backdrop-blur-sm sm:items-center sm:p-6 ${zIndexClass}`}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="workshop-modal-title"
                className={`max-h-[95vh] w-full overflow-y-auto rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem] ${maxWidthClass}`}
            >
                <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-6 py-5 backdrop-blur">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">{eyebrow}</p>
                        <h2 id="workshop-modal-title" className="mt-1 text-xl font-black text-slate-950">{title}</h2>
                        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
                    </div>
                    <button
                        type="button"
                        aria-label="Fechar"
                        disabled={busy}
                        onClick={onClose}
                        className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </header>
                <div className="p-6">{children}</div>
                {footer && (
                    <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur sm:flex-row sm:justify-end">
                        {footer}
                    </footer>
                )}
            </div>
        </div>
    );
}
