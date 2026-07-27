import { Link } from 'react-router-dom';
import { SGFCard } from '@/components/sgf/SGFCard';
import { AlertCircle, ChevronRight } from '@/components/sgf/icons';
import { useDashboardAlerts } from '@/hooks/useDashboard';

/**
 * "Precisa da sua atenção" — a lista do que exige ação do gestor hoje.
 *
 * Regras determinísticas sobre dado que já existe: CNH vencida, contrato
 * vencendo, orçamento parado esperando resposta, veículo pronto para retirada,
 * abastecimento a validar, item crítico reprovado no checklist.
 *
 * Cada item leva para a tela onde a ação acontece. Alerta sem link vira aviso
 * que ninguém resolve.
 */

const STYLE: Record<string, { card: string; badge: string; icon: string }> = {
    critical: { card: 'border-red-200 bg-red-50/60',    badge: 'bg-red-600 text-white',    icon: 'text-red-600' },
    warning:  { card: 'border-amber-200 bg-amber-50/60', badge: 'bg-amber-500 text-white', icon: 'text-amber-600' },
    info:     { card: 'border-blue-200 bg-blue-50/50',   badge: 'bg-blue-600 text-white',  icon: 'text-blue-600' },
};

/** Crítico primeiro: é o que tem consequência legal ou de segurança. */
const ORDEM: Record<string, number> = { critical: 0, warning: 1, info: 2 };

export function AttentionPanel({ onOpenModal }: { onOpenModal?: () => void }) {
    const { data: alerts = [], isLoading, isError } = useDashboardAlerts();

    if (isLoading) {
        return (
            <SGFCard padding="lg" className="animate-pulse">
                <div className="h-4 w-56 rounded bg-slate-100" />
                <div className="mt-4 h-14 rounded-2xl bg-slate-50" />
            </SGFCard>
        );
    }

    // Falha aqui não pode esconder o dashboard inteiro — o resto da tela vive
    // sem os alertas.
    if (isError) return null;

    if (alerts.length === 0) {
        return null;
    }

    const ordenados = [...alerts].sort(
        (a, b) => (ORDEM[a.severity] ?? 3) - (ORDEM[b.severity] ?? 3) || b.count - a.count,
    );
    const criticos = ordenados.filter((a) => a.severity === 'critical').length;

    return (
        <SGFCard padding="lg">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <AlertCircle className={`h-5 w-5 ${criticos > 0 ? 'text-red-600' : 'text-amber-500'}`} />
                    <div>
                        <h3 className="font-bold text-slate-900">Precisa da sua atenção</h3>
                        <p className="text-xs text-slate-500">
                            {ordenados.length} {ordenados.length === 1 ? 'item' : 'itens'}
                            {criticos > 0 ? ` · ${criticos} crítico${criticos > 1 ? 's' : ''}` : ''}
                        </p>
                    </div>
                </div>
                {onOpenModal && (
                    <button
                        type="button"
                        onClick={onOpenModal}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors shadow-2xs"
                    >
                        <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                        <span>Abrir modal de avisos</span>
                    </button>
                )}
            </div>

            <ul className="space-y-2">
                {ordenados.map((a) => {
                    const st = STYLE[a.severity] ?? STYLE.info;
                    return (
                        <li key={a.kind}>
                            <Link
                                to={a.link}
                                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition hover:shadow-sm ${st.card}`}
                            >
                                <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-black ${st.badge}`}>
                                    {a.count}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-bold text-slate-900">{a.title}</span>
                                    <span className="block truncate text-xs text-slate-500">{a.detail}</span>
                                </span>
                                <ChevronRight className={`h-4 w-4 shrink-0 ${st.icon}`} />
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </SGFCard>
    );
}
