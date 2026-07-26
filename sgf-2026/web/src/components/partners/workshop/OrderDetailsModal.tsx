import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFBadge, SGFButton } from '@/components/sgf';
import {
    AlertCircle,
    Camera,
    CheckCircle,
    Clock,
    FileText,
    Play,
    Receipt,
    RefreshCw,
} from '@/components/sgf/icons';
import {
    workshopPortalApi,
    type WorkshopContext,
    type WorkshopOrder,
} from '@/lib/workshop-portal-api';
import {
    FINANCIAL_LABELS,
    OPERATIONAL_LABELS,
    nextAction,
} from '@/lib/workshop-status';
import { FinishServiceModal } from './FinishServiceModal';
import { InvoiceModal } from './InvoiceModal';
import { QuoteModal } from './QuoteModal';
import { WorkshopModalShell } from './WorkshopModalShell';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

type ActionModal = 'quote' | 'finish' | 'invoice' | null;

interface OrderDetailsModalProps {
    order: WorkshopOrder;
    context: WorkshopContext;
    onClose: () => void;
    onChanged: () => void;
}

function operationalVariant(status: WorkshopOrder['operationalStatus']) {
    if (status === 'cancelled') return 'error' as const;
    if (status === 'received') return 'success' as const;
    if (status === 'in_progress' || status === 'ready') return 'info' as const;
    return 'warning' as const;
}

function financialVariant(status: WorkshopOrder['financialStatus']) {
    if (status === 'paid' || status === 'attested') return 'success' as const;
    if (status === 'committed' || status === 'invoiced') return 'info' as const;
    return 'warning' as const;
}

