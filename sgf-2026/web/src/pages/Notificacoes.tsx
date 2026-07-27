import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFButton } from '@/components/sgf/SGFButton';
import { Bell, Search, Check, Loader2, ArrowRight, Filter } from '@/components/sgf/icons';
import { useHeader } from '@/contexts/HeaderContext';
import { useAuth } from '@/contexts/AuthContext';
import { notificationsApi, type NotificationRecord } from '@/lib/supabase-api';
import { getNotificationIcon, groupNotificationsByDate, resolveNotificationRoute } from '@/lib/notificationUtils';

/** Itens por lote. 50 cobre bem o histórico recente sem puxar linha demais. */
const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;

type FilterTab = 'all' | 'unread' | 'vehicle' | 'driver' | 'fuel' | 'maintenance';

export default function Notificacoes() {
    const { setTitle, setDescription } = useHeader();
    const { user } = useAuth();
    const navigate = useNavigate();
    const userId = user?.id;

    const [items, setItems] = useState<NotificationRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
    const [hasMore, setHasMore] = useState(false);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState<FilterTab>('all');

    useEffect(() => {
        setTitle('Central de Notificações');
        setDescription('Histórico completo e auditoria de alertas e avisos do sistema.');
    }, [setTitle, setDescription]);

    // Carrega primeira página (recarrega ao trocar o tamanho do lote)
    useEffect(() => {
        if (!userId) return;
        setLoading(true);
        notificationsApi
            .listPaged(userId, { limit: pageSize })
            .then((res) => {
                setItems(res.data);
                setHasMore(res.hasMore);
            })
            .catch(() => toast.error('Erro ao carregar notificações.'))
            .finally(() => setLoading(false));
    }, [userId, pageSize]);

    // Carregar mais notificações (paginação de 30 em 30)
    const handleLoadMore = async () => {
        if (!userId || loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            // Cursor: a data do item mais antigo já carregado.
            const before = items[items.length - 1]?.created_at ?? null;
            const res = await notificationsApi.listPaged(userId, { limit: pageSize, before });
            setItems((prev) => {
                const known = new Set(prev.map((n) => n.id));
                return [...prev, ...res.data.filter((n) => !known.has(n.id))];
            });
            setHasMore(res.hasMore);
        } catch {
            toast.error('Erro ao carregar mais notificações.');
        } finally {
            setLoadingMore(false);
        }
    };

    // Marcar todas como lidas
    const handleMarkAllRead = async () => {
        if (!userId) return;
        try {
            await notificationsApi.markAllRead(userId);
            setItems((prev) => prev.map((n) => ({ ...n, read: true })));
            toast.success('Todas as notificações foram marcadas como lidas.');
        } catch {
            toast.error('Falha ao marcar notificações como lidas.');
        }
    };

    // Marcar item como lido e navegar
    const handleClickItem = async (n: NotificationRecord) => {
        if (!n.read) {
            notificationsApi.markRead(n.id).catch(() => {});
            setItems((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
        }
        const route = resolveNotificationRoute(n);
        navigate(route);
    };

    // Filtragem por busca e por abas
    const filteredItems = useMemo(() => {
        return items.filter((n) => {
            // Filtro de aba
            if (activeTab === 'unread' && n.read) return false;

            const text = `${n.title ?? ''} ${n.body ?? ''} ${n.entity_type ?? ''}`.toLowerCase();
            if (activeTab === 'vehicle' && !text.includes('veiculo') && !text.includes('veículo') && !text.includes('placa') && !text.includes('movimento') && !text.includes('geofence')) {
                return false;
            }
            if (activeTab === 'driver' && !text.includes('motorista') && !text.includes('cnh')) {
                return false;
            }
            if (activeTab === 'fuel' && !text.includes('abastecimento') && !text.includes('combustível') && !text.includes('posto')) {
                return false;
            }
            if (activeTab === 'maintenance' && !text.includes('manutenção') && !text.includes('oficina') && !text.includes('serviço')) {
                return false;
            }

            // Filtro de texto
            if (search.trim()) {
                const q = search.toLowerCase().trim();
                return text.includes(q);
            }

            return true;
        });
    }, [items, activeTab, search]);

    // Agrupamento por data
    const groupedNotifications = useMemo(() => {
        return groupNotificationsByDate(filteredItems);
    }, [filteredItems]);

    const unreadCount = items.filter((n) => !n.read).length;

    return (
        <div className="space-y-6 pb-16">
            {/* Top Bar de Filtros e Busca */}
            <SGFCard padding="lg" className="border border-slate-200/80 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    {/* Abas de filtro */}
                    <div className="flex flex-wrap gap-1.5">
                        {([
                            ['all', 'Todas'],
                            ['unread', `Não lidas (${unreadCount})`],
                            ['vehicle', 'Veículos'],
                            ['driver', 'Motoristas'],
                            ['fuel', 'Abastecimentos'],
                            ['maintenance', 'Manutenções'],
                        ] as const).map(([tab, label]) => (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => setActiveTab(tab)}
                                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                                    activeTab === tab
                                        ? 'bg-[#00A86B] text-white shadow-sm'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Itens por lote — controla o peso da consulta */}
                    <div className="flex items-center gap-1.5">
                        <span className="mr-1 text-xs font-semibold text-slate-400">Mostrar</span>
                        {PAGE_SIZES.map((n) => (
                            <button
                                key={n}
                                onClick={() => setPageSize(n)}
                                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                                    pageSize === n
                                        ? 'bg-[#00A86B] text-white shadow-sm'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                                }`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>

                    {/* Botão Marcar Todas */}
                    {unreadCount > 0 && (
                        <SGFButton variant="secondary" size="sm" onClick={handleMarkAllRead} icon={Check}>
                            Marcar todas como lidas
                        </SGFButton>
                    )}
                </div>

                {/* Campo de Busca */}
                <div className="mt-4">
                    <SGFInput
                        placeholder="Buscar notificação por título, texto, placa ou assunto..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        icon={Search}
                        fullWidth
                    />
                </div>
            </SGFCard>

            {/* Listagem em Cards Agrupados por Data */}
            {loading ? (
                <SGFCard padding="lg" className="border border-slate-200/80 text-center py-12">
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                        <Loader2 className="h-5 w-5 animate-spin text-[#00A86B]" />
                        Carregando central de notificações...
                    </div>
                </SGFCard>
            ) : filteredItems.length === 0 ? (
                <SGFCard padding="lg" className="border border-slate-200/80 text-center py-16">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                        <Bell className="h-7 w-7" />
                    </div>
                    <h3 className="text-base font-bold text-slate-800">Nenhuma notificação encontrada</h3>
                    <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                        Não encontramos notificações com os filtros selecionados. Tente alterar a busca ou a aba.
                    </p>
                </SGFCard>
            ) : (
                <div className="space-y-6">
                    {groupedNotifications.map((group) => (
                        <div key={group.label} className="space-y-2">
                            {/* Header de Data */}
                            <div className="flex items-center gap-2 px-1">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{group.label}</span>
                                <span className="h-px flex-1 bg-slate-200" />
                                <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                    {group.items.length}
                                </span>
                            </div>

                            {/* Cards das Notificações do Grupo */}
                            <div className="space-y-2">
                                {group.items.map((n) => {
                                    const { Icon, bg } = getNotificationIcon(n);
                                    const formattedTime = new Date(n.created_at).toLocaleTimeString('pt-BR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    });

                                    return (
                                        <button
                                            key={n.id}
                                            type="button"
                                            onClick={() => void handleClickItem(n)}
                                            className={`group relative flex w-full cursor-pointer items-start gap-4 rounded-2xl border p-4 text-left transition-all hover:shadow-md ${
                                                n.read
                                                    ? 'border-slate-200/80 bg-white hover:border-slate-300'
                                                    : 'border-emerald-200 bg-emerald-50/40 hover:border-emerald-300'
                                            }`}
                                        >
                                            {/* Ícone Contextualizado */}
                                            <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${bg}`}>
                                                <Icon className="h-5 w-5" />
                                            </div>

                                            {/* Informações da Notificação */}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#00A86B] transition-colors">
                                                            {n.title}
                                                        </h4>
                                                        {!n.read && (
                                                            <span className="inline-flex items-center rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                                                                Nova
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-xs font-medium text-slate-400">
                                                        {formattedTime}
                                                    </span>
                                                </div>

                                                {n.body && (
                                                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                                                        {n.body}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Setinha Indicadora de Ação */}
                                            <div className="self-center text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-[#00A86B]">
                                                <ArrowRight className="h-4 w-4" />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Botão de Paginação / Carregar Mais no Rodapé */}
            {hasMore && !loading && (
                <div className="pt-4 text-center">
                    <SGFButton
                        variant="secondary"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        icon={loadingMore ? Loader2 : undefined}
                        className="!px-8 shadow-sm"
                    >
                        {loadingMore ? 'Carregando mais...' : 'Carregar mais notificações antigos'}
                    </SGFButton>
                </div>
            )}
        </div>
    );
}
