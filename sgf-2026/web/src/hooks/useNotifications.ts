import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { notificationsApi, type NotificationRecord } from '@/lib/supabase-api';
import { useAuth } from '@/contexts/AuthContext';
import { showClickableNotification } from '@/lib/notificationUtils';

const LIST_KEY = ['notifications', 'list'] as const;
const COUNT_KEY = ['notifications', 'unread-count'] as const;

/**
 * Hook de Notificações com suporte a:
 * - Leitura e contagem de não lidas via React Query.
 * - Mutation otimista para "Marcar como lida" e "Marcar todas como lidas".
 * - Assinatura Realtime do Supabase com disparo de toast clicável.
 */
export function useNotifications() {
    const { user } = useAuth();
    const userId = user?.id;
    const queryClient = useQueryClient();
    const navigate = useNavigate();

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

    const markReadMutation = useMutation({
        mutationFn: async (id: string) => {
            await notificationsApi.markRead(id);
        },
        onMutate: async (id: string) => {
            await queryClient.cancelQueries({ queryKey: LIST_KEY });
            await queryClient.cancelQueries({ queryKey: COUNT_KEY });

            queryClient.setQueryData(COUNT_KEY, (old: number | undefined) => Math.max(0, (old ?? 1) - 1));
            queryClient.setQueryData(LIST_KEY, (old: NotificationRecord[] | undefined) =>
                old ? old.map((n) => (n.id === id ? { ...n, read: true } : n)) : []
            );
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });

    const markAllReadMutation = useMutation({
        mutationFn: async () => {
            if (!userId) return;
            await notificationsApi.markAllRead(userId);
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: LIST_KEY });
            await queryClient.cancelQueries({ queryKey: COUNT_KEY });

            queryClient.setQueryData(COUNT_KEY, 0);
            queryClient.setQueryData(LIST_KEY, (old: NotificationRecord[] | undefined) =>
                old ? old.map((n) => ({ ...n, read: true })) : []
            );
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });

    // Realtime: escuta novos inserts em notifications para este usuário.
    useEffect(() => {
        if (!userId) return;
        const channel = supabase
            .channel(`notifications:${userId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications', filter: `driver_id=eq.${userId}` },
                (payload) => {
                    queryClient.invalidateQueries({ queryKey: ['notifications'] });
                    const newNotification = payload.new as NotificationRecord;
                    showClickableNotification(newNotification, navigate, (id) => markReadMutation.mutate(id));
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, queryClient, navigate, markReadMutation]);

    return {
        notifications: listQuery.data ?? [],
        unreadCount: unreadQuery.data ?? 0,
        isLoading: listQuery.isLoading,
        markRead: (id: string) => markReadMutation.mutate(id),
        markAllRead: () => markAllReadMutation.mutate(),
    };
}
