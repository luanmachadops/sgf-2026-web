import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Volta para a tela de onde o usuário veio (alerta, notificação, lista…).
 * Se a página foi aberta direto (link colado, nova aba), não há para onde
 * voltar no histórico do app: vai para `fallback`.
 */
export function useGoBack(fallback: string) {
    const navigate = useNavigate();
    return useCallback(() => {
        const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
        if (idx > 0) navigate(-1);
        else navigate(fallback);
    }, [navigate, fallback]);
}
