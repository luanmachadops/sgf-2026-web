import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle,
    Edit2,
    Eye,
    KeyRound,
    Phone,
    ShieldCheck,
    X,
    Users,
} from '@/components/sgf/icons';
import { differenceInDays, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFKPICard } from '@/components/sgf/SGFKPICard';
import { SGFTable, type SGFTableColumn } from '@/components/sgf/SGFTable';
import { SGFToolbar } from '@/components/sgf/SGFToolbar';
import { NewDriverForm } from '@/components/drivers/NewDriverForm';
import { PreRegisterDriverModal } from '@/components/drivers/PreRegisterDriverModal';
import { DriverAccessForm } from '@/components/drivers/DriverAccessForm';
import { Modal } from '@/components/ui/Modal';
import { useHeader } from '@/contexts/HeaderContext';
import { departmentsApi } from '@/lib/supabase-api';
import { formatCPF, formatDate, getStatusColor, getStatusLabel, formatPhone, formatCNH } from '@/lib/utils';
import { useDrivers, type DriverRecord } from '@/hooks/useDrivers';
import { useAppSettings } from '@/hooks/useSettings';



type DriverTableRow = DriverRecord & {
    departmentName: string;
    hasAccess: boolean;
};

function getInitials(name: string) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '–';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getLicenseStatus(expiryDate: string | null | undefined, alertDays = 30) {
    if (!expiryDate) {
        return { label: 'Não cadastrada', variant: 'default' as const, urgent: false };
    }
    const today = new Date();
    const expiry = parseISO(expiryDate);
    if (Number.isNaN(expiry.getTime())) {
        return { label: 'Não cadastrada', variant: 'default' as const, urgent: false };
    }
    const daysUntilExpiry = differenceInDays(expiry, today);

    if (daysUntilExpiry < 0) {
        return { label: 'Vencida', variant: 'error' as const, urgent: true };
    }
    if (daysUntilExpiry <= alertDays) {
        return { label: `Vence em ${daysUntilExpiry} dias`, variant: 'warning' as const, urgent: true };
    }
    if (daysUntilExpiry <= alertDays * 3) {
        return { label: `Vence em ${daysUntilExpiry} dias`, variant: 'info' as const, urgent: false };
    }

    return { label: 'Regular', variant: 'success' as const, urgent: false };
}

