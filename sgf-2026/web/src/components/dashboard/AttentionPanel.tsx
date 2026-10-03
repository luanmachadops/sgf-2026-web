import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ChevronDown, ChevronRight } from '@/components/sgf/icons';
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

const PILL: Record<string, string> = {
    critical: 'bg-red-600 text-white',
    warning: 'bg-amber-500 text-white',
    info: 'bg-blue-600 text-white',
};

const OPEN_KEY = 'sgf:attention-open';

function readOpen(): boolean {
    try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; }
}

/**
 * Barra de alerta recolhível: fechada, ocupa uma linha com o total e os
 * números por gravidade; aberta, mostra a lista com os atalhos. O estado
 * aberto/fechado fica salvo no navegador.
 */
export function AttentionPanel({ onOpenModal }: { onOpenModal?: () => void }) {
    const { data: alerts = [], isLoading, isError } = useDashboardAlerts();
    const [open, setOpen] = useState(readOpen);

    const toggle = () => {
        setOpen((v) => {
            try { localStorage.setItem(OPEN_KEY, v ? '0' : '1'); } catch { /* sem storage: só não lembra */ }
            return !v;
        });
    };

    if (isLoading) {
        return <div className="h-14 animate-pulse rounded-2xl border border-slate-200 bg-white" />;
    }

    // Falha aqui não pode esconder o dashboard inteiro — o resto da tela vive
    // sem os alertas.
    if (isError || alerts.length === 0) return null;

    const ordenados = [...alerts].sort(
        (a, b) => (ORDEM[a.severity] ?? 3) - (ORDEM[b.severity] ?? 3) || b.count - a.count,
    );
    const total = ordenados.length;
    const criticos = ordenados.filter((a) => a.severity === 'critical').length;
    const porGravidade = (['critical', 'warning', 'info'] as const)
        .map((sev) => ({ sev, n: ordenados.filter((a) => a.severity === sev).length }))
        .filter((g) => g.n > 0);
    const tom = criticos > 0
        ? 'border-red-200 bg-red-50/70 hover:bg-red-50'
        : 'border-amber-200 bg-amber-50/70 hover:bg-amber-50';

    return (
        <div className={`overflow-hidden rounded-2xl border transition-colors ${tom}`}>
            <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                aria-controls="attention-list"
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${criticos > 0 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                    <AlertCircle className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                    {total} {total === 1 ? 'item precisa' : 'itens precisam'} da sua atenção
                </span>
                <span className="hidden items-center gap-1.5 sm:flex">
                    {porGravidade.map((g) => (
                        <span key={g.sev} className={`flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-bold ${PILL[g.sev]}`}>
                            {g.n}
                        </span>
                    ))}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {/* grid-rows 0fr→1fr: sanfona animada sem medir altura. */}
            <div
                id="attention-list"
                className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
            >
                <div className="min-h-0 overflow-hidden">
                    <ul className="space-y-1.5 border-t border-black/5 bg-white/70 px-3 py-3">
                        {ordenados.map((a) => {
                            const st = STYLE[a.severity] ?? STYLE.info;
                            return (
                                <li key={a.kind}>
                                    <Link
                                        to={a.link}
                                        tabIndex={open ? 0 : -1}
                                        className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-slate-50"
                                    >
                                        <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-bold ${st.badge}`}>
                                            {a.count}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-semibold text-slate-900">{a.title}</span>
                                            <span className="block truncate text-xs text-slate-500">{a.detail}</span>
                                        </span>
                                        <ChevronRight className={`h-4 w-4 shrink-0 ${st.icon}`} />
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                    {onOpenModal && (
                        <div className="flex justify-end border-t border-black/5 bg-white/70 px-4 py-2">
                            <button
                                type="button"
                                onClick={onOpenModal}
                                tabIndex={open ? 0 : -1}
                                className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                            >
                                Ver todos os avisos
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
