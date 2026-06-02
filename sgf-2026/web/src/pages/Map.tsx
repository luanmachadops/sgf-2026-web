import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { Car, Navigation, Search } from '@/components/sgf/icons';
import { cn } from '@/lib/utils';
import { useHeader } from '@/contexts/HeaderContext';
import { useEffect } from 'react';
import { mapApi } from '@/lib/supabase-api';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom marker icons by status
const createCustomIcon = (color: string) => {
    return L.divIcon({
        className: 'custom-marker',
        html: `
      <div style="
        width: 32px;
        height: 32px;
        background-color: ${color};
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      ">
        <svg style="transform: rotate(45deg);" width="16" height="16" viewBox="0 0 24 24" fill="white">
          <path d="M5 11l1.5-4.5h11L19 11m-1.5 5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm-9 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM5 11v5a1 1 0 001 1h1a1 1 0 001-1v-1h8v1a1 1 0 001 1h1a1 1 0 001-1v-5H5z"/>
        </svg>
      </div>
    `,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
    });
};

const statusIcons = {
    moving: createCustomIcon('#22C55E'),
    idle: createCustomIcon('#3B82F6'),
    stopped: createCustomIcon('#9CA3AF'),
    alert: createCustomIcon('#EF4444'),
};

// Centro padrão do mapa quando não há veículos com posição.
const DEFAULT_CENTER: [number, number] = [-15.7939, -47.8828];

// SGFBadge variants: 'moving' | 'idle' | 'stopped' | 'alert' batem com o status.
const getBadgeVariant = (status: string): any => status;

