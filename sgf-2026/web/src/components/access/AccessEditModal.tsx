import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { KeyRound, Lock, LockOpen, Trash2 } from '@/components/sgf/icons';
import { accessManagementApi, type ManagedAccess, type ManagedAccessRole, type UpdateManagedAccess } from '@/lib/backend-api';
import { departmentsApi } from '@/lib/supabase-api';
import { useAuth } from '@/contexts/AuthContext';
import { useSyncOnChange } from '@/hooks/useSyncOnChange';
import { ModuleChecks } from './accessShared';
import { ROLE_LABEL, STAFF_ROLES, loginOf } from './accessRoles';

/**
 * Tudo sobre um acesso num lugar só: dados (nome, e-mail, cargo, secretaria),
 * abas permitidas e ações (nova senha, bloquear, remover). Salvar envia só o
 * que mudou.
 */
export function AccessEditModal({ access, onClose, onSaved, onRemove, onTempPassword }: {
    access: ManagedAccess | null;
    onClose: () => void;
    onSaved: () => void;
    onRemove: (access: ManagedAccess) => void;
    onTempPassword: (credential: { name: string; login: string; password: string }) => void;
}) {
    const { user } = useAuth();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<ManagedAccessRole>('secretario');
    const [departmentId, setDepartmentId] = useState('');
    const [modules, setModules] = useState<string[]>([]);

    useSyncOnChange(access, () => {
        if (!access) return;
        setName(access.full_name ?? '');
        setEmail(access.email ?? '');
        setRole(access.role);
        setDepartmentId(access.department_id ?? '');
        setModules(access.allowed_modules ?? []);
    });

    const departments = useQuery({
        queryKey: ['departments', 'access-management'],
        queryFn: departmentsApi.getAll,
        enabled: Boolean(access),
    });

    const isSelf = access?.id === user?.id;
    const isStaff = access ? STAFF_ROLES.includes(access.role) : false;
    const isDriver = access?.role === 'motorista';
    const isPartner = access?.role === 'posto' || access?.role === 'oficina';
    const showDepartment = (isStaff && role === 'secretario') || isDriver;

    const save = useMutation({
        mutationFn: async () => {
            if (!access) return null;
            const patch: UpdateManagedAccess = {};
            if (name.trim() !== (access.full_name ?? '')) patch.name = name.trim();
            if (email.trim().toLowerCase() !== (access.email ?? '').toLowerCase()) patch.email = email.trim();
            if (isStaff && role !== access.role) patch.role = role;
            if (showDepartment && departmentId !== (access.department_id ?? '')) patch.departmentId = departmentId || null;
            if (isStaff && !isSelf && JSON.stringify([...modules].sort()) !== JSON.stringify([...(access.allowed_modules ?? [])].sort())) {
                patch.allowedModules = modules;
            }
            if (Object.keys(patch).length === 0) return null;
            if (role === 'secretario' && isStaff && !departmentId) throw new Error('Secretário precisa de uma secretaria.');
            return accessManagementApi.update(access.id, patch);
        },
        onSuccess: (result) => {
            toast.success(result ? 'Acesso atualizado.' : 'Nada para salvar.');
            onSaved();
            onClose();
        },
        onError: (error) => toast.error((error as Error).message),
    });

    const action = useMutation({
        mutationFn: (patch: UpdateManagedAccess) => accessManagementApi.update(access!.id, patch),
        onSuccess: (result, patch) => {
            if (patch.resetPassword && result.tempPassword) {
                onTempPassword({ name: result.full_name, login: loginOf(result), password: result.tempPassword });
            } else {
                toast.success(patch.accessBlocked ? 'Acesso bloqueado.' : 'Acesso liberado.');
            }
            onSaved();
            onClose();
        },
        onError: (error) => toast.error((error as Error).message),
    });

    const departmentOptions = (departments.data ?? [])
        .filter((item) => !access || item.tenant_id === access.tenant_id)
        .map((item) => ({ value: item.id, label: item.name }));
    const busy = save.isPending || action.isPending;

    return (
        <Modal
            isOpen={Boolean(access)}
            onClose={onClose}
            title="Editar acesso"
            description={access ? `${ROLE_LABEL[access.role]}${access.fuel_stations?.name ? ` · ${access.fuel_stations.name}` : ''}${access.repair_shops?.name ? ` · ${access.repair_shops.name}` : ''}` : undefined}
            size="lg"
            footer={(
                <ModalFooter>
                    <SGFButton variant="ghost" onClick={onClose}>Cancelar</SGFButton>
                    <SGFButton loading={save.isPending} disabled={busy || name.trim().length < 3} onClick={() => save.mutate()}>Salvar alterações</SGFButton>
                </ModalFooter>
            )}
        >
            {access && (
                <div className="space-y-6">
                    <section className="grid gap-4 sm:grid-cols-2">
                        <SGFInput label="Nome completo" value={name} onChange={(event) => setName(event.target.value)} fullWidth className="sm:col-span-2" />
                        <SGFInput
                            label={isDriver ? 'E-mail (contato)' : 'E-mail de acesso'}
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            hint={isDriver ? `O motorista entra pelo ${loginOf(access)}.` : 'É o login. A pessoa passa a entrar com o novo e-mail.'}
                            fullWidth
                        />
                        {isStaff && (
                            <SGFSelect
                                label="Cargo"
                                value={role}
                                onChange={(value) => setRole(value as ManagedAccessRole)}
                                options={STAFF_ROLES.map((item) => ({ value: item, label: ROLE_LABEL[item] }))}
                                disabled={isSelf}
                                hint={isSelf ? 'Outro administrador altera o seu cargo.' : undefined}
                                fullWidth
                            />
                        )}
                        {showDepartment && (
                            <SGFSelect
                                label={role === 'secretario' && isStaff ? 'Secretaria' : 'Secretaria (opcional)'}
                                value={departmentId}
                                onChange={setDepartmentId}
                                options={departmentOptions}
                                placeholder="Selecione a secretaria"
                                fullWidth
                            />
                        )}
                    </section>

                    {isStaff && !isSelf && <ModuleChecks value={modules} onChange={setModules} />}
                    {isPartner && (
                        <p className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                            Usuários de posto e oficina acessam só o portal da própria empresa.
                        </p>
                    )}

                    {!isSelf && (
                        <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <p className="mb-3 text-sm font-semibold text-slate-800">Ações</p>
                            <div className="flex flex-wrap gap-2">
                                <SGFButton variant="secondary" size="sm" icon={KeyRound} disabled={busy}
                                    onClick={() => action.mutate({ resetPassword: true })}>
                                    Gerar nova senha
                                </SGFButton>
                                <SGFButton variant="outline" size="sm" icon={access.access_blocked ? LockOpen : Lock} disabled={busy}
                                    onClick={() => action.mutate({ accessBlocked: !access.access_blocked })}>
                                    {access.access_blocked ? 'Liberar acesso' : 'Bloquear acesso'}
                                </SGFButton>
                                <SGFButton variant="ghost" size="sm" icon={Trash2} disabled={busy} className="!text-red-600"
                                    onClick={() => onRemove(access)}>
                                    Remover acesso
                                </SGFButton>
                            </div>
                            <p className="mt-3 text-xs text-slate-500">
                                Nova senha: o sistema gera uma senha provisória, mostrada uma vez, e a pessoa troca no primeiro acesso.
                            </p>
                        </section>
                    )}
                </div>
            )}
        </Modal>
    );
}
