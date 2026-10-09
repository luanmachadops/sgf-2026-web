import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { departmentsApi } from '@/lib/supabase-api';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFKPICard } from '@/components/sgf/SGFKPICard';
import { SGFTable, type SGFTableColumn } from '@/components/sgf/SGFTable';
import { SGFToolbar } from '@/components/sgf/SGFToolbar';
import { PeriodPresetSelect, PeriodRangeFields } from '@/components/sgf/PeriodSelect';
import { makePeriod, type PeriodValue } from '@/components/sgf/period';
import { TripDetailsModal } from '@/components/trips/TripDetailsModal';
import { AlertTriangle, Clock, MapPin, Route } from '@/components/sgf/icons';
import { VehicleCell, DriverCell } from '@/components/sgf/EntityCells';
import { formatDate, formatDateTime, formatDistance, getStatusLabel, getStatusColor, matchesSearch } from '@/lib/utils';
import { useHeader } from '@/contexts/HeaderContext';
import { useTrips } from '@/hooks/useTrips';
import type { TripStatus } from '@/types';
import { useSyncOnChange } from '@/hooks/useSyncOnChange';

type TripStatusBadge = 'default' | 'success' | 'warning' | 'error' | 'info';
type TabValue = '' | TripStatus | 'ANOMALY';

type TripRow = {
    id: string;
    number: number | null;
    startAt: string;
    endAt: string | null;
    plate: string;
    vehicleName: string;
    vehiclePhoto: string | null;
    driverPhoto: string | null;
    driver: string;
    departmentId: string | null;
    destination: string;
    startKm: number | null;
    endKm: number | null;
    /** Km declarado no hodômetro (final − inicial); null enquanto a viagem está aberta. */
    distance: number | null;
    status: TripStatus;
    hasAnomaly: boolean;
};

const TABS: { value: TabValue; label: string }[] = [
    { value: '', label: 'Todas' },
    { value: 'IN_PROGRESS', label: 'Em andamento' },
    { value: 'COMPLETED', label: 'Concluídas' },
    { value: 'ANOMALY', label: 'Com ocorrência' },
    { value: 'CANCELLED', label: 'Canceladas' },
];

