import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, X, Check } from '@/components/sgf/icons';
import { SGFButton } from '@/components/sgf/SGFButton';
import { formatVerificationCode } from '@/lib/reportIntegrity';
import {
    isValidVerificationCode,
    normalizeVerificationCode,
    verifyReport,
    type VerifyReportResult,
} from '@/lib/report-snapshots-api';

const ROLE_LABEL: Record<string, string> = {
    admin: 'Administrador',
    gestor: 'Gestor',
    secretario: 'Secretário',
    superadmin: 'Superadministrador',
};

function formatDate(value?: string | null): string {
    if (!value) return '—';
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

function formatDateTime(value?: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="mt-0.5 break-words text-sm font-semibold text-slate-800">{children}</dd>
        </div>
    );
}

function ResultCard({ result }: { result: VerifyReportResult }) {
    if (!result.valid) {
        return (
            <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
                <div className="flex items-center gap-3 text-red-700">
                    <X className="h-6 w-6 shrink-0" />
                    <p className="text-base font-bold">Código inválido ou relatório não encontrado</p>
                </div>
                <p className="mt-2 text-sm text-red-700/90">
                    Confira se o código foi digitado corretamente (12 caracteres, sem as letras O, I, L nem os números 0 e 1).
                    Um relatório sem registro não pode ser considerado autêntico.
                </p>
            </div>
        );
    }
    return (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
            <div className="flex items-center gap-3 text-emerald-700">
                <Check className="h-6 w-6 shrink-0" />
                <p className="text-base font-bold">Relatório autêntico: registro encontrado</p>
            </div>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Órgão">{result.orgao ?? '—'}</Field>
                {/* O título já identifica o relatório; o tipo é a chave interna e só
                    aparece quando não há título. */}
                <Field label="Relatório">{result.title ?? result.reportType ?? '—'}</Field>
                <Field label="Período">
                    {result.periodStart || result.periodEnd
                        ? `${formatDate(result.periodStart)} a ${formatDate(result.periodEnd)}`
                        : 'Todo o período'}
                </Field>
                <Field label="Gerado em">{formatDateTime(result.generatedAt)}</Field>
                <Field label="Linhas de dados">{result.rowCount ?? '—'}</Field>
                <div className="sm:col-span-2">
                    <Field label="Hash SHA-256">
                        <span className="font-mono text-xs font-medium">{result.contentHash ?? '—'}</span>
                    </Field>
                </div>
                <div className="sm:col-span-2">
                    <Field label="Assinatura eletrônica">
                        {result.signed ? (
                            <>
                                {result.signedByName ?? '—'}
                                {result.signedByRole ? `, ${ROLE_LABEL[result.signedByRole] ?? result.signedByRole}` : ''}
                                <span className="block text-xs font-medium text-slate-500">
                                    em {formatDateTime(result.signedAt)} (assinatura eletrônica simples, Lei 14.063/2020, art. 4º, I)
                                </span>
                            </>
                        ) : (
                            <span className="text-amber-700">Ainda não assinado</span>
                        )}
                    </Field>
                </div>
            </dl>
            <p className="mt-5 text-xs text-slate-500">
                Para auditar o conteúdo, recalcule o SHA-256 do arquivo conforme o formato indicado no rodapé do
                relatório e compare com o hash acima.
            </p>
        </div>
    );
}

/** Página pública de verificação de autenticidade de relatórios (sem login). */
export default function VerifyReport() {
    const { codigo } = useParams<{ codigo?: string }>();
    // A chave reinicia o formulário quando o código da URL muda.
    return <VerifyReportContent key={codigo ?? ''} codigo={codigo} />;
}

function VerifyReportContent({ codigo }: { codigo?: string }) {
    const navigate = useNavigate();
    const [input, setInput] = useState(codigo ? formatVerificationCode(codigo) : '');
    const [formError, setFormError] = useState<string | null>(null);
    const activeCode = codigo ? normalizeVerificationCode(codigo) : '';
    const formatOk = activeCode !== '' && isValidVerificationCode(activeCode);

    const query = useQuery({
        queryKey: ['verify-report', activeCode],
        queryFn: () => verifyReport(activeCode),
        enabled: formatOk,
        retry: false,
        staleTime: 60 * 1000,
    });

    const onSubmit = (event: FormEvent) => {
        event.preventDefault();
        const normalized = normalizeVerificationCode(input);
        if (!isValidVerificationCode(normalized)) {
            setFormError('Informe o código de 12 caracteres impresso no relatório (formato XXXX-XXXX-XXXX).');
            return;
        }
        setFormError(null);
        navigate(`/verificar/${formatVerificationCode(normalized)}`);
    };

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:py-12">
            <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
                <div className="flex items-center gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                        <ShieldCheck className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Exattus Rotta</p>
                        <h1 className="text-2xl font-bold text-slate-950">Verificação de autenticidade</h1>
                    </div>
                </div>
                <p className="mt-4 text-sm text-slate-500">
                    Digite o código de verificação impresso no rodapé do relatório (ou leia o QR Code) para conferir
                    se ele foi emitido pelo sistema e se o conteúdo não foi alterado.
                </p>

                <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="flex-1">
                        <label htmlFor="verify-code" className="sr-only">Código de verificação</label>
                        <input
                            id="verify-code"
                            type="text"
                            inputMode="text"
                            autoComplete="off"
                            autoCapitalize="characters"
                            spellCheck={false}
                            maxLength={20}
                            value={input}
                            onChange={(event) => setInput(event.target.value.toUpperCase())}
                            placeholder="XXXX-XXXX-XXXX"
                            aria-invalid={formError ? true : undefined}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-base tracking-widest text-slate-800 focus:border-[var(--sgf-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--sgf-primary)]/10"
                        />
                        {formError && <p role="alert" className="mt-2 text-sm text-red-600">{formError}</p>}
                    </div>
                    <SGFButton type="submit" loading={query.isFetching}>Verificar</SGFButton>
                </form>

                {activeCode !== '' && !formatOk && (
                    <ResultCard result={{ valid: false }} />
                )}
                {formatOk && query.isLoading && (
                    <p role="status" className="mt-6 text-center text-sm text-slate-400">Consultando o registro…</p>
                )}
                {formatOk && query.isError && (
                    <p role="alert" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        {query.error instanceof Error ? query.error.message : 'Não foi possível consultar agora.'}
                    </p>
                )}
                {formatOk && query.data && <ResultCard result={query.data} />}

                <p className="mt-8 text-center text-xs text-slate-400">
                    <Link to="/login" className="font-semibold text-slate-500 hover:underline">Acessar o sistema</Link>
                </p>
            </div>
        </main>
    );
}
