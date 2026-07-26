import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import ForceChangePassword from '@/components/auth/ForceChangePassword';
import { TenantHostGuard } from '@/components/auth/TenantHostGuard';
import type { User } from '@/types';

interface Props {
    /**
     * Papéis com acesso a este grupo de rotas. Omitir libera qualquer usuário
     * autenticado. Painel, posto e oficina devem sempre informar sua allowlist
     * para que um papel novo nunca ganhe acesso por omissão.
     */
    allow?: User['role'][];
    /** Para onde mandar quem não tem o papel exigido. */
    redirectTo?: string;
    /** Login específico do grupo (painel, posto ou oficina). */
    loginTo?: string;
}

function homeForRole(role: User['role']): string {
    if (role === 'POSTO') return '/posto';
    if (role === 'OFICINA') return '/oficina';
    return '/';
}

export default function PrivateRoute({ allow, redirectTo, loginTo = '/login' }: Props = {}) {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--sgf-primary)] border-t-transparent"></div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to={loginTo} replace />;
    }

    // Motorista pré-cadastrado (senha = CPF): bloqueia todo o app até definir nova senha.
    if (user.mustChangePassword) {
        return <ForceChangePassword />;
    }

    if (allow && !allow.includes(user.role)) {
        return <Navigate to={redirectTo ?? homeForRole(user.role)} replace />;
    }

    return (
        <TenantHostGuard>
            <Outlet />
        </TenantHostGuard>
    );
}
