import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFBadge, SGFButton, SGFCard } from '@/components/sgf';
import { SGFInput } from '@/components/sgf/SGFInput';
import { ChevronRight, Loader2, Plus, X } from '@/components/sgf/icons';
import { accessManagementApi, type ManagedAccess, type PartnerType } from '@/lib/backend-api';
import { useAuth } from '@/contexts/AuthContext';
import { AccessEditModal } from '@/components/access/AccessEditModal';
import { RemoveAccessDialog, TempPasswordDialog } from '@/components/access/accessShared';
import { loginOf } from '@/components/access/accessRoles';

interface Props {
    partnerType: PartnerType;
    partnerId: string;
    partnerName: string;
    /** Nome do sistema que o parceiro vai acessar, exibido para o gestor. */
    systemLabel: string;
}

/**
 * Card "Usuários do sistema" nas telas de posto e oficina. A empresa pode ter
 * vários usuários; cada um abre a mesma edição da Gestão de acessos (nome,
 * e-mail, nova senha, bloquear, remover). Só o administrador gerencia.
 */
export function PartnerAccessCard({ partnerType, partnerId, partnerName, systemLabel }: Props) {
    const { user } = useAuth();
    const qc = useQueryClient();
    const canManage = user?.accountRole === 'admin' || user?.accountRole === 'superadmin';

    const [adding, setAdding] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [editing, setEditing] = useState<ManagedAccess | null>(null);
    const [removing, setRemoving] = useState<ManagedAccess | null>(null);
    const [credential, setCredential] = useState<{ name: string; login: string; password: string } | null>(null);

    const queryKey = ['partner-users', partnerType, partnerId];
    const users = useQuery({
        queryKey,
        queryFn: () => accessManagementApi.listPartnerUsers(partnerType, partnerId),
        enabled: canManage && Boolean(partnerId),
    });
    const refresh = () => {
        void qc.invalidateQueries({ queryKey });
        void qc.invalidateQueries({ queryKey: ['managed-accesses'] });
    };

    const create = useMutation({
        mutationFn: () => accessManagementApi.create({ role: partnerType, partnerId, name: name.trim(), email: email.trim() }),
        onSuccess: (created) => {
            setAdding(false);
            setName(''); setEmail('');
            refresh();
            if (created.tempPassword) setCredential({ name: created.full_name, login: loginOf(created), password: created.tempPassword });
        },
        onError: (error) => toast.error((error as Error).message),
    });

    const list = users.data ?? [];
    const active = list.filter((item) => !item.access_blocked).length;

    return (
        <SGFCard>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Usuários do sistema</p>
                    <p className="text-sm text-slate-500">{systemLabel} — cada pessoa com o próprio login.</p>
                </div>
                {canManage && !users.isLoading && !users.isError && (
                    <SGFBadge variant={active > 0 ? 'success' : 'default'}>{active > 0 ? `${active} ativo${active > 1 ? 's' : ''}` : 'Sem acesso'}</SGFBadge>
                )}
            </div>

            {!canManage ? (
                <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                    Somente o administrador pode criar ou alterar os acessos do parceiro.
                </p>
            ) : users.isLoading ? (
                <div className="mt-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : users.isError ? (
                <div className="mt-4" role="alert">
                    <p className="text-sm text-red-700">{(users.error as Error).message}</p>
                    <SGFButton variant="ghost" size="sm" onClick={() => void users.refetch()}>Tentar novamente</SGFButton>
                </div>
            ) : (
                <>
                    {list.length === 0 && !adding && (
                        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                            {partnerName} ainda não tem usuários. Adicione quem vai usar o sistema.
                        </p>
                    )}
                    {list.length > 0 && (
                        <ul className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-100">
                            {list.map((item) => (
                                <li key={item.id}>
                                    <button type="button" onClick={() => setEditing(item)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50">
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-semibold text-slate-800">{item.full_name}</span>
                                            <span className="block truncate text-xs text-slate-500">{item.email}</span>
                                        </span>
                                        {item.must_change_password && !item.access_blocked && (
                                            <span className="hidden rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 sm:inline">Senha provisória</span>
                                        )}
                                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${item.access_blocked ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                            {item.access_blocked ? 'Bloqueado' : 'Ativo'}
                                        </span>
                                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {adding ? (
                        <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                            <SGFInput label="Nome do responsável" value={name} onChange={(event) => setName(event.target.value)} placeholder="Quem vai usar o sistema" fullWidth />
                            <SGFInput label="E-mail de acesso" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="contato@empresa.com.br" fullWidth />
                            <p className="text-xs text-slate-400">A senha provisória é gerada pelo sistema e aparece uma única vez, para você entregar à pessoa.</p>
                            <div className="flex gap-2">
                                <SGFButton size="sm" loading={create.isPending} disabled={name.trim().length < 3 || !email.includes('@')} onClick={() => create.mutate()}>
                                    Criar usuário
                                </SGFButton>
                                <SGFButton variant="ghost" size="sm" icon={X} disabled={create.isPending} onClick={() => setAdding(false)}>Cancelar</SGFButton>
                            </div>
                        </div>
                    ) : (
                        <SGFButton className="mt-3" size="sm" variant={list.length ? 'outline' : 'primary'} icon={Plus} onClick={() => setAdding(true)}>
                            Adicionar usuário
                        </SGFButton>
                    )}
                </>
            )}

            <AccessEditModal
                access={editing}
                onClose={() => setEditing(null)}
                onSaved={refresh}
                onRemove={(access) => { setEditing(null); setRemoving(access); }}
                onTempPassword={setCredential}
            />
            <RemoveAccessDialog access={removing} onClose={() => setRemoving(null)} onRemoved={() => { setRemoving(null); refresh(); }} />
            <TempPasswordDialog credential={credential} onClose={() => setCredential(null)} />
        </SGFCard>
    );
}
