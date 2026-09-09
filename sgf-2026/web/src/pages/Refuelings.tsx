import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFTable, type SGFTableColumn } from '@/components/sgf/SGFTable';
import { SGFToolbar } from '@/components/sgf/SGFToolbar';
import { Modal } from '@/components/ui/Modal';
import {
    Fuel,
    Eye,
    AlertTriangle,
    XCircle,
    Car,
    Receipt,
    Plus,
} from '@/components/sgf/icons';
import { formatDate, formatCurrency, formatPlate, matchesSearch } from '@/lib/utils';
import { useHeader } from '@/contexts/HeaderContext';
import { SGFKPICard } from '@/components/sgf/SGFKPICard';
import { NewRefuelingForm } from '@/components/refuelings/NewRefuelingForm';
import { AuthorizeFuelingModal } from '@/components/refuelings/AuthorizeFuelingModal';
import { StationOperationsPanel } from '@/components/refuelings/StationOperationsPanel';
import { StationClosingsPanel } from '@/components/refuelings/StationClosingsPanel';
import { RefuelingDetailsModal } from '@/components/refuelings/RefuelingDetailsModal';
import { useRefuelings } from '@/hooks/useRefuelings';
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
    const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') ?? '');
    const [workflowTab, setWorkflowTab] = useState<WorkflowTab>('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showAuthorizeModal, setShowAuthorizeModal] = useState(false);
    const [commitmentStationId, setCommitmentStationId] = useState<string | null>(null);
    const [manualSelectedRefueling, setSelectedRefueling] = useState<RefuelingRow | null>(null);
    const { setTitle, setDescription, setHeaderAction } = useHeader();

    const { data: rawRefuelings = [], isLoading } = useRefuelings();

    const paramId = searchParams.get('id') || searchParams.get('refuelingId');
    const paramSearch = searchParams.get('search');

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
            const matchesTerm = matchesSearch(
                searchTerm,
                refueling.vehicle,
                refueling.driver,
                refueling.station,
            );
            const matchesWorkflow = !workflowTab
                || (workflowTab === 'pending_validation' && refueling.workflowStatus === 'concluido')
                || (workflowTab === 'rejected'
                    && ['rejeitado_admin', 'rejeitado_motorista'].includes(refueling.workflowStatus))
                || refueling.workflowStatus === workflowTab;
            return matchesTerm && matchesWorkflow;
        });
    }, [refuelings, searchTerm, workflowTab]);

    const requestedRefueling = useMemo(() => {
        if (paramId) return refuelings.find((refueling) => refueling.id === paramId) ?? null;
        if (!paramSearch) return null;
        return refuelings.find((refueling) =>
            matchesSearch(
                paramSearch,
                refueling.vehicle,
                refueling.driver,
                refueling.station,
            )
        ) ?? null;
    }, [paramId, paramSearch, refuelings]);
    const selectedRefueling = manualSelectedRefueling
        ? refuelings.find((item) => item.id === manualSelectedRefueling.id) ?? manualSelectedRefueling
        : requestedRefueling;

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
                    }}
                />
            )
        }
    ];

    const closeSelectedRefueling = () => {
        setSelectedRefueling(null);
        if (!paramId) return;
        const next = new URLSearchParams(searchParams);
        next.delete('id');
        next.delete('refuelingId');
        setSearchParams(next, { replace: true });
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
                    }}
                    loading={isLoading}
                    emptyMessage="Nenhum abastecimento encontrado."
                />
            </div>

            <StationOperationsPanel />
            <StationClosingsPanel
                openCommitmentForStationId={commitmentStationId}
                onCommitmentHandled={() => setCommitmentStationId(null)}
            />

            <RefuelingDetailsModal
                refueling={selectedRefueling}
                isOpen={!!selectedRefueling}
                onClose={closeSelectedRefueling}
            />

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
                    onOpenCommitment={(stationId) => {
                        setShowAddModal(false);
                        setCommitmentStationId(stationId);
                    }}
                />
            </Modal>

            <AuthorizeFuelingModal
                isOpen={showAuthorizeModal}
                onClose={() => setShowAuthorizeModal(false)}
                onOpenCommitment={(stationId) => {
                    setShowAuthorizeModal(false);
                    setCommitmentStationId(stationId);
                }}
            />
        </div>
    );
}
