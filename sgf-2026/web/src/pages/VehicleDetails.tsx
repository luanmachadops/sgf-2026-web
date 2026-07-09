import React, { useRef, useState, useMemo } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
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
    Qr,
    Sparkles,
    ChevronLeft,
    ChevronRight,
    User,
} from '@/components/sgf/icons';
import { EditVehicleModal } from '@/components/vehicles/EditVehicleModal';
import { VehicleAIModal } from '@/components/vehicles/VehicleAIModal';
import { TripDetailsModal } from '@/components/trips/TripDetailsModal';
import { RefuelingDetailsModal } from '@/components/refuelings/RefuelingDetailsModal';
import { MaintenanceDetailsModal } from '@/components/maintenances/MaintenanceDetailsModal';
import { Modal } from '@/components/ui/Modal';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { StyledQr } from '@/components/qr/StyledQr';
import { downloadVehicleQr } from '@/lib/vehicleQr';
import { vehicleDocumentsApi } from '@/lib/supabase-api';
import { webToDbFuelType } from '@/lib/db-mapping';
import type { ExtractWithPhotosResult } from '@/lib/vehicleAI';
import { formatDate, formatDistance, formatCurrency, formatPlate, getStatusLabel, getStatusColor } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import {
    vehiclesApi,
    tripsApi,
    refuelingsApi,
    maintenancesApi,
    type VehicleRecord,
} from '@/lib/supabase-api';
import { resizeAndConvertToWebP, isImageFile } from '@/lib/imageUtils';
import { resolveDocUrl } from '@/lib/docStorage';
import { toast } from 'sonner';
import type { Tables } from '@/types/database.types';
import { useAuth } from '@/contexts/AuthContext';
import { VehicleChecklistsTab } from '@/components/vehicles/VehicleChecklistsTab';

const FUEL_LABEL: Record<string, string> = {
    diesel: 'Diesel',
    gasolina: 'Gasolina',
    etanol: 'Etanol',
    flex: 'Flex',
};

type VehicleRow = VehicleRecord & {
    photo_url: string | null;
};

