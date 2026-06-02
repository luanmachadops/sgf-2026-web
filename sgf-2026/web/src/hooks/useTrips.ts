import { useQuery } from '@tanstack/react-query';
import { tripsApi } from '@/lib/supabase-api';
import type { TripFilters } from '@/types';

export function useTrips(filters?: TripFilters) {
    return useQuery({
        queryKey: ['trips', filters],
        queryFn: () => tripsApi.getAll(filters ? {
            vehicleId: filters.vehicleId,
            driverId: filters.driverId,
            status: filters.status,
            startDate: filters.startDate,
            endDate: filters.endDate,
            hasAnomaly: filters.hasAnomaly,
            page: filters.page,
            limit: filters.limit,
        } : undefined),
    });
}

export function useTrip(id: string) {
    return useQuery({
        queryKey: ['trip', id],
        queryFn: () => tripsApi.getById(id),
        enabled: !!id,
    });
}

export function useTripLocations(id: string | undefined, enabled = true) {
    return useQuery({
        queryKey: ['trip-locations', id],
        queryFn: () => tripsApi.getLocations(id as string),
        enabled: !!id && enabled,
    });
}
