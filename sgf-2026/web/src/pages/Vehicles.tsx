import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Car, Fuel, Plus, Wrench } from '@/components/sgf/icons';
import { Modal } from '@/components/ui/Modal';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFKPICard } from '@/components/sgf/SGFKPICard';
import { SGFTable, type SGFTableColumn } from '@/components/sgf/SGFTable';
import { SGFToolbar } from '@/components/sgf/SGFToolbar';
import { NewVehicleForm } from '@/components/vehicles/NewVehicleForm';
import { useHeader } from '@/contexts/HeaderContext';
import { departmentsApi } from '@/lib/supabase-api';
import { formatDistance, formatPlate, getStatusColor, getStatusLabel } from '@/lib/utils';
import { useVehicles } from '@/hooks/useVehicles';
import type { VehicleRecord } from '@/lib/supabase-api';

type VehicleTableRow = VehicleRecord & {
    departmentName: string;
};

const statusOptions = [
    { value: '', label: 'Todos os status' },
    { value: 'AVAILABLE', label: 'Disponível' },
    { value: 'IN_USE', label: 'Em uso' },
    { value: 'MAINTENANCE', label: 'Manutenção' },
    { value: 'INACTIVE', label: 'Inativo' },
];

function getFuelLabel(fuelType: VehicleRecord['fuel_type']) {
    const labels: Record<string, string> = {
        GASOLINE: 'Gasolina',
        ETHANOL: 'Etanol',
        DIESEL: 'Diesel',
        FLEX: 'Flex',
    };

    return labels[fuelType] || fuelType;
}

