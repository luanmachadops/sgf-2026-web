import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFToolbar } from '@/components/sgf/SGFToolbar';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFTable, type SGFTableColumn } from '@/components/sgf/SGFTable';
import { VehicleCell } from '@/components/sgf/EntityCells';
import { EntityAvatar } from '@/components/sgf/EntityAvatar';
import { SGFKPICard } from '@/components/sgf/SGFKPICard';
import { PeriodPresetSelect, PeriodRangeFields } from '@/components/sgf/PeriodSelect';
import { makePeriod, type PeriodValue } from '@/components/sgf/period';
import { Modal } from '@/components/ui/Modal';
import {
    Building2,
    ChevronDown,
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
import { formatCurrency, formatDate, matchesSearch, NO_DRIVER_LABEL } from '@/lib/utils';
import { departmentsApi, type FinStatus, type OpStatus } from '@/lib/supabase-api';
import { maintenanceManagerNextAction, maintenanceOperationalLabel } from '@/lib/maintenance-status';
import { useSyncOnChange } from '@/hooks/useSyncOnChange';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface MaintenanceItem {
    id: string;
    raw: MaintenanceDetailsRow;
    vehicleId: string;
    vehicleLabel: string;
    plate: string;
    photoUrl: string | null;
    department: string;
    driverId: string | null;
    /** Vazio quando a OS não tem motorista definido. */
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
        id: 'new',
        title: 'Novas solicitações',
        description: 'Esperando sua análise',
        statuses: ['pending'],
        color: 'text-amber-600',
        icon: Clock,
    },
    {
        id: 'shop',
        title: 'Na oficina',
        description: 'Entrega e orçamento',
        statuses: ['authorized', 'at_shop', 'awaiting_quote_approval'],
        color: 'text-blue-600',
        icon: Building2,
    },
    {
        id: 'repair',
        title: 'Em conserto',
        description: 'Serviço e retirada',
        statuses: ['in_progress', 'ready'],
        color: 'text-orange-600',
        icon: Wrench,
    },
    {
        id: 'done',
        title: 'Concluídas',
        description: 'Nota fiscal e pagamento',
        statuses: ['received'],
        color: 'text-emerald-600',
        icon: CheckCircle,
    },
];

const CANCELLED_COLUMN: WorkflowColumn = {
    id: 'cancelled',
    title: 'Canceladas',
    description: 'Processos encerrados sem conserto',
    statuses: ['cancelled'],
    color: 'text-red-500',
    icon: FileText,
};

/** A próxima ação é do gestor (e não da oficina ou do motorista)? */
function needsManager(item: { operationalStatus: OpStatus; financialStatus: FinStatus }): boolean {
    return item.operationalStatus === 'pending'
        || item.operationalStatus === 'authorized'
        || item.operationalStatus === 'ready'
        || (item.operationalStatus === 'awaiting_quote_approval' && ['not_started', 'awaiting_commitment'].includes(item.financialStatus))
        || (item.operationalStatus === 'received' && ['invoiced', 'attested'].includes(item.financialStatus));
}

const PRIORITY_RANK: Record<string, number> = { alta: 0, media: 1, baixa: 2 };

