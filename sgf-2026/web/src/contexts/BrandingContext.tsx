import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { TenantBranding } from '@/types';
import { DEFAULT_BRANDING, applyBrandingColors, fetchPublicBranding, getSlugFromHost } from '@/lib/tenantBranding';

interface BrandingContextType {
    branding: TenantBranding;
    isLoading: boolean;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export function BrandingProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [publicBranding, setPublicBranding] = useState<TenantBranding | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Sem sessão: resolve branding público pela slug do subdomínio (tela de login).
    useEffect(() => {
        let active = true;
        if (user?.tenant) { setIsLoading(false); return; }
        const slug = getSlugFromHost();
        if (!slug) { setIsLoading(false); return; }
        fetchPublicBranding(slug)
            .then((b) => { if (active) setPublicBranding(b); })
            .finally(() => { if (active) setIsLoading(false); });
        return () => { active = false; };
    }, [user?.tenant]);

    const branding = useMemo<TenantBranding>(
        () => user?.tenant ?? publicBranding ?? DEFAULT_BRANDING,
        [user?.tenant, publicBranding],
    );

    useEffect(() => { applyBrandingColors(branding); }, [branding]);

    return (
        <BrandingContext.Provider value={{ branding, isLoading }}>
            {children}
        </BrandingContext.Provider>
    );
}

export function useBranding() {
    const ctx = useContext(BrandingContext);
    if (ctx === undefined) throw new Error('useBranding must be used within a BrandingProvider');
    return ctx;
}
