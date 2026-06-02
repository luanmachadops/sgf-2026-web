import { useEffect, useMemo, useState } from 'react';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFToolbar } from '@/components/sgf/SGFToolbar';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { Modal } from '@/components/ui/Modal';
import {
    Plus,
    Wrench,
    Clock,
    CheckCircle,
    AlertTriangle,
    Car,
    Calendar,
    FileText,
    ShieldCheck,
} from '@/components/sgf/icons';
import { formatDate } from '@/lib/utils';
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

const priorityBorderColors: Record<string, string> = {
    baixa: 'border-l-sky-500',
    media: 'border-l-amber-500',
    alta: 'border-l-rose-500',
};

type ServiceOrderRow = Tables<'service_orders'> & {
    vehicles?: { plate?: string | null; brand?: string | null; model?: string | null; departments?: { name?: string } | null } | null;
    profiles?: { full_name?: string } | null;
};

type MaintItem = {
    id: string;
    plate: string;
    vehicleLabel: string;
    department: string;
    driver: string;
    category: string;
    description: string;
    date: string;
    priority: string; // baixa | media | alta
    status: string; // status do banco
};

function mapRow(r: ServiceOrderRow): MaintItem {
    const v = r.vehicles;
    return {
        id: r.id,
        plate: v?.plate ?? '—',
        vehicleLabel: [v?.brand, v?.model].filter(Boolean).join(' ') || v?.plate || 'Veículo',
        department: v?.departments?.name ?? 'Sem secretaria',
        driver: r.profiles?.full_name ?? '—',
        category: r.category ?? '—',
        description: r.description ?? 'Sem descrição',
        date: r.created_at,
        priority: r.priority ?? 'media',
        status: r.status ?? 'pendente',
    };
}

export default function Maintenances() {
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [priorityFilter, setPriorityFilter] = useState('');
    const [selectedMaintenance, setSelectedMaintenance] = useState<MaintItem | null>(null);
    const { setTitle, setDescription, setHeaderAction } = useHeader();
    const { user } = useAuth();

    const { data: rawData = [], isLoading } = useMaintenances();
    const approve = useApproveMaintenance();
    const reject = useRejectMaintenance();
    const update = useUpdateMaintenance();

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

    const maintenances = useMemo(
        () => (rawData as ServiceOrderRow[]).map(mapRow),
        [rawData]
    );

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

    const handleApprove = (id: string) => {
        if (!user?.id) return;
        approve.mutate(
            { id, approvedBy: user.id },
            {
                onSuccess: () => { toast.success('Manutenção aprovada.'); setSelectedMaintenance(null); },
                onError: () => toast.error('Erro ao aprovar manutenção.'),
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

            {/* Busca + filtros */}
            <SGFToolbar
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
            />

            {/* Kanban */}
            <div className="grid gap-6 md:grid-cols-4 items-start h-full">
                {statusColumns.map((column) => {
                    const Icon = column.icon;
                    const items = getMaintenancesByStatus(column.id);

                    return (
                        <div key={column.id} className="flex flex-col h-full bg-slate-50/50 rounded-3xl border border-slate-100/60 p-3 lg:p-4">
                            <div className="flex items-center gap-3 mb-4 px-1">
                                <div className={cn("p-2 rounded-xl bg-white shadow-sm border border-slate-100", column.color)}>
                                    <Icon className="h-4 w-4" />
                                </div>
                                <span className="font-bold text-slate-700 text-sm tracking-tight">{column.label}</span>
                                <span className="ml-auto bg-white shadow-sm border border-slate-100 text-slate-500 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
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
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Car className="h-5 w-5 shrink-0 text-slate-400" />
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-slate-800 text-base truncate leading-tight">{maintenance.vehicleLabel}</p>
                                                            <p className="text-sm font-medium text-slate-400 truncate">{maintenance.plate}</p>
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
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <span className="text-sm font-medium text-slate-400 truncate">{maintenance.department}</span>
                                                        <span className="shrink-0 px-2 py-0.5 rounded-full text-sm font-semibold bg-slate-100 text-slate-600">
                                                            {maintenance.category}
                                                        </span>
                                                    </div>
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
                                    <SGFButton variant="primary" loading={approve.isPending} onClick={() => selectedMaintenance && handleApprove(selectedMaintenance.id)}>
                                        Aprovar
                                    </SGFButton>
                                </>
                            )}
                            {selectedMaintenance?.status === 'aprovada' && (
                                <SGFButton variant="primary" loading={update.isPending} onClick={() => selectedMaintenance && handleSetStatus(selectedMaintenance.id, 'em_execucao')}>
                                    Iniciar Execução
                                </SGFButton>
                            )}
                            {selectedMaintenance?.status === 'em_execucao' && (
                                <SGFButton variant="primary" loading={update.isPending} onClick={() => selectedMaintenance && handleSetStatus(selectedMaintenance.id, 'concluida')}>
                                    Concluir Serviço
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
                        <div className="flex items-center justify-between p-4 bg-slate-100 rounded-2xl border border-slate-200">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-200">
                                    <Clock className="h-5 w-5 text-slate-500" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Status Atual</p>
                                    <p className="font-bold text-slate-900">{statusColumns.find(c => c.id === selectedMaintenance.status)?.label ?? selectedMaintenance.status}</p>
                                </div>
                            </div>
                            <SGFBadge variant={priorityColors[selectedMaintenance.priority]}>
                                Prioridade {priorityLabels[selectedMaintenance.priority]}
                            </SGFBadge>
                        </div>

                        <div className="grid gap-6 md:grid-cols-2">
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                                        <Car width={20} height={20} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Veículo</p>
                                        <p className="font-bold text-slate-900">{selectedMaintenance.vehicleLabel}</p>
                                        <p className="text-xs font-medium text-slate-600">{selectedMaintenance.plate} · {selectedMaintenance.department}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                                        <Calendar width={20} height={20} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Abertura</p>
                                        <p className="font-bold text-slate-900">{formatDate(selectedMaintenance.date)}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                                        <Wrench width={20} height={20} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Categoria</p>
                                        <div className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 w-fit">
                                            {selectedMaintenance.category}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl">
                                        <AlertTriangle width={20} height={20} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Motorista solicitante</p>
                                        <p className="font-bold text-slate-900">{selectedMaintenance.driver}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 bg-slate-100 rounded-2xl border border-slate-200 space-y-2">
                            <div className="flex items-center gap-2 mb-2">
                                <FileText className="h-4 w-4 text-slate-500" />
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Descrição detalhada</span>
                            </div>
                            <p className="text-sm text-slate-700 leading-relaxed font-medium italic">
                                "{selectedMaintenance.description}"
                            </p>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
