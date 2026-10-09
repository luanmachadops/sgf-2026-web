import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { VehicleCell, DriverCell } from '@/components/sgf/EntityCells';
import { SGFKPICard } from '@/components/sgf/SGFKPICard';
import { SGFTable, type SGFTableColumn } from '@/components/sgf/SGFTable';
import { SGFToolbar } from '@/components/sgf/SGFToolbar';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { WorkshopModalShell } from '@/components/partners/workshop/WorkshopModalShell';
import {
    AlertTriangle,
    Receipt,
    DollarSign,
    Plus,
    Download,
    Car,
    MapPin,
    Calendar,
    CheckCircle,
    Route,
    Loader2,
    FileText,
    X,
    Eye,
} from '@/components/sgf/icons';
import { useHeader } from '@/contexts/HeaderContext';
import { useAuth } from '@/contexts/AuthContext';
import { infractionsApi, driversApi, vehiclesApi, tripsApi, type InfractionCandidate, type VehicleRecord, type TripRecord } from '@/lib/supabase-api';
import { formatCurrency, formatPlate, formatDriverLabel, matchesSearch } from '@/lib/utils';
import { uploadFoto } from '@/lib/fotoStorage';
import { prepareUpload, uploadFileId } from '@/lib/imageUtils';
import type { Tables } from '@/types/database.types';
import { useSyncOnChange } from '@/hooks/useSyncOnChange';

type InfractionRow = Tables<'infractions'> & {
    vehicles?: { plate?: string; brand?: string; model?: string; photo_url?: string | null; departments?: { name?: string } | null } | null;
    suggested?: { id: string; full_name: string; photo_url?: string | null } | null;
    indicated?: { id: string; full_name: string; photo_url?: string | null } | null;
};

const STATUS_META: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' }> = {
    pendente: { label: 'Pendente', variant: 'warning' },
    indicada: { label: 'Indicada', variant: 'info' },
    aprovada: { label: 'Aprovada', variant: 'success' },
    rejeitada: { label: 'Rejeitada', variant: 'error' },
    paga: { label: 'Paga', variant: 'default' },
};

const STATUS_TABS = [
    { value: '', label: 'Todas' },
    { value: 'pendente', label: 'Pendentes' },
    { value: 'indicada', label: 'Indicadas' },
    { value: 'aprovada', label: 'Aprovadas' },
    { value: 'rejeitada', label: 'Rejeitadas' },
];