export default function Vehicles() {
    const navigate = useNavigate();
    const { setTitle, setDescription, setHeaderAction } = useHeader();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);

    const { data: departments = [] } = useQuery({
        queryKey: ['departments'],
        queryFn: () => departmentsApi.getAll(),
    });

    const { data: vehicles = [], isLoading } = useVehicles({
        search: searchTerm || undefined,
        status: statusFilter as 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'INACTIVE' | undefined,
        departmentId: departmentFilter || undefined,
    });

    useEffect(() => {
        setTitle('Frota');
        setDescription('Cadastro e gestão dos veículos da frota municipal.');

        setHeaderAction(
            <SGFButton onClick={() => setShowAddModal(true)} icon={Plus} className="!rounded-full !h-[37px]">
                Novo Veículo
            </SGFButton>
        );

        return () => {
            setHeaderAction(null);
        };
    }, [setHeaderAction, setTitle, setDescription]);

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

    const tableRows = useMemo<VehicleTableRow[]>(
        () =>
            vehicles.map((vehicle) => ({
                ...vehicle,
                departmentName: vehicle.departments?.name || 'Sem secretaria',
            })),
        [vehicles]
    );

    const statusCounts = useMemo(
        () =>
            tableRows.reduce(
                (acc, vehicle) => {
                    acc[vehicle.status] = (acc[vehicle.status] || 0) + 1;
                    return acc;
                },
                {} as Record<string, number>
            ),
        [tableRows]
    );

    const totalTankCapacity = tableRows.reduce((sum, vehicle) => sum + vehicle.tank_capacity, 0);

    const columns: SGFTableColumn<VehicleTableRow>[] = [
        {
            header: 'Modelo do Veículo',
            accessor: (row) => (
                <div className="flex items-center gap-3">
                    {row.photo_url ? (
                        <img
                            src={row.photo_url}
                            alt={row.plate ?? 'Veículo'}
                            className="h-10 w-10 rounded-lg object-cover ring-1 ring-slate-200"
                            loading="lazy"
                            onError={(e) => {
                                // Se a imagem falhar, esconde o <img> e mostra o fallback.
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                        />
                    ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--sgf-primary)]/10">
                            <Car className="h-5 w-5 text-[var(--sgf-primary)]" />
                        </div>
                    )}
                    <div>
                        <p className="font-semibold text-slate-900 truncate">
                            {row.brand} {row.model}
                        </p>
                    </div>
                </div>
            ),
        },
        {
            header: 'Placa',
            accessor: (row) => <span className="font-mono text-sm text-slate-700">{formatPlate(row.plate)}</span>,
        },
        {
            header: 'Ano',
            accessor: (row) => <span className="text-sm text-slate-600 font-medium">{row.year}</span>,
        },
        {
            header: 'Combustível',
            accessor: (row) => <span className="text-sm text-slate-600 font-medium">{getFuelLabel(row.fuel_type)}</span>,
        },
        {
            header: 'Secretaria',
            accessor: 'departmentName',
        },
        {
            header: 'Odômetro',
            accessor: (row) => formatDistance(row.current_odometer),
        },
        {
            header: 'Status',
            accessor: (row) => (
                <SGFBadge variant={getStatusColor(row.status) as any}>
                    {getStatusLabel(row.status)}
                </SGFBadge>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid gap-4 md:grid-cols-4"
            >
                <SGFKPICard
                    title="Frota Total"
                    value={tableRows.length}
                    icon={Car}
                    iconColor="text-slate-500"
                    chartColor="#64748b"
                    chartData={[
                        { month: 'Total', value: tableRows.length },
                        { month: 'Uso', value: statusCounts.IN_USE || 0 },
                        { month: 'Disp.', value: statusCounts.AVAILABLE || 0 },
                    ]}
                />
                <SGFKPICard
                    title="Disponíveis"
                    value={statusCounts.AVAILABLE || 0}
                    icon={Car}
                    iconColor="text-emerald-500"
                    chartColor="#10b981"
                    chartData={[
                        { month: 'Disp.', value: statusCounts.AVAILABLE || 0 },
                        { month: 'Uso', value: statusCounts.IN_USE || 0 },
                        { month: 'Man.', value: statusCounts.MAINTENANCE || 0 },
                    ]}
                />
                <SGFKPICard
                    title="Em Uso"
                    value={statusCounts.IN_USE || 0}
                    icon={Fuel}
                    iconColor="text-blue-500"
                    chartColor="#3b82f6"
                    chartData={[
                        { month: 'Uso', value: statusCounts.IN_USE || 0 },
                        { month: 'Disp.', value: statusCounts.AVAILABLE || 0 },
                        { month: 'Inat.', value: statusCounts.INACTIVE || 0 },
                    ]}
                />
                <SGFKPICard
                    title="Capacidade Total"
                    value={`${totalTankCapacity.toFixed(0)} L`}
                    icon={Wrench}
                    iconColor="text-amber-500"
                    chartColor="#f59e0b"
                    chartData={[
                        { month: 'Disp.', value: statusCounts.AVAILABLE || 0 },
                        { month: 'Uso', value: statusCounts.IN_USE || 0 },
                        { month: 'Man.', value: statusCounts.MAINTENANCE || 0 },
                    ]}
                />
            </motion.div>

            <SGFToolbar
                searchValue={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Buscar por placa, marca ou modelo..."
                filters={[
                    {
                        key: 'department',
                        value: departmentFilter,
                        onChange: setDepartmentFilter,
                        options: departmentOptions,
                        placeholder: 'Secretaria',
                    },
                    {
                        key: 'status',
                        value: statusFilter,
                        onChange: setStatusFilter,
                        options: statusOptions,
                        placeholder: 'Status',
                    },
                ]}
            />

            {/* Cards (mobile) — design dedicado da frota */}
            <div className="space-y-3 md:hidden">
                {isLoading ? (
                    [...Array(4)].map((_, i) => <div key={i} className="h-[110px] animate-pulse rounded-[18px] bg-white/70" />)
                ) : tableRows.length === 0 ? (
                    <div className="rounded-[18px] bg-white p-10 text-center text-sm text-slate-400 shadow-sm">Nenhum veículo encontrado.</div>
                ) : tableRows.map((row) => {
                    const barColor = row.status === 'AVAILABLE' ? '#5BCE72' : row.status === 'MAINTENANCE' ? '#F59E0B' : row.status === 'IN_USE' ? '#3B82F6' : '#9CA3AF';
                    return (
                        <div
                            key={row.id}
                            onClick={() => navigate(`/veiculos/${row.id}`)}
                            className="relative flex cursor-pointer items-center gap-3.5 overflow-hidden rounded-[18px] bg-white py-3.5 pl-4 pr-3.5 text-[#2F2F2F] shadow-sm active:bg-slate-50"
                        >
                            <div className="relative h-[62px] w-[62px] shrink-0">
                                {/* Fallback por baixo */}
                                <div className="absolute inset-0 flex items-center justify-center rounded-[14px] bg-[#D9D9D9]">
                                    <Car className="h-7 w-7 text-slate-500/70" />
                                </div>
                                {row.photo_url && (
                                    <img
                                        src={row.photo_url}
                                        alt={row.plate ?? ''}
                                        loading="lazy"
                                        className="absolute inset-0 h-[62px] w-[62px] rounded-[14px] object-cover ring-1 ring-slate-200 bg-white"
                                        onError={(e) => {
                                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                )}
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="min-w-0 truncate text-[16px] font-bold leading-tight">{row.brand} {row.model}</p>
                                    <span className="max-w-[42%] shrink-0 truncate rounded-full bg-[#E0E8E6] px-2.5 py-0.5 text-[11px] font-bold text-[#2F2F2F]">
                                        {row.departmentName}
                                    </span>
                                </div>
                                <div className="mt-1.5 grid grid-cols-2 text-[13.5px] leading-snug">
                                    <div className="space-y-0.5 pr-3">
                                        <p className="truncate font-mono">{formatPlate(row.plate)}</p>
                                        <p className="truncate">{getFuelLabel(row.fuel_type)}</p>
                                    </div>
                                    <div className="space-y-0.5 border-l border-slate-200 pl-3">
                                        <p className="truncate">{formatDistance(row.current_odometer)}</p>
                                        <p className="truncate">{row.year ?? '—'}</p>
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
                    onRowClick={(row) => navigate(`/veiculos/${row.id}`)}
                    loading={isLoading}
                    emptyMessage="Nenhum veículo encontrado."
                />
            </div>

            <Modal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                title="Novo Veículo"
                description="Cadastre um veículo com os campos reais da frota."
                size="xl"
                showCloseButton={false}
            >
                <NewVehicleForm
                    onSuccess={() => setShowAddModal(false)}
                    onCancel={() => setShowAddModal(false)}
                />
            </Modal>
        </div>
    );
}
