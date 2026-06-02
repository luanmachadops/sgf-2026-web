import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, type AppSettings } from '@/lib/supabase-api';

export function useAppSettings() {
    return useQuery({
        queryKey: ['app-settings'],
        queryFn: () => settingsApi.get(),
        staleTime: 5 * 60 * 1000,
    });
}

export function useUpdateSettings() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (patch: Partial<AppSettings>) => settingsApi.update(patch),
        onSuccess: (data) => {
            qc.setQueryData(['app-settings'], data);
            qc.invalidateQueries({ queryKey: ['app-settings'] });
        },
    });
}
