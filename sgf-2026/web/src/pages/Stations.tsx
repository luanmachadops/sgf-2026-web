import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    ArrowRight,
    Building2,
    Droplet,
    Fuel,
    Pencil,
    Plus,
    Receipt,
    Calendar,
    ArrowSync,
    Loader2,
} from '@/components/sgf/icons';
import {
    Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer,
    Tooltip, XAxis, YAxis,
} from 'recharts';
import { useHeader } from '@/contexts/HeaderContext';
import { useStations, useStationDetail } from '@/hooks/useStations';
import { useAppSettings } from '@/hooks/useSettings';
import { SGFBadge, SGFButton, SGFCard, SGFKPICard, SGFTable, SGFToolbar, type SGFTableColumn } from '@/components/sgf';
import { StationFormModal } from '@/components/stations/StationFormModal';
import { formatCurrency, formatDate } from '@/lib/utils';
import { differenceInDays, parseISO } from 'date-fns';
import type { Tables } from '@/types/database.types';

const FUEL_COLORS: Record<string, string> = {
    Diesel: '#10B981',
    Gasolina: '#F59E0B',
    Etanol: '#F97316',
    Flex: '#3B82F6',
    GNV: '#8B5CF6',
    'Diesel S10': '#14B8A6',
    Outros: '#94A3B8',
};

function ContractBadge({ end, alertDays = 30 }: { end: string | null; alertDays?: number }) {
    if (!end) return <SGFBadge variant="default">Sem data</SGFBadge>;
    const days = differenceInDays(parseISO(end), new Date());
    if (days < 0) return <SGFBadge variant="error">Vencida</SGFBadge>;
    if (days <= alertDays) return <SGFBadge variant="warning">{days} dias</SGFBadge>;
    if (days <= alertDays * 3) return <SGFBadge variant="info">{days} dias</SGFBadge>;
    return <SGFBadge variant="success">Em dia</SGFBadge>;
}

function StationsListPage() {
    const navigate = useNavigate();
    const { setTitle, setDescription, setHeaderAction } = useHeader();
    const [search, setSearch] = useState('');
    const [formOpen, setFormOpen] = useState(false);

    const { data: stations = [], isLoading } = useStations({ search: search || undefined });
    const { data: appSettings } = useAppSettings();
    const contractDays = appSettings?.contractAlertDays ?? 30;

    useEffect(() => {
        setTitle('Postos de combustível');
        setDescription('Cadastro de postos fornecedores e acompanhamento de licitação.');
        setHeaderAction(
            <SGFButton variant="primary" onClick={() => setFormOpen(true)} className="!rounded-full !h-[37px]">
                <Plus className="h-4 w-4" /> Novo posto
            </SGFButton>
        );
        return () => {
            setHeaderAction(null);
        };
    }, [setDescription, setHeaderAction, setTitle]);

    const totalActive = stations.filter((s) => s.is_active).length;
    const expiringSoon = stations.filter((s) => {
        if (!s.contract_end) return false;
        const d = differenceInDays(parseISO(s.contract_end), new Date());
        return d >= 0 && d <= contractDays;
    }).length;
    const expired = stations.filter((s) => {
        if (!s.contract_end) return false;
        return differenceInDays(parseISO(s.contract_end), new Date()) < 0;
    }).length;

    const columns: SGFTableColumn<Tables<'fuel_stations'>>[] = [
        {
            header: 'Posto',
            accessor: (s) => (
                <div className="flex items-center gap-3">
                    {(s as { photo_url?: string | null }).photo_url ? (
                        <img
                            src={(s as { photo_url?: string | null }).photo_url as string}
                            alt={s.name}
                            className="h-10 w-10 shrink-0 rounded-lg object-cover"
                        />
                    ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                            <Fuel className="h-5 w-5 text-emerald-600" />
                        </div>
                    )}
                    <div>
                        <p className="font-semibold text-slate-800">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.code ?? '—'}</p>
                    </div>
                </div>
            ),
        },
        {
            header: 'Cidade',
            accessor: (s) => <span className="text-sm text-slate-600">{s.city || '—'}</span>,
        },
        {
            header: 'Combustíveis',
            accessor: (s) => (
                <div className="flex flex-wrap gap-1">
                    {(s.fuel_types ?? []).map((f) => (
                        <SGFBadge key={f} variant="default">{f}</SGFBadge>
                    ))}
                </div>
            ),
        },
        { header: 'Contrato', accessor: (s) => s.contract_number ?? '—' },
        {
            header: 'Vencimento',
            accessor: (s) => (
                <span className="text-sm text-slate-700">{s.contract_end ? formatDate(s.contract_end) : '—'}</span>
            ),
        },
        {
            header: 'Dias p/ vencer',
            className: 'text-right',
            headerClassName: 'text-right',
            accessor: (s) => {
                if (!s.contract_end) return <span className="text-sm text-slate-400">—</span>;
                const days = differenceInDays(parseISO(s.contract_end), new Date());
                if (days < 0) {
                    return <span className="text-sm font-bold text-rose-600">{Math.abs(days)} dias vencida</span>;
                }
                if (days === 0) {
                    return <span className="text-sm font-bold text-amber-600">Vence hoje</span>;
                }
                const color = days <= contractDays ? 'text-amber-600' : 'text-slate-800';
                return <span className={`text-sm font-bold tabular-nums ${color}`}>{days} dias</span>;
            },
        },
        {
            header: 'Status',
            accessor: (s) => s.is_active
                ? <SGFBadge variant="success">Ativo</SGFBadge>
                : <SGFBadge variant="default">Inativo</SGFBadge>,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
                <SGFKPICard title="Postos cadastrados" value={stations.length} icon={Building2} iconColor="text-emerald-500" />
                <SGFKPICard title="Ativos" value={totalActive} icon={Fuel} iconColor="text-blue-500" />
                <SGFKPICard title="Vencendo em 30 dias" value={expiringSoon + expired} icon={Calendar} iconColor={expired > 0 ? 'text-rose-500' : 'text-amber-500'} />
            </div>

            <SGFToolbar
                searchValue={search}
                onSearchChange={(value) => setSearch(value.trim())}
                searchPlaceholder="Pesquisar por nome, código ou CNPJ..."
            />

            <SGFTable
                columns={columns}
                data={stations}
                loading={isLoading}
                keyExtractor={(s) => s.id}
                onRowClick={(s) => navigate(`/postos/${s.id}`)}
                emptyMessage="Nenhum posto cadastrado ainda. Use “Novo posto” para começar."
            />

            <StationFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} />
        </div>
    );
}

