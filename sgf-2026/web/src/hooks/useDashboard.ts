import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/supabase-api';
import type { ResolvedPeriod } from '@/components/sgf/PeriodSelect';

export function useDashboardKPIs() {
    return useQuery({
        queryKey: ['dashboard', 'kpis'],
        queryFn: () => dashboardApi.getKPIs(),
        refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
        staleTime: 2 * 60 * 1000, // Consider stale after 2 minutes
    });
}

export function useDashboardKpiTrends() {
    return useQuery({
        queryKey: ['dashboard', 'kpi-trends'],
        queryFn: () => dashboardApi.getKpiTrends(),
        staleTime: 5 * 60 * 1000,
    });
}

export function useExpenseChart(period: ResolvedPeriod = { monthsBack: 6 }) {
    return useQuery({
        queryKey: ['dashboard', 'expenses', period],
        queryFn: () => dashboardApi.getExpenseChart(period.monthsBack ?? 6, { from: period.from, to: period.to }),
        staleTime: 5 * 60 * 1000,
    });
}

export function useDepartmentDistribution() {
    return useQuery({
        queryKey: ['dashboard', 'departments'],
        queryFn: () => dashboardApi.getDepartmentDistribution(),
        staleTime: 5 * 60 * 1000,
    });
}

export function useFuelTypeBreakdown(period: ResolvedPeriod = { monthsBack: 1 }) {
    return useQuery({
        queryKey: ['dashboard', 'fuel-types', period],
        queryFn: () => dashboardApi.getFuelTypeBreakdown(period.monthsBack ?? 1, { from: period.from, to: period.to }),
        staleTime: 5 * 60 * 1000,
    });
}

export function useDepartmentConsumption(period: ResolvedPeriod = { monthsBack: 1 }) {
    return useQuery({
        queryKey: ['dashboard', 'department-consumption', period],
        queryFn: () => dashboardApi.getDepartmentConsumption(period.monthsBack ?? 1, { from: period.from, to: period.to }),
        staleTime: 5 * 60 * 1000,
    });
}
