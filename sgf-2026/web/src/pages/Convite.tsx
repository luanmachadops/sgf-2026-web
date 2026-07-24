import { useEffect, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    Camera,
    Check,
    CheckCircle,
    FileText,
    Lock,
    ShieldCheck,
} from '@/components/sgf/icons';
import {
    driverRegistrationPublicApi,
    type CnhExtraction,
    type RegistrationInvite,
} from '@/lib/driver-registration-api';

type FormState = {
    fullName: string;
    cpf: string;
    birthDate: string;
    cnhNumber: string;
    cnhCategory: string;
    cnhExpiry: string;
    departmentId: string;
    email: string;
    confirmEmail: string;
    phone: string;
    password: string;
    confirmPassword: string;
};

type Protocol = { requestId: string; trackingToken: string; token: string };
type RegistrationStatus = 'pending' | 'needs_correction' | 'approved' | 'rejected';

const PROTOCOL_KEY = 'sgf.driver-registration.protocol';
const EMPTY_FORM: FormState = {
    fullName: '',
    cpf: '',
    birthDate: '',
    cnhNumber: '',
    cnhCategory: '',
    cnhExpiry: '',
    departmentId: '',
    email: '',
    confirmEmail: '',
    phone: '',
    password: '',
    confirmPassword: '',
};

function digits(value: string) {
    return value.replace(/\D/g, '');
}

