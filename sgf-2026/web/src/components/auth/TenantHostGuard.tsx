import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getSlugFromHost } from '@/lib/tenantBranding';
import { supabase } from '@/lib/supabase';
import { SGFButton } from '@/components/sgf/SGFButton';

/**
 * Impede que o usuário fique numa página com a marca de OUTRA prefeitura.
 *
 * O branding vem do subdomínio (`tapejara.dominio.com` → slug `tapejara`), mas
 * a sessão é independente dele: um usuário da Prefeitura B logado em
 * `prefeitura-a.dominio.com` veria a logo, o nome e as cores de A. A RLS
 * protege os dados, mas a tela mentiria — confusão operacional e um prato
 * feito para phishing ("entre no site da sua prefeitura" apontando para outra).
 *
 * CUIDADO QUE ESTE COMPONENTE TOMA
 * `getSlugFromHost()` devolve o primeiro rótulo de qualquer host com 3+ níveis,
 * então em `frota-web-tap.vercel.app` ele devolve `frota-web-tap`, que não é
 * prefeitura nenhuma. Por isso o guard só age quando a slug do host resolve
 * para um tenant REAL — caso contrário (domínio genérico, preview da Vercel,
 * localhost) ele não faz nada. Sem essa checagem, o redirecionamento entraria
 * em loop no domínio atual.
 */
export function TenantHostGuard({ children }: { children: ReactNode }) {
    const { user, logout } = useAuth();
    const [mismatch, setMismatch] = useState<{ hostTenant: string; userTenant: string } | null>(null);

    useEffect(() => {
        let active = true;
        const slug = getSlugFromHost();
        const userTenantId = user?.tenantId;
        const userSlug = user?.tenant?.slug;

        // Sem sessão, sem slug no host, ou host já é o do usuário → nada a fazer.
        if (!user || !slug || !userTenantId || slug === userSlug) {
            return;
        }

        const validateHost = async () => {
            try {
                const { data } = await supabase.rpc('resolve_tenant_host', { p_slug: slug });
                if (!active) return;
                const hostBranding = data?.[0];
                // Slug não corresponde a prefeitura alguma: host genérico.
                if (!hostBranding) { setMismatch(null); return; }
                if (hostBranding.id === userTenantId) { setMismatch(null); return; }

                // Divergência real: tenta levar ao host correto do usuário.
                if (userSlug && typeof window !== 'undefined') {
                    const parts = window.location.hostname.split('.');
                    parts[0] = userSlug;
                    window.location.replace(
                        `${window.location.protocol}//${parts.join('.')}${window.location.pathname}${window.location.search}`,
                    );
                    return;
                }
                setMismatch({ hostTenant: hostBranding.name ?? slug, userTenant: user.tenant?.name ?? 'sua prefeitura' });
            } catch {
                if (active) setMismatch(null);
            }
        };
        void validateHost();

        return () => { active = false; };
    }, [user]);

    if (mismatch) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
                <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl">
                    <h1 className="text-xl font-bold text-slate-900">Endereço de outra prefeitura</h1>
                    <p className="mt-3 text-sm text-slate-500">
                        Este endereço é da <strong>{mismatch.hostTenant}</strong>, mas seu acesso é da{' '}
                        <strong>{mismatch.userTenant}</strong>. Entre pelo endereço da sua prefeitura.
                    </p>
                    <SGFButton className="mt-6" onClick={() => void logout()}>Sair</SGFButton>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