function daysOpen(iso: string): number {
    return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

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
    return maintenanceManagerNextAction(item.operationalStatus, item.financialStatus);
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
        driver: row.profiles?.full_name ?? '',
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
    const [department, setDepartment] = useState('');
    const { data: departments = [] } = useQuery({
        queryKey: ['departments'],
        queryFn: () => departmentsApi.getAll(),
    });
    const [viewMode, setViewMode] = useState<'flow' | 'list'>('flow');
    const [showCancelled, setShowCancelled] = useState(false);
    // Celular: cada etapa vira sanfona. Sem escolha do usuário, etapa vazia começa fechada.
    const [openColumns, setOpenColumns] = useState<Record<string, boolean>>({});
    const [period, setPeriod] = useState<PeriodValue>(() => makePeriod('6'));
    const [showCreate, setShowCreate] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [editData, setEditData] = useState<MaintenanceEditData | null>(null);
    const { setTitle, setDescription, setHeaderAction } = useHeader();
    const { data: rows = [], isLoading } = useMaintenances();

    useSyncOnChange(paramSearch, () => {
        if (paramSearch) setSearch(paramSearch);
    });

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
        return (rows as MaintenanceDetailsRow[])
            .map(mapRow)
            .find((maintenance) =>
                matchesSearch(
                    paramSearch,
                    maintenance.plate,
                    maintenance.driver,
                    maintenance.repairShop,
                )
            )?.id ?? null;
    }, [paramId, paramSearch, rows]);
    const activeSelectedId = selectedId ?? requestedMaintenanceId;

    const filtered = useMemo(() => {
        return maintenances.filter((item) => {
            const matchesTerm = matchesSearch(
                search,
                item.plate,
                item.vehicleLabel,
                item.department,
                item.driver,
                item.category,
                item.description,
                item.repairShop,
            );
            return matchesTerm
                && (!priority || item.priority === priority)
                && (!department || item.department === department);
        });
    }, [maintenances, priority, search, department]);

    const managerActionCount = maintenances.filter(needsManager).length;
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
                <VehicleCell plate={item.plate} name={item.vehicleLabel} photoUrl={item.photoUrl} />
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
                    <p className={item.driver ? 'text-xs text-slate-400' : 'text-xs italic text-slate-400'}>{item.driver || NO_DRIVER_LABEL}</p>
                </div>
            ),
        },
        {
            header: 'Veículo / oficina',
            sortValue: (item) => item.operationalStatus,
            accessor: (item) => (
                <SGFBadge variant={operationalVariant(item.operationalStatus)}>
                    {maintenanceOperationalLabel(item.operationalStatus, item.financialStatus)}
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
                        {
                            key: 'department',
                            value: department,
                            onChange: setDepartment,
                            options: [
                                { value: '', label: 'Todas as secretarias' },
                                ...departments.map((d) => ({ value: d.name, label: d.name })),
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
                <div className="space-y-3">
                    <div className={`grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 ${showCancelled ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
                        {(showCancelled ? [...WORKFLOW_COLUMNS, CANCELLED_COLUMN] : WORKFLOW_COLUMNS).map((column) => {
                            // Primeiro o que depende do gestor, depois a prioridade, depois a mais antiga.
                            const items = filtered
                                .filter((item) => column.statuses.includes(item.operationalStatus))
                                .sort((x, y) =>
                                    Number(needsManager(y)) - Number(needsManager(x))
                                    || PRIORITY_RANK[x.priority] - PRIORITY_RANK[y.priority]
                                    || new Date(x.openedAt).getTime() - new Date(y.openedAt).getTime());
                            const actionCount = items.filter(needsManager).length;
                            const Icon = column.icon;
                            const open = openColumns[column.id] ?? items.length > 0;
                            return (
                                <section key={column.id} className="flex min-w-0 flex-col rounded-3xl border border-slate-200 bg-slate-50/70 p-2.5">
                                    <header
                                        className="flex cursor-pointer items-start justify-between gap-2 px-1.5 pt-1 md:mb-2.5 md:cursor-default"
                                        onClick={() => setOpenColumns((prev) => ({ ...prev, [column.id]: !open }))}
                                        aria-expanded={open}
                                    >
                                        <div className="min-w-0">
                                            <h2 className={`flex items-center gap-2 text-sm font-bold ${column.color}`}>
                                                <Icon className="h-4 w-4 shrink-0" />
                                                {column.title}
                                            </h2>
                                            <p className="mt-0.5 truncate text-[11px] text-slate-400">{column.description}</p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                            {actionCount > 0 && column.id !== 'cancelled' && (
                                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700" title="Dependem de você">
                                                    {actionCount} sua{actionCount > 1 ? 's' : ''}
                                                </span>
                                            )}
                                            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-500 shadow-sm">{items.length}</span>
                                            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform md:hidden ${open ? 'rotate-180' : ''}`} />
                                        </div>
                                    </header>
                                    <div className={`custom-scrollbar mt-2.5 max-h-[64vh] space-y-2 overflow-y-auto pr-0.5 md:mt-0 md:block ${open ? '' : 'hidden'}`}>
                                        {items.map((item) => (
                                            <MaintenanceCard key={item.id} item={item} onOpen={() => setSelectedId(item.id)} />
                                        ))}
                                        {!isLoading && items.length === 0 && (
                                            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 py-6 text-center text-xs text-slate-400">
                                                Nada aqui
                                            </div>
                                        )}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                    {(() => {
                        const cancelled = filtered.filter((item) => item.operationalStatus === 'cancelled').length;
                        if (cancelled === 0 && !showCancelled) return null;
                        return (
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setShowCancelled((v) => !v)}
                                    className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                                >
                                    {showCancelled ? 'Ocultar canceladas' : `Ver canceladas (${cancelled})`}
                                </button>
                            </div>
                        );
                    })()}
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

const PRIORITY_DOT: Record<MaintenanceItem['priority'], string> = {
    alta: 'bg-red-500',
    media: 'bg-amber-500',
    baixa: 'bg-emerald-500',
};

/** Card compacto do quadro: o essencial para achar e agir sem abrir a OS. */
function MaintenanceCard({ item, onOpen }: { item: MaintenanceItem; onOpen: () => void }) {
    const mine = needsManager(item);
    const days = daysOpen(item.openedAt);
    const closed = item.operationalStatus === 'cancelled' || item.financialStatus === 'paid';
    return (
        <button
            type="button"
            onClick={onOpen}
            className="block w-full rounded-2xl border border-slate-200 bg-white p-2.5 text-left shadow-sm transition hover:border-[var(--sgf-primary)] hover:shadow-md focus:outline-none focus:ring-4 focus:ring-[var(--sgf-focus-ring)]"
        >
            <div className="flex items-center gap-2.5">
                <EntityAvatar url={item.photoUrl} icon={Car} alt={item.plate} square size="sm" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm font-bold text-slate-900">{item.plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}</span>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[item.priority]}`} title={`Prioridade ${PRIORITY_LABEL[item.priority].toLowerCase()}`} />
                        <span className="text-[10px] font-semibold uppercase text-slate-400">{PRIORITY_LABEL[item.priority]}</span>
                    </div>
                    <p className="truncate text-xs text-slate-500">{item.vehicleLabel}</p>
                </div>
            </div>
            <p className="mt-2 truncate text-xs font-semibold text-slate-700" title={item.description}>{item.category}</p>
            <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                <span className="truncate">{item.repairShop ?? 'Sem oficina'}</span>
                <span className="shrink-0">{item.budget != null ? formatCurrency(item.budget) : ''}</span>
            </div>
            <div className={`mt-2 flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[11px] font-semibold ${
                mine ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-500'
            }`}>
                <span className="truncate">{mine ? '● ' : ''}{managerNextAction(item)}</span>
                <span className="flex shrink-0 items-center gap-1 font-medium" title={`Aberta em ${formatDate(item.openedAt)}`}>
                    <Calendar className="h-3 w-3" />
                    {closed ? formatDate(item.openedAt, 'dd/MM') : days === 0 ? 'hoje' : `${days}d`}
                </span>
            </div>
        </button>
    );
}
