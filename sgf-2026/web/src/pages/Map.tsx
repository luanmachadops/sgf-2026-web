import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { Modal } from '@/components/ui/Modal';
import { Car, Navigation, Search, User, Building2, MapPin, Clock, AlertTriangle, Wrench } from '@/components/sgf/icons';
import { cn, formatDateTime } from '@/lib/utils';
import { useHeader } from '@/contexts/HeaderContext';
import { supabase } from '@/lib/supabase';
import { mapApi, type LiveVehicle } from '@/lib/supabase-api';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Cor + glyph (SVG) por status — base dos marcadores animados.
const STATUS_STYLE: Record<LiveVehicle['status'], { color: string; svg: string }> = {
    moving: { color: '#22C55E', svg: '<path d="M3 11l19-9-9 19-2-8-8-2z"/>' },                 // seta de navegação
    idle:   { color: '#3B82F6', svg: '<path d="M5 11l1.5-4.5h11L19 11v5h-1v1a1 1 0 01-2 0v-1H7.5v1a1 1 0 01-2 0v-1h-1v-5zm2.2-3.3L6.4 10h11.2l-.8-2.3H7.2zM7 12.5a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4zm10 0a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z"/>' }, // carro
    alert:  { color: '#EF4444', svg: '<path d="M12 3l10 17H2L12 3z"/>' },                       // triângulo de alerta
    manutencao: { color: '#F59E0B', svg: '<path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3l4 4-2.7 2.7-4-4C.9 6.8 1.3 9.8 3.3 11.8c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2-2c.4-.4.4-1 0-1.4z"/>' }, // chave inglesa
};

/**
 * Miniatura compacta: se for uma URL pública do Supabase Storage, usa a
 * transformação de imagem (render/image) para baixar uma versão pequena/rápida.
 * Caso contrário, devolve a URL original.
 */
function thumbUrl(url: string | null | undefined, width = 96): string {
    if (!url) return '';
    if (url.includes('/storage/v1/object/public/')) {
        const base = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
        return `${base}${base.includes('?') ? '&' : '?'}width=${width}&height=${width}&resize=cover&quality=70`;
    }
    return url;
}

