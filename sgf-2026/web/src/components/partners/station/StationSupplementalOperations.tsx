import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFBadge, SGFButton, SGFCard, SGFInput } from '@/components/sgf';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Camera, CheckCircle, FileText } from '@/components/sgf/icons';
import { stationOperationsApi, type PendingStationOperation } from '@/lib/station-operations-api';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function StationSupplementalOperations({ tenantId, stationId }: { tenantId: string; stationId: string }) {
    const client = useQueryClient();
    const [selected, setSelected] = useState<PendingStationOperation | null>(null);
    const [quantity, setQuantity] = useState('');
    const [odometer, setOdometer] = useState('');
    const [receipt, setReceipt] = useState('');
    const [evidence, setEvidence] = useState<File | null>(null);
    const query = useQuery({
        queryKey: ['station-operations-pending'],
        queryFn: stationOperationsApi.getPending,
    });

    const activeSelected = selected
        ? query.data?.find((item) => item.operationId === selected.operationId) ?? null
        : null;
    const complete = useMutation({
        mutationFn: async () => {
            if (!activeSelected || !evidence) throw new Error('Preencha os dados e anexe a evidência.');
            return stationOperationsApi.complete({
                operation: activeSelected,
                quantity: Number(quantity),
                odometer: Number(odometer),
                receiptNumber: receipt.trim(),
                evidence,
                tenantId,
                stationId,
            });
        },
        onSuccess: (result) => {
            toast.success(`${result.protocol} registrado: ${money.format(result.totalCost)}.`);
            setSelected(null);
            setQuantity('');
            setOdometer('');
            setReceipt('');
            setEvidence(null);
            void client.invalidateQueries({ queryKey: ['station-operations-pending'] });
            void client.invalidateQueries({ queryKey: ['partner-contract-usage', 'posto'] });
        },
        onError: (error) => toast.error((error as Error).message),
    });
    const open = (row: PendingStationOperation) => {
        setSelected(row);
        setQuantity(String(row.authorizedQuantity));
    };
    const canSubmit = Boolean(
        activeSelected && Number(quantity) > 0 && Number(quantity) <= activeSelected.authorizedQuantity
        && Number(odometer) > 0 && receipt.trim() && evidence,
    );

    return (
        <>
            <SGFCard padding="none" className="mt-6 overflow-hidden">
                <div className="border-b border-slate-100 px-5 py-4">
                    <h3 className="font-bold text-slate-900">ARLA, lubrificantes e serviços autorizados</h3>
                    <p className="text-sm text-slate-500">Execução por protocolo, sem requisição em papel.</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                            <tr>
                                <th className="px-5 py-3">Protocolo</th>
                                <th className="px-5 py-3">Veículo</th>
                                <th className="px-5 py-3">Item</th>
                                <th className="px-5 py-3">Limite</th>
                                <th className="px-5 py-3">Validade</th>
                                <th className="px-5 py-3 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {(query.data ?? []).map((row) => (
                                <tr key={row.operationId}>
                                    <td className="px-5 py-4 font-mono text-xs font-bold">{row.protocol}</td>
                                    <td className="px-5 py-4"><strong>{row.plate}</strong><p className="text-xs text-slate-500">{row.brand} {row.model}</p></td>
                                    <td className="px-5 py-4"><strong>{row.itemName}</strong><p className="text-xs capitalize text-slate-500">{row.itemKind}</p></td>
                                    <td className="px-5 py-4">{row.authorizedQuantity} {row.unit}<p className="text-xs text-slate-500">{money.format(row.unitPrice)}/{row.unit}</p></td>
                                    <td className="px-5 py-4">{dateTime.format(new Date(row.expiresAt))}</td>
                                    <td className="px-5 py-4 text-right"><SGFButton size="sm" icon={CheckCircle} onClick={() => open(row)}>Registrar</SGFButton></td>
                                </tr>
                            ))}
                            {!query.isLoading && (query.data ?? []).length === 0 ? (
                                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500">Nenhum item complementar aguardando execução.</td></tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </SGFCard>
            <Modal
                isOpen={Boolean(activeSelected)}
                onClose={() => setSelected(null)}
                title={activeSelected ? `Registrar ${activeSelected.itemName}` : 'Registrar operação'}
                description={activeSelected?.protocol}
                size="lg"
                footer={<ModalFooter>
                    <SGFButton variant="ghost" onClick={() => setSelected(null)}>Cancelar</SGFButton>
                    <SGFButton disabled={!canSubmit || complete.isPending} loading={complete.isPending} onClick={() => complete.mutate()}>
                        Confirmar operação
                    </SGFButton>
                </ModalFooter>}
            >
                {activeSelected ? (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between rounded-2xl bg-emerald-50 p-4">
                            <div><p className="text-xs font-bold uppercase text-emerald-700">Preço contratual</p><strong>{money.format(activeSelected.unitPrice)}/{activeSelected.unit}</strong></div>
                            <SGFBadge variant="info">Até {activeSelected.authorizedQuantity} {activeSelected.unit}</SGFBadge>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <SGFInput label={`Quantidade (${activeSelected.unit})`} type="number" min="0.001" max={activeSelected.authorizedQuantity} step="0.001"
                                value={quantity} onChange={(event) => setQuantity(event.target.value)} fullWidth />
                            <SGFInput label="Hodômetro (km)" type="number" min="1" step="1"
                                value={odometer} onChange={(event) => setOdometer(event.target.value)} fullWidth />
                        </div>
                        <SGFInput label="Número do cupom ou comprovante" value={receipt} onChange={(event) => setReceipt(event.target.value)} fullWidth />
                        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 p-4 hover:border-emerald-300">
                            <span className="rounded-xl bg-slate-100 p-3 text-slate-500">{evidence ? <FileText className="h-5 w-5" /> : <Camera className="h-5 w-5" />}</span>
                            <span className="min-w-0"><strong className="block truncate text-sm">{evidence?.name ?? 'Anexar foto do comprovante/serviço'}</strong><small className="text-slate-500">Evidência obrigatória</small></span>
                            <input className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event) => setEvidence(event.target.files?.[0] ?? null)} />
                        </label>
                        <div className="rounded-2xl bg-slate-50 p-4 text-sm">
                            Total calculado: <strong>{money.format(Number(quantity || 0) * activeSelected.unitPrice)}</strong>
                        </div>
                    </div>
                ) : null}
            </Modal>
        </>
    );
}
