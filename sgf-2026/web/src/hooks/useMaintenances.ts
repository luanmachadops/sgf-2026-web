import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { maintenancesApi } from '@/lib/supabase-api';
import type { MaintenanceFilters } from '@/types';
import type { TablesInsert, TablesUpdate } from '@/types/database.types';

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
        mutationFn: (data: TablesInsert<'service_orders'>) => maintenancesApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['maintenances'] });
        },
    });
}

export function useUpdateMaintenance() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: TablesUpdate<'service_orders'> }) =>
            maintenancesApi.update(id, data),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: ['maintenances'] });
            queryClient.invalidateQueries({ queryKey: ['maintenance', id] });
        },
    });
}

export function useApproveMaintenance() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, approvedBy, notes }: {
            id: string;
            approvedBy: string;
            notes?: string;
        }) => maintenancesApi.approve(id, approvedBy, notes),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['maintenances'] });
        },
    });
}

export function useRejectMaintenance() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) =>
            maintenancesApi.reject(id, reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['maintenances'] });
        },
    });
}
