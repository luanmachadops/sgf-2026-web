import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFKPICard } from '@/components/sgf/SGFKPICard';
import { SGFToolbar } from '@/components/sgf/SGFToolbar';
import { SGFInput } from '@/components/sgf/SGFInput';
import { Modal } from '@/components/ui/Modal';
import { ChecklistItemsList } from '@/components/checklists/ChecklistItemsList';
import { OpenServiceOrderFromChecklist } from '@/components/checklists/OpenServiceOrderFromChecklist';
import {
    Clipboard,
    Car,
    User,
    Calendar,
    CheckCircle,
    AlertTriangle,
    Wrench,
} from '@/components/sgf/icons';
import { useHeader } from '@/contexts/HeaderContext';
import { checklistsApi, departmentsApi } from '@/lib/supabase-api';
import type { ChecklistListRecord } from '@/lib/supabase-api';
import { formatDateTime, formatPlate } from '@/lib/utils';

export default function Checklists() {
    const { setTitle, setDescription, setHeaderAction } = useHeader();
    const queryClient = useQueryClient();

    const [searchTerm, setSearchTerm] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [openOsFor, setOpenOsFor] = useState<ChecklistListRecord | null>(null);

    useEffect(() => {
        setTitle('Checklists');
        setDescription('Checklists pré-viagem registrados pelos motoristas em toda a frota.');
        setHeaderAction(null);
        return () => setHeaderAction(null);
    }, [setTitle, setDescription, setHeaderAction]);

    const { data: departments = [] } = useQuery({
        queryKey: ['departments'],
        queryFn: () => departmentsApi.getAll(),
    });

    const filters = useMemo(
        () => ({
            from: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
            to: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : undefined,
            departmentId: departmentFilter || undefined,
            limit: 200,
        }),
        [dateFrom, dateTo, departmentFilter]
    );

    const { data: checklists = [], isLoading } = useQuery({
        queryKey: ['checklists', 'list', filters],
        queryFn: () => checklistsApi.getAllList(filters),
    });

    const departmentOptions = useMemo(
        () => [
            { value: '', label: 'Todas as secretarias' },
            ...departments.map((d) => ({ value: d.id, label: d.name })),
        ],
        [departments]
    );

    const rows = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return (checklists as ChecklistListRecord[]).filter((c) => {
            if (!term) return true;
            const plate = c.vehicles?.plate?.toLowerCase() ?? '';
            const driver = c.profiles?.full_name?.toLowerCase() ?? '';
            return plate.includes(term) || driver.includes(term);
        });
    }, [checklists, searchTerm]);

    const problemCount = useMemo(
        () => rows.filter((c) => (c.checklist_items ?? []).some((i) => i.state !== 'ok')).length,
        [rows]
    );

    const selected = rows.find((c) => c.id === selectedId) ?? null;

    const handleOpenOs = (checklist: ChecklistListRecord) => {
        setSelectedId(null);
        setOpenOsFor(checklist);
    };

    return (
        <div className="space-y-6">
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid gap-4 md:grid-cols-3"
            >
                <SGFKPICard
                    title="Checklists no período"
                    value={rows.length}
                    icon={Clipboard}
                    iconColor="text-slate-500"
                    chartColor="#64748b"
                />
                <SGFKPICard
                    title="Com problema"
                    value={problemCount}
                    icon={AlertTriangle}
                    iconColor="text-rose-500"
                    chartColor="#ef4444"
                />
                <SGFKPICard
                    title="OK"
                    value={rows.length - problemCount}
                    icon={CheckCircle}
                    iconColor="text-emerald-500"
                    chartColor="#10b981"
                />
            </motion.div>

            <SGFToolbar
                searchValue={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Buscar por placa ou motorista..."
                filters={[
                    {
                        key: 'department',
                        value: departmentFilter,
                        onChange: setDepartmentFilter,
                        options: departmentOptions,
                        placeholder: 'Secretaria',
                    },
                ]}
            >
                <div className="flex items-center gap-2">
                    <SGFInput
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="!w-[150px] !py-2.5 !text-sm"
                        aria-label="Data inicial"
                    />
                    <span className="text-sm text-slate-400">até</span>
                    <SGFInput
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="!w-[150px] !py-2.5 !text-sm"
                        aria-label="Data final"
                    />
                </div>
            </SGFToolbar>

            {isLoading ? (
                <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-[92px] animate-pulse rounded-[18px] bg-white/70" />
                    ))}
                </div>
            ) : rows.length === 0 ? (
                <SGFCard>
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                        <Clipboard className="h-8 w-8 text-slate-300" />
                        <p className="text-sm font-medium text-slate-500">Nenhum checklist encontrado para os filtros selecionados.</p>
                    </div>
                </SGFCard>
            ) : (
                <div className="space-y-3">
                    {rows.map((c) => {
                        const items = c.checklist_items ?? [];
                        const hasProblem = items.some((i) => i.state !== 'ok');
                        const openServiceOrder = (c.service_orders ?? [])[0] ?? null;
                        const vehicleLabel = [c.vehicles?.brand, c.vehicles?.model].filter(Boolean).join(' ') || c.vehicles?.plate || 'Veículo';

                        return (
                            <button key={c.id} onClick={() => setSelectedId(c.id)} className="w-full text-left">
                                <SGFCard padding="sm" className="transition-colors hover:border-emerald-300">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            {c.vehicles?.photo_url ? (
                                                <img
                                                    src={c.vehicles.photo_url}
                                                    alt={c.vehicles.plate ?? 'Veículo'}
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
                                                <p className="truncate text-sm font-semibold text-slate-900">
                                                    {vehicleLabel} <span className="font-mono text-xs text-slate-400">{formatPlate(c.vehicles?.plate)}</span>
                                                </p>
                                                <p className="truncate text-xs text-slate-500">
                                                    {c.vehicles?.departments?.name ?? 'Sem secretaria'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1.5 text-sm text-slate-600">
                                            <User className="h-4 w-4 text-slate-400" />
                                            {c.profiles?.full_name ?? '—'}
                                        </div>

                                        <div className="flex items-center gap-1.5 text-sm text-slate-500">
                                            <Calendar className="h-4 w-4 text-slate-400" />
                                            {formatDateTime(c.created_at)}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {openServiceOrder ? (
                                                <SGFBadge variant="info" icon={Wrench}>O.S. aberta</SGFBadge>
                                            ) : hasProblem ? (
                                                <SGFBadge variant="error" icon={AlertTriangle}>Com problema</SGFBadge>
                                            ) : (
                                                <SGFBadge variant="success" icon={CheckCircle}>OK</SGFBadge>
                                            )}
                                        </div>
                                    </div>
                                </SGFCard>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Detalhe do checklist */}
            <Modal
                isOpen={Boolean(selectedId)}
                onClose={() => setSelectedId(null)}
                title="Detalhes do checklist"
                description={selected ? `${formatDateTime(selected.created_at)} — ${selected.profiles?.full_name ?? '—'}` : undefined}
                size="md"
                footer={
                    selected && (selected.checklist_items ?? []).some((i) => i.state !== 'ok') ? (
                        <div className="flex w-full justify-end">
                            {(selected.service_orders ?? []).length > 0 ? (
                                <SGFBadge variant="info" icon={Wrench}>O.S. já aberta para este checklist</SGFBadge>
                            ) : (
                                <SGFButton icon={Wrench} onClick={() => handleOpenOs(selected)}>
                                    Abrir O.S.
                                </SGFButton>
                            )}
                        </div>
                    ) : undefined
                }
            >
                {selected && <ChecklistItemsList items={selected.checklist_items ?? []} />}
            </Modal>

            {/* Abertura de O.S. a partir do checklist */}
            <Modal
                isOpen={Boolean(openOsFor)}
                onClose={() => setOpenOsFor(null)}
                title="Abrir Ordem de Serviço"
                description="Pré-preenchida com os itens reprovados no checklist."
                size="lg"
            >
                {openOsFor && (
                    <OpenServiceOrderFromChecklist
                        checklist={openOsFor}
                        items={openOsFor.checklist_items ?? []}
                        onSuccess={() => {
                            setOpenOsFor(null);
                            queryClient.invalidateQueries({ queryKey: ['checklists', 'list'] });
                        }}
                        onCancel={() => setOpenOsFor(null)}
                    />
                )}
            </Modal>
        </div>
    );
}
