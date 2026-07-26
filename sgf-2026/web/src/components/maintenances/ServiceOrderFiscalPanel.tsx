import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { Check, DollarSign, FileText, Loader2, Receipt, X } from '@/components/sgf/icons';
import { serviceOrderFiscalApi, type FinStatus, type OpStatus } from '@/lib/supabase-api';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Props {
    orderId: string;
    operationalStatus: OpStatus | null;
    financialStatus: FinStatus | null;
    commitmentNumber: string | null;
}

/**
 * As 12 etapas do fluxo de manutenção como o município executa (do relato de
 * avaria ao pagamento), projetadas a partir dos DOIS eixos.
 *
 * A etapa não é uma coluna: é derivada. Foi por isso que operacional e
 * financeiro ficaram separados — o veículo é liberado quando volta da oficina
 * (`received`), não quando a contabilidade paga, que pode ser semanas depois.
 */
const OP_ORDER: OpStatus[] = [
    'pending', 'authorized', 'at_shop', 'awaiting_quote_approval', 'in_progress', 'ready', 'received',
];
const FIN_ORDER: FinStatus[] = [
    'not_started', 'awaiting_commitment', 'committed', 'invoiced', 'attested', 'paid',
];

const ETAPAS: { n: number; label: string; quem: string; done: (op: OpStatus, fin: FinStatus) => boolean }[] = [
    { n: 1,  label: 'Motorista identifica a avaria',       quem: 'Motorista',     done: () => true },
    { n: 2,  label: 'Gestor abre a OS e autoriza',         quem: 'Gestor',        done: (op) => OP_ORDER.indexOf(op) >= 1 },
    { n: 3,  label: 'Veículo entregue na oficina',         quem: 'Motorista',     done: (op) => OP_ORDER.indexOf(op) >= 2 },
    { n: 4,  label: 'Oficina envia o orçamento',           quem: 'Oficina',       done: (op) => OP_ORDER.indexOf(op) >= 3 },
    { n: 5,  label: 'Gestor aprova e pede reserva',        quem: 'Gestor',        done: (_, fin) => FIN_ORDER.indexOf(fin) >= 1 },
    { n: 6,  label: 'Contabilidade emite NAD/empenho',     quem: 'Contabilidade', done: (_, fin) => FIN_ORDER.indexOf(fin) >= 2 },
    { n: 7,  label: 'Gestor autoriza a execução',          quem: 'Gestor',        done: (op) => OP_ORDER.indexOf(op) >= 4 },
    { n: 8,  label: 'Oficina executa o serviço',           quem: 'Oficina',       done: (op) => OP_ORDER.indexOf(op) >= 5 },
    { n: 9,  label: 'Conferência e retirada do veículo',   quem: 'Gestor',        done: (op) => OP_ORDER.indexOf(op) >= 6 },
    { n: 10, label: 'Oficina emite a nota fiscal',         quem: 'Oficina',       done: (_, fin) => FIN_ORDER.indexOf(fin) >= 3 },
    { n: 11, label: 'Gestor atesta (liquidação)',          quem: 'Gestor',        done: (_, fin) => FIN_ORDER.indexOf(fin) >= 4 },
    { n: 12, label: 'Pagamento e arquivamento',            quem: 'Contabilidade', done: (_, fin) => FIN_ORDER.indexOf(fin) >= 5 },
];

const OP_LABEL: Record<string, string> = {
    pending: 'Pendente', authorized: 'Autorizada', at_shop: 'Na oficina',
    awaiting_quote_approval: 'Aguardando aprovação do orçamento', in_progress: 'Em execução',
    ready: 'Pronta para retirada', received: 'Veículo recebido', cancelled: 'Cancelada',
};
const FIN_LABEL: Record<string, string> = {
    not_started: 'Não iniciado', awaiting_commitment: 'Aguardando empenho', committed: 'Empenhado',
    invoiced: 'Faturado', attested: 'Atestado', paid: 'Pago',
};

