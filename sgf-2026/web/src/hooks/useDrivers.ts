import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { driversApi, type DriverRecord } from '@/lib/supabase-api';
import { driverAccessApi, type CreateDriverRequest } from '@/lib/backend-api';
import type { DriverFilters } from '@/types';
import type { TablesUpdate } from '@/types/database.types';

export function useDrivers(filters?: DriverFilters) {
    return useQuery({
        queryKey: ['drivers', filters],
        queryFn: () => driversApi.getAll(filters ? {
            departmentId: filters.departmentId,
            status: filters.status,
            search: filters.search,
            page: filters.page,
            limit: filters.limit,
        } : undefined),
    });
}

export function useDriver(id: string) {
    return useQuery({
        queryKey: ['driver', id],
        queryFn: () => driversApi.getById(id),
        enabled: !!id,
    });
}

export function useCreateDriver() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: CreateDriverRequest) => driverAccessApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['drivers'] });
        },
    });
}

export function useUpdateDriver() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: TablesUpdate<'profiles'> }) =>
            driversApi.update(id, data),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: ['drivers'] });
            queryClient.invalidateQueries({ queryKey: ['driver', id] });
        },
    });
}

export function useDeleteDriver() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => driversApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['drivers'] });
        },
    });
}

export function useProvisionDriverAccess() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, password }: { id: string; password: string }) =>
            driverAccessApi.provisionAccess(id, { password }),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: ['drivers'] });
            queryClient.invalidateQueries({ queryKey: ['driver', id] });
        },
    });
}

export function useResetDriverPassword() {
    return useMutation({
        mutationFn: ({ id, password }: { id: string; password: string }) =>
            driverAccessApi.resetPassword(id, { password }),
    });
}

export type { DriverRecord };