function createMarkerIcon(status: LiveVehicle['status'], photo?: string | null) {
    const s = STATUS_STYLE[status] ?? STATUS_STYLE.idle;
    const inner = photo
        ? `<img class="sgf-vmarker__img" src="${thumbUrl(photo, 72)}" loading="lazy"
              onerror="this.onerror=null;this.src='${photo}'" alt="" />`
        : `<svg width="15" height="15" viewBox="0 0 24 24" fill="#fff">${s.svg}</svg>`;
    return L.divIcon({
        className: 'sgf-vmarker-wrap',
        html: `
          <div class="sgf-vmarker sgf-vmarker--${status}" style="--mk:${s.color}">
            <span class="sgf-vmarker__pulse"></span>
            <div class="sgf-vmarker__dot">${inner}</div>
          </div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
    });
}

const DEFAULT_CENTER: [number, number] = [-15.7939, -47.8828];
const getBadgeVariant = (status: string): any => (status === 'manutencao' ? 'warning' : status);
const STATUS_LABEL: Record<LiveVehicle['status'], string> = {
    moving: 'Em movimento',
    idle: 'Parado',
    alert: 'Alerta',
    manutencao: 'Em manutenção',
};

/** "2h 15min" desde o início da viagem. */
function elapsedSince(iso: string | null): string {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(ms) || ms < 0) return '—';
    const min = Math.floor(ms / 60000);
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

// Conteúdo do card (reaproveitado no hover e no modal).
function VehicleCardBody({ v }: { v: LiveVehicle }) {
    return (
        <>
            <div className="relative h-28 w-full bg-slate-100">
                {v.photo ? (
                    <img src={thumbUrl(v.photo, 360)} onError={(e) => { const t = e.currentTarget; t.onerror = null; t.src = v.photo!; }} alt={v.vehicleModel} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-300">
                        <Car className="h-10 w-10" />
                    </div>
                )}
                <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur-sm">
                    {v.status === 'manutencao' ? 'Oficina' : `${v.speed} km/h`}
                </span>
            </div>
            <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-bold text-slate-900">{v.vehicleModel}</p>
                    <SGFBadge variant={getBadgeVariant(v.status)} size="sm">
                        {STATUS_LABEL[v.status]}
                    </SGFBadge>
                </div>
                <p className="mt-0.5 font-mono text-xs font-semibold tracking-wide text-slate-500">{v.plate}</p>
                <div className="mt-2 space-y-1.5">
                    {v.status === 'manutencao' ? (
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                            <Wrench className="h-3.5 w-3.5 text-amber-500" />
                            Em manutenção{v.repairShop ? ` — ${v.repairShop}` : ''}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                            <User className="h-3.5 w-3.5 text-slate-400" /> {v.driver}
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" /> {v.department}
                    </div>
                </div>
            </div>
        </>
    );
}

export default function MapPage() {
    const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [mobileView, setMobileView] = useState<'map' | 'list'>('map');
    const { setTitle, setDescription, setSearchPlaceholder, setSearchHandler } = useHeader();

    const queryClient = useQueryClient();
    const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { data: vehicles = [], isLoading } = useQuery({
        queryKey: ['map', 'live-vehicles'],
        queryFn: () => mapApi.getLiveVehicles(),
        // Realtime cuida da atualização instantânea; este intervalo é rede de segurança
        // (garante atualização automática mesmo se o realtime oscilar) e roda em background.
        refetchInterval: 15_000,
        refetchIntervalInBackground: true,
    });

    // Realtime: qualquer mudança em live_positions (viagem iniciou / veículo se moveu /
    // viagem encerrou) atualiza o mapa SEM recarregar a página. Debounce p/ coalescer rajadas.
    useEffect(() => {
        const topic = 'map:live-positions';
        for (const ch of supabase.getChannels()) {
            if (ch.topic === `realtime:${topic}`) supabase.removeChannel(ch);
        }
        const scheduleRefetch = () => {
            if (refetchTimer.current) return;
            refetchTimer.current = setTimeout(() => {
                refetchTimer.current = null;
                queryClient.invalidateQueries({ queryKey: ['map', 'live-vehicles'] });
            }, 1200);
        };
        const channel = supabase.channel(topic);
        channel
            // viagem iniciou/encerrou
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, scheduleRefetch)
            // veículo se moveu (sinal contínuo de GPS) — gatilho mais confiável
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trip_locations' }, scheduleRefetch)
            // posição atual por motorista (backup)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'live_positions' }, scheduleRefetch)
            // sinal contínuo do hardware (rastreadores IOPGPS), mesmo sem viagem
            .on('postgres_changes', { event: '*', schema: 'public', table: 'device_status' }, scheduleRefetch);
        channel.subscribe();
        return () => {
            if (refetchTimer.current) clearTimeout(refetchTimer.current);
            refetchTimer.current = null;
            supabase.removeChannel(channel);
        };
    }, [queryClient]);

    useEffect(() => {
        setTitle('Mapa');
        setDescription('Localização dos veículos em operação, atualizada em tempo real.');
        setSearchPlaceholder('Pesquisar veículo ou motorista...');
        setSearchHandler((term: string) => setSearchTerm(term));
        return () => { setSearchHandler(() => { }); };
    }, [setTitle, setDescription, setSearchPlaceholder, setSearchHandler]);

    const filteredVehicles = vehicles.filter((v) => {
        const matchesSearch =
            v.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
            v.driver.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const statusCounts = vehicles.reduce((acc, v) => {
        acc[v.status] = (acc[v.status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const active = selectedVehicle ? vehicles.find((v) => v.id === selectedVehicle) ?? null : null;

    // Só entram no mapa (marcador) veículos com posição conhecida; em manutenção sem
    // rastreador ainda aparecem na lista/contadores, só não têm marcador.
    const mappableVehicles = filteredVehicles.filter((v): v is LiveVehicle & { lat: number; lng: number } => v.lat != null && v.lng != null);
    const mapCenter = mappableVehicles[0] ? [mappableVehicles[0].lat, mappableVehicles[0].lng] as [number, number] : DEFAULT_CENTER;

    return (
        <div className="flex flex-col h-[calc(100dvh-11rem)] min-h-[420px] gap-3 overflow-hidden">
            {/* Estilos dos marcadores animados + tooltip-card */}
            <style>{`
              .sgf-vmarker { position: relative; width: 38px; height: 38px; display:flex; align-items:center; justify-content:center; cursor:pointer; }
              .sgf-vmarker__dot { width:34px; height:34px; border-radius:9999px; display:flex; align-items:center; justify-content:center; overflow:hidden; border:3px solid var(--mk); background:var(--mk); box-shadow:0 2px 8px rgba(0,0,0,.35), 0 0 14px color-mix(in srgb, var(--mk) 55%, transparent); transition: transform .18s ease; }
              .sgf-vmarker__img { width:100%; height:100%; object-fit:cover; border-radius:9999px; display:block; }
              .sgf-vmarker:hover .sgf-vmarker__dot { transform: scale(1.3); }
              .sgf-vmarker__pulse { position:absolute; width:38px; height:38px; border-radius:9999px; border:2.5px solid var(--mk); opacity:0; pointer-events:none; }
              .sgf-vmarker--moving .sgf-vmarker__pulse { animation: sgfvpulse 1.9s ease-out infinite; }
              .sgf-vmarker--alert .sgf-vmarker__pulse { animation: sgfvpulse 1.3s ease-out infinite; }
              @keyframes sgfvpulse { 0%{transform:scale(.9);opacity:.6} 100%{transform:scale(2);opacity:0} }
              .leaflet-tooltip.sgf-vtip { background:transparent !important; border:none !important; box-shadow:none !important; padding:0 !important; }
              .leaflet-tooltip.sgf-vtip::before { display:none !important; }
            `}</style>

            {/* Alternador Mapa / Lista — só no mobile */}
            <div className="flex shrink-0 gap-1.5 rounded-full bg-white border border-slate-200 p-1 lg:hidden">
                {([['map', 'Mapa'], ['list', `Lista (${filteredVehicles.length})`]] as const).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setMobileView(key)}
                        className={'flex-1 rounded-full py-1.5 text-sm font-semibold transition ' + (mobileView === key ? 'bg-emerald-500 text-white' : 'text-slate-500')}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
                {/* Sidebar */}
                <SGFCard
                    className={(mobileView === 'list' ? 'flex' : 'hidden') + ' lg:flex w-full lg:w-80 flex-shrink-0 flex-col p-0 overflow-hidden'}
                    padding="none"
                >
                    <div className="p-4 flex flex-col gap-3">
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

                        <div className="grid w-full grid-cols-5 gap-1 rounded-xl bg-slate-100/50 p-1">
                            {[
                                { value: 'all', label: 'Todos', count: vehicles.length },
                                { value: 'moving', label: 'Movim.', count: statusCounts.moving || 0 },
                                { value: 'idle', label: 'Parado', count: statusCounts.idle || 0 },
                                { value: 'alert', label: 'Alerta', count: statusCounts.alert || 0 },
                                { value: 'manutencao', label: 'Manut.', count: statusCounts.manutencao || 0 },
                            ].map((t) => {
                                const isActive = statusFilter === t.value;
                                return (
                                    <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => setStatusFilter(t.value)}
                                        className={'flex flex-col items-center justify-center rounded-lg py-1.5 transition-all ' + (isActive ? 'bg-[#00A86B] text-white shadow-sm' : 'text-slate-500 hover:bg-white')}
                                    >
                                        <span className="text-sm font-bold leading-none">{t.count}</span>
                                        <span className={'mt-0.5 text-[10px] font-medium leading-none ' + (isActive ? 'text-white/80' : 'text-slate-400')}>{t.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                        {isLoading && <p className="px-3 py-8 text-center text-sm text-slate-400">Carregando veículos…</p>}
                        {!isLoading && filteredVehicles.length === 0 && (
                            <p className="px-3 py-8 text-center text-sm text-slate-400">Nenhum veículo com rastreador ativo no momento.</p>
                        )}
                        {filteredVehicles.map((vehicle) => {
                            const isOn = hoveredId === vehicle.id || selectedVehicle === vehicle.id;
                            return (
                                <div
                                    key={vehicle.id}
                                    onClick={() => setSelectedVehicle(vehicle.id)}
                                    onMouseEnter={() => setHoveredId(vehicle.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                    className={cn(
                                        'p-3 rounded-2xl border cursor-pointer transition-all',
                                        isOn
                                            ? 'border-[var(--sgf-primary)] bg-[var(--sgf-primary)]/5 shadow-sm'
                                            : 'border-transparent bg-slate-50 hover:border-[var(--sgf-primary)]/40'
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className={cn(
                                                'w-10 h-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden ring-2',
                                                vehicle.status === 'moving' && 'bg-emerald-100 text-emerald-600 ring-emerald-300',
                                                vehicle.status === 'idle' && 'bg-blue-100 text-blue-600 ring-blue-300',
                                                vehicle.status === 'alert' && 'bg-red-100 text-red-600 ring-red-300',
                                                vehicle.status === 'manutencao' && 'bg-amber-100 text-amber-600 ring-amber-300'
                                            )}
                                        >
                                            {vehicle.photo ? (
                                                <img
                                                    src={thumbUrl(vehicle.photo, 96)}
                                                    onError={(e) => { const t = e.currentTarget; t.onerror = null; t.src = vehicle.photo!; }}
                                                    alt={vehicle.plate}
                                                    loading="lazy"
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : vehicle.status === 'moving' ? (
                                                <Navigation className="h-5 w-5" />
                                            ) : vehicle.status === 'alert' ? (
                                                <AlertTriangle className="h-5 w-5" />
                                            ) : vehicle.status === 'manutencao' ? (
                                                <Wrench className="h-5 w-5" />
                                            ) : (
                                                <Car className="h-5 w-5" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-sm text-gray-900">{vehicle.plate}</p>
                                            <p className="text-xs text-gray-500 truncate">
                                                {vehicle.status === 'manutencao' ? (vehicle.repairShop || 'Em manutenção') : vehicle.driver}
                                            </p>
                                        </div>
                                        <SGFBadge variant={getBadgeVariant(vehicle.status)} size="sm">
                                            {vehicle.status === 'manutencao' ? 'Manutenção' : vehicle.speed > 0 ? `${vehicle.speed} km/h` : '0 km/h'}
                                        </SGFBadge>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </SGFCard>

                {/* Map */}
                <SGFCard
                    className={(mobileView === 'map' ? 'flex' : 'hidden') + ' lg:flex flex-1 flex-col overflow-hidden p-0 h-full'}
                    padding="none"
                >
                    <MapContainer
                        key={mappableVehicles.length > 0 ? 'loaded' : 'empty'}
                        center={mapCenter}
                        zoom={mappableVehicles[0] ? 13 : 4}
                        style={{ height: '100%', width: '100%' }}
                        className="h-full w-full"
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        {mappableVehicles.map((vehicle) => (
                            <Marker
                                key={vehicle.id}
                                position={[vehicle.lat, vehicle.lng]}
                                icon={createMarkerIcon(vehicle.status, vehicle.photo)}
                                eventHandlers={{
                                    click: () => setSelectedVehicle(vehicle.id),
                                    mouseover: () => setHoveredId(vehicle.id),
                                    mouseout: () => setHoveredId(null),
                                }}
                            >
                                <Tooltip direction="top" offset={[0, -18]} opacity={1} className="sgf-vtip">
                                    <div className="w-56 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80">
                                        <VehicleCardBody v={vehicle} />
                                    </div>
                                </Tooltip>
                            </Marker>
                        ))}
                    </MapContainer>
                </SGFCard>
            </div>

            {/* Modal de detalhes da viagem (ao clicar) */}
            <Modal
                isOpen={!!active}
                onClose={() => setSelectedVehicle(null)}
                title={active ? `${active.vehicleModel} • ${active.plate}` : ''}
                size="md"
            >
                {active && (
                    <div className="space-y-4">
                        <div className="overflow-hidden rounded-2xl border border-slate-200">
                            <VehicleCardBody v={active} />
                        </div>

                        {active.status === 'manutencao' ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                <div className="flex items-center gap-1.5 text-amber-500">
                                    <Wrench className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-bold uppercase tracking-[0.12em]">Em manutenção</span>
                                </div>
                                <p className="mt-1.5 text-sm font-semibold text-amber-900">
                                    {active.repairShop ? `Oficina: ${active.repairShop}` : 'Oficina ainda não informada'}
                                </p>
                            </div>
                        ) : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                                <div className="flex items-center gap-1.5 text-slate-400">
                                    <Clock className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-bold uppercase tracking-[0.12em]">Início</span>
                                </div>
                                <p className="mt-1.5 text-sm font-semibold text-slate-800">{formatDateTime(active.startAt)}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                                <div className="flex items-center gap-1.5 text-slate-400">
                                    <Clock className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-bold uppercase tracking-[0.12em]">Tempo</span>
                                </div>
                                <p className="mt-1.5 text-sm font-semibold text-slate-800">{elapsedSince(active.startAt)}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                                <div className="flex items-center gap-1.5 text-slate-400">
                                    <MapPin className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-bold uppercase tracking-[0.12em]">Destino</span>
                                </div>
                                <p className="mt-1.5 truncate text-sm font-semibold text-slate-800" title={active.destination}>{active.destination}</p>
                            </div>
                        </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
}
