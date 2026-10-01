import { useEffect, useState } from 'react';
import { INICIO_LAYERS, INICIO_VIEWBOX } from './inicioLogo';

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
        const timeout = window.setTimeout(() => setVisible(false), 2200);
        return () => window.clearTimeout(timeout);
    }, [visible]);

    if (!visible) return null;

    return (
        <div className="pwa-launch-splash" role="status" aria-label="Abrindo Exattus Rotta">
            <svg
                className="pwa-launch-logo"
                viewBox={`0 0 ${INICIO_VIEWBOX.width} ${INICIO_VIEWBOX.height}`}
                aria-hidden="true"
            >
                {INICIO_LAYERS.map((layer) => (
                    <path key={layer.id} className={`pwa-layer-${layer.id}`} d={layer.d} fill={layer.fill} />
                ))}
            </svg>
        </div>
    );
}

export default AppLaunchSplash;
