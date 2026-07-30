import type { ProcurementContractUsage } from '@/lib/procurement-api';

const currency = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
});
const percent = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
});

function point(angle: number, radius: number): { x: number; y: number } {
    const radians = angle * Math.PI / 180;
    return {
        x: 100 + radius * Math.cos(radians),
        y: 100 + radius * Math.sin(radians),
    };
}

function arc(start: number, end: number, radius = 76): string {
    const from = point(start, radius);
    const to = point(end, radius);
    return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
}

function usageTone(value: number | null): string {
    if (value == null) return '#94A3B8';
    if (value < 60) return '#22C55E';
    if (value < 80) return '#FACC15';
    if (value < 95) return '#F59E0B';
    return '#DC2626';
}

export function ContractUsageGauge({
    value,
    label = 'consumido',
    className = '',
}: {
    value: number | null;
    label?: string;
    className?: string;
}) {
    const bounded = Math.min(Math.max(value ?? 0, 0), 100);
    const needle = point(180 + bounded * 1.8, 60);
    const tone = usageTone(value);
    const accessibleValue = value == null ? 'teto não configurado' : `${percent.format(value)}% consumido`;

    return (
        <div
            className={`relative mx-auto aspect-[2/1.08] w-full max-w-[340px] ${className}`}
            role="img"
            aria-label={`Medidor da licitação: ${accessibleValue}`}
        >
            <svg viewBox="0 0 200 112" className="h-full w-full overflow-visible" aria-hidden="true">
                <path d={arc(180, 286)} fill="none" stroke="#22C55E" strokeWidth="18" strokeLinecap="round" />
                <path d={arc(290, 322)} fill="none" stroke="#FACC15" strokeWidth="18" strokeLinecap="round" />
                <path d={arc(326, 349)} fill="none" stroke="#F59E0B" strokeWidth="18" strokeLinecap="round" />
                <path d={arc(353, 360)} fill="none" stroke="#DC2626" strokeWidth="18" strokeLinecap="round" />
                <line
                    x1="100"
                    y1="100"
                    x2={needle.x}
                    y2={needle.y}
                    stroke="#0F2B2F"
                    strokeWidth="4"
                    strokeLinecap="round"
                />
                <circle cx="100" cy="100" r="8" fill="#0F2B2F" />
                <circle cx="100" cy="100" r="3" fill="#FFFFFF" />
            </svg>
            <div className="absolute inset-x-0 bottom-0 text-center">
                <p className="text-2xl font-black tabular-nums" style={{ color: tone }}>
                    {value == null ? '—' : `${percent.format(value)}%`}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    {value == null ? 'sem teto cadastrado' : label}
                </p>
            </div>
        </div>
    );
}

function Metric({
    label,
    value,
    hint,
    tone = 'text-slate-950',
}: {
    label: string;
    value: string;
    hint?: string;
    tone?: string;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
            <p className={`mt-1 text-lg font-black tabular-nums ${tone}`}>{value}</p>
            {hint ? <p className="mt-1 text-xs leading-4 text-slate-500">{hint}</p> : null}
        </div>
    );
}

export function ContractUsagePanel({ usage }: { usage: ProcurementContractUsage }) {
    const fiscalUnavailable = usage.partnerKind === 'posto';
    const remainingTone = usage.remainingValue != null && usage.remainingValue <= 0
        ? 'text-red-600'
        : 'text-emerald-700';

    return (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="grid lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.8fr)]">
                <div className="flex flex-col justify-center bg-slate-50 px-6 py-7">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--sgf-primary)]">
                            Licitação {usage.contractNumber || 'sem número'}
                        </p>
                        <h2 className="mt-1 text-lg font-black text-[var(--sgf-dark)]">Consumo do valor contratado</h2>
                    </div>
                    <ContractUsageGauge value={usage.consumedPercent} />
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span>0%</span>
                        <span>atenção em 80%</span>
                        <span>100%</span>
                    </div>
                </div>

                <div className="p-5 sm:p-6">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <Metric
                            label="Valor contratado"
                            value={usage.contractValue == null ? 'Não informado' : currency.format(usage.contractValue)}
                        />
                        <Metric
                            label="Reservado"
                            value={currency.format(usage.reservedValue)}
                            hint={usage.partnerKind === 'posto' ? 'Autorizações ainda abertas.' : 'Ordens aprovadas ainda não recebidas.'}
                            tone="text-amber-700"
                        />
                        <Metric
                            label="Realizado"
                            value={currency.format(usage.realizedValue)}
                            hint={usage.partnerKind === 'posto' ? 'Abastecimentos efetuados.' : 'Serviços recebidos pela prefeitura.'}
                            tone="text-blue-700"
                        />
                        <Metric
                            label="Faturado"
                            value={fiscalUnavailable ? 'Ainda não controlado' : currency.format(usage.invoicedValue ?? 0)}
                            hint={fiscalUnavailable ? 'Será habilitado no fechamento fiscal mensal.' : 'Notas fiscais registradas.'}
                        />
                        <Metric
                            label="Pago"
                            value={fiscalUnavailable ? 'Ainda não controlado' : currency.format(usage.paidValue ?? 0)}
                            hint={fiscalUnavailable ? 'Será habilitado no fluxo de pagamento.' : 'Pagamentos confirmados.'}
                            tone="text-emerald-700"
                        />
                        <Metric
                            label="Saldo disponível"
                            value={usage.remainingValue == null ? 'Não calculado' : currency.format(usage.remainingValue)}
                            hint="Calculado por contratado − reservado − realizado − contestado."
                            tone={remainingTone}
                        />
                        <Metric
                            label="Realizado neste mês"
                            value={currency.format(usage.monthRealizedValue)}
                            hint={usage.monthContractPercent == null
                                ? 'Percentual indisponível sem valor contratado.'
                                : `${percent.format(usage.monthContractPercent)}% do valor total da licitação neste mês.`}
                        />
                        {usage.disputedValue > 0 ? (
                            <Metric
                                label="Em contestação"
                                value={currency.format(usage.disputedValue)}
                                hint="Mantido no consumo preventivamente até a solução da divergência."
                                tone="text-red-600"
                            />
                        ) : null}
                    </div>
                    <p className="mt-4 text-xs leading-5 text-slate-500">
                        Faturado e pago são etapas da mesma despesa e, por isso, não são somados novamente ao consumo do teto.
                    </p>
                </div>
            </div>
        </section>
    );
}
