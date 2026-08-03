import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { notificationsApi, type NotificationRecord } from '@/lib/supabase-api';
import {
    resolvePartnerNotificationRoute,
    type PartnerNotificationPath,
} from '@/lib/notificationRoutes';
import { showClickableNotification } from '@/lib/notificationUtils';

const COMMON_KEYS = [
    ['partner-contract-status'],
    ['partner-contract-usage'],
] as const;

const STATION_KEYS = [
    ['partner-dashboard', 'posto'],
    ['station-pending'],
    ['station-history'],
    ['station-history-item'],
    ['station-closing'],
    ['station-closing-register'],
    ['station-details'],
    ['station-operations-pending'],
] as const;

const WORKSHOP_KEYS = [
    ['partner-dashboard', 'oficina'],
    ['workshop-orders'],
    ['workshop-order-details'],
    ['workshop-closing'],
    ['workshop-details'],
] as const;

const STATION_TABLES = [
    'fuelings',
    'fuel_stations',
    'station_catalog_items',
    'station_operations',
    'station_monthly_closings',
    'station_closing_invoices',
    'station_closing_payments',
    'station_monthly_closing_events',
] as const;

const WORKSHOP_TABLES = [
    'service_orders',
    'service_order_quotes',
    'service_order_invoices',
    'service_order_events',
    'service_order_payments',
    'repair_shops',
] as const;

function invalidatePartnerQueries(queryClient: QueryClient, portal: PartnerNotificationPath) {
    const keys = portal === '/posto' ? STATION_KEYS : WORKSHOP_KEYS;
    for (const queryKey of [...COMMON_KEYS, ...keys]) {
        void queryClient.invalidateQueries({ queryKey: [...queryKey] });
    }
}

/**
 * Sincroniza todo o portal do parceiro por WebSocket. A invalidação por
 * prefixo atualiza listas, indicadores e qualquer modal cuja query esteja
 * ativa, inclusive quando a alteração foi feita em outro dispositivo.
 */
export function usePartnerRealtimeSync(
    portal: PartnerNotificationPath,
    userId: string | undefined,
) {
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    useEffect(() => {
        if (!userId) return;

        const topic = `partner-live:${portal.slice(1)}:${userId}`;
        const channel = supabase.channel(topic);
        const tables = portal === '/posto' ? STATION_TABLES : WORKSHOP_TABLES;
        for (const table of tables) {
            channel.on(
                'postgres_changes',
                { event: '*', schema: 'public', table },
                () => invalidatePartnerQueries(queryClient, portal),
            );
        }
        channel.on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `driver_id=eq.${userId}`,
            },
            (payload) => {
                const notification = payload.new as NotificationRecord;
                invalidatePartnerQueries(queryClient, portal);
                void queryClient.invalidateQueries({
                    queryKey: ['partner-notifications', userId],
                });
                showClickableNotification(
                    notification,
                    navigate,
                    (id) => {
                        void notificationsApi.markRead(id)
                            .catch(() => undefined)
                            .finally(() => {
                                void queryClient.invalidateQueries({
                                    queryKey: ['partner-notifications', userId],
                                });
                            });
                    },
                    (item) => resolvePartnerNotificationRoute(item, portal),
                );
            },
        );
        channel.subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [navigate, portal, queryClient, userId]);
}