export function ServiceOrderFiscalPanel({ orderId, operationalStatus, financialStatus, commitmentNumber }: Props) {
    const { user } = useAuth();
    const qc = useQueryClient();
    const actorId = user?.id ?? '';
    const op = (operationalStatus ?? 'pending') as OpStatus;
    const fin = (financialStatus ?? 'not_started') as FinStatus;

    const [commitment, setCommitment] = useState(commitmentNumber ?? '');
    const [nad, setNad] = useState('');
    const [payAmount, setPayAmount] = useState('');

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['maintenance', orderId] });
        qc.invalidateQueries({ queryKey: ['osFiscal', orderId] });
        qc.invalidateQueries({ queryKey: ['maintenances'] });
    };

    const { data, isLoading } = useQuery({
        queryKey: ['osFiscal', orderId],
        queryFn: async () => {
            const [quotes, invoices, payments, events] = await Promise.all([
                serviceOrderFiscalApi.quotes(orderId),
                serviceOrderFiscalApi.invoices(orderId),
                serviceOrderFiscalApi.payments(orderId),
                serviceOrderFiscalApi.events(orderId),
            ]);
            return { quotes, invoices, payments, events };
        },
        enabled: Boolean(orderId),
    });

    const run = (fn: () => Promise<unknown>, ok: string) => async () => {
        try { await fn(); invalidate(); toast.success(ok); }
        catch (e) { toast.error((e as { message?: string })?.message ?? 'Não foi possível concluir a ação.'); }
    };

    const mutApproveQuote = useMutation({ mutationFn: (id: string) => serviceOrderFiscalApi.approveQuote(id, orderId, actorId) });
    const mutCommit = useMutation({ mutationFn: () => serviceOrderFiscalApi.registerCommitment(orderId, { commitmentNumber: commitment.trim(), nadNumber: nad.trim() || null, actorId }) });
    const mutOp = useMutation({ mutationFn: (to: OpStatus) => serviceOrderFiscalApi.setOperationalStatus(orderId, to, actorId) });
    const mutAttest = useMutation({ mutationFn: (id: string) => serviceOrderFiscalApi.attestInvoice(id, orderId, actorId) });
    const mutPay = useMutation({ mutationFn: () => serviceOrderFiscalApi.registerPayment(orderId, { amount: Number(payAmount), actorId }) });

    const busy = mutApproveQuote.isPending || mutCommit.isPending || mutOp.isPending || mutAttest.isPending || mutPay.isPending;

    const quoteAberto = data?.quotes.find((q) => q.status === 'enviado');
    const totalNf = (data?.invoices ?? []).reduce((s, i) => s + Number(i.amount ?? 0), 0);
    const totalPago = (data?.payments ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const naoAtestadas = (data?.invoices ?? []).filter((i) => !i.attested_at);

    if (isLoading) {
        return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
    }

    return (
        <div className="space-y-5">
            {/* Os dois eixos, lado a lado */}
            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Situação do veículo</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">{OP_LABEL[op] ?? op}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Situação do processo</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">{FIN_LABEL[fin] ?? fin}</p>
                </div>
            </div>

            {/* Linha do tempo das 12 etapas */}
            <div className="rounded-2xl border border-slate-200 p-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Andamento do processo</p>
                <ol className="space-y-1.5">
                    {ETAPAS.map((e) => {
                        const done = e.done(op, fin);
                        return (
                            <li key={e.n} className="flex items-center gap-2.5">
                                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                    done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                                }`}>
                                    {done ? <Check className="h-3 w-3" /> : e.n}
                                </span>
                                <span className={`flex-1 text-xs ${done ? 'text-slate-700' : 'text-slate-400'}`}>{e.label}</span>
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">{e.quem}</span>
                            </li>
                        );
                    })}
                </ol>
            </div>

            {/* Ações do gestor, só a pertinente à etapa atual */}
            <div className="space-y-3">
                {op === 'authorized' && (
                    <SGFButton size="sm" disabled={busy} onClick={run(() => mutOp.mutateAsync('at_shop'), 'Veículo registrado na oficina.')}>
                        Confirmar entrega na oficina
                    </SGFButton>
                )}

                {quoteAberto && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Orçamento v{quoteAberto.version}</p>
                                <p className="mt-1 text-lg font-bold text-amber-900">{formatCurrency(Number(quoteAberto.total))}</p>
                                {quoteAberto.valid_until && (
                                    <p className="text-[11px] text-amber-700">Válido até {formatDate(quoteAberto.valid_until)}</p>
                                )}
                            </div>
                            <SGFButton size="sm" disabled={busy} icon={Check}
                                onClick={run(() => mutApproveQuote.mutateAsync(quoteAberto.id), 'Orçamento aprovado. Solicite o empenho.')}>
                                Aprovar
                            </SGFButton>
                        </div>
                        <ul className="mt-3 space-y-1">
                            {quoteAberto.items.map((it) => (
                                <li key={it.id} className="flex justify-between text-xs text-amber-900">
                                    <span>{it.kind === 'peca' ? 'Peça' : 'Mão de obra'} · {it.description} × {it.qty}</span>
                                    <span className="font-semibold">{formatCurrency(Number(it.unit_price) * Number(it.qty))}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {fin === 'awaiting_commitment' && (
                    <div className="rounded-2xl border border-slate-200 p-4">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Empenho / NAD</p>
                        <div className="grid grid-cols-2 gap-3">
                            <SGFInput label="Nº do empenho" value={commitment} onChange={(e) => setCommitment(e.target.value)} fullWidth />
                            <SGFInput label="Nº da NAD (opcional)" value={nad} onChange={(e) => setNad(e.target.value)} fullWidth />
                        </div>
                        <SGFButton className="mt-3" size="sm" disabled={busy || !commitment.trim()}
                            onClick={run(() => mutCommit.mutateAsync(), 'Empenho registrado. A oficina já pode executar.')}>
                            Registrar empenho
                        </SGFButton>
                    </div>
                )}

                {op === 'ready' && (
                    <SGFButton size="sm" disabled={busy} onClick={run(() => mutOp.mutateAsync('received'), 'Veículo recebido e liberado para uso.')}>
                        Conferir e receber o veículo
                    </SGFButton>
                )}

                {naoAtestadas.length > 0 && (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-700">Notas a atestar</p>
                        {naoAtestadas.map((nf) => (
                            <div key={nf.id} className="flex items-center justify-between gap-3 py-1.5">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-blue-900">NF {nf.invoice_number}</p>
                                    <p className="text-[11px] text-blue-700">
                                        {formatCurrency(Number(nf.amount))} · emitida {formatDate(nf.issued_at)}
                                        {nf.commitment_number ? ` · empenho ${nf.commitment_number}` : ''}
                                    </p>
                                </div>
                                <SGFButton size="sm" variant="secondary" disabled={busy} icon={FileText}
                                    onClick={run(() => mutAttest.mutateAsync(nf.id), 'Nota atestada.')}>
                                    Atestar
                                </SGFButton>
                            </div>
                        ))}
                    </div>
                )}

                {totalNf > 0 && (
                    <div className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Pagamentos</p>
                            <SGFBadge variant={totalPago >= totalNf ? 'success' : 'warning'} size="sm">
                                {formatCurrency(totalPago)} de {formatCurrency(totalNf)}
                            </SGFBadge>
                        </div>
                        {(data?.payments ?? []).map((p) => (
                            <div key={p.id} className="flex justify-between py-1 text-xs text-slate-600">
                                <span>{formatDate(p.paid_at)}{p.note ? ` · ${p.note}` : ''}</span>
                                <span className="font-semibold">{formatCurrency(Number(p.amount))}</span>
                            </div>
                        ))}
                        {totalPago < totalNf && (
                            <div className="mt-3 flex items-end gap-2">
                                <SGFInput label="Valor pago (R$)" type="number" min={0} step="0.01"
                                    value={payAmount} onChange={(e) => setPayAmount(e.target.value)} icon={DollarSign} />
                                <SGFButton size="sm" disabled={busy || !(Number(payAmount) > 0)}
                                    onClick={run(async () => {
                                        const r = await mutPay.mutateAsync();
                                        setPayAmount('');
                                        return r;
                                    }, 'Pagamento registrado.')}>
                                    Registrar
                                </SGFButton>
                            </div>
                        )}
                        {totalPago > 0 && totalPago < totalNf && (
                            <p className="mt-2 text-[11px] text-amber-600">
                                Pagamento parcial: o processo só é encerrado quando os pagamentos cobrem as notas.
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Trilha de auditoria */}
            {(data?.events ?? []).length > 0 && (
                <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Trilha do processo</p>
                    <ul className="space-y-2">
                        {(data?.events ?? []).map((ev) => (
                            <li key={ev.id} className="flex gap-2.5 text-xs">
                                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                                <div className="min-w-0">
                                    <p className="text-slate-700">{ev.note || `${ev.from_state ?? '—'} → ${ev.to_state ?? '—'}`}</p>
                                    <p className="text-[10px] text-slate-400">
                                        {formatDate(ev.created_at)} · {ev.profiles?.full_name ?? ev.actor_role ?? 'sistema'}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {(data?.quotes ?? []).length === 0 && op === 'at_shop' && (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-xs text-slate-400">
                    Aguardando a oficina enviar o orçamento pelo Sistema de Manutenção.
                </p>
            )}
        </div>
    );
}
