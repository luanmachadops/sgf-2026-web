import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Sincronização em tempo real: quando qualquer tabela de domínio muda
 * (insert/update/delete), invalida as queries correspondentes — assim listas,
 * dashboard e mapa atualizam imediatamente, sem precisar de F5.
 *
 * Cobre criações feitas no próprio painel E no app do motorista (cross-device).
 * live_positions/trip_locations ficam de fora (o Mapa já trata, são alta frequência).
 */
const TABLE_TO_KEYS: Record<string, string[][]> = {
    vehicles: [['vehicles'], ['map', 'live-vehicles'], ['dashboard']],
    profiles: [['drivers'], ['dashboard']],
    fuelings: [
        ['refuelings'], ['refueling'], ['dashboard'], ['procurement'],
        ['station-operations'], ['station-closing-register'], ['station-fiscal-dashboard'],
    ],
    service_orders: [
        ['maintenances'], ['maintenance'], ['osFiscal'], ['dashboard'], ['procurement'],
    ],
    service_order_quotes: [['maintenances'], ['maintenance'], ['osFiscal'], ['dashboard'], ['procurement']],
    service_order_invoices: [['maintenances'], ['maintenance'], ['osFiscal'], ['dashboard'], ['procurement']],
    service_order_events: [['maintenances'], ['maintenance'], ['osFiscal'], ['dashboard']],
    service_order_payments: [['maintenances'], ['maintenance'], ['osFiscal'], ['dashboard'], ['procurement']],
    maintenances: [['maintenances'], ['dashboard']],
    issues: [['maintenances']],
    infractions: [['infractions']],
    departments: [['departments'], ['dashboard']],
    fuel_stations: [['stations'], ['procurement'], ['station-operations']],
    repair_shops: [['repair-shops'], ['maintenances'], ['procurement']],
    station_monthly_closings: [['station-closing-register'], ['station-fiscal-dashboard'], ['procurement']],
    station_commitments: [['station-commitments'], ['procurement'], ['refuelings']],
    station_closing_commitments: [['station-commitments'], ['station-closing-register'], ['station-fiscal-dashboard']],
    station_closing_invoices: [['station-closing-register'], ['station-fiscal-dashboard'], ['procurement']],
    station_closing_payments: [['station-closing-register'], ['station-fiscal-dashboard'], ['procurement']],
    station_monthly_closing_events: [['station-closing-register'], ['station-fiscal-dashboard']],
    station_catalog_items: [['station-catalog'], ['station-operations'], ['procurement']],
    station_operations: [['station-operations'], ['station-operations-pending'], ['procurement'], ['dashboard']],
    trips: [['trips'], ['map', 'live-vehicles'], ['dashboard']],
    trackers: [['trackers']],
    vehicle_documents: [['vehicle']],
    checklists: [['vehicle']],
};

export function useRealtimeSync() {
    const queryClient = useQueryClient();

    useEffect(() => {
        const pending = new Set<string>();
        let timer: ReturnType<typeof setTimeout> | null = null;

        const flush = () => {
            timer = null;
            for (const serial of pending) {
                queryClient.invalidateQueries({ queryKey: JSON.parse(serial) as string[] });
            }
            pending.clear();
        };

        const schedule = (keys: string[][]) => {
            for (const k of keys) pending.add(JSON.stringify(k));
            if (!timer) timer = setTimeout(flush, 400);
        };

        const channel = supabase
            .channel('rt-domain-sync')
            .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
                const keys = TABLE_TO_KEYS[(payload as { table: string }).table];
                if (keys) schedule(keys);
            });

        let fallbackTimer: ReturnType<typeof setInterval> | null = null;
        const stopFallback = () => {
            if (!fallbackTimer) return;
            clearInterval(fallbackTimer);
            fallbackTimer = null;
        };
        const startFallback = () => {
            if (fallbackTimer) return;
            // O WebSocket continua sendo a fonte principal. Este refetch só
            // opera durante CHANNEL_ERROR/TIMED_OUT/CLOSED e é desligado no
            // primeiro SUBSCRIBED, evitando telas/modais congelados.
            fallbackTimer = setInterval(() => {
                void queryClient.refetchQueries({ type: 'active' });
            }, 10_000);
        };

        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                stopFallback();
                void queryClient.refetchQueries({ type: 'active' });
                return;
            }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                startFallback();
            }
        });

        return () => {
            if (timer) clearTimeout(timer);
            stopFallback();
            void supabase.removeChannel(channel);
        };
    }, [queryClient]);
}
