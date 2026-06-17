import React, { useMemo, useRef, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFTable, type SGFTableColumn } from '@/components/sgf/SGFTable';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import {
    ArrowLeft,
    Edit2,
    Phone,
    Mail,
    Loader2,
    FileText,
    Route,
    Gauge,
    Building2,
    Award,
    User,
    CalendarClock,
    LockKeyhole,
    Car,
} from '@/components/sgf/icons';
import { EditDriverModal } from '@/components/drivers/EditDriverModal';
import { DriverAccessForm } from '@/components/drivers/DriverAccessForm';
import { TripDetailsModal } from '@/components/trips/TripDetailsModal';
import { Modal } from '@/components/ui/Modal';
import type { Tables } from '@/types/database.types';
import { formatDate, formatDateTime, formatCPF, formatDistance, formatPhone, formatPlate } from '@/lib/utils';
import { differenceInDays, parseISO } from 'date-fns';
import { driversApi, tripsApi } from '@/lib/supabase-api';


function getInitials(name: string) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '–';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getLicenseStatus(expiryDate: string | null | undefined) {
    if (!expiryDate) return { label: 'Não cadastrada', variant: 'default' as const };
    const today = new Date();
    const expiry = parseISO(expiryDate);
    const daysUntilExpiry = differenceInDays(expiry, today);
    if (daysUntilExpiry < 0) return { label: 'Vencida', variant: 'error' as const };
    if (daysUntilExpiry <= 30) return { label: `Vence em ${daysUntilExpiry} dias`, variant: 'warning' as const };
    if (daysUntilExpiry <= 90) return { label: `Vence em ${daysUntilExpiry} dias`, variant: 'info' as const };
    return { label: 'Regular', variant: 'success' as const };
}

