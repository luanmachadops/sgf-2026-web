import { useEffect, useMemo, useState } from 'react';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFToolbar } from '@/components/sgf/SGFToolbar';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFTable, type SGFTableColumn } from '@/components/sgf/SGFTable';
import { PeriodPresetSelect, PeriodRangeFields, makePeriod, type PeriodValue } from '@/components/sgf/PeriodSelect';
import { Modal } from '@/components/ui/Modal';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFTextarea } from '@/components/sgf/SGFTextarea';
import {
    Plus,
    Wrench,
    Clock,
    CheckCircle,
    Car,
    Calendar,
    FileText,
    ShieldCheck,
    Building2,
    DollarSign,
    User,
} from '@/components/sgf/icons';
import { formatDate, formatCurrency } from '@/lib/utils';
import { useHeader } from '@/contexts/HeaderContext';
import { cn } from '@/lib/utils';
import { SGFKPICard } from '@/components/sgf/SGFKPICard';
import { motion, AnimatePresence } from 'framer-motion';
import { NewMaintenanceForm } from '@/components/maintenances/NewMaintenanceForm';
import {
    useMaintenances,
    useApproveMaintenance,
    useRejectMaintenance,
    useUpdateMaintenance,
    useCompleteMaintenance,
} from '@/hooks/useMaintenances';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Tables } from '@/types/database.types';

// Coluna do Kanban = status real do banco (service_orders.status)
const statusColumns = [
    { id: 'pendente', label: 'Pendente', color: 'text-yellow-600', icon: Clock },
    { id: 'aprovada', label: 'Aprovada', color: 'text-blue-600', icon: ShieldCheck },
    { id: 'em_execucao', label: 'Em Execução', color: 'text-orange-600', icon: Wrench },
    { id: 'concluida', label: 'Concluída', color: 'text-green-600', icon: CheckCircle },
];

const priorityColors: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
    baixa: 'info',
    media: 'warning',
    alta: 'error',
};

const priorityLabels: Record<string, string> = {
    baixa: 'Baixa',
    media: 'Média',
    alta: 'Alta',
};

const STATUS_BADGE: Record<string, { variant: 'default' | 'success' | 'warning' | 'error' | 'info'; label: string }> = {
    pendente: { variant: 'warning', label: 'Pendente' },
    aprovada: { variant: 'info', label: 'Aprovada' },
    em_execucao: { variant: 'info', label: 'Em execução' },
    concluida: { variant: 'success', label: 'Concluída' },
    rejeitada: { variant: 'error', label: 'Rejeitada' },
};

const priorityBorderColors: Record<string, string> = {
    baixa: 'border-l-sky-500',
    media: 'border-l-amber-500',
    alta: 'border-l-rose-500',
};

type ServiceOrderRow = Tables<'service_orders'> & {
    vehicles?: { plate?: string | null; brand?: string | null; model?: string | null; photo_url?: string | null; departments?: { name?: string } | null } | null;
    profiles?: { full_name?: string } | null;
};

type MaintItem = {
    id: string;
    plate: string;
    photoUrl: string | null;
    vehicleLabel: string;
    vehicleId: string;
    department: string;
    driver: string;
    category: string;
    description: string;
    date: string;
    odometer: number | null;
    priority: string; // baixa | media | alta
    status: string; // status do banco
    repairShop: string | null;
    budget: number | null;
    cost: number | null;
    approvedAt: string | null;
    completedAt: string | null;
};

/** Item de informação do modal de detalhes (ícone + rótulo + valor), padrão dos demais modais. */
function DetailInfo({
    icon: Icon,
    label,
    value,
    hint,
}: {
    icon: typeof Car;
    label: string;
    value: string;
    hint?: string;
}) {
    return (
        <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600">
                <Icon width={20} height={20} />
            </div>
            <div className="min-w-0">
                <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
                <p className="truncate font-bold text-slate-800">{value}</p>
                {hint && <p className="truncate text-xs font-medium text-slate-500">{hint}</p>}
            </div>
        </div>
    );
}

