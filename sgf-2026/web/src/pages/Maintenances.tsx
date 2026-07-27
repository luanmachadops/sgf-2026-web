import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFToolbar } from '@/components/sgf/SGFToolbar';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFTable, type SGFTableColumn } from '@/components/sgf/SGFTable';
import { SGFKPICard } from '@/components/sgf/SGFKPICard';
import { PeriodPresetSelect, PeriodRangeFields, makePeriod, type PeriodValue } from '@/components/sgf/PeriodSelect';
import { Modal } from '@/components/ui/Modal';
import {
    Building2,
    Calendar,
    Car,
    CheckCircle,
    Clock,
    FileText,
    Plus,
    ShieldCheck,
    Wrench,
} from '@/components/sgf/icons';
import { NewMaintenanceForm, type MaintenanceEditData } from '@/components/maintenances/NewMaintenanceForm';
import {
    MaintenanceDetailsModal,
    type MaintenanceDetailsRow,
} from '@/components/maintenances/MaintenanceDetailsModal';
import { useMaintenances } from '@/hooks/useMaintenances';
import { useHeader } from '@/contexts/HeaderContext';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { FinStatus, OpStatus } from '@/lib/supabase-api';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface MaintenanceItem {
    id: string;
    raw: MaintenanceDetailsRow;
    vehicleId: string;
    vehicleLabel: string;
    plate: string;
    photoUrl: string | null;
    department: string;
    driverId: string;
    driver: string;
    category: string;
    description: string;
    priority: 'baixa' | 'media' | 'alta';
    odometer: number | null;
    openedAt: string;
    origin: string;
    operationalStatus: OpStatus;
    financialStatus: FinStatus;
    repairShop: string | null;
    budget: number | null;
    paid: number | null;
}

interface WorkflowColumn {
    id: string;
    title: string;
    description: string;
    statuses: OpStatus[];
    color: string;
    icon: typeof Wrench;
}

const WORKFLOW_COLUMNS: WorkflowColumn[] = [
    {
        id: 'triage',
        title: 'Triagem',
        description: 'Solicitações a revisar',
        statuses: ['pending'],
        color: 'text-amber-600',
        icon: Clock,
    },
    {
        id: 'shop',
        title: 'Oficina e orçamento',
        description: 'Autorização, entrega e cotação',
        statuses: ['authorized', 'at_shop', 'awaiting_quote_approval'],
        color: 'text-blue-600',
        icon: Building2,
    },
    {
        id: 'execution',
        title: 'Execução',
        description: 'Serviço e retirada',
        statuses: ['in_progress', 'ready'],
        color: 'text-orange-600',
        icon: Wrench,
    },
    {
        id: 'received',
        title: 'Recebida',
        description: 'Nota, ateste e pagamento',
        statuses: ['received'],
        color: 'text-emerald-600',
        icon: CheckCircle,
    },
    {
        id: 'cancelled',
        title: 'Cancelada',
        description: 'Processos encerrados',
        statuses: ['cancelled'],
        color: 'text-red-500',
        icon: FileText,
    },
];

const OP_LABEL: Record<OpStatus, string> = {
    pending: 'Em triagem',
    authorized: 'Autorizada',
    at_shop: 'Na oficina',
    awaiting_quote_approval: 'Orçamento em análise',
    in_progress: 'Em execução',
    ready: 'Pronta para retirada',
    received: 'Veículo recebido',
    cancelled: 'Cancelada',
};

const FIN_LABEL: Record<FinStatus, string> = {
    not_started: 'Não iniciado',
    awaiting_commitment: 'Aguardando empenho',
    committed: 'Empenhada',
    invoiced: 'Faturada',
    attested: 'Atestada',
    paid: 'Paga',
};

const ORIGIN_LABEL: Record<string, string> = {
    driver: 'Motorista',
    checklist: 'Checklist',
    manager: 'Gestor',
};

const PRIORITY_LABEL: Record<MaintenanceItem['priority'], string> = {
    baixa: 'Baixa',
    media: 'Média',
    alta: 'Alta',
};

