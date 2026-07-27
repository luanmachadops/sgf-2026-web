import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { AlertCircle, Car, Fuel, Gauge, Receipt } from '@/components/sgf/icons';
import type { StationHistoryItem } from '@/lib/station-portal-api';

interface StationHistoryDetailsModalProps {
    item: StationHistoryItem | null;
    onClose: () => void;
}

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function statusDetails(item: StationHistoryItem): {
    label: string;
    variant: 'success' | 'warning' | 'error' | 'default';
} {
    if (item.workflowStatus === 'validado') return { label: 'Validado', variant: 'success' };
    if (item.workflowStatus === 'rejeitado_admin') return { label: 'Rejeitado', variant: 'error' };
    if (item.workflowStatus === 'concluido') return { label: 'Aguardando validação', variant: 'warning' };
    return { label: item.workflowStatus.replaceAll('_', ' '), variant: 'default' };
}

export function StationHistoryDetailsModal({ item, onClose }: StationHistoryDetailsModalProps) {
    const [photoOpen, setPhotoOpen] = useState(false);
    const status = item ? statusDetails(item) : null;

    return (
        <>
            <Modal isOpen={Boolean(item)} onClose={onClose} title="Detalhes do abastecimento" size="lg">
                {item && status && (
                    <div className="space-y-6">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Registro {item.fuelingId.slice(0, 8).toUpperCase()}
                                </p>
                                <h3 className="mt-1 text-xl font-black text-slate-900">{item.plate}</h3>
                                <p className="text-sm text-slate-500">{item.brand} {item.model}</p>
                            </div>
                            <SGFBadge variant={status.variant}>{status.label}</SGFBadge>
                        </div>

                        <dl className="grid gap-3 sm:grid-cols-2">
                            {[
                                { icon: Fuel, label: 'Combustível', value: item.fuelType },
                                { icon: Gauge, label: 'Hodômetro', value: `${item.odometer.toLocaleString('pt-BR')} km` },
                                { icon: Receipt, label: 'Cupom', value: item.receiptNo || 'Não informado' },
                                { icon: Car, label: 'Registrado em', value: dateTime.format(new Date(item.filledAt)) },
                            ].map((detail) => {
                                const Icon = detail.icon;
                                return (
                                    <div key={detail.label} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
                                        <div className="rounded-xl bg-white p-2 text-slate-500 shadow-sm">
                                            <Icon className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{detail.label}</dt>
                                            <dd className="text-sm font-semibold capitalize text-slate-800">{detail.value}</dd>
                                        </div>
                                    </div>
                                );
                            })}
                        </dl>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Resumo financeiro</p>
                            <div className="mt-4 space-y-3 text-sm">
                                <div className="flex justify-between gap-4">
                                    <span className="text-slate-500">Quantidade</span>
                                    <strong className="text-slate-800">{number.format(item.liters)} L</strong>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <span className="text-slate-500">Preço por litro</span>
                                    <strong className="text-slate-800">{currency.format(item.pricePerLiter)}</strong>
                                </div>
                                <div className="flex justify-between gap-4 border-t border-slate-200 pt-3">
                                    <span className="font-bold text-slate-600">Valor total</span>
                                    <strong className="text-lg text-emerald-700">{currency.format(item.totalCost)}</strong>
                                </div>
                            </div>
                        </div>

                        {(item.hasAnomaly || item.rejectionReason) && (
                            <div className="flex gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-red-800">
                                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                                <div>
                                    <p className="text-sm font-bold">
                                        {item.rejectionReason ? 'Abastecimento rejeitado' : 'Anomalia detectada'}
                                    </p>
                                    <p className="mt-1 text-sm">
                                        {item.rejectionReason || 'O registro foi marcado para conferência pela prefeitura.'}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div>
                            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Comprovante</p>
                            {item.photoUrl ? (
                                <button
                                    type="button"
                                    onClick={() => setPhotoOpen(true)}
                                    className="block aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                                >
                                    <img
                                        src={item.photoUrl}
                                        alt={`Comprovante do abastecimento de ${item.plate}`}
                                        className="h-full w-full object-cover transition-transform hover:scale-105"
                                    />
                                </button>
                            ) : (
                                <p className="rounded-2xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">
                                    Nenhuma foto disponível.
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </Modal>
            <PhotoViewer
                images={photoOpen && item?.photoUrl ? [item.photoUrl] : undefined}
                startIndex={0}
                onClose={() => setPhotoOpen(false)}
            />
        </>
    );
}
