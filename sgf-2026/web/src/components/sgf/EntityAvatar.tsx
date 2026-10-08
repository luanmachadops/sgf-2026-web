import { useState } from 'react';
import type { Car } from '@/components/sgf/icons';

/** Foto do veículo/motorista; sem foto (ou se a imagem falhar), mostra o ícone. */
export function EntityAvatar({ url, icon: Icon, alt, square, size = 'md' }: {
    url?: string | null;
    icon: typeof Car;
    alt: string;
    square?: boolean;
    size?: 'sm' | 'md';
}) {
    const [failed, setFailed] = useState(false);
    const dims = size === 'sm'
        ? (square ? 'h-9 w-12 rounded-lg' : 'h-9 w-9 rounded-full')
        : (square ? 'h-11 w-14 rounded-xl' : 'h-11 w-11 rounded-full');
    if (!url || failed) {
        return (
            <div className={`grid shrink-0 place-items-center bg-slate-100 text-slate-400 ${dims}`}>
                <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
            </div>
        );
    }
    return <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} className={`shrink-0 bg-slate-100 object-cover ${dims}`} />;
}

export default EntityAvatar;
