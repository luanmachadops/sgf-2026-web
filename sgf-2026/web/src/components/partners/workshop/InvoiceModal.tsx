import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { SGFButton, SGFInput } from '@/components/sgf';
import { FileText } from '@/components/sgf/icons';
import { WorkshopModalShell } from './WorkshopModalShell';
import { workshopPortalApi, type WorkshopContext, type WorkshopOrder } from '@/lib/workshop-portal-api';

interface InvoiceModalProps {
    order: WorkshopOrder;
    context: WorkshopContext;
    onClose: () => void;
    onSuccess: () => void;
}

export function InvoiceModal({ order, context, onClose, onSuccess }: InvoiceModalProps) {
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [amount, setAmount] = useState('');
    const [issuedAt, setIssuedAt] = useState(new Date().toISOString().slice(0, 10));
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState('');

    const mutation = useMutation({
        mutationFn: () => {
            const numericAmount = Number(amount.replace(',', '.'));
            if (!invoiceNumber.trim()) throw new Error('Informe o número da nota fiscal.');
            if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new Error('Informe um valor válido.');
            if (!file) throw new Error('Anexe a nota fiscal em PDF ou imagem.');
            return workshopPortalApi.submitInvoice({
                orderId: order.orderId,
                invoiceNumber,
                amount: numericAmount,
                issuedAt,
                file,
                tenantId: context.tenantId,
                repairShopId: context.repairShopId,
            });
        },
        onSuccess,
        onError: (reason) => setError(reason instanceof Error ? reason.message : 'Falha ao enviar nota fiscal.'),
    });

    return (
        <WorkshopModalShell
            eyebrow="Faturamento"
            title={`Nota fiscal · ${order.plate}`}
            subtitle={`Empenho: ${order.commitmentNumber || 'não informado'}`}
            busy={mutation.isPending}
            onClose={onClose}
            footer={(
                <>
                    <SGFButton variant="ghost" disabled={mutation.isPending} onClick={onClose}>Cancelar</SGFButton>
                    <SGFButton loading={mutation.isPending} icon={FileText} onClick={() => {
                        setError('');
                        mutation.mutate();
                    }}>
                        Enviar nota fiscal
                    </SGFButton>
                </>
            )}
        >
            <div className="space-y-5">
                {error && <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
                {!order.commitmentNumber && (
                    <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">
                        A prefeitura ainda não informou o número do empenho. A nota não deve ser emitida antes disso.
                    </p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                    <SGFInput label="Número da NF" value={invoiceNumber} maxLength={100}
                        onChange={(event) => setInvoiceNumber(event.target.value)} fullWidth />
                    <SGFInput label="Data de emissão" type="date" value={issuedAt}
                        onChange={(event) => setIssuedAt(event.target.value)} fullWidth />
                </div>
                <SGFInput label="Valor da NF (R$)" type="number" min="0.01" step="0.01" value={amount}
                    onChange={(event) => setAmount(event.target.value)} placeholder="0,00" fullWidth />
                <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed p-4 transition ${
                    file ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/50'
                }`}>
                    <FileText className={`h-6 w-6 ${file ? 'text-emerald-600' : 'text-blue-600'}`} />
                    <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-700">{file?.name || 'Selecionar PDF ou imagem da NF'}</span>
                        <span className="text-xs text-slate-500">Arquivo privado, disponível apenas para o processo</span>
                    </span>
                    <input type="file" accept="application/pdf,image/*" className="sr-only"
                        onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                </label>
            </div>
        </WorkshopModalShell>
    );
}
