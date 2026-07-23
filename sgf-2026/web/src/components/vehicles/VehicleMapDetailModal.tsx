import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/ui/Modal';
import {
    Car,
    User,
    Building2,
    MapPin,
    Clock,
    Timer,
    Wrench,
    Gauge,
    Navigation,
    ArrowRight,
    Activity,
    AlertTriangle,
} from '@/components/sgf/icons';
import { formatDateTime } from '@/lib/utils';
import type { LiveVehicle } from '@/lib/supabase-api';

interface VehicleMapDetailModalProps {
    vehicle: LiveVehicle | null;
    isOpen: boolean;
    onClose: () => void;
    onFocusMap?: (lat: number, lng: number) => void;
}

const STATUS_CONFIG: Record<
    LiveVehicle['status'],
    {
        label: string;
        variant: 'moving' | 'idle' | 'alert' | 'warning';
        dotColor: string;
    }
> = {
    moving: {
        label: 'Em movimento',
        variant: 'moving',
        dotColor: '#22C55E',
    },
    idle: {
        label: 'Parado',
        variant: 'idle',
        dotColor: '#3B82F6',
    },
    alert: {
        label: 'Alerta / Sinal Ausente',
        variant: 'alert',
        dotColor: '#EF4444',
    },
    manutencao: {
        label: 'Em manutenção',
        variant: 'warning',
        dotColor: '#F59E0B',
    },
};

function elapsedSince(iso: string | null): string {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(ms) || ms < 0) return '—';
    const min = Math.floor(ms / 60000);
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (min < 1) return 'poucos segundos';
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function getMinutesDiff(iso: string | null): number {
    if (!iso) return 0;
    const ms = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(ms) || ms < 0) return 0;
    return Math.floor(ms / 60000);
}

function thumbUrl(url: string | null | undefined, width = 800): string {
    if (!url) return '';
    if (url.includes('/storage/v1/object/public/')) {
        const base = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
        return `${base}${base.includes('?') ? '&' : '?'}width=${width}&height=360&resize=cover&quality=85`;
    }
    return url;
}