function formatCpf(value: string) {
    const clean = digits(value).slice(0, 11);
    return clean
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function formatPhone(value: string) {
    const clean = digits(value).slice(0, 11);
    if (clean.length <= 10) {
        return clean.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
    }
    return clean.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

function formatDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || '—';
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
}

export default function Convite() {
    const [params] = useSearchParams();
    const token = params.get('token')?.trim() ?? '';
    const [invite, setInvite] = useState<RegistrationInvite | null>(null);
    const [step, setStep] = useState(0);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState('');
    const [photoUrl, setPhotoUrl] = useState('');
    const [cnhPath, setCnhPath] = useState('');
    const [aiConfidence, setAiConfidence] = useState<number | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [protocol, setProtocol] = useState<Protocol | null>(null);
    const [status, setStatus] = useState<RegistrationStatus>('pending');
    const [managerNote, setManagerNote] = useState<string | null>(null);

    const primary = invite?.tenant.primary_color || '#00A86B';
    const appName = invite?.tenant.app_name || 'Frota Municipal';
    const organization = invite?.tenant.login_eyebrow || invite?.tenant.name || 'Prefeitura';
    const progress = step >= 5 ? 100 : Math.max(0, step) * 25;

    const pageTitle = [
        'Validando convite',
        'Fotografe sua CNH',
        'Confira seus dados',
        'Secretaria e contato',
        'Crie sua senha',
        'Acompanhe sua solicitação',
    ][step] ?? 'Cadastro de motorista';

    useEffect(() => {
        let active = true;

        async function initialize() {
            if (!token) {
                if (active) {
                    setError('Este link está incompleto. Peça um novo convite ao gestor.');
                    setBusy(false);
                }
                return;
            }

            try {
                const stored = localStorage.getItem(PROTOCOL_KEY);
                if (stored) {
                    const saved = JSON.parse(stored) as Protocol;
                    if (saved.token === token && saved.requestId && saved.trackingToken) {
                        const currentStatus = await driverRegistrationPublicApi.status(
                            saved.requestId,
                            saved.trackingToken,
                        );
                        if (!active) return;
                        setProtocol(saved);
                        setStatus(currentStatus.status);
                        setManagerNote(currentStatus.manager_note ?? null);
                        setStep(5);
                        return;
                    }
                }

                const data = await driverRegistrationPublicApi.validateInvite(token);
                if (!active) return;
                setInvite(data);
                if (data.departments.length === 1) {
                    setForm((current) => ({ ...current, departmentId: data.departments[0].id }));
                }
                setStep(1);
            } catch (cause) {
                if (active) setError((cause as Error).message);
            } finally {
                if (active) setBusy(false);
            }
        }

        void initialize();
        return () => { active = false; };
    }, [token]);

    useEffect(() => {
        return () => {
            if (photoUrl) URL.revokeObjectURL(photoUrl);
        };
    }, [photoUrl]);

    const setField = (field: keyof FormState, value: string) => {
        setForm((current) => ({ ...current, [field]: value }));
        setError('');
    };

    const applyExtraction = (data: CnhExtraction) => {
        setForm((current) => ({
            ...current,
            fullName: data.name ?? current.fullName,
            cpf: data.cpf ? formatCpf(data.cpf) : current.cpf,
            birthDate: data.birthDate ?? current.birthDate,
            cnhNumber: data.cnhNumber ?? current.cnhNumber,
            cnhCategory: data.cnhCategory ?? current.cnhCategory,
            cnhExpiry: data.cnhExpiry ?? current.cnhExpiry,
        }));
        setAiConfidence(typeof data.confidence === 'number' ? data.confidence : null);
    };

    const onPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setError('Selecione uma foto válida da CNH.');
            return;
        }
        if (file.size > 12 * 1024 * 1024) {
            setError('A foto deve ter no máximo 12 MB.');
            return;
        }

        setPhotoUrl(URL.createObjectURL(file));
        setBusy(true);
        setError('');
        try {
            const path = await driverRegistrationPublicApi.uploadCnh(token, file);
            setCnhPath(path);
            try {
                const extracted = await driverRegistrationPublicApi.extractCnh(token, [path]);
                applyExtraction(extracted);
            } catch {
                setError('A foto foi enviada, mas a leitura automática não conseguiu preencher tudo. Você poderá digitar os dados.');
            }
        } catch (cause) {
            setPhotoUrl('');
            setCnhPath('');
            setError((cause as Error).message);
        } finally {
            setBusy(false);
            event.target.value = '';
        }
    };

    const goNext = () => {
        setError('');
        if (step === 1 && !cnhPath) {
            setError('A foto da CNH é obrigatória.');
            return;
        }
        if (step === 2) {
            if (form.fullName.trim().split(/\s+/).length < 2) {
                setError('Informe seu nome completo.');
                return;
            }
            if (digits(form.cpf).length !== 11) {
                setError('Informe um CPF válido.');
                return;
            }
            if (digits(form.cnhNumber).length < 9 || !form.cnhCategory || !form.cnhExpiry) {
                setError('Revise o número, a categoria e a validade da CNH.');
                return;
            }
        }
        if (step === 3) {
            if (!form.departmentId) {
                setError('Selecione sua secretaria.');
                return;
            }
            if (!form.email.includes('@') || form.email.trim().toLowerCase() !== form.confirmEmail.trim().toLowerCase()) {
                setError('Os e-mails informados precisam ser iguais.');
                return;
            }
        }
        if (step === 4) {
            if (
                form.password.length < 8 ||
                !/[a-z]/.test(form.password) ||
                !/[A-Z]/.test(form.password) ||
                !/\d/.test(form.password)
            ) {
                setError('Use ao menos 8 caracteres, com maiúscula, minúscula e número.');
                return;
            }
            if (form.password !== form.confirmPassword) {
                setError('As senhas não coincidem.');
                return;
            }
            void submit();
            return;
        }
        setStep((current) => current + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const submit = async () => {
        setBusy(true);
        setError('');
        try {
            const result = await driverRegistrationPublicApi.submit({
                token,
                fullName: form.fullName.trim(),
                cpf: digits(form.cpf),
                birthDate: form.birthDate || null,
                cnhNumber: digits(form.cnhNumber),
                cnhCategory: form.cnhCategory.trim().toUpperCase(),
                cnhExpiry: form.cnhExpiry,
                departmentId: form.departmentId,
                email: form.email.trim(),
                confirmEmail: form.confirmEmail.trim(),
                phone: digits(form.phone),
                password: form.password,
                cnhFrontPath: cnhPath,
                aiConfidence,
            });
            const nextProtocol = {
                requestId: result.requestId,
                trackingToken: result.trackingToken,
                token,
            };
            localStorage.setItem(PROTOCOL_KEY, JSON.stringify(nextProtocol));
            setProtocol(nextProtocol);
            setStatus('pending');
            setStep(5);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (cause) {
            setError((cause as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const refreshStatus = async () => {
        if (!protocol) return;
        setBusy(true);
        setError('');
        try {
            const result = await driverRegistrationPublicApi.status(
                protocol.requestId,
                protocol.trackingToken,
            );
            setStatus(result.status);
            setManagerNote(result.manager_note ?? null);
        } catch (cause) {
            setError((cause as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const back = () => {
        if (step <= 1 || busy) return;
        setStep((current) => current - 1);
        setError('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (step === 0) {
        return (
            <PublicShell primary={primary}>
                <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
                    {busy ? (
                        <>
                            <Spinner />
                            <h1 className="mt-5 text-2xl font-bold text-slate-900">Validando seu convite…</h1>
                            <p className="mt-2 text-sm leading-6 text-slate-500">Isso leva apenas alguns segundos.</p>
                        </>
                    ) : (
                        <>
                            <AlertCircle className="h-14 w-14 text-red-500" />
                            <h1 className="mt-5 text-2xl font-bold text-slate-900">Não foi possível abrir o cadastro</h1>
                            <p className="mt-2 text-sm leading-6 text-slate-500">{error}</p>
                        </>
                    )}
                </div>
            </PublicShell>
        );
    }

    return (
        <PublicShell primary={primary}>
            <div className="fixed inset-x-0 top-0 z-50 h-1.5 bg-slate-200">
                <div
                    className="h-full transition-all duration-500"
                    style={{ width: `${progress}%`, backgroundColor: primary }}
                />
            </div>

            <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
                <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-4 sm:px-6">
                    {step > 1 && step < 5 ? (
                        <button
                            type="button"
                            onClick={back}
                            disabled={busy}
                            aria-label="Voltar para a etapa anterior"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                    ) : (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-50">
                            {invite?.tenant.logo_url || invite?.tenant.seal_url ? (
                                <img
                                    src={invite.tenant.logo_url || invite.tenant.seal_url || ''}
                                    alt=""
                                    className="h-full w-full object-contain p-1"
                                />
                            ) : (
                                <ShieldCheck className="h-6 w-6" style={{ color: primary }} />
                            )}
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{organization}</p>
                        <h1 className="truncate text-lg font-bold text-slate-900 sm:text-xl">{pageTitle}</h1>
                    </div>
                    <p className="hidden text-sm font-semibold text-slate-400 sm:block">
                        {step < 5 ? `Etapa ${step} de 4` : appName}
                    </p>
                </div>
            </header>

            <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
                {step === 1 && (
                    <Card>
                        <SectionIcon primary={primary}><Camera className="h-7 w-7" /></SectionIcon>
                        <h2 className="text-2xl font-bold text-slate-900">Comece pela foto da CNH</h2>
                        <p className="text-sm leading-6 text-slate-500">
                            Use a CNH original, em local claro, sem reflexos e com todos os cantos visíveis.
                        </p>
                        <label className="group relative flex min-h-72 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 p-6 text-center transition hover:border-emerald-400 hover:bg-emerald-50">
                            {photoUrl ? (
                                <img src={photoUrl} alt="Prévia da CNH selecionada" className="absolute inset-0 h-full w-full object-contain bg-slate-950" />
                            ) : (
                                <>
                                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm">
                                        <Camera className="h-8 w-8" style={{ color: primary }} />
                                    </span>
                                    <strong className="mt-4 text-base text-slate-800">Tirar foto ou escolher arquivo</strong>
                                    <span className="mt-1 text-xs text-slate-500">JPG, PNG ou HEIC · máximo 12 MB</span>
                                </>
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={onPhoto}
                                disabled={busy}
                                className="sr-only"
                            />
                        </label>
                        {busy && (
                            <div className="flex items-center justify-center gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                                <Spinner small /> Enviando e lendo os dados…
                            </div>
                        )}
                        {!busy && cnhPath && (
                            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
                                <CheckCircle className="h-5 w-5" /> CNH enviada de forma privada. Você revisará os dados na próxima etapa.
                            </div>
                        )}
                    </Card>
                )}

                {step === 2 && (
                    <Card>
                        <SectionIcon primary={primary}><FileText className="h-7 w-7" /></SectionIcon>
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Confira os dados da CNH</h2>
                            <p className="mt-2 text-sm leading-6 text-slate-500">
                                A leitura automática ajuda no preenchimento, mas confirme cada informação.
                            </p>
                        </div>
                        <Field label="Nome completo" value={form.fullName} onChange={(value) => setField('fullName', value)} autoComplete="name" />
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="CPF" value={form.cpf} onChange={(value) => setField('cpf', formatCpf(value))} inputMode="numeric" autoComplete="off" />
                            <Field label="Data de nascimento" type="date" value={form.birthDate} onChange={(value) => setField('birthDate', value)} />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <div className="sm:col-span-1">
                                <Field label="Número da CNH" value={form.cnhNumber} onChange={(value) => setField('cnhNumber', digits(value).slice(0, 11))} inputMode="numeric" />
                            </div>
                            <Field label="Categoria" value={form.cnhCategory} onChange={(value) => setField('cnhCategory', value.toUpperCase().slice(0, 3))} />
                            <Field label="Validade" type="date" value={form.cnhExpiry} onChange={(value) => setField('cnhExpiry', value)} />
                        </div>
                    </Card>
                )}

                {step === 3 && (
                    <Card>
                        <SectionIcon primary={primary}><ShieldCheck className="h-7 w-7" /></SectionIcon>
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Secretaria e contato</h2>
                            <p className="mt-2 text-sm leading-6 text-slate-500">
                                O gestor usará estas informações para conferir seu vínculo.
                            </p>
                        </div>
                        <div>
                            <label htmlFor="department" className="mb-1.5 block text-sm font-semibold text-slate-700">Secretaria</label>
                            <select
                                id="department"
                                value={form.departmentId}
                                onChange={(event) => setField('departmentId', event.target.value)}
                                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                            >
                                <option value="">Selecione sua secretaria</option>
                                {invite?.departments.map((department) => (
                                    <option key={department.id} value={department.id}>{department.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="E-mail" type="email" value={form.email} onChange={(value) => setField('email', value)} autoComplete="email" />
                            <Field label="Confirmar e-mail" type="email" value={form.confirmEmail} onChange={(value) => setField('confirmEmail', value)} autoComplete="off" />
                        </div>
                        <Field label="Celular / WhatsApp" type="tel" value={form.phone} onChange={(value) => setField('phone', formatPhone(value))} autoComplete="tel" inputMode="tel" />
                    </Card>
                )}

                {step === 4 && (
                    <Card>
                        <SectionIcon primary={primary}><Lock className="h-7 w-7" /></SectionIcon>
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Crie sua senha</h2>
                            <p className="mt-2 text-sm leading-6 text-slate-500">
                                O gestor apenas aprova seu cadastro. Ele nunca terá acesso à senha escolhida.
                            </p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Senha" type="password" value={form.password} onChange={(value) => setField('password', value)} autoComplete="new-password" />
                            <Field label="Confirmar senha" type="password" value={form.confirmPassword} onChange={(value) => setField('confirmPassword', value)} autoComplete="new-password" />
                        </div>
                        <div className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                            <p>• mínimo de 8 caracteres</p>
                            <p>• uma letra maiúscula e uma minúscula</p>
                            <p>• pelo menos um número</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 p-4">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Resumo</p>
                            <p className="mt-2 font-bold text-slate-900">{form.fullName}</p>
                            <p className="mt-1 text-sm text-slate-500">CPF {form.cpf} · CNH {form.cnhNumber}</p>
                            <p className="text-sm text-slate-500">Validade {formatDate(form.cnhExpiry)} · {form.email}</p>
                        </div>
                    </Card>
                )}

                {step === 5 && (
                    <Card className="items-center text-center">
                        <div className={`flex h-20 w-20 items-center justify-center rounded-full ${status === 'approved' ? 'bg-emerald-100 text-emerald-600' : status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                            {status === 'approved' ? <CheckCircle className="h-10 w-10" /> : <ShieldCheck className="h-10 w-10" />}
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900">
                            {status === 'approved'
                                ? 'Cadastro aprovado!'
                                : status === 'rejected'
                                    ? 'Cadastro não aprovado'
                                    : status === 'needs_correction'
                                        ? 'O gestor solicitou um ajuste'
                                        : 'Solicitação enviada'}
                        </h2>
                        <p className="max-w-lg text-sm leading-6 text-slate-500">
                            {status === 'approved'
                                ? 'Seu acesso está liberado. Quando o aplicativo estiver disponível, entre usando seu CPF e a senha que escolheu.'
                                : status === 'pending'
                                    ? 'Seus dados estão aguardando a análise do gestor. Você receberá um aviso por e-mail ou WhatsApp após a decisão.'
                                    : managerNote || 'Entre em contato com o gestor para mais informações.'}
                        </p>
                        {managerNote && status !== 'pending' && (
                            <div className="w-full rounded-xl bg-amber-50 p-4 text-left text-sm text-amber-800">{managerNote}</div>
                        )}
                        {protocol && (
                            <p className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-400">
                                Protocolo: {protocol.requestId.slice(0, 8).toUpperCase()}
                            </p>
                        )}
                        {status !== 'approved' && (
                            <button
                                type="button"
                                onClick={refreshStatus}
                                disabled={busy}
                                className="inline-flex h-12 items-center justify-center rounded-full px-6 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                                style={{ backgroundColor: primary }}
                            >
                                {busy ? <Spinner small light /> : 'Atualizar situação'}
                            </button>
                        )}
                    </Card>
                )}

                {error && step > 0 && (
                    <div role="alert" className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {step >= 1 && step <= 4 && (
                    <button
                        type="button"
                        onClick={goNext}
                        disabled={busy}
                        className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-bold text-white shadow-lg transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ backgroundColor: primary }}
                    >
                        {busy ? (
                            <Spinner small light />
                        ) : (
                            <>
                                {step === 4 ? 'Enviar para análise' : 'Avançar'}
                                {step === 4 ? <Check className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
                            </>
                        )}
                    </button>
                )}
            </main>

            <footer className="px-4 pb-8 text-center text-xs text-slate-400">
                Seus dados e documentos são usados exclusivamente para análise do cadastro no {appName}.
            </footer>
        </PublicShell>
    );
}

function PublicShell({ children, primary }: { children: React.ReactNode; primary: string }) {
    return (
        <div className="min-h-screen bg-[#F5F7F9] text-slate-900" style={{ '--registration-primary': primary } as React.CSSProperties}>
            {children}
        </div>
    );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <section className={`flex flex-col gap-5 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-8 ${className}`}>
            {children}
        </section>
    );
}

function SectionIcon({ children, primary }: { children: React.ReactNode; primary: string }) {
    return (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50" style={{ color: primary }}>
            {children}
        </div>
    );
}

type FieldProps = {
    label: string;
    value: string;
    onChange: (value: string) => void;
    type?: string;
    inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
    autoComplete?: string;
};

function Field({
    label,
    value,
    onChange,
    type = 'text',
    inputMode,
    autoComplete,
}: FieldProps) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
            <input
                type={type}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                inputMode={inputMode}
                autoComplete={autoComplete}
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
            />
        </label>
    );
}

function Spinner({ small = false, light = false }: { small?: boolean; light?: boolean }) {
    return (
        <span
            aria-label="Carregando"
            className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? 'h-5 w-5' : 'h-10 w-10'} ${light ? 'text-white' : 'text-emerald-600'}`}
        />
    );
}
