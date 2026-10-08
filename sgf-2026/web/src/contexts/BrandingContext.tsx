import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { TenantBranding } from '@/types';
import { DEFAULT_BRANDING, applyBrandingColors, fetchPublicBranding, getSlugFromHost, isBrandPreviewFrame } from '@/lib/tenantBranding';

interface BrandingContextType {
    branding: TenantBranding;
    isLoading: boolean;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export function BrandingProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    // Sem sessão: resolve branding público pela slug do subdomínio (tela de login).
    const slug = user?.tenant ? null : getSlugFromHost();
    const [fetched, setFetched] = useState<{ slug: string; branding: TenantBranding | null } | null>(null);
    useEffect(() => {
        if (!slug) return;
        let active = true;
        fetchPublicBranding(slug)
            .then((b) => { if (active) setFetched({ slug, branding: b }); })
            .catch(() => { if (active) setFetched({ slug, branding: null }); });
        return () => { active = false; };
    }, [slug]);
    const publicBranding = fetched?.slug === slug ? fetched.branding : null;
    const isLoading = !!slug && fetched?.slug !== slug;

    // Prévia da identidade (Configurações → Prévia): o painel real roda num
    // iframe com ?brandPreview=1 e recebe do formulário as cores/imagens ainda
    // não salvas. Fora desse iframe nada muda.
    const [previewOverride, setPreviewOverride] = useState<Partial<TenantBranding> | null>(null);
    useEffect(() => {
        if (!isBrandPreviewFrame()) return;
        const onMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            const data = event.data as { type?: string; branding?: Partial<TenantBranding> } | null;
            if (data?.type === 'sgf-brand-preview' && data.branding) setPreviewOverride(data.branding);
        };
        window.addEventListener('message', onMessage);
        window.parent.postMessage({ type: 'sgf-brand-preview-ready' }, window.location.origin);
        return () => window.removeEventListener('message', onMessage);
    }, []);

    const branding = useMemo<TenantBranding>(() => {
        const base = user?.tenant ?? publicBranding ?? DEFAULT_BRANDING;
        return previewOverride ? { ...base, ...previewOverride } : base;
    }, [user?.tenant, publicBranding, previewOverride]);

    useEffect(() => { applyBrandingColors(branding); }, [branding]);

    return (
        <BrandingContext.Provider value={{ branding, isLoading }}>
            {children}
        </BrandingContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBranding() {
    const ctx = useContext(BrandingContext);
    if (ctx === undefined) throw new Error('useBranding must be used within a BrandingProvider');
    return ctx;
}