export default function Drivers() {
    const navigate = useNavigate();
    const { setTitle, setDescription, setHeaderAction } = useHeader();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showPreRegister, setShowPreRegister] = useState(false);
    const [showWarning, setShowWarning] = useState(true);
    const [showExpiredModal, setShowExpiredModal] = useState(false);
    const [accessModal, setAccessModal] = useState<{
        mode: 'provision' | 'reset';
        driver: DriverRecord;
    } | null>(null);

    const { data: departments = [] } = useQuery({
        queryKey: ['departments'],
        queryFn: () => departmentsApi.getAll(),
    });

    const {
        data: drivers = [],
        isLoading,
    } = useDrivers({
        search: searchTerm || undefined,
        departmentId: departmentFilter || undefined,
    });

    const { data: appSettings } = useAppSettings();
    const cnhDays = appSettings?.cnhAlertDays ?? 30;

    useEffect(() => {
        setTitle('Motoristas');
        setDescription('Cadastro, habilitação e acesso dos motoristas ao app.');

        setHeaderAction(
            <div className="flex items-center gap-2">
                <SGFButton variant="secondary" onClick={() => setShowPreRegister(true)} className="!rounded-full !h-[37px]">
                    Pré-cadastro
                </SGFButton>
                <SGFButton onClick={() => setShowAddModal(true)} icon={Users} className="!rounded-full !h-[37px]">
                    Novo Motorista
                </SGFButton>
            </div>
        );

        return () => {
            setHeaderAction(null);
        };
    }, [setTitle, setDescription, setHeaderAction]);

    const departmentOptions = useMemo(
        () => [
            { value: '', label: 'Todas as secretarias' },
            ...departments.map((department) => ({
                value: department.id,
                label: department.name,
            })),
        ],
        [departments]
    );

    const allDriversDecora = useMemo<DriverTableRow[]>(
        () =>
            drivers.map((driver) => ({
                ...driver,
                departmentName: driver.departments?.name || 'Sem secretaria',
                hasAccess: Boolean(driver.user_id),
            })),
        [drivers]
    );

    const tableRows = useMemo<DriverTableRow[]>(
        () => {
            if (statusFilter) {
                return allDriversDecora.filter((d) => d.status === statusFilter);
            }
            return allDriversDecora;
        },
        [allDriversDecora, statusFilter]
    );

    const urgentCNHCount = useMemo(() => allDriversDecora.filter((driver) => getLicenseStatus(driver.cnh_expiry_date, cnhDays).urgent).length, [allDriversDecora, cnhDays]);
    const urgentDrivers = useMemo(() => allDriversDecora.filter((driver) => getLicenseStatus(driver.cnh_expiry_date, cnhDays).urgent), [allDriversDecora, cnhDays]);
    const activeDriversCount = useMemo(() => allDriversDecora.filter((driver) => driver.status === 'ACTIVE').length, [allDriversDecora]);
    const suspendedDriversCount = useMemo(() => allDriversDecora.filter((driver) => driver.status === 'SUSPENDED').length, [allDriversDecora]);
    const noAccessCount = useMemo(() => allDriversDecora.filter((driver) => !driver.hasAccess).length, [allDriversDecora]);

    const statusCounts = useMemo(() => ({
        all: allDriversDecora.length,
        ACTIVE: allDriversDecora.filter((d) => d.status === 'ACTIVE').length,
        INACTIVE: allDriversDecora.filter((d) => d.status === 'INACTIVE').length,
        SUSPENDED: allDriversDecora.filter((d) => d.status === 'SUSPENDED').length,
    }), [allDriversDecora]);

    const columns: SGFTableColumn<DriverTableRow>[] = [
        {
            header: 'Motorista',
            accessor: (row) => (
                <div className="flex items-center gap-3">
                    {(row as { photo_url?: string | null }).photo_url ? (
                        <img
                            src={(row as { photo_url?: string | null }).photo_url as string}
                            alt={row.name}
                            className="h-10 w-10 shrink-0 rounded-full object-cover shadow-sm"
                        />
                    ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-sm font-bold text-white shadow-sm">
                            {getInitials(row.name)}
                        </div>
                    )}
                    <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{row.name}</p>
                        <p className="font-mono text-xs text-slate-400">{formatCPF(row.cpf)}</p>
                    </div>
                </div>
            ),
        },
        {
            header: 'Contato',
            accessor: (row) => (
                <div className="flex items-center text-sm text-slate-600">
                    <span>{formatPhone(row.phone)}</span>
                </div>
            ),
        },
        {
            header: 'CNH',
            accessor: (row) => <span className="font-mono text-sm text-slate-700">{formatCNH(row.cnh_number)}</span>,
        },
        {
            header: 'Categoria',
            accessor: (row) => <span className="font-bold text-sm text-slate-500">{row.cnh_category}</span>,
        },
        {
            header: 'Vencimento CNH',
            accessor: (row) => (
                <span className="text-sm tabular-nums text-slate-700 font-medium">{formatDate(row.cnh_expiry_date)}</span>
            ),
        },
        {
            header: 'Situação CNH',
            accessor: (row) => {
                const status = getLicenseStatus(row.cnh_expiry_date, cnhDays);
                return <SGFBadge variant={status.variant} size="sm">{status.label}</SGFBadge>;
            },
        },
        {
            header: 'Secretaria',
            accessor: (row) => <span className="text-sm text-slate-600">{row.departmentName}</span>,
        },
        {
            header: 'Status',
            accessor: (row) => (
                <SGFBadge variant={getStatusColor(row.status) as any} size="sm">
                    {getStatusLabel(row.status)}
                </SGFBadge>
            ),
        },
        {
            header: 'Acesso',
            accessor: (row) => (
                !row.hasAccess ? (
                    <SGFBadge variant="default" size="sm">Sem acesso</SGFBadge>
                ) : row.must_change_password ? (
                    <SGFBadge variant="info" size="sm">Aguardando 1º acesso</SGFBadge>
                ) : (
                    <SGFBadge variant="success" size="sm">Com acesso</SGFBadge>
                )
            ),
        },
        {
            header: 'Ações',
            headerClassName: 'text-right',
            accessor: (row) => (
                <div className="flex items-center justify-end gap-0.5">
                    <Link
                        to={`/motoristas/${row.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        title="Ver detalhes"
                    >
                        <Eye className="h-4 w-4" />
                    </Link>
                    <button
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        title="Editar motorista"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                            row.hasAccess
                                ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                : 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50'
                        }`}
                        title={row.hasAccess ? 'Redefinir senha' : 'Criar acesso'}
                        onClick={(event) => {
                            event.stopPropagation();
                            setAccessModal({
                                mode: row.hasAccess ? 'reset' : 'provision',
                                driver: row,
                            });
                        }}
                    >
                        {row.hasAccess
                            ? <KeyRound className="h-4 w-4" />
                            : <ShieldCheck className="h-4 w-4" />}
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <AnimatePresence>
                {urgentCNHCount > 0 && showWarning && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div
                            onClick={() => setShowExpiredModal(true)}
                            className="relative mb-2 flex items-center justify-between gap-3 rounded-2xl border border-transparent bg-rose-50 p-4 transition-colors hover:bg-rose-100/40 cursor-pointer"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 ring-1 ring-inset ring-rose-200">
                                    <AlertTriangle className="h-5 w-5" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-semibold leading-tight text-rose-800">Atenção com a CNH</h4>
                                    <p className="text-[13px] text-rose-600/90">
                                        <span className="font-semibold">{urgentCNHCount} motorista(s)</span> com CNH vencida ou próxima do vencimento. Clique para ver a lista.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowWarning(false);
                                }}
                                className="shrink-0 rounded-lg p-1.5 text-rose-400 transition-colors hover:bg-rose-100/80 hover:text-rose-700"
                                title="Fechar aviso"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid gap-4 md:grid-cols-4">
                <SGFKPICard
                    title="Motoristas Ativos"
                    value={activeDriversCount}
                    icon={Users}
                    iconColor="text-emerald-500"
                    chartColor="#10b981"
                    chartData={[
                        { month: 'Cad.', value: tableRows.length },
                        { month: 'Ativ.', value: activeDriversCount },
                        { month: 'Susp.', value: suspendedDriversCount },
                    ]}
                />
                <SGFKPICard
                    title="Licenças em Alerta"
                    value={urgentCNHCount}
                    icon={AlertTriangle}
                    iconColor="text-amber-500"
                    chartColor="#f59e0b"
                    chartData={[
                        { month: 'Reg.', value: Math.max(tableRows.length - urgentCNHCount, 0) },
                        { month: 'Alert.', value: urgentCNHCount },
                        { month: 'Susp.', value: suspendedDriversCount },
                    ]}
                />
                <SGFKPICard
                    title="Sem Acesso"
                    value={noAccessCount}
                    icon={ShieldCheck}
                    iconColor="text-sky-500"
                    chartColor="#0ea5e9"
                    chartData={[
                        { month: 'Com', value: tableRows.length - noAccessCount },
                        { month: 'Sem', value: noAccessCount },
                        { month: 'Total', value: tableRows.length },
                    ]}
                />
                <SGFKPICard
                    title="Cadastros Suspensos"
                    value={suspendedDriversCount}
                    icon={Users}
                    iconColor="text-slate-400"
                    chartColor="#94a3b8"
                    chartData={[
                        { month: 'Ativ.', value: activeDriversCount },
                        { month: 'Sem', value: noAccessCount },
                        { month: 'Susp.', value: suspendedDriversCount },
                    ]}
                />
            </div>

            <SGFToolbar
                searchValue={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Buscar por nome, CPF, e-mail ou CNH..."
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
                {/* Tabs de status */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {[
                        { value: '', label: 'Todos' },
                        { value: 'ACTIVE', label: 'Ativos' },
                        { value: 'INACTIVE', label: 'Inativos' },
                        { value: 'SUSPENDED', label: 'Suspensos' },
                    ].map((t) => {
                        const isActive = statusFilter === t.value;
                        const count = t.value === '' ? statusCounts.all
                            : (statusCounts[t.value as keyof typeof statusCounts] ?? 0);
                        return (
                            <button
                                key={t.value || 'all'}
                                type="button"
                                onClick={() => setStatusFilter(t.value)}
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

            {/* Cards (mobile) — design dedicado de motoristas */}
            <div className="space-y-3 md:hidden">
                {isLoading ? (
                    [...Array(4)].map((_, i) => <div key={i} className="h-[110px] animate-pulse rounded-[18px] bg-white/70" />)
                ) : tableRows.length === 0 ? (
                    <div className="rounded-[18px] bg-white p-10 text-center text-sm text-slate-400 shadow-sm">Nenhum motorista encontrado.</div>
                ) : tableRows.map((row) => {
                    const barColor = row.status === 'ACTIVE' ? '#5BCE72' : row.status === 'SUSPENDED' ? '#EF4444' : '#9CA3AF';
                    const cnhStatus = getLicenseStatus(row.cnh_expiry_date, cnhDays);
                    
                    return (
                        <div
                            key={row.id}
                            onClick={() => navigate(`/motoristas/${row.id}`)}
                            className="relative flex cursor-pointer items-center gap-3.5 overflow-hidden rounded-[18px] bg-white py-3.5 pl-4 pr-3.5 text-[#2F2F2F] shadow-sm transition-all duration-150 active:scale-[0.98] active:bg-slate-50"
                        >
                            <div className="relative h-[62px] w-[62px] shrink-0">
                                {/* Fallback por baixo */}
                                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-base font-bold text-white shadow-sm">
                                    {getInitials(row.name)}
                                </div>
                                {(row as { photo_url?: string | null }).photo_url && (
                                    <img
                                        src={(row as { photo_url?: string | null }).photo_url as string}
                                        alt={row.name}
                                        loading="lazy"
                                        className="absolute inset-0 h-[62px] w-[62px] rounded-full object-cover ring-1 ring-slate-200 bg-white"
                                        onError={(e) => {
                                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                )}
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="min-w-0 truncate text-[16px] font-bold leading-tight">{row.name}</p>
                                    <span className="max-w-[42%] shrink-0 truncate rounded-full bg-[#E0E8E6] px-2.5 py-0.5 text-[11px] font-bold text-[#2F2F2F]">
                                        {row.departmentName}
                                    </span>
                                </div>
                                <div className="mt-1.5 grid grid-cols-2 text-[13.5px] leading-snug">
                                    <div className="space-y-0.5 pr-3 text-slate-500">
                                        <p className="truncate font-mono text-slate-600 font-medium">CNH: {row.cnh_number || '—'}</p>
                                        <p className="truncate uppercase font-bold text-[11px] tracking-wider text-slate-400">Cat. {row.cnh_category || '—'}</p>
                                    </div>
                                    <div className="space-y-0.5 border-l border-slate-200 pl-3">
                                        <p className={`truncate font-medium text-slate-600 ${cnhStatus.urgent ? 'text-red-600 font-bold' : ''}`}>
                                            Val. {formatDate(row.cnh_expiry_date)}
                                        </p>
                                        <div className="truncate text-[12px] font-bold">
                                            {!row.hasAccess ? (
                                                <span className="text-amber-600">Sem acesso</span>
                                            ) : row.must_change_password ? (
                                                <span className="text-sky-600 font-medium">1º acesso pendente</span>
                                            ) : (
                                                <span className="text-emerald-600">Acesso liberado</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Tabela (desktop) */}
            <div className="-mx-6 hidden md:mx-0 md:block">
                <SGFTable
                    columns={columns}
                    data={tableRows}
                    keyExtractor={(row) => row.id}
                    loading={isLoading}
                    onRowClick={(row) => navigate(`/motoristas/${row.id}`)}
                    emptyMessage="Nenhum motorista encontrado."
                />
            </div>

            <Modal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                title="Novo Motorista"
                description="Cadastre o motorista e já crie o acesso dele ao app."
                size="xl"
                showCloseButton={false}
            >
                <NewDriverForm
                    onSuccess={() => {
                        setShowAddModal(false);
                    }}
                    onCancel={() => setShowAddModal(false)}
                />
            </Modal>

            <PreRegisterDriverModal
                isOpen={showPreRegister}
                onClose={() => setShowPreRegister(false)}
            />

            <Modal
                isOpen={Boolean(accessModal)}
                onClose={() => setAccessModal(null)}
                title={accessModal?.mode === 'reset' ? 'Redefinir senha' : 'Criar acesso'}
                description={
                    accessModal?.mode === 'reset'
                        ? 'Defina uma nova senha para o motorista selecionado.'
                        : 'Crie a senha inicial para liberar o acesso do motorista ao app.'
                }
                size="lg"
                showCloseButton={false}
            >
                {accessModal ? (
                    <DriverAccessForm
                        driver={accessModal.driver}
                        mode={accessModal.mode}
                        onSuccess={() => setAccessModal(null)}
                        onCancel={() => setAccessModal(null)}
                    />
                ) : null}
            </Modal>

            <Modal
                isOpen={showExpiredModal}
                onClose={() => setShowExpiredModal(false)}
                title="Motoristas com CNH Expirada / Alerta"
                description="Selecione um motorista para ver o perfil completo e atualizar seus dados."
                size="lg"
            >
                <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto pr-1">
                    {urgentDrivers.map((driver) => {
                        const status = getLicenseStatus(driver.cnh_expiry_date);
                        return (
                            <div
                                key={driver.id}
                                onClick={() => {
                                    setShowExpiredModal(false);
                                    navigate(`/motoristas/${driver.id}`);
                                }}
                                className="flex items-center justify-between py-3.5 px-2 hover:bg-slate-50 rounded-2xl cursor-pointer transition-colors group"
                            >
                                <div className="flex items-center gap-3">
                                    {(driver as { photo_url?: string | null }).photo_url ? (
                                        <img
                                            src={(driver as { photo_url?: string | null }).photo_url as string}
                                            alt={driver.name}
                                            className="h-10 w-10 shrink-0 rounded-full object-cover shadow-sm"
                                        />
                                    ) : (
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                                            {getInitials(driver.name)}
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <p className="font-bold text-slate-800 group-hover:text-emerald-700 transition-colors truncate">{driver.name}</p>
                                        <p className="text-xs font-mono text-slate-400">CNH: {driver.cnh_number} ({driver.cnh_category})</p>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <span className="text-sm font-semibold tabular-nums text-slate-700">{formatDate(driver.cnh_expiry_date)}</span>
                                    <SGFBadge variant={status.variant} size="sm">{status.label}</SGFBadge>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Modal>
        </div>
    );
}
