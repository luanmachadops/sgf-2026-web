import { useNavigate } from 'react-router-dom';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
} from '@/components/ui/dropdown-menu';
import { Bell, CheckCircle, AlertTriangle, Info, Check } from '@/components/sgf/icons';
import { useNotifications } from '@/hooks/useNotifications';
import type { NotificationRecord } from '@/lib/supabase-api';

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

const typeStyles: Record<string, { Icon: typeof Bell; bg: string; fg: string }> = {
    alert:   { Icon: AlertTriangle, bg: 'bg-rose-50',    fg: 'text-rose-600' },
    warning: { Icon: AlertTriangle, bg: 'bg-amber-50',   fg: 'text-amber-600' },
    success: { Icon: CheckCircle,   bg: 'bg-emerald-50', fg: 'text-emerald-600' },
    info:    { Icon: Info,          bg: 'bg-blue-50',    fg: 'text-blue-600' },
};

export default function NotificationBell() {
    const navigate = useNavigate();
    const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

    const handleClick = (n: NotificationRecord) => {
        if (!n.read) markRead(n.id);
        
        let targetLink = n.link;
        if (!targetLink && n.entity_id) {
            targetLink = `/map?vehicleId=${n.entity_id}`;
        } else if (targetLink?.includes('/vehicle-details?id=')) {
            const vehicleId = targetLink.split('id=')[1];
            targetLink = `/map?vehicleId=${vehicleId}`;
        }

        if (targetLink) {
            navigate(targetLink);
        }
    };

    return (
        <DropdownMenu>
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

            <DropdownMenuContent align="end" sideOffset={8} className="w-[360px] max-w-[calc(100vw-2rem)] p-0">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div>
                        <p className="text-sm font-semibold text-slate-800">Notificações</p>
                        <p className="text-xs text-slate-400">
                            {unreadCount > 0 ? `${unreadCount} não lida${unreadCount > 1 ? 's' : ''}` : 'Tudo em dia'}
                        </p>
                    </div>
                    {unreadCount > 0 && (
                        <button
                            type="button"
                            onClick={() => markAllRead()}
                            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-50"
                        >
                            <Check className="h-3.5 w-3.5" />
                            Marcar todas
                        </button>
                    )}
                </div>

                <div className="max-h-[420px] overflow-y-auto">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-300">
                                <Bell className="h-6 w-6" />
                            </div>
                            <p className="text-sm font-medium text-slate-400">Nenhuma notificação ainda</p>
                        </div>
                    ) : (
                        notifications.map((n) => {
                            const style = typeStyles[n.type] ?? typeStyles.info;
                            const { Icon } = style;
                            return (
                                <button
                                    key={n.id}
                                    type="button"
                                    onClick={() => handleClick(n)}
                                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${n.read ? '' : 'bg-emerald-50/40'}`}
                                >
                                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${style.bg} ${style.fg}`}>
                                        <Icon className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="truncate text-sm font-semibold text-slate-800">{n.title}</p>
                                            <span className="shrink-0 text-[11px] font-medium text-slate-400">{relativeTime(n.created_at)}</span>
                                        </div>
                                        {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.body}</p>}
                                    </div>
                                    {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
                                </button>
                            );
                        })
                    )}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
