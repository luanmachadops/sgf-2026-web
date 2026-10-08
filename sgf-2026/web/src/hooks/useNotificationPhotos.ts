import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { signFotos } from '@/lib/fotoStorage';
import type { NotificationRecord } from '@/lib/supabase-api';

export type NotificationPhoto = { url: string; kind: 'vehicle' | 'driver' };

const VEHICLE = new Set(['vehicle', 'veiculo', 'vehicle_idle', 'speeding', 'geofence', 'movimento_sem_viagem']);
const TRIP = new Set(['trip', 'trip_close', 'viagem']);
const FUELING = new Set(['fueling', 'refueling', 'abastecimento', 'fuel']);
const SERVICE_ORDER = new Set(['service_order', 'service_orders', 'maintenance', 'manutencao']);
const DRIVER = new Set(['driver', 'motorista', 'profile', 'cnh']);

/**
 * Foto que representa cada notificação: o veículo do assunto (viagem,
 * abastecimento, OS, alerta do rastreador) ou o motorista (CNH, cadastro).
 * Busca em lote só os ids das notificações visíveis.
 */
export function useNotificationPhotos(notifications: NotificationRecord[]) {
    const keyed = notifications.filter((n) => n.entity_id && n.entity_type);
    const key = keyed.map((n) => `${n.entity_type}:${n.entity_id}`).sort().join('|');

    return useQuery({
        queryKey: ['notification-photos', key],
        enabled: keyed.length > 0,
        staleTime: 5 * 60_000,
        queryFn: async (): Promise<Map<string, NotificationPhoto>> => {
            const ids = (set: Set<string>) => [...new Set(keyed.filter((n) => set.has(String(n.entity_type).toLowerCase())).map((n) => String(n.entity_id)))];
            const tripIds = ids(TRIP);
            const fuelingIds = ids(FUELING);
            const soIds = ids(SERVICE_ORDER);
            const driverIds = ids(DRIVER);

            const [trips, fuelings, sos] = await Promise.all([
                tripIds.length ? supabase.from('trips').select('id, vehicle_id').in('id', tripIds) : Promise.resolve({ data: [] }),
                fuelingIds.length ? supabase.from('fuelings').select('id, vehicle_id').in('id', fuelingIds) : Promise.resolve({ data: [] }),
                soIds.length ? supabase.from('service_orders').select('id, vehicle_id').in('id', soIds) : Promise.resolve({ data: [] }),
            ]);
            // entidade → veículo
            const vehicleOf = new Map<string, string>();
            for (const r of [...(trips.data ?? []), ...(fuelings.data ?? []), ...(sos.data ?? [])] as { id: string; vehicle_id: string | null }[]) {
                if (r.vehicle_id) vehicleOf.set(r.id, r.vehicle_id);
            }
            for (const id of ids(VEHICLE)) vehicleOf.set(id, id);

            const vehicleIds = [...new Set(vehicleOf.values())];
            const [vehicles, drivers] = await Promise.all([
                vehicleIds.length ? supabase.from('vehicles').select('id, photo_url').in('id', vehicleIds) : Promise.resolve({ data: [] }),
                driverIds.length ? supabase.from('profiles').select('id, photo_url').in('id', driverIds) : Promise.resolve({ data: [] }),
            ]);
            const signedVehicles = await signFotos((vehicles.data ?? []) as { id: string; photo_url: string | null }[]);
            const signedDrivers = await signFotos((drivers.data ?? []) as { id: string; photo_url: string | null }[]);
            const vehiclePhoto = new Map(signedVehicles.filter((v) => v.photo_url).map((v) => [v.id, v.photo_url as string]));
            const driverPhoto = new Map(signedDrivers.filter((d) => d.photo_url).map((d) => [d.id, d.photo_url as string]));

            const out = new Map<string, NotificationPhoto>();
            for (const n of keyed) {
                const id = String(n.entity_id);
                const type = String(n.entity_type).toLowerCase();
                if (DRIVER.has(type)) {
                    const url = driverPhoto.get(id);
                    if (url) out.set(n.id, { url, kind: 'driver' });
                    continue;
                }
                const vid = vehicleOf.get(id);
                const url = vid ? vehiclePhoto.get(vid) : undefined;
                if (url) out.set(n.id, { url, kind: 'vehicle' });
            }
            return out;
        },
    });
}