function getDuration(startAt: string, endAt: string | null | undefined): string {
    if (!endAt) return '—';
    const diff = new Date(endAt).getTime() - new Date(startAt).getTime();
    const minutes = Math.max(Math.round(diff / 60000), 0);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}min`;
    return `${hours}h ${mins}min`;
}

export default function DriverDetails() {
    const { id } = useParams<{ id: string }>();
    const location = useLocation();
    const backTo = (location.state as { backTo?: string } | null)?.backTo ?? '/motoristas';
    const [isEditOpen, setEditOpen] = useState(false);
    const [isResetOpen, setResetOpen] = useState(false);
    const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
    const tabsRef = useRef<HTMLDivElement>(null);

    const { data: driver, isLoading, isError } = useQuery({
        queryKey: ['driver', id],
        queryFn: () => driversApi.getById(id!),
        enabled: Boolean(id),
    });

    const { data: trips = [] } = useQuery({
        queryKey: ['driver', id, 'trips'],
        queryFn: () => tripsApi.getAll({ driverId: id, limit: 50 }),
        enabled: Boolean(id),
    });

    const totalKm = useMemo(
        () => trips.reduce((s, t) => s + (Number((t as { distance_km: number | null }).distance_km) || 0), 0),
        [trips],
    );

    type TripRow = (typeof trips)[number] & {
        start_at: string;
        start_odometer: number | null;
        end_odometer: number | null;
        distance_km: number | null;
        destination: string;
        vehicles?: { id: string; plate: string; brand: string; model: string; photo_url: string | null } | null;
    };

    const tripColumns: SGFTableColumn<TripRow>[] = [
        { header: 'Início', accessor: (r) => `${formatDate(r.start_at)} - ${formatDate(r.start_at, 'HH:mm')}` },
        { header: 'Fim', accessor: (r) => r.end_at ? `${formatDate(r.end_at)} - ${formatDate(r.end_at, 'HH:mm')}` : '—' },
        { header: 'Duração', accessor: (r) => getDuration(r.start_at, r.end_at) },
        {
            header: 'Veículo',
            accessor: (r) => {
                const brand = r.vehicles?.brand || '';
                const model = r.vehicles?.model || '';
                const name = [brand, model].filter(Boolean).join(' ') || '—';
                const photo = r.vehicles?.photo_url;
                return (
                    <div className="flex items-center gap-2.5">
                        {photo ? (
                            <img src={photo} alt={name} className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />
                        ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sgf-primary)]/10 text-[var(--sgf-primary)]">
                                <Car className="h-4 w-4" />
                            </div>
                        )}
                        <span className="font-semibold text-slate-800 text-sm">{name}</span>
                    </div>
                );
            },
        },
        {
            header: 'Placa',
            accessor: (r) => <span className="font-mono">{r.vehicles?.plate ? formatPlate(r.vehicles.plate) : '—'}</span>,
        },
        { header: 'Km Inicial', accessor: (r) => r.start_odometer != null ? r.start_odometer.toLocaleString('pt-BR') : '—' },
        { header: 'Km Final', accessor: (r) => r.end_odometer != null ? r.end_odometer.toLocaleString('pt-BR') : '—' },
        { header: 'Distância', accessor: (r) => r.distance_km != null ? formatDistance(Number(r.distance_km)) : '—' },
        { header: 'Destino', accessor: (r) => r.destination ?? '—' },
    ];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            </div>
        );
    }
    if (isError || !driver) {
        return (
            <div className="space-y-4">
                <Link to={backTo}>
                    <SGFButton variant="ghost" size="sm" icon={ArrowLeft}><span className="hidden md:inline">Voltar</span></SGFButton>
                </Link>
                <SGFCard>
                    <p className="text-sm text-rose-600 font-medium">Motorista não encontrado.</p>
                </SGFCard>
            </div>
        );
    }

    const d = driver as unknown as {
        id: string;
        full_name: string;
        cpf: string | null;
        birth_date: string | null;
        must_change_password: boolean | null;
        email: string | null;
        phone: string | null;
        cnh_number: string | null;
        cnh_category: string | null;
        cnh_expiry: string | null;
        cnh_ear: boolean | null;
        registration_number: string | null;
        on_duty: boolean | null;
        shift_start: string | null;
        shift_end: string | null;
        created_at: string;
        score: number | null;
        photo_url: string | null;
        departments?: { id: string; name: string } | null;
    };

    const licenseStatus = getLicenseStatus(d.cnh_expiry);
    const departmentName = d.departments?.name ?? '—';
    const totalTrips = trips.length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <Link to={backTo} className="shrink-0">
                        <SGFButton variant="ghost" size="sm" icon={ArrowLeft}><span className="hidden md:inline">Voltar</span></SGFButton>
                    </Link>
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate flex items-center gap-2">
                            {d.full_name}
                            {d.on_duty ? <SGFBadge variant="info" size="sm">Em serviço</SGFBadge> : null}
                        </h1>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <SGFButton variant="secondary" icon={LockKeyhole} onClick={() => setResetOpen(true)} className="!h-[37px] !rounded-full">
                        <span className="hidden sm:inline">Gerar nova senha</span>
                    </SGFButton>
                    <SGFButton icon={Edit2} onClick={() => setEditOpen(true)} className="!h-[37px] !rounded-full">
                        <span className="hidden sm:inline">Editar</span>
                    </SGFButton>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                {[
                    { icon: Route, color: 'text-emerald-600', bg: 'bg-emerald-50', value: String(totalTrips), label: 'Viagens totais' },
                    { icon: Gauge, color: 'text-blue-600', bg: 'bg-blue-50', value: formatDistance(totalKm), label: 'Km percorridos' },
                    { icon: Award, color: 'text-amber-600', bg: 'bg-amber-50', value: d.score != null ? `${d.score}` : '—', label: 'Pontuação' },
                    { icon: Building2, color: 'text-purple-600', bg: 'bg-purple-50', value: departmentName, label: 'Secretaria' },
                ].map((stat) => {
                    const StatIcon = stat.icon;
                    return (
                        <SGFCard key={stat.label} padding="sm">
                            <div className="flex items-center gap-3">
                                <div className={`p-2.5 rounded-xl ${stat.bg}`}>
                                    <StatIcon className={`h-5 w-5 ${stat.color}`} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xl font-bold text-slate-900 truncate">{stat.value}</p>
                                    <p className="text-sm text-slate-500 truncate">{stat.label}</p>
                                </div>
                            </div>
                        </SGFCard>
                    );
                })}
            </div>

            {/* Tabs */}
            <div ref={tabsRef} className="scroll-mt-28 w-full">
            <Tabs
                defaultValue="info"
                className="w-full"
                onValueChange={() => {
                    setTimeout(() => {
                        tabsRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }, 50);
                }}
            >
                <TabsList className="grid w-full grid-cols-2 lg:w-[300px] mx-auto bg-slate-100/50 p-1 rounded-xl">
                    <TabsTrigger value="info" className="rounded-lg data-[state=active]:bg-[#00A86B] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all">Info</TabsTrigger>
                    <TabsTrigger value="trips" className="rounded-lg data-[state=active]:bg-[#00A86B] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all">Viagens</TabsTrigger>
                </TabsList>

                <TabsContent value="info">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                        {/* Coluna esquerda: Foto + Categoria/Validade */}
                        <div className="lg:col-span-1">
                            <SGFCard>
                                <div className="space-y-6">
                                    <div className="aspect-[4/3] w-full bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center overflow-hidden shadow-inner">
                                        {d.photo_url ? (
                                            <img
                                                src={d.photo_url}
                                                alt={d.full_name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex flex-col items-center justify-center text-slate-200">
                                                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-2xl font-bold text-emerald-500">
                                                    {getInitials(d.full_name)}
                                                </div>
                                                <p className="mt-4 text-sm font-medium text-slate-400">Sem foto disponível</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-slate-100 rounded-2xl border border-slate-200 text-center">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-[0.1em] font-bold mb-1">Categoria</p>
                                            <p className="text-xl font-black text-[#0F2B2F]">{d.cnh_category ?? '—'}</p>
                                        </div>
                                        <div className="p-4 bg-slate-100 rounded-2xl border border-slate-200 text-center flex flex-col justify-center">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-[0.1em] font-bold mb-1">Validade</p>
                                            <p className="text-sm font-black text-[#0F2B2F] tabular-nums">{d.cnh_expiry ? formatDate(d.cnh_expiry) : '—'}</p>
                                        </div>
                                    </div>
                                </div>
                            </SGFCard>
                        </div>

                        {/* Coluna meio: Dados Pessoais */}
                        <div className="lg:col-span-1">
                            <SGFCard title="Dados Pessoais" icon={User}>
                                <div className="space-y-1">
                                    {[
                                        { label: 'Nome completo', value: d.full_name },
                                        { label: 'CPF', value: formatCPF(d.cpf) || '—' },
                                        { label: 'Nascimento', value: d.birth_date ? formatDate(d.birth_date) : '—', icon: CalendarClock },
                                        { label: 'Telefone', value: formatPhone(d.phone) || '—', icon: Phone },
                                        { label: 'E-mail', value: d.email ?? '—', icon: Mail },
                                        { label: 'Matrícula', value: d.registration_number ?? '—' },
                                        {
                                            label: 'Acesso ao app',
                                            value: d.must_change_password
                                                ? <SGFBadge variant="warning" size="sm">Aguardando 1º acesso</SGFBadge>
                                                : <SGFBadge variant="success" size="sm">Acesso ativo</SGFBadge>
                                        },
                                    ].map((item) => {
                                        const ItemIcon = item.icon;
                                        return (
                                            <div key={item.label} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                                                <span className="text-sm text-slate-500 font-medium">{item.label}</span>
                                                <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900 text-right">
                                                    {ItemIcon && <ItemIcon className="h-3.5 w-3.5 text-slate-400" />}
                                                    {item.value}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </SGFCard>
                        </div>

                        {/* Coluna direita: Habilitação e Vínculo */}
                        <div className="lg:col-span-1">
                            <SGFCard title="Habilitação e Vínculo" icon={FileText}>
                                <div className="space-y-1">
                                    {[
                                        { label: 'Nº CNH', value: d.cnh_number ?? '—', isMono: true },
                                        { label: 'Categoria', value: d.cnh_category ?? '—' },
                                        {
                                            label: 'Validade',
                                            value: (
                                                <span className="flex items-center justify-end gap-2">
                                                    <SGFBadge variant={licenseStatus.variant} size="sm">{licenseStatus.label}</SGFBadge>
                                                    <span>{d.cnh_expiry ? formatDate(d.cnh_expiry) : '—'}</span>
                                                </span>
                                            )
                                        },
                                        { label: 'EAR', value: d.cnh_ear ? 'Sim' : 'Não' },
                                        { label: 'Secretaria', value: departmentName },
                                        {
                                            label: 'Turno',
                                            value: d.shift_start && d.shift_end
                                                ? `${d.shift_start.slice(0, 5)} — ${d.shift_end.slice(0, 5)}`
                                                : '—',
                                        },
                                        { label: 'Cadastrado em', value: formatDate(d.created_at) },
                                    ].map((item) => (
                                        <div key={item.label} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                                            <span className="text-sm text-slate-500 font-medium">{item.label}</span>
                                            <span className={`text-sm font-bold text-slate-900 text-right ${item.isMono ? 'font-mono text-xs' : ''}`}>{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </SGFCard>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="trips">
                    {/* Cards (mobile) — design dedicado de viagens */}
                    <div className="space-y-3 md:hidden">
                        {trips.length === 0 ? (
                            <div className="rounded-[18px] bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
                                Nenhuma viagem registrada para este motorista.
                            </div>
                        ) : (
                            trips.map((row) => {
                                const trip = row as unknown as TripRow;
                                
                                return (
                                    <div
                                        key={trip.id}
                                        onClick={() => setSelectedTripId(trip.id)}
                                        className="relative flex cursor-pointer items-center gap-3.5 overflow-hidden rounded-[18px] bg-white py-3.5 pl-4 pr-3.5 text-[#2F2F2F] shadow-sm transition-all duration-150 active:scale-[0.98] active:bg-slate-50"
                                    >
                                        <div className="flex h-[62px] w-[62px] shrink-0 flex-col items-center justify-center rounded-[14px] bg-[#E0E8E6] text-[#0F2B2F]">
                                            <span className="text-[17px] font-black leading-none">
                                                {trip.distance_km != null ? Math.round(Number(trip.distance_km)) : '—'}
                                            </span>
                                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">km</span>
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="min-w-0 truncate text-[16px] font-bold leading-tight">
                                                    {trip.destination || 'Sem destino'}
                                                </p>
                                                <span className="shrink-0 text-[11px] font-bold text-slate-400">
                                                    {formatDate(trip.start_at)}
                                                </span>
                                            </div>
                                            <div className="mt-1.5 grid grid-cols-2 text-[13.5px] leading-snug">
                                                <div className="space-y-0.5 pr-3">
                                                    <p className="truncate text-slate-700 font-semibold text-[13.5px]">
                                                        {trip.vehicles ? `${trip.vehicles.brand} ${trip.vehicles.model}` : 'Veículo não informado'}
                                                    </p>
                                                    <p className="truncate font-mono text-[12px] text-slate-400">
                                                        {trip.vehicles?.plate ? formatPlate(trip.vehicles.plate) : '—'}
                                                    </p>
                                                </div>
                                                <div className="space-y-0.5 border-l border-slate-200 pl-3">
                                                    <p className="truncate text-slate-600">
                                                        Ini: {trip.start_odometer != null ? trip.start_odometer.toLocaleString('pt-BR') : '—'}
                                                    </p>
                                                    <p className="truncate text-slate-600">
                                                        Fim: {trip.end_odometer != null ? trip.end_odometer.toLocaleString('pt-BR') : '—'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Tabela (desktop) */}
                    <div className="-mx-4 hidden md:mx-0 md:block">
                        <SGFTable
                            columns={tripColumns}
                            data={trips as unknown as TripRow[]}
                            keyExtractor={(r) => r.id}
                            onRowClick={(r) => setSelectedTripId(r.id)}
                            emptyMessage="Nenhuma viagem registrada para este motorista."
                        />
                    </div>
                </TabsContent>
            </Tabs>
            </div>

            <TripDetailsModal tripId={selectedTripId} onClose={() => setSelectedTripId(null)} />

            <EditDriverModal
                isOpen={isEditOpen}
                onClose={() => setEditOpen(false)}
                driver={driver as unknown as Tables<'profiles'>}
            />

            <Modal
                isOpen={isResetOpen}
                onClose={() => setResetOpen(false)}
                title="Gerar nova senha"
                description="Defina uma nova senha de acesso para este motorista."
                size="md"
            >
                <DriverAccessForm
                    driver={driver}
                    mode="reset"
                    onSuccess={() => setResetOpen(false)}
                    onCancel={() => setResetOpen(false)}
                />
            </Modal>
        </div>
    );
}
