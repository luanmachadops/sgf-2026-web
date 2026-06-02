import { useEffect, useMemo, useState } from 'react';
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
    User,
    MapPin,
} from '@/components/sgf/icons';
import { formatDate, formatCurrency, cn, formatPlate } from '@/lib/utils';
import { useHeader } from '@/contexts/HeaderContext';
import { SGFKPICard } from '@/components/sgf/SGFKPICard';
import { NewRefuelingForm } from '@/components/refuelings/NewRefuelingForm';
import { AuthorizeFuelingModal } from '@/components/refuelings/AuthorizeFuelingModal';
import { useRefuelings, useValidateRefueling, useCancelFuelAuthorization } from '@/hooks/useRefuelings';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/types/database.types';

type WorkflowStatus = 'autorizado' | 'concluido' | 'rejeitado_motorista' | 'validado' | 'rejeitado_admin' | 'lancado_direto';

const WORKFLOW_TABS: Array<{ value: '' | 'pending_validation' | WorkflowStatus; label: string }> = [
    { value: '', label: 'Todos' },
    { value: 'autorizado', label: 'Autorizados (aguardando motorista)' },
    { value: 'pending_validation', label: 'Aguardando validação' },
    { value: 'validado', label: 'Validados' },
    { value: 'rejeitado_admin', label: 'Rejeitados' },
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
    vehicles?: { plate: string; brand?: string | null; model?: string | null; photo_url?: string | null } | null;
    drivers?: { name: string } | null;
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
};

