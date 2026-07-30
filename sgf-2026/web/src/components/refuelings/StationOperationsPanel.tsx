import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFBadge, SGFButton, SGFCard, SGFInput, SGFSelect } from '@/components/sgf';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { FileText, Plus } from '@/components/sgf/icons';
import { stationsApi, vehiclesApi } from '@/lib/supabase-api';
import { useDrivers } from '@/hooks/useDrivers';
import { stationOperationsApi, type StationOperation } from '@/lib/station-operations-api';
import { formatCurrency, formatDate, formatPlate } from '@/lib/utils';

const statusLabels: Record<string, { label: string; variant: 'info' | 'warning' | 'success' | 'error' | 'default' }> = {
    autorizado: { label: 'Aguardando posto', variant: 'info' },
    concluido: { label: 'Aguardando validação', variant: 'warning' },
    validado: { label: 'Validado', variant: 'success' },
    rejeitado: { label: 'Rejeitado', variant: 'error' },
    cancelado: { label: 'Cancelado', variant: 'default' },
};

function defaultExpiry(): string {
    const value = new Date(Date.now() + 24 * 60 * 60 * 1000);
    value.setSeconds(0, 0);
    return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function StationOperationsPanel() {
    const client = useQueryClient();
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<StationOperation | null>(null);
    const [reason, setReason] = useState('');
    const [stationId, setStationId] = useState('');
    const [vehicleId, setVehicleId] = useState('');
    const [driverId, setDriverId] = useState('');
    const [itemId, setItemId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [expiresAt, setExpiresAt] = useState(defaultExpiry);
    const [note, setNote] = useState('');

    const operations = useQuery({
        queryKey: ['station-operations'],
        queryFn: stationOperationsApi.list,
    });
    const stations = useQuery({
        queryKey: ['stations', { activeOnly: false }],
        queryFn: () => stationsApi.getAll(),
    });
    const vehicles = useQuery({
        queryKey: ['vehicles', 'all'],
        queryFn: () => vehiclesApi.getAll(),
    });
    const { data: drivers = [] } = useDrivers({ status: 'ACTIVE' });
    const catalog = useQuery({
        queryKey: ['station-catalog', stationId],
        queryFn: () => stationOperationsApi.listCatalog(stationId),
        enabled: Boolean(stationId),
    });
    const items = useMemo(
        () => (catalog.data ?? []).filter((item) => item.kind !== 'combustivel' && item.unitPrice != null),
        [catalog.data],
    );
    const chosenItem = items.find((item) => item.itemId === itemId);

    const authorize = useMutation({
        mutationFn: () => stationOperationsApi.authorize({
            vehicleId,
            driverId,
            stationId,
            catalogItemId: itemId,
            quantity: Number(quantity),
            expiresAt: new Date(expiresAt).toISOString(),
            note: note.trim() || undefined,
        }),
        onSuccess: () => {
            toast.success('Autorização complementar enviada ao posto.');
            setOpen(false);
            setItemId('');
            setQuantity('');
            setNote('');
            void client.invalidateQueries({ queryKey: ['station-operations'] });
            void client.invalidateQueries({ queryKey: ['procurement'] });
        },
        onError: (error) => toast.error((error as Error).message),
    });
    const review = useMutation({
        mutationFn: (approved: boolean) => stationOperationsApi.review(
            selected?.operationId ?? '',
            approved,
            reason.trim() || undefined,
        ),
        onSuccess: () => {
            toast.success('Operação conferida.');
            setSelected(null);
            setReason('');
            void client.invalidateQueries({ queryKey: ['station-operations'] });
            void client.invalidateQueries({ queryKey: ['procurement'] });
        },
        onError: (error) => toast.error((error as Error).message),
    });

    const canAuthorize = Boolean(
        stationId && vehicleId && driverId && itemId
        && Number(quantity) > 0 && expiresAt,
    );

    return (
        <>
            <SGFCard padding="none" className="overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="font-bold text-slate-900">ARLA, lubrificantes e serviços do posto</h2>
                        <p className="text-sm text-slate-500">Itens contratados com autorização e protocolo digital.</p>
                    </div>
                    <SGFButton icon={Plus} onClick={() => setOpen(true)}>Autorizar item ou serviço</SGFButton>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[950px] text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                            <tr>
                                <th className="px-5 py-3">Protocolo</th>
                                <th className="px-5 py-3">Veículo</th>
                                <th className="px-5 py-3">Item</th>
                                <th className="px-5 py-3">Posto</th>
                                <th className="px-5 py-3 text-right">Quantidade</th>
                                <th className="px-5 py-3 text-right">Valor</th>
                                <th className="px-5 py-3">Situação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {(operations.data ?? []).map((row) => {
                                const status = statusLabels[row.status] ?? { label: row.status, variant: 'default' as const };
                                return (
                                    <tr key={row.operationId} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(row)}>
                                        <td className="px-5 py-4 font-mono text-xs font-bold text-slate-700">{row.protocol}</td>
                                        <td className="px-5 py-4">
                                            <strong className="text-slate-900">{formatPlate(row.plate)}</strong>
                                            <p className="text-xs text-slate-500">{row.vehicleName}</p>
                                        </td>
                                        <td className="px-5 py-4">
                                            <strong className="text-slate-900">{row.itemName}</strong>
                                            <p className="text-xs capitalize text-slate-500">{row.itemKind}</p>
                                        </td>
                                        <td className="px-5 py-4 text-slate-600">{row.stationName}</td>
                                        <td className="px-5 py-4 text-right">{row.quantity == null ? '—' : `${row.quantity} ${row.unit}`}</td>
                                        <td className="px-5 py-4 text-right font-semibold">{row.totalCost == null ? 'Reservado' : formatCurrency(row.totalCost)}</td>
                                        <td className="px-5 py-4"><SGFBadge variant={status.variant}>{status.label}</SGFBadge></td>
                                    </tr>
                                );
                            })}
                            {!operations.isLoading && (operations.data ?? []).length === 0 ? (
                                <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-500">Nenhuma operação complementar registrada.</td></tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </SGFCard>

            <Modal
                isOpen={open}
                onClose={() => setOpen(false)}
                title="Autorizar item ou serviço"
                description="O preço vem do catálogo da licitação e não pode ser alterado pelo posto."
                size="lg"
                footer={<ModalFooter>
                    <SGFButton variant="ghost" onClick={() => setOpen(false)}>Cancelar</SGFButton>
                    <SGFButton disabled={!canAuthorize || authorize.isPending} loading={authorize.isPending} onClick={() => authorize.mutate()}>
                        Enviar autorização
                    </SGFButton>
                </ModalFooter>}
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <SGFSelect label="Posto" value={stationId} onChange={(value) => { setStationId(value); setItemId(''); }}
                        options={[{ value: '', label: 'Selecione' }, ...(stations.data ?? []).map((row) => ({ value: row.id, label: row.name }))]} fullWidth />
                    <SGFSelect label="Item contratado" value={itemId} onChange={setItemId}
                        options={[{ value: '', label: stationId ? 'Selecione' : 'Escolha o posto' }, ...items.map((item) => ({
                            value: item.itemId,
                            label: `${item.name} · ${formatCurrency(item.unitPrice ?? 0)}/${item.unit}`,
                        }))]} fullWidth />
                    <SGFSelect label="Veículo" value={vehicleId} onChange={setVehicleId}
                        options={[{ value: '', label: 'Selecione' }, ...(vehicles.data ?? []).map((row) => ({
                            value: row.id, label: `${formatPlate(row.plate)} · ${row.brand ?? ''} ${row.model ?? ''}`,
                        }))]} fullWidth />
                    <SGFSelect label="Motorista responsável" value={driverId} onChange={setDriverId}
                        options={[{ value: '', label: 'Selecione' }, ...drivers.map((row) => ({
                            value: row.id, label: row.full_name,
                        }))]} fullWidth />
                    <SGFInput label={`Quantidade${chosenItem ? ` (${chosenItem.unit})` : ''}`} type="number" min="0.001" step="0.001"
                        value={quantity} onChange={(event) => setQuantity(event.target.value)} fullWidth />
                    <SGFInput label="Validade" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} fullWidth />
                    <div className="sm:col-span-2">
                        <SGFInput label="Observação" value={note} onChange={(event) => setNote(event.target.value)}
                            placeholder="Finalidade ou orientação para o posto" fullWidth />
                    </div>
                </div>
                {chosenItem ? (
                    <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
                        Reserva estimada: <strong>{formatCurrency(Number(quantity || 0) * (chosenItem.unitPrice ?? 0))}</strong>.
                    </div>
                ) : null}
            </Modal>

            <Modal
                isOpen={Boolean(selected)}
                onClose={() => { setSelected(null); setReason(''); }}
                title={selected?.protocol ?? 'Operação do posto'}
                size="lg"
                footer={<ModalFooter>
                    {selected?.status === 'concluido' ? (
                        <>
                            <SGFButton variant="danger" disabled={!reason.trim() || review.isPending} onClick={() => review.mutate(false)}>Rejeitar</SGFButton>
                            <SGFButton loading={review.isPending} onClick={() => review.mutate(true)}>Validar</SGFButton>
                        </>
                    ) : null}
                    <SGFButton variant="ghost" onClick={() => setSelected(null)}>Fechar</SGFButton>
                </ModalFooter>}
            >
                {selected ? (
                    <div className="space-y-4 text-sm">
                        <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
                            <p><span className="text-slate-500">Item:</span> <strong>{selected.itemName}</strong></p>
                            <p><span className="text-slate-500">Veículo:</span> <strong>{formatPlate(selected.plate)}</strong></p>
                            <p><span className="text-slate-500">Motorista:</span> <strong>{selected.driverName || '—'}</strong></p>
                            <p><span className="text-slate-500">Secretaria:</span> <strong>{selected.departmentName || '—'}</strong></p>
                            <p><span className="text-slate-500">Autorizado por:</span> <strong>{selected.authorizerName}</strong></p>
                            <p><span className="text-slate-500">Data:</span> <strong>{formatDate(selected.executedAt ?? selected.authorizedAt)}</strong></p>
                        </div>
                        {selected.evidencePath ? <p className="flex items-center gap-2 text-emerald-700"><FileText className="h-4 w-4" /> Evidência digital anexada</p> : null}
                        {selected.status === 'concluido' ? (
                            <SGFInput label="Parecer (obrigatório ao rejeitar)" value={reason} onChange={(event) => setReason(event.target.value)} fullWidth />
                        ) : null}
                    </div>
                ) : null}
            </Modal>
        </>
    );
}
