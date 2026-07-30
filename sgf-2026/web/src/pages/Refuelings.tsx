import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFTable, type SGFTableColumn } from '@/components/sgf/SGFTable';
import { SGFToolbar } from '@/components/sgf/SGFToolbar';
import { SGFTextarea } from '@/components/sgf/SGFTextarea';
import { Modal } from '@/components/ui/Modal';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import {
    Fuel,
    Eye,
    AlertTriangle,
    XCircle,
    Car,
    Receipt,
    Plus,
    User,
    MapPin,
} from '@/components/sgf/icons';
import { formatDate, formatCurrency, cn, formatPlate } from '@/lib/utils';
import { useHeader } from '@/contexts/HeaderContext';
import { SGFKPICard } from '@/components/sgf/SGFKPICard';
import { NewRefuelingForm } from '@/components/refuelings/NewRefuelingForm';
import { AuthorizeFuelingModal } from '@/components/refuelings/AuthorizeFuelingModal';
import { StationOperationsPanel } from '@/components/refuelings/StationOperationsPanel';
import { useRefuelings, useValidateRefueling, useCancelFuelAuthorization } from '@/hooks/useRefuelings';
import type { Tables } from '@/types/database.types';

type WorkflowStatus = 'autorizado' | 'concluido' | 'rejeitado_motorista' | 'validado' | 'rejeitado_admin' | 'lancado_direto';

type WorkflowTab = '' | 'pending_validation' | 'rejected' | WorkflowStatus;

const WORKFLOW_TABS: Array<{ value: WorkflowTab; label: string }> = [
    { value: '', label: 'Todos' },
    { value: 'autorizado', label: 'Aguardando o posto' },
    { value: 'pending_validation', label: 'Aguardando validação' },
    { value: 'validado', label: 'Validados' },
    { value: 'rejeitado_admin', label: 'Rejeitados' },
    { value: 'lancado_direto', label: 'Lançamentos diretos' },
];

function workflowBadge(status: WorkflowStatus | null | undefined): { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'default' } {
    switch (status) {
        case 'autorizado':            return { label: 'Autorizado',           variant: 'info' };
        case 'concluido':             return { label: 'Aguardando validação', variant: 'warning' };
        case 'rejeitado_motorista':   return { label: 'Recusado pelo motorista', variant: 'error' };
        case 'validado':              return { label: 'Validado',              variant: 'success' };
        case 'rejeitado_admin':       return { label: 'Rejeitado',             variant: 'error' };
        case 'lancado_direto':        return { label: 'Lançamento direto',     variant: 'default' };
        default:                      return { label: '—',                     variant: 'default' };
    }
}

type RefuelingWithRelations = Tables<'fuelings'> & {
    // Alias adicionado por decorateFueling (created_at → date).
    date?: string | null;
    vehicles?: { plate: string; brand?: string | null; model?: string | null; photo_url?: string | null } | null;
    drivers?: { name: string; photo_url?: string | null } | null;
    station_relation?: { id: string; name: string; code: string | null } | null;
    workflow_status?: WorkflowStatus;
};

type RefuelingRow = {
    id: string;
    date: string | null;
    vehicle: string;
    vehicleModel: string;
    vehiclePhoto: string | null;
    driver: string;
    driverPhoto: string | null;
    liters: number;
    cost: number;
    pricePerLiter: number;
    odometer: number;
    fuelType: string;
    station: string;
    consumption: number | null;
    isValidated: boolean;
    hasAnomaly: boolean;
    workflowStatus: WorkflowStatus;
    maxLiters: number | null;
    fullTank: boolean | null;
    photoRequisition: string | null;
    photoDashboard: string | null;
    photoPump: string | null;
    photoReceipt: string | null;
    receiptNumber: string | null;
};

