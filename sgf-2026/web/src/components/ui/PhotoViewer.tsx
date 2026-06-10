import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from '@/components/sgf/icons';

interface PhotoViewerProps {
    /** Uma imagem (atalho) ou várias (carrossel). */
    src?: string | null;
    images?: string[];
    startIndex?: number;
    alt?: string;
    onClose: () => void;
}

/** Visualizador de imagem em tela cheia (lightbox) com navegação. */
export function PhotoViewer({ src, images, startIndex = 0, alt, onClose }: PhotoViewerProps) {
    const list = (images && images.length > 0 ? images : src ? [src] : []).filter(Boolean) as string[];
    const [idx, setIdx] = useState(startIndex);

    useEffect(() => { setIdx(startIndex); }, [startIndex, src]);

    useEffect(() => {
        if (list.length === 0) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight') setIdx((i) => (i + 1) % list.length);
            if (e.key === 'ArrowLeft') setIdx((i) => (i - 1 + list.length) % list.length);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [list.length, onClose]);

    if (list.length === 0) return null;
    const current = list[Math.min(idx, list.length - 1)];
    const many = list.length > 1;

    return createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
            <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20" aria-label="Fechar">
                <X className="h-6 w-6" />
            </button>

            {many && (
                <button
                    onClick={(e) => { e.stopPropagation(); setIdx((i) => (i - 1 + list.length) % list.length); }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20"
                    aria-label="Anterior"
                >
                    <ChevronLeft className="h-7 w-7" />
                </button>
            )}

            <img src={current} alt={alt ?? 'Foto'} className="max-h-[88vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />

            {many && (
                <>
                    <button
                        onClick={(e) => { e.stopPropagation(); setIdx((i) => (i + 1) % list.length); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20"
                        aria-label="Próxima"
                    >
                        <ChevronRight className="h-7 w-7" />
                    </button>
                    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm font-semibold text-white">
                        {idx + 1} / {list.length}
                    </div>
                </>
            )}
        </div>,
        document.body,
    );
}

export default PhotoViewer;
