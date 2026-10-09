import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { LocationPicker } from '@/components/sgf/LocationPicker';
import {
    AlertTriangle,
    Receipt,
    DollarSign,
    Plus,
    Download,
    Car,
    Route,
    Loader2,
    FileText,
    X,
    Eye,
} from '@/components/sgf/icons';
import { useHeader } from '@/contexts/HeaderContext';
import { useBranding } from '@/contexts/BrandingContext';
import { infractionsApi, driversApi, vehiclesApi, tripsApi, type VehicleRecord, type TripRecord } from '@/lib/supabase-api';
import { formatCurrency, formatPlate, formatDriverLabel, formatCPF, matchesSearch } from '@/lib/utils';
import { uploadFoto } from '@/lib/fotoStorage';
import { prepareUpload, uploadFileId } from '@/lib/imageUtils';
import { ManageInfractionModal } from '@/components/infractions/InfractionManager';
import { STATUS_META, cityFromAddress, fmtDateTime, type InfractionRow } from '@/lib/infractionFormat';
import { useSyncOnChange } from '@/hooks/useSyncOnChange';

const STATUS_TABS = [
    { value: '', label: 'Todas' },
    { value: 'pendente', label: 'Pendentes' },
    { value: 'indicada', label: 'Indicadas' },
    { value: 'aprovada', label: 'Aprovadas' },
    { value: 'rejeitada', label: 'Rejeitadas' },
];

export default function Infracoes() {
    const navigate = useNavigate();
    const { branding } = useBranding();
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
        {
            header: 'Local',
            // Só a cidade na tabela; o endereço completo aparece ao passar o mouse.
            accessor: (r) => (
                <span className="block max-w-[160px] truncate whitespace-nowrap text-sm text-slate-600" title={r.location ?? undefined}>
                    {cityFromAddress(r.location, branding.city)}
                </span>
            ),
        },
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
                    onRowClick={(row) => navigate(`/infracoes/${row.id}`)}
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
    const [locationPin, setLocationPin] = useState<{ lat: number; lng: number } | null>(null);
    const { branding: newBranding } = useBranding();
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
            setPlate(''); setAit(''); setDescription(''); setLocation(''); setLocationPin(null);
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
                lat: locationPin?.lat ?? null,
                lng: locationPin?.lng ?? null,
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
                        <div>
                            <p className="mb-2 text-[var(--sgf-text-sm)] font-[var(--sgf-font-semibold)] text-[var(--sgf-text-primary)]">Local</p>
                            <LocationPicker
                                value={locationPin}
                                onChange={setLocationPin}
                                address={location}
                                onAddressChange={setLocation}
                                cityHint={[newBranding.city, newBranding.state].filter(Boolean).join(', ') || undefined}
                            />
                        </div>
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
                                        description: [d.cpf ? `CPF ${formatCPF(d.cpf)}` : null, d.cnh_number ? `CNH ${d.cnh_number}` : null].filter(Boolean).join(' · ') || undefined,
                                        keywords: [d.cpf, d.cnh_number, (d as { registration_number?: string | null }).registration_number, (d as { email?: string | null }).email].filter(Boolean).join(' '),
                                    }))}
                                    value={selectedDriverId}
                                    onChange={(val) => setSelectedDriverId(val)}
                                    placeholder="Selecione o motorista"
                                    searchable
                                    searchPlaceholder="Buscar por nome, CPF ou CNH"
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
