import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from '@/types';
import { supabase } from '@/lib/supabase';

function isAbortError(err: unknown): boolean {
    if (!err) return false;
    if (typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'AbortError') return true;
    const msg = (err as { message?: string })?.message ?? '';
    return msg.includes('signal is aborted');
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function loadCachedAuth() {
    try {
        const storedUser = localStorage.getItem('user');
        const storedToken = localStorage.getItem('token');

        return {
            user: storedUser ? JSON.parse(storedUser) as User : null,
            token: storedToken,
        };
    } catch (error) {
        console.warn('Failed to restore cached auth state:', error);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        return { user: null, token: null };
    }
}

function persistAuthState(nextUser: User | null, nextToken: string | null) {
    if (nextUser && nextToken) {
        localStorage.setItem('token', nextToken);
        localStorage.setItem('user', JSON.stringify(nextUser));
        return;
    }

    localStorage.removeItem('token');
    localStorage.removeItem('user');
}

/**
 * Mapeia role do banco (pt-BR lowercase) para o enum esperado pelo web (UPPERCASE EN).
 */
function mapDbRole(dbRole: string | null | undefined): User['role'] {
    switch ((dbRole ?? '').toLowerCase()) {
        case 'admin': return 'ADMIN';
        case 'gestor': return 'MANAGER';
        case 'secretario': return 'MANAGER'; // capacidades de gestor, porém escopado por secretaria (via RLS)
        case 'superadmin': return 'SUPERADMIN';
        case 'motorista': return 'VIEWER';
        default: return 'VIEWER';
    }
}

type TenantRow = {
    id: string; slug: string; name: string; app_name: string | null; login_eyebrow: string | null;
    logo_url: string | null; seal_url: string | null; photo_url: string | null;
    primary_color: string | null; dark_color: string | null; accent_color: string | null;
    cnpj: string | null; city: string | null; state: string | null; address: string | null;
    mayor_name: string | null; report_footer: string | null; status: string | null;
};

function mapTenant(t: TenantRow | null | undefined): import('@/types').TenantBranding | undefined {
    if (!t) return undefined;
    return {
        id: t.id, slug: t.slug, name: t.name,
        appName: t.app_name ?? undefined, loginEyebrow: t.login_eyebrow ?? undefined,
        logoUrl: t.logo_url ?? undefined, sealUrl: t.seal_url ?? undefined, photoUrl: t.photo_url ?? undefined,
        primaryColor: t.primary_color ?? undefined, darkColor: t.dark_color ?? undefined, accentColor: t.accent_color ?? undefined,
        cnpj: t.cnpj ?? undefined, city: t.city ?? undefined, state: t.state ?? undefined, address: t.address ?? undefined,
        mayorName: t.mayor_name ?? undefined, reportFooter: t.report_footer ?? undefined, status: t.status ?? undefined,
    };
}

/**
 * Busca o perfil do usuário em `profiles` (tabela unificada com motoristas e gestores).
 * O id da profile É o mesmo do auth.user.
 */
async function fetchUserProfile(authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }): Promise<User> {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, department_id, tenant_id, created_at, photo_url, departments(id, name), tenants(id, slug, name, app_name, login_eyebrow, logo_url, seal_url, photo_url, primary_color, dark_color, accent_color, cnpj, city, state, address, mayor_name, report_footer, status)')
        .eq('id', authUser.id)
        .maybeSingle();

    if (profile && !error) {
        const dept = (profile as unknown as { departments?: { id: string; name: string } | null }).departments;
        const tenant = mapTenant((profile as unknown as { tenants?: TenantRow | null }).tenants);
        return {
            id: profile.id,
            email: profile.email ?? authUser.email ?? '',
            name: profile.full_name || 'Usuário',
            role: mapDbRole(profile.role),
            departmentId: profile.department_id || undefined,
            departmentName: dept?.name,
            photoUrl: profile.photo_url || undefined,
            departmentScopeId: profile.role === 'secretario' ? (profile.department_id || undefined) : undefined,
            tenantId: (profile as unknown as { tenant_id?: string }).tenant_id || undefined,
            tenant,
            createdAt: profile.created_at || new Date().toISOString(),
        };
    }

    // Fallback: usa auth metadata (sem profile row)
    return {
        id: authUser.id,
        email: authUser.email || '',
        name: (authUser.user_metadata?.full_name as string) || (authUser.user_metadata?.name as string) || 'Usuário',
        role: mapDbRole((authUser.user_metadata?.role as string) || 'motorista'),
        createdAt: new Date().toISOString(),
    };
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const cachedAuth = loadCachedAuth();
    const queryClient = useQueryClient();
    const [user, setUser] = useState<User | null>(cachedAuth.user);
    const [token, setToken] = useState<string | null>(cachedAuth.token);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        let initialSessionHandled = false;
        let lastUserId: string | null = cachedAuth.user?.id ?? null;

        // Safety timeout: always resolve loading after 10s regardless of Supabase response
        const safetyTimeout = setTimeout(() => {
            if (isMounted) {
                console.warn('Auth init timed out — forcing isLoading = false');
                setIsLoading(false);
            }
        }, 10_000);

        const applySession = async (
            session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'],
            { invalidate = false }: { invalidate?: boolean } = {}
        ) => {
            if (!isMounted) return;

            if (!session) {
                setUser(null);
                setToken(null);
                persistAuthState(null, null);
                lastUserId = null;
                return;
            }

            setToken(session.access_token);

            const userData = await fetchUserProfile(session.user);

            if (!isMounted) return;

            setUser(userData);
            persistAuthState(userData, session.access_token);

            // Só invalida queries quando o usuário realmente mudou (login/troca de conta).
            // NÃO invalidamos em TOKEN_REFRESHED nem em refoco de aba — isso causaria
            // refetch de TODO o sistema desnecessariamente.
            if (invalidate && lastUserId !== userData.id) {
                queryClient.invalidateQueries();
            }
            lastUserId = userData.id;
        };

        const initAuth = async () => {
            try {
                const {
                    data: { session },
                } = await supabase.auth.getSession();

                await applySession(session, { invalidate: true });
            } catch (error) {
                // StrictMode/HMR pode abortar a primeira execução do effect — é benigno;
                // o onAuthStateChange abaixo aplica a sessão quando ela chega.
                if (!isAbortError(error)) {
                    console.error('Error checking auth session:', error);
                }
            } finally {
                initialSessionHandled = true;
                clearTimeout(safetyTimeout);
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        initAuth();

        // Listen for auth changes.
        // IMPORTANTE: o callback do onAuthStateChange roda SEGURANDO o lock de auth do
        // GoTrue. Fazer chamadas `await supabase.from(...)` aqui dentro tenta readquirir o
        // mesmo lock → deadlock (o app trava "carregando" após o refresh de token de ~1h).
        // Por isso o callback NÃO é async e qualquer trabalho que toque o Supabase é
        // adiado para fora do lock com setTimeout(0).
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                // INITIAL_SESSION duplica o initAuth — ignorado.
                if (event === 'INITIAL_SESSION') return;

                // SIGNED_OUT: limpa estado imediatamente, sem chamadas ao banco.
                if (event === 'SIGNED_OUT') {
                    if (!isMounted) return;
                    setUser(null);
                    setToken(null);
                    persistAuthState(null, null);
                    lastUserId = null;
                    return;
                }

                // TOKEN_REFRESHED: apenas atualiza o token persistido. NÃO busca profile
                // (evita deadlock) nem invalida queries (evita refetch de todo o sistema).
                if (event === 'TOKEN_REFRESHED') {
                    if (session?.access_token) {
                        setToken(session.access_token);
                        try {
                            localStorage.setItem('token', session.access_token);
                        } catch { /* ignore */ }
                    }
                    return;
                }

                // SIGNED_IN / USER_UPDATED / PASSWORD_RECOVERY: precisam buscar o profile.
                // Adiamos para fora do lock para não travar o GoTrue.
                setTimeout(() => {
                    applySession(session, { invalidate: event === 'SIGNED_IN' })
                        .catch((error) => {
                            if (!isAbortError(error)) {
                                console.error(`Auth state change failed during ${event}:`, error);
                            }
                            if (isMounted && !cachedAuth.user) {
                                setUser(null);
                                setToken(null);
                                persistAuthState(null, null);
                            }
                        })
                        .finally(() => {
                            if (isMounted) setIsLoading(false);
                        });
                }, 0);
            }
        );

        return () => {
            isMounted = false;
            clearTimeout(safetyTimeout);
            subscription?.unsubscribe();
        };
    }, []);

    const login = async (email: string, password: string) => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                throw new Error(error.message);
            }

            if (data.session) {
                setToken(data.session.access_token);
                const userData = await fetchUserProfile(data.user);
                setUser(userData);
                persistAuthState(userData, data.session.access_token);
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Recarrega o perfil do usuário logado (ex.: após trocar foto/nome no /perfil).
    const refreshUser = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const userData = await fetchUserProfile(session.user);
        setUser(userData);
        persistAuthState(userData, session.access_token);
    };

    const logout = async () => {
        // Clear local state immediately — don't let a hanging signOut block the user
        setUser(null);
        setToken(null);
        persistAuthState(null, null);

        // Fire signOut in background (best-effort, never block redirect)
        supabase.auth.signOut().catch((error) => {
            console.error('Logout error:', error);
        });

        window.location.href = '/login';
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, refreshUser, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