function fmtDateTime(iso?: string | null) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} - ${timeStr}`;
}

export default function Infracoes() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { setTitle, setDescription, setHeaderAction } = useHeader();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [manualSelected, setSelected] = useState<InfractionRow | null>(null);

    const paramId = searchParams.get('id') || searchParams.get('infractionId');
    const paramSearch = searchParams.get('search');

    useSyncOnChange(paramSearch, () => {
        if (paramSearch) setSearchTerm(paramSearch);
    });

    const { data: infractions = [], isLoading } = useQuery({
        queryKey: ['infractions', statusFilter, searchTerm],
        queryFn: () => infractionsApi.getAll({ status: statusFilter || undefined, search: searchTerm || undefined }),
    });

    useEffect(() => {
        setTitle('Infrações');
        setDescription('Consulta de multas e indicação do condutor responsável.');
        setHeaderAction(
            <div className="flex flex-wrap items-center justify-end gap-2">
                <SGFButton icon={Plus} onClick={() => setShowAddModal(true)} className="!rounded-full !h-[37px]">Nova infração</SGFButton>
            </div>
        );
        return () => setHeaderAction(null);
    }, [setTitle, setDescription, setHeaderAction]);

    const list = infractions as InfractionRow[];
    const requested = useMemo(() => {
        if (paramId) return list.find((infraction) => infraction.id === paramId) ?? null;
        if (!paramSearch) return null;
        const term = paramSearch.trim().toLowerCase();
        return list.find((infraction) =>
            infraction.vehicles?.plate?.toLowerCase() === term
            || infraction.vehicles?.plate?.toLowerCase().replace('-', '') === term.replace('-', '')
            || infraction.plate?.toLowerCase() === term
            || infraction.plate?.toLowerCase().replace('-', '') === term.replace('-', '')
            || infraction.indicated?.full_name?.toLowerCase().includes(term)
            || infraction.suggested?.full_name?.toLowerCase().includes(term)
            || infraction.ait?.toLowerCase() === term
        ) ?? null;
    }, [list, paramId, paramSearch]);
    const selected = manualSelected ?? requested;
    const pendingCount = list.filter((i) => i.status === 'pendente').length;
    const totalAmount = list.reduce((s, i) => s + Number(i.amount ?? 0), 0);
    const totalPoints = list.reduce((s, i) => s + Number(i.points ?? 0), 0);

    const closeSelected = () => {
        setSelected(null);
        if (!paramId) return;
        const next = new URLSearchParams(searchParams);
        next.delete('id');
        next.delete('infractionId');
        setSearchParams(next, { replace: true });
    };

    const columns: SGFTableColumn<InfractionRow>[] = [
        {
            header: 'Infração',
            accessor: (r) => {
                const prefix = r.ait ? `AIT ${r.ait}` : r.code || '';
                return (
                    <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{r.description || 'Infração'}</p>
                        <p className="text-xs text-slate-400">
                            {prefix ? `${prefix} · ` : ''}{fmtDateTime(r.occurred_at)}
                        </p>
                    </div>
                );
            },
        },
        {
            header: 'Veículo',
            accessor: (r) => (
                <VehicleCell
                    plate={r.plate}
                    name={[r.vehicles?.brand, r.vehicles?.model].filter(Boolean).join(' ') || null}
                    photoUrl={r.vehicles?.photo_url}
                />
            ),
        },
        { header: 'Local', accessor: (r) => <span className="text-sm text-slate-600">{r.location || '—'}</span> },
        { header: 'Valor', accessor: (r) => <span className="font-semibold text-slate-800">{formatCurrency(Number(r.amount ?? 0))}</span>, className: 'text-right', headerClassName: 'text-right' },
        {
            header: 'Condutor',
            accessor: (r) => {
                const cond = r.indicated || r.suggested;
                const isSuggested = !r.indicated && !!r.suggested;
                return (
                    <DriverCell
                        name={cond?.full_name}
                        photoUrl={cond?.photo_url}
                        subtitle={isSuggested ? 'Sugestão do sistema' : null}
                        fallback="—"
                    />
                );
            },
        },
        {
            header: 'Status',
            accessor: (r) => {
                const meta = STATUS_META[r.status] ?? STATUS_META.pendente;
                return <SGFBadge variant={meta.variant}>{meta.label}</SGFBadge>;
            },
        },
    ];

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
                <SGFKPICard title="Total de infrações" value={list.length} icon={Receipt} iconColor="text-slate-500" />
                <SGFKPICard title="Pendentes" value={pendingCount} icon={AlertTriangle} iconColor="text-amber-500" />
                <SGFKPICard title="Valor total" value={formatCurrency(totalAmount)} icon={DollarSign} iconColor="text-rose-500" />
                <SGFKPICard title="Pontos acumulados" value={totalPoints} icon={ShieldPoints} iconColor="text-purple-500" />
            </div>

            <SGFToolbar
                searchValue={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Buscar por placa, AIT ou descrição..."
                filters={[
                    {
                        key: 'status',
                        value: statusFilter,
                        onChange: setStatusFilter,
                        options: STATUS_TABS,
                        placeholder: 'Status',
                    },
                ]}
            />

            <div className="-mx-6 md:mx-0">
                <SGFTable
                    columns={columns}
                    data={list}
                    keyExtractor={(r) => r.id}
                    onRowClick={(row) => setSelected(row)}
                    loading={isLoading}
                    emptyMessage="Nenhuma infração registrada."
                />
            </div>

            <NewInfractionModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
            <ManageInfractionModal infraction={selected} onClose={closeSelected} />
        </div>
    );
}

// Ícone auxiliar (pontos) reutilizando AlertTriangle estilizado.
function ShieldPoints(props: { className?: string }) {
    return <AlertTriangle {...props} />;
}

// ── Modal: nova infração (lançamento manual) ───────────────────────────────
function NewInfractionModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const queryClient = useQueryClient();
    const [plate, setPlate] = useState('');
    const [ait, setAit] = useState('');
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [amount, setAmount] = useState('');
    const [points, setPoints] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [error, setError] = useState<string | null>(null);

    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    const [selectedTrip, setSelectedTrip] = useState<TripRecord | null>(null);
    const [tripSearch, setTripSearch] = useState('');
    const [selectedDriverId, setSelectedDriverId] = useState('');
    const [showTripSuggestions, setShowTripSuggestions] = useState(false);
    const tripSuggestionsRef = useRef<HTMLDivElement>(null);

    // Document attachment states
    const [attachmentUrl, setAttachmentUrl] = useState('');
    const [attachmentName, setAttachmentName] = useState('');
    const [uploadingFile, setUploadingFile] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch all vehicles for autocomplete
    const { data: vehicles = [] } = useQuery({
        queryKey: ['vehicles', 'all-for-infraction'],
        queryFn: () => vehiclesApi.getAll(),
        enabled: isOpen,
    });

    // Fetch all drivers for manual selection
    const { data: drivers = [] } = useQuery({
        queryKey: ['drivers', 'all-for-infraction-new'],
        queryFn: () => driversApi.getAll(),
        enabled: isOpen,
    });

    const [selectedVehicle, setSelectedVehicle] = useState<VehicleRecord | null>(null);

    // Sync selectedVehicle when plate matches a vehicle fully (e.g. from typed plate)
    useEffect(() => {
        if (!selectedVehicle && plate) {
            const match = vehicles.find((v) => v.plate.toUpperCase() === plate.trim().toUpperCase());
            if (match) {
                setSelectedVehicle(match);
            }
        }
    }, [plate, vehicles, selectedVehicle]);

    // Fetch trips of current vehicle on selected date
    const { data: tripsOnDate = [] } = useQuery({
        queryKey: ['trips-on-date', selectedVehicle?.id, date],
        queryFn: () => tripsApi.getAll({
            vehicleId: selectedVehicle!.id,
            startDate: `${date}T00:00:00`,
            endDate: `${date}T23:59:59`,
        }),
        enabled: Boolean(selectedVehicle?.id && date),
    });

    useEffect(() => {
        if (isOpen) {
            setPlate(''); setAit(''); setDescription(''); setLocation('');
            setDate(''); setTime(''); setAmount(''); setPoints(''); setDueDate(''); setError(null);
            setShowSuggestions(false);
            setSelectedTrip(null); setTripSearch(''); setSelectedDriverId('');
            setSelectedVehicle(null);
            setAttachmentUrl(''); setAttachmentName(''); setUploadingFile(false);
        }
    }, [isOpen]);

    useEffect(() => {
        setSelectedTrip(null);
        setTripSearch('');
        setSelectedDriverId('');
    }, [date, selectedVehicle?.id]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
            if (tripSuggestionsRef.current && !tripSuggestionsRef.current.contains(e.target as Node)) {
                setShowTripSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setUploadingFile(true);
            const prepared = await prepareUpload(file, { maxSize: 1400, quality: 0.8 });
            const safe = file.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_');
            const fileName = `infractions/${uploadFileId()}-${safe}.${prepared.ext}`;
            const { publicUrl } = await uploadFoto(fileName, prepared.blob, prepared.contentType);
            setAttachmentUrl(publicUrl);
            setAttachmentName(file.name);
            toast.success('Documento anexado com sucesso!');
        } catch (err) {
            console.error(err);
            toast.error('Erro ao enviar o documento.');
        } finally {
            setUploadingFile(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const createMutation = useMutation({
        mutationFn: () => {
            const occurredAt = date ? new Date(`${date}T${time || '12:00'}:00`).toISOString() : new Date().toISOString();
            return infractionsApi.create({
                plate: plate.trim().toUpperCase() || null,
                vehicle_id: selectedVehicle?.id || null,
                ait: ait.trim() || null,
                description: description.trim() || null,
                location: location.trim() || null,
                occurred_at: occurredAt,
                amount: amount ? Number(amount) : 0,
                points: points ? Number(points) : 0,
                due_date: dueDate || null,
                source: 'manual',
                indicated_driver_id: selectedDriverId || null,
                indicated_trip_id: selectedTrip?.id || null,
                status: selectedDriverId ? 'indicada' : 'pendente',
                raw: attachmentUrl ? { attachment_url: attachmentUrl, attachment_name: attachmentName } : null,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['infractions'] });
            toast.success('Infração registrada.');
            onClose();
        },
        onError: (e: unknown) => setError((e as { message?: string })?.message ?? 'Erro ao registrar a infração.'),
    });

    const filteredVehicles = vehicles.filter((v) => {
        return matchesSearch(plate, v.plate, v.brand, v.model);
    });

    const filteredTrips = tripsOnDate.filter((t) => {
        const search = tripSearch.toLowerCase();
        const dest = (t.destination || '').toLowerCase();
        const driverName = (t.drivers?.name || '').toLowerCase();
        return dest.includes(search) || driverName.includes(search);
    });

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Nova infração"
            description="Lance manualmente uma multa. O sistema sugere o condutor pelo histórico de viagens."
            size="lg"
            footer={(
                <ModalFooter>
                    <SGFButton variant="ghost" onClick={onClose} disabled={createMutation.isPending || uploadingFile}>Cancelar</SGFButton>
                    <SGFButton onClick={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!plate || !date || uploadingFile}>
                        Registrar
                    </SGFButton>
                </ModalFooter>
            )}
        >
            <div className="space-y-5">
                {/* 1. VEÍCULO & IDENTIFICAÇÃO */}
                <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/30 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">1. Veículo & Identificação</h4>
                    {selectedVehicle && (
                        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3.5 animate-in fade-in duration-200">
                            {selectedVehicle.photo_url ? (
                                <img src={selectedVehicle.photo_url} alt={`${selectedVehicle.brand} ${selectedVehicle.model}`} className="h-14 w-14 shrink-0 rounded-xl object-cover border border-slate-100" />
                            ) : (
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                                    <Car className="h-7 w-7" />
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="font-mono text-base font-bold text-slate-900">{formatPlate(selectedVehicle.plate)}</p>
                                <p className="text-xs font-semibold text-slate-700">{selectedVehicle.brand} {selectedVehicle.model}</p>
                                {selectedVehicle.departments?.name && (
                                    <p className="text-[11px] text-slate-400">{selectedVehicle.departments.name}</p>
                                )}
                            </div>
                            <SGFButton 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                className="!text-rose-600 !border-rose-200 hover:!bg-rose-50 !rounded-full shrink-0"
                                onClick={() => {
                                    setSelectedVehicle(null);
                                    setPlate('');
                                }}
                            >
                                Alterar veículo
                            </SGFButton>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {!selectedVehicle ? (
                            <div className="relative" ref={suggestionsRef}>
                                <SGFInput 
                                    label="Placa" 
                                    value={plate} 
                                    onChange={(e) => {
                                        setPlate(e.target.value);
                                        setShowSuggestions(true);
                                    }} 
                                    onFocus={() => setShowSuggestions(true)}
                                    placeholder="ABC-1234" 
                                    fullWidth 
                                />
                                {showSuggestions && filteredVehicles.length > 0 && (
                                    <div className="absolute z-[3000] left-0 right-0 top-full mt-1.5 max-h-60 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-lg custom-scrollbar">
                                        {filteredVehicles.map((v) => (
                                            <button
                                                key={v.id}
                                                type="button"
                                                onClick={() => {
                                                    setPlate(v.plate);
                                                    setSelectedVehicle(v);
                                                    setShowSuggestions(false);
                                                }}
                                                className="flex w-full items-center gap-3 rounded-full px-3 py-2 text-left hover:bg-emerald-50 transition-colors"
                                            >
                                                {v.photo_url ? (
                                                    <img src={v.photo_url} alt={`${v.brand} ${v.model}`} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                                                ) : (
                                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                                                        <Car className="h-4.5 w-4.5" />
                                                    </div>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-mono text-sm font-bold text-slate-900">
                                                        {formatPlate(v.plate)}
                                                        {v.departments?.name && (
                                                            <span className="ml-2 font-sans text-xs font-normal text-slate-400">
                                                                · {v.departments.name}
                                                            </span>
                                                        )}
                                                    </p>
                                                    <p className="text-xs text-slate-500 truncate">{v.brand} {v.model}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : null}
                        <div className={selectedVehicle ? "col-span-2" : ""}>
                            <SGFInput label="Nº do AIT" value={ait} onChange={(e) => setAit(e.target.value)} placeholder="Auto de infração" fullWidth />
                        </div>
                    </div>
                </div>

                {/* 2. DADOS DA INFRAÇÃO */}
                <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/30 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">2. Dados da Infração</h4>
                    <div className="grid grid-cols-1 gap-4">
                        <SGFInput label="Descrição da infração" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Transitar em velocidade superior à máxima permitida" fullWidth />
                        <SGFInput label="Local" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex: Av. Brasil, nº 1500" fullWidth />
                    </div>
                </div>

                {/* 3. VALORES & PRAZOS */}
                <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/30 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">3. Valores & Prazos</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <SGFInput label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} fullWidth />
                        <SGFInput label="Hora" type="time" value={time} onChange={(e) => setTime(e.target.value)} fullWidth />
                        <SGFInput label="Valor (R$)" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" fullWidth />
                        <SGFInput label="Pontos" type="number" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="0" fullWidth />
                        <div className="col-span-2 md:col-span-1">
                            <SGFInput label="Vencimento" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} fullWidth />
                        </div>
                    </div>
                </div>

                {/* 4. ASSOCIAÇÃO DE CONDUTOR */}
                {selectedVehicle && date && (
                    <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/30 p-4 animate-in fade-in duration-200">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">4. Associação de Condutor</h4>
                        {selectedTrip && (
                            <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3.5 animate-in fade-in duration-200">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                                    <Route className="h-5.5 w-5.5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-slate-800 truncate">
                                        {selectedTrip.destination ? `Para: ${selectedTrip.destination}` : 'Viagem sem destino'}
                                    </p>
                                    <p className="text-xs text-slate-500 truncate mt-0.5">
                                        {selectedTrip.start_time ? new Date(selectedTrip.start_time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                                        {selectedTrip.end_time ? ` - ${new Date(selectedTrip.end_time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit' }) }` : ' (em andamento)'}
                                    </p>
                                    {selectedTrip.drivers && (
                                        <p className="text-xs font-medium text-emerald-600 mt-0.5">
                                            Condutor: {selectedTrip.drivers.name}
                                        </p>
                                    )}
                                </div>
                                <SGFButton 
                                    type="button" 
                                    variant="outline" 
                                    size="sm" 
                                    className="!text-rose-600 !border-rose-200 hover:!bg-rose-50 !rounded-full shrink-0"
                                    onClick={() => {
                                        setSelectedTrip(null);
                                        setTripSearch('');
                                    }}
                                >
                                    Trocar viagem
                                </SGFButton>
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {!selectedTrip ? (
                                <div className="relative" ref={tripSuggestionsRef}>
                                    <SGFInput
                                        label="Viagem correspondente (Opcional)"
                                        value={tripSearch}
                                        onChange={(e) => {
                                            setTripSearch(e.target.value);
                                            setShowTripSuggestions(true);
                                        }}
                                        onFocus={() => setShowTripSuggestions(true)}
                                        placeholder="Buscar viagem por destino ou condutor..."
                                        fullWidth
                                    />
                                    {showTripSuggestions && filteredTrips.length > 0 && (
                                        <div className="absolute z-[3000] left-0 right-0 bottom-full mb-1.5 max-h-60 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-lg custom-scrollbar">
                                            {filteredTrips.map((t) => (
                                                <button
                                                    key={t.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedTrip(t);
                                                        setTripSearch(t.destination ? `Para: ${t.destination}` : 'Viagem sem destino');
                                                        setSelectedDriverId(t.driver_id || '');
                                                        setShowTripSuggestions(false);
                                                    }}
                                                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-emerald-50 transition-colors"
                                                >
                                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                                                        <Route className="h-4.5 w-4.5" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-semibold text-sm text-slate-900 truncate">
                                                            {t.destination ? `Para: ${t.destination}` : 'Viagem sem destino'}
                                                        </p>
                                                        <p className="text-xs text-slate-500 truncate">
                                                            {t.start_time ? new Date(t.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                                            {t.end_time ? ` - ${new Date(t.end_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ' (em andamento)'}
                                                            {t.drivers && ` · Condutor: ${t.drivers.name}`}
                                                        </p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : null}
                            <div className={selectedTrip ? "md:col-span-2" : ""}>
                                <SGFSelect
                                    label="Motorista indicado"
                                    options={drivers.map((d) => ({
                                        value: d.id,
                                        label: formatDriverLabel(d),
                                        photoUrl: d.photo_url,
                                    }))}
                                    value={selectedDriverId}
                                    onChange={(val) => setSelectedDriverId(val)}
                                    placeholder="Selecione o motorista"
                                    fullWidth
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* 5. DOCUMENTO ANEXO */}
                <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/30 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">5. Documento Anexo (Multa)</h4>
                    {attachmentUrl ? (
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 animate-in fade-in duration-200">
                            <FileText className="h-5 w-5 shrink-0 text-slate-400" />
                            <span className="min-w-0 flex-1 truncate text-sm text-slate-700 font-medium">{attachmentName}</span>
                            <div className="flex items-center gap-1 shrink-0">
                                <a 
                                    href={attachmentUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-emerald-600 transition"
                                    title="Visualizar documento"
                                >
                                    <Eye className="h-4.5 w-4.5" />
                                </a>
                                <button 
                                    type="button" 
                                    onClick={() => {
                                        setAttachmentUrl('');
                                        setAttachmentName('');
                                    }} 
                                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-rose-600 transition"
                                    title="Remover documento"
                                >
                                    <X className="h-4.5 w-4.5" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className={
                                'relative cursor-pointer overflow-hidden rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center p-6 text-center ' +
                                (uploadingFile ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/10')
                            }
                        >
                            {uploadingFile ? (
                                <div className="space-y-2">
                                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-600" />
                                    <p className="text-xs font-semibold text-emerald-600">Enviando anexo...</p>
                                </div>
                            ) : (
                                <>
                                    <Download className="h-6 w-6 text-slate-400 mb-2 rotate-180" />
                                    <p className="text-xs font-semibold text-slate-700">Clique para anexar PDF ou Foto da multa</p>
                                    <p className="text-[10px] text-slate-400 mt-1">Formatos suportados: PDF, PNG, JPG (máx. 5MB)</p>
                                </>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="application/pdf,image/*"
                                className="hidden"
                                onChange={handleFileUpload}
                                disabled={uploadingFile}
                            />
                        </div>
                    )}
                </div>

                {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{error}</p>}
            </div>
        </Modal>
    );
}

// ── Modal: gerenciar/indicar condutor ──────────────────────────────────────
const INFRACTION_STEPS = ['Registrada', 'Condutor indicado', 'Aprovada'];

function infractionNextStep(status: string, hasDriver: boolean): { text: string; mine: boolean } {
    if (status === 'rejeitada') return { text: 'Infração rejeitada', mine: false };
    if (status === 'aprovada' || status === 'paga') return { text: 'Indicação aprovada', mine: false };
    if (status === 'indicada') return { text: 'Conferir e aprovar a indicação do condutor', mine: true };
    return { text: hasDriver ? 'Confirmar o condutor sugerido' : 'Indicar o condutor responsável', mine: true };
}

function ManageInfractionModal({ infraction, onClose }: { infraction: InfractionRow | null; onClose: () => void }) {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const [driverId, setDriverId] = useState('');
    const [tripId, setTripId] = useState<string | null>(null);
    const [confirmReject, setConfirmReject] = useState(false);

    const { data: candidates = [] } = useQuery({
        queryKey: ['infraction-candidates', infraction?.id],
        queryFn: () => infractionsApi.findCandidates(infraction!.vehicle_id!, infraction!.occurred_at),
        enabled: Boolean(infraction?.vehicle_id && infraction?.occurred_at),
    });

    const { data: drivers = [] } = useQuery({
        queryKey: ['drivers', 'all-for-infraction'],
        queryFn: () => driversApi.getAll(),
        enabled: Boolean(infraction),
    });

    useSyncOnChange(infraction, () => {
        if (infraction) {
            setDriverId(infraction.indicated_driver_id ?? infraction.suggested_driver_id ?? '');
            setTripId(infraction.indicated_trip_id ?? null);
            setConfirmReject(false);
        }
    });

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['infractions'] });

    const indicateMutation = useMutation({
        mutationFn: () => infractionsApi.indicate(infraction!.id, driverId, tripId),
        onSuccess: () => { invalidate(); toast.success('Condutor indicado com sucesso.'); onClose(); },
        onError: () => toast.error('Erro ao indicar condutor.'),
    });

    const approveMutation = useMutation({
        mutationFn: async () => {
            if (driverId && driverId !== infraction!.indicated_driver_id) {
                await infractionsApi.indicate(infraction!.id, driverId, tripId);
            }
            return infractionsApi.approve(infraction!.id, user!.id);
        },
        onSuccess: () => { invalidate(); toast.success('Indicação aprovada.'); onClose(); },
        onError: () => toast.error('Erro ao aprovar.'),
    });

    const rejectMutation = useMutation({
        mutationFn: () => infractionsApi.reject(infraction!.id, 'Rejeitada pelo gestor'),
        onSuccess: () => { invalidate(); toast.success('Infração rejeitada.'); onClose(); },
        onError: () => toast.error('Erro ao rejeitar.'),
    });

    if (!infraction) return null;
    const meta = STATUS_META[infraction.status] ?? STATUS_META.pendente;
    const closed = ['aprovada', 'rejeitada', 'paga'].includes(infraction.status);
    const driverOptions = drivers.map((d) => ({ value: d.id, label: formatDriverLabel(d), photoUrl: d.photo_url }));
    const selectedDriverObj = drivers.find((d) => d.id === driverId);
    const next = infractionNextStep(infraction.status, Boolean(driverId));
    const stepIndex = infraction.status === 'aprovada' || infraction.status === 'paga' ? 2 : infraction.status === 'indicada' ? 1 : 0;

    const rawData = infraction.raw as { attachment_url?: string; attachment_name?: string } | null;
    const attachmentUrl = rawData?.attachment_url;
    const attachmentName = rawData?.attachment_name;

    const plate = infraction.plate ? infraction.plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : null;
    const vehicleName = [infraction.vehicles?.brand, infraction.vehicles?.model].filter(Boolean).join(' ');
    const busy = indicateMutation.isPending || approveMutation.isPending || rejectMutation.isPending;

    return (
        <WorkshopModalShell
            onClose={onClose}
            eyebrow="Infração de trânsito"
            title={[plate, vehicleName].filter(Boolean).join(' · ') || 'Veículo não identificado'}
            subtitle={[infraction.ait ? `AIT ${infraction.ait}` : null, fmtDateTime(infraction.occurred_at)].filter(Boolean).join(' · ')}
            busy={busy}
            maxWidthClass="sm:max-w-3xl"
            zIndexClass="z-50"
            media={<EntityAvatarLarge url={infraction.vehicles?.photo_url} />}
            footer={(
                <div className="flex w-full flex-wrap items-center justify-end gap-2">
                    <SGFButton variant="ghost" onClick={onClose}>Fechar</SGFButton>
                    {!closed && (
                        <>
                            <SGFButton variant="outline" onClick={() => indicateMutation.mutate()} loading={indicateMutation.isPending} disabled={!driverId || busy}>
                                Salvar indicação
                            </SGFButton>
                            <SGFButton icon={CheckCircle} onClick={() => approveMutation.mutate()} loading={approveMutation.isPending} disabled={!driverId || busy}>
                                Aprovar indicação
                            </SGFButton>
                        </>
                    )}
                </div>
            )}
        >
            <div className="space-y-5">
                {/* Próxima etapa */}
                <div className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                    infraction.status === 'rejeitada' ? 'border-red-200 bg-red-50/60'
                        : next.mine ? 'border-amber-200 bg-amber-50/70' : 'border-emerald-200 bg-emerald-50/60'
                }`}>
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-500">{next.mine ? 'Próxima etapa · sua ação' : 'Situação'}</p>
                        <p className={`text-base font-bold ${infraction.status === 'rejeitada' ? 'text-red-700' : next.mine ? 'text-amber-800' : 'text-emerald-800'}`}>{next.text}</p>
                    </div>
                    <SGFBadge variant={meta.variant}>{meta.label}</SGFBadge>
                </div>

                {infraction.status !== 'rejeitada' && (
                    <ol className="flex items-center gap-1.5">
                        {INFRACTION_STEPS.map((label, i) => (
                            <li key={label} className="flex min-w-0 flex-1 flex-col gap-1.5">
                                <span className={`h-1.5 rounded-full ${i < stepIndex ? 'bg-[var(--sgf-primary)]' : i === stepIndex ? 'bg-[var(--sgf-accent)]' : 'bg-slate-200'}`} />
                                <span className={`truncate text-[11px] ${i === stepIndex ? 'font-bold text-slate-800' : i < stepIndex ? 'font-medium text-slate-600' : 'text-slate-400'}`}>{label}</span>
                            </li>
                        ))}
                    </ol>
                )}

                {/* Dados da multa */}
                <div className="rounded-2xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-100 p-4">
                        <p className="text-xs font-medium text-slate-500">{infraction.code ? `Código ${infraction.code}` : 'Infração'}</p>
                        <p className="text-base font-bold text-slate-900">{infraction.description || 'Infração de trânsito'}</p>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-4 sm:grid-cols-4">
                        <InfoItem icon={Calendar} label="Data e hora" value={fmtDateTime(infraction.occurred_at)} />
                        <InfoItem icon={MapPin} label="Local" value={infraction.location || '—'} />
                        <InfoItem icon={DollarSign} label="Valor" value={formatCurrency(Number(infraction.amount ?? 0))} strong />
                        <InfoItem icon={AlertTriangle} label="Pontos na CNH" value={infraction.points != null ? `${infraction.points} pts` : '—'} />
                    </dl>
                    {attachmentUrl && (
                        <div className="flex items-center gap-3 border-t border-slate-100 p-4">
                            <span className="grid h-9 w-12 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><FileText className="h-4 w-4" /></span>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs text-slate-500">Auto de infração</p>
                                <p className="truncate text-sm font-semibold text-slate-800">{attachmentName || 'Documento da multa'}</p>
                            </div>
                            <a href={attachmentUrl} target="_blank" rel="noopener noreferrer"
                                className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-[var(--sgf-primary)] hover:text-[var(--sgf-primary)]">
                                <Eye className="h-3.5 w-3.5" /> Ver documento
                            </a>
                        </div>
                    )}
                </div>

                {/* Condutor responsável */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-base font-bold text-slate-900">Condutor responsável</p>
                    <p className="mb-3 text-xs text-slate-500">
                        {closed ? 'Condutor registrado nesta infração.' : 'Use a sugestão do GPS (quem estava em viagem no horário) ou escolha outro motorista.'}
                    </p>

                    {!closed && candidates.length > 0 && (
                        <div className="mb-3 space-y-2">
                            {candidates.map((c: InfractionCandidate) => {
                                const active = driverId === c.driverId && tripId === c.tripId;
                                return (
                                    <button
                                        key={c.tripId}
                                        type="button"
                                        onClick={() => { setDriverId(c.driverId); setTripId(c.tripId); }}
                                        className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                                            active ? 'border-[var(--sgf-primary)] bg-[var(--sgf-primary-soft)]' : 'border-slate-200 hover:border-[var(--sgf-primary)]'
                                        }`}
                                    >
                                        <DriverCell name={c.driverName} photoUrl={c.driverPhoto} subtitle={`Em viagem: ${fmtDateTime(c.startAt)}${c.destination ? ` · ${c.destination}` : ''}`} />
                                        <span className="ml-auto shrink-0">
                                            {active
                                                ? <CheckCircle className="h-5 w-5 text-[var(--sgf-primary)]" />
                                                : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Sugerido pelo GPS</span>}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {!closed && candidates.length === 0 && (
                        <p className="mb-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2.5 text-xs text-slate-500">
                            Nenhuma viagem deste veículo no horário da infração. Escolha o motorista abaixo.
                        </p>
                    )}

                    {!closed && (
                        <SGFSelect
                            options={driverOptions}
                            value={driverId}
                            onChange={(v) => { setDriverId(v); setTripId(null); }}
                            placeholder="Escolher outro motorista"
                            fullWidth
                        />
                    )}

                    {selectedDriverObj && (
                        <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                            <DriverCell
                                name={selectedDriverObj.name || selectedDriverObj.full_name}
                                photoUrl={selectedDriverObj.photo_url}
                                subtitle={[selectedDriverObj.cnh_number ? `CNH ${selectedDriverObj.cnh_number}` : null, selectedDriverObj.cnh_category ? `cat. ${selectedDriverObj.cnh_category}` : null].filter(Boolean).join(' · ') || null}
                            />
                            <span className="ml-auto shrink-0 rounded-full bg-[var(--sgf-primary)] px-2.5 py-1 text-[10px] font-bold text-white">
                                {closed ? 'Responsável' : 'Selecionado'}
                            </span>
                        </div>
                    )}
                </div>

                {/* Rejeitar: ação rara, discreta no fim */}
                {!closed && (
                    confirmReject ? (
                        <div className="flex flex-col gap-2 rounded-2xl border border-red-100 bg-red-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-red-800">Rejeitar esta infração? Ela sai da fila de indicação.</p>
                            <div className="flex shrink-0 gap-2">
                                <SGFButton size="sm" variant="ghost" onClick={() => setConfirmReject(false)}>Voltar</SGFButton>
                                <SGFButton size="sm" variant="ghost" icon={X} loading={rejectMutation.isPending}
                                    className="!text-red-600 hover:!bg-red-50" onClick={() => rejectMutation.mutate()}>
                                    Confirmar rejeição
                                </SGFButton>
                            </div>
                        </div>
                    ) : (
                        <div className="flex justify-center pt-1">
                            <button type="button" disabled={busy} onClick={() => setConfirmReject(true)} className="text-sm font-semibold text-red-600 hover:underline disabled:opacity-50">
                                Rejeitar infração
                            </button>
                        </div>
                    )
                )}
            </div>
        </WorkshopModalShell>
    );
}

function InfoItem({ icon: Icon, label, value, strong }: { icon: typeof Calendar; label: string; value: string; strong?: boolean }) {
    return (
        <div className="flex min-w-0 items-start gap-2.5">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className={`truncate ${strong ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{value}</dd>
            </div>
        </div>
    );
}

/** Foto do veículo no cabeçalho do modal; sem foto, o ícone. */
function EntityAvatarLarge({ url }: { url?: string | null }) {
    const [failed, setFailed] = useState(false);
    if (!url || failed) {
        return <div className="grid h-16 w-20 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Car className="h-7 w-7" /></div>;
    }
    return <img src={url} alt="Veículo" onError={() => setFailed(true)} className="h-16 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-slate-200" />;
}
