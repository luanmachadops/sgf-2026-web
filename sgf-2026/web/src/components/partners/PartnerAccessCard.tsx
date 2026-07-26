import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFBadge, SGFButton, SGFCard } from '@/components/sgf';
import { SGFInput } from '@/components/sgf/SGFInput';
import { Loader2, Lock, Mail, Plus, X } from '@/components/sgf/icons';
import { partnersApi, type PartnerType } from '@/lib/backend-api';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/lib/utils';

interface Props {
    partnerType: PartnerType;
    partnerId: string;
    partnerName: string;
    /** Nome do sistema que o parceiro vai acessar, exibido para o gestor. */
    systemLabel: string;
}

/**
 * Card "Acesso ao sistema" nas telas de posto e oficina.
 *
 * Só o admin gerencia acesso de parceiro — o servidor recusa qualquer outro
 * papel, então aqui o card fica em modo leitura para gestor/secretário em vez
 * de oferecer um botão que só daria 403.
 */
export function PartnerAccessCard({ partnerType, partnerId, partnerName, systemLabel }: Props) {
    const { user } = useAuth();
    const qc = useQueryClient();
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';

    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [tempPassword, setTempPassword] = useState<string | null>(null);

    const queryKey = ['partnerAccess', partnerType, partnerId];
    const { data, isLoading } = useQuery({
        queryKey,
        queryFn: () => partnersApi.get(partnerType, partnerId),
        enabled: isAdmin && Boolean(partnerId),
    });
    const access = data?.access ?? null;

    const invalidate = () => qc.invalidateQueries({ queryKey });

    const createMut = useMutation({
        mutationFn: () => partnersApi.create({ partnerType, partnerId, name: name.trim(), email: email.trim() }),
        onSuccess: (res) => {
            setTempPassword(res.tempPassword);
            setCreating(false);
            setName(''); setEmail('');
            invalidate();
            toast.success('Acesso criado. Entregue a senha provisória ao parceiro.');
        },
        onError: (err) => toast.error((err as { message?: string })?.message ?? 'Erro ao criar acesso.'),
    });

    const resetMut = useMutation({
        mutationFn: () => partnersApi.resetPassword(partnerType, partnerId),
        onSuccess: (res) => {
            setTempPassword(res.tempPassword);
            invalidate();
            toast.success('Senha redefinida.');
        },
        onError: (err) => toast.error((err as { message?: string })?.message ?? 'Erro ao redefinir senha.'),
    });

    const blockMut = useMutation({
        mutationFn: (blocked: boolean) => partnersApi.setBlocked(partnerType, partnerId, blocked),
        onSuccess: (res) => {
            invalidate();
            toast.success(res.blocked ? 'Acesso bloqueado.' : 'Acesso liberado.');
        },
        onError: (err) => toast.error((err as { message?: string })?.message ?? 'Erro ao alterar o acesso.'),
    });

    const busy = createMut.isPending || resetMut.isPending || blockMut.isPending;

    return (
        <SGFCard>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Acesso ao sistema</p>
                    <p className="text-sm text-slate-500">{systemLabel} — login próprio do parceiro.</p>
                </div>
                {access
                    ? (access.access_blocked
                        ? <SGFBadge variant="error">Bloqueado</SGFBadge>
                        : <SGFBadge variant="success">Ativo</SGFBadge>)
                    : <SGFBadge variant="default">Sem acesso</SGFBadge>}
            </div>

            {!isAdmin ? (
                <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                    Somente o administrador pode criar ou alterar o acesso do parceiro.
                </p>
            ) : isLoading ? (
                <div className="mt-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : access ? (
                <>
                    <dl className="mt-4 space-y-2 text-sm">
                        <div className="flex justify-between gap-3">
                            <dt className="text-slate-500">Responsável</dt>
                            <dd className="truncate font-semibold text-slate-800">{access.full_name || '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                            <dt className="text-slate-500">E-mail</dt>
                            <dd className="truncate text-slate-700">{access.email || '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                            <dt className="text-slate-500">Último acesso</dt>
                            <dd className="text-slate-700">
                                {access.last_sign_in_at ? formatDate(access.last_sign_in_at) : 'Nunca entrou'}
                            </dd>
                        </div>
                        {access.must_change_password && (
                            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                Senha provisória — o parceiro precisa trocá-la no primeiro acesso.
                            </p>
                        )}
                    </dl>

                    <div className="mt-4 flex flex-wrap gap-2">
                        <SGFButton variant="secondary" size="sm" icon={Lock} disabled={busy}
                            onClick={() => resetMut.mutate()}>
                            Redefinir senha
                        </SGFButton>
                        <SGFButton
                            variant={access.access_blocked ? 'primary' : 'ghost'}
                            size="sm"
                            disabled={busy}
                            onClick={() => blockMut.mutate(!access.access_blocked)}
                        >
                            {access.access_blocked ? 'Liberar acesso' : 'Bloquear acesso'}
                        </SGFButton>
                    </div>
                </>
            ) : creating ? (
                <div className="mt-4 space-y-3">
                    <SGFInput label="Nome do responsável" value={name} onChange={(e) => setName(e.target.value)}
                        placeholder="Quem vai usar o sistema" fullWidth />
                    <SGFInput label="E-mail de acesso" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                        placeholder="contato@empresa.com.br" fullWidth />
                    <p className="text-xs text-slate-400">
                        A senha provisória é gerada automaticamente e aparece uma única vez, para você entregar ao parceiro.
                    </p>
                    <div className="flex gap-2">
                        <SGFButton size="sm" disabled={busy || !name.trim() || !email.trim()} onClick={() => createMut.mutate()}>
                            {createMut.isPending ? 'Criando...' : 'Criar acesso'}
                        </SGFButton>
                        <SGFButton variant="ghost" size="sm" icon={X} disabled={busy} onClick={() => setCreating(false)}>
                            Cancelar
                        </SGFButton>
                    </div>
                </div>
            ) : (
                <>
                    <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                        {partnerName} ainda não tem login. Crie o acesso para que a empresa registre pelo próprio sistema.
                    </p>
                    <SGFButton className="mt-3" size="sm" icon={Plus} onClick={() => setCreating(true)}>
                        Criar acesso
                    </SGFButton>
                </>
            )}

            {tempPassword && (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Senha provisória</p>
                            <p className="mt-1 font-mono text-lg font-bold tracking-wider text-emerald-900">{tempPassword}</p>
                            <p className="mt-1 text-xs text-emerald-700">
                                Anote agora: ela não é exibida de novo. O parceiro troca no primeiro acesso.
                            </p>
                        </div>
                        <button type="button" onClick={() => setTempPassword(null)} className="text-emerald-600 hover:text-emerald-800">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <SGFButton className="mt-3" variant="secondary" size="sm" icon={Mail}
                        onClick={() => {
                            void navigator.clipboard.writeText(tempPassword);
                            toast.success('Senha copiada.');
                        }}>
                        Copiar senha
                    </SGFButton>
                </div>
            )}
        </SGFCard>
    );
}
