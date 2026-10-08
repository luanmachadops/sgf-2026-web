import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Loader2, X } from '@/components/sgf/icons';

export interface TenantBrandingPreview {
    name: string;
    slug?: string;
    appName?: string;
    loginEyebrow?: string;
    logoUrl?: string;
    sealUrl?: string;
    photoUrl?: string;
    primaryColor?: string;
    darkColor?: string;
    accentColor?: string;
    city?: string;
    state?: string;
}

interface TenantBrandingPreviewModalProps {
    open: boolean;
    onClose: () => void;
    branding: TenantBrandingPreview;
}

const SCREENS = [
    { path: '/', label: 'Dashboard' },
    { path: '/mapa', label: 'Mapa' },
    { path: '/veiculos', label: 'Veículos' },
    { path: '/abastecimentos', label: 'Abastecimentos' },
    { path: '/manutencoes', label: 'Manutenções' },
] as const;

const VIEWPORTS = [
    { label: 'Celular', width: 390, height: 780 },
    { label: 'Tablet', width: 820, height: 1000 },
    { label: 'Computador', width: 1440, height: 860 },
] as const;

/**
 * Prévia da identidade visual com as TELAS REAIS do painel: o próprio sistema
 * roda num iframe (mesma sessão, dados reais) e recebe por postMessage as
 * cores, o nome e as imagens do formulário — antes de salvar. Nada é gravado.
 */
export function TenantBrandingPreviewModal({ open, onClose, branding }: TenantBrandingPreviewModalProps) {
    const [screen, setScreen] = useState<string>('/');
    const [viewport, setViewport] = useState<(typeof VIEWPORTS)[number]>(VIEWPORTS[2]);
    const [loading, setLoading] = useState(true);
    const [scale, setScale] = useState(1);
    const frameRef = useRef<HTMLIFrameElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);

    const send = useCallback(() => {
        const target = frameRef.current?.contentWindow;
        if (!target) return;
        const clean = Object.fromEntries(Object.entries(branding).filter(([, value]) => value !== undefined && value !== ''));
        target.postMessage({ type: 'sgf-brand-preview', branding: clean }, window.location.origin);
    }, [branding]);

    // O app dentro do iframe avisa quando está pronto para receber a marca.
    useEffect(() => {
        if (!open) return;
        const onMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
            if ((event.data as { type?: string } | null)?.type === 'sgf-brand-preview-ready') {
                send();
                setLoading(false);
            }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [open, send]);

    // Mudou algo no formulário com a prévia aberta: reenvia na hora.
    useEffect(() => { if (open) send(); }, [open, send]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKeyDown);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [open, onClose]);

    // Encaixa o aparelho escolhido no espaço disponível (reduz em vez de cortar).
    useLayoutEffect(() => {
        if (!open) return;
        const stage = stageRef.current;
        if (!stage) return;
        const fit = () => {
            const availableW = stage.clientWidth - 32;
            const availableH = stage.clientHeight - 32;
            setScale(Math.min(1, availableW / viewport.width, availableH / viewport.height));
        };
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(stage);
        return () => observer.disconnect();
    }, [open, viewport]);

    if (!open) return null;

    const src = `${screen}${screen.includes('?') ? '&' : '?'}brandPreview=1`;

    return createPortal(
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => {
            if (event.currentTarget === event.target) onClose();
        }}>
            <section role="dialog" aria-modal="true" aria-label="Prévia da identidade visual" className="flex h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
                <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[var(--sgf-primary-contrast)]" style={{ backgroundColor: branding.primaryColor || 'var(--sgf-primary)' }}>
                            <Eye className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="truncate text-base font-bold text-slate-900">Prévia da identidade visual</h2>
                            <p className="truncate text-xs text-slate-500">Telas reais do painel com as cores e imagens do formulário — nada é salvo aqui.</p>
                        </div>
                    </div>
                    <button type="button" aria-label="Fechar prévia" onClick={onClose} className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
                        <X className="h-5 w-5" />
                    </button>
                </header>

                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-6">
                    <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {SCREENS.map((item) => (
                            <button
                                key={item.path}
                                type="button"
                                onClick={() => { if (item.path !== screen) { setLoading(true); setScreen(item.path); } }}
                                className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                                    screen === item.path ? 'bg-[var(--sgf-accent)] text-[var(--sgf-accent-contrast)]' : 'bg-white text-slate-600 shadow-sm hover:bg-[var(--sgf-primary-soft)]'
                                }`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-1.5">
                        {VIEWPORTS.map((item) => (
                            <button
                                key={item.label}
                                type="button"
                                onClick={() => setViewport(item)}
                                className={`rounded-full px-3 py-2 text-[11px] font-bold transition-colors ${
                                    viewport.label === item.label ? 'bg-[var(--sgf-dark)] text-[var(--sgf-dark-contrast)]' : 'bg-white text-slate-600 shadow-sm hover:bg-slate-100'
                                }`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden bg-slate-200/70">
                    <div
                        className="absolute left-1/2 top-4 origin-top overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/10"
                        style={{ width: viewport.width, height: viewport.height, transform: `translateX(-50%) scale(${scale})` }}
                    >
                        <iframe
                            ref={frameRef}
                            key={screen}
                            src={src}
                            title="Prévia do painel"
                            className="h-full w-full border-0"
                            onLoad={() => { send(); window.setTimeout(() => setLoading(false), 1500); }}
                        />
                        {loading && (
                            <div className="absolute inset-0 grid place-items-center bg-white/80">
                                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </div>,
        document.body,
    );
}

export default TenantBrandingPreviewModal;