const PRIORITY_VARIANT: Record<MaintenanceItem['priority'], BadgeVariant> = {
    baixa: 'info',
    media: 'warning',
    alta: 'error',
};

const PRIORITY_BORDER: Record<MaintenanceItem['priority'], string> = {
    baixa: 'border-l-blue-400',
    media: 'border-l-amber-400',
    alta: 'border-l-red-500',
};

function operationalVariant(status: OpStatus): BadgeVariant {
    if (status === 'cancelled') return 'error';
    if (status === 'received') return 'success';
    if (status === 'pending' || status === 'ready' || status === 'awaiting_quote_approval') return 'warning';
    return 'info';
}

function financialVariant(status: FinStatus): BadgeVariant {
    if (status === 'paid') return 'success';
    if (status === 'not_started') return 'default';
    return 'warning';
}

function managerNextAction(item: MaintenanceItem): string {
    if (item.operationalStatus === 'pending') return 'Revisar e autorizar';
    if (item.operationalStatus === 'authorized') return 'Confirmar entrega na oficina';
    if (item.operationalStatus === 'at_shop') return 'Aguardar orçamento da oficina';
    if (item.operationalStatus === 'awaiting_quote_approval') return 'Analisar orçamento';
    if (item.operationalStatus === 'in_progress') return 'Acompanhar execução';
    if (item.operationalStatus === 'ready') return 'Conferir e receber veículo';
    if (item.operationalStatus === 'cancelled') return 'Processo cancelado';
    if (item.financialStatus === 'invoiced') return 'Atestar notas fiscais';
    if (item.financialStatus === 'attested') return 'Registrar pagamento';
    if (item.financialStatus === 'paid') return 'Processo encerrado';
    return 'Aguardar nota fiscal';
}

function mapRow(row: MaintenanceDetailsRow): MaintenanceItem {
    const vehicle = row.vehicles as MaintenanceDetailsRow['vehicles'] & { photo_url?: string | null };
    const priority = ['baixa', 'media', 'alta'].includes(row.priority)
        ? row.priority as MaintenanceItem['priority']
        : 'media';
    return {
        id: row.id,
        raw: row,
        vehicleId: row.vehicle_id,
        vehicleLabel: [vehicle?.brand, vehicle?.model].filter(Boolean).join(' ') || 'Veículo',
        plate: vehicle?.plate ?? '—',
        photoUrl: vehicle?.photo_url ?? null,
        department: vehicle?.departments?.name ?? 'Sem secretaria',
        driverId: row.driver_id,
        driver: row.profiles?.full_name ?? '—',
        category: row.category ?? 'Sem categoria',
        description: row.description || 'Sem descrição',
        priority,
        odometer: row.odometer,
        openedAt: row.created_at,
        origin: row.origin,
        operationalStatus: (row.operational_status ?? 'pending') as OpStatus,
        financialStatus: (row.financial_status ?? 'not_started') as FinStatus,
        repairShop: row.repair_shop,
        budget: row.budget == null ? null : Number(row.budget),
        paid: row.cost == null ? null : Number(row.cost),
    };
}

