import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Bell, Check, ChevronRight } from '@/components/sgf/icons';
import { useNotifications } from '@/hooks/useNotifications';
import type { NotificationRecord } from '@/lib/supabase-api';
import { resolveNotificationRoute, getNotificationIcon, groupNotificationsByDate } from '@/lib/notificationUtils';

function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60_000);
    if (min < 1) return 'agora';
    if (min < 60) return `${min}min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d`;
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function NotificationBell() {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

    // Limita o dropdown suspenso a 15 notificações recentes para otimizar desempenho
    const recentNotifications = useMemo(() => {
        return notifications.slice(0, 15);
    }, [notifications]);

    const groupedNotifications = useMemo(() => {
        return groupNotificationsByDate(recentNotifications);
    }, [recentNotifications]);

    const handleClickNotification = (n: NotificationRecord) => {
        if (!n.read) {
            markRead(n.id);
        }
        const targetRoute = resolveNotificationRoute(n);
        setOpen(false);
        navigate(targetRoute);
    };

    const handleMarkAllRead = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        markAllRead();
    };

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label="Notificações"
                    className="relative flex h-10 w-10 items-center justify-center rounded-full border border-transparent text-slate-500 transition-colors hover:border-black/5 hover:bg-black/5"
                >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-[#E3E9E7]">
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    )}
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" sideOffset={8} className="w-[375px] max-w-[calc(100vw-2rem)] p-0 z-[1050] overflow-hidden rounded-[20px] border border-slate-200/90 bg-white shadow-[0_20px_50px_rgba(15,43,47,0.2)]">
                {/* Top Header */}
                <div className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3.5">
                    <div>
                        <p className="text-sm font-bold text-slate-900">Notificações</p>
                        <p className="text-xs text-slate-400">
                            {unreadCount > 0 ? `${unreadCount} não lida${unreadCount > 1 ? 's' : ''}` : 'Tudo em dia'}
                        </p>
                    </div>
                    {unreadCount > 0 && (
                        <button
                            type="button"
                            onClick={handleMarkAllRead}
                            className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-100"
                        >
                            <Check className="h-3.5 w-3.5" />
                            Marcar todas
                        </button>
                    )}
                </div>

                {/* Lista Agrupada por Data (Recentes) */}
                <div className="max-h-[380px] overflow-y-auto">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                <Bell className="h-6 w-6" />
                            </div>
                            <p className="text-sm font-medium text-slate-500">Nenhuma notificação por aqui</p>
                        </div>
                    ) : (
                        groupedNotifications.map((group) => (
                            <div key={group.label} className="pb-1">
                                {/* Header / Badge da Data (Hoje, Ontem, 20 de mai.) */}
                                <div className="sticky top-0 z-10 flex items-center justify-between border-y border-slate-200/60 bg-slate-50/95 px-4 py-1.5 backdrop-blur-xs">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{group.label}</span>
                                    <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                        {group.items.length}
                                    </span>
                                </div>

                                <div className="p-1 space-y-1">
                                    {group.items.map((n) => {
                                        const { Icon, bg } = getNotificationIcon(n);
                                        return (
                                            <DropdownMenuItem
                                                key={n.id}
                                                onSelect={(e) => {
                                                    e.preventDefault();
                                                    handleClickNotification(n);
                                                }}
                                                className={`flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus:bg-slate-100 ${n.read ? 'bg-white' : 'bg-emerald-50/50 font-medium'}`}
                                            >
                                                {/* Ícone Contextualizado */}
                                                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${bg}`}>
                                                    <Icon className="h-4.5 w-4.5" />
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <p className="truncate text-xs font-bold text-slate-800">{n.title}</p>
                                                        <span className="shrink-0 text-[10px] font-medium text-slate-400">{relativeTime(n.created_at)}</span>
                                                    </div>
                                                    {n.body && <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 leading-snug">{n.body}</p>}
                                                </div>

                                                {!n.read && <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />}
                                            </DropdownMenuItem>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Rodapé com Link para a Central de Notificações */}
                <div className="border-t border-slate-100 bg-slate-50/80 p-2.5 text-center">
                    <button
                        type="button"
                        onClick={() => {
                            setOpen(false);
                            navigate('/notificacoes');
                        }}
                        className="inline-flex items-center justify-center gap-1.5 w-full rounded-xl bg-white border border-slate-200/80 py-2 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors shadow-2xs"
                    >
                        <span>Ver histórico na Central de Notificações</span>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
