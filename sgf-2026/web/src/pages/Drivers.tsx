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
import { DriverAccessForm } from '@/components/drivers/DriverAccessForm';
import { Modal } from '@/components/ui/Modal';
import { useHeader } from '@/contexts/HeaderContext';
import { departmentsApi } from '@/lib/supabase-api';
import { formatCPF, formatDate, getStatusColor, getStatusLabel } from '@/lib/utils';
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
        return { label: 'Sem data', variant: 'default' as const, urgent: false };
    }
    const today = new Date();
    const expiry = parseISO(expiryDate);
    if (isNaN(expiry.getTime())) {
        return { label: 'Sem data', variant: 'default' as const, urgent: false };
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
            <SGFButton onClick={() => setShowAddModal(true)} icon={Users} className="!rounded-full !h-[37px]">
                Novo Motorista
            </SGFButton>
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
                <div className="flex items-center gap-1.5 text-sm text-slate-600">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span>{row.phone || '—'}</span>
                </div>
            ),
        },
        {
            header: 'CNH',
            accessor: (row) => <span className="font-mono text-sm text-slate-700">{row.cnh_number}</span>,
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
                <div className="flex flex-col items-start gap-1.5">
                    <SGFBadge variant={getStatusColor(row.status) as any}>
                        {getStatusLabel(row.status)}
                    </SGFBadge>
                    {!row.hasAccess && (
                        <SGFBadge
                            variant="warning"
                            icon={KeyRound}
                            dot
                            size="sm"
                        >
                            Sem acesso
                        </SGFBadge>
                    )}
                </div>
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
                            className="relative flex items-center justify-between p-5 bg-rose-50 border border-rose-100 rounded-3xl shadow-sm mb-2 cursor-pointer hover:bg-rose-100/50 transition-colors group"
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 bg-rose-500 text-white rounded-xl shadow-lg shadow-rose-500/20 group-hover:scale-105 transition-transform shrink-0">
                                    <AlertTriangle className="h-6 w-6" />
                                </div>
                                <div>
                                    <h4 className="font-black text-rose-900 leading-tight">Atenção com a CNH</h4>
                                    <p className="text-sm text-rose-700/80 font-medium">
                                        <span className="font-black">{urgentCNHCount} motorista(s)</span> com CNH vencida ou próxima do vencimento. Clique para ver a lista.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowWarning(false);
                                }}
                                className="p-2 text-rose-400 hover:text-rose-700 hover:bg-rose-100/80 rounded-xl transition-colors shrink-0"
                                title="Fechar aviso"
                            >
                                <X className="h-5 w-5" />
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

            <div className="-mx-6 md:mx-0">
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
