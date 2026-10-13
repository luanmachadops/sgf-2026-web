import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { SGFInput } from '@/components/sgf/SGFInput';
import { Modal } from '@/components/ui/Modal';
import { formatReportValue } from '@/lib/reports/format';
import { supabase } from '@/lib/supabase';
import { instrumentBudgetApi, type InstrumentBudget } from '@/lib/instrument-budget-api';
import type { Json } from '@/types/database.types';

export type LegacyReportRow = Record<string, string | number>;

export function LegacyReconciliationDialog({
    row,
    isOpen,
    onClose,
    onCompleted,
}: {
    row: LegacyReportRow | null;
    isOpen: boolean;
    onClose: () => void;
    onCompleted: () => void;
}) {
    const queryClient = useQueryClient();
    const [instrumentId, setInstrumentId] = useState('');
    const [allocationId, setAllocationId] = useState('');
    const [justification, setJustification] = useState('');
    const [documentLabel, setDocumentLabel] = useState('');
    const [documentUrl, setDocumentUrl] = useState('');
    const fiscalYear = Number(row?.fiscalYear ?? 0);
    const departmentId = String(row?.departmentId ?? '');
    const sourceType = String(row?.sourceType ?? '');
    const sourceId = String(row?.sourceId ?? '');
    const plansQuery = useQuery({
        queryKey: ['legacy-reconciliation-plans', fiscalYear, departmentId],
        enabled: isOpen && Boolean(row && fiscalYear && departmentId),
        queryFn: async () => {
            const plans: InstrumentBudget[] = [];
            for (let offset = 0; ; offset += 10) {
                const page = await instrumentBudgetApi.list(fiscalYear, undefined, offset);
                plans.push(...page.items);
                if (plans.length >= page.total || page.items.length === 0) break;
            }
            return plans.filter((plan) => plan.allocations.some((line) => line.department_id === departmentId));
        },
    });
    const selectedPlan = plansQuery.data?.find((plan) => plan.instrument_id === instrumentId);
    const allocations = selectedPlan?.allocations.filter((line) => line.department_id === departmentId) ?? [];
    const reconcile = useMutation({
        mutationFn: async () => {
            const { data, error } = await supabase.rpc('reconcile_procurement_legacy_entry', {
                p_source_type: sourceType,
                p_source_id: sourceId,
                p_instrument: instrumentId,
                p_allocation: allocationId,
                p_justification: justification.trim(),
                p_documents: [{ label: documentLabel.trim(), url: documentUrl.trim() }] as Json,
            });
            if (error) throw new Error(error.message);
            return data;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['report-dataset', 'procurement-legacy-reconciliation'] });
            void queryClient.invalidateQueries({ queryKey: ['report-dataset', 'procurement-fiscal-reconciliation'] });
            onCompleted();
        },
    });

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => { if (!reconcile.isPending) onClose(); }}
            title="Conciliar lançamento legado"
            description="A vinculação é imutável, exige justificativa e deixa evento na auditoria da licitação."
            size="lg"
        >
            <form
                className="space-y-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    reconcile.mutate();
                }}
            >
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-semibold">{String(row?.sourceLabel ?? sourceType)} · {String(row?.partner ?? '—')}{row?.vehicle && row.vehicle !== '—' ? ` · ${String(row.vehicle)}` : ''}</p>
                    <p className="mt-1">Exercício {fiscalYear} · Secretaria {String(row?.department ?? '—')} · Valor a conciliar {formatReportValue(row?.consumed, 'currency')}</p>
                    <p className="mt-1 break-all text-xs text-amber-800/80">Registro {sourceId}</p>
                </div>
                {plansQuery.isPending ? <p role="status">Carregando instrumentos e dotações…</p> : plansQuery.isError ? (
                    <p role="alert" className="text-sm text-red-700">Não foi possível carregar os planejamentos: {plansQuery.error.message}</p>
                ) : (
                    <>
                        <SGFSelect
                            fullWidth
                            label="Instrumento central"
                            value={instrumentId}
                            options={[
                                { value: '', label: 'Selecione a ata ou contrato' },
                                ...(plansQuery.data ?? []).map((plan) => ({
                                    value: plan.instrument_id,
                                    label: `${plan.kind === 'ata' ? 'Ata' : 'Contrato'} ${plan.reference} · ${plan.fiscal_year}`,
                                })),
                            ]}
                            onChange={(value) => { setInstrumentId(value); setAllocationId(''); }}
                        />
                        <SGFSelect
                            fullWidth
                            disabled={!instrumentId}
                            label="Dotação da mesma secretaria"
                            value={allocationId}
                            options={[
                                { value: '', label: 'Selecione a dotação' },
                                ...allocations.map((line) => ({
                                    value: line.id ?? '',
                                    label: `${line.category} · ${line.appropriation} · Fonte ${line.funding_source} · R$ ${line.spending_limit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                                })),
                            ]}
                            onChange={setAllocationId}
                        />
                    </>
                )}
                <SGFInput
                    fullWidth
                    required
                    minLength={3}
                    maxLength={1000}
                    label="Justificativa"
                    value={justification}
                    onChange={(event) => setJustification(event.target.value)}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                    <SGFInput
                        fullWidth
                        required
                        maxLength={120}
                        label="Documento de suporte"
                        value={documentLabel}
                        onChange={(event) => setDocumentLabel(event.target.value)}
                    />
                    <SGFInput
                        fullWidth
                        required
                        type="url"
                        placeholder="https://..."
                        label="Endereço HTTPS do documento"
                        value={documentUrl}
                        onChange={(event) => setDocumentUrl(event.target.value)}
                    />
                </div>
                {reconcile.isError && <p role="alert" className="text-sm text-red-700">{reconcile.error.message}</p>}
                <div className="flex justify-end gap-2">
                    <SGFButton type="button" variant="ghost" disabled={reconcile.isPending} onClick={onClose}>Cancelar</SGFButton>
                    <SGFButton type="submit" loading={reconcile.isPending} disabled={!instrumentId || !allocationId || !plansQuery.data?.length}>Registrar conciliação</SGFButton>
                </div>
            </form>
        </Modal>
    );
}
