import { supabase } from '@/lib/supabase';
import type { TenantBranding } from '@/types';

export const DEFAULT_BRANDING: TenantBranding = {
    id: '',
    slug: '',
    name: 'SGF 2026',
    appName: 'Sistema de Gestão de Frotas',
    loginEyebrow: 'Painel de Gestão',
    primaryColor: '#00A86B',
    darkColor: '#0F2B2F',
    accentColor: '#70C4A8',
};

/** Aplica as cores do tenant nas CSS vars do design system (sobrescreve por prefeitura). */
export function applyBrandingColors(b?: TenantBranding | null) {
    const root = document.documentElement;
    const primary = b?.primaryColor || DEFAULT_BRANDING.primaryColor!;
    const dark = b?.darkColor || DEFAULT_BRANDING.darkColor!;
    const accent = b?.accentColor || DEFAULT_BRANDING.accentColor!;
    root.style.setProperty('--sgf-primary', primary);
    root.style.setProperty('--sgf-dark', dark);
    root.style.setProperty('--sgf-light', accent);

    // Update favicon dynamically to tenant logo/seal
    if (typeof window !== 'undefined') {
        const logoUrl = b?.logoUrl || b?.sealUrl;
        if (logoUrl) {
            let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }
            link.href = logoUrl;
            if (logoUrl.endsWith('.png')) {
                link.type = 'image/png';
            } else if (logoUrl.endsWith('.svg')) {
                link.type = 'image/svg+xml';
            } else {
                link.type = 'image/x-icon';
            }
        }
    }
}

/** Slug do tenant a partir do subdomínio (ex.: tapejara.dominio.com → "tapejara"). */
export function getSlugFromHost(): string | null {
    if (typeof window === 'undefined') return null;
    const qs = new URLSearchParams(window.location.search).get('tenant');
    if (qs) return qs;
    const host = window.location.hostname;
    if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
    const parts = host.split('.');
    if (parts.length < 3) return null; // sem subdomínio
    const sub = parts[0];
    if (['www', 'app', 'admin'].includes(sub)) return null;
    return sub;
}

type BrandingRow = {
    slug: string; name: string; app_name: string | null; login_eyebrow: string | null;
    logo_url: string | null; seal_url: string | null; photo_url: string | null;
    primary_color: string | null; dark_color: string | null; accent_color: string | null; status: string | null;
};

/** Busca branding público (sem sessão) pela slug — usado na tela de login. */
export async function fetchPublicBranding(slug: string): Promise<TenantBranding | null> {
    const { data, error } = await supabase.rpc('get_tenant_branding', { p_slug: slug });
    if (error || !data || (Array.isArray(data) && data.length === 0)) return null;
    const r = (Array.isArray(data) ? data[0] : data) as BrandingRow;
    return {
        id: '', slug: r.slug, name: r.name,
        appName: r.app_name ?? undefined, loginEyebrow: r.login_eyebrow ?? undefined,
        logoUrl: r.logo_url ?? undefined, sealUrl: r.seal_url ?? undefined, photoUrl: r.photo_url ?? undefined,
        primaryColor: r.primary_color ?? undefined, darkColor: r.dark_color ?? undefined, accentColor: r.accent_color ?? undefined,
        status: r.status ?? undefined,
    };
}
