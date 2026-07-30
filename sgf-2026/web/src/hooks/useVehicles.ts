import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vehiclesApi } from '@/lib/supabase-api';
import type { VehicleFilters } from '@/types';
import type { TablesInsert, TablesUpdate } from '@/types/database.types';

export function useVehicles(filters?: VehicleFilters) {
    return useQuery({
        queryKey: ['vehicles', filters],
        queryFn: () => vehiclesApi.getAll(filters ? {
            departmentId: filters.departmentId,
            status: filters.status,
            search: filters.search,
            page: filters.page,
            limit: filters.limit,
        } : undefined),
    });
}

export function useVehicle(id: string) {
    return useQuery({
        queryKey: ['vehicle', id],
        queryFn: () => vehiclesApi.getById(id),
        enabled: !!id,
    });
}

export function useCreateVehicle() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: TablesInsert<'vehicles'>) => vehiclesApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vehicles'] });
        },
    });
}

export function useUpdateVehicle() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: TablesUpdate<'vehicles'> }) =>
            vehiclesApi.update(id, data),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: ['vehicles'] });
            queryClient.invalidateQueries({ queryKey: ['vehicle', id] });
        },
    });
}

export function useDeleteVehicle() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, plate }: { id: string; plate: string }) => vehiclesApi.delete(id, plate),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vehicles'] });
        },
    });
}
