import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFButton, SGFCard } from '@/components/sgf';
import { ProfilePhoto } from '@/components/sgf/ProfilePhoto';
import { Calendar, KeyRound, Lock, LockOpen, Mail, Pencil, Phone, Plus, ShieldCheck, User } from '@/components/sgf/icons';
import { AccessEditModal } from '@/components/access/AccessEditModal';
import { RemoveAccessDialog, TempPasswordDialog } from '@/components/access/accessShared';
import { loginOf } from '@/components/access/accessRoles';
import { accessManagementApi, type ManagedAccess, type UpdateManagedAccess } from '@/lib/backend-api';
import { departmentsApi, type DepartmentSecretary } from '@/lib/supabase-api';
import { ALL_ACCESS_MODULES } from '@/lib/accessModules';
import { cn, formatDate, formatPhone } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

function initials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '–';
    return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function toManagedAccess(secretary: DepartmentSecretary): ManagedAccess {
    return { ...secretary, role: 'secretario' };
}

function InfoRow({ icon: Icon, label, children }: { icon: typeof Mail; label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-3 rounded-[14px] border border-slate-200 bg-white px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
                <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-400">{label}</p>
                <div className="truncate text-sm font-semibold text-slate-800">{children}</div>
            </div>
        </div>
    );
}

/**
 * Secretário(a) responsável pela pasta: foto, contato e, para o administrador,
 * edição dos dados e gestão do acesso (nova senha, bloqueio, remoção).
 */
