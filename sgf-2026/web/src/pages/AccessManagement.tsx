import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useHeader } from '@/contexts/HeaderContext';
import { useAuth } from '@/contexts/AuthContext';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Check, KeyRound, Plus, ShieldCheck, Trash2, Users } from '@/components/sgf/icons';
import { ACCESS_MODULES, ALL_ACCESS_MODULES } from '@/lib/accessModules';
import {
    accessManagementApi,
    type CreateManagedAccess,
    type ManagedAccess,
    type ManagedAccessRole,
} from '@/lib/backend-api';
import { departmentsApi, tenantApi } from '@/lib/supabase-api';
import { PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';

const ROLE_LABEL: Record<ManagedAccessRole, string> = {
    admin: 'Administrador',
    gestor: 'Gestor',
    secretario: 'Secretário',
    motorista: 'Motorista',
};

function randomPassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const values = crypto.getRandomValues(new Uint8Array(PASSWORD_MIN_LENGTH));
    return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
}

function ModuleChecks({
    value,
    onChange,
}: {
    value: string[];
    onChange: (modules: string[]) => void;
}) {
    const allSelected = value.length === ALL_ACCESS_MODULES.length;
    return (
        <div>
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold text-slate-800">Abas permitidas</p>
                    <p className="text-xs text-slate-500">As rotas e o menu respeitam esta seleção.</p>
                </div>
                <button
                    type="button"
                    onClick={() => onChange(allSelected ? [] : [...ALL_ACCESS_MODULES])}
                    className="text-xs font-bold text-[var(--sgf-primary)] hover:underline"
                >
                    {allSelected ? 'Desmarcar todas' : 'Marcar todas'}
                </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
                {ACCESS_MODULES.map((module) => {
                    const checked = value.includes(module.id);
                    return (
                        <label
                            key={module.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                                checked
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                    : 'border-slate-200 bg-white text-slate-600'
                            }`}
                        >
                            <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => onChange(
                                    checked
                                        ? value.filter((item) => item !== module.id)
                                        : [...value, module.id],
                                )}
                                className="sr-only"
                            />
                            <span className={`grid h-5 w-5 place-items-center rounded-md ${checked ? 'bg-emerald-600 text-white' : 'border border-slate-300'}`}>
                                {checked && <Check className="h-3.5 w-3.5" />}
                            </span>
                            {module.label}
                        </label>
                    );
                })}
            </div>
        </div>
    );
}

export default function AccessManagement() {
    const { setTitle, setDescription } = useHeader();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [createOpen, setCreateOpen] = useState(false);
    const [editing, setEditing] = useState<ManagedAccess | null>(null);
    const [tempCredential, setTempCredential] = useState<{ name: string; cpf: string; password: string } | null>(null);
    const [role, setRole] = useState<ManagedAccessRole>('secretario');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [cpf, setCpf] = useState('');
    const [registrationNumber, setRegistrationNumber] = useState('');
    const [password, setPassword] = useState('');
    const [departmentId, setDepartmentId] = useState('');
    const [tenantId, setTenantId] = useState('');
    const [allowedModules, setAllowedModules] = useState<string[]>([...ALL_ACCESS_MODULES]);
    const [editModules, setEditModules] = useState<string[]>([]);

    useEffect(() => {
        setTitle('Gerenciamento de acessos');
        setDescription('Crie, desative e defina quais áreas cada usuário pode acessar.');
    }, [setDescription, setTitle]);

    const accesses = useQuery({
        queryKey: ['managed-accesses'],
        queryFn: accessManagementApi.list,
    });
    const departments = useQuery({
        queryKey: ['departments', 'access-management'],
        queryFn: departmentsApi.getAll,
    });
    const tenants = useQuery({
        queryKey: ['tenants', 'access-management'],
        queryFn: tenantApi.getAll,
        enabled: user?.accountRole === 'superadmin',
    });

    const roleOptions = useMemo(() => {
        const roles: Array<{ value: string; label: string }> = [
            { value: 'secretario', label: 'Secretário' },
            { value: 'motorista', label: 'Motorista' },
            { value: 'gestor', label: 'Gestor' },
        ];
        if (user?.accountRole === 'admin' || user?.accountRole === 'superadmin') {
            roles.push({ value: 'admin', label: 'Administrador' });
        }
        return roles;
    }, [user?.accountRole]);

    const departmentOptions = (departments.data ?? [])
        .filter((item) => user?.accountRole !== 'superadmin' || !tenantId || item.tenant_id === tenantId)
        .map((item) => ({
        value: item.id,
        label: item.name,
        }));
    const tenantOptions = (tenants.data ?? []).map((tenant) => ({
        value: tenant.id,
        label: tenant.name,
    }));

    const resetCreate = () => {
        setRole('secretario');
        setName('');
        setEmail('');
        setCpf('');
        setRegistrationNumber('');
        setPassword('');
        setDepartmentId('');
        setTenantId('');
        setAllowedModules([...ALL_ACCESS_MODULES]);
    };

    const createAccess = useMutation({
        mutationFn: (payload: CreateManagedAccess) => accessManagementApi.create(payload),
        onSuccess: (created) => {
            toast.success('Acesso criado com sucesso.');
            if (created.role === 'motorista' && created.tempPassword && created.cpf) {
                setTempCredential({
                    name: created.full_name,
                    cpf: created.cpf,
                    password: created.tempPassword,
                });
            }
            setCreateOpen(false);
            resetCreate();
            void queryClient.invalidateQueries({ queryKey: ['managed-accesses'] });
            void queryClient.invalidateQueries({ queryKey: ['drivers'] });
        },
        onError: (error) => toast.error((error as Error).message),
    });

    const updateAccess = useMutation({
        mutationFn: ({ id, update }: { id: string; update: { accessBlocked?: boolean; allowedModules?: string[] } }) =>
            accessManagementApi.update(id, update),
        onSuccess: () => {
            toast.success('Permissões atualizadas.');
            setEditing(null);
            void queryClient.invalidateQueries({ queryKey: ['managed-accesses'] });
        },
        onError: (error) => toast.error((error as Error).message),
    });

    const removeAccess = useMutation({
        mutationFn: accessManagementApi.remove,
        onSuccess: () => {
            toast.success('Acesso excluído.');
            void queryClient.invalidateQueries({ queryKey: ['managed-accesses'] });
            void queryClient.invalidateQueries({ queryKey: ['drivers'] });
        },
        onError: (error) => toast.error((error as Error).message),
    });

    const submitCreate = () => {
        if (!name.trim()) return toast.error('Informe o nome completo.');
        if (role === 'motorista') {
            if (cpf.replace(/\D/g, '').length !== 11) return toast.error('Informe um CPF válido.');
        } else {
            if (!email.includes('@')) return toast.error('Informe um e-mail válido.');
            if (password.length < PASSWORD_MIN_LENGTH) return toast.error(`A senha deve ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.`);
        }
        if (role === 'secretario' && !departmentId) return toast.error('Selecione a secretaria.');
        if (user?.accountRole === 'superadmin' && !tenantId) return toast.error('Selecione a prefeitura.');
        if (role !== 'motorista' && allowedModules.length === 0) return toast.error('Selecione ao menos uma aba.');

        createAccess.mutate({
            role,
            name: name.trim(),
            email: email.trim(),
            cpf: cpf.replace(/\D/g, ''),
            registrationNumber: registrationNumber.trim(),
            password,
            departmentId: departmentId || undefined,
            tenantId: tenantId || undefined,
            allowedModules,
        });
    };

    const openEdit = (access: ManagedAccess) => {
        setEditing(access);
        setEditModules(access.allowed_modules ?? []);
    };

    const rows = accesses.data ?? [];
    const activeCount = rows.filter((item) => !item.access_blocked).length;

    return (
        <div className="space-y-6 pb-16">
            <div className="grid gap-4 sm:grid-cols-3">
                <SGFCard padding="lg">
                    <p className="text-sm font-semibold text-slate-400">Acessos cadastrados</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{rows.length}</p>
                </SGFCard>
                <SGFCard padding="lg">
                    <p className="text-sm font-semibold text-slate-400">Ativos</p>
                    <p className="mt-2 text-3xl font-bold text-emerald-600">{activeCount}</p>
                </SGFCard>
                <SGFCard padding="lg" className="flex items-center justify-center">
                    <SGFButton icon={Plus} onClick={() => setCreateOpen(true)}>Novo acesso</SGFButton>
                </SGFCard>
            </div>

            <SGFCard padding="none" className="overflow-hidden">
                <div className="border-b border-slate-100 px-5 py-4">
                    <h2 className="font-bold text-slate-900">Usuários da prefeitura</h2>
                    <p className="text-sm text-slate-500">Administradores, gestores, secretários e motoristas.</p>
                </div>
                {accesses.isLoading ? (
                    <div className="p-8 text-center text-sm text-slate-500">Carregando acessos…</div>
                ) : accesses.isError ? (
                    <div className="p-8 text-center">
                        <p className="text-sm font-semibold text-red-700">Não foi possível carregar os acessos.</p>
                        <p className="mt-1 text-xs text-slate-500">{(accesses.error as Error).message}</p>
                        <SGFButton className="mt-4" variant="ghost" size="sm" onClick={() => accesses.refetch()}>
                            Tentar novamente
                        </SGFButton>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">Nenhum acesso encontrado.</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {rows.map((access) => (
                            <div key={access.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center">
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                                        {access.role === 'motorista' ? <Users className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate font-bold text-slate-900">{access.full_name}</p>
                                        <p className="truncate text-sm text-slate-500">
                                            {access.email || access.cpf || 'Sem identificação'} · {ROLE_LABEL[access.role]}
                                            {access.departments?.name ? ` · ${access.departments.name}` : ''}
                                            {user?.accountRole === 'superadmin' && access.tenants?.name ? ` · ${access.tenants.name}` : ''}
                                        </p>
                                    </div>
                                </div>
                                <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${access.access_blocked ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                    {access.access_blocked ? 'Desativado' : 'Ativo'}
                                </span>
                                <div className="flex flex-wrap gap-2">
                                    {access.role !== 'motorista' && (
                                        <SGFButton variant="ghost" size="sm" onClick={() => openEdit(access)}>
                                            Permissões
                                        </SGFButton>
                                    )}
                                    <SGFButton
                                        variant="ghost"
                                        size="sm"
                                        disabled={access.id === user?.id || updateAccess.isPending}
                                        onClick={() => updateAccess.mutate({
                                            id: access.id,
                                            update: { accessBlocked: !access.access_blocked },
                                        })}
                                    >
                                        {access.access_blocked ? 'Reativar' : 'Desativar'}
                                    </SGFButton>
                                    <button
                                        type="button"
                                        title="Excluir acesso"
                                        disabled={access.id === user?.id || removeAccess.isPending}
                                        onClick={() => {
                                            if (window.confirm(`Excluir definitivamente o acesso de ${access.full_name}?`)) {
                                                removeAccess.mutate(access.id);
                                            }
                                        }}
                                        className="grid h-9 w-9 place-items-center rounded-full text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </SGFCard>

            <Modal
                isOpen={createOpen}
                onClose={() => { setCreateOpen(false); resetCreate(); }}
                title="Criar novo acesso"
                description="Defina o cargo, os dados de login e as abas disponíveis."
                size="lg"
                footer={(
                    <ModalFooter>
                        <SGFButton variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</SGFButton>
                        <SGFButton icon={KeyRound} loading={createAccess.isPending} onClick={submitCreate}>Criar acesso</SGFButton>
                    </ModalFooter>
                )}
            >
                <div className="space-y-5">
                    {user?.accountRole === 'superadmin' && (
                        <SGFSelect
                            label="Prefeitura"
                            value={tenantId}
                            onChange={(value) => {
                                setTenantId(value);
                                setDepartmentId('');
                            }}
                            options={tenantOptions}
                            placeholder="Selecione a prefeitura"
                            fullWidth
                        />
                    )}
                    <SGFSelect
                        label="Cargo"
                        value={role}
                        onChange={(value) => setRole(value as ManagedAccessRole)}
                        options={roleOptions}
                        fullWidth
                    />
                    <SGFInput label="Nome completo" value={name} onChange={(event) => setName(event.target.value)} fullWidth />
                    {role === 'motorista' ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <SGFInput label="CPF" value={cpf} onChange={(event) => setCpf(event.target.value)} inputMode="numeric" fullWidth />
                            <SGFInput label="Matrícula (opcional)" value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} fullWidth />
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <SGFInput label="E-mail de acesso" type="email" value={email} onChange={(event) => setEmail(event.target.value)} fullWidth />
                            <div className="space-y-2">
                                <SGFInput label="Senha inicial" type="password" value={password} onChange={(event) => setPassword(event.target.value)} fullWidth />
                                <button type="button" onClick={() => setPassword(randomPassword())} className="text-xs font-bold text-[var(--sgf-primary)]">
                                    Gerar senha segura
                                </button>
                            </div>
                        </div>
                    )}
                    {(role === 'secretario' || role === 'motorista') && (
                        <SGFSelect
                            label={role === 'secretario' ? 'Secretaria' : 'Secretaria (opcional)'}
                            value={departmentId}
                            onChange={setDepartmentId}
                            options={departmentOptions}
                            placeholder="Selecione a secretaria"
                            fullWidth
                        />
                    )}
                    {role !== 'motorista' && <ModuleChecks value={allowedModules} onChange={setAllowedModules} />}
                    {role === 'motorista' && (
                        <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                            O sistema gerará uma senha provisória, exibida uma única vez. O motorista trocará a senha no primeiro acesso.
                        </p>
                    )}
                </div>
            </Modal>

            <Modal
                isOpen={Boolean(editing)}
                onClose={() => setEditing(null)}
                title={`Permissões de ${editing?.full_name ?? ''}`}
                description="As alterações passam a valer na próxima navegação do usuário."
                size="lg"
                footer={(
                    <ModalFooter>
                        <SGFButton variant="ghost" onClick={() => setEditing(null)}>Cancelar</SGFButton>
                        <SGFButton
                            loading={updateAccess.isPending}
                            onClick={() => editing && updateAccess.mutate({
                                id: editing.id,
                                update: { allowedModules: editModules },
                            })}
                        >
                            Salvar permissões
                        </SGFButton>
                    </ModalFooter>
                )}
            >
                <ModuleChecks value={editModules} onChange={setEditModules} />
            </Modal>

            <Modal
                isOpen={Boolean(tempCredential)}
                onClose={() => setTempCredential(null)}
                title="Acesso do motorista criado"
                description="Copie agora: a senha provisória não será exibida novamente."
                size="sm"
            >
                <div className="space-y-3 rounded-2xl bg-slate-900 p-5 text-white">
                    <p className="font-bold">{tempCredential?.name}</p>
                    <p className="text-sm text-slate-300">CPF: {tempCredential?.cpf}</p>
                    <p className="font-mono text-xl font-bold text-emerald-300">{tempCredential?.password}</p>
                    <SGFButton
                        fullWidth
                        onClick={() => {
                            if (!tempCredential) return;
                            void navigator.clipboard.writeText(
                                `CPF: ${tempCredential.cpf}\nSenha provisória: ${tempCredential.password}`,
                            );
                            toast.success('Credenciais copiadas.');
                        }}
                    >
                        Copiar credenciais
                    </SGFButton>
                </div>
            </Modal>
        </div>
    );
}
