import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { CheckCircle, Clipboard, Qr, ShieldCheck, XCircle } from '@/components/sgf/icons';
import { useBranding } from '@/contexts/BrandingContext';
import { departmentsApi } from '@/lib/supabase-api';
import {
    driverRegistrationManagerApi,
    type DriverRegistrationRequest,
} from '@/lib/driver-registration-api';
import { formatCPF, formatDate, formatPhone } from '@/lib/utils';

type Props = {
    isOpen: boolean;
    onClose: () => void;
};

type GeneratedInvite = Awaited<ReturnType<typeof driverRegistrationManagerApi.createInvite>>;

function WhatsAppIcon({ className = 'h-4 w-4' }: { className?: string }) {
    return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M.057 24l1.687-6.163a11.87 11.87 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.81 11.81 0 0 1 8.413 3.488 11.82 11.82 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24Zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l.999 1.59-1.048 3.83 3.916-1.027.876.518Z" />
        </svg>
    );
}

function statusLabel(status: DriverRegistrationRequest['status']) {
    if (status === 'approved') return 'Aprovado';
    if (status === 'rejected') return 'Rejeitado';
    if (status === 'needs_correction') return 'Ajuste solicitado';
    return 'Aguardando análise';
}

export function DriverRegistrationCenter({ isOpen, onClose }: Props) {
    const { branding } = useBranding();
    const queryClient = useQueryClient();
    const [tab, setTab] = useState<'requests' | 'invite'>('requests');
    const [status, setStatus] = useState('pending');
    const [selected, setSelected] = useState<DriverRegistrationRequest | null>(null);
    const [departmentId, setDepartmentId] = useState('');
    const [expiresInDays, setExpiresInDays] = useState(7);
    const [maxUses, setMaxUses] = useState(1);
    const [generated, setGenerated] = useState<GeneratedInvite | null>(null);
    const [note, setNote] = useState('');

    const { data: departments = [] } = useQuery({
        queryKey: ['departments', 'driver-registration'],
        queryFn: () => departmentsApi.getAll(),
        enabled: isOpen,
    });

    const requestsQuery = useQuery({
        queryKey: ['driver-registration-requests', status],
        queryFn: () => driverRegistrationManagerApi.listRequests(status),
        enabled: isOpen && tab === 'requests',
    });

    const createInvite = useMutation({
        mutationFn: async () => {
            const invite = await driverRegistrationManagerApi.createInvite({
                departmentId: departmentId || undefined,
                expiresInDays,
                maxUses,
            });
            if (!invite.inviteUrl.startsWith('https://')) {
                throw new Error('O serviço não retornou um link web seguro. Tente novamente.');
            }
            return invite;
        },
        onSuccess: (data) => {
            setGenerated(data);
            toast.success('Convite criado com segurança.');
        },
        onError: (error) => toast.error((error as Error).message),
    });

    const review = useMutation({
        mutationFn: ({ decision }: { decision: 'approved' | 'needs_correction' | 'rejected' }) => {
            if (!selected) throw new Error('Selecione uma solicitação.');
            return driverRegistrationManagerApi.review(selected.id, decision, note.trim() || undefined);
        },
        onSuccess: (result, input) => {
            const approved = input.decision === 'approved';
            toast.success(
                approved
                    ? result.notificationSent
                        ? 'Cadastro aprovado e motorista avisado por e-mail.'
                        : 'Cadastro aprovado. O e-mail automático não está configurado; avise o motorista.'
                    : 'Decisão registrada.',
            );
            if (approved && !result.notificationSent && result.whatsappUrl) {
                window.location.assign(result.whatsappUrl);
            }
            setSelected(null);
            setNote('');
            void queryClient.invalidateQueries({ queryKey: ['driver-registration-requests'] });
            void queryClient.invalidateQueries({ queryKey: ['drivers'] });
        },
        onError: (error) => toast.error((error as Error).message),
    });

    const pendingCount = status === 'pending' ? (requestsQuery.data?.length ?? 0) : 0;

    const copy = async (value: string, success: string) => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success(success);
        } catch {
            toast.error('Não foi possível copiar.');
        }
    };

    const sendInviteByWhatsApp = () => {
        if (!generated) return;

        const departmentName = departments.find((department) => department.id === departmentId)?.name;
        const municipality = [branding.city, branding.state].filter(Boolean).join('/');
        const appName = branding.appName || 'Exattus Rotta';
        const expiresAt = new Date(generated.expiresAt).toLocaleString('pt-BR');
        const usesLabel = generated.maxUses === 1 ? '1 utilização' : `${generated.maxUses} utilizações`;
        const identification = [
            municipality ? `📍 *Município:* ${municipality}` : null,
            departmentName ? `🏛️ *Secretaria:* ${departmentName}` : '🏛️ *Secretaria:* escolha durante o cadastro',
        ].filter(Boolean).join('\n');
        const message = [
            `*Convite para cadastro de motorista — ${appName}*`,
            '',
            `Olá! Você recebeu um convite para realizar seu cadastro como motorista${branding.name ? ` da *${branding.name}*` : ''}.`,
            '',
            identification,
            '',
            '*Como realizar o cadastro:*',
            '1. Acesse o link abaixo;',
            '2. Preencha seus dados e envie os documentos solicitados;',
            '3. Crie sua senha pessoal;',
            '4. Aguarde a análise do gestor.',
            '',
            `🔗 *Link de cadastro:*\n${generated.inviteUrl}`,
            '',
            `🔐 *Código do convite:* ${generated.token}`,
            `⏳ *Válido até:* ${expiresAt}`,
            `👤 *Limite:* ${usesLabel}`,
            '',
            '_Por segurança, não encaminhe este convite para outras pessoas._',
        ].join('\n');

        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    };

    const handleClose = () => {
        setSelected(null);
        setGenerated(null);
        setNote('');
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Cadastro pelo motorista"
            description="Envie um convite e analise os dados preenchidos pelo navegador."
            size="xl"
        >
            <div className="space-y-5">
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1">
                    <button
                        type="button"
                        onClick={() => setTab('requests')}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === 'requests' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}
                    >
                        Solicitações {pendingCount > 0 ? `(${pendingCount})` : ''}
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab('invite')}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === 'invite' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}
                    >
                        Gerar convite
                    </button>
                </div>

                {tab === 'invite' ? (
                    <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5">
                            <div className="mb-5 flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                                    <Qr className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900">Novo link de cadastro</h3>
                                    <p className="text-sm text-slate-500">O link expira e só pode ser usado na quantidade definida.</p>
                                </div>
                            </div>

                            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Secretaria</label>
                            <select
                                value={departmentId}
                                onChange={(event) => setDepartmentId(event.target.value)}
                                className="mb-4 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-emerald-500"
                            >
                                <option value="">Motorista escolhe no navegador</option>
                                {departments.map((department) => (
                                    <option key={department.id} value={department.id}>{department.name}</option>
                                ))}
                            </select>

                            <div className="grid grid-cols-2 gap-3">
                                <label className="text-sm font-semibold text-slate-700">
                                    Validade
                                    <select
                                        value={expiresInDays}
                                        onChange={(event) => setExpiresInDays(Number(event.target.value))}
                                        className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-normal outline-none focus:border-emerald-500"
                                    >
                                        <option value={1}>1 dia</option>
                                        <option value={3}>3 dias</option>
                                        <option value={7}>7 dias</option>
                                        <option value={15}>15 dias</option>
                                        <option value={30}>30 dias</option>
                                    </select>
                                </label>
                                <label className="text-sm font-semibold text-slate-700">
                                    Quantidade de usos
                                    <input
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={maxUses}
                                        onChange={(event) => setMaxUses(Number(event.target.value))}
                                        className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-normal outline-none focus:border-emerald-500"
                                    />
                                </label>
                            </div>

                            <SGFButton
                                className="mt-5"
                                icon={ShieldCheck}
                                loading={createInvite.isPending}
                                onClick={() => createInvite.mutate()}
                            >
                                Gerar convite seguro
                            </SGFButton>
                        </div>

                        <div className="rounded-2xl bg-[#0F2B2F] p-5 text-white">
                            {generated ? (
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">Convite pronto</p>
                                        <h3 className="mt-1 text-xl font-bold">Envie ao motorista</h3>
                                        <p className="mt-1 text-sm text-slate-300">Envie por WhatsApp ou e-mail. O motorista preenche tudo diretamente no navegador.</p>
                                    </div>
                                    <div className="break-all rounded-xl bg-white/10 p-3 font-mono text-xs text-emerald-100">
                                        {generated.inviteUrl}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <SGFButton
                                            variant="primary"
                                            icon={WhatsAppIcon}
                                            onClick={sendInviteByWhatsApp}
                                        >
                                            Enviar pelo WhatsApp
                                        </SGFButton>
                                        <SGFButton
                                            variant="ghost"
                                            className="!text-white hover:!bg-white/10"
                                            icon={Clipboard}
                                            onClick={() => copy(generated.inviteUrl, 'Link copiado.')}
                                        >
                                            Copiar link
                                        </SGFButton>
                                        <SGFButton
                                            variant="ghost"
                                            className="!text-white hover:!bg-white/10"
                                            onClick={() => copy(generated.token, 'Código copiado.')}
                                        >
                                            Copiar código
                                        </SGFButton>
                                    </div>
                                    <p className="text-xs text-slate-400">
                                        Válido até {new Date(generated.expiresAt).toLocaleString('pt-BR')} · {generated.maxUses} uso(s).
                                    </p>
                                </div>
                            ) : (
                                <div className="flex min-h-64 flex-col items-center justify-center text-center">
                                    <ShieldCheck className="h-12 w-12 text-emerald-300" />
                                    <h3 className="mt-4 text-lg font-bold">A senha permanece privada</h3>
                                    <p className="mt-2 max-w-sm text-sm leading-6 text-slate-300">
                                        O motorista cria a própria senha. Você apenas confere os documentos e aprova o acesso.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : selected ? (
                    <div className="space-y-5">
                        <button type="button" onClick={() => setSelected(null)} className="text-sm font-semibold text-emerald-700">← Voltar para a fila</button>
                        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                            <div className="space-y-4">
                                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h3 className="text-xl font-bold text-slate-900">{selected.full_name}</h3>
                                            <p className="mt-1 text-sm text-slate-500">{selected.departments?.name ?? 'Sem secretaria'}</p>
                                        </div>
                                        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">{statusLabel(selected.status)}</span>
                                    </div>
                                    <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                                        <Detail label="CPF" value={formatCPF(selected.cpf)} />
                                        <Detail label="Nascimento" value={formatDate(selected.birth_date)} />
                                        <Detail label="CNH" value={selected.cnh_number} />
                                        <Detail label="Categoria" value={selected.cnh_category} />
                                        <Detail label="Validade CNH" value={formatDate(selected.cnh_expiry)} />
                                        <Detail label="Celular" value={formatPhone(selected.phone)} />
                                        <div className="col-span-2"><Detail label="E-mail" value={selected.email} /></div>
                                    </dl>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                                    <h4 className="mb-3 font-bold text-slate-900">Foto da CNH</h4>
                                    {selected.document_entry_mode === 'manual' ? (
                                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                                            O motorista informou os dados manualmente porque não conseguiu utilizar a câmera.
                                        </div>
                                    ) : (
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            {selected.cnhUrls.map((url) => (
                                                <a key={url} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                                                    <img src={url} alt="CNH enviada pelo motorista" className="h-56 w-full object-contain" />
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="h-fit rounded-2xl border border-slate-200 bg-white p-5">
                                <h4 className="font-bold text-slate-900">Decisão do gestor</h4>
                                <p className="mt-1 text-sm text-slate-500">A aprovação libera imediatamente o login por CPF.</p>
                                <label className="mt-5 block text-sm font-semibold text-slate-700">
                                    Observação ou motivo
                                    <textarea
                                        value={note}
                                        onChange={(event) => setNote(event.target.value)}
                                        rows={4}
                                        placeholder="Obrigatório para solicitar ajuste ou rejeitar"
                                        className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 font-normal outline-none focus:border-emerald-500"
                                    />
                                </label>
                                <div className="mt-4 grid gap-2">
                                    <SGFButton
                                        icon={CheckCircle}
                                        loading={review.isPending}
                                        onClick={() => review.mutate({ decision: 'approved' })}
                                    >
                                        Aprovar e liberar acesso
                                    </SGFButton>
                                    <SGFButton
                                        variant="danger"
                                        icon={XCircle}
                                        disabled={!note.trim() || review.isPending}
                                        onClick={() => review.mutate({ decision: 'rejected' })}
                                    >
                                        Rejeitar cadastro
                                    </SGFButton>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                            {[
                                ['pending', 'Aguardando'],
                                ['needs_correction', 'Ajuste solicitado'],
                                ['approved', 'Aprovados'],
                                ['rejected', 'Rejeitados'],
                                ['all', 'Todos'],
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setStatus(value)}
                                    className={`rounded-full border px-4 py-2 text-sm font-semibold ${status === value ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        {requestsQuery.isLoading ? (
                            <div className="py-12 text-center text-sm text-slate-500">Carregando solicitações…</div>
                        ) : requestsQuery.error ? (
                            <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{(requestsQuery.error as Error).message}</div>
                        ) : requestsQuery.data?.length ? (
                            <div className="grid gap-3 md:grid-cols-2">
                                {requestsQuery.data.map((request) => (
                                    <button
                                        key={request.id}
                                        type="button"
                                        onClick={() => { setSelected(request); setNote(request.manager_note ?? ''); }}
                                        className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-emerald-300 hover:shadow-sm"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate font-bold text-slate-900">{request.full_name}</p>
                                                <p className="mt-1 text-sm text-slate-500">{formatCPF(request.cpf)} · CNH {request.cnh_number}</p>
                                                <p className="mt-2 text-xs text-slate-400">{request.departments?.name ?? 'Sem secretaria'} · {new Date(request.submitted_at).toLocaleString('pt-BR')}</p>
                                            </div>
                                            <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">{statusLabel(request.status)}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-14 text-center">
                                <ShieldCheck className="mx-auto h-10 w-10 text-emerald-500" />
                                <p className="mt-3 font-semibold text-slate-700">Nenhuma solicitação nesta situação</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
}

function Detail({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="mt-1 font-medium text-slate-800">{value || '—'}</dd>
        </div>
    );
}
