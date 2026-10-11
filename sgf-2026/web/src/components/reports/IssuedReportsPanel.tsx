import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFTextarea } from '@/components/sgf/SGFTextarea';
import { Modal } from '@/components/ui/Modal';
import { Copy, ExternalLink, ShieldCheck } from '@/components/sgf/icons';
import { useAuth } from '@/contexts/AuthContext';
import { formatVerificationCode } from '@/lib/reportIntegrity';
import { reportSnapshotsApi, type ReportSnapshotRow } from '@/lib/report-snapshots-api';

const SIGNER_ROLES = new Set(['admin', 'gestor']);

function formatDateTime(value: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

function formatPeriod(row: ReportSnapshotRow): string {
    const format = (value: string | null) => {
        if (!value) return null;
        const date = new Date(`${value}T00:00:00`);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
    };
    const from = format(row.periodStart);
    const to = format(row.periodEnd);
    if (from && to) return `${from} a ${to}`;
    return from ?? to ?? 'Todo o período';
}

/** Lista os relatórios emitidos pelo órgão e permite a assinatura eletrônica simples. */
export function IssuedReportsPanel() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const canSign = SIGNER_ROLES.has(user?.accountRole ?? '');
    const [signing, setSigning] = useState<ReportSnapshotRow | null>(null);
    const [note, setNote] = useState('');

    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: ['report-snapshots'],
        queryFn: () => reportSnapshotsApi.list(100),
        staleTime: 60 * 1000,
    });

    const sign = useMutation({
        mutationFn: (row: ReportSnapshotRow) => reportSnapshotsApi.sign(row.id, note),
        onSuccess: () => {
            toast.success('Relatório assinado eletronicamente.');
            setSigning(null);
            setNote('');
            void queryClient.invalidateQueries({ queryKey: ['report-snapshots'] });
        },
        onError: (mutationError: Error) => {
            toast.error(mutationError.message || 'Não foi possível assinar o relatório.');
        },
    });

    const copyLink = async (row: ReportSnapshotRow) => {
        const url = `${window.location.origin}/verificar/${formatVerificationCode(row.verificationCode)}`;
        try {
            await navigator.clipboard.writeText(url);
            toast.success('Link de verificação copiado.');
        } catch {
            toast.error('Não foi possível copiar o link.');
        }
    };

    const rows = data ?? [];

    return (
        <SGFCard padding="lg" className="border border-slate-200/80">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                    <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-slate-900">Relatórios emitidos</h3>
                    <p className="text-sm text-slate-500">
                        Cada exportação recebe um código de verificação público. A assinatura eletrônica registra o
                        responsável, a data e a hora.
                    </p>
                </div>
            </div>

            <div className="mt-4">
                {isLoading ? (
                    <p role="status" className="py-8 text-center text-sm text-slate-400">Carregando relatórios emitidos…</p>
                ) : isError ? (
                    <div role="alert" className="py-8 text-center text-sm text-red-600">
                        Não foi possível carregar os relatórios emitidos: {error instanceof Error ? error.message : 'tente novamente.'}
                        <div className="mt-3">
                            <SGFButton size="sm" variant="secondary" onClick={() => void refetch()}>Tentar novamente</SGFButton>
                        </div>
                    </div>
                ) : rows.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-8 text-center text-sm font-medium text-slate-400">
                        Nenhum relatório emitido ainda. Exporte um relatório para registrá-lo aqui.
                    </p>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                                    <th className="px-3 py-2.5 font-bold">Relatório</th>
                                    <th className="px-3 py-2.5 font-bold">Período</th>
                                    <th className="px-3 py-2.5 font-bold">Código</th>
                                    <th className="px-3 py-2.5 font-bold">Gerado por / em</th>
                                    <th className="px-3 py-2.5 font-bold">Assinado</th>
                                    <th className="px-3 py-2.5 font-bold text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {rows.map((row) => {
                                    const code = formatVerificationCode(row.verificationCode);
                                    return (
                                        <tr key={row.id} className="align-top">
                                            <td className="px-3 py-2.5 font-semibold text-slate-800">{row.title}</td>
                                            <td className="px-3 py-2.5 text-slate-600">{formatPeriod(row)}</td>
                                            <td className="px-3 py-2.5 font-mono text-xs text-slate-700">{code}</td>
                                            <td className="px-3 py-2.5 text-slate-600">
                                                {row.generatedByName ?? '—'}
                                                <div className="text-xs text-slate-400">{formatDateTime(row.generatedAt)}</div>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                {row.signedAt ? (
                                                    <>
                                                        <SGFBadge variant="success" size="sm">Sim</SGFBadge>
                                                        <div className="mt-1 text-xs text-slate-500">
                                                            {row.signedByName ?? '—'} · {formatDateTime(row.signedAt)}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <SGFBadge variant="warning" size="sm">Não</SGFBadge>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <div className="flex flex-wrap justify-end gap-2">
                                                    <SGFButton size="sm" variant="ghost" icon={Copy} onClick={() => void copyLink(row)}>
                                                        Link
                                                    </SGFButton>
                                                    <a
                                                        href={`/verificar/${code}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                                                    >
                                                        <ExternalLink className="h-4 w-4" />
                                                        Verificar
                                                    </a>
                                                    {canSign && !row.signedAt && (
                                                        <SGFButton
                                                            size="sm"
                                                            variant="secondary"
                                                            onClick={() => { setNote(''); setSigning(row); }}
                                                        >
                                                            Assinar eletronicamente
                                                        </SGFButton>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Modal
                isOpen={signing !== null}
                onClose={() => { if (!sign.isPending) setSigning(null); }}
                title="Assinar relatório eletronicamente"
                description={signing ? `${signing.title} · código ${formatVerificationCode(signing.verificationCode)}` : undefined}
                size="md"
            >
                <div className="space-y-4">
                    <p className="text-sm text-slate-600">
                        Ao confirmar, serão registrados o seu nome, a data e a hora como responsável por este
                        relatório. É uma assinatura eletrônica simples (Lei 14.063/2020, art. 4º, I), feita uma única
                        vez e que não pode ser desfeita.
                    </p>
                    <SGFTextarea
                        fullWidth
                        label="Observação (opcional)"
                        hint="Ex.: cargo ou portaria de designação."
                        maxLength={500}
                        showCount
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                        <SGFButton variant="ghost" disabled={sign.isPending} onClick={() => setSigning(null)}>
                            Cancelar
                        </SGFButton>
                        <SGFButton
                            loading={sign.isPending}
                            onClick={() => { if (signing) sign.mutate(signing); }}
                        >
                            Confirmar assinatura
                        </SGFButton>
                    </div>
                </div>
            </Modal>
        </SGFCard>
    );
}

export default IssuedReportsPanel;
