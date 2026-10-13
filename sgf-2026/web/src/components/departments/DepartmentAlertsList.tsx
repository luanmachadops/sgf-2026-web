import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { VehicleCell } from '@/components/sgf/EntityCells';
import { Clipboard, Fuel, Route } from '@/components/sgf/icons';
import { departmentsApi, type DepartmentAlert } from '@/lib/supabase-api';
import { cn, formatDate } from '@/lib/utils';

const KIND: Record<DepartmentAlert['kind'], { label: string; icon: typeof Fuel; className: string }> = {
    trip: { label: 'Viagem com problema', icon: Route, className: 'bg-rose-50 text-rose-600' },
    fueling: { label: 'Abastecimento com anomalia', icon: Fuel, className: 'bg-amber-50 text-amber-600' },
    checklist: { label: 'Checklist com atenção', icon: Clipboard, className: 'bg-sky-50 text-sky-600' },
};

type Filter = 'all' | DepartmentAlert['kind'];

/** Itens que formam os "alertas operacionais" da secretaria, filtráveis por tipo. */
export function DepartmentAlertsList({ departmentId, onOpenTrip, onOpenFueling }: {
    departmentId: string;
    onOpenTrip: (id: string) => void;
    onOpenFueling: (id: string) => void;
}) {
    const navigate = useNavigate();
    const [filter, setFilter] = useState<Filter>('all');
    const { data = [], isLoading } = useQuery({
        queryKey: ['departments', 'alerts', departmentId],
        queryFn: () => departmentsApi.getAlerts(departmentId),
    });
    const counts = useMemo(() => ({
        all: data.length,
        trip: data.filter((a) => a.kind === 'trip').length,
        fueling: data.filter((a) => a.kind === 'fueling').length,
        checklist: data.filter((a) => a.kind === 'checklist').length,
    }), [data]);
    const visible = filter === 'all' ? data : data.filter((a) => a.kind === filter);

    const open = (alert: DepartmentAlert) => {
        if (alert.kind === 'trip') onOpenTrip(alert.id);
        else if (alert.kind === 'fueling') onOpenFueling(alert.id);
        else navigate(`/checklists?id=${alert.id}`);
    };

    const chips: Array<{ value: Filter; label: string }> = [
        { value: 'all', label: 'Todos' },
        { value: 'trip', label: 'Viagens' },
        { value: 'fueling', label: 'Abastecimentos' },
        { value: 'checklist', label: 'Checklists' },
    ];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                {chips.map((chip) => (
                    <button
                        key={chip.value}
                        type="button"
                        onClick={() => setFilter(chip.value)}
                        className={cn(
                            'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                            filter === chip.value
                                ? 'border-[var(--sgf-primary)] bg-[var(--sgf-primary)] text-[var(--sgf-primary-contrast)]'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                        )}
                    >
                        {chip.label} <span className="opacity-70">{counts[chip.value]}</span>
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div className="h-40 animate-pulse rounded-[18px] bg-slate-100" />
            ) : visible.length === 0 ? (
                <div className="rounded-[18px] bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
                    Nenhum alerta {filter === 'all' ? '' : 'deste tipo '}para esta secretaria.
                </div>
            ) : (
                <div className="divide-y divide-slate-100 overflow-hidden rounded-[18px] border border-slate-200 bg-white">
                    {visible.map((alert) => {
                        const kind = KIND[alert.kind];
                        const Icon = kind.icon;
                        return (
                            <button
                                key={`${alert.kind}-${alert.id}`}
                                type="button"
                                onClick={() => open(alert)}
                                className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                            >
                                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', kind.className)}>
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-slate-800">{kind.label}</p>
                                    <p className="truncate text-xs text-slate-500">{alert.detail}</p>
                                </div>
                                <div className="hidden min-w-0 sm:block sm:w-56">
                                    {alert.vehicle ? (
                                        <VehicleCell
                                            plate={alert.vehicle.plate}
                                            name={[alert.vehicle.brand, alert.vehicle.model].filter(Boolean).join(' ') || null}
                                            photoUrl={alert.vehicle.photo_url}
                                        />
                                    ) : <span className="text-xs text-slate-400">—</span>}
                                </div>
                                <span className="shrink-0 text-xs font-medium text-slate-500">{alert.date ? formatDate(alert.date) : '—'}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
