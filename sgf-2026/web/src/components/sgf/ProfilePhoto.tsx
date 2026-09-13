import { useState, type ReactNode } from 'react';
import { resolveFotoUrl } from '@/lib/fotoStorage';

interface ProfilePhotoProps {
    /** Path do bucket `fotos` ou URL (inclusive assinada antiga, lida do localStorage). */
    src?: string | null;
    alt: string;
    className?: string;
    /** Exibido sem foto ou quando a imagem não carrega. */
    fallback: ReactNode;
}

interface PhotoState {
    forSrc: string | null;
    current: string | null;
    retried: boolean;
    failed: boolean;
}

const initialState = (src: string | null): PhotoState => ({ forSrc: src, current: src, retried: false, failed: false });

/**
 * Foto de perfil resiliente: URLs assinadas expiram (1h) e a sessão persistida
 * pode trazer uma já vencida. No primeiro erro de carregamento assina de novo;
 * se ainda falhar, mostra o fallback em vez do ícone de imagem quebrada.
 */
export function ProfilePhoto({ src, alt, className, fallback }: ProfilePhotoProps) {
    const value = src ?? null;
    const [state, setState] = useState<PhotoState>(() => initialState(value));

    // Nova foto (upload, realtime, novo login): recomeça sem esperar um efeito.
    if (state.forSrc !== value) {
        setState(initialState(value));
        return <>{value ? null : fallback}</>;
    }

    if (!state.current || state.failed) return <>{fallback}</>;

    const handleError = () => {
        if (state.retried) {
            setState((prev) => (prev.forSrc === value ? { ...prev, failed: true } : prev));
            return;
        }
        const stale = state.current;
        setState((prev) => (prev.forSrc === value ? { ...prev, retried: true } : prev));
        void resolveFotoUrl(value).then((fresh) => {
            setState((prev) => {
                if (prev.forSrc !== value) return prev;
                return fresh && fresh !== stale ? { ...prev, current: fresh } : { ...prev, failed: true };
            });
        });
    };

    return <img src={state.current} alt={alt} className={className} onError={handleError} />;
}
