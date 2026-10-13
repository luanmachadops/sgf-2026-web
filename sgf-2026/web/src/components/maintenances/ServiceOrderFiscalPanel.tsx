import { quoteClassificationLabel } from '@/lib/workshop-quote-classification';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { Check, Clock, FileText, Loader2, X } from '@/components/sgf/icons';
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
}

/**
 * Situação do orçamento. Empenho, nota, ateste e pagamento ficam com a
 * contabilidade; os rótulos antigos continuam para as OS que já passaram por eles.
 */
const FIN_LABEL: Record<string, string> = {
    not_started: 'Aguardando orçamento',
    awaiting_commitment: 'Orçamento aprovado',
    committed: 'Orçamento aprovado',
    invoiced: 'Orçamento aprovado · nota registrada',
    attested: 'Orçamento aprovado · nota atestada',
    paid: 'Orçamento aprovado · pago',
};

/**
 * Fluxo da OS no painel: orçamento aprovado → oficina executa → gestor recebe o
 * veículo (recebimento, Lei 14.133/21 art. 140). O valor aprovado consome o
 * empenho da secretaria cadastrado em Limites por secretaria.
 */
export function ServiceOrderFiscalPanel({
    orderId,
    operationalStatus,
    financialStatus,
    commitmentNumber,
    commitmentDocumentPath,
}: Props) {
    const qc = useQueryClient();
    const op = (operationalStatus ?? 'pending') as OpStatus;
    const fin = (financialStatus ?? 'not_started') as FinStatus;
    const [quoteReviewNote, setQuoteReviewNote] = useState('');

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['maintenance', orderId] });
        qc.invalidateQueries({ queryKey: ['osFiscal', orderId] });
        qc.invalidateQueries({ queryKey: ['maintenances'] });
        qc.invalidateQueries({ queryKey: ['department-budgets'] });
    };

    const { data, isLoading } = useQuery({
        queryKey: ['osFiscal', orderId],
        queryFn: async () => {
            const [quotes, invoices, events] = await Promise.all([
                serviceOrderFiscalApi.quotes(orderId),
                serviceOrderFiscalApi.invoices(orderId),
                serviceOrderFiscalApi.events(orderId),
            ]);
            return { quotes, invoices, events };
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
    const mutDelivery = useMutation({
        mutationFn: () => serviceOrderFiscalApi.confirmShopDelivery(orderId),
    });
    const mutReceive = useMutation({
        mutationFn: () => serviceOrderFiscalApi.receiveVehicle(orderId),
    });

    const busy = mutApproveQuote.isPending || mutRejectQuote.isPending || mutDelivery.isPending || mutReceive.isPending;
    const quoteAberto = data?.quotes.find((q) => q.status === 'enviado');
    const quoteAprovado = data?.quotes.find((q) => q.status === 'aprovado');
    const invoiceFiles = (data?.invoices ?? []).filter((invoice) => invoice.file_path);
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Situação do veículo</p>
                    <p className="mt-1.5 text-base font-bold leading-snug text-slate-900">{maintenanceOperationalLabel(op, fin)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Orçamento</p>
                    <p className="mt-1.5 text-base font-bold leading-snug text-slate-900">{FIN_LABEL[fin] ?? fin}</p>
                    {quoteAprovado && (
                        <p className="mt-1 text-xs text-slate-500">v{quoteAprovado.version} · {formatCurrency(Number(quoteAprovado.total))}</p>
                    )}
                </div>
            </div>

            {/* Ação do gestor pertinente à etapa atual */}
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
                                    <span className="min-w-0">{it.kind === 'peca' ? 'Peça' : 'Mão de obra'} · {it.description} × {it.qty} {it.unit ?? ''}<small className="block">{quoteClassificationLabel(it.unit, it.category)}</small></span>
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
                        <p className="mt-3 text-xs text-slate-500">
                            Ao aprovar, a oficina é liberada para executar e o valor passa a consumir o empenho
                            da secretaria do veículo (Limites por secretaria). Se não houver saldo, a aprovação é recusada.
                        </p>
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
                                }, 'Orçamento aprovado. A oficina já pode executar.')}
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

                {op === 'ready' && (
                    <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-xs">
                        <p className="text-sm font-bold text-slate-900">Recebimento do serviço</p>
                        <p className="mt-1 text-xs text-slate-500">
                            Confira o veículo e o serviço executado. O recebimento fica registrado na linha do
                            tempo e serve de comprovação para a contabilidade liquidar a despesa.
                        </p>
                        <SGFButton className="mt-3" size="sm" disabled={busy} onClick={run(() => mutReceive.mutateAsync(), 'Veículo recebido e liberado para uso.')}>
                            Conferir e receber o veículo
                        </SGFButton>
                    </div>
                )}

                {/* Documentos de OS anteriores à simplificação (empenho/NF anexados no fluxo antigo). */}
                {(commitmentDocumentPath || invoiceFiles.length > 0) && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                        <p className="mb-3 text-sm font-bold text-slate-900">Documentos anexados</p>
                        <div className="flex flex-wrap gap-2">
                            {commitmentDocumentPath && (
                                <SGFButton size="sm" variant="secondary" icon={FileText} onClick={() => void openDocument(commitmentDocumentPath)}>
                                    Abrir empenho{commitmentNumber ? ` ${commitmentNumber}` : ''}
                                </SGFButton>
                            )}
                            {invoiceFiles.map((invoice) => (
                                <SGFButton key={invoice.id} size="sm" variant="secondary" icon={FileText} onClick={() => void openDocument(invoice.file_path!)}>
                                    Abrir NF {invoice.invoice_number}
                                </SGFButton>
                            ))}
                        </div>
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
