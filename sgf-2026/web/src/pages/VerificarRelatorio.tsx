import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, Search, ShieldCheck } from '@/components/sgf/icons';
import { supabase } from '@/lib/supabase';
import { formatVerificationCode, normalizeVerificationCode } from '@/lib/reports/verification';

/** Resposta de `verify_report` (pública, sem login). */
interface VerifyResult {
    valid: boolean;
    orgao?: string;
    report_type?: string;
    title?: string;
    period_start?: string | null;
    period_end?: string | null;
    generated_at?: string;
    content_hash?: string;
    row_count?: number | null;
    signed?: boolean;
    signed_at?: string | null;
    signed_by_name?: string | null;
    signed_by_role?: string | null;
}

const ROLE_LABEL: Record<string, string> = {
    admin: 'Administrador',
    gestor: 'Gestor',
    secretario: 'Secretário',
    superadmin: 'Administrador da plataforma',
};

function formatDate(value?: string | null, withTime = false): string {
    if (!value) return '—';
    const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
    if (Number.isNaN(date.getTime())) return '—';
    return withTime ? date.toLocaleString('pt-BR') : date.toLocaleDateString('pt-BR');
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-800">{children}</dd>
        </div>
    );
}

export default function VerificarRelatorio() {
    const { code: rawCode = '' } = useParams<{ code?: string }>();
    const navigate = useNavigate();
    const code = normalizeVerificationCode(rawCode);
    const [input, setInput] = useState(code ? formatVerificationCode(code) : '');

    const query = useQuery({
        queryKey: ['verify-report', code],
        enabled: code.length > 0,
        retry: false,
        queryFn: async (): Promise<VerifyResult> => {
            const { data, error } = await supabase.rpc('verify_report', { p_code: code });
            if (error) throw new Error(error.message);
            return (data ?? { valid: false }) as unknown as VerifyResult;
        },
    });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        const next = normalizeVerificationCode(input);
        if (next) navigate(`/verificar/${next}`);
    };

    const result = query.data;

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:py-12">
            <div className="mx-auto max-w-2xl space-y-6">
                <header className="flex items-center gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                        <ShieldCheck className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Exattus Rotta</p>
                        <h1 className="text-2xl font-bold text-slate-950">Verificação de relatório</h1>
                    </div>
                </header>

                <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <label htmlFor="verification-code" className="text-sm font-semibold text-slate-700">
                        Código de verificação impresso no relatório
                    </label>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input
                            id="verification-code"
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            placeholder="XXXX-XXXX-XXXX"
                            autoComplete="off"
                            spellCheck={false}
                            maxLength={20}
                            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 font-mono text-base uppercase tracking-widest focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
                        />
                        <button
                            type="submit"
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                        >
                            <Search className="h-4 w-4" /> Verificar
                        </button>
                    </div>
                </form>

                {code && query.isPending && (
                    <p role="status" className="text-center text-sm text-slate-500">Consultando o registro…</p>
                )}

                {code && query.isError && (
                    <div role="alert" className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
                        Não foi possível consultar agora. Tente novamente em instantes.
                    </div>
                )}

                {result && !result.valid && (
                    <section role="alert" className="flex gap-3 rounded-3xl border border-red-200 bg-red-50 p-5 text-red-900">
                        <AlertTriangle className="h-6 w-6 shrink-0" />
                        <div>
                            <h2 className="font-bold">Código não encontrado</h2>
                            <p className="mt-1 text-sm">
                                Não há relatório registrado com o código <strong className="font-mono">{formatVerificationCode(code)}</strong>.
                                Confira a digitação; se estiver correto, o documento não foi emitido por este sistema.
                            </p>
                        </div>
                    </section>
                )}

                {result?.valid && (
                    <section className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm" aria-labelledby="verify-ok">
                        <div className="flex items-center gap-3 text-emerald-700">
                            <CheckCircle className="h-7 w-7" />
                            <h2 id="verify-ok" className="text-lg font-bold">Relatório autêntico</h2>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                            Este código foi registrado pelo sistema no momento da emissão. Confira se o órgão, o título,
                            a data e o número de registros abaixo são os mesmos do documento que você tem em mãos.
                        </p>
                        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                            <Field label="Órgão emissor">{result.orgao ?? '—'}</Field>
                            <Field label="Relatório">{result.title ?? '—'}</Field>
                            <Field label="Período">
                                {result.period_start || result.period_end
                                    ? `${formatDate(result.period_start)} a ${formatDate(result.period_end)}`
                                    : 'Situação na data de emissão'}
                            </Field>
                            <Field label="Emitido em">{formatDate(result.generated_at, true)}</Field>
                            <Field label="Registros">{result.row_count?.toLocaleString('pt-BR') ?? '—'}</Field>
                            <Field label="Assinatura eletrônica">
                                {result.signed
                                    ? `${result.signed_by_name ?? '—'}${result.signed_by_role ? ` (${ROLE_LABEL[result.signed_by_role] ?? result.signed_by_role})` : ''} em ${formatDate(result.signed_at, true)}`
                                    : 'Ainda não assinado no sistema'}
                            </Field>
                        </dl>
                        {result.content_hash && (
                            <div className="mt-5 rounded-xl bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Impressão digital do conteúdo (SHA-256)</p>
                                <p className="mt-1 break-all font-mono text-xs text-slate-600">{result.content_hash}</p>
                            </div>
                        )}
                    </section>
                )}
            </div>
        </main>
    );
}
