import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { SGFButton } from '@/components/sgf';
import { Camera, CheckCircle, Trash2 } from '@/components/sgf/icons';
import { WorkshopModalShell } from './WorkshopModalShell';
import { workshopPortalApi, type WorkshopContext, type WorkshopOrder } from '@/lib/workshop-portal-api';

interface FinishServiceModalProps {
    order: WorkshopOrder;
    context: WorkshopContext;
    onClose: () => void;
    onSuccess: () => void;
}

export function FinishServiceModal({ order, context, onClose, onSuccess }: FinishServiceModalProps) {
    const [note, setNote] = useState('');
    const [photos, setPhotos] = useState<File[]>([]);
    const [error, setError] = useState('');

    const mutation = useMutation({
        mutationFn: () => {
            if (!note.trim()) throw new Error('Descreva o serviço realizado.');
            if (photos.length === 0) throw new Error('Envie ao menos uma foto do serviço.');
            return workshopPortalApi.finishService({
                orderId: order.orderId,
                note,
                photos,
                tenantId: context.tenantId,
                repairShopId: context.repairShopId,
            });
        },
        onSuccess,
        onError: (reason) => setError(reason instanceof Error ? reason.message : 'Falha ao concluir serviço.'),
    });

    return (
        <WorkshopModalShell
            eyebrow="Conclusão do serviço"
            title={order.plate}
            subtitle="O veículo ficará marcado como pronto para retirada."
            busy={mutation.isPending}
            onClose={onClose}
            footer={(
                <>
                    <SGFButton variant="ghost" disabled={mutation.isPending} onClick={onClose}>Cancelar</SGFButton>
                    <SGFButton loading={mutation.isPending} icon={CheckCircle} onClick={() => {
                        setError('');
                        mutation.mutate();
                    }}>
                        Marcar como pronto
                    </SGFButton>
                </>
            )}
        >
            <div className="space-y-5">
                {error && <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-800">Serviço realizado</label>
                    <textarea value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)}
                        className="min-h-32 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[var(--sgf-primary)] focus:ring-4 focus:ring-emerald-500/10"
                        placeholder="Descreva peças trocadas, testes e resultado final" />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-800">Fotos do serviço (1 a 10)</label>
                    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 p-4 transition hover:border-blue-300 hover:bg-blue-50/50">
                        <Camera className="h-6 w-6 text-blue-600" />
                        <span className="text-sm font-semibold text-slate-700">Tirar ou selecionar fotos</span>
                        <input type="file" accept="image/*" capture="environment" multiple className="sr-only"
                            onChange={(event) => setPhotos((current) => [...current, ...Array.from(event.target.files ?? [])].slice(0, 10))} />
                    </label>
                    {photos.length > 0 && (
                        <ul className="mt-3 space-y-2">
                            {photos.map((photo) => (
                                <li key={`${photo.name}-${photo.lastModified}`} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                                    <span className="truncate text-slate-600">{photo.name}</span>
                                    <button type="button" aria-label={`Remover ${photo.name}`} onClick={() => setPhotos((current) => current.filter((item) => item !== photo))}
                                        className="rounded-full p-1 text-slate-400 hover:text-red-600">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </WorkshopModalShell>
    );
}