function safeDate(value: string | null): string {
    if (!value) return 'Sem validade';
    const parsed = new Date(`${value}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? '—' : date.format(parsed);
}

function safeDateTime(value: string): string {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : dateTime.format(parsed);
}

export function OrderDetailsModal({
    order,
    context,
    onClose,
    onChanged,
}: OrderDetailsModalProps) {
    const queryClient = useQueryClient();
    const [actionModal, setActionModal] = useState<ActionModal>(null);

    const detailsQuery = useQuery({
        queryKey: ['workshop-order-details', order.orderId],
        queryFn: () => workshopPortalApi.getOrderDetails(order.orderId),
    });

    const startMutation = useMutation({
        mutationFn: () => workshopPortalApi.startService(order.orderId),
        onSuccess: () => {
            toast.success('Execução da ordem de serviço iniciada.');
            void queryClient.invalidateQueries({ queryKey: ['workshop-orders'] });
            void queryClient.invalidateQueries({ queryKey: ['workshop-order-details', order.orderId] });
            onChanged();
        },
        onError: (reason) => toast.error(
            reason instanceof Error ? reason.message : 'Não foi possível iniciar o serviço.',
        ),
    });

    const canQuote = ['authorized', 'at_shop', 'awaiting_quote_approval']
        .includes(order.operationalStatus);
    const canStart = order.operationalStatus === 'awaiting_quote_approval'
        && order.financialStatus === 'committed';
    const canFinish = order.operationalStatus === 'in_progress';
    const canInvoice = order.operationalStatus === 'received'
        && Boolean(order.commitmentNumber)
        && ['committed', 'invoiced'].includes(order.financialStatus);

    const completeAction = (message: string) => {
        setActionModal(null);
        toast.success(message);
        void queryClient.invalidateQueries({ queryKey: ['workshop-orders'] });
        void queryClient.invalidateQueries({ queryKey: ['workshop-order-details', order.orderId] });
        onChanged();
    };

    const details = detailsQuery.data;

    return (
        <>
            <WorkshopModalShell
                eyebrow="Ordem de serviço"
                title={`${order.plate} · ${order.brand} ${order.model}`}
                subtitle={`Aberta em ${safeDateTime(order.createdAt)}`}
                onClose={onClose}
                maxWidthClass="sm:max-w-4xl"
                zIndexClass="z-50"
                footer={(
                    <>
                        <SGFButton variant="ghost" onClick={onClose}>Fechar</SGFButton>
                        {canQuote && (
                            <SGFButton variant="outline" icon={Receipt} onClick={() => setActionModal('quote')}>
                                Enviar orçamento
                            </SGFButton>
                        )}
                        {canStart && (
                            <SGFButton loading={startMutation.isPending} icon={Play} onClick={() => startMutation.mutate()}>
                                Iniciar serviço
                            </SGFButton>
                        )}
                        {canFinish && (
                            <SGFButton icon={CheckCircle} onClick={() => setActionModal('finish')}>
                                Concluir serviço
                            </SGFButton>
                        )}
                        {canInvoice && (
                            <SGFButton icon={FileText} onClick={() => setActionModal('invoice')}>
                                Enviar nota fiscal
                            </SGFButton>
                        )}
                    </>
                )}
            >
                <div className="space-y-6">
                    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-2xl bg-slate-50 p-4">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Situação da OS</p>
                            <SGFBadge className="mt-2" size="lg" dot variant={operationalVariant(order.operationalStatus)}>
                                {OPERATIONAL_LABELS[order.operationalStatus]}
                            </SGFBadge>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Financeiro</p>
                            <SGFBadge className="mt-2" size="lg" dot variant={financialVariant(order.financialStatus)}>
                                {FINANCIAL_LABELS[order.financialStatus]}
                            </SGFBadge>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Hodômetro</p>
                            <p className="mt-2 font-bold text-slate-900">
                                {order.odometer == null ? 'Não informado' : `${order.odometer.toLocaleString('pt-BR')} km`}
                            </p>
                        </div>
                        <div className="rounded-2xl bg-blue-50 p-4">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-blue-600">Próxima etapa</p>
                            <p className="mt-2 font-bold text-blue-950">
                                {nextAction(order.operationalStatus, order.financialStatus)}
                            </p>
                        </div>
                    </section>

                    <section>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{order.category}</p>
                        <h3 className="mt-1 text-base font-bold text-slate-900">Serviço solicitado</h3>
                        <p className="mt-2 whitespace-pre-wrap rounded-2xl border border-slate-100 p-4 text-sm leading-6 text-slate-600">
                            {order.description}
                        </p>
                        {order.commitmentNumber && (
                            <p className="mt-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
                                <strong>Empenho:</strong> {order.commitmentNumber}
                            </p>
                        )}
                    </section>

                    {detailsQuery.isLoading ? (
                        <div className="grid min-h-40 place-items-center">
                            <RefreshCw className="h-7 w-7 animate-spin text-blue-600" />
                        </div>
                    ) : detailsQuery.error ? (
                        <div className="flex gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                            <AlertCircle className="h-5 w-5 shrink-0" />
                            <div>
                                <p className="font-bold">Detalhes indisponíveis</p>
                                <p>{(detailsQuery.error as Error).message}</p>
                                <button type="button" className="mt-2 font-bold underline" onClick={() => void detailsQuery.refetch()}>
                                    Tentar novamente
                                </button>
                            </div>
                        </div>
                    ) : details && (
                        <>
                            <section>
                                <div className="flex items-center gap-2">
                                    <Receipt className="h-5 w-5 text-blue-700" />
                                    <h3 className="font-bold text-slate-900">Orçamentos</h3>
                                </div>
                                {details.quotes.length === 0 ? (
                                    <p className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                                        Nenhum orçamento enviado.
                                    </p>
                                ) : (
                                    <div className="mt-3 space-y-3">
                                        {details.quotes.map((quote) => (
                                            <article key={quote.id} className="rounded-2xl border border-slate-200 p-4">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div>
                                                        <p className="font-bold text-slate-900">Versão {quote.version}</p>
                                                        <p className="text-xs text-slate-500">
                                                            Enviado em {safeDateTime(quote.createdAt)} · válido até {safeDate(quote.validUntil)}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <SGFBadge variant={quote.status === 'aprovado' ? 'success' : quote.status === 'rejeitado' ? 'error' : 'info'}>
                                                            {quote.status}
                                                        </SGFBadge>
                                                        <p className="mt-1 font-black text-slate-900">{currency.format(quote.total)}</p>
                                                    </div>
                                                </div>
                                                <ul className="mt-3 divide-y divide-slate-100 text-sm">
                                                    {quote.items.map((item) => (
                                                        <li key={item.id ?? `${item.description}-${item.qty}`} className="flex justify-between gap-4 py-2">
                                                            <span className="text-slate-600">
                                                                {item.qty.toLocaleString('pt-BR')}× {item.description}
                                                            </span>
                                                            <strong className="shrink-0 text-slate-800">
                                                                {currency.format(item.qty * item.unitPrice)}
                                                            </strong>
                                                        </li>
                                                    ))}
                                                </ul>
                                                {quote.note && <p className="mt-2 text-sm text-slate-500">{quote.note}</p>}
                                                {quote.reviewNote && (
                                                    <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                                                        <strong>Retorno da prefeitura:</strong> {quote.reviewNote}
                                                    </p>
                                                )}
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section>
                                <div className="flex items-center gap-2">
                                    <FileText className="h-5 w-5 text-blue-700" />
                                    <h3 className="font-bold text-slate-900">Notas fiscais</h3>
                                </div>
                                {details.invoices.length === 0 ? (
                                    <p className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                                        Nenhuma nota fiscal enviada.
                                    </p>
                                ) : (
                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        {details.invoices.map((invoice) => (
                                            <article key={invoice.id} className="rounded-2xl border border-slate-200 p-4">
                                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">NF {invoice.invoiceNumber}</p>
                                                <p className="mt-1 text-xl font-black text-slate-900">{currency.format(invoice.amount)}</p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    Emitida em {safeDate(invoice.issuedAt)}
                                                </p>
                                                <SGFBadge className="mt-3" variant={invoice.attestedAt ? 'success' : 'warning'}>
                                                    {invoice.attestedAt ? 'Atestada' : 'Aguardando ateste'}
                                                </SGFBadge>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section>
                                <div className="flex items-center gap-2">
                                    <Clock className="h-5 w-5 text-blue-700" />
                                    <h3 className="font-bold text-slate-900">Linha do tempo</h3>
                                </div>
                                {details.events.length === 0 ? (
                                    <p className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                                        Ainda não há eventos registrados.
                                    </p>
                                ) : (
                                    <ol className="mt-4 space-y-0">
                                        {details.events.map((event, index) => (
                                            <li key={event.id} className="relative flex gap-4 pb-5">
                                                {index < details.events.length - 1 && (
                                                    <span className="absolute left-[7px] top-4 h-full w-px bg-slate-200" />
                                                )}
                                                <span className="relative mt-1.5 h-4 w-4 shrink-0 rounded-full border-4 border-blue-100 bg-blue-600" />
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-slate-800">
                                                        {event.note || (event.toState
                                                            ? `Situação alterada para ${event.toState}`
                                                            : 'Atualização do processo')}
                                                    </p>
                                                    <p className="mt-0.5 text-xs text-slate-400">
                                                        {safeDateTime(event.createdAt)}
                                                        {event.actorRole ? ` · ${event.actorRole}` : ''}
                                                    </p>
                                                    {event.attachmentPath?.startsWith('http') && (
                                                        <a href={event.attachmentPath} target="_blank" rel="noreferrer"
                                                            className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:underline">
                                                            <Camera className="h-4 w-4" />
                                                            Ver foto do serviço
                                                        </a>
                                                    )}
                                                </div>
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </section>
                        </>
                    )}
                </div>
            </WorkshopModalShell>

            {actionModal === 'quote' && (
                <QuoteModal
                    order={order}
                    onClose={() => setActionModal(null)}
                    onSuccess={() => completeAction('Orçamento enviado para análise da prefeitura.')}
                />
            )}
            {actionModal === 'finish' && (
                <FinishServiceModal
                    order={order}
                    context={context}
                    onClose={() => setActionModal(null)}
                    onSuccess={() => completeAction('Serviço concluído. Aguardando retirada do veículo.')}
                />
            )}
            {actionModal === 'invoice' && (
                <InvoiceModal
                    order={order}
                    context={context}
                    onClose={() => setActionModal(null)}
                    onSuccess={() => completeAction('Nota fiscal enviada para ateste.')}
                />
            )}
        </>
    );
}