function StationDetailPage({ stationId }: { stationId: string }) {
    const navigate = useNavigate();
    const { setTitle, setDescription, setHeaderAction } = useHeader();
    const [editOpen, setEditOpen] = useState(false);

    const { data: detail, isLoading } = useStationDetail(stationId);

    useEffect(() => {
        setHeaderAction(
            <div className="flex items-center gap-2">
                <SGFButton variant="ghost" size="md" icon={ArrowLeft} onClick={() => navigate('/postos')}>
                    <span className="hidden md:inline">Voltar</span>
                </SGFButton>
                {detail && (
                    <SGFButton variant="secondary" size="md" onClick={() => setEditOpen(true)}>
                        <Pencil className="h-4 w-4" /> Editar
                    </SGFButton>
                )}
            </div>
        );
        return () => {
            setHeaderAction(null);
        };
    }, [navigate, setHeaderAction, detail]);

    useEffect(() => {
        if (!detail) return;
        setTitle(detail.station.name);
        setDescription(`${detail.station.code ?? ''} ${detail.station.city ? `· ${detail.station.city}` : ''}`);
    }, [detail, setDescription, setTitle]);

    const fuelData = useMemo(
        () => detail?.byFuelType.map((f) => ({ ...f, color: FUEL_COLORS[f.fuelType] ?? FUEL_COLORS.Outros })) ?? [],
        [detail],
    );

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            </div>
        );
    }
    if (!detail) {
        return (
            <div className="space-y-4">
                <Link to="/postos">
                    <SGFButton variant="ghost" size="sm" icon={ArrowLeft}><span className="hidden md:inline">Voltar</span></SGFButton>
                </Link>
                <SGFCard><p className="text-sm text-rose-600 font-medium">Posto não encontrado.</p></SGFCard>
            </div>
        );
    }

    const s = detail.station;

    return (
        <div className="space-y-6">
            {/* Resumo + Contrato */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <SGFCard className="lg:col-span-2">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-stretch">
                        {/* Coluna da foto */}
                        <div className="w-full shrink-0 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 sm:w-44">
                            {(s as { photo_url?: string | null }).photo_url ? (
                                <img
                                    src={(s as { photo_url?: string | null }).photo_url as string}
                                    alt={s.name}
                                    className="h-40 w-full object-cover sm:h-full"
                                />
                            ) : (
                                <div className="flex h-40 w-full items-center justify-center text-slate-300 sm:h-full">
                                    <Fuel className="h-10 w-10" />
                                </div>
                            )}
                        </div>

                        {/* Conteúdo */}
                        <div className="flex-1 space-y-3">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-600">{s.code ?? 'POSTO'}</p>
                                <h2 className="text-2xl font-bold text-slate-900 mt-1">{s.name}</h2>
                                <p className="text-sm text-slate-500">{s.address ?? '—'} {s.city ? `· ${s.city}` : ''}</p>
                            </div>
                            {s.is_active ? <SGFBadge variant="success">Ativo</SGFBadge> : <SGFBadge variant="default">Inativo</SGFBadge>}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
                            <div>
                                <p className="text-[10px] uppercase text-slate-400 font-bold tracking-widest">CNPJ</p>
                                <p className="text-sm font-bold text-slate-900 font-mono">{s.cnpj ?? '—'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase text-slate-400 font-bold tracking-widest">Telefone</p>
                                <p className="text-sm font-bold text-slate-900">{s.phone ?? '—'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase text-slate-400 font-bold tracking-widest">Combustíveis</p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {(s.fuel_types ?? []).map((f) => (
                                        <span key={f} className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{f}</span>
                                    ))}
                                    {(s.fuel_types ?? []).length === 0 && <span className="text-xs text-slate-400">—</span>}
                                </div>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase text-slate-400 font-bold tracking-widest">Cadastrado em</p>
                                <p className="text-sm font-bold text-slate-900">{formatDate(s.created_at)}</p>
                            </div>
                        </div>
                        </div>
                    </div>
                </SGFCard>

                <SGFCard>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Contrato / Licitação</p>
                    <div className="mt-3 space-y-3">
                        <div className="flex justify-between">
                            <span className="text-sm text-slate-500">Número</span>
                            <span className="text-sm font-bold text-slate-900">{s.contract_number ?? '—'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm text-slate-500">Início</span>
                            <span className="text-sm font-bold text-slate-900">{s.contract_start ? formatDate(s.contract_start) : '—'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-500">Vencimento</span>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-900">{s.contract_end ? formatDate(s.contract_end) : '—'}</span>
                                <ContractBadge end={s.contract_end} />
                            </div>
                        </div>
                        {s.notes && (
                            <div className="pt-3 border-t border-slate-100">
                                <p className="text-[10px] uppercase text-slate-400 font-bold tracking-widest mb-1">Observações</p>
                                <p className="text-sm text-slate-700">{s.notes}</p>
                            </div>
                        )}
                    </div>
                </SGFCard>
            </div>

            {/* KPIs */}
            <div className="grid gap-4 md:grid-cols-4">
                <SGFKPICard title="Litros (total)" value={`${detail.totalsAllTime.liters.toLocaleString('pt-BR')} L`} icon={Droplet} iconColor="text-blue-500" />
                <SGFKPICard title="Gasto (total)" value={formatCurrency(detail.totalsAllTime.totalCost)} icon={Receipt} iconColor="text-emerald-500" />
                <SGFKPICard title="Abastecimentos" value={detail.totalsAllTime.refuelings} icon={Fuel} iconColor="text-amber-500" />
                <SGFKPICard title="Litros (30 dias)" value={`${detail.totals30d.liters.toLocaleString('pt-BR')} L`} icon={Calendar} iconColor="text-rose-500" />
            </div>

            {/* Gráficos */}
            <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
                <SGFCard>
                    <h3 className="text-lg font-semibold text-slate-900">Evolução do consumo</h3>
                    <p className="text-sm text-slate-500">Litros e gasto nos últimos 6 meses</p>
                    <div className="h-[320px] mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={detail.monthly} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="stationCost" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.28} />
                                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
                                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                                <Area type="monotone" dataKey="totalCost" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#stationCost)" isAnimationActive={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </SGFCard>

                <SGFCard>
                    <h3 className="text-lg font-semibold text-slate-900">Por tipo de combustível</h3>
                    <p className="text-sm text-slate-500">Soma histórica</p>
                    <div className="h-[320px] mt-4">
                        {fuelData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-sm text-slate-400">
                                Nenhum abastecimento registrado.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={fuelData} layout="vertical" margin={{ top: 6, right: 12, left: 0, bottom: 6 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                                    <XAxis type="number" hide />
                                    <YAxis type="category" dataKey="fuelType" width={90} axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }} />
                                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                                    <Bar dataKey="totalCost" radius={[0, 10, 10, 0]} barSize={18}>
                                        {fuelData.map((d) => <Cell key={d.fuelType} fill={d.color} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </SGFCard>
            </div>

            {/* Veículos que mais abasteceram */}
            <SGFCard>
                <h3 className="text-lg font-semibold text-slate-900">Veículos que mais abasteceram aqui</h3>
                <p className="text-sm text-slate-500">Top 6 por gasto</p>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {detail.topVehicles.length === 0 ? (
                        <p className="col-span-3 text-sm text-slate-400">Sem dados.</p>
                    ) : detail.topVehicles.map((v) => (
                        <Link
                            key={v.vehicleId}
                            to={`/veiculos/${v.vehicleId}`}
                            className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-emerald-300 hover:shadow-sm transition flex items-center justify-between gap-3"
                        >
                            <div>
                                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{v.plate ?? '—'}</p>
                                <p className="text-sm font-bold text-slate-900">{v.brand} {v.model}</p>
                                <p className="text-xs text-slate-500">{v.liters.toLocaleString('pt-BR')} L · {formatCurrency(v.totalCost)}</p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-emerald-500" />
                        </Link>
                    ))}
                </div>
            </SGFCard>

            <StationFormModal isOpen={editOpen} onClose={() => setEditOpen(false)} station={s} />
        </div>
    );
}

export default function Stations() {
    const { id } = useParams<{ id: string }>();
    if (id) return <StationDetailPage stationId={id} />;
    return <StationsListPage />;
}
