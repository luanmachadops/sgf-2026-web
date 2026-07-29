import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from '@/types';
import { supabase, revokeRefreshToken } from '@/lib/supabase';
import { resetFotoStorageCache } from '@/lib/fotoStorage';
import { authErrorMessage, rememberSuspendedTenant } from '@/lib/authErrors';


/** Apaga TODO vestígio de sessão do storage do navegador. */
function purgeAuthStorage(): void {
    try {
        for (const key of Object.keys(localStorage)) {
            // Cobre a chave da sessão, os "chunks" (`…-auth-token.0`, `.1`) que o
            // supabase-js cria quando o JWT é grande, e o code-verifier do PKCE.
            if (key.startsWith('sb-') && (key.includes('-auth-token') || key.includes('-code-verifier'))) {
                localStorage.removeItem(key);
            }
        }
    } catch { /* storage indisponível (modo privado): nada a fazer */ }

    // O AuthContext mantém a própria cópia — se ela sobrevivesse, a tela de
    // login ainda enxergaria um usuário e devolveria o portal antes de o
    // Supabase confirmar que não há sessão.
    try {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
    } catch { /* idem */ }
}

/**
 * Encerra a sessão de forma CONFIÁVEL antes de navegar.
 *
 * BUG QUE ISTO CORRIGE (portais /posto e /oficina em produção): ao clicar em
 * "Sair" a tela de login aparecia e o portal voltava sozinho, sem dar tempo de
 * trocar de conta.
 *
 * O `signOut()` do supabase-js chama `_useSession()` ANTES de apagar o token.
 * Com o token perto de expirar — que é o caso normal numa aba aberta há horas —
 * esse passo dispara um refresh, e o refresh GRAVA a sessão nova no
 * localStorage. A versão anterior daqui corria o signOut contra um timeout de
 * 2,5 s: estourando o teto, ela limpava o storage e navegava enquanto o refresh
 * ainda estava no ar; o refresh então terminava e REGRAVAVA o token depois da
 * limpeza. Próximo load, sessão viva, portal de volta.
 *
 * A ordem aqui é o conserto: pega o token, limpa o storage PRIMEIRO, desliga o
 * auto-refresh (o ticker também regrava) e só então revoga no servidor passando
 * o token na mão. Nada que chegue atrasado tem onde regravar — e uma segunda
 * limpeza no fim fecha qualquer corrida remanescente.
 */
async function hardSignOut(timeoutMs = 2500): Promise<void> {
    // Token capturado ANTES de limpar: é o que permite revogar no servidor.
    let accessToken: string | null = null;
    try {
        const { data } = await supabase.auth.getSession();
        accessToken = data.session?.access_token ?? null;
    } catch { /* sem sessão legível: segue para a limpeza mesmo assim */ }

    // O ticker de auto-refresh regrava a sessão no storage sozinho.
    // Sem await: o stop passa pela fila de lock do GoTrue e não pode segurar a saída.
    void supabase.auth.stopAutoRefresh().catch(() => { /* noop */ });

    purgeAuthStorage();

    try {
        await Promise.race([
            Promise.all([
                accessToken ? revokeRefreshToken(accessToken) : Promise.resolve(),
                // Zera o estado em memória do GoTrue e emite SIGNED_OUT. Escopo
                // local: a revogação de verdade é a chamada acima.
                supabase.auth.signOut({ scope: 'local' }),
            ]),
            new Promise((resolve) => setTimeout(resolve, timeoutMs)),
        ]);
    } catch (error) {
        console.warn('signOut falhou; a sessão já foi limpa localmente:', error);
    }

    // Fecha a janela entre a limpeza e agora: qualquer gravação atrasada morre aqui.
    purgeAuthStorage();
}

