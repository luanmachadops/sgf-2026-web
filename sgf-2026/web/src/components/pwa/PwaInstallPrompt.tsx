import { useEffect, useState } from 'react';
import { Download, X } from '@/components/sgf/icons';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandaloneMode(): boolean {
    const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
    return window.matchMedia('(display-mode: standalone)').matches || standaloneNavigator.standalone === true;
}

function isIosDevice(): boolean {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function PwaInstallPrompt() {
    const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
    const [visible, setVisible] = useState(false);
    const [installed, setInstalled] = useState(() => isStandaloneMode());
    const [showIosHelp, setShowIosHelp] = useState(false);

    useEffect(() => {
        if (installed) return;

        const forcePreview = new URLSearchParams(window.location.search).get('pwa-install-preview') === '1';
        const mobileViewport = window.matchMedia('(max-width: 768px)').matches;
        const dismissed = window.sessionStorage.getItem('exattus-pwa-install-dismissed') === '1';

        const onBeforeInstall = (event: Event) => {
            event.preventDefault();
            setInstallEvent(event as BeforeInstallPromptEvent);
            if (!dismissed && (mobileViewport || forcePreview)) setVisible(true);
        };
        const onInstalled = () => {
            setInstalled(true);
            setVisible(false);
            setInstallEvent(null);
        };

        window.addEventListener('beforeinstallprompt', onBeforeInstall);
        window.addEventListener('appinstalled', onInstalled);

        if (!dismissed && (isIosDevice() || forcePreview) && (mobileViewport || forcePreview)) {
            const timeout = window.setTimeout(() => setVisible(true), 1200);
            return () => {
                window.clearTimeout(timeout);
                window.removeEventListener('beforeinstallprompt', onBeforeInstall);
                window.removeEventListener('appinstalled', onInstalled);
            };
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', onBeforeInstall);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, [installed]);

    if (installed || !visible) return null;

    const dismiss = () => {
        window.sessionStorage.setItem('exattus-pwa-install-dismissed', '1');
        setVisible(false);
    };

    const install = async () => {
        if (installEvent) {
            await installEvent.prompt();
            const result = await installEvent.userChoice;
            if (result.outcome === 'accepted') setVisible(false);
            return;
        }
        setShowIosHelp(true);
    };

    return (
        <aside className="fixed inset-x-3 bottom-3 z-[2500] mx-auto max-w-md rounded-3xl border border-white/10 bg-[var(--sgf-dark)] p-4 text-white shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5" aria-label="Instalar Exattus Rotta">
            <button type="button" onClick={dismiss} aria-label="Fechar convite de instalação" className="absolute right-3 top-3 rounded-full p-1.5 text-white/55 transition hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-3 pr-7">
                <img src="/exattus-rotta.svg" alt="" className="h-12 w-12 rounded-2xl shadow-lg" />
                <div className="min-w-0">
                    <p className="font-bold">Instale o Exattus Rotta</p>
                    <p className="mt-0.5 text-xs text-white/65">Abra o painel como aplicativo, sem a barra do navegador.</p>
                </div>
            </div>
            {showIosHelp ? (
                <div className="mt-4 rounded-2xl bg-white/10 p-3 text-xs leading-relaxed text-white/85">
                    No iPhone ou iPad, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.
                </div>
            ) : (
                <button type="button" onClick={() => void install()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--sgf-primary)] px-4 py-3 text-sm font-bold !text-white shadow-lg transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-[var(--sgf-focus-ring)]">
                    <Download className="h-4 w-4" />
                    Instalar aplicativo
                </button>
            )}
        </aside>
    );
}

export default PwaInstallPrompt;
