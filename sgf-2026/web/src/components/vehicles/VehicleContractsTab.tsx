import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { AlertTriangle, FileText, Loader2, Plus } from '@/components/sgf/icons';
import { rentalContractsApi, ownershipLabel, type RentalContract } from '@/lib/fleet-api';
import { daysUntil, formatDay } from '@/lib/dateOnly';
import { formatCurrency } from '@/lib/utils';

interface Props {
    vehicleId: string;
    ownership: string | null;
    canManage: boolean;
}

const EXPIRY_WARN_DAYS = 30;

function contractState(c: RentalContract): { label: string; variant: 'success' | 'warning' | 'error' | 'default'; days: number | null } {
    if (c.ended_at) return { label: 'Encerrado', variant: 'default', days: null };
    if (!c.end_date) return { label: 'Vigente (sem prazo)', variant: 'success', days: null };
    const days = daysUntil(c.end_date);
    if (days < 0) return { label: 'Vencido', variant: 'error', days };
    if (days <= EXPIRY_WARN_DAYS) return { label: days === 0 ? 'Vence hoje' : `Vence em ${days} dia(s)`, variant: 'warning', days };
    return { label: 'Vigente', variant: 'success', days };
}

export function VehicleContractsTab({ vehicleId, ownership, canManage }: Props) {
    const queryClient = useQueryClient();
    const [formOpen, setFormOpen] = useState(false);
    const [endingId, setEndingId] = useState<string | null>(null);

    const { data: contracts = [], isLoading, isError } = useQuery({
        queryKey: ['vehicle', vehicleId, 'rental-contracts'],
        queryFn: () => rentalContractsApi.getByVehicle(vehicleId),
    });

    const refresh = () => queryClient.invalidateQueries({ queryKey: ['vehicle', vehicleId, 'rental-contracts'] });

    const expiring = contracts.filter((c) => contractState(c).variant === 'warning' || (!c.ended_at && contractState(c).variant === 'error'));
    const isNonOwned = ownership && ownership !== 'proprio';

    return (
        <div className="space-y-4">
            {!isNonOwned && (
                <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
                    Este veículo está como <strong>{ownershipLabel(ownership)}</strong>. Contratos de locação costumam se aplicar a veículos locados, cedidos ou em comodato.
                </p>
            )}

            {expiring.map((c) => {
                const st = contractState(c);
                return (
                    <div key={c.id} className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                        <p>
                            Contrato <strong>{c.contract_number}</strong> ({c.supplier_name}) — {st.label.toLowerCase()}. Vigência até {formatDay(c.end_date)}.
                        </p>
                    </div>
                );
            })}

            <SGFCard
                title="Contratos de locação"
                icon={FileText}
            >
                {canManage && (
                    <div className="mb-4 flex justify-end">
                        <SGFButton size="sm" icon={Plus} onClick={() => setFormOpen(true)} className="!rounded-full">
                            Novo contrato
                        </SGFButton>
                    </div>
                )}

                {isLoading ? (
                    <div className="flex items-center justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                    </div>
                ) : isError ? (
                    <p className="py-6 text-center text-sm text-rose-600">Não foi possível carregar os contratos.</p>
                ) : contracts.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-400">Nenhum contrato cadastrado para este veículo.</p>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {contracts.map((c) => {
                            const st = contractState(c);
                            return (
                                <li key={c.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-bold text-slate-900">Contrato {c.contract_number}</p>
                                            <SGFBadge variant={st.variant} size="sm">{st.label}</SGFBadge>
                                        </div>
                                        <p className="text-sm text-slate-600">
                                            {c.supplier_name}{c.supplier_document ? ` · ${c.supplier_document}` : ''}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            Vigência: {formatDay(c.start_date)} até {c.end_date ? formatDay(c.end_date) : 'prazo indeterminado'}
                                            {c.monthly_value != null ? ` · ${formatCurrency(Number(c.monthly_value))}/mês` : ''}
                                            {c.km_franchise != null ? ` · franquia ${c.km_franchise.toLocaleString('pt-BR')} km` : ''}
                                        </p>
                                        {c.notes && <p className="text-xs text-slate-500">{c.notes}</p>}
                                        {c.ended_at && (
                                            <p className="text-xs text-slate-500">
                                                Encerrado em {formatDay(c.ended_at)}: {c.ended_reason}
                                            </p>
                                        )}
                                    </div>
                                    {canManage && !c.ended_at && (
                                        <SGFButton size="sm" variant="outline" onClick={() => setEndingId(c.id)} className="shrink-0 !rounded-full">
                                            Encerrar
                                        </SGFButton>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </SGFCard>

            <ContractFormModal
                isOpen={formOpen}
                vehicleId={vehicleId}
                onClose={() => setFormOpen(false)}
                onSaved={refresh}
            />
            <EndContractModal
                contractId={endingId}
                onClose={() => setEndingId(null)}
                onSaved={refresh}
            />
        </div>
    );
}

function ContractFormModal({ isOpen, vehicleId, onClose, onSaved }: {
    isOpen: boolean;
    vehicleId: string;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [supplierName, setSupplierName] = useState('');
    const [supplierDocument, setSupplierDocument] = useState('');
    const [contractNumber, setContractNumber] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [monthlyValue, setMonthlyValue] = useState('');
    const [kmFranchise, setKmFranchise] = useState('');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState<string | null>(null);

    const reset = () => {
        setSupplierName(''); setSupplierDocument(''); setContractNumber(''); setStartDate('');
        setEndDate(''); setMonthlyValue(''); setKmFranchise(''); setNotes(''); setError(null);
    };

    const mutation = useMutation({
        mutationFn: () => rentalContractsApi.create({
            vehicle_id: vehicleId,
            supplier_name: supplierName.trim(),
            supplier_document: supplierDocument.trim() || null,
            contract_number: contractNumber.trim(),
            start_date: startDate,
            end_date: endDate || null,
            monthly_value: monthlyValue ? Number(monthlyValue) : null,
            km_franchise: kmFranchise ? Math.round(Number(kmFranchise)) : null,
            notes: notes.trim() || null,
        }),
        onSuccess: () => {
            toast.success('Contrato cadastrado.');
            onSaved();
            reset();
            onClose();
        },
        onError: (e) => setError((e as Error).message || 'Não foi possível salvar o contrato.'),
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!supplierName.trim()) return setError('Informe o fornecedor.');
        if (!contractNumber.trim()) return setError('Informe o número do contrato.');
        if (!startDate) return setError('Informe o início da vigência.');
        if (endDate && endDate < startDate) return setError('O fim da vigência não pode ser anterior ao início.');
        if (monthlyValue && Number(monthlyValue) < 0) return setError('Valor mensal inválido.');
        if (kmFranchise && Number(kmFranchise) < 0) return setError('Franquia de km inválida.');
        mutation.mutate();
    };

    return (
        <Modal isOpen={isOpen} onClose={() => { reset(); onClose(); }} title="Novo contrato de locação" size="lg">
            <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <SGFInput label="Fornecedor" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} fullWidth />
                    <SGFInput label="CNPJ do fornecedor" value={supplierDocument} onChange={(e) => setSupplierDocument(e.target.value)} placeholder="Opcional" fullWidth />
                    <SGFInput label="Número do contrato" value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} fullWidth />
                    <SGFInput label="Valor mensal (R$)" type="number" step="0.01" min="0" value={monthlyValue} onChange={(e) => setMonthlyValue(e.target.value)} placeholder="Opcional" fullWidth />
                    <SGFInput label="Início da vigência" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} fullWidth />
                    <SGFInput label="Fim da vigência" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} hint="Vazio = prazo indeterminado" fullWidth />
                    <SGFInput label="Franquia de km (por mês)" type="number" min="0" value={kmFranchise} onChange={(e) => setKmFranchise(e.target.value)} placeholder="Opcional" fullWidth />
                </div>
                <SGFInput label="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" fullWidth />
                {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
                <ModalFooter>
                    <SGFButton type="button" variant="ghost" onClick={() => { reset(); onClose(); }}>Cancelar</SGFButton>
                    <SGFButton type="submit" disabled={mutation.isPending}>
                        {mutation.isPending ? 'Salvando...' : 'Salvar contrato'}
                    </SGFButton>
                </ModalFooter>
            </form>
        </Modal>
    );
}

function EndContractModal({ contractId, onClose, onSaved }: {
    contractId: string | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [reason, setReason] = useState('');
    const [error, setError] = useState<string | null>(null);

    const mutation = useMutation({
        mutationFn: () => rentalContractsApi.end(contractId!, reason),
        onSuccess: () => {
            toast.success('Contrato encerrado.');
            onSaved();
            setReason('');
            onClose();
        },
        onError: (e) => setError((e as Error).message || 'Não foi possível encerrar o contrato.'),
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (reason.trim().length < 5) return setError('Informe o motivo (mínimo de 5 caracteres).');
        mutation.mutate();
    };

    return (
        <Modal isOpen={Boolean(contractId)} onClose={onClose} title="Encerrar contrato" description="O contrato permanece no histórico; o encerramento não pode ser desfeito." size="md">
            <form onSubmit={submit} className="space-y-4">
                <SGFInput label="Motivo do encerramento" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth />
                {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
                <ModalFooter>
                    <SGFButton type="button" variant="ghost" onClick={onClose}>Cancelar</SGFButton>
                    <SGFButton type="submit" variant="danger" disabled={mutation.isPending}>
                        {mutation.isPending ? 'Encerrando...' : 'Encerrar contrato'}
                    </SGFButton>
                </ModalFooter>
            </form>
        </Modal>
    );
}
