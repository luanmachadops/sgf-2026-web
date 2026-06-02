import React, { useRef, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFTable, type SGFTableColumn } from '@/components/sgf/SGFTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import {
    ArrowLeft,
    Edit2,
    Fuel,
    Directions,
    DocumentText,
    FileText,
    Gauge,
    Car,
    Camera,
    ArrowSync,
    Building2,
    Loader2,
    Route,
    Download,
} from '@/components/sgf/icons';
import { EditVehicleModal } from '@/components/vehicles/EditVehicleModal';
import { formatDate, formatDistance, formatCurrency, formatPlate, getStatusLabel, getStatusColor } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import {
    vehiclesApi,
    tripsApi,
    refuelingsApi,
    maintenancesApi,
} from '@/lib/supabase-api';
import { resizeAndConvertToWebP, isImageFile } from '@/lib/imageUtils';
import { toast } from 'sonner';
import type { Tables } from '@/types/database.types';

const FUEL_LABEL: Record<string, string> = {
    diesel: 'Diesel',
    gasolina: 'Gasolina',
    etanol: 'Etanol',
    flex: 'Flex',
};

type VehicleRow = Tables<'vehicles'> & {
    departments?: { id: string; name: string } | null;
    photo_url: string | null;
};

export default function VehicleDetails() {
    const { id } = useParams<{ id: string }>();
    const queryClient = useQueryClient();
    const [isUploading, setIsUploading] = useState(false);
    const [isEditOpen, setEditOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Veículo ────────────────────────────────────────────────────────────
    const { data: vehicle, isLoading: loadingVehicle, isError: errorVehicle } = useQuery({
        queryKey: ['vehicle', id],
        queryFn: () => vehiclesApi.getById(id!),
        enabled: Boolean(id),
    });

    // ── Viagens deste veículo ──────────────────────────────────────────────
    const { data: trips = [] } = useQuery({
        queryKey: ['vehicle', id, 'trips'],
        queryFn: () => tripsApi.getAll({ vehicleId: id, limit: 50 }),
        enabled: Boolean(id),
    });

    // ── Abastecimentos deste veículo ───────────────────────────────────────
    const { data: refuelings = [] } = useQuery({
        queryKey: ['vehicle', id, 'refuelings'],
        queryFn: () => refuelingsApi.getAll({ vehicleId: id, limit: 50 }),
        enabled: Boolean(id),
    });

    // ── Manutenções (OS) deste veículo ─────────────────────────────────────
    const { data: maintenances = [] } = useQuery({
        queryKey: ['vehicle', id, 'maintenances'],
        queryFn: () => maintenancesApi.getAll({ vehicleId: id, limit: 50 }),
        enabled: Boolean(id),
    });

    // ── Cálculos derivados ─────────────────────────────────────────────────
    const avgKmL = useMemo(() => {
        const ok = refuelings.filter((r) => r.km_per_liter && r.km_per_liter > 0);
        if (ok.length === 0) return 0;
        return ok.reduce((s, r) => s + Number(r.km_per_liter ?? 0), 0) / ok.length;
    }, [refuelings]);

    const tripsThisMonth = useMemo(() => {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        return trips.filter((t) => (t as { start_at: string }).start_at?.startsWith(monthKey)).length;
    }, [trips]);

    // ── Upload de foto ─────────────────────────────────────────────────────
    const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !vehicle) return;

        if (!isImageFile(file)) {
            toast.error('Por favor, selecione um arquivo de imagem válido');
            return;
        }

        try {
            setIsUploading(true);
            toast.info('Processando imagem...');

            const optimizedBlob = await resizeAndConvertToWebP(file, 1000);
            const fileName = `vehicles/${vehicle.id}-${Date.now()}.webp`;

            // Garante que a sessão (JWT) está válida e fresca antes do upload.
            // Resolve o race condition em que o storage client envia um header de auth stale.
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error('Sessão expirada. Faça login novamente.');
            }

            const { error: uploadError } = await supabase.storage
                .from('fotos')
                .upload(fileName, optimizedBlob, {
                    contentType: 'image/webp',
                    upsert: true,
                });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('fotos')
                .getPublicUrl(fileName);

            await vehiclesApi.updatePhoto(vehicle.id, publicUrl);
            await queryClient.invalidateQueries({ queryKey: ['vehicle', id] });
            await queryClient.invalidateQueries({ queryKey: ['vehicles'] });
            toast.success('Foto atualizada com sucesso!');
        } catch (error) {
            console.error('Error uploading photo:', error);
            const message = (error as { message?: string })?.message ?? 'Erro ao fazer upload da foto';
            toast.error(message);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handlePhotoClick = () => fileInputRef.current?.click();

    // ── Download do documento (PDF) ────────────────────────────────────────
    const handleDownloadDocument = () => {
        const url = (vehicle as { document_url?: string | null })?.document_url;
        if (!url) {
            toast.error('Nenhum documento disponível para este veículo.');
            return;
        }
        const link = document.createElement('a');
        link.href = url;
        link.download = `documento-${(vehicle as { plate?: string })?.plate ?? 'veiculo'}.pdf`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // ── Loading / Erro ─────────────────────────────────────────────────────
    if (loadingVehicle) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            </div>
        );
    }
    if (errorVehicle || !vehicle) {
        return (
            <div className="space-y-4">
                <Link to="/veiculos">
                    <SGFButton variant="ghost" size="sm" icon={ArrowLeft}>Voltar</SGFButton>
                </Link>
                <SGFCard>
                    <p className="text-sm text-rose-600 font-medium">Veículo não encontrado.</p>
                </SGFCard>
            </div>
        );
    }

    const v = vehicle as unknown as VehicleRow;
    const fuelLabel = v.fuel_type ? (FUEL_LABEL[String(v.fuel_type).toLowerCase()] ?? String(v.fuel_type)) : '—';

    // ── Colunas das tabs ───────────────────────────────────────────────────
    type TripRow = (typeof trips)[number] & {
        start_at: string; end_at: string | null;
        start_odometer: number | null; end_odometer: number | null;
        distance_km: number | null; destination: string;
        drivers?: { id: string; name: string } | null;
    };
    const tripColumns: SGFTableColumn<TripRow>[] = [
        { header: 'Data', accessor: (r) => formatDate(r.start_at) },
        { header: 'Motorista', accessor: (r) => r.drivers?.name ?? '—' },
        { header: 'Km Inicial', accessor: (r) => r.start_odometer != null ? r.start_odometer.toLocaleString('pt-BR') : '—' },
        { header: 'Km Final', accessor: (r) => r.end_odometer != null ? r.end_odometer.toLocaleString('pt-BR') : '—' },
        { header: 'Distância', accessor: (r) => r.distance_km != null ? formatDistance(Number(r.distance_km)) : '—' },
        { header: 'Destino', accessor: (r) => r.destination ?? '—' },
    ];

    type FuelRow = (typeof refuelings)[number] & {
        created_at: string;
        liters: number; total_cost: number | null;
        odometer: number | null; km_per_liter: number | null;
    };
    const refuelingColumns: SGFTableColumn<FuelRow>[] = [
        { header: 'Data', accessor: (r) => formatDate(r.created_at) },
        { header: 'Litros', accessor: (r) => `${Number(r.liters ?? 0).toLocaleString('pt-BR')} L` },
        { header: 'Valor', accessor: (r) => formatCurrency(Number(r.total_cost ?? 0)) },
        { header: 'Odômetro', accessor: (r) => r.odometer != null ? formatDistance(r.odometer) : '—' },
        { header: 'Consumo', accessor: (r) => r.km_per_liter ? `${Number(r.km_per_liter).toFixed(1)} km/L` : '—' },
    ];

    type MaintRow = (typeof maintenances)[number];
    const maintenanceColumns: SGFTableColumn<MaintRow>[] = [
        { header: 'Data', accessor: (r) => formatDate(r.created_at) },
        { header: 'Categoria', accessor: (r) => r.category ?? '—' },
        { header: 'Descrição', accessor: (r) => r.description ?? '—' },
        { header: 'Prioridade', accessor: (r) => r.priority ?? '—' },
        {
            header: 'Status',
            accessor: (r) => (
                <SGFBadge variant={getStatusColor(r.status as string) as 'default' | 'success' | 'warning' | 'error' | 'info'}>
                    {getStatusLabel(r.status as string)}
                </SGFBadge>
            ),
        },
    ];

    const departmentName = v.departments?.name ?? '—';

    const statusDotColor = v.status === 'AVAILABLE' ? 'bg-emerald-500' : v.status === 'MAINTENANCE' ? 'bg-amber-500' : 'bg-slate-400';

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4 min-w-0">
                    <Link to="/veiculos">
                        <SGFButton variant="ghost" size="sm" icon={ArrowLeft}>Voltar</SGFButton>
                    </Link>
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold text-slate-900 truncate">
                            {v.brand} {v.model}
                            {v.plate && (
                                <span className="font-normal text-slate-500"> - {formatPlate(v.plate)}</span>
                            )}
                        </h1>
                    </div>
                </div>
                <div className="flex shrink-0 justify-end">
                    <SGFButton icon={Edit2} onClick={() => setEditOpen(true)}>
                        Editar
                    </SGFButton>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                {[
                    { icon: Gauge, color: 'text-emerald-600', bg: 'bg-emerald-50', value: formatDistance(v.current_odometer ?? 0), label: 'Odômetro' },
                    { icon: Fuel, color: 'text-blue-600', bg: 'bg-blue-50', value: `${avgKmL ? avgKmL.toFixed(1) : '—'} km/L`, label: 'Consumo médio' },
                    { icon: Route, color: 'text-green-600', bg: 'bg-green-50', value: String(tripsThisMonth), label: 'Viagens este mês' },
                    { icon: Building2, color: 'text-amber-600', bg: 'bg-amber-50', value: departmentName, label: 'Secretaria' },
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
            <Tabs defaultValue="info" className="w-full">
                <TabsList className="grid w-full grid-cols-4 lg:w-[400px] mx-auto bg-slate-100/50 p-1 rounded-xl">
                    <TabsTrigger value="info" className="rounded-lg data-[state=active]:bg-[#00A86B] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all">Info</TabsTrigger>
                    <TabsTrigger value="trips" className="rounded-lg data-[state=active]:bg-[#00A86B] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all">Viagens</TabsTrigger>
                    <TabsTrigger value="refuelings" className="rounded-lg data-[state=active]:bg-[#00A86B] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all">Abaste.</TabsTrigger>
                    <TabsTrigger value="maintenances" className="rounded-lg data-[state=active]:bg-[#00A86B] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all">Manut.</TabsTrigger>
                </TabsList>

                <TabsContent value="info">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                        {/* Coluna esquerda: Foto + Status + Resumo */}
                        <div className="lg:col-span-1">
                            <SGFCard>
                                <div className="space-y-6">
                                    <div className="aspect-[4/3] w-full bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center overflow-hidden relative group shadow-inner">
                                        {v.photo_url ? (
                                            <img
                                                src={v.photo_url}
                                                alt={`${v.brand} ${v.model}`}
                                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                            />
                                        ) : (
                                            <div className="flex flex-col items-center justify-center text-slate-200">
                                                <Car width={80} height={80} />
                                                <p className="mt-4 text-sm font-medium text-slate-400">Sem foto disponível</p>
                                            </div>
                                        )}

                                        <div
                                            className="absolute inset-0 bg-[#0F2B2F]/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center cursor-pointer backdrop-blur-[2px]"
                                            onClick={handlePhotoClick}
                                        >
                                            <SGFButton
                                                variant="secondary"
                                                size="sm"
                                                icon={isUploading ? Loader2 : Camera}
                                                disabled={isUploading}
                                                className="shadow-xl"
                                            >
                                                {isUploading ? 'Enviando...' : 'Alterar Foto'}
                                            </SGFButton>
                                        </div>

                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handlePhotoUpload}
                                            className="hidden"
                                        />
                                    </div>



                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-slate-100 rounded-2xl border border-slate-200 text-center">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-[0.1em] font-bold mb-1">Ano Modelo</p>
                                            <p className="text-xl font-black text-[#0F2B2F]">{v.year ?? '—'}</p>
                                        </div>
                                        <div className="p-4 bg-slate-100 rounded-2xl border border-slate-200 text-center">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-[0.1em] font-bold mb-1">Combustível</p>
                                            <p className="text-xl font-black text-[#0F2B2F]">{fuelLabel}</p>
                                        </div>
                                    </div>
                                </div>
                            </SGFCard>
                        </div>

                        {/* Coluna meio: Dados técnicos */}
                        <div className="lg:col-span-1">
                            <SGFCard title="Dados Técnicos" icon={Car}>
                                <div className="space-y-1">
                                    {[
                                        { label: 'Marca / Fabricante', value: v.brand ?? '—' },
                                        { label: 'Modelo do Veículo', value: v.model ?? '—' },
                                        { label: 'Tipo / Categoria', value: v.vehicle_type ?? '—' },
                                        { label: 'Cor', value: (v as { color?: string | null }).color ?? '—' },
                                        { label: 'Capacidade do Tanque', value: v.tank_capacity ? `${v.tank_capacity} L` : '—' },
                                        { label: 'Quilometragem atual', value: formatDistance(v.current_odometer ?? 0) },
                                    ].map((item) => (
                                        <div key={item.label} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                                            <span className="text-sm text-slate-500 font-medium">{item.label}</span>
                                            <span className="text-sm font-bold text-slate-900 text-right">{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </SGFCard>
                        </div>

                        {/* Coluna direita: Documentação legal */}
                        <div className="lg:col-span-1">
                            <SGFCard title="Documentação Legal" icon={FileText}>
                                <div className="space-y-1">
                                    {[
                                        { label: 'Placa de Identificação', value: formatPlate(v.plate), isBadge: true },
                                        { label: 'RENAVAM', value: (v as { renavam?: string | null }).renavam ?? '—', isMono: true },
                                        { label: 'Chassi', value: (v as { chassis?: string | null }).chassis ?? '—', isMono: true },
                                        { label: 'Código Unidade', value: v.unit_code ?? '—', isMono: true },
                                        { label: 'Secretaria Responsável', value: departmentName },
                                        { label: 'Vencimento do Seguro', value: v.insurance_expiry ? formatDate(v.insurance_expiry) : '—' },
                                    ].map((item) => (
                                        <div key={item.label} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                                            <span className="text-sm text-slate-500 font-medium">{item.label}</span>
                                            {item.isBadge ? (
                                                <span className="text-sm font-black bg-[#0F2B2F] text-white px-2.5 py-1 rounded-md tracking-wider font-mono">{item.value}</span>
                                            ) : (
                                                <span className={`text-sm font-bold text-slate-900 text-right ${item.isMono ? 'font-mono text-xs' : ''}`}>{item.value}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 pt-4 border-t border-slate-100">
                                    <SGFButton
                                        variant="secondary"
                                        icon={Download}
                                        onClick={handleDownloadDocument}
                                        className="w-full"
                                    >
                                        Baixar Documento (PDF)
                                    </SGFButton>
                                </div>
                            </SGFCard>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="trips">
                    <div className="-mx-4 md:mx-0">
                        <SGFTable
                            columns={tripColumns}
                            data={trips as unknown as TripRow[]}
                            keyExtractor={(r) => r.id}
                            emptyMessage="Nenhuma viagem registrada para este veículo."
                        />
                    </div>
                </TabsContent>

                <TabsContent value="refuelings">
                    <div className="-mx-4 md:mx-0">
                        <SGFTable
                            columns={refuelingColumns}
                            data={refuelings as unknown as FuelRow[]}
                            keyExtractor={(r) => r.id}
                            emptyMessage="Nenhum abastecimento registrado para este veículo."
                        />
                    </div>
                </TabsContent>

                <TabsContent value="maintenances">
                    <div className="-mx-4 md:mx-0">
                        <SGFTable
                            columns={maintenanceColumns}
                            data={maintenances}
                            keyExtractor={(r) => r.id}
                            emptyMessage="Nenhuma ordem de serviço para este veículo."
                        />
                    </div>
                </TabsContent>
            </Tabs>

            <EditVehicleModal
                isOpen={isEditOpen}
                onClose={() => setEditOpen(false)}
                vehicle={v as unknown as Tables<'vehicles'>}
            />
        </div>
    );
}
