import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tripsApi, type TripCorrectionPatch } from '@/lib/supabase-api';
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

export function useTripTimeline(id: string | undefined, enabled = true) {
    return useQuery({
        queryKey: ['trip-timeline', id],
        queryFn: () => tripsApi.getTimeline(id as string),
        enabled: !!id && enabled,
    });
}

export function useTripCorrections(id: string | undefined) {
    return useQuery({
        queryKey: ['trip-corrections', id],
        queryFn: () => tripsApi.getCorrections(id as string),
        enabled: !!id,
    });
}

export function useTripStops(id: string | undefined) {
    return useQuery({
        queryKey: ['trip-stops', id],
        queryFn: () => tripsApi.getStops(id as string),
        enabled: !!id,
    });
}

export function useTripChecklist(id: string | undefined) {
    return useQuery({
        queryKey: ['trip-checklist', id],
        queryFn: () => tripsApi.getChecklist(id as string),
        enabled: !!id,
    });
}

function useInvalidateTrip() {
    const queryClient = useQueryClient();
    return (tripId: string) => Promise.all([
        queryClient.invalidateQueries({ queryKey: ['trips'] }),
        queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
        queryClient.invalidateQueries({ queryKey: ['trip-timeline', tripId] }),
        queryClient.invalidateQueries({ queryKey: ['trip-corrections', tripId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
}

export function useCancelTrip() {
    const invalidate = useInvalidateTrip();
    return useMutation({
        mutationFn: ({ tripId, reason }: { tripId: string; reason: string }) => tripsApi.cancel(tripId, reason),
        onSuccess: (_data, vars) => invalidate(vars.tripId),
    });
}

export function useCorrectTrip() {
    const invalidate = useInvalidateTrip();
    return useMutation({
        mutationFn: ({ tripId, patch, reason }: { tripId: string; patch: TripCorrectionPatch; reason: string }) =>
            tripsApi.correct(tripId, patch, reason),
        onSuccess: (_data, vars) => invalidate(vars.tripId),
    });
}
