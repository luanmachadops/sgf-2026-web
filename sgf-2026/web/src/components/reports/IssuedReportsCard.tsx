import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFCard } from '@/components/sgf/SGFCard';
import { CheckCircle, ShieldCheck } from '@/components/sgf/icons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { formatVerificationCode } from '@/lib/reports/verification';

const PAGE_SIZE = 8;

interface IssuedReport {
    id: string;
    title: string;
    generated_at: string;
    row_count: number | null;
    verification_code: string;
    signed_at: string | null;
}

/**
 * Relatórios registrados (report_snapshots): cada PDF baixado ou impresso pelo
 * painel ganha um código público de verificação. Admin/gestor podem assinar
 * eletronicamente — a assinatura aparece na página pública de conferência.
 */
export function IssuedReportsCard() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [page, setPage] = useState(0);
    const canSign = ['admin', 'gestor', 'superadmin'].includes(user?.accountRole ?? '');

    const query = useQuery({
        queryKey: ['report-snapshots', page],
        queryFn: async () => {
            const { data, error, count } = await supabase
                .from('report_snapshots')
                .select('id, title, generated_at, row_count, verification_code, signed_at', { count: 'exact' })
                .order('generated_at', { ascending: false })
                .order('id', { ascending: true })
                .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
            if (error) throw new Error(error.message);
            return { items: (data ?? []) as IssuedReport[], total: count ?? 0 };
        },
    });

    const sign = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.rpc('sign_report_snapshot', { p_id: id });
            if (error) throw new Error(error.message);
        },
        onSuccess: () => {
            toast.success('Relatório assinado eletronicamente.');
            void queryClient.invalidateQueries({ queryKey: ['report-snapshots'] });
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : 'Não foi possível assinar.'),
    });

    const items = query.data?.items ?? [];
    const total = query.data?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <SGFCard padding="lg" className="border border-slate-200/80">
            <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sgf-primary)]/10 text-[var(--sgf-primary)]">
                    <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                    <h2 className="text-base font-bold text-[var(--sgf-dark)]">Documentos emitidos</h2>
                    <p className="mt-0.5 text-sm text-slate-500">
                        Cada PDF baixado ou impresso recebe um código de verificação público.
                        {canSign ? ' Assine os documentos oficiais para que a assinatura apareça na conferência.' : ''}
                    </p>
                </div>
            </div>

            {query.isPending ? (
                <p role="status" className="mt-4 text-sm text-slate-400">Carregando documentos…</p>
            ) : query.isError ? (
                <p role="alert" className="mt-4 text-sm text-red-600">Não foi possível carregar os documentos emitidos.</p>
            ) : items.length === 0 ? (
                <p className="mt-4 text-sm text-slate-400">Nenhum relatório emitido ainda. Baixe ou imprima um relatório para registrá-lo.</p>
            ) : (
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                                <th className="py-2 pr-3">Relatório</th>
                                <th className="py-2 pr-3">Emitido em</th>
                                <th className="py-2 pr-3 text-right">Registros</th>
                                <th className="py-2 pr-3">Código</th>
                                <th className="py-2 pr-3">Assinatura</th>
                                <th className="py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item) => (
                                <tr key={item.id} className="border-b border-slate-100">
                                    <td className="py-2.5 pr-3 font-semibold text-slate-800">{item.title}</td>
                                    <td className="py-2.5 pr-3 text-slate-600">{new Date(item.generated_at).toLocaleString('pt-BR')}</td>
                                    <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600">{item.row_count?.toLocaleString('pt-BR') ?? '—'}</td>
                                    <td className="py-2.5 pr-3">
                                        <a
                                            href={`/verificar/${item.verification_code}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="font-mono text-xs font-semibold text-[var(--sgf-primary)] hover:underline"
                                            title="Abrir a página pública de conferência"
                                        >
                                            {formatVerificationCode(item.verification_code)}
                                        </a>
                                    </td>
                                    <td className="py-2.5 pr-3">
                                        {item.signed_at ? (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                                <CheckCircle className="h-4 w-4" /> {new Date(item.signed_at).toLocaleDateString('pt-BR')}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-slate-400">Não assinado</span>
                                        )}
                                    </td>
                                    <td className="py-2.5 text-right">
                                        {canSign && !item.signed_at && (
                                            <SGFButton
                                                size="sm"
                                                variant="secondary"
                                                loading={sign.isPending && sign.variables === item.id}
                                                disabled={sign.isPending}
                                                onClick={() => {
                                                    if (window.confirm(`Assinar eletronicamente "${item.title}"? A assinatura não pode ser desfeita.`)) {
                                                        sign.mutate(item.id);
                                                    }
                                                }}
                                            >
                                                Assinar
                                            </SGFButton>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {pages > 1 && (
                <div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-500">
                    <span>Página {page + 1} de {pages}</span>
                    <SGFButton size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Anterior</SGFButton>
                    <SGFButton size="sm" variant="ghost" disabled={page + 1 >= pages} onClick={() => setPage((current) => current + 1)}>Próxima</SGFButton>
                </div>
            )}
        </SGFCard>
    );
}