export function VehicleMapDetailModal({
    vehicle,
    isOpen,
    onClose,
    onFocusMap,
}: VehicleMapDetailModalProps) {
    const navigate = useNavigate();

    if (!vehicle) return null;

    const isOnline = vehicle.online !== false;
    const isIgnitionOn = vehicle.ignition === true;
    const statusInfo = STATUS_CONFIG[vehicle.status] ?? STATUS_CONFIG.idle;
    const isMaintenance = vehicle.status === 'manutencao';
    const isMoving = vehicle.status === 'moving';
    const isIdle = vehicle.status === 'idle';
    const isAlert = vehicle.status === 'alert';
    const hasActiveTrip = Boolean(vehicle.tripId || (vehicle.driver && vehicle.driver !== 'Sem viagem ativa' && vehicle.driver !== 'Em manutenção'));

    // Cálculo do tempo parado (baseado no último sinal GPS recordedAt ou startAt)
    const stoppedIso = vehicle.recordedAt || vehicle.startAt;
    const stoppedTimeText = elapsedSince(stoppedIso);
    const stoppedMinutes = getMinutesDiff(stoppedIso);
    const isLongIdle = isIdle && stoppedMinutes >= 30; // Alerta de inatividade > 30 min

    const handleNavigateDetails = () => {
        onClose();
        navigate(`/veiculos/${vehicle.id}`);
    };

    const handleFocusMap = () => {
        if (vehicle.lat != null && vehicle.lng != null && onFocusMap) {
            onFocusMap(vehicle.lat, vehicle.lng);
        }
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} showCloseButton={false} size="md">
            <div className="-m-[var(--sgf-modal-padding)] overflow-hidden rounded-[var(--sgf-modal-radius)] bg-white text-slate-900 shadow-2xl">
                {/* ════════════════════════════════════════════════════════════════ */}
                {/* HERO BANNER (Foto Nítida + Status GPS Online/Offline da IOPGPS) */}
                {/* ════════════════════════════════════════════════════════════════ */}
                <div className="relative overflow-hidden bg-[#0F2B2F]">
                    {/* Header Bar Superior */}
                    <div className="relative z-20 flex items-center justify-between p-3.5 bg-[#0F2B2F] text-white border-b border-white/10">
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-emerald-300 backdrop-blur-md border border-white/15 shadow-sm">
                            <Building2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            <span className="truncate max-w-[180px] sm:max-w-[220px]">{vehicle.department}</span>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Pílula de Status do GPS (IOPGPS): ONLINE / OFFLINE */}
                            <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold backdrop-blur-md border shadow-sm ${
                                isOnline
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                    : 'bg-red-500/20 text-red-300 border-red-500/30'
                            }`}>
                                <span className="relative flex h-2 w-2">
                                    {isOnline && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
                                    <span className={`relative inline-flex rounded-full h-2 w-2 ${isOnline ? 'bg-emerald-400' : 'bg-red-500'}`} />
                                </span>
                                <span>{isOnline ? 'GPS Online' : 'GPS Offline'}</span>
                            </div>

                            {/* Pílula de Velocidade */}
                            <div className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white backdrop-blur-md border border-white/10 shadow-sm">
                                <Gauge className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                <span>{isMaintenance ? 'Oficina' : `${vehicle.speed} km/h`}</span>
                            </div>

                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-full bg-white/10 p-1.5 text-white/80 hover:bg-white/20 hover:text-white backdrop-blur-md transition-all border border-white/15 cursor-pointer"
                                aria-label="Fechar"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Foto do Veículo (Clara e Visível) */}
                    <div className="relative h-52 sm:h-60 w-full bg-slate-900 overflow-hidden">
                        {vehicle.photo ? (
                            <>
                                <img
                                    src={thumbUrl(vehicle.photo)}
                                    onError={(e) => {
                                        const t = e.currentTarget;
                                        t.onerror = null;
                                        t.src = vehicle.photo!;
                                    }}
                                    alt={vehicle.vehicleModel}
                                    className="h-full w-full object-cover opacity-100 transition-transform duration-500 hover:scale-105"
                                />
                                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0F2B2F] via-[#0F2B2F]/60 to-transparent pointer-events-none" />
                            </>
                        ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#143D43] via-[#0F2B2F] to-[#0A1D20] text-white/20">
                                <Car className="h-20 w-20" />
                            </div>
                        )}

                        {/* Textos sobrepostos no rodapé */}
                        <div className="absolute inset-x-0 bottom-0 z-10 p-4 flex items-end justify-between gap-3">
                            <div>
                                <h3 className="text-2xl font-black tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                                    {vehicle.vehicleModel}
                                </h3>

                                {/* Placa Mercosul */}
                                <div className="mt-1.5 inline-flex items-center rounded border border-slate-700 bg-white font-mono shadow-lg overflow-hidden">
                                    <span className="bg-[#002776] px-2 py-0.5 text-[9px] font-extrabold uppercase text-white tracking-widest">
                                        BR
                                    </span>
                                    <span className="px-2.5 py-0.5 text-xs font-black tracking-widest text-slate-900 uppercase">
                                        {vehicle.plate}
                                    </span>
                                </div>
                            </div>

                            {/* Badge de Status Vivo com Pulso */}
                            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur-md border border-white/20 bg-black/65 text-white shadow-xl">
                                <span className="relative flex h-2.5 w-2.5">
                                    {(isMoving || isAlert) && (
                                        <span
                                            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                                            style={{ backgroundColor: statusInfo.dotColor }}
                                        />
                                    )}
                                    <span
                                        className="relative inline-flex rounded-full h-2.5 w-2.5"
                                        style={{ backgroundColor: statusInfo.dotColor }}
                                    />
                                </span>
                                <span>
                                    {!isOnline
                                        ? 'GPS Offline'
                                        : isIdle
                                        ? `Parado há ${stoppedTimeText}`
                                        : statusInfo.label}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ════════════════════════════════════════════════════════════════ */}
                {/* CONTEÚDO: Motorista, Tempo Parado e Métricas de Operação         */}
                {/* ════════════════════════════════════════════════════════════════ */}
                <div className="p-5 space-y-4 bg-[#F5F7F9]">
                    {/* Alerta se o GPS estiver offline ou inativo */}
                    {!isOnline && (
                        <div className="flex items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-900 shadow-sm">
                            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                            <span>Atenção: Rastreador IOPGPS sem sinal de comunicação (Offline).</span>
                        </div>
                    )}

                    {/* Alerta se estiver parado a mais de 30 minutos */}
                    {isLongIdle && isOnline && (
                        <div className="flex items-center gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900 shadow-sm">
                            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                            <span>Atenção: Veículo parado sem movimentação há <strong>{stoppedTimeText}</strong>.</span>
                        </div>
                    )}

                    {/* Card do Motorista */}
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-sm">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#00A86B]/10 text-[#00A86B]">
                                <User className="h-6 w-6" />
                            </div>
                            <div className="min-w-0">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Motorista Responsável
                                </span>
                                <p className="truncate text-sm font-bold text-slate-900">
                                    {isMaintenance ? 'Veículo recolhido para oficina' : vehicle.driver}
                                </p>
                            </div>
                        </div>

                        {/* Pílula de estado */}
                        <div className="shrink-0">
                            {hasActiveTrip && !isMaintenance ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                                    <Activity className="h-3 w-3 text-emerald-500 animate-pulse" />
                                    Em Viagem
                                </span>
                            ) : (
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                    {isMaintenance ? 'Oficina' : 'Disponível'}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Card de Manutenção */}
                    {isMaintenance ? (
                        <div className="rounded-2xl border border-amber-200/90 bg-amber-50/80 p-4 shadow-sm">
                            <div className="flex items-center gap-2 text-amber-700">
                                <Wrench className="h-5 w-5 text-amber-500 shrink-0" />
                                <span className="text-xs font-bold uppercase tracking-wider">
                                    Manutenção em Andamento
                                </span>
                            </div>
                            <p className="mt-2 text-sm font-bold text-amber-950">
                                {vehicle.repairShop
                                    ? `Oficina responsável: ${vehicle.repairShop}`
                                    : 'Aguardando atualização de dados da oficina.'}
                            </p>
                        </div>
                    ) : (
                        /* Grid de Métricas (Início, Tempo Parado/Duração, Destino) */
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            {/* Card: Início */}
                            <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm transition-all hover:border-slate-300">
                                <div className="flex items-center gap-2 text-slate-400">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#00A86B]/10 text-[#00A86B]">
                                        <Clock className="h-4 w-4" />
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                        Início
                                    </span>
                                </div>
                                <p className="mt-2 text-xs font-semibold text-slate-900 truncate" title={formatDateTime(vehicle.startAt)}>
                                    {vehicle.startAt ? formatDateTime(vehicle.startAt) : 'Sem início registrado'}
                                </p>
                            </div>

                            {/* Card: Tempo Parado ou Duração */}
                            <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm transition-all hover:border-slate-300">
                                <div className="flex items-center gap-2 text-slate-400">
                                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                                        isIdle ? 'bg-blue-500/10 text-blue-600' : 'bg-emerald-500/10 text-[#00A86B]'
                                    }`}>
                                        <Timer className="h-4 w-4" />
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                        {isIdle ? 'Tempo Parado' : 'Tempo Decorrido'}
                                    </span>
                                </div>
                                <p className="mt-2 text-sm font-bold text-slate-900">
                                    {isIdle
                                        ? (stoppedTimeText !== '—' ? `Parado há ${stoppedTimeText}` : 'Parado recentemente')
                                        : elapsedSince(vehicle.startAt)}
                                </p>
                            </div>

                            {/* Card: Destino */}
                            <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm transition-all hover:border-slate-300">
                                <div className="flex items-center gap-2 text-slate-400">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-[#00A86B]">
                                        <MapPin className="h-4 w-4" />
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                        Destino
                                    </span>
                                </div>
                                <p
                                    className="mt-2 truncate text-xs font-semibold text-slate-900"
                                    title={vehicle.destination}
                                >
                                    {vehicle.destination && vehicle.destination !== '—'
                                        ? vehicle.destination
                                        : 'Nenhum destino informado'}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Rodapé com dados de conexão IOPGPS (Online/Offline + Ignição) */}
                    <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] font-medium text-slate-500 border-t border-slate-200/70 pt-3">
                        <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                                <strong className="font-bold text-slate-700">Rastreador IOPGPS:</strong>
                                <span className={isOnline ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                                    {isOnline ? 'ONLINE' : 'OFFLINE'}
                                </span>
                            </span>
                            {vehicle.ignition !== null && vehicle.ignition !== undefined && (
                                <span className="text-slate-400">• Ignição: <strong className={isIgnitionOn ? 'text-emerald-600 font-bold' : 'text-slate-600'}>{isIgnitionOn ? 'Ligada' : 'Desligada'}</strong></span>
                            )}
                        </div>
                        {vehicle.recordedAt && (
                            <span className="text-slate-400">Último sinal: {formatDateTime(vehicle.recordedAt)}</span>
                        )}
                    </div>
                </div>

                {/* ════════════════════════════════════════════════════════════════ */}
                {/* AÇÕES NO RODAPÉ                                                  */}
                {/* ════════════════════════════════════════════════════════════════ */}
                <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 bg-white p-4">
                    {/* Botão: Centralizar no mapa */}
                    {onFocusMap && vehicle.lat != null && vehicle.lng != null && (
                        <button
                            type="button"
                            onClick={handleFocusMap}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-400 active:scale-95 cursor-pointer"
                        >
                            <Navigation className="h-4 w-4 text-slate-500" />
                            <span>Centralizar no mapa</span>
                        </button>
                    )}

                    {/* Botão: Ficha do Veículo */}
                    <button
                        type="button"
                        onClick={handleNavigateDetails}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#00A86B] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-[#00A86B]/20 transition-all hover:bg-[#70C4A8] hover:shadow-lg active:scale-95 cursor-pointer"
                    >
                        <span>Ficha do Veículo</span>
                        <ArrowRight className="h-4 w-4 text-white" />
                    </button>
                </div>
            </div>
        </Modal>
    );
}

export default VehicleMapDetailModal;
