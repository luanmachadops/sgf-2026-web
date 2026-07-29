import { supabase } from '@/lib/supabase';
import type { TenantBranding } from '@/types';

export const DEFAULT_BRANDING: TenantBranding = {
    id: '',
    slug: '',
    name: 'Exattus Rotta',
    appName: 'Exattus Rotta',
    loginEyebrow: 'Gestão inteligente de frotas',
    primaryColor: '#00A86B',
    darkColor: '#0F2B2F',
    accentColor: '#70C4A8',
};

function hexToRgba(hex: string, alpha: number): string {
    const clean = hex.replace('#', '');
    const normalized = clean.length === 3
        ? clean.split('').map((character) => character + character).join('')
        : clean;
    if (!/^[\da-f]{6}$/i.test(normalized)) return `rgba(0, 168, 107, ${alpha})`;
    const value = Number.parseInt(normalized, 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function contrastColor(hex: string): '#111827' | '#FFFFFF' {
    const clean = hex.replace('#', '');
    const normalized = clean.length === 3
        ? clean.split('').map((character) => character + character).join('')
        : clean;
    if (!/^[\da-f]{6}$/i.test(normalized)) return '#FFFFFF';
    const value = Number.parseInt(normalized, 16);
    const red = (value >> 16) & 255;
    const green = (value >> 8) & 255;
    const blue = value & 255;
    return (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? '#111827' : '#FFFFFF';
}

/** Aplica as cores do tenant nas CSS vars do design system (sobrescreve por prefeitura). */
export function applyBrandingColors(b?: TenantBranding | null) {
    const root = document.documentElement;
    const primary = b?.primaryColor || DEFAULT_BRANDING.primaryColor!;
    const dark = b?.darkColor || DEFAULT_BRANDING.darkColor!;
    const accent = b?.accentColor || DEFAULT_BRANDING.accentColor!;
    root.style.setProperty('--sgf-primary', primary);
    root.style.setProperty('--sgf-dark', dark);
    root.style.setProperty('--sgf-light', accent);
    root.style.setProperty('--sgf-accent', accent);
    root.style.setProperty('--sgf-primary-contrast', contrastColor(primary));
    root.style.setProperty('--sgf-dark-contrast', contrastColor(dark));
    root.style.setProperty('--sgf-accent-contrast', contrastColor(accent));
    root.style.setProperty('--sgf-primary-soft', hexToRgba(primary, 0.1));
    root.style.setProperty('--sgf-primary-muted', hexToRgba(primary, 0.18));
    root.style.setProperty('--sgf-focus-ring', hexToRgba(primary, 0.16));

    // Sincroniza os tokens compatíveis com os componentes Tailwind/Radix.
    root.style.setProperty('--primary', primary);
    root.style.setProperty('--secondary', dark);
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--ring', primary);
    root.style.setProperty('--chart-1', primary);
    root.style.setProperty('--chart-2', accent);
    root.style.setProperty('--chart-3', dark);
    root.style.setProperty('--sidebar', dark);
    root.style.setProperty('--sidebar-primary', primary);
    root.style.setProperty('--sidebar-accent', hexToRgba(primary, 0.22));
    root.style.setProperty('--sidebar-ring', primary);

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
    // Override manual é útil no localhost, mas em produção permitiria trocar a
    // marca pela URL e recriar a confusão de tenant que o HostGuard evita.
    const qs = import.meta.env.DEV
        ? new URLSearchParams(window.location.search).get('tenant')
        : null;
    if (qs) return qs;
    const host = window.location.hostname;
    if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
    const parts = host.split('.');
    if (parts.length < 3) return null; // sem subdomínio
    const sub = parts[0];
    if (['www', 'app', 'admin', 'posto', 'oficina', 'superadmin'].includes(sub)) return null;
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
