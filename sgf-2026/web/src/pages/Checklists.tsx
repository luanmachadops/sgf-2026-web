import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFKPICard } from '@/components/sgf/SGFKPICard';
import { SGFToolbar } from '@/components/sgf/SGFToolbar';
import { PeriodPresetSelect, PeriodRangeFields } from '@/components/sgf/PeriodSelect';
import { makePeriod, type PeriodValue } from '@/components/sgf/period';
import { EntityAvatar } from '@/components/sgf/EntityAvatar';
import { SGFTable, type SGFTableColumn } from '@/components/sgf/SGFTable';
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
    Eye,
} from '@/components/sgf/icons';
import { useHeader } from '@/contexts/HeaderContext';
import { checklistsApi, departmentsApi } from '@/lib/supabase-api';
import type { ChecklistListRecord } from '@/lib/supabase-api';
import { formatDateTime, formatPlate, matchesSearch } from '@/lib/utils';
import { useSyncOnChange } from '@/hooks/useSyncOnChange';

/** Início do período escolhido (ISO), no mesmo critério da tela de Viagens. */
function periodFrom(period: PeriodValue): string | undefined {
    if (period.preset === 'custom') return period.from ? new Date(`${period.from}T00:00:00`).toISOString() : undefined;
    const from = new Date();
    from.setMonth(from.getMonth() - (Number(period.preset) || 1));
    return from.toISOString();
}

