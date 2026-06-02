import React, { useEffect } from 'react';
import { X } from '../sgf/icons';
import { cn } from '@/lib/utils';

export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    description?: string;
    children: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    showCloseButton?: boolean;
    footer?: React.ReactNode;
}

function Modal({
    isOpen,
    onClose,
    title,
    description,
    children,
    size = 'md',
    showCloseButton = true,
    footer,
}: ModalProps) {
    // Fechar com ESC.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const sizes = {
        sm: 'max-w-md',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl',
        full: 'max-w-7xl',
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-[var(--sgf-space-4)]"
            onClick={handleBackdropClick}
        >
            <div
                className={cn(
                    'relative flex max-h-[90dvh] w-full flex-col bg-white shadow-[var(--sgf-shadow-xl)]',
                    'rounded-[var(--sgf-modal-radius)]',
                    sizes[size]
                )}
            >
                {/* Header */}
                {(title || showCloseButton) && (
                    <div className="flex shrink-0 items-start justify-between border-b border-slate-100 p-[var(--sgf-modal-padding)]">
                        <div>
                            {title && (
                                <h2 className="text-[var(--sgf-text-xl)] font-[var(--sgf-font-semibold)] text-slate-900">{title}</h2>
                            )}
                            {description && (
                                <p className="mt-[var(--sgf-space-1)] text-[var(--sgf-text-sm)] text-slate-500">{description}</p>
                            )}
                        </div>
                        {showCloseButton && (
                            <button
                                onClick={onClose}
                                className="rounded-[var(--sgf-radius-md)] p-[var(--sgf-space-2)] text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors duration-[var(--sgf-transition-fast)]"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        )}
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-[var(--sgf-modal-padding)] custom-scrollbar">{children}</div>

                {/* Footer */}
                {footer && (
                    <div className="flex shrink-0 items-center justify-end gap-[var(--sgf-space-3)] border-t border-slate-100 bg-slate-50/50 px-[var(--sgf-modal-padding)] py-[var(--sgf-space-4)] rounded-b-[var(--sgf-modal-radius)]">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

export interface ModalFooterProps {
    children: React.ReactNode;
    className?: string;
}

export function ModalFooter({ children, className }: ModalFooterProps) {
    return (
        <div
            className={cn(
                'flex items-center justify-end gap-[var(--sgf-space-3)] border-t border-slate-100 bg-slate-50/50 px-[var(--sgf-modal-padding)] py-[var(--sgf-space-4)]',
                className
            )}
        >
            {children}
        </div>
    );
}

export { Modal };
export default Modal;