export default function VehicleDetails() {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const backTo = (location.state as { backTo?: string } | null)?.backTo ?? '/veiculos';
    const queryClient = useQueryClient();
    const [isUploading, setIsUploading] = useState(false);
    const [isEditOpen, setEditOpen] = useState(false);
    const [isQrOpen, setQrOpen] = useState(false);
    const [isAiOpen, setAiOpen] = useState(false);
    const [viewer, setViewer] = useState<{ images: string[]; index: number } | null>(null);
    const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
    const [selectedRefuelId, setSelectedRefuelId] = useState<string | null>(null);
    const [selectedMaintId, setSelectedMaintId] = useState<string | null>(null);
    const [photoIdx, setPhotoIdx] = useState(0);
    const [uploadingMulti, setUploadingMulti] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const multiInputRef = useRef<HTMLInputElement>(null);
    const tabsRef = useRef<HTMLDivElement>(null);

    // ── Veículo ────────────────────────────────────────────────────────────
    const { data: vehicle, isLoading: loadingVehicle, isError: errorVehicle } = useQuery({
        queryKey: ['vehicle', id],
        queryFn: () => vehiclesApi.getById(id!),
        enabled: Boolean(id),
    });

    // ── Fotos/documentos deste veículo (placa, renavam, hodômetro, extras) ──
    const { data: vehicleDocs = [] } = useQuery({
        queryKey: ['vehicle', id, 'documents'],
        queryFn: () => vehicleDocumentsApi.getByVehicle(id!),
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

    // Fotos do veículo (carrossel): foto principal + documentos do tipo 'foto'.
    const vehiclePhotos = useMemo(() => {
        const urls: string[] = [];
        if (vehicle?.photo_url) urls.push(vehicle.photo_url);
        for (const d of vehicleDocs) {
            if (d.doc_type === 'foto' && d.url && !urls.includes(d.url)) urls.push(d.url);
        }
        return urls;
    }, [vehicle?.photo_url, vehicleDocs]);

    // Documentos que NÃO são foto do veículo (placa, renavam, hodômetro, CRLV).
    // Esses documentos são sensíveis e podem estar salvos como PATH do bucket privado
    // `documentos` (novos registros) ou como URL pública antiga — resolveDocUrl trata os dois casos.
    const otherDocs = useMemo(() => vehicleDocs.filter((d) => d.doc_type !== 'foto' && d.url), [vehicleDocs]);

    const { data: resolvedOtherDocs = [] } = useQuery({
        queryKey: ['vehicle', id, 'documents', 'resolved', otherDocs.map((d) => `${d.id}:${d.url}`).join('|')],
        queryFn: async () => {
            const resolved = await Promise.all(
                otherDocs.map(async (d) => ({ ...d, resolvedUrl: await resolveDocUrl(d.url).catch(() => null) }))
            );
            return resolved.filter((d) => d.resolvedUrl);
        },
        enabled: otherDocs.length > 0,
    });

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

    // Upload de VÁRIAS fotos do veículo (salvas como documentos do tipo 'foto').
    const handleMultiPhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        if (files.length === 0 || !vehicle) return;
        setUploadingMulti(true);
        try {
            let firstUrl: string | null = null;
            for (const file of files) {
                if (!isImageFile(file)) continue;
                const blob = await resizeAndConvertToWebP(file, 1000);
                const fileName = `vehicles/${vehicle.id}/foto-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
                const { error: upErr } = await supabase.storage.from('fotos').upload(fileName, blob, { contentType: 'image/webp', upsert: true });
                if (upErr) throw upErr;
                const { data: { publicUrl } } = supabase.storage.from('fotos').getPublicUrl(fileName);
                await vehicleDocumentsApi.add({ vehicleId: vehicle.id, url: publicUrl, title: 'Foto do veículo', docType: 'foto' });
                if (!firstUrl) firstUrl = publicUrl;
            }
            // Se o veículo ainda não tem foto principal, usa a primeira enviada.
            if (firstUrl && !vehicle.photo_url) {
                await vehiclesApi.update(vehicle.id, { photo_url: firstUrl } as never);
            }
            await queryClient.invalidateQueries({ queryKey: ['vehicle', id] });
            await queryClient.invalidateQueries({ queryKey: ['vehicle', id, 'documents'] });
            await queryClient.invalidateQueries({ queryKey: ['vehicles'] });
            toast.success(`${files.length} foto(s) adicionada(s).`);
        } catch (err) {
            toast.error((err as { message?: string })?.message ?? 'Erro ao enviar as fotos.');
        } finally {
            setUploadingMulti(false);
            if (multiInputRef.current) multiInputRef.current.value = '';
        }
    };

    // Aplica o resultado da IA: atualiza campos do veículo + salva as fotos enviadas.
    const handleAiResult = async (result: ExtractWithPhotosResult) => {
        if (!id) return;
        const d = result.data;
        const updates: Record<string, unknown> = {};
        if (d.plate) updates.plate = String(d.plate).toUpperCase();
        if (d.brand) updates.brand = d.brand;
        if (d.model) updates.model = d.model;
        if (d.year) updates.year = d.year;
        if (d.color) updates.color = d.color;
        if (d.vehicleType) updates.vehicle_type = d.vehicleType;
        if (d.renavam) updates.renavam = String(d.renavam);
        if (d.chassis) updates.chassis = String(d.chassis);
        if (d.tankCapacity) updates.tank_capacity = d.tankCapacity;
        if (d.fuelType) updates.fuel_type = webToDbFuelType(d.fuelType);
        if (d.odometer && d.odometer > 0) updates.current_odometer = d.odometer;
        // Define a foto principal a partir da foto do veículo, se ainda não houver.
        const mainPhoto = result.photos.find((p) => p.type === 'foto')?.url;
        if (mainPhoto && !vehicle?.photo_url) updates.photo_url = mainPhoto;

        if (Object.keys(updates).length > 0) {
            await vehiclesApi.update(id, updates as never);
        }
        // Salva cada foto como documento do veículo (aparece na galeria).
        const TITLES: Record<string, string> = { foto: 'Foto do veículo', placa: 'Placa', documento: 'Documento (CRLV)', hodometro: 'Hodômetro' };
        for (const p of result.photos) {
            await vehicleDocumentsApi.add({ vehicleId: id, url: p.url, title: TITLES[p.type] ?? 'Foto', docType: p.type });
        }
        queryClient.invalidateQueries({ queryKey: ['vehicle', id] });
        queryClient.invalidateQueries({ queryKey: ['vehicle', id, 'documents'] });
        queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    };

    // ── Download do documento (PDF) ────────────────────────────────────────
    const handleDownloadDocument = async () => {
        const stored = (vehicle as { document_url?: string | null })?.document_url;
        if (!stored) {
            toast.error('Nenhum documento disponível para este veículo.');
            return;
        }
        let url: string | null = null;
        try {
            url = await resolveDocUrl(stored); // gera URL assinada se for do bucket privado
        } catch {
            toast.error('Não foi possível abrir o documento.');
            return;
        }
        if (!url) { toast.error('Não foi possível abrir o documento.'); return; }
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
                <Link to={backTo}>
                    <SGFButton variant="ghost" size="sm" icon={ArrowLeft}><span className="hidden md:inline">Voltar</span></SGFButton>
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
        drivers?: { id: string; name: string; photo_url?: string | null } | null;
    };
    const tripColumns: SGFTableColumn<TripRow>[] = [
        { header: 'Data', accessor: (r) => formatDate(r.start_at) },
        {
            header: 'Motorista',
            accessor: (r) => {
                const name = r.drivers?.name ?? '—';
                const photo = r.drivers?.photo_url;
                return (
                    <div className="flex items-center gap-2.5">
                        {photo ? (
                            <img src={photo} alt={name} className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-slate-200" />
                        ) : (
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                <User className="h-3 w-3" />
                            </div>
                        )}
                        <span className="text-sm font-semibold text-slate-800">{name}</span>
                    </div>
                );
            },
        },
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
        { header: 'Posto', accessor: (r) => r.supplier_name || '—' },
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
        { header: 'Oficina', accessor: (r) => r.repair_shop ?? '—' },
        {
            header: 'Orçado × Custo',
            accessor: (r) => {
                const budget = r.budget != null ? Number(r.budget) : null;
                const cost = r.cost != null ? Number(r.cost) : null;
                if (budget == null && cost == null) return '—';
                return (
                    <div className="flex items-center gap-1.5">
                        <span>{budget != null ? formatCurrency(budget) : '—'} / {cost != null ? formatCurrency(cost) : '—'}</span>
                        {budget != null && cost != null && (
                            <SGFBadge variant={cost <= budget ? 'success' : 'error'} size="sm">
                                {cost <= budget ? 'OK' : 'Estourou'}
                            </SGFBadge>
                        )}
                    </div>
                );
            },
        },
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
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <Link to={backTo} className="shrink-0">
                        <SGFButton variant="ghost" size="sm" icon={ArrowLeft}><span className="hidden md:inline">Voltar</span></SGFButton>
                    </Link>
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">
                            {v.brand} {v.model}
                            {v.plate && (
                                <span className="font-normal text-slate-500"> - {formatPlate(v.plate)}</span>
                            )}
                        </h1>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <SGFButton variant="secondary" icon={Sparkles} onClick={() => setAiOpen(true)} className="!h-[37px] !rounded-full">
                        <span className="hidden sm:inline">Preencher com IA</span>
                    </SGFButton>
                    <SGFButton variant="secondary" icon={Qr} onClick={() => setQrOpen(true)} className="!h-[37px] !rounded-full">
                        <span className="hidden sm:inline">QR Code</span>
                    </SGFButton>
                    <SGFButton icon={Edit2} onClick={() => setEditOpen(true)} className="!h-[37px] !rounded-full">
                        <span className="hidden sm:inline">Editar</span>
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
                <TabsList className="grid w-full grid-cols-5 lg:w-[500px] mx-auto bg-slate-100/50 p-1 rounded-xl">
                    <TabsTrigger value="info" className="rounded-lg data-[state=active]:bg-[#00A86B] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all">Info</TabsTrigger>
                    <TabsTrigger value="trips" className="rounded-lg data-[state=active]:bg-[#00A86B] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all">Viagens</TabsTrigger>
                    <TabsTrigger value="refuelings" className="rounded-lg data-[state=active]:bg-[#00A86B] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all">Abaste.</TabsTrigger>
                    <TabsTrigger value="maintenances" className="rounded-lg data-[state=active]:bg-[#00A86B] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all">Manut.</TabsTrigger>
                    <TabsTrigger value="checklists" className="rounded-lg data-[state=active]:bg-[#00A86B] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all">Checklists</TabsTrigger>
                </TabsList>

                <TabsContent value="info">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                        {/* Coluna esquerda: Foto + Status + Resumo */}
                        <div className="lg:col-span-1">
                            <SGFCard>
                                <div className="space-y-6">
                                    {/* Carrossel de fotos do veículo */}
                                    <div className="aspect-[4/3] w-full bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center overflow-hidden relative group shadow-inner">
                                        {vehiclePhotos.length > 0 ? (
                                            <>
                                                {(() => { const cur = Math.min(photoIdx, vehiclePhotos.length - 1); return (
                                                    <img
                                                        src={vehiclePhotos[cur]}
                                                        alt={`${v.brand} ${v.model}`}
                                                        onClick={() => setViewer({ images: vehiclePhotos, index: cur })}
                                                        className="w-full h-full object-cover cursor-zoom-in transition-transform duration-700 group-hover:scale-105"
                                                    />
                                                ); })()}

                                                {vehiclePhotos.length > 1 && (
                                                    <>
                                                        <button
                                                            onClick={() => setPhotoIdx((i) => (i - 1 + vehiclePhotos.length) % vehiclePhotos.length)}
                                                            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1.5 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/65"
                                                            aria-label="Foto anterior"
                                                        >
                                                            <ChevronLeft className="h-5 w-5" />
                                                        </button>
                                                        <button
                                                            onClick={() => setPhotoIdx((i) => (i + 1) % vehiclePhotos.length)}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1.5 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/65"
                                                            aria-label="Próxima foto"
                                                        >
                                                            <ChevronRight className="h-5 w-5" />
                                                        </button>
                                                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                                                            {vehiclePhotos.map((_, i) => (
                                                                <span key={i} className={`h-1.5 rounded-full transition-all ${i === Math.min(photoIdx, vehiclePhotos.length - 1) ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`} />
                                                            ))}
                                                        </div>
                                                    </>
                                                )}
                                            </>
                                        ) : (
                                            <div
                                                className="flex flex-col items-center justify-center text-slate-300 cursor-pointer w-full h-full hover:bg-slate-100/60 transition-colors"
                                                onClick={handlePhotoClick}
                                            >
                                                {isUploading ? <Loader2 width={40} height={40} className="animate-spin text-emerald-500" /> : <Camera width={44} height={44} />}
                                                <p className="mt-3 text-sm font-semibold text-slate-400">{isUploading ? 'Enviando...' : 'Adicionar foto'}</p>
                                            </div>
                                        )}

                                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                                    </div>

                                    {/* Adicionar várias fotos do veículo */}
                                    <div>
                                        <SGFButton
                                            variant="secondary"
                                            size="sm"
                                            icon={uploadingMulti ? Loader2 : Camera}
                                            disabled={uploadingMulti}
                                            onClick={() => multiInputRef.current?.click()}
                                            className="w-full"
                                        >
                                            {uploadingMulti ? 'Enviando...' : 'Adicionar fotos do veículo'}
                                        </SGFButton>
                                        <input ref={multiInputRef} type="file" accept="image/*" multiple onChange={handleMultiPhotoUpload} className="hidden" />
                                    </div>

                                    {/* Galeria de documentos (placa, renavam, hodômetro, CRLV) — bucket privado, URL assinada */}
                                    {resolvedOtherDocs.length > 0 && (
                                        <div>
                                            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Placa, RENAVAM e hodômetro</p>
                                            <div className="grid grid-cols-3 gap-2">
                                                {resolvedOtherDocs.map((doc) => (
                                                    <button
                                                        key={doc.id}
                                                        onClick={() => setViewer({ images: [doc.resolvedUrl!], index: 0 })}
                                                        className="group/thumb relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                                                        title={doc.title}
                                                    >
                                                        <img src={doc.resolvedUrl!} alt={doc.title} className="h-full w-full object-cover transition-transform duration-500 group-hover/thumb:scale-110" />
                                                        <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-[9px] font-semibold text-white">{doc.title}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}



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
                            onRowClick={(r) => setSelectedTripId(r.id)}
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
                            onRowClick={(r) => setSelectedRefuelId(r.id)}
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
                            onRowClick={(r) => setSelectedMaintId(r.id)}
                            emptyMessage="Nenhuma ordem de serviço para este veículo."
                        />
                    </div>
                </TabsContent>

                <TabsContent value="checklists">
                    <VehicleChecklistsTab vehicleId={v.id} />
                </TabsContent>
            </Tabs>
            </div>

            <EditVehicleModal
                isOpen={isEditOpen}
                onClose={() => setEditOpen(false)}
                vehicle={v as unknown as Tables<'vehicles'>}
            />

            <Modal
                isOpen={isQrOpen}
                onClose={() => setQrOpen(false)}
                title="QR Code do veículo"
                description="Aponte a câmera do app do motorista para vincular o veículo."
                size="sm"
            >
                <div className="flex flex-col items-center gap-4">
                    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                        {v.plate ? (
                            <StyledQr value={v.plate} size={240} />
                        ) : (
                            <p className="px-8 py-12 text-sm text-slate-400">Veículo sem placa cadastrada.</p>
                        )}
                    </div>
                    <div className="text-center">
                        <p className="font-mono text-lg font-bold tracking-wide text-slate-900">{v.plate ? formatPlate(v.plate) : '—'}</p>
                        <p className="text-xs text-slate-500">{v.brand} {v.model}</p>
                    </div>
                    <SGFButton
                        icon={Download}
                        onClick={() => v.plate && downloadVehicleQr(v.plate)}
                        disabled={!v.plate}
                        className="w-full"
                    >
                        Baixar QR Code (PNG)
                    </SGFButton>
                </div>
            </Modal>

            <VehicleAIModal
                isOpen={isAiOpen}
                onClose={() => setAiOpen(false)}
                vehicleId={v.id}
                tenantId={user?.tenantId ?? ''}
                onResult={handleAiResult}
            />

            <PhotoViewer
                images={viewer?.images}
                startIndex={viewer?.index ?? 0}
                alt={`${v.brand} ${v.model}`}
                onClose={() => setViewer(null)}
            />

            <TripDetailsModal tripId={selectedTripId} onClose={() => setSelectedTripId(null)} />
            <RefuelingDetailsModal refuelingId={selectedRefuelId} onClose={() => setSelectedRefuelId(null)} />
            <MaintenanceDetailsModal maintenanceId={selectedMaintId} onClose={() => setSelectedMaintId(null)} />
        </div>
    );
}