export default function Checklists() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { setTitle, setDescription, setHeaderAction } = useHeader();
    const queryClient = useQueryClient();

    const [searchTerm, setSearchTerm] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [period, setPeriod] = useState<PeriodValue>(() => makePeriod('1'));
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [openOsFor, setOpenOsFor] = useState<ChecklistListRecord | null>(null);

    const paramId = searchParams.get('id') || searchParams.get('checklistId');
    const paramSearch = searchParams.get('search');

    useSyncOnChange(`${paramSearch ?? ''}|${paramId ?? ''}`, () => {
        if (paramSearch) setSearchTerm(paramSearch);
        if (paramId) setSelectedId(paramId);
    });

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
            from: periodFrom(period),
            to: period.preset === 'custom' && period.to ? new Date(`${period.to}T23:59:59`).toISOString() : undefined,
            departmentId: departmentFilter || undefined,
            limit: 200,
        }),
        [period, departmentFilter]
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
        return (checklists as ChecklistListRecord[]).filter((c) => {
            const vehicle = [c.vehicles?.brand, c.vehicles?.model].filter(Boolean).join(' ');
            return matchesSearch(
                searchTerm,
                c.vehicles?.plate,
                c.profiles?.full_name,
                vehicle,
            );
        });
    }, [checklists, searchTerm]);

    const problemCount = useMemo(
        () => rows.filter((c) => (c.checklist_items ?? []).some((i) => i.state !== 'ok')).length,
        [rows]
    );

    const requested = useMemo(() => {
        const all = checklists as ChecklistListRecord[];
        if (paramId) return all.find((checklist) => checklist.id === paramId) ?? null;
        if (!paramSearch) return null;
        return all.find((checklist) =>
            matchesSearch(
                paramSearch,
                checklist.vehicles?.plate,
                checklist.profiles?.full_name,
            )
        ) ?? null;
    }, [checklists, paramId, paramSearch]);
    const selected = rows.find((checklist) => checklist.id === selectedId)
        ?? requested;
    const activeSelectedId = selectedId ?? requested?.id ?? paramId;

    const closeSelected = () => {
        setSelectedId(null);
        if (!paramId) return;
        const next = new URLSearchParams(searchParams);
        next.delete('id');
        next.delete('checklistId');
        setSearchParams(next, { replace: true });
    };

    const handleOpenOs = (checklist: ChecklistListRecord) => {
        closeSelected();
        setOpenOsFor(checklist);
    };

    const columns: SGFTableColumn<ChecklistListRecord>[] = [
        {
            header: 'Veículo',
            sortType: 'text',
            sortValue: (c) => c.vehicles?.plate ?? '',
            accessor: (c) => {
                const vehicleLabel = [c.vehicles?.brand, c.vehicles?.model].filter(Boolean).join(' ');
                return (
                    <div className="flex min-w-0 items-center gap-3">
                        <EntityAvatar url={c.vehicles?.photo_url} icon={Car} alt={c.vehicles?.plate ?? 'Veículo'} square size="sm" />
                        <div className="min-w-0 max-w-[220px]">
                            <p className="font-mono text-sm font-semibold text-slate-900">{formatPlate(c.vehicles?.plate)}</p>
                            {vehicleLabel && <p className="truncate text-xs text-slate-500">{vehicleLabel}</p>}
                        </div>
                    </div>
                );
            },
        },
        {
            header: 'Secretaria',
            sortType: 'text',
            sortValue: (c) => c.vehicles?.departments?.name ?? '',
            accessor: (c) => (
                <span className="text-sm text-slate-600 font-medium whitespace-nowrap">
                    {c.vehicles?.departments?.name ?? '—'}
                </span>
            ),
        },
        {
            header: 'Motorista',
            sortType: 'text',
            sortValue: (c) => c.profiles?.full_name ?? '',
            accessor: (c) => (
                <div className="flex min-w-0 items-center gap-3 whitespace-nowrap text-sm font-medium text-slate-700">
                    <EntityAvatar url={c.profiles?.photo_url} icon={User} alt={c.profiles?.full_name ?? 'Motorista'} size="sm" />
                    <span className="max-w-[200px] truncate">{c.profiles?.full_name ?? '—'}</span>
                </div>
            ),
        },
        {
            header: 'Data / Hora',
            sortType: 'date',
            sortValue: (c) => c.created_at,
            accessor: (c) => (
                <div className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">
                    <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>{formatDateTime(c.created_at)}</span>
                </div>
            ),
        },
        {
            header: 'Conformidade',
            sortable: false,
            accessor: (c) => {
                const items = c.checklist_items ?? [];
                const okItems = items.filter((i) => i.state === 'ok').length;
                const total = items.length;
                const hasProblem = items.some((i) => i.state !== 'ok');
                return (
                    <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${hasProblem ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                        {total > 0 ? `${okItems}/${total} OK` : '100% OK'}
                    </span>
                );
            },
        },
        {
            header: 'Status',
            sortType: 'text',
            sortValue: (c) => {
                const openServiceOrder = (c.service_orders ?? [])[0] ?? null;
                const hasProblem = (c.checklist_items ?? []).some((i) => i.state !== 'ok');
                if (openServiceOrder) return 'O.S. aberta';
                if (hasProblem) return 'Com problema';
                return 'OK';
            },
            accessor: (c) => {
                const items = c.checklist_items ?? [];
                const hasProblem = items.some((i) => i.state !== 'ok');
                const openServiceOrder = (c.service_orders ?? [])[0] ?? null;
                return openServiceOrder ? (
                    <SGFBadge variant="info" icon={Wrench}>O.S. aberta</SGFBadge>
                ) : hasProblem ? (
                    <SGFBadge variant="error" icon={AlertTriangle}>Com problema</SGFBadge>
                ) : (
                    <SGFBadge variant="success" icon={CheckCircle}>OK</SGFBadge>
                );
            },
        },
        {
            header: 'Ações',
            sortable: false,
            accessor: (c) => (
                <SGFButton
                    variant="ghost"
                    size="sm"
                    icon={Eye}
                    onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(c.id);
                    }}
                >
                    Ver detalhes
                </SGFButton>
            ),
        },
    ];

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

            <SGFTable<ChecklistListRecord>
                columns={columns}
                data={rows}
                keyExtractor={(row) => row.id}
                onRowClick={(row) => setSelectedId(row.id)}
                loading={isLoading}
                emptyMessage="Nenhum checklist encontrado para os filtros selecionados."
            />

            {/* Detalhe do checklist */}
            <Modal
                isOpen={Boolean(activeSelectedId)}
                onClose={closeSelected}
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
