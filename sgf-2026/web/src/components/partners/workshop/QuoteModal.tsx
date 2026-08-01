import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { SGFButton, SGFInput } from '@/components/sgf';
import { Plus, Trash2 } from '@/components/sgf/icons';
import { WorkshopModalShell } from './WorkshopModalShell';
import {
    workshopPortalApi,
    type WorkshopOrder,
    type WorkshopQuoteItem,
} from '@/lib/workshop-portal-api';

interface QuoteModalProps {
    order: WorkshopOrder;
    onClose: () => void;
    onSuccess: () => void;
}

interface EditableItem extends WorkshopQuoteItem {
    key: string;
    qtyText: string;
    priceText: string;
}

function emptyItem(kind: WorkshopQuoteItem['kind'] = 'peca'): EditableItem {
    return {
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        kind,
        description: '',
        qty: 1,
        unitPrice: 0,
        qtyText: '1',
        priceText: '',
    };
}

export function QuoteModal({ order, onClose, onSuccess }: QuoteModalProps) {
    const [items, setItems] = useState<EditableItem[]>(() => [emptyItem()]);
    const [validUntil, setValidUntil] = useState('');
    const [note, setNote] = useState('');
    const [error, setError] = useState('');

    const total = useMemo(
        () => items.reduce((sum, item) => {
            const qty = Number(item.qtyText.replace(',', '.'));
            const price = Number(item.priceText.replace(',', '.'));
            return sum + (Number.isFinite(qty) && Number.isFinite(price) ? qty * price : 0);
        }, 0),
        [items],
    );

    const mutation = useMutation({
        mutationFn: () => {
            const normalized = items.map((item) => ({
                kind: item.kind,
                description: item.description.trim(),
                qty: Number(item.qtyText.replace(',', '.')),
                unitPrice: Number(item.priceText.replace(',', '.')),
            }));
            if (normalized.some((item) => !item.description)) throw new Error('Descreva todos os itens.');
            if (normalized.some((item) => !Number.isFinite(item.qty) || item.qty <= 0)) throw new Error('Revise as quantidades.');
            if (normalized.some((item) => !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) throw new Error('Revise os preços unitários.');
            if (!validUntil) throw new Error('Informe a validade do orçamento.');
            if (validUntil < new Date().toISOString().slice(0, 10)) {
                throw new Error('A validade do orçamento não pode estar no passado.');
            }
            return workshopPortalApi.submitQuote({
                orderId: order.orderId,
                items: normalized,
                validUntil,
                note,
            });
        },
        onSuccess,
        onError: (reason) => setError(reason instanceof Error ? reason.message : 'Falha ao enviar orçamento.'),
    });

    const update = (key: string, patch: Partial<EditableItem>) => {
        setItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
    };

    return (
        <WorkshopModalShell
            eyebrow="Orçamento"
            title={`OS · ${order.plate}`}
            subtitle={`${order.brand} ${order.model}`}
            busy={mutation.isPending}
            onClose={onClose}
            maxWidthClass="sm:max-w-3xl"
            footer={(
                <>
                    <SGFButton variant="ghost" disabled={mutation.isPending} onClick={onClose}>Cancelar</SGFButton>
                    <SGFButton loading={mutation.isPending} onClick={() => {
                        setError('');
                        mutation.mutate();
                    }}>
                        Enviar orçamento
                    </SGFButton>
                </>
            )}
        >
            <div className="space-y-4">
                {error && <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
                {items.map((item, index) => (
                    <div key={item.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Item {index + 1}</p>
                            {items.length > 1 && (
                                <button type="button" aria-label={`Remover item ${index + 1}`} onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))}
                                    className="rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        <div className="grid gap-3 md:grid-cols-[160px_1fr]">
                            <div>
                                <label className="mb-2 block text-sm font-semibold text-slate-800">Tipo</label>
                                <select value={item.kind} onChange={(event) => update(item.key, { kind: event.target.value as WorkshopQuoteItem['kind'] })}
                                    className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--sgf-primary)] focus:ring-4 focus:ring-emerald-500/10">
                                    <option value="peca">Peça</option>
                                    <option value="mao_de_obra">Mão de obra</option>
                                </select>
                            </div>
                            <SGFInput label="Descrição" value={item.description} maxLength={500}
                                onChange={(event) => update(item.key, { description: event.target.value })}
                                placeholder="Serviço ou material" fullWidth />
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <SGFInput label="Quantidade" type="number" min="0.01" step="0.01" value={item.qtyText}
                                onChange={(event) => update(item.key, { qtyText: event.target.value })} fullWidth />
                            <SGFInput label="Valor unitário (R$)" type="number" min="0" step="0.01" value={item.priceText}
                                onChange={(event) => update(item.key, { priceText: event.target.value })}
                                placeholder="0,00" fullWidth />
                        </div>
                    </div>
                ))}

                <SGFButton variant="outline" size="sm" icon={Plus} onClick={() => setItems((current) => [...current, emptyItem('mao_de_obra')])}>
                    Adicionar item
                </SGFButton>

                <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <SGFInput label="Válido até *" type="date" required min={new Date().toISOString().slice(0, 10)}
                        value={validUntil} onChange={(event) => setValidUntil(event.target.value)} fullWidth />
                    <div className="flex min-h-12 items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-white px-4 py-3 sm:min-w-64">
                        <p className="text-sm font-bold text-slate-700">Valor total</p>
                        <p className="text-xl font-black text-blue-950">
                            {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                    </div>
                </div>

                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-800">Observações</label>
                    <textarea value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)}
                        className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[var(--sgf-primary)] focus:ring-4 focus:ring-emerald-500/10"
                        placeholder="Garantia, prazo de entrega ou condições" />
                </div>
            </div>
        </WorkshopModalShell>
    );
}