function isAbortError(err: unknown): boolean {
    if (!err) return false;
    if (typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'AbortError') return true;
    const msg = (err as { message?: string })?.message ?? '';
    return msg.includes('signal is aborted');
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (email: string, password: string) => Promise<User>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function persistAuthState(nextUser: User | null, nextToken: string | null) {
    if (nextUser && nextToken) {
        localStorage.setItem('token', nextToken);
        localStorage.setItem('user', JSON.stringify(nextUser));
        return;
    }

    localStorage.removeItem('token');
    localStorage.removeItem('user');
}

/** Papéis aceitos pelo app web. A fronteira entre painel e portais fica nos
 * grupos de rota; motorista continua exclusivo do app nativo. */
const WEB_ROLES = ['admin', 'gestor', 'secretario', 'superadmin', 'posto', 'oficina'] as const;
type WebRole = (typeof WEB_ROLES)[number];

/**
 * Mapeia role do banco (pt-BR lowercase) para o enum esperado pelo web (UPPERCASE EN).
 */
function mapDbRole(dbRole: string | null | undefined): User['role'] {
    switch ((dbRole ?? '').toLowerCase()) {
        case 'admin': return 'ADMIN';
        case 'gestor': return 'MANAGER';
        case 'secretario': return 'MANAGER'; // capacidades de gestor, porém escopado por secretaria (via RLS)
        case 'superadmin': return 'SUPERADMIN';
        case 'posto': return 'POSTO';
        case 'oficina': return 'OFICINA';
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
    support_phone: string | null; support_email: string | null;
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
        supportPhone: t.support_phone ?? undefined, supportEmail: t.support_email ?? undefined,
    };
}

/**
 * Busca o perfil do usuário em `profiles` (tabela unificada com motoristas e gestores).
 * O id da profile É o mesmo do auth.user.
 */
async function fetchUserProfile(authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }): Promise<User> {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, department_id, tenant_id, station_id, repair_shop_id, access_blocked, allowed_modules, created_at, photo_url, must_change_password, departments(id, name), tenants(*)')
        .eq('id', authUser.id)
        .maybeSingle();

    if (profile && !error) {
        if (!WEB_ROLES.includes(profile.role as WebRole)) {
            void hardSignOut();
            throw new Error(
                profile.role === 'motorista'
                    ? 'Motoristas devem usar o aplicativo Exattus Rotta.'
                    : 'Seu perfil não possui acesso a este sistema.',
            );
        }
        if (profile.access_blocked) {
            void hardSignOut();
            throw new Error('Seu acesso está bloqueado. Entre em contato com o suporte para mais informações.');
        }
        const dept = (profile as unknown as { departments?: { id: string; name: string } | null }).departments;
        const tenantRow = (profile as unknown as { tenants?: TenantRow | null }).tenants;
        const tenant = mapTenant(tenantRow);
        if (tenantRow?.status === 'suspended') {
            rememberSuspendedTenant({
                name: tenantRow.name,
                supportEmail: tenantRow.support_email ?? undefined,
                supportPhone: tenantRow.support_phone ?? undefined,
            });
            persistAuthState(null, null);
            void hardSignOut();
            if (window.location.pathname !== '/acesso-suspenso') {
                window.location.replace('/acesso-suspenso');
            }
            throw new Error('O serviço desta prefeitura está temporariamente suspenso.');
        }
        return {
            id: profile.id,
            email: profile.email ?? authUser.email ?? '',
            name: profile.full_name || 'Usuário',
            role: mapDbRole(profile.role),
            accountRole: profile.role as User['accountRole'],
            allowedModules: (profile as unknown as { allowed_modules?: string[] }).allowed_modules,
            departmentId: profile.department_id || undefined,
            departmentName: dept?.name,
            photoUrl: profile.photo_url || undefined,
            departmentScopeId: profile.role === 'secretario' ? (profile.department_id || undefined) : undefined,
            tenantId: (profile as unknown as { tenant_id?: string }).tenant_id || undefined,
            tenant,
            stationId: profile.station_id || undefined,
            repairShopId: profile.repair_shop_id || undefined,
            mustChangePassword: (profile as unknown as { must_change_password?: boolean }).must_change_password === true,
            createdAt: profile.created_at || new Date().toISOString(),
        };
    }

    // Sem perfil no banco → nega. NUNCA derivar papel/tenant de
    // `user_metadata`: esse objeto é editável pelo próprio usuário via
    // supabase.auth.updateUser(), então um fallback autorizativo baseado nele
    // é escalada de privilégio (qualquer conta se declararia 'admin').
    void hardSignOut();
    throw new Error('Não foi possível carregar seu perfil de acesso. Procure o administrador do sistema.');
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const queryClient = useQueryClient();
    // O perfil só passa a existir na interface depois que a sessão do Supabase
    // foi confirmada. Não usamos mais o usuário duplicado do localStorage como
    // autorização visual: era isso que mantinha a "sessão fantasma".
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        let lastUserId: string | null = null;

        // Safety timeout: always resolve loading after 10s regardless of Supabase response
        const safetyTimeout = setTimeout(() => {
            if (isMounted) {
                console.warn('Auth init timed out — forcing isLoading = false');
                setUser(null);
                setToken(null);
                persistAuthState(null, null);
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
                    setUser(null);
                    setToken(null);
                    persistAuthState(null, null);
                }
            } finally {
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
                            if (isMounted) {
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
    }, [queryClient]);

    useEffect(() => {
        const handleInvalidAuth = () => {
            setUser(null);
            setToken(null);
            persistAuthState(null, null);
            void hardSignOut().finally(() => {
                if (!window.location.pathname.endsWith('/login')) {
                    window.location.replace('/login');
                }
            });
        };
        window.addEventListener('sgf:auth-invalid', handleInvalidAuth);
        return () => window.removeEventListener('sgf:auth-invalid', handleInvalidAuth);
    }, []);

    // Se o superadmin suspender a prefeitura enquanto o painel estiver aberto,
    // bloqueia a sessão imediatamente. O carregamento inicial acima continua
    // sendo a garantia principal para navegadores sem Realtime disponível.
    useEffect(() => {
        const tenantId = user?.tenantId;
        if (!tenantId) return;
        const channel = supabase
            .channel(`tenant-access-${tenantId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'tenants',
                filter: `id=eq.${tenantId}`,
            }, (payload) => {
                const next = payload.new as TenantRow;
                if (next.status !== 'suspended') return;
                rememberSuspendedTenant({
                    name: next.name || user.tenant?.name || 'sua prefeitura',
                    supportEmail: next.support_email ?? user.tenant?.supportEmail,
                    supportPhone: next.support_phone ?? user.tenant?.supportPhone,
                });
                setUser(null);
                setToken(null);
                persistAuthState(null, null);
                void hardSignOut();
                window.location.replace('/acesso-suspenso');
            })
            .subscribe();
        return () => {
            void supabase.removeChannel(channel);
        };
    }, [user?.tenant?.name, user?.tenant?.supportEmail, user?.tenant?.supportPhone, user?.tenantId]);

    // Permissões e bloqueios definidos em /acessos passam a valer sem exigir
    // que o usuário atualize a página ou faça um novo login.
    useEffect(() => {
        if (!user?.id) return;
        const channel = supabase
            .channel(`profile-access-${user.id}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `id=eq.${user.id}`,
            }, (payload) => {
                const next = payload.new as {
                    access_blocked?: boolean;
                    allowed_modules?: string[];
                    full_name?: string;
                    photo_url?: string | null;
                };
                if (next.access_blocked) {
                    window.dispatchEvent(new CustomEvent('sgf:auth-invalid'));
                    return;
                }
                setUser((current) => {
                    if (!current) return current;
                    const updated = {
                        ...current,
                        name: next.full_name || current.name,
                        photoUrl: next.photo_url ?? current.photoUrl,
                        allowedModules: next.allowed_modules ?? current.allowedModules,
                    };
                    persistAuthState(updated, token);
                    return updated;
                });
            })
            .subscribe();
        return () => {
            void supabase.removeChannel(channel);
        };
    }, [token, user?.id]);

    const login = async (email: string, password: string): Promise<User> => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw new Error(authErrorMessage(error));

            if (data.session) {
                setToken(data.session.access_token);
                const userData = await fetchUserProfile(data.user);
                setUser(userData);
                persistAuthState(userData, data.session.access_token);
                return userData;
            }
            throw new Error('Não foi possível iniciar a sessão.');
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
        // Cada portal tem o seu login. Mandar o posto para /login deixaria ele
        // na tela do painel, que não é a dele.
        const loginPath = user?.role === 'POSTO' ? '/posto/login'
            : user?.role === 'OFICINA' ? '/oficina/login'
            : '/login';

        setUser(null);
        setToken(null);
        persistAuthState(null, null);
        // Zera o tenant cacheado do upload de fotos: sem isso o próximo login
        // nesta aba gravaria no caminho da prefeitura anterior.
        resetFotoStorageCache();

        // Precisa AGUARDAR: navegar antes de o token sair do localStorage é o
        // que fazia o usuário voltar logado no reload.
        await hardSignOut();

        // `replace` para o botão voltar não devolver a tela do portal.
        window.location.replace(loginPath);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, refreshUser, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

// O hook e o Provider precisam compartilhar o mesmo contexto neste módulo.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
