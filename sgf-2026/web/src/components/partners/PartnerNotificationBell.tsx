import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCircle, Clock } from '@/components/sgf/icons';
import { notificationsApi, type NotificationRecord } from '@/lib/supabase-api';
import {
    resolvePartnerNotificationRoute,
    type PartnerNotificationPath,
} from '@/lib/notificationRoutes';

interface PartnerNotificationBellProps {
    userId: string;
    fallbackPath: PartnerNotificationPath;
    variant?: 'dark' | 'light';
}

function formatTime(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function PartnerNotificationBell({ userId, fallbackPath, variant = 'dark' }: PartnerNotificationBellProps) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const rootRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);

    const query = useQuery({
        queryKey: ['partner-notifications', userId],
        queryFn: async () => {
            const [items, unread] = await Promise.all([
                notificationsApi.list(userId, 8),
                notificationsApi.unreadCount(userId),
            ]);
            return { items, unread };
        },
        refetchInterval: 30_000,
    });

    useEffect(() => {
        if (!open) return;
        const close = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    const refresh = () => queryClient.invalidateQueries({ queryKey: ['partner-notifications', userId] });

    const openNotification = async (notification: NotificationRecord) => {
        try {
            if (!notification.read) {
                await notificationsApi.markRead(notification.id);
                await refresh();
            }
        } finally {
            setOpen(false);
            navigate(resolvePartnerNotificationRoute(notification, fallbackPath));
        }
    };

    const markAllRead = async () => {
        await notificationsApi.markAllRead(userId);
        await refresh();
    };

    const unread = query.data?.unread ?? 0;
    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                aria-label={unread > 0 ? `${unread} notificações não lidas` : 'Notificações'}
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
                className={`relative grid h-10 w-10 place-items-center rounded-full transition ${
                    variant === 'light'
                        ? 'text-slate-500 hover:bg-black/5 hover:text-slate-800'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
            >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                    <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-black text-white">
                        {unread > 99 ? '99+' : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                        <div>
                            <p className="font-black">Notificações</p>
                            <p className="text-xs text-slate-400">{unread} não lida{unread === 1 ? '' : 's'}</p>
                        </div>
                        {unread > 0 && (
                            <button type="button" onClick={() => void markAllRead()}
                                className="flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline">
                                <Check className="h-4 w-4" /> Marcar todas
                            </button>
                        )}
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {query.isLoading ? (
                            <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-400">
                                <Clock className="h-4 w-4 animate-pulse" /> Carregando
                            </div>
                        ) : (query.data?.items ?? []).length === 0 ? (
                            <div className="p-8 text-center">
                                <CheckCircle className="mx-auto h-8 w-8 text-emerald-500" />
                                <p className="mt-2 text-sm font-semibold text-slate-600">Tudo certo por aqui.</p>
                            </div>
                        ) : (
                            query.data?.items.map((notification) => (
                                <button key={notification.id} type="button"
                                    onClick={() => void openNotification(notification)}
                                    className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition last:border-0 hover:bg-slate-50 ${
                                        notification.read ? 'bg-white' : 'bg-blue-50/60'
                                    }`}>
                                    <div className="flex items-start gap-2">
                                        {!notification.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-slate-900">{notification.title}</p>
                                            {notification.body && <p className="mt-0.5 text-xs leading-5 text-slate-500">{notification.body}</p>}
                                            <p className="mt-1 text-[10px] font-semibold text-slate-400">{formatTime(notification.created_at)}</p>
                                        </div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