export function DepartmentSecretaryCard({ departmentId, onCreate }: { departmentId: string; onCreate: () => void }) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const canManage = user?.accountRole === 'admin' || user?.accountRole === 'superadmin';
    const [editing, setEditing] = useState<ManagedAccess | null>(null);
    const [removing, setRemoving] = useState<ManagedAccess | null>(null);
    const [credential, setCredential] = useState<{ name: string; login: string; password: string } | null>(null);

    const { data: secretaries = [], isLoading } = useQuery({
        queryKey: ['departments', 'secretaries', departmentId],
        queryFn: () => departmentsApi.getSecretaries(departmentId),
    });

    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: ['departments', 'secretaries'] });
        void queryClient.invalidateQueries({ queryKey: ['managed-accesses'] });
    };

    const action = useMutation({
        mutationFn: ({ id, patch }: { id: string; patch: UpdateManagedAccess }) => accessManagementApi.update(id, patch),
        onSuccess: (result, { patch }) => {
            if (patch.resetPassword && result.tempPassword) {
                setCredential({ name: result.full_name, login: loginOf(result), password: result.tempPassword });
            } else {
                toast.success(patch.accessBlocked ? 'Acesso bloqueado.' : 'Acesso liberado.');
            }
            refresh();
        },
        onError: (error) => toast.error((error as Error).message),
    });

    return (
        <SGFCard padding="lg" className="border border-slate-200/80">
            <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold text-slate-900">Secretário(a) responsável</h3>
                    <p className="text-sm text-slate-500">Contato e acesso de quem responde pela pasta.</p>
                </div>
                {canManage && secretaries.length > 0 && (
                    <SGFButton variant="ghost" size="sm" icon={Plus} onClick={onCreate}>Adicionar</SGFButton>
                )}
            </div>

            {isLoading ? (
                <div className="h-40 animate-pulse rounded-[18px] bg-slate-100" />
            ) : secretaries.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed border-slate-200 px-6 py-10 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                        <User className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-slate-700">Nenhum secretário vinculado</p>
                        <p className="text-xs text-slate-500">Cadastre quem responde pela pasta para ele acompanhar a frota.</p>
                    </div>
                    {canManage && <SGFButton variant="outline" size="sm" icon={Plus} onClick={onCreate}>Cadastrar secretário</SGFButton>}
                </div>
            ) : (
                <div className="space-y-6">
                    {secretaries.map((secretary) => {
                        const modules = secretary.allowed_modules?.length ?? 0;
                        const busy = action.isPending && action.variables?.id === secretary.id;
                        const status = secretary.access_blocked
                            ? { label: 'Acesso bloqueado', className: 'bg-rose-50 text-rose-600', dot: 'bg-rose-500' }
                            : secretary.must_change_password
                                ? { label: 'Aguardando 1º acesso', className: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' }
                                : { label: 'Acesso ativo', className: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' };
                        return (
                            <div key={secretary.id} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                                {/* Identidade */}
                                <div className="flex items-center gap-4 rounded-[18px] bg-gradient-to-br from-[var(--sgf-dark)] to-[color-mix(in_srgb,var(--sgf-dark)_80%,var(--sgf-primary))] p-5 text-white">
                                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-white/10 ring-2 ring-white/20">
                                        <ProfilePhoto
                                            src={secretary.photo_url}
                                            alt={secretary.full_name}
                                            className="h-full w-full object-cover"
                                            fallback={<span className="flex h-full w-full items-center justify-center text-xl font-bold text-white/80">{initials(secretary.full_name)}</span>}
                                        />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Secretário(a)</p>
                                        <p className="truncate text-lg font-bold leading-tight">{secretary.full_name}</p>
                                        <span className={cn('mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', status.className)}>
                                            <span className={cn('h-1.5 w-1.5 rounded-full', status.dot)} />
                                            {status.label}
                                        </span>
                                    </div>
                                </div>

                                {/* Dados e ações */}
                                <div className="flex flex-col gap-3">
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <InfoRow icon={Mail} label="E-mail (login)">
                                            {secretary.email
                                                ? <a href={`mailto:${secretary.email}`} className="hover:text-[var(--sgf-primary)] hover:underline">{secretary.email}</a>
                                                : <span className="italic text-slate-400">Não informado</span>}
                                        </InfoRow>
                                        <InfoRow icon={Phone} label="Telefone">
                                            {secretary.phone
                                                ? <a href={`tel:${secretary.phone}`} className="hover:text-[var(--sgf-primary)] hover:underline">{formatPhone(secretary.phone)}</a>
                                                : <span className="italic text-slate-400">Não informado</span>}
                                        </InfoRow>
                                        <InfoRow icon={ShieldCheck} label="Abas liberadas">
                                            {modules >= ALL_ACCESS_MODULES.length ? 'Todas' : `${modules} de ${ALL_ACCESS_MODULES.length}`}
                                        </InfoRow>
                                        <InfoRow icon={Calendar} label="No sistema desde">
                                            {formatDate(secretary.created_at)}
                                        </InfoRow>
                                    </div>

                                    {canManage && (
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            <SGFButton variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(toManagedAccess(secretary))}>
                                                Editar dados
                                            </SGFButton>
                                            <SGFButton variant="outline" size="sm" icon={KeyRound} disabled={busy}
                                                onClick={() => action.mutate({ id: secretary.id, patch: { resetPassword: true } })}>
                                                Gerar nova senha
                                            </SGFButton>
                                            <SGFButton variant="outline" size="sm" icon={secretary.access_blocked ? LockOpen : Lock} disabled={busy}
                                                onClick={() => action.mutate({ id: secretary.id, patch: { accessBlocked: !secretary.access_blocked } })}>
                                                {secretary.access_blocked ? 'Liberar acesso' : 'Bloquear acesso'}
                                            </SGFButton>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <AccessEditModal
                access={editing}
                onClose={() => setEditing(null)}
                onSaved={refresh}
                onRemove={(access) => { setEditing(null); setRemoving(access); }}
                onTempPassword={setCredential}
            />
            <RemoveAccessDialog
                access={removing}
                onClose={() => setRemoving(null)}
                onRemoved={() => { setRemoving(null); refresh(); }}
            />
            <TempPasswordDialog credential={credential} onClose={() => setCredential(null)} />
        </SGFCard>
    );
}
