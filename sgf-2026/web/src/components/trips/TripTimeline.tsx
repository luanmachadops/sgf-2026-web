import {
    AlertTriangle, Bell, Clipboard, Collision, Flag, Fuel, Loader2, PauseCircle, Play, Power, ShieldAlert, Speedometer,
} from '@/components/sgf/icons';
import { formatMinutes } from '@/lib/formatMinutes';
import type { TripTimeline as TripTimelineData, TripTimelineEvent } from '@/lib/supabase-api';

type IconType = typeof Play;

const SEVERITY_STYLE: Record<TripTimelineEvent['severity'], { dot: string; icon: string; card: string }> = {
    info: { dot: 'bg-slate-100', icon: 'text-slate-500', card: 'border-slate-200 bg-white' },
    warning: { dot: 'bg-amber-100', icon: 'text-amber-600', card: 'border-amber-200 bg-amber-50/60' },
    critical: { dot: 'bg-red-100', icon: 'text-red-600', card: 'border-red-200 bg-red-50/70' },
};

const SOURCE_LABEL: Record<TripTimelineEvent['source'], string> = {
    driver: 'Motorista',
    tracker: 'Rastreador',
    gps: 'GPS',
    system: 'Sistema',
};

function iconFor(event: TripTimelineEvent): IconType {
    switch (event.kind) {
        case 'trip_start': return Play;
        case 'trip_end': return Flag;
        case 'checklist': return Clipboard;
        case 'issue': return AlertTriangle;
        case 'fueling': return Fuel;
        case 'stop': return PauseCircle;
        case 'reminder': return Bell;
        case 'alarm_crash':
        case 'alarm_turnover':
        case 'alarm_vibration':
        case 'alarm_shake': return Collision;
        case 'idle_alert':
        case 'alarm_idle':
        case 'alarm_acc_on':
        case 'alarm_acc_off': return Power;
        case 'alarm_fastacceleration':
        case 'alarm_fastdeceleration':
        case 'alarm_overspeed':
        case 'alarm_speeding': return Speedometer;
        default: return event.source === 'tracker' ? ShieldAlert : AlertTriangle;
    }
}

const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

/** Linha do tempo da viagem: tudo o que o rastreador, o GPS e o motorista registraram. */
export function TripTimeline({ data, loading, error }: { data?: TripTimelineData; loading: boolean; error?: Error | null }) {
    if (loading) {
        return <div className="flex items-center gap-2 py-6 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Montando a linha do tempo…</div>;
    }
    if (error || !data) {
        return <p className="py-4 text-sm text-red-600">Não foi possível carregar os acontecimentos da viagem.</p>;
    }

    const events = data.events;
    const multiDay = events.length > 1 && new Date(events[0].at).toDateString() !== new Date(events[events.length - 1].at).toDateString();
    const alerts = events.filter((e) => e.severity !== 'info').length;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Summary label="Tempo parado" value={formatMinutes(data.stopped_minutes)} />
                <Summary label="Parado c/ motor ligado" value={data.has_tracker_data ? formatMinutes(data.idle_engine_minutes) : 'Sem rastreador'} />
                <Summary label="Paradas" value={String(events.filter((e) => e.kind === 'stop').length)} />
                <Summary label="Alertas" value={String(alerts)} tone={alerts > 0 ? 'warning' : undefined} />
            </div>

            {events.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum acontecimento registrado.</p>
            ) : (
                <ol className="relative space-y-3 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-px before:bg-slate-200">
                    {events.map((event, index) => {
                        const Icon = iconFor(event);
                        const style = SEVERITY_STYLE[event.severity] ?? SEVERITY_STYLE.info;
                        const at = new Date(event.at);
                        return (
                            <li key={`${event.kind}-${event.at}-${index}`} className="relative flex gap-3">
                                <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full ring-4 ring-white ${style.dot}`}>
                                    <Icon className={`h-4 w-4 ${style.icon}`} />
                                </span>
                                <div className={`min-w-0 flex-1 rounded-xl border px-3 py-2 ${style.card}`}>
                                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                                        <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                                        <p className="font-mono text-xs text-slate-500">
                                            {multiDay && `${dayFmt.format(at)} · `}
                                            {timeFmt.format(at)}
                                            {event.ended_at && ` – ${timeFmt.format(new Date(event.ended_at))}`}
                                        </p>
                                    </div>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                                        {event.duration_min != null && (
                                            <span className="font-semibold text-slate-700">
                                                {formatMinutes(event.duration_min)}{event.ongoing ? ' até agora' : ''}
                                            </span>
                                        )}
                                        {event.detail && <span className="break-words">{event.detail}</span>}
                                        <span className="text-slate-400">· {SOURCE_LABEL[event.source] ?? event.source}</span>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
            {!data.has_tracker_data && (
                <p className="text-xs text-slate-400">
                    Paradas calculadas pelos pontos de GPS: a menos de 150 m por 5 minutos ou mais. Colisão, frenagem brusca e motor ligado só aparecem em veículos com rastreador.
                </p>
            )}
        </div>
    );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
    return (
        <div className={`rounded-xl border px-3 py-2 ${tone === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`text-base font-bold ${tone === 'warning' ? 'text-amber-700' : 'text-slate-900'}`}>{value}</p>
        </div>
    );
}

export default TripTimeline;
