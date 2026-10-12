import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFButton } from '@/components/sgf/SGFButton';
import { Plus, Save, Trash2 } from '@/components/sgf/icons';
import { DEFAULT_SIGNATURES, reportSettingsApi } from '@/lib/reports/reportSettingsApi';
import type { ReportSignature } from '@/lib/reports/types';

/** Assinaturas padrão impressas no fim dos relatórios em PDF (app_settings.report_signatures). */
export function ReportSignaturesEditor({ onSaved }: { onSaved?: () => void }) {
    const queryClient = useQueryClient();
    const query = useQuery({ queryKey: ['report-signatures'], queryFn: reportSettingsApi.getSignatures });
    const [edits, setEdits] = useState<ReportSignature[] | null>(null);
    const list = edits ?? query.data ?? DEFAULT_SIGNATURES;

    const save = useMutation({
        mutationFn: () => reportSettingsApi.saveSignatures(list),
        onSuccess: () => {
            toast.success('Assinaturas padrão salvas.');
            setEdits(null);
            void queryClient.invalidateQueries({ queryKey: ['report-signatures'] });
            onSaved?.();
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : 'Não foi possível salvar.'),
    });

    const update = (index: number, patch: Partial<ReportSignature>) =>
        setEdits(list.map((item, i) => (i === index ? { ...item, ...patch } : item)));

    if (query.isPending) return <p role="status" className="text-sm text-slate-400">Carregando…</p>;
    if (query.isError) return <p role="alert" className="text-sm text-red-600">Não foi possível carregar as assinaturas.</p>;

    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-500">
                Saem no fim dos relatórios marcados com assinatura (Boletim de Tráfego, Consolidado por Secretaria,
                fechamentos fiscais), com local e data. Deixe o nome em branco para imprimir só a linha e o cargo.
            </p>
            <div className="space-y-3">
                {list.map((signature, index) => (
                    <div key={index} className="flex gap-2 rounded-xl border border-slate-200 p-3">
                        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                            <input
                                value={signature.name}
                                maxLength={80}
                                onChange={(event) => update(index, { name: event.target.value })}
                                placeholder="Nome (opcional)"
                                aria-label={`Nome da assinatura ${index + 1}`}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[var(--sgf-primary)] focus:outline-none"
                            />
                            <input
                                value={signature.role}
                                maxLength={80}
                                onChange={(event) => update(index, { role: event.target.value })}
                                placeholder="Cargo"
                                aria-label={`Cargo da assinatura ${index + 1}`}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[var(--sgf-primary)] focus:outline-none"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setEdits(list.filter((_, i) => i !== index))}
                            className="self-center rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                            aria-label={`Remover assinatura ${index + 1}`}
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                ))}
            </div>
            <div className="flex flex-wrap justify-between gap-2">
                {list.length < 6 ? (
                    <SGFButton size="sm" variant="ghost" icon={Plus} onClick={() => setEdits([...list, { name: '', role: '' }])}>
                        Adicionar assinatura
                    </SGFButton>
                ) : <span />}
                <SGFButton size="sm" icon={Save} loading={save.isPending} disabled={!edits} onClick={() => save.mutate()}>
                    Salvar
                </SGFButton>
            </div>
        </div>
    );
}
