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
    fuelings: [['refuelings'], ['dashboard']],
    service_orders: [['maintenances'], ['dashboard']],
    maintenances: [['maintenances'], ['dashboard']],
    issues: [['maintenances']],
    infractions: [['infractions']],
    departments: [['departments'], ['dashboard']],
    fuel_stations: [['stations']],
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
            })
            .subscribe();

        return () => {
            if (timer) clearTimeout(timer);
            supabase.removeChannel(channel);
        };
    }, [queryClient]);
}
