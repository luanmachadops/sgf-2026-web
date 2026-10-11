import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { Loader2, Wrench } from '@/components/sgf/icons';
import { describeRemaining, maintenancePlansApi, planStatusKey, PLAN_STATUS_META } from '@/lib/fleet-api';
import { formatPlate } from '@/lib/utils';

/** Visão geral da preventiva: planos ativos próximos/vencidos da frota inteira. */
export function PreventiveOverview() {
    const { data: plans = [], isLoading, isError } = useQuery({
        queryKey: ['maintenance-plans', 'active'],
        queryFn: () => maintenancePlansApi.getActive(),
    });
    const { data: openPlanIds = new Set<string>() } = useQuery({
        queryKey: ['maintenance-plans', 'open-orders'],
        queryFn: () => maintenancePlansApi.getOpenOrderPlanIds(),
    });

    const { due, overdueCount, soonCount } = useMemo(() => {
        const list = plans
            .filter((p) => {
                const k = planStatusKey(p.status);
                return k === 'vencido' || k === 'proximo';
            })
            .sort((a, b) => {
                const ka = planStatusKey(a.status) === 'vencido' ? 0 : 1;
                const kb = planStatusKey(b.status) === 'vencido' ? 0 : 1;
                return ka - kb || (a.km_remaining ?? Infinity) - (b.km_remaining ?? Infinity);
            });
        return {
            due: list,
            overdueCount: list.filter((p) => p.status === 'vencido').length,
            soonCount: list.filter((p) => p.status === 'proximo').length,
        };
    }, [plans]);

    return (
        <SGFCard
            title={`Preventiva — ${overdueCount} vencido(s), ${soonCount} próximo(s)`}
            icon={Wrench}
        >
            {isLoading ? (
                <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                </div>
            ) : isError ? (
                <p className="py-3 text-sm text-rose-600">Não foi possível carregar os planos de preventiva.</p>
            ) : due.length === 0 ? (
                <p className="py-3 text-sm text-slate-400">
                    {plans.length === 0
                        ? 'Nenhum plano de preventiva cadastrado. Crie planos na aba Preventiva do veículo.'
                        : 'Nenhum plano próximo ou vencido na frota.'}
                </p>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {due.map((p) => {
                        const meta = PLAN_STATUS_META[planStatusKey(p.status)];
                        return (
                            <li key={p.plan_id}>
                                <Link
                                    to={`/veiculos/${p.vehicle_id}`}
                                    className="flex flex-col gap-1 rounded-lg px-1 py-3 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <span className="font-mono text-sm font-bold text-slate-900">{formatPlate(p.plate)}</span>
                                        <span className="text-sm text-slate-700">{p.service_label}</span>
                                        <SGFBadge variant={meta.variant} size="sm">{meta.label}</SGFBadge>
                                        {p.plan_id && openPlanIds.has(p.plan_id) && <SGFBadge variant="info" size="sm">OS aberta</SGFBadge>}
                                    </div>
                                    <span className="text-xs text-slate-500">{describeRemaining(p).join(' · ')}</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </SGFCard>
    );
}