function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}min`;
    return `${hours}h ${String(mins).padStart(2, '0')}min`;
}

/** Duração até o fim, ou até agora se a viagem ainda está aberta. */
function durationMinutes(startAt: string, endAt: string | null, now: number): number {
    const end = endAt ? new Date(endAt).getTime() : now;
    return Math.max(Math.round((end - new Date(startAt).getTime()) / 60000), 0);
}

/** Primeiro dia do período escolhido, no formato aceito pelo filtro do banco. */
function periodStart(period: PeriodValue): string | undefined {
    if (period.preset === 'custom') return period.from ? `${period.from}T00:00:00` : undefined;
    const from = new Date();
    from.setMonth(from.getMonth() - (Number(period.preset) || 1));
    return from.toISOString();
}

function periodEnd(period: PeriodValue): string | undefined {
    return period.preset === 'custom' && period.to ? `${period.to}T23:59:59` : undefined;
}

export default function Trips() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState('');
    const [tab, setTab] = useState<TabValue>('');
    const [departmentId, setDepartmentId] = useState('');
    const [period, setPeriod] = useState<PeriodValue>(() => makePeriod('1'));
    const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const { setTitle, setDescription } = useHeader();

    const paramId = searchParams.get('id') || searchParams.get('tripId');
    const paramSearch = searchParams.get('search');

    useSyncOnChange(`${paramSearch ?? ''}|${paramId ?? ''}`, () => {
        if (paramSearch) setSearchTerm(paramSearch);
        if (paramId) setSelectedTripId(paramId);
    });

    useEffect(() => {
        setTitle('Viagens');
        setDescription('Deslocamentos da frota: quem saiu, para onde, quanto rodou e quanto tempo levou.');
    }, [setTitle, setDescription]);

    // Duração das viagens em andamento anda sozinha na tela.
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(timer);
    }, []);

    // Memorizado: periodStart usa "agora", e um valor novo a cada render
    // mudaria a chave da consulta e buscaria de novo sem parar.
    const tripFilters = useMemo(() => ({ startDate: periodStart(period), endDate: periodEnd(period) }), [period]);
    const { data: rawTrips = [], isLoading, isError } = useTrips(tripFilters);

    const trips = useMemo(() => rawTrips.map((trip): TripRow => {
        const startKm = trip.start_odometer ?? null;
        const endKm = trip.end_odometer ?? null;
        return {
            id: trip.id,
            number: (trip as { trip_number?: number | null }).trip_number ?? null,
            startAt: trip.start_time,
            endAt: trip.end_time,
            plate: trip.vehicles?.plate || 'Sem placa',
            vehicleName: [trip.vehicles?.brand, trip.vehicles?.model].filter(Boolean).join(' '),
            vehiclePhoto: trip.vehicles?.photo_url ?? null,
            driverPhoto: trip.drivers?.photo_url ?? null,
            driver: trip.drivers?.name || 'Sem motorista',
            departmentId: trip.vehicles?.department_id ?? null,
            destination: trip.destination || '—',
            startKm,
            endKm,
            distance: startKm != null && endKm != null ? Math.max(endKm - startKm, 0) : null,
            status: trip.status,
            hasAnomaly: Boolean(trip.has_anomaly),
        };
    }), [rawTrips]);

    const { data: departments = [] } = useQuery({
        queryKey: ['departments'],
        queryFn: () => departmentsApi.getAll(),
    });
    const departmentOptions = useMemo(() => [
        { value: '', label: 'Todas' },
        ...departments.map((d) => ({ value: d.id, label: d.name })),
    ], [departments]);

    const searched = useMemo(
        () => trips.filter((trip) =>
            (!departmentId || trip.departmentId === departmentId)
            && (String(trip.number ?? '') === searchTerm.trim().replace(/^#/, '')
                || matchesSearch(searchTerm, trip.plate, trip.vehicleName, trip.driver, trip.destination))),
        [trips, searchTerm, departmentId],
    );

    const tabCounts = useMemo(() => ({
        '': searched.length,
        IN_PROGRESS: searched.filter((t) => t.status === 'IN_PROGRESS').length,
        COMPLETED: searched.filter((t) => t.status === 'COMPLETED').length,
        CANCELLED: searched.filter((t) => t.status === 'CANCELLED').length,
        ANOMALY: searched.filter((t) => t.hasAnomaly).length,
    }), [searched]);

    const visible = useMemo(() => searched.filter((t) => {
        if (tab === '') return true;
        if (tab === 'ANOMALY') return t.hasAnomaly;
        return t.status === tab;
    }), [searched, tab]);

    const totalKm = searched.reduce((sum, t) => sum + (t.distance ?? 0), 0);
    const finished = searched.filter((t) => t.endAt);
    const avgMinutes = finished.length
        ? Math.round(finished.reduce((sum, t) => sum + durationMinutes(t.startAt, t.endAt, now), 0) / finished.length)
        : 0;

    const requestedTripId = useMemo(() => {
        if (paramId) return paramId;
        if (!paramSearch) return null;
        return trips.find((trip) => matchesSearch(paramSearch, trip.plate, trip.driver, trip.destination))?.id ?? null;
    }, [paramId, paramSearch, trips]);
    const activeSelectedTripId = selectedTripId ?? requestedTripId;

    const closeSelectedTrip = () => {
        setSelectedTripId(null);
        if (!paramId) return;
        const next = new URLSearchParams(searchParams);
        next.delete('id');
        next.delete('tripId');
        setSearchParams(next, { replace: true });
    };

    const columns: SGFTableColumn<TripRow>[] = [
        {
            header: 'Nº',
            sortValue: (row) => row.number ?? 0,
            accessor: (row) => <span className="font-mono text-sm font-semibold text-slate-500">#{row.number ?? '—'}</span>,
        },
        {
            header: 'Início',
            accessor: (row) => (
                <div>
                    <p className="font-medium text-slate-900">{formatDate(row.startAt)}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(row.startAt).split(' ')[1]}</p>
                </div>
            ),
        },
        {
            header: 'Veículo',
            accessor: (row) => <VehicleCell plate={row.plate} name={row.vehicleName || null} photoUrl={row.vehiclePhoto} />,
        },
        {
            header: 'Motorista',
            accessor: (row) => <DriverCell name={row.driver} photoUrl={row.driverPhoto} />,
        },
        { header: 'Destino', accessor: 'destination', className: 'max-w-[220px] truncate' },
        {
            header: 'Km (hodômetro)',
            accessor: (row) => (
                <div>
                    <p className="font-semibold text-slate-900">{row.distance != null ? `${row.distance.toLocaleString('pt-BR')} km` : '—'}</p>
                    {row.startKm != null && (
                        <p className="text-xs text-slate-500">
                            {row.startKm.toLocaleString('pt-BR')} → {row.endKm != null ? row.endKm.toLocaleString('pt-BR') : '…'}
                        </p>
                    )}
                </div>
            ),
        },
        {
            header: 'Duração',
            accessor: (row) => (
                <span className={row.endAt ? 'text-slate-700' : 'font-semibold text-blue-600'}>
                    {formatDuration(durationMinutes(row.startAt, row.endAt, now))}
                </span>
            ),
        },
        {
            header: 'Status',
            accessor: (row) => (
                <div className="flex items-center gap-2">
                    <SGFBadge variant={getStatusColor(row.status) as TripStatusBadge}>{getStatusLabel(row.status)}</SGFBadge>
                    {row.hasAnomaly && <AlertTriangle className="h-4 w-4 text-amber-500" aria-label="Com ocorrência" />}
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SGFKPICard title="Viagens no período" value={searched.length} icon={Route} iconColor="text-emerald-500" chartColor="#10b981" loading={isLoading} />
                <SGFKPICard title="Em andamento agora" value={tabCounts.IN_PROGRESS} icon={Clock} iconColor="text-blue-500" chartColor="#3b82f6" loading={isLoading} onClick={() => setTab('IN_PROGRESS')} />
                <SGFKPICard title="Km rodados (hodômetro)" value={formatDistance(totalKm)} icon={MapPin} iconColor="text-slate-500" chartColor="#64748b" loading={isLoading} />
                <SGFKPICard title="Com ocorrência" value={tabCounts.ANOMALY} icon={AlertTriangle} iconColor="text-amber-500" chartColor="#f59e0b" loading={isLoading} onClick={() => setTab('ANOMALY')} />
            </div>

            <SGFToolbar
                searchValue={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Buscar nº, placa, motorista ou destino..."
                filters={[
                    {
                        key: 'department',
                        value: departmentId,
                        onChange: setDepartmentId,
                        options: departmentOptions,
                        placeholder: 'Secretaria',
                    },
                ]}
            >
                <div className="flex items-center gap-2">
                    {period.preset === 'custom' && (
                        <PeriodRangeFields
                            value={period}
                            onChange={setPeriod}
                            className="!justify-start"
                            fieldClassName="!w-[140px] !py-2.5 !text-sm"
                            align="start"
                        />
                    )}
                    <PeriodPresetSelect value={period} onChange={setPeriod} />
                </div>
            </SGFToolbar>

            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {TABS.map((t) => {
                        const active = tab === t.value;
                        return (
                            <button
                                key={t.value || 'all'}
                                type="button"
                                onClick={() => setTab(t.value)}
                                className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition ${
                                    active
                                        ? 'border-[var(--sgf-accent)] bg-[var(--sgf-accent)] text-[var(--sgf-accent-contrast)]'
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-[var(--sgf-accent)]'
                                }`}
                            >
                                {t.label} <span className="ml-1 opacity-70">{tabCounts[t.value]}</span>
                            </button>
                        );
                    })}
                </div>
                {avgMinutes > 0 && (
                    <p className="hidden shrink-0 text-xs text-slate-500 md:block">Duração média: <strong className="text-slate-700">{formatDuration(avgMinutes)}</strong></p>
                )}
            </div>

            <div className="-mx-6 md:mx-0">
                <SGFTable
                    columns={columns}
                    data={visible}
                    keyExtractor={(row) => row.id}
                    onRowClick={(row) => setSelectedTripId(row.id)}
                    loading={isLoading}
                    emptyMessage={isError ? 'Não foi possível carregar as viagens. Tente novamente.' : 'Nenhuma viagem neste período.'}
                />
            </div>

            <TripDetailsModal tripId={activeSelectedTripId} onClose={closeSelectedTrip} />
        </div>
    );
}
