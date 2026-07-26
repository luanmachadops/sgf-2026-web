import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, Building2, Calendar, Download, FileText, Loader2,
    Pencil, Plus, Receipt, Wrench,
} from '@/components/sgf/icons';
import {
    Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useHeader } from '@/contexts/HeaderContext';
import { useRepairShops, useRepairShopDetail } from '@/hooks/useRepairShops';
import { useAppSettings } from '@/hooks/useSettings';
import { SGFBadge, SGFButton, SGFCard, SGFKPICard, SGFTable, SGFToolbar, type SGFTableColumn } from '@/components/sgf';
import { RepairShopFormModal } from '@/components/repairshops/RepairShopFormModal';
import { PartnerAccessCard } from '@/components/partners/PartnerAccessCard';
import { formatCurrency, formatDate } from '@/lib/utils';
import { differenceInDays, parseISO } from 'date-fns';
import type { Tables } from '@/types/database.types';

type ShopDoc = { name: string; url: string; size?: number; uploadedAt?: string };

/** Rótulos do eixo OPERACIONAL da OS (o financeiro tem tela própria). */
const OP_STATUS_LABEL: Record<string, string> = {
    pending: 'Pendente',
    authorized: 'Autorizada',
    at_shop: 'Na oficina',
    awaiting_quote_approval: 'Aguardando aprovação do orçamento',
    in_progress: 'Em execução',
    ready: 'Pronta para retirada',
    received: 'Recebida',
    cancelled: 'Cancelada',
};

function ContractBadge({ end, alertDays = 30 }: { end: string | null; alertDays?: number }) {
    if (!end) return <SGFBadge variant="default">Sem data</SGFBadge>;
    const days = differenceInDays(parseISO(end), new Date());
    if (days < 0) return <SGFBadge variant="error">Vencida</SGFBadge>;
    if (days <= alertDays) return <SGFBadge variant="warning">{days} dias</SGFBadge>;
    if (days <= alertDays * 3) return <SGFBadge variant="info">{days} dias</SGFBadge>;
    return <SGFBadge variant="success">Em dia</SGFBadge>;
}

function RepairShopsListPage() {
    const navigate = useNavigate();
    const { setTitle, setDescription, setHeaderAction } = useHeader();
    const [search, setSearch] = useState('');
    const [formOpen, setFormOpen] = useState(false);

    const { data: shops = [], isLoading } = useRepairShops({ search: search || undefined });
    const { data: appSettings } = useAppSettings();
    const contractDays = appSettings?.contractAlertDays ?? 30;

    useEffect(() => {
        setTitle('Oficinas mecânicas');
        setDescription('Oficinas credenciadas, contratos e acesso ao Sistema de Manutenção.');
        setHeaderAction(
            <SGFButton variant="primary" onClick={() => setFormOpen(true)} className="!rounded-full !h-[37px]">
                <Plus className="h-4 w-4" /> Nova oficina
            </SGFButton>
        );
        return () => setHeaderAction(null);
    }, [setDescription, setHeaderAction, setTitle]);

    const totalActive = shops.filter((s) => s.is_active).length;
    const vencendo = shops.filter((s) => {
        if (!s.contract_end) return false;
        const d = differenceInDays(parseISO(s.contract_end), new Date());
        return d <= contractDays;
    }).length;

    const columns: SGFTableColumn<Tables<'repair_shops'>>[] = [
        {
            header: 'Oficina',
            accessor: (s) => (
                <div className="flex items-center gap-3">
                    {s.photo_url ? (
                        <img src={s.photo_url} alt={s.name} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                    ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                            <Wrench className="h-5 w-5 text-blue-600" />
                        </div>
                    )}
                    <div>
                        <p className="font-semibold text-slate-800">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.code ?? '—'}</p>
                    </div>
                </div>
            ),
        },
        { header: 'Cidade', accessor: (s) => <span className="text-sm text-slate-600">{s.city || '—'}</span> },
        {
            header: 'Especialidades',
            accessor: (s) => (
                <div className="flex flex-wrap gap-1">
                    {(s.specialties ?? []).slice(0, 3).map((f) => <SGFBadge key={f} variant="default">{f}</SGFBadge>)}
                    {(s.specialties ?? []).length > 3 && (
                        <SGFBadge variant="default">+{(s.specialties ?? []).length - 3}</SGFBadge>
                    )}
                </div>
            ),
        },
        { header: 'Contrato', accessor: (s) => s.contract_number ?? '—' },
        {
            header: 'Vencimento',
            accessor: (s) => <span className="text-sm text-slate-700">{s.contract_end ? formatDate(s.contract_end) : '—'}</span>,
        },
        {
            header: 'Situação do contrato',
            accessor: (s) => <ContractBadge end={s.contract_end} alertDays={contractDays} />,
        },
        {
            header: 'Status',
            accessor: (s) => s.is_active
                ? <SGFBadge variant="success">Ativa</SGFBadge>
                : <SGFBadge variant="default">Inativa</SGFBadge>,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
                <SGFKPICard title="Oficinas cadastradas" value={shops.length} icon={Building2} iconColor="text-blue-500" />
                <SGFKPICard title="Ativas" value={totalActive} icon={Wrench} iconColor="text-emerald-500" />
                <SGFKPICard title="Contrato vencendo" value={vencendo} icon={Calendar} iconColor={vencendo > 0 ? 'text-amber-500' : 'text-slate-400'} />
            </div>

            <SGFToolbar
                searchValue={search}
                onSearchChange={(value) => setSearch(value.trim())}
                searchPlaceholder="Pesquisar por nome, código ou CNPJ..."
            />

            <SGFTable
                columns={columns}
                data={shops}
                loading={isLoading}
                keyExtractor={(s) => s.id}
                onRowClick={(s) => navigate(`/oficinas/${s.id}`)}
                emptyMessage="Nenhuma oficina cadastrada. Use “Nova oficina” para começar."
            />

            <RepairShopFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} />
        </div>
    );
}

