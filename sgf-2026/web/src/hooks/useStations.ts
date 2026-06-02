import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { stationsApi } from '@/lib/supabase-api';
import type { TablesInsert, TablesUpdate } from '@/types/database.types';

export function useStations(filters?: { activeOnly?: boolean; search?: string }) {
    return useQuery({
        queryKey: ['stations', filters],
        queryFn: () => stationsApi.getAll(filters),
        staleTime: 60_000,
    });
}

export function useStation(id?: string) {
    return useQuery({
        queryKey: ['station', id],
        queryFn: () => stationsApi.getById(id!),
        enabled: Boolean(id),
    });
}

export function useStationDetail(id?: string) {
    return useQuery({
        queryKey: ['station', id, 'detail'],
        queryFn: () => stationsApi.getDetail(id!),
        enabled: Boolean(id),
    });
}

export function useCreateStation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: TablesInsert<'fuel_stations'>) => stationsApi.create(input),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['stations'] }),
    });
}

export function useUpdateStation(id: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (updates: TablesUpdate<'fuel_stations'>) => stationsApi.update(id, updates),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['stations'] });
            qc.invalidateQueries({ queryKey: ['station', id] });
        },
    });
}
