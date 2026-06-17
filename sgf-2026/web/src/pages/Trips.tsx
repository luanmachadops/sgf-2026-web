import { useEffect, useMemo, useState } from 'react';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFTable, type SGFTableColumn } from '@/components/sgf/SGFTable';
import { SGFToolbar } from '@/components/sgf/SGFToolbar';
import { TripDetailsModal } from '@/components/trips/TripDetailsModal';
import {
    Eye,
    AlertTriangle,
    MapPin,
    Clock,
    Car,
    Users,
    Route,
} from '@/components/sgf/icons';
import { formatDate, formatDateTime, formatDistance, getStatusLabel, getStatusColor } from '@/lib/utils';
import { useHeader } from '@/contexts/HeaderContext';
import { useTrips } from '@/hooks/useTrips';
import type { TripRecord } from '@/lib/supabase-api';
import type { TripStatus } from '@/types';

type TripStatusBadge = 'default' | 'success' | 'warning' | 'error' | 'info';

type TripWithRelations = TripRecord;

type TripRow = {
    id: string;
    date: string;
    vehicle: string;
    driver: string;
    startKm: number;
    endKm: number;
    distance: number;
    duration: number;
    purpose: string;
    status: TripStatus;
    hasAnomaly: boolean;
};

const statusOptions = [
    { value: '', label: 'Todos os status' },
    { value: 'IN_PROGRESS', label: 'Em Andamento' },
    { value: 'COMPLETED', label: 'Concluída' },
    { value: 'CANCELLED', label: 'Cancelada' },
];

function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}min`;
    return `${hours}h ${mins}min`;
}

function getDurationInMinutes(startAt: string, endAt: string | null): number {
    if (!endAt) return 0;
    const diffMs = new Date(endAt).getTime() - new Date(startAt).getTime();
    return Math.max(Math.round(diffMs / 60000), 0);
}

export default function Trips() {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [showAnomaliesOnly, setShowAnomaliesOnly] = useState(false);
    const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
    const { setTitle, setDescription } = useHeader();

    const { data: rawTrips = [] } = useTrips({
        status: (statusFilter || undefined) as TripStatus | undefined,
        hasAnomaly: showAnomaliesOnly || undefined,
    });

    useEffect(() => {
        setTitle('Viagens');
        setDescription('Histórico de viagens, quilometragem e ocorrências.');
    }, [setTitle, setDescription]);

    const trips = useMemo(() => {
        return (rawTrips as TripWithRelations[]).map((trip): TripRow => {
            const endKm = trip.end_odometer ?? trip.start_odometer;
            const computedDistance = Math.max(endKm - trip.start_odometer, 0);

            return {
                id: trip.id,
                date: trip.start_time,
                vehicle: trip.vehicles?.plate || 'Sem placa',
                driver: trip.drivers?.name || 'Sem motorista',
                startKm: trip.start_odometer,
                endKm,
                distance: trip.actual_distance_km ?? computedDistance,
                duration: getDurationInMinutes(trip.start_time, trip.end_time),
                purpose: trip.destination,
                status: trip.status,
                hasAnomaly: Boolean(trip.has_anomaly),
            };
        });
    }, [rawTrips]);

    const filteredTrips = useMemo(() => {
        return trips.filter((trip) => {
            const term = searchTerm.trim().toLowerCase();
            if (!term) return true;
            return (
                trip.vehicle.toLowerCase().includes(term) ||
                trip.driver.toLowerCase().includes(term)
            );
        });
    }, [trips, searchTerm]);

    const totalDistance = filteredTrips.reduce((sum, trip) => sum + trip.distance, 0);
    const anomalyCount = trips.filter((trip) => trip.hasAnomaly).length;
    const inProgressCount = trips.filter((trip) => trip.status === 'IN_PROGRESS').length;

    const columns: SGFTableColumn<TripRow>[] = [
        {
            header: 'Data/Hora',
            accessor: (row) => (
                <div>
                    <p className="font-medium">{formatDate(row.date)}</p>
                    <p className="text-xs text-gray-500">{formatDateTime(row.date).split(' ')[1]}</p>
                </div>
            )
        },
        {
            header: 'Veículo / Motorista',
            accessor: (row) => (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <Car className="h-4 w-4 text-gray-400" />
                        <span className="font-mono font-medium">{row.vehicle}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Users className="h-4 w-4 text-gray-400" />
                        {row.driver}
                    </div>
                </div>
            )
        },
        {
            header: 'Distância',
            accessor: (row) => formatDistance(row.distance)
        },
        {
            header: 'Duração',
            accessor: (row) => formatDuration(row.duration)
        },
        {
            header: 'Finalidade',
            accessor: 'purpose',
            className: 'max-w-[200px] truncate'
        },
        {
            header: 'Status',
            accessor: (row) => (
                <div className="flex items-center gap-2">
                    <SGFBadge variant={getStatusColor(row.status) as TripStatusBadge}>
                        {getStatusLabel(row.status)}
                    </SGFBadge>
                    {row.hasAnomaly && (
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                </div>
            )
        },
        {
            header: 'Ações',
            sortable: false,
            accessor: (row) => (
                <SGFButton variant="ghost" size="sm" onClick={() => setSelectedTripId(row.id)} icon={Eye} />
            )
        }
    ];

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
                <SGFCard padding="sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-lg">
                            <Route className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{trips.length}</p>
                            <p className="text-sm text-gray-500">Total de viagens</p>
                        </div>
                    </div>
                </SGFCard>
                <SGFCard padding="sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <Clock className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{inProgressCount}</p>
                            <p className="text-sm text-gray-500">Em andamento</p>
                        </div>
                    </div>
                </SGFCard>
                <SGFCard padding="sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[var(--sgf-primary)]/10 rounded-lg">
                            <MapPin className="h-5 w-5 text-[var(--sgf-primary)]" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{formatDistance(totalDistance)}</p>
                            <p className="text-sm text-gray-500">Km percorridos</p>
                        </div>
                    </div>
                </SGFCard>
                <SGFCard padding="sm">
                    <button
                        type="button"
                        className="flex w-full items-center gap-3 text-left"
                        onClick={() => setShowAnomaliesOnly((prev) => !prev)}
                    >
                        <div className="p-2 bg-yellow-100 rounded-lg">
                            <AlertTriangle className="h-5 w-5 text-yellow-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{anomalyCount}</p>
                            <p className="text-sm text-gray-500">
                                {showAnomaliesOnly ? 'Filtrando anomalias' : 'Anomalias detectadas'}
                            </p>
                        </div>
                    </button>
                </SGFCard>
            </div>

            <SGFToolbar
                searchValue={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Pesquisar por veículo ou motorista..."
                filters={[
                    {
                        key: 'status',
                        value: statusFilter,
                        onChange: setStatusFilter,
                        options: statusOptions,
                        placeholder: 'Status',
                    },
                ]}
            />

            <div className="-mx-6 md:mx-0">
                <SGFTable
                    columns={columns}
                    data={filteredTrips}
                    keyExtractor={(row) => row.id}
                    onRowClick={(row) => setSelectedTripId(row.id)}
                    emptyMessage="Nenhuma viagem encontrada."
                />
            </div>

            <TripDetailsModal
                tripId={selectedTripId}
                onClose={() => setSelectedTripId(null)}
            />
        </div>
    );
}