export default function Refuelings() {
    const [searchTerm, setSearchTerm] = useState('');
    const [workflowTab, setWorkflowTab] = useState<'' | 'pending_validation' | WorkflowStatus>('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showAuthorizeModal, setShowAuthorizeModal] = useState(false);
    const [selectedRefueling, setSelectedRefueling] = useState<RefuelingRow | null>(null);
    const { setTitle, setDescription, setHeaderAction } = useHeader();
    const { user } = useAuth();
    const validateMutation = useValidateRefueling();
    const cancelAuth = useCancelFuelAuthorization();

    // "Aguardando validação" = workflow_status='concluido' (motorista preencheu, falta admin validar).
    const queryStatus = workflowTab === 'pending_validation' ? 'concluido' : (workflowTab || undefined);

    const { data: rawRefuelings = [] } = useRefuelings({
        workflowStatus: queryStatus,
    });

    useEffect(() => {
        setTitle('Abastecimentos');
        setDescription('Lançamentos de abastecimento, consumo e validações.');

        setHeaderAction(
            <div className="flex flex-wrap items-center justify-end gap-2">
                <SGFButton variant="secondary" onClick={() => setShowAuthorizeModal(true)} icon={Plus} className="!rounded-full !h-[37px]">
                    Autorizar abastecimento
                </SGFButton>
                <SGFButton onClick={() => setShowAddModal(true)} icon={Plus} className="!rounded-full !h-[37px]">
                    Novo Abastecimento
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
                date: (row as { date: string | null }).date,
                vehicle: row.vehicles?.plate || 'Sem placa',
                vehicleModel: vehicleModel || 'Sem veículo',
                vehiclePhoto: row.vehicles?.photo_url ?? null,
                driver: row.drivers?.name || 'Sem motorista',
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
            return matchesSearch;
        });
    }, [refuelings, searchTerm]);

    const totalLiters = filteredRefuelings.reduce((sum, row) => sum + row.liters, 0);
    const totalCost = filteredRefuelings.reduce((sum, row) => sum + row.cost, 0);
    const anomalyCount = refuelings.filter((row) => row.hasAnomaly).length;
    const pendingCount = refuelings.filter((row) => !row.isValidated).length;

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
            accessor: (row) => (
                <SGFButton variant="ghost" size="sm" icon={Eye} onClick={() => setSelectedRefueling(row)} />
            )
        }
    ];

    const handleValidate = (approved: boolean) => {
        if (!selectedRefueling || !user?.id) return;

        validateMutation.mutate(
            {
                id: selectedRefueling.id,
                approved,
                validatedBy: user.id,
                notes: approved ? undefined : 'Rejeitado manualmente pelo gestor',
            },
            {
                onSuccess: () => setSelectedRefueling(null),
            }
        );
    };

    const tabCounts = useMemo(() => ({
        all: refuelings.length,
        autorizado: refuelings.filter(r => r.workflowStatus === 'autorizado').length,
        concluido: refuelings.filter(r => r.workflowStatus === 'concluido').length,
        validado: refuelings.filter(r => r.workflowStatus === 'validado').length,
        rejeitado_admin: refuelings.filter(r => r.workflowStatus === 'rejeitado_admin').length,
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
                    onRowClick={(row) => setSelectedRefueling(row)}
                    emptyMessage="Nenhum abastecimento encontrado."
                />
            </div>

            <Modal
                isOpen={!!selectedRefueling}
                onClose={() => setSelectedRefueling(null)}
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
                                        cancelAuth.mutate({ id: selectedRefueling.id }, {
                                            onSuccess: () => setSelectedRefueling(null),
                                        });
                                    }}
                                    disabled={cancelAuth.isPending}
                                >
                                    Cancelar autorização
                                </SGFButton>
                            )}
                            {/* Quando motorista preencheu (concluido) ou é lançamento direto sem validar */}
                            {selectedRefueling && !selectedRefueling.isValidated
                                && selectedRefueling.workflowStatus !== 'autorizado'
                                && selectedRefueling.workflowStatus !== 'rejeitado_admin'
                                && selectedRefueling.workflowStatus !== 'rejeitado_motorista' && (
                                <>
                                    <SGFButton
                                        variant="ghost"
                                        className="text-rose-600 hover:bg-rose-50"
                                        onClick={() => handleValidate(false)}
                                        disabled={validateMutation.isPending}
                                    >
                                        Rejeitar
                                    </SGFButton>
                                    <SGFButton
                                        variant="primary"
                                        onClick={() => handleValidate(true)}
                                        disabled={validateMutation.isPending}
                                    >
                                        Validar Abastecimento
                                    </SGFButton>
                                </>
                            )}
                        </div>
                        <SGFButton variant="ghost" onClick={() => setSelectedRefueling(null)}>
                            Fechar
                        </SGFButton>
                    </div>
                }
            >
                {selectedRefueling && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100">
                                    <Fuel className="h-5 w-5 text-blue-500" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Status de Validação</p>
                                    <p className={cn("font-bold", selectedRefueling.isValidated ? "text-emerald-600" : "text-amber-600")}>
                                        {selectedRefueling.isValidated ? 'Validado' : 'Aguardando Validação'}
                                    </p>
                                </div>
                            </div>
                            {selectedRefueling.hasAnomaly && (
                                <SGFBadge variant="warning">Anomalia Detectada</SGFBadge>
                            )}
                        </div>

                        <div className="grid gap-6 md:grid-cols-2">
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl">
                                        <Car width={20} height={20} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Veículo</p>
                                        <p className="font-bold text-slate-800">{selectedRefueling.vehicle}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl">
                                        <User width={20} height={20} />
                                    </div>
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
                                        <p className="font-bold text-slate-800">{selectedRefueling.odometer.toLocaleString()} km</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 space-y-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumo Financeiro</p>
                                    <div className="px-2 py-0.5 bg-white rounded-lg border border-slate-200 text-[10px] font-bold text-slate-500">
                                        {selectedRefueling.fuelType}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-500">Quantidade</span>
                                        <span className="font-bold text-slate-800">{selectedRefueling.liters.toFixed(1)} L</span>
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
                                            {selectedRefueling.consumption ? `${selectedRefueling.consumption.toFixed(1)} km/L` : '-'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {selectedRefueling.hasAnomaly && (
                            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                                <AlertTriangle className="h-5 w-5 text-amber-500" />
                                <p className="text-sm text-amber-800 font-medium">
                                    <span className="font-black">Anomalia detectada:</span> Registro marcado fora do padrão esperado.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            <Modal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                title="Novo Abastecimento"
                description="Lançar novo abastecimento de veículo"
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
