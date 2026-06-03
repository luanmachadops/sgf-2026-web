import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { notificationsApi, type NotificationRecord } from '@/lib/supabase-api';
import { useAuth } from '@/contexts/AuthContext';

const LIST_KEY = ['notifications', 'list'] as const;
const COUNT_KEY = ['notifications', 'unread-count'] as const;

/** Dispara um toast estilizado conforme o tipo da notificação. */
function notifyToast(n: Pick<NotificationRecord, 'title' | 'body' | 'type'>) {
    const opts = { description: n.body || undefined };
    switch (n.type) {
        case 'success': toast.success(n.title, opts); break;
        case 'alert':   toast.error(n.title, opts); break;
        case 'warning': toast.warning(n.title, opts); break;
        default:        toast.info(n.title, opts); break;
    }
}

/**
 * Notificações do usuário logado (admin/gestor).
 * - Lista + contador de não lidas (React Query).
 * - Assinatura Realtime: novas notificações atualizam o badge na hora + toast.
 * - Mutations para marcar como lida / todas como lidas.
 */
export function useNotifications() {
    const { user } = useAuth();
    const userId = user?.id;
    const queryClient = useQueryClient();

    const listQuery = useQuery({
        queryKey: LIST_KEY,
        queryFn: () => notificationsApi.list(userId as string, 30),
        enabled: !!userId,
    });

    const unreadQuery = useQuery({
        queryKey: COUNT_KEY,
        queryFn: () => notificationsApi.unreadCount(userId as string),
        enabled: !!userId,
    });

    // Realtime: novas notificações para este usuário.
    useEffect(() => {
        if (!userId) return;
        const channel = supabase
            .channel(`notifications:${userId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications', filter: `driver_id=eq.${userId}` },
                (payload) => {
                    queryClient.invalidateQueries({ queryKey: ['notifications'] });
                    notifyToast(payload.new as NotificationRecord);
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, queryClient]);

    const markRead = useMutation({
        mutationFn: (id: string) => notificationsApi.markRead(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    });

    const markAllRead = useMutation({
        mutationFn: () => notificationsApi.markAllRead(userId as string),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    });

    return {
        notifications: listQuery.data ?? [],
        unreadCount: unreadQuery.data ?? 0,
        isLoading: listQuery.isLoading,
        markRead: (id: string) => markRead.mutate(id),
        markAllRead: () => markAllRead.mutate(),
    };
}
