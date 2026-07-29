import { useEffect, useState } from 'react';

function isStandaloneMode(): boolean {
    const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
    return window.matchMedia('(display-mode: standalone)').matches || standaloneNavigator.standalone === true;
}

export function AppLaunchSplash() {
    const [visible, setVisible] = useState(() => (
        isStandaloneMode()
        || import.meta.env.DEV
        || new URLSearchParams(window.location.search).get('pwa-splash') === '1'
    ));

    useEffect(() => {
        if (!visible) return;
        const timeout = window.setTimeout(() => setVisible(false), 1550);
        return () => window.clearTimeout(timeout);
    }, [visible]);

    if (!visible) return null;

    return (
        <div className="pwa-launch-splash" role="status" aria-label="Abrindo Exattus Rotta">
            <div className="pwa-launch-glow" />
            <div className="pwa-launch-content">
                <div className="pwa-launch-logo-wrap">
                    <div className="pwa-launch-ring" />
                    <img src="/exattus-rotta.svg" alt="" className="pwa-launch-logo" />
                </div>
                <div className="pwa-launch-copy">
                    <p className="pwa-launch-title">Exattus Rotta</p>
                    <p className="pwa-launch-subtitle">Gestão inteligente de frotas</p>
                </div>
                <div className="pwa-launch-progress"><span /></div>
            </div>
        </div>
    );
}

export default AppLaunchSplash;
