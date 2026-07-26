import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repairShopsApi } from '@/lib/supabase-api';
import type { TablesInsert, TablesUpdate } from '@/types/database.types';

export function useRepairShops(filters?: { activeOnly?: boolean; search?: string }) {
    return useQuery({
        queryKey: ['repairShops', filters],
        queryFn: () => repairShopsApi.getAll(filters),
        staleTime: 60_000,
    });
}

export function useRepairShop(id?: string) {
    return useQuery({
        queryKey: ['repairShop', id],
        queryFn: () => repairShopsApi.getById(id!),
        enabled: Boolean(id),
    });
}

export function useRepairShopDetail(id?: string) {
    return useQuery({
        queryKey: ['repairShop', id, 'detail'],
        queryFn: () => repairShopsApi.getDetail(id!),
        enabled: Boolean(id),
    });
}

export function useCreateRepairShop() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: TablesInsert<'repair_shops'>) => repairShopsApi.create(input),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['repairShops'] }),
    });
}

export function useUpdateRepairShop(id: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (updates: TablesUpdate<'repair_shops'>) => repairShopsApi.update(id, updates),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['repairShops'] });
            qc.invalidateQueries({ queryKey: ['repairShop', id] });
        },
    });
}