export default function Maintenances() {
    const [searchParams, setSearchParams] = useSearchParams();
    const paramId = searchParams.get('id') || searchParams.get('soId') || searchParams.get('maintenanceId');
    const paramSearch = searchParams.get('search');

    const [search, setSearch] = useState('');
    const [priority, setPriority] = useState('');
    const [viewMode, setViewMode] = useState<'flow' | 'list'>('flow');
    const [period, setPeriod] = useState<PeriodValue>(() => makePeriod('6'));
    const [showCreate, setShowCreate] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [editData, setEditData] = useState<MaintenanceEditData | null>(null);
    const { setTitle, setDescription, setHeaderAction } = useHeader();
    const { data: rows = [], isLoading } = useMaintenances();

    useEffect(() => {
        if (paramSearch) {
            setSearch(paramSearch);
        }
    }, [paramSearch]);

    useEffect(() => {
        setTitle('Manutenções');
        setDescription('Fluxo integrado entre motorista, gestão e oficina, da avaria ao pagamento.');
        setHeaderAction(
            <SGFButton onClick={() => setShowCreate(true)} icon={Plus} className="!h-[37px] !rounded-full">
                Abrir solicitação
            </SGFButton>,
        );
        return () => setHeaderAction(null);
    }, [setDescription, setHeaderAction, setTitle]);

    const periodRange = useMemo(() => {
        if (period.preset === 'custom') {
            return {
                from: period.from ? new Date(`${period.from}T00:00:00`).getTime() : -Infinity,
                to: period.to ? new Date(`${period.to}T23:59:59`).getTime() : Infinity,
            };
        }
        const months = Number(period.preset) || 1;
        const from = new Date();
        from.setMonth(from.getMonth() - (months - 1), 1);
        from.setHours(0, 0, 0, 0);
        return { from: from.getTime(), to: Infinity };
    }, [period]);

    const maintenances = useMemo(
        () => (rows as MaintenanceDetailsRow[])
            .map(mapRow)
            .filter((item) => {
                const openedAt = new Date(item.openedAt).getTime();
                return openedAt >= periodRange.from && openedAt <= periodRange.to;
            }),
        [periodRange, rows],
    );
    const requestedMaintenanceId = useMemo(() => {
        if (paramId) return paramId;
        if (!paramSearch) return null;
        const term = paramSearch.trim().toLowerCase();
        return (rows as MaintenanceDetailsRow[])
            .map(mapRow)
            .find((maintenance) =>
                maintenance.plate?.toLowerCase() === term
                || maintenance.plate?.toLowerCase().replace('-', '') === term.replace('-', '')
                || maintenance.driver?.toLowerCase().includes(term)
                || maintenance.repairShop?.toLowerCase().includes(term)
            )?.id ?? null;
    }, [paramId, paramSearch, rows]);
    const activeSelectedId = selectedId ?? requestedMaintenanceId;

    const filtered = useMemo(() => {
        const term = search.trim().toLocaleLowerCase('pt-BR');
        return maintenances.filter((item) => {
            const matchesSearch = !term || [
                item.plate,
                item.vehicleLabel,
                item.department,
                item.driver,
                item.category,
                item.description,
                item.repairShop ?? '',
            ].some((value) => value.toLocaleLowerCase('pt-BR').includes(term));
            return matchesSearch && (!priority || item.priority === priority);
        });
    }, [maintenances, priority, search]);

    const managerActionCount = maintenances.filter((item) =>
        item.operationalStatus === 'pending'
        || item.operationalStatus === 'awaiting_quote_approval'
        || item.operationalStatus === 'ready'
        || (item.operationalStatus === 'received'
            && ['invoiced', 'attested'].includes(item.financialStatus)),
    ).length;
    const atShopCount = maintenances.filter((item) =>
        ['at_shop', 'awaiting_quote_approval', 'in_progress', 'ready'].includes(item.operationalStatus),
    ).length;
    const receivedCount = maintenances.filter((item) => item.operationalStatus === 'received').length;
    const paidCount = maintenances.filter((item) => item.financialStatus === 'paid').length;

    const columns = useMemo<SGFTableColumn<MaintenanceItem>[]>(() => [
        {
            header: 'Veículo',
            sortValue: (item) => item.plate,
            accessor: (item) => (
                <div className="flex items-center gap-3">
                    {item.photoUrl ? (
                        <img className="h-10 w-10 rounded-xl object-cover" src={item.photoUrl} alt={item.plate} />
                    ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                            <Car className="h-5 w-5" />
                        </div>
                    )}
                    <div>
                        <p className="font-semibold text-slate-900">{item.vehicleLabel}</p>
                        <p className="text-xs text-slate-500">{item.plate} · {item.department}</p>
                    </div>
                </div>
            ),
        },
        {
            header: 'Solicitação',
            sortValue: (item) => item.category,
            accessor: (item) => (
                <div>
                    <p className="font-medium text-slate-800">{item.category}</p>
                    <p className="max-w-[260px] truncate text-xs text-slate-500">{item.description}</p>
                </div>
            ),
        },
        {
            header: 'Origem',
            sortValue: (item) => item.origin,
            accessor: (item) => (
                <div>
                    <p className="text-sm text-slate-700">{ORIGIN_LABEL[item.origin] ?? item.origin}</p>
                    <p className="text-xs text-slate-400">{item.driver}</p>
                </div>
            ),
        },
        {
            header: 'Veículo / oficina',
            sortValue: (item) => item.operationalStatus,
            accessor: (item) => (
                <SGFBadge variant={operationalVariant(item.operationalStatus)}>
                    {OP_LABEL[item.operationalStatus]}
                </SGFBadge>
            ),
        },
        {
            header: 'Processo fiscal',
            sortValue: (item) => item.financialStatus,
            accessor: (item) => (
                <SGFBadge variant={financialVariant(item.financialStatus)}>
                    {FIN_LABEL[item.financialStatus]}
                </SGFBadge>
            ),
        },
        {
            header: 'Próxima ação',
            sortValue: managerNextAction,
            accessor: (item) => <span className="text-sm font-medium text-slate-700">{managerNextAction(item)}</span>,
        },
        {
            header: 'Abertura',
            sortType: 'date',
            sortValue: (item) => item.openedAt,
            accessor: (item) => <span className="text-sm text-slate-600">{formatDate(item.openedAt)}</span>,
        },
    ], []);

    const closeSelected = () => {
        setSelectedId(null);
        if (!paramId) return;
        const next = new URLSearchParams(searchParams);
        next.delete('id');
        next.delete('soId');
        next.delete('maintenanceId');
        setSearchParams(next, { replace: true });
    };

    const handleEdit = (row: MaintenanceDetailsRow) => {
        closeSelected();
        setEditData({
            id: row.id,
            vehicleId: row.vehicle_id,
            driverId: row.driver_id,
            category: row.category ?? '',
            priority: ['baixa', 'media', 'alta'].includes(row.priority)
                ? row.priority as MaintenanceEditData['priority']
                : 'media',
            description: row.description ?? '',
            odometer: row.odometer,
        });
    };

    return (
        <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SGFKPICard title="Ações do gestor" value={managerActionCount} icon={ShieldCheck} iconColor="text-amber-500" chartColor="#f59e0b" />
                <SGFKPICard title="Na oficina" value={atShopCount} icon={Wrench} iconColor="text-blue-500" chartColor="#3b82f6" />
                <SGFKPICard title="Veículos recebidos" value={receivedCount} icon={Car} iconColor="text-emerald-500" chartColor="#10b981" />
                <SGFKPICard title="Processos pagos" value={paidCount} icon={CheckCircle} iconColor="text-slate-500" chartColor="#64748b" />
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <SGFToolbar
                    className="min-w-0 flex-1"
                    searchValue={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Buscar placa, motorista, oficina ou serviço..."
                    filters={[
                        {
                            key: 'priority',
                            value: priority,
                            onChange: setPriority,
                            options: [
                                { value: '', label: 'Todas as prioridades' },
                                { value: 'baixa', label: 'Baixa' },
                                { value: 'media', label: 'Média' },
                                { value: 'alta', label: 'Alta' },
                            ],
                        },
                    ]}
                >
                    <div className="flex items-center gap-2">
                        {period.preset === 'custom' && (
                            <PeriodRangeFields
                                value={period}
                                onChange={setPeriod}
                                className="!justify-start"
                                fieldClassName="!w-[140px] !py-2.5 !text-sm"
                                align="start"
                            />
                        )}
                        <PeriodPresetSelect value={period} onChange={setPeriod} />
                    </div>
                </SGFToolbar>
                <div className="inline-flex self-end rounded-full border border-slate-200 bg-white p-1 lg:self-auto">
                    <button
                        type="button"
                        className={`rounded-full px-4 py-2 text-xs font-semibold ${
                            viewMode === 'flow' ? 'bg-[var(--sgf-primary)] text-white' : 'text-slate-500'
                        }`}
                        onClick={() => setViewMode('flow')}
                    >
                        Fluxo
                    </button>
                    <button
                        type="button"
                        className={`rounded-full px-4 py-2 text-xs font-semibold ${
                            viewMode === 'list' ? 'bg-[var(--sgf-primary)] text-white' : 'text-slate-500'
                        }`}
                        onClick={() => setViewMode('list')}
                    >
                        Lista
                    </button>
                </div>
            </div>

            {viewMode === 'list' ? (
                <SGFTable
                    columns={columns}
                    data={filtered}
                    keyExtractor={(item) => item.id}
                    onRowClick={(item) => setSelectedId(item.id)}
                    loading={isLoading}
                    emptyMessage="Nenhuma ordem de serviço encontrada."
                />
            ) : (
                <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-5">
                    {WORKFLOW_COLUMNS.map((column) => {
                        const items = filtered.filter((item) => column.statuses.includes(item.operationalStatus));
                        const Icon = column.icon;
                        return (
                            <section key={column.id} className="min-w-0 rounded-3xl border border-slate-200 bg-slate-50/70 p-3">
                                <header className="mb-3 flex items-start justify-between gap-2 px-1">
                                    <div>
                                        <h2 className={`flex items-center gap-2 text-sm font-bold ${column.color}`}>
                                            <Icon className="h-4 w-4" />
                                            {column.title}
                                        </h2>
                                        <p className="mt-0.5 text-[11px] text-slate-400">{column.description}</p>
                                    </div>
                                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-500 shadow-sm">
                                        {items.length}
                                    </span>
                                </header>
                                <div className="space-y-3">
                                    {items.map((item) => (
                                        <SGFCard
                                            key={item.id}
                                            variant="bordered"
                                            padding="sm"
                                            hover
                                            className={`border-l-4 ${PRIORITY_BORDER[item.priority]}`}
                                            onClick={() => setSelectedId(item.id)}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-bold text-slate-900">{item.vehicleLabel}</p>
                                                    <p className="text-xs font-semibold text-slate-500">{item.plate}</p>
                                                </div>
                                                <SGFBadge variant={PRIORITY_VARIANT[item.priority]} size="sm">
                                                    {PRIORITY_LABEL[item.priority]}
                                                </SGFBadge>
                                            </div>
                                            <p className="mt-3 line-clamp-2 text-xs text-slate-600">{item.description}</p>
                                            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                                                <SGFBadge variant={operationalVariant(item.operationalStatus)} size="sm">
                                                    {OP_LABEL[item.operationalStatus]}
                                                </SGFBadge>
                                                <p className="text-[11px] font-semibold text-slate-700">{managerNextAction(item)}</p>
                                                {item.repairShop && (
                                                    <p className="truncate text-[11px] text-slate-500">{item.repairShop}</p>
                                                )}
                                                <div className="flex items-center justify-between text-[10px] text-slate-400">
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        {formatDate(item.openedAt)}
                                                    </span>
                                                    {item.budget != null && <span>{formatCurrency(item.budget)}</span>}
                                                </div>
                                            </div>
                                        </SGFCard>
                                    ))}
                                    {!isLoading && items.length === 0 && (
                                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 py-8 text-center text-xs text-slate-400">
                                            Nenhuma OS
                                        </div>
                                    )}
                                </div>
                            </section>
                        );
                    })}
                </div>
            )}

            <Modal
                isOpen={showCreate}
                onClose={() => setShowCreate(false)}
                title="Abrir solicitação de manutenção"
                description="Registre o relato em nome do motorista. A oficina será vinculada na triagem."
                size="lg"
            >
                <NewMaintenanceForm
                    onSuccess={() => setShowCreate(false)}
                    onCancel={() => setShowCreate(false)}
                />
            </Modal>

            <Modal
                isOpen={Boolean(editData)}
                onClose={() => setEditData(null)}
                title="Editar solicitação"
                description="A edição é permitida somente enquanto a OS está em triagem."
                size="lg"
            >
                {editData && (
                    <NewMaintenanceForm
                        editData={editData}
                        onSuccess={() => setEditData(null)}
                        onCancel={() => setEditData(null)}
                    />
                )}
            </Modal>

            <MaintenanceDetailsModal
                maintenanceId={activeSelectedId}
                onClose={closeSelected}
                onEdit={handleEdit}
            />
        </div>
    );
}
