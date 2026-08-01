import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { Check, Clock, DollarSign, FileText, Loader2, X } from '@/components/sgf/icons';
import { serviceOrderFiscalApi, type FinStatus, type OpStatus } from '@/lib/supabase-api';
import { openPrivateDocument } from '@/lib/docStorage';
import { formatCurrency, formatDate, formatRoleLabel, maskCpfLGPD } from '@/lib/utils';
import { maintenanceOperationalLabel } from '@/lib/maintenance-status';

interface Props {
    orderId: string;
    operationalStatus: OpStatus | null;
    financialStatus: FinStatus | null;
    commitmentNumber: string | null;
    commitmentDocumentPath: string | null;
    tenantId: string;
}

const FIN_LABEL: Record<string, string> = {
    not_started: 'Não iniciado', awaiting_commitment: 'Aguardando empenho', committed: 'Empenhado',
    invoiced: 'Faturado', attested: 'Atestado', paid: 'Pago',
};

export function ServiceOrderFiscalPanel({
    orderId,
    operationalStatus,
    financialStatus,
    commitmentNumber,
    commitmentDocumentPath,
    tenantId,
}: Props) {
    const qc = useQueryClient();
    const op = (operationalStatus ?? 'pending') as OpStatus;
    const fin = (financialStatus ?? 'not_started') as FinStatus;

    const [quoteReviewNote, setQuoteReviewNote] = useState('');
    const [commitment, setCommitment] = useState(commitmentNumber ?? '');
    const [nad, setNad] = useState('');
    const [commitmentFile, setCommitmentFile] = useState<File | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
    const [payNote, setPayNote] = useState('');

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

    const mutApproveQuote = useMutation({
        mutationFn: (id: string) => serviceOrderFiscalApi.approveQuote(id, quoteReviewNote),
    });
    const mutRejectQuote = useMutation({
        mutationFn: (id: string) => serviceOrderFiscalApi.rejectQuote(id, quoteReviewNote),
    });
    const mutCommit = useMutation({
        mutationFn: () => serviceOrderFiscalApi.registerCommitment(orderId, {
            commitmentNumber: commitment,
            nadNumber: nad || null,
            document: commitmentFile!,
            tenantId,
        }),
    });
    const mutDelivery = useMutation({
        mutationFn: () => serviceOrderFiscalApi.confirmShopDelivery(orderId),
    });
    const mutReceive = useMutation({
        mutationFn: () => serviceOrderFiscalApi.receiveVehicle(orderId),
    });
    const mutAttest = useMutation({
        mutationFn: (id: string) => serviceOrderFiscalApi.attestInvoice(id),
    });
    const mutPay = useMutation({
        mutationFn: () => serviceOrderFiscalApi.registerPayment(orderId, {
            amount: Number(payAmount),
            paidAt: new Date(`${payDate}T12:00:00`).toISOString(),
            note: payNote,
        }),
    });

    const busy = mutApproveQuote.isPending
        || mutRejectQuote.isPending
        || mutCommit.isPending
        || mutDelivery.isPending
        || mutReceive.isPending
        || mutAttest.isPending
        || mutPay.isPending;

    const quoteAberto = data?.quotes.find((q) => q.status === 'enviado');
    const totalNf = (data?.invoices ?? []).reduce((s, i) => s + Number(i.amount ?? 0), 0);
    const totalPago = (data?.payments ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const naoAtestadas = (data?.invoices ?? []).filter((i) => !i.attested_at);
    const saldoPagar = Math.max(0, totalNf - totalPago);
    const podePagar = fin === 'attested' && naoAtestadas.length === 0 && saldoPagar > 0;
    const openDocument = async (path: string) => {
        try {
            await openPrivateDocument(path);
        } catch (error) {
            toast.error((error as Error).message || 'Não foi possível abrir o documento.');
        }
    };

    if (isLoading) {
        return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
    }

    return (
        <div className="space-y-5 text-sm">
            {/* Os dois eixos, lado a lado */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Situação do veículo</p>
                    <p className="mt-1.5 text-base font-bold leading-snug text-slate-900">{maintenanceOperationalLabel(op, fin)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Situação do processo</p>
                    <p className="mt-1.5 text-base font-bold leading-snug text-slate-900">{FIN_LABEL[fin] ?? fin}</p>
                </div>
            </div>

            {/* Ações do gestor, só a pertinente à etapa atual */}
            <div className="space-y-3">
                {op === 'authorized' && (
                    <SGFButton size="sm" disabled={busy} onClick={run(() => mutDelivery.mutateAsync(), 'Veículo registrado na oficina.')}>
                        Confirmar entrega na oficina
                    </SGFButton>
                )}

                {quoteAberto && (
                    <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-xs">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-bold text-slate-900">Orçamento v{quoteAberto.version}</p>
                                {quoteAberto.valid_until && (
                                    <p className="mt-1 text-xs text-slate-500">Válido até {formatDate(quoteAberto.valid_until)}</p>
                                )}
                            </div>
                            <SGFBadge variant="warning" size="sm">Revisão do gestor</SGFBadge>
                        </div>
                        <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-3">
                            {quoteAberto.items.map((it) => (
                                <li key={it.id} className="flex items-start justify-between gap-4 py-2.5 text-sm text-slate-700">
                                    <span className="min-w-0">{it.kind === 'peca' ? 'Peça' : 'Mão de obra'} · {it.description} × {it.qty}</span>
                                    <span className="shrink-0 font-semibold text-slate-900">{formatCurrency(Number(it.unit_price) * Number(it.qty))}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-3 flex items-baseline justify-end gap-3 border-t border-slate-200 pt-3">
                            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Valor total</span>
                            <strong className="text-xl text-slate-950">{formatCurrency(Number(quoteAberto.total))}</strong>
                        </div>
                        {quoteAberto.note && (
                            <p className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                                <strong>Observação da oficina:</strong> {quoteAberto.note}
                            </p>
                        )}
                        <div className="mt-3">
                            <SGFInput
                                label="Parecer do gestor"
                                value={quoteReviewNote}
                                onChange={(event) => setQuoteReviewNote(event.target.value)}
                                placeholder="Opcional para aprovar; obrigatório para rejeitar"
                                fullWidth
                            />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <SGFButton
                                size="sm"
                                disabled={busy}
                                icon={Check}
                                onClick={run(async () => {
                                    await mutApproveQuote.mutateAsync(quoteAberto.id);
                                    setQuoteReviewNote('');
                                }, 'Orçamento aprovado. Solicite o empenho.')}
                            >
                                Aprovar orçamento
                            </SGFButton>
                            <SGFButton
                                size="sm"
                                variant="ghost"
                                disabled={busy || !quoteReviewNote.trim()}
                                icon={X}
                                className="!text-red-600 hover:!bg-red-50 focus:!ring-red-500/20 font-semibold"
                                onClick={run(async () => {
                                    await mutRejectQuote.mutateAsync(quoteAberto.id);
                                    setQuoteReviewNote('');
                                }, 'Orçamento rejeitado e devolvido à oficina.')}
                            >
                                Rejeitar e devolver
                            </SGFButton>
                        </div>
                    </div>
                )}

                {fin === 'awaiting_commitment' && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                        <p className="mb-3 text-sm font-bold text-slate-900">Empenho / NAD</p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <SGFInput label="Nº do empenho" value={commitment} onChange={(e) => setCommitment(e.target.value)} fullWidth />
                            <SGFInput label="Nº da NAD (opcional)" value={nad} onChange={(e) => setNad(e.target.value)} fullWidth />
                        </div>
                        <label className={`mt-3 flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed p-4 transition ${
                            commitmentFile
                                ? 'border-emerald-400 bg-white'
                                : 'border-slate-200 bg-white hover:border-blue-300'
                        }`}>
                            <FileText className={`h-6 w-6 ${commitmentFile ? 'text-emerald-600' : 'text-blue-600'}`} />
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-slate-700">
                                    {commitmentFile?.name || 'Anexar PDF ou imagem do empenho/NAD'}
                                </span>
                                <span className="text-xs text-slate-500">Documento privado vinculado à ordem de serviço</span>
                            </span>
                            <input
                                type="file"
                                accept="application/pdf,image/*"
                                className="sr-only"
                                onChange={(event) => setCommitmentFile(event.target.files?.[0] ?? null)}
                            />
                        </label>
                        <SGFButton className="mt-3" size="sm" disabled={busy || !commitment.trim() || !commitmentFile}
                            onClick={run(() => mutCommit.mutateAsync(), 'Empenho registrado. A oficina já pode executar.')}>
                            Registrar empenho
                        </SGFButton>
                    </div>
                )}

                {op === 'ready' && (
                    <SGFButton size="sm" disabled={busy} onClick={run(() => mutReceive.mutateAsync(), 'Veículo recebido e liberado para uso.')}>
                        Conferir e receber o veículo
                    </SGFButton>
                )}

                {op === 'received' && naoAtestadas.length > 0 && (
                    <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-xs">
                        <p className="mb-3 text-sm font-bold text-slate-900">Notas a atestar</p>
                        {naoAtestadas.map((nf) => (
                            <div key={nf.id} className="flex items-center justify-between gap-3 py-1.5">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-blue-900">NF {nf.invoice_number}</p>
                                    <p className="text-xs text-blue-700">
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

                {(commitmentDocumentPath || (data?.invoices ?? []).some((invoice) => invoice.file_path)) && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                        <p className="mb-3 text-sm font-bold text-slate-900">Documentos fiscais</p>
                        <div className="flex flex-wrap gap-2">
                            {commitmentDocumentPath && (
                                <SGFButton
                                    size="sm"
                                    variant="secondary"
                                    icon={FileText}
                                    onClick={() => void openDocument(commitmentDocumentPath)}
                                >
                                    Abrir empenho/NAD
                                </SGFButton>
                            )}
                            {(data?.invoices ?? []).filter((invoice) => invoice.file_path).map((invoice) => (
                                <SGFButton
                                    key={invoice.id}
                                    size="sm"
                                    variant="secondary"
                                    icon={FileText}
                                    onClick={() => void openDocument(invoice.file_path!)}
                                >
                                    Abrir NF {invoice.invoice_number}
                                </SGFButton>
                            ))}
                        </div>
                    </div>
                )}

                {totalNf > 0 && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-bold text-slate-900">Pagamentos</p>
                            <SGFBadge variant={totalPago >= totalNf ? 'success' : 'warning'} size="sm">
                                {formatCurrency(totalPago)} de {formatCurrency(totalNf)}
                            </SGFBadge>
                        </div>
                        {(data?.payments ?? []).map((p) => (
                            <div key={p.id} className="flex justify-between py-1.5 text-sm text-slate-600">
                                <span>{formatDate(p.paid_at)}{p.note ? ` · ${p.note}` : ''}</span>
                                <span className="font-semibold">{formatCurrency(Number(p.amount))}</span>
                            </div>
                        ))}
                        {podePagar && (
                            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                                <SGFInput
                                    label="Valor pago (R$)"
                                    type="number"
                                    min={0.01}
                                    max={saldoPagar}
                                    step="0.01"
                                    value={payAmount}
                                    onChange={(event) => setPayAmount(event.target.value)}
                                    icon={DollarSign}
                                    fullWidth
                                />
                                <SGFInput
                                    label="Data do pagamento"
                                    type="date"
                                    value={payDate}
                                    onChange={(event) => setPayDate(event.target.value)}
                                    fullWidth
                                />
                                <SGFInput
                                    label="Referência (opcional)"
                                    value={payNote}
                                    onChange={(event) => setPayNote(event.target.value)}
                                    placeholder="OB, processo ou observação"
                                    fullWidth
                                />
                                <div className="md:col-span-3">
                                    <SGFButton
                                        size="sm"
                                        disabled={busy
                                            || !(Number(payAmount) > 0)
                                            || Number(payAmount) > saldoPagar
                                            || !payDate}
                                        onClick={run(async () => {
                                            await mutPay.mutateAsync();
                                            setPayAmount('');
                                            setPayNote('');
                                        }, 'Pagamento registrado.')}
                                    >
                                        Registrar pagamento
                                    </SGFButton>
                                </div>
                            </div>
                        )}
                        {fin === 'invoiced' && naoAtestadas.length > 0 && (
                            <p className="mt-3 text-xs text-blue-700">
                                O pagamento será liberado somente depois do ateste de todas as notas.
                            </p>
                        )}
                        {totalPago > 0 && totalPago < totalNf && (
                            <p className="mt-2 text-xs text-amber-700">
                                Pagamento parcial: o processo só é encerrado quando os pagamentos cobrem as notas.
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Linha do tempo — mesma apresentação usada pela oficina */}
            {(data?.events ?? []).length > 0 && (
                <section>
                    <div className="mb-4 flex items-center gap-2">
                        <Clock className="h-5 w-5 text-blue-700" />
                        <div>
                            <h3 className="text-base font-bold text-slate-900">Linha do tempo</h3>
                            <p className="text-sm text-slate-500">Trilha do processo (Auditoria LGPD)</p>
                        </div>
                    </div>
                    <ol>
                        {(data?.events ?? []).map((ev, index) => {
                            const name = ev.profiles?.full_name ?? 'Sistema / Automático';
                            const role = formatRoleLabel(ev.profiles?.role || ev.actor_role);
                            const cpfMasked = maskCpfLGPD(ev.profiles?.cpf);
                            const dept = ev.profiles?.departments?.name || ev.profiles?.department;

                            return (
                                <li key={ev.id} className="relative flex gap-4 pb-6 last:pb-0">
                                    {index < (data?.events ?? []).length - 1 && (
                                        <span className="absolute left-[5px] top-3 h-full w-px bg-slate-200" />
                                    )}
                                    <span className="relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500 ring-4 ring-blue-100" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold leading-5 text-slate-800">{ev.note || `${ev.from_state ?? '—'} → ${ev.to_state ?? '—'}`}</p>
                                        <p className="mt-1 text-xs leading-5 text-slate-500">
                                            {formatDate(ev.created_at, 'dd/MM/yyyy, HH:mm')} · {role.toLocaleLowerCase('pt-BR')}
                                        </p>
                                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                                            <span>{name}</span>
                                            {cpfMasked !== '—' && (
                                                <span className="font-mono">CPF: {cpfMasked}</span>
                                            )}
                                            {dept && <span>· {dept}</span>}
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                </section>
            )}

            {(data?.quotes ?? []).length === 0 && op === 'at_shop' && (
                <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-center text-sm text-slate-500">
                    Aguardando a oficina enviar o orçamento pelo Sistema de Manutenção.
                </p>
            )}
        </div>
    );
}
