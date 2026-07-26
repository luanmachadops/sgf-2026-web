import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import ForceChangePassword from '@/components/auth/ForceChangePassword';
import { TenantHostGuard } from '@/components/auth/TenantHostGuard';
import type { User } from '@/types';

interface Props {
    /**
     * Papéis com acesso a este grupo de rotas. Omitir libera qualquer usuário
     * autenticado — que hoje já é só o painel, porque o `AuthContext` derruba
     * quem não está na allowlist de papéis do painel.
     *
     * Este parâmetro existe para os portais de parceiro (posto/oficina), que
     * vão compartilhar o mesmo app e precisam de fronteira própria.
     */
    allow?: User['role'][];
    /** Para onde mandar quem não tem o papel exigido. */
    redirectTo?: string;
}

export default function PrivateRoute({ allow, redirectTo = '/' }: Props = {}) {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-sgf-primary border-t-transparent"></div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // Motorista pré-cadastrado (senha = CPF): bloqueia todo o app até definir nova senha.
    if (user.mustChangePassword) {
        return <ForceChangePassword />;
    }

    if (allow && !allow.includes(user.role)) {
        return <Navigate to={redirectTo} replace />;
    }

    return (
        <TenantHostGuard>
            <Outlet />
        </TenantHostGuard>
    );
}
