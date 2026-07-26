import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { maintenancesApi } from '@/lib/supabase-api';
import type { MaintenanceRequestInput } from '@/lib/supabase-api';
import type { MaintenanceFilters } from '@/types';

export function useMaintenances(filters?: MaintenanceFilters) {
    return useQuery({
        queryKey: ['maintenances', filters],
        queryFn: () => maintenancesApi.getAll(filters ? {
            vehicleId: filters.vehicleId,
            status: filters.status,
            type: filters.type,
            page: filters.page,
            limit: filters.limit,
        } : undefined),
    });
}

export function useMaintenance(id: string) {
    return useQuery({
        queryKey: ['maintenance', id],
        queryFn: () => maintenancesApi.getById(id),
        enabled: !!id,
    });
}

export function useCreateMaintenance() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: MaintenanceRequestInput) => maintenancesApi.create(input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['maintenances'] });
            queryClient.invalidateQueries({ queryKey: ['workshop-orders'] });
        },
    });
}

export function useUpdateMaintenance() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: MaintenanceRequestInput }) =>
            maintenancesApi.updateRequest(id, input),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: ['maintenances'] });
            queryClient.invalidateQueries({ queryKey: ['maintenance', id] });
        },
    });
}

export function useAuthorizeMaintenance() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, repairShopId, note }: {
            id: string;
            repairShopId: string;
            note?: string;
        }) => maintenancesApi.authorize(id, repairShopId, note),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: ['maintenances'] });
            queryClient.invalidateQueries({ queryKey: ['maintenance', id] });
            queryClient.invalidateQueries({ queryKey: ['vehicles'] });
            queryClient.invalidateQueries({ queryKey: ['map', 'live-vehicles'] });
            queryClient.invalidateQueries({ queryKey: ['workshop-orders'] });
        },
    });
}

export function useCancelMaintenance() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) =>
            maintenancesApi.cancel(id, reason),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: ['maintenances'] });
            queryClient.invalidateQueries({ queryKey: ['maintenance', id] });
            queryClient.invalidateQueries({ queryKey: ['vehicles'] });
            queryClient.invalidateQueries({ queryKey: ['map', 'live-vehicles'] });
            queryClient.invalidateQueries({ queryKey: ['workshop-orders'] });
        },
    });
}
