import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Modal } from '@/components/ui/Modal';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { MapPin, Navigation, Clock, Car, Users, AlertTriangle, Route, Gauge } from '@/components/sgf/icons';
import { formatDateTime, formatDistance, getStatusLabel, getStatusColor } from '@/lib/utils';
import { useTrip, useTripLocations } from '@/hooks/useTrips';
import type { Tables } from '@/types/database.types';

interface TripDetailsModalProps {
    tripId: string | null;
    onClose: () => void;
}

type TripFull = Tables<'trips'> & {
    vehicles?: { plate?: string; brand?: string | null; model?: string | null } | null;
    drivers?: { name?: string } | null;
    start_odometer_photo_url?: string | null;
    end_odometer_photo_url?: string | null;
    notes?: string | null;
};

// Marcador colorido simples (início = verde, fim = vermelho)
const pinIcon = (color: string) =>
    L.divIcon({
        className: 'trip-pin',
        html: `<div style="width:22px;height:22px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 22],
        popupAnchor: [0, -22],
    });

const START_ICON = pinIcon('#22C55E');
const END_ICON = pinIcon('#EF4444');

function FitBounds({ points }: { points: [number, number][] }) {
    const map = useMap();
    useEffect(() => {
        if (points.length === 0) return;
        if (points.length === 1) {
            map.setView(points[0], 15);
            return;
        }
        map.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
    }, [map, points]);
    return null;
}

function durationLabel(startAt?: string | null, endAt?: string | null): string {
    if (!startAt || !endAt) return '—';
    const mins = Math.max(Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000), 0);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h === 0 ? `${m}min` : `${h}h ${m}min`;
}

function PhotoBlock({ label, url }: { label: string; url?: string | null }) {
    const [open, setOpen] = useState(false);
    return (
        <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-500">{label}</p>
            {url ? (
                <>
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        className="group relative block w-full overflow-hidden rounded-xl border border-slate-200"
                    >
                        <img src={url} alt={label} className="h-40 w-full object-cover transition-transform group-hover:scale-105" />
                        <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                    </button>
                    {open && (
                        <div
                            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-6"
                            onClick={() => setOpen(false)}
                        >
                            <img src={url} alt={label} className="max-h-full max-w-full rounded-xl object-contain" />
                        </div>
                    )}
                </>
            ) : (
                <div className="flex h-40 w-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
                    Sem foto
                </div>
            )}
        </div>
    );
}

export function TripDetailsModal({ tripId, onClose }: TripDetailsModalProps) {
    const { data: tripRaw, isLoading: tripLoading } = useTrip(tripId ?? '');
    const { data: locations = [], isLoading: locLoading } = useTripLocations(tripId ?? undefined);

    const trip = tripRaw as TripFull | undefined;

    const points = useMemo<[number, number][]>(
        () => (locations as Tables<'trip_locations'>[]).map((l) => [Number(l.lat), Number(l.lng)] as [number, number]),
        [locations]
    );

    const vehicleLabel = trip?.vehicles
        ? [trip.vehicles.brand, trip.vehicles.model].filter(Boolean).join(' ') || trip.vehicles.plate || 'Veículo'
        : 'Veículo';

    const startKm = trip?.start_odometer ?? 0;
    const endKm = trip?.end_odometer ?? startKm;
    const distance = trip?.distance_km ?? Math.max(endKm - startKm, 0);
    const hasAnomaly = trip?.status === 'problema' || (trip as { has_anomaly?: boolean })?.has_anomaly;

    return (
        <Modal
            isOpen={!!tripId}
            onClose={onClose}
            title="Detalhes da viagem"
            size="xl"
        >
            {tripLoading ? (
                <div className="py-16 text-center text-sm text-slate-400">Carregando viagem…</div>
            ) : !trip ? (
                <div className="py-16 text-center text-sm text-red-500">Viagem não encontrada.</div>
            ) : (
                <div className="space-y-6">
                    {/* Cabeçalho resumido */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2">
                            <Car className="h-4 w-4 text-slate-500" />
                            <span className="font-semibold text-slate-900">{vehicleLabel}</span>
                            {trip.vehicles?.plate && (
                                <span className="font-mono text-xs text-slate-500">{trip.vehicles.plate}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2">
                            <Users className="h-4 w-4 text-slate-500" />
                            <span className="text-sm text-slate-700">{trip.drivers?.name || 'Sem motorista'}</span>
                        </div>
                        <SGFBadge variant={getStatusColor(trip.status) as 'default' | 'success' | 'warning' | 'error' | 'info'}>
                            {getStatusLabel(trip.status)}
                        </SGFBadge>
                        {hasAnomaly && (
                            <span className="flex items-center gap-1 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                                <AlertTriangle className="h-4 w-4" /> Anomalia
                            </span>
                        )}
                    </div>

                    {/* Mapa com a rota */}
                    <div>
                        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <MapPin className="h-4 w-4 text-emerald-600" /> Trajeto registrado
                        </p>
                        <div className="h-80 w-full overflow-hidden rounded-2xl border border-slate-200">
                            {locLoading ? (
                                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                                    Carregando trajeto…
                                </div>
                            ) : points.length === 0 ? (
                                <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-50 text-sm text-slate-400">
                                    <Navigation className="h-6 w-6" />
                                    Nenhum ponto de GPS registrado para esta viagem.
                                </div>
                            ) : (
                                <MapContainer
                                    center={points[0]}
                                    zoom={14}
                                    scrollWheelZoom
                                    style={{ height: '100%', width: '100%' }}
                                >
                                    <TileLayer
                                        attribution='&copy; OpenStreetMap'
                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                    />
                                    <Polyline positions={points} pathOptions={{ color: '#00A86B', weight: 4, opacity: 0.85 }} />
                                    <Marker position={points[0]} icon={START_ICON}>
                                        <Popup>Início da viagem</Popup>
                                    </Marker>
                                    {points.length > 1 && (
                                        <Marker position={points[points.length - 1]} icon={END_ICON}>
                                            <Popup>Fim da viagem</Popup>
                                        </Marker>
                                    )}
                                    <FitBounds points={points} />
                                </MapContainer>
                            )}
                        </div>
                    </div>

                    {/* Fotos do odômetro */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <PhotoBlock label="Odômetro — início" url={trip.start_odometer_photo_url} />
                        <PhotoBlock label="Odômetro — fim" url={trip.end_odometer_photo_url} />
                    </div>

                    {/* Dados da viagem */}
                    <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
                        <Info icon={Clock} label="Início" value={trip.start_at ? formatDateTime(trip.start_at) : '—'} />
                        <Info icon={Clock} label="Fim" value={trip.end_at ? formatDateTime(trip.end_at) : '—'} />
                        <Info icon={Clock} label="Duração" value={durationLabel(trip.start_at, trip.end_at)} />
                        <Info icon={Gauge} label="Km inicial" value={startKm.toLocaleString('pt-BR')} />
                        <Info icon={Gauge} label="Km final" value={endKm.toLocaleString('pt-BR')} />
                        <Info icon={Route} label="Distância" value={formatDistance(distance)} />
                        <div className="sm:col-span-3">
                            <Info icon={MapPin} label="Destino / finalidade" value={trip.destination || '—'} />
                        </div>
                        {trip.notes && (
                            <div className="sm:col-span-3">
                                <Info icon={AlertTriangle} label="Observações" value={trip.notes} />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Modal>
    );
}

function Info({
    icon: Icon,
    label,
    value,
}: {
    icon: typeof Clock;
    label: string;
    value: string;
}) {
    return (
        <div className="flex items-start gap-2">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <p className="text-sm font-medium text-slate-900 break-words">{value}</p>
            </div>
        </div>
    );
}

export default TripDetailsModal;