function RepairShopDetailPage({ shopId }: { shopId: string }) {
    const navigate = useNavigate();
    const { setTitle, setDescription, setHeaderAction } = useHeader();
    const { data: detail, isLoading } = useRepairShopDetail(shopId);
    const [editOpen, setEditOpen] = useState(false);

    const docs = useMemo(
        () => ((detail?.shop.documents ?? []) as unknown as ShopDoc[]) ?? [],
        [detail],
    );

    useEffect(() => {
        setHeaderAction(
            <div className="flex items-center gap-2">
                <SGFButton variant="ghost" onClick={() => navigate('/oficinas')} className="!rounded-full !h-[37px]">
                    <ArrowLeft className="h-4 w-4" /> Voltar
                </SGFButton>
                {detail && (
                    <SGFButton variant="secondary" onClick={() => setEditOpen(true)} className="!rounded-full !h-[37px]">
                        <Pencil className="h-4 w-4" /> Editar
                    </SGFButton>
                )}
            </div>
        );
        return () => setHeaderAction(null);
    }, [navigate, setHeaderAction, detail]);

    useEffect(() => {
        if (!detail) return;
        setTitle(detail.shop.name);
        setDescription(`${detail.shop.code ?? ''} ${detail.shop.city ? `· ${detail.shop.city}` : ''}`.trim());
    }, [detail, setDescription, setTitle]);

    if (isLoading) {
        return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
    }
    if (!detail) {
        return <SGFCard><p className="text-sm text-slate-500">Oficina não encontrada.</p></SGFCard>;
    }

    return (
        <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
                <SGFCard>
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Contrato</p>
                            <p className="text-sm text-slate-500">Vigência e especialidades da oficina.</p>
                        </div>
                        <ContractBadge end={detail.shop.contract_end} />
                    </div>
                    <dl className="mt-4 space-y-2 text-sm">
                        <div className="flex justify-between"><dt className="text-slate-500">Número</dt><dd className="font-semibold text-slate-800">{detail.shop.contract_number ?? '—'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Início</dt><dd className="text-slate-700">{detail.shop.contract_start ? formatDate(detail.shop.contract_start) : '—'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Vencimento</dt><dd className="text-slate-700">{detail.shop.contract_end ? formatDate(detail.shop.contract_end) : '—'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">CNPJ</dt><dd className="text-slate-700">{detail.shop.cnpj ?? '—'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Telefone</dt><dd className="text-slate-700">{detail.shop.phone ?? '—'}</dd></div>
                    </dl>
                    {(detail.shop.specialties ?? []).length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-1.5">
                            {(detail.shop.specialties ?? []).map((s) => <SGFBadge key={s} variant="info">{s}</SGFBadge>)}
                        </div>
                    )}
                </SGFCard>

                {/* Acesso ao Sistema de Manutenção */}
                <PartnerAccessCard
                    partnerType="oficina"
                    partnerId={detail.shop.id}
                    partnerName={detail.shop.name}
                    systemLabel="Sistema de Manutenção"
                />
            </div>

            <SGFCard>
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Documentos</p>
                        <p className="text-sm text-slate-500">Contrato, licitação e certidões.</p>
                    </div>
                    <SGFBadge variant={docs.length > 0 ? 'success' : 'default'}>{docs.length} arquivo(s)</SGFBadge>
                </div>
                {docs.length === 0 ? (
                    <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                        Nenhum documento anexado. Use “Editar” para anexar o contrato.
                    </p>
                ) : (
                    <ul className="mt-4 space-y-2">
                        {docs.map((doc, i) => (
                            <li key={`${doc.url}-${i}`}>
                                <a href={doc.url} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-blue-300 hover:bg-blue-50/40">
                                    <div className="rounded-xl bg-slate-100 p-2 text-slate-500"><FileText className="h-4 w-4" /></div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-slate-800">{doc.name}</p>
                                        {doc.uploadedAt && <p className="text-[11px] text-slate-400">Anexado em {formatDate(doc.uploadedAt)}</p>}
                                    </div>
                                    <Download className="h-4 w-4 shrink-0 text-blue-500" />
                                </a>
                            </li>
                        ))}
                    </ul>
                )}
            </SGFCard>

            <div className="grid gap-4 md:grid-cols-4">
                <SGFKPICard title="OS atendidas" value={detail.totalsAllTime.orders} icon={Wrench} iconColor="text-blue-500" />
                <SGFKPICard title="Custo total" value={formatCurrency(detail.totalsAllTime.totalCost)} icon={Receipt} iconColor="text-emerald-500" />
                <SGFKPICard title="Custo médio por OS" value={formatCurrency(detail.totalsAllTime.avgCost)} icon={Receipt} iconColor="text-amber-500" />
                <SGFKPICard title="OS (30 dias)" value={detail.totals30d.orders} icon={Calendar} iconColor="text-rose-500" />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
                <SGFCard>
                    <h3 className="text-lg font-semibold text-slate-900">Evolução do gasto</h3>
                    <p className="text-sm text-slate-500">Custo das ordens nos últimos 6 meses</p>
                    <div className="mt-4 h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={detail.monthly} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="shopCost" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.28} />
                                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false}
                                    tickFormatter={(v) => `R$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
                                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                                <Area type="monotone" dataKey="totalCost" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#shopCost)" isAnimationActive={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </SGFCard>

                <SGFCard>
                    <h3 className="text-lg font-semibold text-slate-900">Ordens por etapa</h3>
                    <p className="text-sm text-slate-500">Situação operacional</p>
                    <div className="mt-4 space-y-2">
                        {detail.byStatus.length === 0 ? (
                            <p className="py-8 text-center text-sm text-slate-400">Nenhuma OS registrada.</p>
                        ) : detail.byStatus.map((s) => (
                            <div key={s.status} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
                                <span className="text-sm text-slate-600">{OP_STATUS_LABEL[s.status] ?? s.status}</span>
                                <span className="text-sm font-bold tabular-nums text-slate-800">{s.orders}</span>
                            </div>
                        ))}
                    </div>
                </SGFCard>
            </div>

            {detail.topVehicles.length > 0 && (
                <SGFCard>
                    <h3 className="text-lg font-semibold text-slate-900">Veículos que mais gastaram nesta oficina</h3>
                    <div className="mt-4 space-y-2">
                        {detail.topVehicles.map((v) => (
                            <div key={v.vehicleId} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
                                <div>
                                    <p className="text-sm font-semibold text-slate-800">{v.plate ?? '—'}</p>
                                    <p className="text-xs text-slate-500">{[v.brand, v.model].filter(Boolean).join(' ') || '—'}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-bold text-slate-800">{formatCurrency(v.totalCost)}</p>
                                    <p className="text-xs text-slate-500">{v.orders} OS</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </SGFCard>
            )}

            <RepairShopFormModal isOpen={editOpen} onClose={() => setEditOpen(false)} shop={detail.shop} />
        </div>
    );
}

export default function RepairShops() {
    const { id } = useParams<{ id: string }>();
    return id ? <RepairShopDetailPage shopId={id} /> : <RepairShopsListPage />;
}
