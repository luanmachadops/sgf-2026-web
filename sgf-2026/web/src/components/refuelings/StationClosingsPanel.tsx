import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFBadge, SGFButton, SGFCard, SGFInput, SGFSelect } from '@/components/sgf';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { CheckCircle, FileText, Receipt } from '@/components/sgf/icons';
import { stationClosingApi, type StationClosing } from '@/lib/station-closing-api';
import { stationsApi } from '@/lib/supabase-api';
import { formatCurrency, formatDate } from '@/lib/utils';

export function StationClosingsPanel() {
    const client = useQueryClient();
    const [selected, setSelected] = useState<StationClosing | null>(null);
    const [note, setNote] = useState('');
    const [commitmentId, setCommitmentId] = useState('');
    const [paymentDate, setPaymentDate] = useState('');
    const [commitmentOpen, setCommitmentOpen] = useState(false);
    const [commitmentForm, setCommitmentForm] = useState({
        stationId: '', number: '', nad: '', amount: '', issuedOn: '',
        validFrom: '', validUntil: '',
    });
    const [commitmentFile, setCommitmentFile] = useState<File | null>(null);
    const closings = useQuery({ queryKey: ['station-closing-register'], queryFn: stationClosingApi.list });
    const stations = useQuery({ queryKey: ['stations', { activeOnly: false }], queryFn: () => stationsApi.getAll() });
    const dashboard = useQuery({ queryKey: ['station-fiscal-dashboard'], queryFn: stationClosingApi.dashboard });
    const commitments = useQuery({
        queryKey: ['station-commitments', selected?.stationId],
        queryFn: () => stationClosingApi.listCommitments(selected?.stationId ?? ''),
        enabled: Boolean(selected?.stationId),
    });
    const refresh = () => {
        void client.invalidateQueries({ queryKey: ['station-closing-register'] });
        void client.invalidateQueries({ queryKey: ['station-fiscal-dashboard'] });
        setSelected(null); setNote(''); setCommitmentId(''); setPaymentDate('');
    };
    const action = useMutation({
        mutationFn: async (kind: 'approve' | 'return' | 'link' | 'attest' | 'schedule') => {
            if (!selected) return;
            if (kind === 'approve') await stationClosingApi.review(selected.closingId, true, note);
            if (kind === 'return') await stationClosingApi.review(selected.closingId, false, note);
            if (kind === 'link') await stationClosingApi.linkCommitment(selected.closingId, commitmentId);
            if (kind === 'attest' && selected.invoiceId) await stationClosingApi.attest(selected.invoiceId);
            if (kind === 'schedule') await stationClosingApi.schedulePayment(selected.closingId, selected.totalAmount - selected.paidAmount, paymentDate);
        },
        onSuccess: () => { toast.success('Fluxo fiscal atualizado.'); refresh(); },
        onError: (error) => toast.error((error as Error).message),
    });
    const registerCommitment = useMutation({
        mutationFn: () => {
            if (!commitmentFile) throw new Error('Anexe a nota de empenho.');
            return stationClosingApi.registerCommitment({
                stationId: commitmentForm.stationId, number: commitmentForm.number,
                nad: commitmentForm.nad, amount: Number(commitmentForm.amount),
                issuedOn: commitmentForm.issuedOn, validFrom: commitmentForm.validFrom,
                validUntil: commitmentForm.validUntil, file: commitmentFile,
            });
        },
        onSuccess: () => {
            toast.success('Empenho prévio cadastrado.');
            setCommitmentOpen(false);
            void client.invalidateQueries({ queryKey: ['station-commitments'] });
        },
        onError: (error) => toast.error((error as Error).message),
    });
    const totals = (dashboard.data ?? []).reduce((a, row) => ({
        review: a.review + row.pendingReview,
        fiscal: a.fiscal + row.pendingCommitment + row.pendingInvoice + row.pendingAttestation,
        payment: a.payment + row.pendingPayment,
        open: a.open + row.openAmount,
    }), { review: 0, fiscal: 0, payment: 0, open: 0 });
    return (
        <>
            <SGFCard padding="none" className="overflow-hidden">
                <div className="border-b border-slate-100 px-5 py-4">
                    <div className="float-right"><SGFButton size="sm" onClick={() => setCommitmentOpen(true)}>Cadastrar empenho/NAD</SGFButton></div>
                    <h2 className="font-bold text-slate-900">Fechamentos fiscais dos postos</h2>
                    <p className="text-sm text-slate-500">Conferência, empenho prévio, nota fiscal, ateste e pagamento.</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <SGFBadge variant="warning">{totals.review} aguardando conferência</SGFBadge>
                        <SGFBadge variant="info">{totals.fiscal} em trâmite fiscal</SGFBadge>
                        <SGFBadge variant="default">{totals.payment} aguardando pagamento</SGFBadge>
                        <SGFBadge variant="success">Saldo aberto {formatCurrency(totals.open)}</SGFBadge>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px] text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                            <tr><th className="px-5 py-3">Protocolo</th><th className="px-5 py-3">Posto</th><th className="px-5 py-3">Competência</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3">Fechamento</th><th className="px-5 py-3">Fiscal</th><th className="px-5 py-3">Empenho/NF</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {(closings.data ?? []).map((row) => (
                                <tr key={row.closingId} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(row)}>
                                    <td className="px-5 py-4 font-mono text-xs font-bold">{row.protocol}</td>
                                    <td className="px-5 py-4 font-semibold">{row.stationName}</td>
                                    <td className="px-5 py-4">{formatDate(`${row.competence}T12:00:00`)}</td>
                                    <td className="px-5 py-4 text-right font-bold">{formatCurrency(row.totalAmount)}</td>
                                    <td className="px-5 py-4"><SGFBadge variant={row.closingStatus === 'aprovado' ? 'success' : row.closingStatus === 'enviado' ? 'warning' : 'default'}>{row.closingStatus}</SGFBadge></td>
                                    <td className="px-5 py-4 capitalize">{row.fiscalStatus.replaceAll('_', ' ')}</td>
                                    <td className="px-5 py-4 text-xs">{row.commitmentNumber ?? '—'} / {row.invoiceNumber ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </SGFCard>
            <Modal isOpen={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.protocol ?? 'Fechamento'} size="lg"
                footer={<ModalFooter>
                    {selected?.closingStatus === 'enviado' ? <>
                        <SGFButton variant="danger" disabled={!note.trim()} onClick={() => action.mutate('return')}>Devolver</SGFButton>
                        <SGFButton onClick={() => action.mutate('approve')}>Aprovar conferência</SGFButton>
                    </> : null}
                    {selected?.closingStatus === 'aprovado' && selected.fiscalStatus === 'aguardando_empenho' ? <SGFButton disabled={!commitmentId} onClick={() => action.mutate('link')}>Vincular empenho prévio</SGFButton> : null}
                    {selected?.fiscalStatus === 'nota_enviada' && selected.invoiceId ? <SGFButton icon={CheckCircle} onClick={() => action.mutate('attest')}>Atestar NF</SGFButton> : null}
                    {selected?.fiscalStatus === 'atestado' ? <SGFButton disabled={!paymentDate} onClick={() => action.mutate('schedule')}>Programar pagamento</SGFButton> : null}
                    <SGFButton variant="ghost" onClick={() => setSelected(null)}>Fechar</SGFButton>
                </ModalFooter>}>
                {selected ? <div className="space-y-4">
                    <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
                        <p><span className="text-slate-500">Registros:</span> <strong>{selected.recordCount}</strong></p>
                        <p><span className="text-slate-500">Valor:</span> <strong>{formatCurrency(selected.totalAmount)}</strong></p>
                        <p className="sm:col-span-2 break-all text-xs"><span className="text-slate-500">SHA-256:</span> <strong>{selected.snapshotHash}</strong></p>
                    </div>
                    {selected.closingStatus === 'enviado' ? <SGFInput label="Parecer (obrigatório ao devolver)" value={note} onChange={(event) => setNote(event.target.value)} fullWidth /> : null}
                    {selected.closingStatus === 'aprovado' && selected.fiscalStatus === 'aguardando_empenho' ? <SGFSelect label="Empenho emitido antes do fornecimento" value={commitmentId} onChange={setCommitmentId}
                        options={[{ value: '', label: 'Selecione' }, ...(commitments.data ?? []).filter((c) => c.status === 'ativo').map((c) => ({ value: c.commitment_id, label: `${c.commitment_number} · saldo ${formatCurrency(c.available_amount)}` }))]} fullWidth /> : null}
                    {selected.fiscalStatus === 'atestado' ? <SGFInput label="Data programada do pagamento" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} fullWidth /> : null}
                    <p className="flex gap-2 text-sm text-slate-500"><FileText className="h-4 w-4" /> Relatório auditável disponível pelo protocolo.</p>
                    <p className="flex gap-2 text-sm text-slate-500"><Receipt className="h-4 w-4" /> NF: {selected.invoiceNumber ?? 'aguardando'}</p>
                </div> : null}
            </Modal>
            <Modal isOpen={commitmentOpen} onClose={() => setCommitmentOpen(false)} title="Cadastrar empenho prévio" size="lg"
                footer={<ModalFooter><SGFButton variant="ghost" onClick={() => setCommitmentOpen(false)}>Cancelar</SGFButton><SGFButton loading={registerCommitment.isPending} onClick={() => registerCommitment.mutate()}>Salvar empenho</SGFButton></ModalFooter>}>
                <div className="grid gap-4 sm:grid-cols-2">
                    <SGFSelect label="Posto" value={commitmentForm.stationId} onChange={(value) => setCommitmentForm((f) => ({ ...f, stationId: value }))}
                        options={[{ value: '', label: 'Selecione' }, ...(stations.data ?? []).map((station) => ({ value: station.id, label: station.name }))]} fullWidth />
                    <SGFInput label="Número do empenho" value={commitmentForm.number} onChange={(e) => setCommitmentForm((f) => ({ ...f, number: e.target.value }))} fullWidth />
                    <SGFInput label="Número da NAD" value={commitmentForm.nad} onChange={(e) => setCommitmentForm((f) => ({ ...f, nad: e.target.value }))} fullWidth />
                    <SGFInput label="Valor (R$)" type="number" min="0.01" step="0.01" value={commitmentForm.amount} onChange={(e) => setCommitmentForm((f) => ({ ...f, amount: e.target.value }))} fullWidth />
                    <SGFInput label="Emissão" type="date" value={commitmentForm.issuedOn} onChange={(e) => setCommitmentForm((f) => ({ ...f, issuedOn: e.target.value }))} fullWidth />
                    <SGFInput label="Início da cobertura" type="date" value={commitmentForm.validFrom} onChange={(e) => setCommitmentForm((f) => ({ ...f, validFrom: e.target.value }))} fullWidth />
                    <SGFInput label="Fim da cobertura" type="date" value={commitmentForm.validUntil} onChange={(e) => setCommitmentForm((f) => ({ ...f, validUntil: e.target.value }))} fullWidth />
                    <label className="self-end rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm"><span className="block truncate">{commitmentFile?.name ?? 'Anexar nota de empenho'}</span><input className="sr-only" type="file" accept="application/pdf,image/*" onChange={(e) => setCommitmentFile(e.target.files?.[0] ?? null)} /></label>
                </div>
                <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">O início da cobertura deve ser posterior ou igual à emissão e anterior ao primeiro fornecimento.</p>
            </Modal>
        </>
    );
}
