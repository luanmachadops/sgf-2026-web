import { useCallback, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFKPICard } from '@/components/sgf/SGFKPICard';
import { SGFTable, type SGFTableColumn } from '@/components/sgf/SGFTable';
import { SGFToolbar } from '@/components/sgf/SGFToolbar';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import {
    AlertTriangle,
    Receipt,
    DollarSign,
    Plus,
    Download,
    Car,
    MapPin,
    Calendar,
    User,
    CheckCircle,
} from '@/components/sgf/icons';
import { useHeader } from '@/contexts/HeaderContext';
import { useAuth } from '@/contexts/AuthContext';
import { infractionsApi, driversApi, type InfractionCandidate } from '@/lib/supabase-api';
import { formatCurrency, formatDate, formatPlate } from '@/lib/utils';
import type { Tables } from '@/types/database.types';

type InfractionRow = Tables<'infractions'> & {
    vehicles?: { plate?: string; brand?: string; model?: string; departments?: { name?: string } | null } | null;
    suggested?: { id: string; full_name: string } | null;
    indicated?: { id: string; full_name: string } | null;
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
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Infracoes() {
    const { setTitle, setDescription, setHeaderAction } = useHeader();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [selected, setSelected] = useState<InfractionRow | null>(null);

    const { data: infractions = [], isLoading } = useQuery({
        queryKey: ['infractions', statusFilter, searchTerm],
        queryFn: () => infractionsApi.getAll({ status: statusFilter || undefined, search: searchTerm || undefined }),
    });

    const [importing, setImporting] = useState(false);

    const handleImportDetran = useCallback(async () => {
        try {
            setImporting(true);
            await infractionsApi.importFromDetran('');
            toast.success('Multas importadas do DETRAN.');
            queryClient.invalidateQueries({ queryKey: ['infractions'] });
        } catch (e) {
            toast.warning((e as { message?: string })?.message ?? 'Erro ao importar do DETRAN.');
        } finally {
            setImporting(false);
        }
    }, [queryClient]);

    useEffect(() => {
        setTitle('Infrações');
        setDescription('Consulta de multas e indicação do condutor responsável.');
        setHeaderAction(
            <div className="flex flex-wrap items-center justify-end gap-2">
                <SGFButton variant="secondary" icon={Download} loading={importing} onClick={handleImportDetran} className="!rounded-full !h-[37px]">
                    Importar do DETRAN
                </SGFButton>
                <SGFButton icon={Plus} onClick={() => setShowAddModal(true)} className="!rounded-full !h-[37px]">Nova infração</SGFButton>
            </div>
        );
        return () => setHeaderAction(null);
    }, [setTitle, setDescription, setHeaderAction, handleImportDetran, importing]);

    const list = infractions as InfractionRow[];
    const pendingCount = list.filter((i) => i.status === 'pendente').length;
    const totalAmount = list.reduce((s, i) => s + Number(i.amount ?? 0), 0);
    const totalPoints = list.reduce((s, i) => s + Number(i.points ?? 0), 0);

    const columns: SGFTableColumn<InfractionRow>[] = [
        {
            header: 'Infração',
            accessor: (r) => (
                <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{r.description || 'Infração'}</p>
                    <p className="text-xs text-slate-400">{r.ait ? `AIT ${r.ait}` : r.code || '—'} · {fmtDateTime(r.occurred_at)}</p>
                </div>
            ),
        },
        {
            header: 'Veículo',
            accessor: (r) => (
                <div className="flex items-center gap-2">
                    <Car className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{[r.vehicles?.brand, r.vehicles?.model].filter(Boolean).join(' ') || '—'}</p>
                        <p className="font-mono text-xs text-slate-400">{r.plate ? formatPlate(r.plate) : '—'}</p>
                    </div>
                </div>
            ),
        },
        { header: 'Local', accessor: (r) => <span className="text-sm text-slate-600">{r.location || '—'}</span> },
        { header: 'Valor', accessor: (r) => <span className="font-semibold text-slate-800">{formatCurrency(Number(r.amount ?? 0))}</span>, className: 'text-right', headerClassName: 'text-right' },
        {
            header: 'Condutor',
            accessor: (r) => {
                if (r.indicated?.full_name) return <span className="text-sm font-medium text-slate-800">{r.indicated.full_name}</span>;
                if (r.suggested?.full_name) return <span className="text-sm text-emerald-600">sugestão: {r.suggested.full_name}</span>;
                return <span className="text-sm text-slate-400">—</span>;
            },
        },
        {
            header: 'Status',
            accessor: (r) => {
                const meta = STATUS_META[r.status] ?? STATUS_META.pendente;
                return <SGFBadge variant={meta.variant}>{meta.label}</SGFBadge>;
            },
        },
        {
            header: 'Ações',
            headerClassName: 'text-right',
            accessor: (r) => (
                <div className="flex justify-end">
                    <SGFButton size="sm" variant="ghost" onClick={() => setSelected(r)}>Gerenciar</SGFButton>
                </div>
            ),
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
            >
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {STATUS_TABS.map((t) => {
                        const isActive = statusFilter === t.value;
                        return (
                            <button
                                key={t.value || 'all'}
                                type="button"
                                onClick={() => setStatusFilter(t.value)}
                                className={
                                    'px-4 py-2.5 rounded-full text-sm font-semibold border transition whitespace-nowrap ' +
                                    (isActive ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300')
                                }
                            >
                                {t.label}
                            </button>
                        );
                    })}
                </div>
            </SGFToolbar>

            <div className="-mx-6 md:mx-0">
                <SGFTable
                    columns={columns}
                    data={list}
                    keyExtractor={(r) => r.id}
                    loading={isLoading}
                    emptyMessage="Nenhuma infração registrada."
                />
            </div>

            <NewInfractionModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
            <ManageInfractionModal infraction={selected} onClose={() => setSelected(null)} />
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

    useEffect(() => {
        if (isOpen) {
            setPlate(''); setAit(''); setDescription(''); setLocation('');
            setDate(''); setTime(''); setAmount(''); setPoints(''); setDueDate(''); setError(null);
        }
    }, [isOpen]);

    const createMutation = useMutation({
        mutationFn: () => {
            const occurredAt = date ? new Date(`${date}T${time || '12:00'}:00`).toISOString() : new Date().toISOString();
            return infractionsApi.create({
                plate: plate.trim().toUpperCase() || null,
                ait: ait.trim() || null,
                description: description.trim() || null,
                location: location.trim() || null,
                occurred_at: occurredAt,
                amount: amount ? Number(amount) : 0,
                points: points ? Number(points) : 0,
                due_date: dueDate || null,
                source: 'manual',
            });
        },
        onSuccess: (created) => {
            queryClient.invalidateQueries({ queryKey: ['infractions'] });
            toast.success(created.suggested_driver_id
                ? 'Infração registrada. Motorista sugerido pelo histórico de viagens.'
                : 'Infração registrada.');
            onClose();
        },
        onError: (e: unknown) => setError((e as { message?: string })?.message ?? 'Erro ao registrar a infração.'),
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
                    <SGFButton variant="ghost" onClick={onClose} disabled={createMutation.isPending}>Cancelar</SGFButton>
                    <SGFButton onClick={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!plate || !date}>
                        Registrar
                    </SGFButton>
                </ModalFooter>
            )}
        >
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFInput label="Placa" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="ABC-1234" fullWidth />
                    <SGFInput label="Nº do AIT" value={ait} onChange={(e) => setAit(e.target.value)} placeholder="Auto de infração" fullWidth />
                </div>
                <SGFInput label="Descrição da infração" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth />
                <SGFInput label="Local" value={location} onChange={(e) => setLocation(e.target.value)} fullWidth />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <SGFInput label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} fullWidth />
                    <SGFInput label="Hora" type="time" value={time} onChange={(e) => setTime(e.target.value)} fullWidth />
                    <SGFInput label="Valor (R$)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} fullWidth />
                    <SGFInput label="Pontos" type="number" value={points} onChange={(e) => setPoints(e.target.value)} fullWidth />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SGFInput label="Vencimento" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} fullWidth />
                </div>
                {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{error}</p>}
            </div>
        </Modal>
    );
}

// ── Modal: gerenciar/indicar condutor ──────────────────────────────────────
function ManageInfractionModal({ infraction, onClose }: { infraction: InfractionRow | null; onClose: () => void }) {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const [driverId, setDriverId] = useState('');
    const [tripId, setTripId] = useState<string | null>(null);

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

    useEffect(() => {
        if (infraction) {
            setDriverId(infraction.indicated_driver_id ?? infraction.suggested_driver_id ?? '');
            setTripId(infraction.indicated_trip_id ?? null);
        }
    }, [infraction]);

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['infractions'] });

    const indicateMutation = useMutation({
        mutationFn: () => infractionsApi.indicate(infraction!.id, driverId, tripId),
        onSuccess: () => { invalidate(); toast.success('Condutor indicado.'); onClose(); },
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
    const driverOptions = drivers.map((d) => ({ value: (d as { id: string }).id, label: (d as { name?: string; full_name?: string }).name ?? (d as { full_name?: string }).full_name ?? 'Motorista' }));

    return (
        <Modal
            isOpen={Boolean(infraction)}
            onClose={onClose}
            title="Gerenciar infração"
            description="Confira a multa e defina o condutor responsável."
            size="lg"
            footer={(
                <ModalFooter>
                    <SGFButton variant="ghost" className="text-rose-600 hover:bg-rose-50" onClick={() => rejectMutation.mutate()} loading={rejectMutation.isPending}>
                        Rejeitar
                    </SGFButton>
                    <div className="flex-1" />
                    <SGFButton variant="secondary" onClick={() => indicateMutation.mutate()} loading={indicateMutation.isPending} disabled={!driverId}>
                        Salvar indicação
                    </SGFButton>
                    <SGFButton onClick={() => approveMutation.mutate()} loading={approveMutation.isPending} disabled={!driverId}>
                        Aprovar indicação
                    </SGFButton>
                </ModalFooter>
            )}
        >
            <div className="space-y-5">
                {/* Resumo da multa */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="font-bold text-slate-900">{infraction.description || 'Infração'}</p>
                            <p className="text-xs text-slate-500">{infraction.ait ? `AIT ${infraction.ait}` : infraction.code || '—'}</p>
                        </div>
                        <SGFBadge variant={meta.variant}>{meta.label}</SGFBadge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                        <Info icon={Car} label="Placa" value={infraction.plate ? formatPlate(infraction.plate) : '—'} />
                        <Info icon={Calendar} label="Data/hora" value={fmtDateTime(infraction.occurred_at)} />
                        <Info icon={MapPin} label="Local" value={infraction.location || '—'} />
                        <Info icon={DollarSign} label="Valor" value={formatCurrency(Number(infraction.amount ?? 0))} />
                    </div>
                </div>

                {/* Sugestão do sistema */}
                <div>
                    <p className="mb-2 text-sm font-semibold text-slate-700">Sugestões pelo histórico de viagens</p>
                    {candidates.length === 0 ? (
                        <SGFCard padding="sm" className="border border-dashed border-slate-200">
                            <p className="text-sm text-slate-400">Nenhuma viagem deste veículo coincide com a data/hora da infração.</p>
                        </SGFCard>
                    ) : (
                        <div className="space-y-2">
                            {candidates.map((c: InfractionCandidate) => {
                                const active = driverId === c.driverId && tripId === c.tripId;
                                return (
                                    <button
                                        key={c.tripId}
                                        type="button"
                                        onClick={() => { setDriverId(c.driverId); setTripId(c.tripId); }}
                                        className={
                                            'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ' +
                                            (active ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-200')
                                        }
                                    >
                                        {c.driverPhoto ? (
                                            <img src={c.driverPhoto} alt={c.driverName} className="h-9 w-9 shrink-0 rounded-full object-cover" />
                                        ) : (
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                                                <User className="h-4 w-4" />
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-slate-900">{c.driverName}</p>
                                            <p className="text-xs text-slate-500 truncate">
                                                Viagem {fmtDateTime(c.startAt)} {c.destination ? `· ${c.destination}` : ''}
                                            </p>
                                        </div>
                                        {active && <CheckCircle className="h-5 w-5 text-emerald-500" />}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Seleção manual */}
                <div>
                    <SGFSelect
                        label="Condutor indicado"
                        options={driverOptions}
                        value={driverId}
                        onChange={(v) => { setDriverId(v); setTripId(null); }}
                        placeholder="Selecione o motorista"
                        fullWidth
                    />
                    <p className="mt-1 text-xs text-slate-400">Você pode usar a sugestão do sistema ou escolher outro motorista manualmente.</p>
                </div>
            </div>
        </Modal>
    );
}

function Info({ icon: Icon, label, value }: { icon: typeof Car; label: string; value: string }) {
    return (
        <div className="flex items-start gap-2">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                <p className="text-sm font-medium text-slate-800 break-words">{value}</p>
            </div>
        </div>
    );
}
