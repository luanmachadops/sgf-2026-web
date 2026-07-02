import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import ForceChangePassword from '@/components/auth/ForceChangePassword';

export default function PrivateRoute() {
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

    return <Outlet />;
}