function mapRow(r: ServiceOrderRow): MaintItem {
    const v = r.vehicles;
    return {
        id: r.id,
        plate: v?.plate ?? '—',
        photoUrl: v?.photo_url ?? null,
        vehicleLabel: [v?.brand, v?.model].filter(Boolean).join(' ') || v?.plate || 'Veículo',
        vehicleId: r.vehicle_id ?? '',
        department: v?.departments?.name ?? 'Sem secretaria',
        driver: r.profiles?.full_name ?? '—',
        category: r.category ?? '—',
        description: r.description ?? 'Sem descrição',
        date: r.created_at,
        odometer: r.odometer ?? null,
        priority: r.priority ?? 'media',
        status: r.status ?? 'pendente',
        repairShop: r.repair_shop ?? null,
        budget: r.budget != null ? Number(r.budget) : null,
        cost: r.cost != null ? Number(r.cost) : null,
        approvedAt: r.approved_at ?? null,
        completedAt: r.completed_at ?? null,
    };
}

export default function Maintenances() {
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [priorityFilter, setPriorityFilter] = useState('');
    const [selectedMaintenance, setSelectedMaintenance] = useState<MaintItem | null>(null);
    const [editMaintenance, setEditMaintenance] = useState<MaintItem | null>(null);
    const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
    const [period, setPeriod] = useState<PeriodValue>(() => makePeriod('6'));
    const [approveTarget, setApproveTarget] = useState<MaintItem | null>(null);
    const [approveRepairShop, setApproveRepairShop] = useState('');
    const [approveBudget, setApproveBudget] = useState('');
    const [completeTarget, setCompleteTarget] = useState<MaintItem | null>(null);
    const [completeCost, setCompleteCost] = useState('');
    const [completeNote, setCompleteNote] = useState('');
    const { setTitle, setDescription, setHeaderAction } = useHeader();
    const { user } = useAuth();

    const { data: rawData = [], isLoading } = useMaintenances();
    const approve = useApproveMaintenance();
    const reject = useRejectMaintenance();
    const update = useUpdateMaintenance();
    const complete = useCompleteMaintenance();

    useEffect(() => {
        setTitle('Manutenções');
        setDescription('Ordens de serviço e acompanhamento das manutenções da frota.');
        setHeaderAction(
            <SGFButton onClick={() => setShowAddModal(true)} icon={Plus} className="!rounded-full !h-[37px]">
                Nova Manutenção
            </SGFButton>
        );
        return () => setHeaderAction(null);
    }, [setTitle, setDescription, setHeaderAction]);

    // Limite inferior (e superior) de data conforme o período escolhido.
    const periodRange = useMemo(() => {
        // Personalizado: usa as datas escolhidas; pontas não preenchidas ficam abertas.
        if (period.preset === 'custom') {
            const from = period.from ? new Date(`${period.from}T00:00:00`).getTime() : -Infinity;
            const to = period.to ? new Date(`${period.to}T23:59:59`).getTime() : Infinity;
            return { from, to };
        }
        const m = Number(period.preset) || 1;
        const d = new Date(); d.setMonth(d.getMonth() - (m - 1)); d.setDate(1); d.setHours(0, 0, 0, 0);
        return { from: d.getTime(), to: Infinity };
    }, [period]);

    const maintenances = useMemo(
        () => (rawData as ServiceOrderRow[])
            .map(mapRow)
            .filter((m) => {
                const t = m.date ? new Date(m.date).getTime() : 0;
                return t >= periodRange.from && t <= periodRange.to;
            }),
        [rawData, periodRange]
    );

    // Filtro comum (busca + prioridade) aplicado também na visão de lista.
    const filteredMaintenances = useMemo(
        () => maintenances.filter((m) => {
            const term = searchTerm.trim().toLowerCase();
            const matchesSearch = !term
                || m.plate.toLowerCase().includes(term)
                || m.vehicleLabel.toLowerCase().includes(term)
                || m.department.toLowerCase().includes(term)
                || m.description.toLowerCase().includes(term);
            return matchesSearch && (!priorityFilter || m.priority === priorityFilter);
        }),
        [maintenances, searchTerm, priorityFilter]
    );

    const maintenanceColumns: SGFTableColumn<MaintItem>[] = [
        {
            header: 'Veículo',
            sortable: true,
            sortType: 'text',
            sortValue: (m) => m.vehicleLabel,
            accessor: (m) => (
                <div className="flex items-center gap-3">
                    {m.photoUrl ? (
                        <img
                            src={m.photoUrl}
                            alt={m.plate}
                            className="h-10 w-10 rounded-lg object-cover ring-1 ring-slate-200"
                            loading="lazy"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                    ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--sgf-primary)]/10">
                            <Car className="h-5 w-5 text-[var(--sgf-primary)]" />
                        </div>
                    )}
                    <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{m.vehicleLabel}</p>
                        <p className="text-xs font-medium text-slate-400">{m.plate}</p>
                    </div>
                </div>
            ),
        },
        {
            header: 'Data',
            sortable: true,
            sortType: 'date',
            sortValue: (m) => m.date,
            accessor: (m) => <span className="text-slate-600">{formatDate(m.date)}</span>,
        },
        { header: 'Secretaria', sortable: true, sortType: 'text', sortValue: (m) => m.department, accessor: (m) => m.department || '—' },
        { header: 'Categoria', sortable: true, sortType: 'text', sortValue: (m) => m.category, accessor: (m) => m.category || '—' },
        {
            header: 'Oficina',
            sortable: true,
            sortType: 'text',
            sortValue: (m) => m.repairShop ?? '',
            accessor: (m) => m.repairShop || '—',
        },
        {
            header: 'Orçado × Custo',
            accessor: (m) => {
                if (m.budget == null && m.cost == null) return '—';
                return (
                    <div className="flex items-center gap-1.5">
                        <span className="text-slate-600">
                            {m.budget != null ? formatCurrency(m.budget) : '—'}
                            {' / '}
                            {m.cost != null ? formatCurrency(m.cost) : '—'}
                        </span>
                        {m.budget != null && m.cost != null && (
                            <SGFBadge variant={m.cost <= m.budget ? 'success' : 'error'} size="sm">
                                {m.cost <= m.budget ? 'OK' : 'Estourou'}
                            </SGFBadge>
                        )}
                    </div>
                );
            },
        },
        {
            header: 'Descrição',
            sortable: true,
            sortType: 'text',
            sortValue: (m) => m.description,
            accessor: (m) => <span className="line-clamp-1 text-slate-600">{m.description}</span>,
        },
        {
            header: 'Prioridade',
            sortable: true,
            sortType: 'number',
            sortValue: (m) => ({ baixa: 1, media: 2, alta: 3 } as Record<string, number>)[m.priority] ?? 0,
            accessor: (m) => (
                <SGFBadge variant={priorityColors[m.priority]}>{priorityLabels[m.priority]}</SGFBadge>
            ),
        },
        {
            header: 'Status',
            sortable: true,
            sortType: 'number',
            sortValue: (m) => ({ pendente: 1, aprovada: 2, em_execucao: 3, concluida: 4, rejeitada: 5 } as Record<string, number>)[m.status] ?? 0,
            accessor: (m) => {
                const s = STATUS_BADGE[m.status] ?? { variant: 'default' as const, label: m.status };
                return <SGFBadge variant={s.variant}>{s.label}</SGFBadge>;
            },
        },
    ];

    const getMaintenancesByStatus = (status: string) =>
        maintenances.filter((m) => {
            const term = searchTerm.trim().toLowerCase();
            const matchesSearch =
                !term ||
                m.plate.toLowerCase().includes(term) ||
                m.vehicleLabel.toLowerCase().includes(term) ||
                m.description.toLowerCase().includes(term);
            return m.status === status && matchesSearch && (!priorityFilter || m.priority === priorityFilter);
        });

    const pendingCount = maintenances.filter((m) => m.status === 'pendente').length;
    const inProgressCount = maintenances.filter((m) => m.status === 'em_execucao' || m.status === 'aprovada').length;
    const completedCount = maintenances.filter((m) => m.status === 'concluida').length;

    const openApproveModal = (item: MaintItem) => {
        setApproveRepairShop(item.repairShop ?? '');
        setApproveBudget(item.budget != null ? String(item.budget) : '');
        setApproveTarget(item);
    };

    const handleConfirmApprove = () => {
        if (!user?.id || !approveTarget) return;
        if (!approveRepairShop.trim()) {
            toast.error('Informe a oficina/local do conserto.');
            return;
        }
        approve.mutate(
            {
                id: approveTarget.id,
                approvedBy: user.id,
                repairShop: approveRepairShop.trim(),
                budget: approveBudget.trim() ? Number(approveBudget) : null,
            },
            {
                onSuccess: () => {
                    toast.success('Manutenção aprovada.');
                    setApproveTarget(null);
                    setSelectedMaintenance(null);
                },
                onError: () => toast.error('Erro ao aprovar manutenção.'),
            }
        );
    };

    const openCompleteModal = (item: MaintItem) => {
        setCompleteCost(item.cost != null ? String(item.cost) : '');
        setCompleteNote('');
        setCompleteTarget(item);
    };

    const handleConfirmComplete = () => {
        if (!completeTarget) return;
        const costValue = Number(completeCost);
        if (!completeCost.trim() || Number.isNaN(costValue) || costValue < 0) {
            toast.error('Informe o custo final do serviço.');
            return;
        }
        complete.mutate(
            { id: completeTarget.id, cost: costValue, adminNote: completeNote.trim() || undefined },
            {
                onSuccess: () => {
                    toast.success('Serviço concluído.');
                    setCompleteTarget(null);
                    setSelectedMaintenance(null);
                },
                onError: () => toast.error('Erro ao concluir serviço.'),
            }
        );
    };

    const handleReject = (id: string) => {
        reject.mutate(
            { id, reason: 'Rejeitada pelo gestor' },
            {
                onSuccess: () => { toast.success('Manutenção rejeitada.'); setSelectedMaintenance(null); },
                onError: () => toast.error('Erro ao rejeitar manutenção.'),
            }
        );
    };

    const handleSetStatus = (id: string, status: string) => {
        update.mutate(
            { id, data: { status: status as Tables<'service_orders'>['status'] } as never },
            {
                onSuccess: () => {
                    toast.success(status === 'concluida' ? 'Serviço concluído.' : 'Status atualizado.');
                    setSelectedMaintenance(null);
                },
                onError: () => toast.error('Erro ao atualizar status.'),
            }
        );
    };

    return (
        <div className="space-y-6">
            {/* KPIs */}
            <div className="grid gap-4 md:grid-cols-4">
                <SGFKPICard title="Pendentes" value={pendingCount} icon={Clock} iconColor="text-amber-500" chartColor="#f59e0b" />
                <SGFKPICard title="Em andamento" value={inProgressCount} icon={Wrench} iconColor="text-blue-500" chartColor="#3b82f6" />
                <SGFKPICard title="Concluídas" value={completedCount} icon={CheckCircle} iconColor="text-emerald-500" chartColor="#10b981" />
                <SGFKPICard title="Total de OS" value={maintenances.length} icon={FileText} iconColor="text-slate-500" chartColor="#64748b" />
            </div>

            {/* Busca + filtros (esquerda/centro) e alternância Kanban/Lista (canto direito) */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <SGFToolbar
                    className="flex-1 min-w-0"
                    searchValue={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder="Buscar por veículo ou descrição..."
                    filters={[
                        {
                            key: 'priority',
                            value: priorityFilter,
                            onChange: setPriorityFilter,
                            options: [
                                { value: '', label: 'Todas as prioridades' },
                                { value: 'baixa', label: 'Baixa' },
                                { value: 'media', label: 'Média' },
                                { value: 'alta', label: 'Alta' },
                            ],
                            placeholder: 'Prioridade',
                        },
                    ]}
                >
                    {/* Campos de data sempre à frente (à esquerda) do listbox de período */}
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

                <div className="inline-flex shrink-0 self-end rounded-xl border border-slate-200 bg-slate-50 p-1 md:self-auto">
                    <button
                        type="button"
                        onClick={() => setViewMode('kanban')}
                        className={cn(
                            'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors',
                            viewMode === 'kanban' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                        )}
                    >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <rect x="3" y="3" width="7" height="18" rx="1.5" />
                            <rect x="14" y="3" width="7" height="11" rx="1.5" />
                        </svg>
                        Kanban
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewMode('list')}
                        className={cn(
                            'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors',
                            viewMode === 'list' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                        )}
                    >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <line x1="8" y1="6" x2="21" y2="6" />
                            <line x1="8" y1="12" x2="21" y2="12" />
                            <line x1="8" y1="18" x2="21" y2="18" />
                            <line x1="3" y1="6" x2="3.01" y2="6" />
                            <line x1="3" y1="12" x2="3.01" y2="12" />
                            <line x1="3" y1="18" x2="3.01" y2="18" />
                        </svg>
                        Lista
                    </button>
                </div>
            </div>

            {/* Lista (tabela) */}
            {viewMode === 'list' && (
                <SGFTable<MaintItem>
                    columns={maintenanceColumns}
                    data={filteredMaintenances}
                    keyExtractor={(m) => m.id}
                    onRowClick={(m) => setSelectedMaintenance(m)}
                    loading={isLoading}
                    emptyMessage="Nenhuma manutenção no período selecionado."
                />
            )}

            {/* Kanban */}
            {viewMode === 'kanban' && (
            <div className="rounded-[var(--sgf-card-radius)]">
            <div className="grid gap-6 md:grid-cols-4 items-start h-full">
                {statusColumns.map((column) => {
                    const Icon = column.icon;
                    const items = getMaintenancesByStatus(column.id);

                    return (
                        <div key={column.id} className="flex flex-col h-full bg-slate-100/70 rounded-3xl border border-slate-200/70 p-3 lg:p-4">
                            <div className="mb-4 flex items-center gap-2.5 rounded-2xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-100">
                                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-100", column.color)}>
                                    <Icon className="h-[18px] w-[18px]" />
                                </div>
                                <span className="font-bold text-slate-800 text-[15px] tracking-tight">{column.label}</span>
                                <span className={cn("ml-auto inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-100 px-2 text-xs font-bold", column.color)}>
                                    {items.length}
                                </span>
                            </div>

                            <div className="space-y-3 min-h-[150px]">
                                {isLoading && (
                                    <div className="py-8 text-center text-xs text-slate-400">Carregando…</div>
                                )}
                                <AnimatePresence mode="popLayout">
                                    {items.map((maintenance) => (
                                        <motion.div
                                            key={maintenance.id}
                                            layout
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <SGFCard
                                                className={cn(
                                                    "cursor-pointer group hover:shadow-md hover:shadow-slate-200/50 transition-all duration-300 active:scale-[0.98] border-l-[3px]",
                                                    priorityBorderColors[maintenance.priority]
                                                )}
                                                onClick={() => setSelectedMaintenance(maintenance)}
                                                padding="sm"
                                                variant="default"
                                            >
                                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        {maintenance.photoUrl ? (
                                                            <img
                                                                src={maintenance.photoUrl}
                                                                alt={maintenance.plate}
                                                                className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-slate-200"
                                                                loading="lazy"
                                                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                                            />
                                                        ) : (
                                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--sgf-primary)]/10">
                                                                <Car className="h-5 w-5 text-[var(--sgf-primary)]" />
                                                            </div>
                                                        )}
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-slate-800 text-base truncate leading-tight">{maintenance.vehicleLabel}</p>
                                                            <p className="text-sm font-medium text-slate-400 truncate">{maintenance.plate} · {maintenance.department}</p>
                                                        </div>
                                                    </div>
                                                    <SGFBadge variant={priorityColors[maintenance.priority]}>
                                                        {priorityLabels[maintenance.priority]}
                                                    </SGFBadge>
                                                </div>

                                                <p className="text-sm font-medium text-slate-600 mb-2.5 line-clamp-1 leading-snug">
                                                    {maintenance.description}
                                                </p>

                                                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                                                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
                                                        <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
                                                        <span>{formatDate(maintenance.date)}</span>
                                                    </div>
                                                    <span className="shrink-0 px-2 py-0.5 rounded-full text-sm font-semibold bg-slate-100 text-slate-600">
                                                        {maintenance.category}
                                                    </span>
                                                </div>
                                            </SGFCard>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                                {!isLoading && items.length === 0 && (
                                    <div className="py-8 text-center text-xs text-slate-300">Nenhuma</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            </div>
            )}

            {/* Add Modal */}
            <Modal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                title="Nova Manutenção"
                description="Agende uma nova manutenção para um veículo"
                size="lg"
            >
                <NewMaintenanceForm
                    onSuccess={() => setShowAddModal(false)}
                    onCancel={() => setShowAddModal(false)}
                />
            </Modal>

            {/* Edit Modal */}
            <Modal
                isOpen={!!editMaintenance}
                onClose={() => setEditMaintenance(null)}
                title="Editar Ordem de Serviço"
                description="Altere os dados desta manutenção."
                size="lg"
            >
                {editMaintenance && (
                    <NewMaintenanceForm
                        editData={{
                            id: editMaintenance.id,
                            vehicleId: editMaintenance.vehicleId,
                            category: editMaintenance.category,
                            priority: (['baixa', 'media', 'alta'].includes(editMaintenance.priority) ? editMaintenance.priority : 'media') as 'baixa' | 'media' | 'alta',
                            description: editMaintenance.description === 'Sem descrição' ? '' : editMaintenance.description,
                            odometer: editMaintenance.odometer,
                            scheduledDate: editMaintenance.date ? new Date(editMaintenance.date).toISOString().split('T')[0] : undefined,
                        }}
                        onSuccess={() => setEditMaintenance(null)}
                        onCancel={() => setEditMaintenance(null)}
                    />
                )}
            </Modal>

            {/* Details Modal */}
            <Modal
                isOpen={!!selectedMaintenance}
                onClose={() => setSelectedMaintenance(null)}
                title="Detalhes da Manutenção"
                size="lg"
                footer={
                    <div className="flex w-full justify-between items-center">
                        <div className="flex gap-2">
                            {selectedMaintenance?.status === 'pendente' && (
                                <>
                                    <SGFButton variant="ghost" className="text-rose-600 hover:bg-rose-50" loading={reject.isPending} onClick={() => selectedMaintenance && handleReject(selectedMaintenance.id)}>
                                        Rejeitar
                                    </SGFButton>
                                    <SGFButton variant="primary" onClick={() => selectedMaintenance && openApproveModal(selectedMaintenance)}>
                                        Aprovar
                                    </SGFButton>
                                </>
                            )}
                            {selectedMaintenance?.status === 'aprovada' && (
                                <>
                                    <SGFButton variant="outline" loading={update.isPending} onClick={() => selectedMaintenance && handleSetStatus(selectedMaintenance.id, 'em_execucao')}>
                                        Iniciar Execução
                                    </SGFButton>
                                    <SGFButton variant="primary" onClick={() => selectedMaintenance && openCompleteModal(selectedMaintenance)}>
                                        Concluir Serviço
                                    </SGFButton>
                                </>
                            )}
                            {selectedMaintenance?.status === 'em_execucao' && (
                                <SGFButton variant="primary" onClick={() => selectedMaintenance && openCompleteModal(selectedMaintenance)}>
                                    Concluir Serviço
                                </SGFButton>
                            )}
                            {/* Editar: enquanto a O.S. está em andamento (não concluída/rejeitada) */}
                            {selectedMaintenance && ['pendente', 'aprovada', 'em_execucao'].includes(selectedMaintenance.status) && (
                                <SGFButton variant="outline" icon={FileText} onClick={() => { setEditMaintenance(selectedMaintenance); setSelectedMaintenance(null); }}>
                                    Editar
                                </SGFButton>
                            )}
                            {/* Reabrir: quando concluída ou rejeitada */}
                            {selectedMaintenance && ['concluida', 'rejeitada'].includes(selectedMaintenance.status) && (
                                <SGFButton variant="primary" icon={Clock} loading={update.isPending} onClick={() => selectedMaintenance && handleSetStatus(selectedMaintenance.id, 'em_execucao')}>
                                    Reabrir O.S.
                                </SGFButton>
                            )}
                        </div>
                        <SGFButton variant="ghost" onClick={() => setSelectedMaintenance(null)}>
                            Fechar
                        </SGFButton>
                    </div>
                }
            >
                {selectedMaintenance && (
                    <div className="space-y-6">
                        {/* Cabeçalho: abertura + status e prioridade */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm text-slate-500">
                                Aberta em {formatDate(selectedMaintenance.date)}
                            </p>
                            <div className="flex items-center gap-2">
                                <SGFBadge variant={STATUS_BADGE[selectedMaintenance.status]?.variant ?? 'default'}>
                                    {STATUS_BADGE[selectedMaintenance.status]?.label ?? selectedMaintenance.status}
                                </SGFBadge>
                                <SGFBadge variant={priorityColors[selectedMaintenance.priority]} size="sm">
                                    Prioridade {priorityLabels[selectedMaintenance.priority]}
                                </SGFBadge>
                            </div>
                        </div>

                        <div className="grid gap-6 md:grid-cols-2">
                            {/* Dados da solicitação */}
                            <div className="space-y-4">
                                <DetailInfo
                                    icon={Car}
                                    label="Veículo"
                                    value={selectedMaintenance.vehicleLabel}
                                    hint={`${selectedMaintenance.plate} · ${selectedMaintenance.department}`}
                                />
                                <DetailInfo icon={User} label="Motorista solicitante" value={selectedMaintenance.driver} />
                                <DetailInfo icon={Wrench} label="Categoria" value={selectedMaintenance.category} />
                            </div>

                            {/* Painel de execução e custos */}
                            <div className="space-y-3 self-start rounded-3xl border border-slate-100 bg-slate-50 p-5">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-slate-400">Custos do serviço</p>
                                    {selectedMaintenance.budget != null && selectedMaintenance.cost != null && (
                                        <SGFBadge variant={selectedMaintenance.cost <= selectedMaintenance.budget ? 'success' : 'error'} size="sm">
                                            {selectedMaintenance.cost <= selectedMaintenance.budget ? 'Dentro do orçamento' : 'Orçamento estourado'}
                                        </SGFBadge>
                                    )}
                                </div>

                                {!selectedMaintenance.repairShop && selectedMaintenance.budget == null && selectedMaintenance.cost == null ? (
                                    <div className="flex items-center gap-2.5 py-2 text-sm text-slate-400">
                                        <Building2 className="h-4 w-4 shrink-0" />
                                        <span>Oficina e orçamento são definidos na aprovação da O.S.</span>
                                    </div>
                                ) : (
                                    <>
                                        {selectedMaintenance.repairShop && (
                                            <div className="flex items-start justify-between gap-3 text-sm">
                                                <span className="shrink-0 text-slate-500">Oficina</span>
                                                <span className="text-right font-bold text-slate-800">{selectedMaintenance.repairShop}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Orçamento</span>
                                            <span className="font-bold text-slate-800">
                                                {selectedMaintenance.budget != null ? formatCurrency(selectedMaintenance.budget) : '—'}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                                            <span className="font-bold text-slate-500">Custo final</span>
                                            <span
                                                className={cn(
                                                    'text-xl font-black',
                                                    selectedMaintenance.cost == null
                                                        ? 'text-slate-300'
                                                        : selectedMaintenance.budget != null && selectedMaintenance.cost > selectedMaintenance.budget
                                                            ? 'text-rose-600'
                                                            : 'text-emerald-600'
                                                )}
                                            >
                                                {selectedMaintenance.cost != null ? formatCurrency(selectedMaintenance.cost) : '—'}
                                            </span>
                                        </div>
                                    </>
                                )}

                                {(selectedMaintenance.approvedAt || selectedMaintenance.completedAt) && (
                                    <div className="space-y-1.5 border-t border-slate-200 pt-3">
                                        {selectedMaintenance.approvedAt && (
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="flex items-center gap-1.5 text-slate-500">
                                                    <ShieldCheck className="h-3.5 w-3.5" /> Aprovada em
                                                </span>
                                                <span className="font-semibold text-slate-700">{formatDate(selectedMaintenance.approvedAt)}</span>
                                            </div>
                                        )}
                                        {selectedMaintenance.completedAt && (
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="flex items-center gap-1.5 text-slate-500">
                                                    <CheckCircle className="h-3.5 w-3.5" /> Concluída em
                                                </span>
                                                <span className="font-semibold text-slate-700">{formatDate(selectedMaintenance.completedAt)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Descrição */}
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                <FileText className="h-3.5 w-3.5" /> Descrição
                            </p>
                            <p className="text-sm leading-relaxed text-slate-700">{selectedMaintenance.description}</p>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Modal de Aprovação — oficina/orçamento */}
            <Modal
                isOpen={!!approveTarget}
                onClose={() => setApproveTarget(null)}
                title="Aprovar Ordem de Serviço"
                description="Informe a oficina de destino e, se possível, o orçamento previsto."
                size="sm"
                footer={
                    <div className="flex w-full justify-end gap-2">
                        <SGFButton variant="ghost" onClick={() => setApproveTarget(null)}>Cancelar</SGFButton>
                        <SGFButton variant="primary" loading={approve.isPending} onClick={handleConfirmApprove}>
                            Confirmar Aprovação
                        </SGFButton>
                    </div>
                }
            >
                <div className="space-y-4">
                    <SGFInput
                        label="Oficina / local do conserto"
                        placeholder="Ex: Oficina Central Ltda"
                        value={approveRepairShop}
                        onChange={(e) => setApproveRepairShop(e.target.value)}
                        icon={Building2}
                        fullWidth
                    />
                    <SGFInput
                        label="Orçamento (R$)"
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Ex: 850.00"
                        value={approveBudget}
                        onChange={(e) => setApproveBudget(e.target.value)}
                        icon={DollarSign}
                        hint="Opcional, mas recomendado para acompanhar o custo final."
                        fullWidth
                    />
                </div>
            </Modal>

            {/* Modal de Conclusão — custo final */}
            <Modal
                isOpen={!!completeTarget}
                onClose={() => setCompleteTarget(null)}
                title="Concluir Serviço"
                description="Informe o custo final do serviço realizado."
                size="sm"
                footer={
                    <div className="flex w-full justify-end gap-2">
                        <SGFButton variant="ghost" onClick={() => setCompleteTarget(null)}>Cancelar</SGFButton>
                        <SGFButton variant="primary" loading={complete.isPending} onClick={handleConfirmComplete}>
                            Confirmar Conclusão
                        </SGFButton>
                    </div>
                }
            >
                <div className="space-y-4">
                    {completeTarget?.budget != null && (
                        <p className="text-xs font-medium text-slate-500">
                            Orçamento previsto: <span className="font-bold text-slate-700">{formatCurrency(completeTarget.budget)}</span>
                        </p>
                    )}
                    <SGFInput
                        label="Custo final (R$)"
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Ex: 920.00"
                        value={completeCost}
                        onChange={(e) => setCompleteCost(e.target.value)}
                        icon={DollarSign}
                        fullWidth
                    />
                    <SGFTextarea
                        label="Observação (opcional)"
                        placeholder="Detalhes do serviço realizado..."
                        value={completeNote}
                        onChange={(e) => setCompleteNote(e.target.value)}
                        fullWidth
                        rows={3}
                    />
                </div>
            </Modal>
        </div>
    );
}