export default function MapPage() {
    const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [mobileView, setMobileView] = useState<'map' | 'list'>('map');
    const { setTitle, setDescription, setSearchPlaceholder, setSearchHandler } = useHeader();

    const { data: vehicles = [], isLoading } = useQuery({
        queryKey: ['map', 'live-vehicles'],
        queryFn: () => mapApi.getLiveVehicles(),
        // "Centro de comando" ao vivo: atualiza periodicamente.
        refetchInterval: 30_000,
    });

    useEffect(() => {
        setTitle('Mapa');
        setDescription('Localização dos veículos em operação, atualizada em tempo real.');
        setSearchPlaceholder('Pesquisar veículo ou motorista...');
        setSearchHandler((term: string) => setSearchTerm(term));

        return () => {
            setSearchHandler(() => { });
        };
    }, [setTitle, setDescription, setSearchPlaceholder, setSearchHandler]);

    const filteredVehicles = vehicles.filter((v) => {
        const matchesSearch =
            v.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
            v.driver.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const statusCounts = vehicles.reduce(
        (acc, v) => {
            acc[v.status] = (acc[v.status] || 0) + 1;
            return acc;
        },
        {} as Record<string, number>
    );

    return (
        <div className="flex flex-col h-[calc(100dvh-11rem)] min-h-[420px] gap-3 overflow-hidden">
            {/* Alternador Mapa / Lista — só no mobile */}
            <div className="flex shrink-0 gap-1.5 rounded-full bg-white border border-slate-200 p-1 lg:hidden">
                {([['map', 'Mapa'], ['list', `Lista (${filteredVehicles.length})`]] as const).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setMobileView(key)}
                        className={
                            'flex-1 rounded-full py-1.5 text-sm font-semibold transition ' +
                            (mobileView === key ? 'bg-emerald-500 text-white' : 'text-slate-500')
                        }
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
            {/* Sidebar */}
            <SGFCard
                className={
                    (mobileView === 'list' ? 'flex' : 'hidden') +
                    ' lg:flex w-full lg:w-80 flex-shrink-0 flex-col p-0 overflow-hidden'
                }
                padding="none"
            >

                <div className="p-4 flex flex-col gap-3">
                    {/* Search Field */}
                    <div className="group relative w-full">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[var(--sgf-primary)]" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder="Buscar placa ou motorista..."
                            className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-slate-700 shadow-[var(--sgf-shadow-xs)] transition-all placeholder:text-slate-400 hover:border-[var(--sgf-primary)]/50 hover:bg-slate-50/50 focus:border-[var(--sgf-primary)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--sgf-primary)]/10"
                        />
                    </div>

                    {/* Tabs de status — padrão segmentado (igual às abas de detalhes) */}
                    <div className="grid w-full grid-cols-4 gap-1 rounded-xl bg-slate-100/50 p-1">
                        {[
                            { value: 'all', label: 'Todos', count: vehicles.length },
                            { value: 'moving', label: 'Movim.', count: statusCounts.moving || 0 },
                            { value: 'idle', label: 'Parado', count: statusCounts.idle || 0 },
                            { value: 'alert', label: 'Alerta', count: statusCounts.alert || 0 },
                        ].map((t) => {
                            const isActive = statusFilter === t.value;
                            return (
                                <button
                                    key={t.value}
                                    type="button"
                                    onClick={() => setStatusFilter(t.value)}
                                    className={
                                        'flex flex-col items-center justify-center rounded-lg py-1.5 transition-all ' +
                                        (isActive
                                            ? 'bg-[#00A86B] text-white shadow-sm'
                                            : 'text-slate-500 hover:bg-white')
                                    }
                                >
                                    <span className="text-sm font-bold leading-none">{t.count}</span>
                                    <span className={'mt-0.5 text-[10px] font-medium leading-none ' + (isActive ? 'text-white/80' : 'text-slate-400')}>{t.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Vehicle List */}
                <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                    {isLoading && (
                        <p className="px-3 py-8 text-center text-sm text-slate-400">Carregando veículos…</p>
                    )}
                    {!isLoading && filteredVehicles.length === 0 && (
                        <p className="px-3 py-8 text-center text-sm text-slate-400">
                            Nenhum veículo em operação no momento.
                        </p>
                    )}
                    {filteredVehicles.map((vehicle) => (
                        <div
                            key={vehicle.id}
                            onClick={() => setSelectedVehicle(vehicle.id)}
                            className={cn(
                                'p-3 rounded-2xl border cursor-pointer transition-all',
                                'hover:border-[var(--sgf-primary)] hover:bg-[var(--sgf-primary)]/5',
                                selectedVehicle === vehicle.id
                                    ? 'border-[var(--sgf-primary)] bg-[var(--sgf-primary)]/5'
                                    : 'border-transparent bg-slate-50'
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <div
                                    className={cn(
                                        'w-10 h-10 rounded-full flex items-center justify-center',
                                        vehicle.status === 'moving' && 'bg-emerald-100 text-emerald-600',
                                        vehicle.status === 'idle' && 'bg-blue-100 text-blue-600',
                                        vehicle.status === 'alert' && 'bg-red-100 text-red-600'
                                    )}
                                >
                                    <Car className="h-5 w-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm text-gray-900">{vehicle.plate}</p>
                                    <p className="text-xs text-gray-500 truncate">{vehicle.driver}</p>
                                </div>
                                <SGFBadge variant={getBadgeVariant(vehicle.status)} size="sm">
                                    {vehicle.speed > 0 ? `${vehicle.speed} km/h` : '0 km/h'}
                                </SGFBadge>
                            </div>
                        </div>
                    ))}
                </div>
            </SGFCard>

            {/* Map */}
            <SGFCard
                className={
                    (mobileView === 'map' ? 'flex' : 'hidden') +
                    ' lg:flex flex-1 flex-col overflow-hidden p-0 h-full'
                }
                padding="none"
            >
                <MapContainer
                    key={filteredVehicles.length > 0 ? 'loaded' : 'empty'}
                    center={filteredVehicles[0] ? [filteredVehicles[0].lat, filteredVehicles[0].lng] : DEFAULT_CENTER}
                    zoom={filteredVehicles[0] ? 13 : 4}
                    style={{ height: '100%', width: '100%' }}
                    className="h-full w-full"
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {filteredVehicles.map((vehicle) => (
                        <Marker
                            key={vehicle.id}
                            position={[vehicle.lat, vehicle.lng]}
                            icon={statusIcons[vehicle.status as keyof typeof statusIcons]}
                            eventHandlers={{
                                click: () => setSelectedVehicle(vehicle.id),
                            }}
                        >
                            <Popup>
                                <div className="p-2">
                                    <p className="font-bold text-base">{vehicle.plate}</p>
                                    <p className="text-sm text-gray-600">{vehicle.driver}</p>
                                    <p className="text-sm text-gray-600">{vehicle.department}</p>
                                    <div className="mt-2 flex items-center gap-1">
                                        <Navigation className="h-4 w-4 text-[var(--sgf-primary)]" />
                                        <span className="text-sm font-medium">{vehicle.speed} km/h</span>
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </SGFCard>
            </div>
        </div>
    );
}