export default function Refuelings() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState('');
    const [workflowTab, setWorkflowTab] = useState<WorkflowTab>('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showAuthorizeModal, setShowAuthorizeModal] = useState(false);
    const [manualSelectedRefueling, setSelectedRefueling] = useState<RefuelingRow | null>(null);
    const [reviewReason, setReviewReason] = useState('');
    const [photoViewer, setPhotoViewer] = useState<{ images: string[]; index: number } | null>(null);
    const { setTitle, setDescription, setHeaderAction } = useHeader();
    const validateMutation = useValidateRefueling();
    const cancelAuth = useCancelFuelAuthorization();

    const { data: rawRefuelings = [], isLoading } = useRefuelings();

    const paramId = searchParams.get('id') || searchParams.get('refuelingId');
    const paramSearch = searchParams.get('search');

    useEffect(() => {
        if (paramSearch) {
            setSearchTerm(paramSearch);
        }
    }, [paramSearch]);

    useEffect(() => {
        setTitle('Abastecimentos');
        setDescription('Lançamentos de abastecimento, consumo e validações.');

        setHeaderAction(
            <div className="flex flex-wrap items-center justify-end gap-2">
                <SGFButton variant="secondary" onClick={() => setShowAuthorizeModal(true)} icon={Plus} className="!rounded-full !h-[37px]">
                    Autorizar abastecimento
                </SGFButton>
                <SGFButton onClick={() => setShowAddModal(true)} icon={Plus} className="!rounded-full !h-[37px]">
                    Lançamento direto
                </SGFButton>
            </div>
        );

        return () => {
            setHeaderAction(null);
        };
    }, [setTitle, setDescription, setHeaderAction]);

    const refuelings = useMemo(() => {
        return (rawRefuelings as unknown as RefuelingWithRelations[]).map((row): RefuelingRow => {
            const liters = Number(row.liters ?? 0);
            const cost = Number(row.total_cost ?? 0);
            const pricePerLiter = liters > 0 ? cost / liters : Number(row.price_per_liter ?? 0);
            const vehicleModel = row.vehicles
                ? `${row.vehicles.brand || ''} ${row.vehicles.model || ''}`.trim()
                : 'Sem veículo';

            return {
                id: row.id,
                date: row.date ?? null,
                vehicle: row.vehicles?.plate || 'Sem placa',
                vehicleModel: vehicleModel || 'Sem veículo',
                vehiclePhoto: row.vehicles?.photo_url ?? null,
                driver: row.drivers?.name || 'Sem motorista',
                driverPhoto: row.drivers?.photo_url ?? null,
                liters,
                cost,
                pricePerLiter,
                odometer: Number(row.odometer ?? 0),
                fuelType: row.fuel_type ?? '',
                station: row.station_relation?.name ?? row.station ?? '',
                consumption: row.km_per_liter,
                isValidated: Boolean(row.validated_at),
                hasAnomaly: Boolean(row.has_anomaly),
                workflowStatus: (row.workflow_status as WorkflowStatus) ?? 'lancado_direto',
                maxLiters: row.max_liters ?? null,
                fullTank: (row.full_tank as boolean | null) ?? null,
                photoRequisition: row.photo_requisition_url ?? null,
                photoDashboard: row.photo_dashboard_url ?? null,
                photoPump: row.photo_pump_url ?? null,
                photoReceipt: row.photo_receipt_url ?? null,
                receiptNumber: row.pump_receipt_number ?? null,
            };
        });
    }, [rawRefuelings]);

    const filteredRefuelings = useMemo(() => {
        return refuelings.filter((refueling) => {
            const term = searchTerm.trim().toLowerCase();
            const matchesSearch = !term
                || refueling.vehicle.toLowerCase().includes(term)
                || refueling.driver.toLowerCase().includes(term)
                || refueling.station.toLowerCase().includes(term);
            const matchesWorkflow = !workflowTab
                || (workflowTab === 'pending_validation' && refueling.workflowStatus === 'concluido')
                || (workflowTab === 'rejected'
                    && ['rejeitado_admin', 'rejeitado_motorista'].includes(refueling.workflowStatus))
                || refueling.workflowStatus === workflowTab;
            return matchesSearch && matchesWorkflow;
        });
    }, [refuelings, searchTerm, workflowTab]);

    const requestedRefueling = useMemo(() => {
        if (paramId) return refuelings.find((refueling) => refueling.id === paramId) ?? null;
        if (!paramSearch) return null;
        const term = paramSearch.trim().toLowerCase();
        return refuelings.find((refueling) =>
            refueling.vehicle?.toLowerCase() === term
            || refueling.vehicle?.toLowerCase().replace('-', '') === term.replace('-', '')
            || refueling.driver?.toLowerCase().includes(term)
            || refueling.station?.toLowerCase().includes(term)
        ) ?? null;
    }, [paramId, paramSearch, refuelings]);
    const selectedRefueling = manualSelectedRefueling ?? requestedRefueling;

    const totalLiters = filteredRefuelings.reduce((sum, row) => sum + row.liters, 0);
    const totalCost = filteredRefuelings.reduce((sum, row) => sum + row.cost, 0);
    const anomalyCount = refuelings.filter((row) => row.hasAnomaly).length;
    const pendingCount = refuelings.filter((row) => row.workflowStatus === 'concluido').length;

    const columns: SGFTableColumn<RefuelingRow>[] = [
        { header: 'Data', accessor: (row) => row.date ? formatDate(row.date) : '-' },
        {
            header: 'Veículo',
            accessor: (row) => (
                <div className="flex items-center gap-2.5">
                    {row.vehiclePhoto ? (
                        <img src={row.vehiclePhoto} alt={row.vehicleModel} className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                    ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                            <Car className="h-4 w-4 text-slate-400" />
                        </div>
                    )}
                    <span className="font-semibold text-slate-800 text-sm">{row.vehicleModel}</span>
                </div>
            )
        },
        {
            header: 'Placa',
            accessor: (row) => (
                <span className="font-mono font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs whitespace-nowrap">
                    {formatPlate(row.vehicle)}
                </span>
            )
        },
        {
            header: 'Motorista',
            accessor: (row) => (
                <span className="text-sm text-slate-600 font-medium">{row.driver}</span>
            )
        },
        { header: 'Litros', accessor: (row) => `${row.liters.toFixed(1)} L` },
        { header: 'Valor', accessor: (row) => formatCurrency(row.cost) },
        { header: 'R$/L', accessor: (row) => formatCurrency(row.pricePerLiter) },
        {
            header: 'Consumo',
            accessor: (row) => (
                <div className="flex items-center gap-1">
                    <span>{row.consumption ? `${row.consumption.toFixed(1)} km/L` : '-'}</span>
                    {row.hasAnomaly && (
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                </div>
            )
        },
        {
            header: 'Workflow',
            accessor: (row) => {
                const b = workflowBadge(row.workflowStatus);
                return <SGFBadge variant={b.variant}>{b.label}</SGFBadge>;
            },
        },
        {
            header: 'Ações',
            sortable: false,
            accessor: (row) => (
                <SGFButton
                    variant="ghost"
                    size="sm"
                    icon={Eye}
                    onClick={(event) => {
                        event.stopPropagation();
                        setSelectedRefueling(row);
                        setReviewReason('');
                    }}
                />
            )
        }
    ];

    const closeSelectedRefueling = () => {
        setSelectedRefueling(null);
        setReviewReason('');
        if (!paramId) return;
        const next = new URLSearchParams(searchParams);
        next.delete('id');
        next.delete('refuelingId');
        setSearchParams(next, { replace: true });
    };

    const handleValidate = (approved: boolean) => {
        if (!selectedRefueling) return;
        if (!approved && !reviewReason.trim()) return;
        if (approved && (!selectedRefueling.photoPump || !selectedRefueling.receiptNumber?.trim())) return;

        validateMutation.mutate(
            {
                id: selectedRefueling.id,
                approved,
                notes: reviewReason.trim() || undefined,
            },
            {
                onSuccess: closeSelectedRefueling,
            }
        );
    };

    const tabCounts = useMemo(() => ({
        all: refuelings.length,
        autorizado: refuelings.filter(r => r.workflowStatus === 'autorizado').length,
        concluido: refuelings.filter(r => r.workflowStatus === 'concluido').length,
        validado: refuelings.filter(r => r.workflowStatus === 'validado').length,
        rejeitado_admin: refuelings.filter(r =>
            ['rejeitado_admin', 'rejeitado_motorista'].includes(r.workflowStatus),
        ).length,
        lancado_direto: refuelings.filter(r => r.workflowStatus === 'lancado_direto').length,
    }), [refuelings]);

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
                <SGFKPICard
                    title="Volume Total"
                    value={`${totalLiters.toFixed(1)} L`}
                    icon={Fuel}
                    iconColor="text-blue-500"
                    chartColor="#3b82f6"
                    chartData={[]}
                />
                <SGFKPICard
                    title="Gasto Total"
                    value={formatCurrency(totalCost)}
                    icon={Receipt}
                    iconColor="text-emerald-500"
                    chartColor="#10b981"
                    chartData={[]}
                />
                <SGFKPICard
                    title="Anomalias"
                    value={anomalyCount}
                    icon={AlertTriangle}
                    iconColor="text-amber-500"
                    chartColor="#f59e0b"
                    chartData={[]}
                />
                <SGFKPICard
                    title="Aguardando Validação"
                    value={pendingCount}
                    icon={XCircle}
                    iconColor="text-orange-500"
                    chartColor="#f97316"
                    chartData={[]}
                />
            </div>

            <SGFToolbar
                searchValue={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Pesquisar por veículo ou motorista..."
            >
                {/* Tabs de workflow */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {WORKFLOW_TABS.map((t) => {
                        const isActive = workflowTab === t.value;
                        const count = t.value === '' ? tabCounts.all
                            : t.value === 'pending_validation' ? tabCounts.concluido
                            : (tabCounts[t.value as keyof typeof tabCounts] ?? 0);
                        return (
                            <button
                                key={t.value || 'all'}
                                type="button"
                                onClick={() => setWorkflowTab(t.value)}
                                className={
                                    'px-4 py-2.5 rounded-full text-sm font-semibold border transition whitespace-nowrap ' +
                                    (isActive
                                        ? 'bg-emerald-500 text-white border-emerald-500'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300')
                                }
                            >
                                {t.label} <span className="opacity-70 ml-1">{count}</span>
                            </button>
                        );
                    })}
                </div>
            </SGFToolbar>

            <div className="-mx-6 md:mx-0">
                <SGFTable
                    columns={columns}
                    data={filteredRefuelings}
                    keyExtractor={(row) => row.id}
                    onRowClick={(row) => {
                        setSelectedRefueling(row);
                        setReviewReason('');
                    }}
                    loading={isLoading}
                    emptyMessage="Nenhum abastecimento encontrado."
                />
            </div>

            <StationOperationsPanel />

            <Modal
                isOpen={!!selectedRefueling}
                onClose={closeSelectedRefueling}
                title="Detalhes do Abastecimento"
                size="lg"
                footer={
                    <div className="flex w-full justify-between items-center">
                        <div className="flex gap-2">
                            {/* Quando ainda é autorização pendente (motorista não preencheu): só cancelar */}
                            {selectedRefueling?.workflowStatus === 'autorizado' && (
                                <SGFButton
                                    variant="ghost"
                                    className="text-rose-600 hover:bg-rose-50"
                                    onClick={() => {
                                        if (!selectedRefueling) return;
                                        cancelAuth.mutate({ id: selectedRefueling.id, reason: reviewReason }, {
                                            onSuccess: closeSelectedRefueling,
                                        });
                                    }}
                                    disabled={cancelAuth.isPending || !reviewReason.trim()}
                                >
                                    Cancelar autorização
                                </SGFButton>
                            )}
                            {/* Só a execução concluída pelo posto entra na conferência. */}
                            {selectedRefueling?.workflowStatus === 'concluido' && (
                                <>
                                    <SGFButton
                                        variant="ghost"
                                        className="text-rose-600 hover:bg-rose-50"
                                        onClick={() => handleValidate(false)}
                                        disabled={validateMutation.isPending || !reviewReason.trim()}
                                    >
                                        Rejeitar
                                    </SGFButton>
                                    <SGFButton
                                        variant="primary"
                                        onClick={() => handleValidate(true)}
                                        disabled={validateMutation.isPending
                                            || !selectedRefueling.photoPump
                                            || !selectedRefueling.receiptNumber?.trim()}
                                    >
                                        Validar Abastecimento
                                    </SGFButton>
                                </>
                            )}
                        </div>
                        <SGFButton variant="ghost" onClick={closeSelectedRefueling}>
                            Fechar
                        </SGFButton>
                    </div>
                }
            >
                {selectedRefueling && (() => {
                    const badge = workflowBadge(selectedRefueling.workflowStatus);
                    const proofs = [
                        { url: selectedRefueling.photoPump, label: 'Bico da bomba' },
                        { url: selectedRefueling.photoRequisition, label: 'Requisição' },
                        { url: selectedRefueling.photoDashboard, label: 'Painel / Hodômetro' },
                        { url: selectedRefueling.photoReceipt, label: 'Cupom fiscal' },
                    ].filter((p): p is { url: string; label: string } => !!p.url);
                    return (
                    <div className="space-y-6">
                        {/* Faixa de status */}
                        <div className="flex items-center justify-between gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100">
                                    <Fuel className="h-5 w-5 text-emerald-500" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Status do abastecimento</p>
                                    <p className="font-bold text-slate-800 truncate">
                                        {selectedRefueling.date ? formatDate(selectedRefueling.date) : '—'}
                                        {selectedRefueling.station ? ` · ${selectedRefueling.station}` : ''}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {selectedRefueling.hasAnomaly && <SGFBadge variant="warning">Anomalia</SGFBadge>}
                                <SGFBadge variant={badge.variant}>{badge.label}</SGFBadge>
                            </div>
                        </div>

                        <div className="grid gap-6 md:grid-cols-2">
                            {/* Identificação */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    {selectedRefueling.vehiclePhoto ? (
                                        <img
                                            src={selectedRefueling.vehiclePhoto}
                                            alt={selectedRefueling.vehicleModel}
                                            className="h-12 w-16 shrink-0 rounded-xl object-cover ring-1 ring-slate-200"
                                        />
                                    ) : (
                                        <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                                            <Car width={22} height={22} />
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Veículo</p>
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-slate-800 truncate">{selectedRefueling.vehicleModel}</p>
                                            <span className="font-mono font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs whitespace-nowrap">
                                                {formatPlate(selectedRefueling.vehicle)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    {selectedRefueling.driverPhoto ? (
                                        <img
                                            src={selectedRefueling.driverPhoto}
                                            alt={selectedRefueling.driver}
                                            className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
                                        />
                                    ) : (
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                                            <User width={20} height={20} />
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Motorista</p>
                                        <p className="font-bold text-slate-800">{selectedRefueling.driver}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl">
                                        <MapPin width={20} height={20} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Odômetro</p>
                                        <p className="font-bold text-slate-800">{selectedRefueling.odometer.toLocaleString('pt-BR')} km</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl">
                                        <Fuel width={20} height={20} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Abastecimento</p>
                                        <p className="font-bold text-slate-800">
                                            {selectedRefueling.fullTank === true ? 'Tanque completo' : selectedRefueling.fullTank === false ? 'Parcial' : 'Não informado'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Resumo financeiro */}
                            <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 space-y-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumo Financeiro</p>
                                    <div className="px-2 py-0.5 bg-white rounded-lg border border-slate-200 text-[10px] font-bold text-slate-500">
                                        {selectedRefueling.fuelType || '—'}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-500">Quantidade</span>
                                        <span className="font-bold text-slate-800">
                                            {selectedRefueling.liters.toFixed(1)} L
                                            {selectedRefueling.maxLiters ? <span className="font-medium text-slate-400"> / até {Number(selectedRefueling.maxLiters).toFixed(1)} L</span> : null}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-500">Preço p/ Litro</span>
                                        <span className="font-bold text-slate-800">{formatCurrency(selectedRefueling.pricePerLiter)}</span>
                                    </div>
                                    <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                                        <span className="text-slate-500 font-bold">Valor Total</span>
                                        <span className="font-black text-emerald-600 text-xl">{formatCurrency(selectedRefueling.cost)}</span>
                                    </div>
                                </div>

                                <div className="pt-4 mt-2 border-t border-slate-200">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Eficiência</p>
                                        <span className={cn(
                                            "font-black text-lg",
                                            (selectedRefueling.consumption || 0) > 8 ? "text-emerald-600" : "text-amber-600"
                                        )}>
                                            {selectedRefueling.consumption ? `${selectedRefueling.consumption.toFixed(1)} km/L` : '—'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {(selectedRefueling.workflowStatus === 'autorizado'
                            || selectedRefueling.workflowStatus === 'concluido') && (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <SGFTextarea
                                    label={selectedRefueling.workflowStatus === 'autorizado'
                                        ? 'Motivo do cancelamento'
                                        : 'Parecer da gestão'}
                                    value={reviewReason}
                                    onChange={(event) => setReviewReason(event.target.value)}
                                    placeholder={selectedRefueling.workflowStatus === 'concluido'
                                        ? 'Opcional ao validar; obrigatório ao rejeitar'
                                        : 'Obrigatório para cancelar a autorização'}
                                    rows={2}
                                    fullWidth
                                />
                            </div>
                        )}

                        {/* Comprovantes enviados pelo posto ou anexados na contingência. */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Comprovantes da execução</p>
                                {proofs.length > 0 && (
                                    <p className="text-[11px] font-semibold text-slate-400">{proofs.length} foto{proofs.length > 1 ? 's' : ''} · clique para ampliar</p>
                                )}
                            </div>
                            {proofs.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                                    <p className="text-sm font-medium text-slate-400">Nenhuma evidência fotográfica anexada.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    {proofs.map((p, i) => (
                                        <button
                                            key={p.label}
                                            type="button"
                                            onClick={() => setPhotoViewer({ images: proofs.map((x) => x.url), index: i })}
                                            className="group relative aspect-video overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                        >
                                            <img src={p.url} alt={p.label} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
                                            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-black/0 px-2.5 pb-1.5 pt-5 text-left text-[11px] font-semibold text-white">
                                                {p.label}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                                <span className="text-slate-500">Número do cupom</span>
                                <span className={cn(
                                    'font-bold',
                                    selectedRefueling.receiptNumber ? 'text-slate-800' : 'text-rose-600',
                                )}>
                                    {selectedRefueling.receiptNumber || 'Não informado'}
                                </span>
                            </div>
                        </div>

                        {selectedRefueling.workflowStatus === 'concluido'
                            && (!selectedRefueling.photoPump || !selectedRefueling.receiptNumber?.trim()) && (
                            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                                <p className="text-sm font-medium text-amber-900">
                                    A aprovação está bloqueada porque falta a foto do bico ou o número do cupom.
                                    Rejeite o lançamento com a justificativa para o posto corrigir o processo.
                                </p>
                            </div>
                        )}

                        {selectedRefueling.hasAnomaly && (
                            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                                <AlertTriangle className="h-5 w-5 text-amber-500" />
                                <p className="text-sm text-amber-800 font-medium">
                                    <span className="font-black">Anomalia detectada:</span> Registro marcado fora do padrão esperado.
                                </p>
                            </div>
                        )}
                    </div>
                    );
                })()}
            </Modal>
            <PhotoViewer images={photoViewer?.images} startIndex={photoViewer?.index ?? 0} onClose={() => setPhotoViewer(null)} />

            <Modal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                title="Novo Abastecimento"
                description="Contingência: lance um comprovante já realizado fora do portal do posto."
                size="lg"
            >
                <NewRefuelingForm
                    onSuccess={() => setShowAddModal(false)}
                    onCancel={() => setShowAddModal(false)}
                />
            </Modal>

            <AuthorizeFuelingModal
                isOpen={showAuthorizeModal}
                onClose={() => setShowAuthorizeModal(false)}
            />
        </div>
    );
}
