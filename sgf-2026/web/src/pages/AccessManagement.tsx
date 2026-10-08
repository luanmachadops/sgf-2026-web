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
import { ChevronRight, Fuel, KeyRound, Plus, ShieldCheck, Users, Wrench } from '@/components/sgf/icons';
import { ExpandableSearch } from '@/components/sgf/ExpandableSearch';
import { ALL_ACCESS_MODULES } from '@/lib/accessModules';
import { accessManagementApi, type CreateManagedAccess, type ManagedAccess, type ManagedAccessRole } from '@/lib/backend-api';
import { departmentsApi, repairShopsApi, stationsApi, tenantApi } from '@/lib/supabase-api';
import { AccessEditModal } from '@/components/access/AccessEditModal';
import { ModuleChecks, RemoveAccessDialog, TempPasswordDialog } from '@/components/access/accessShared';
import { ROLE_LABEL, STAFF_ROLES, loginOf } from '@/components/access/accessRoles';

// Uma aba por tipo de usuário. Os acessos continuam também nas telas de
// origem (Motoristas, Secretarias, cadastro do posto e da oficina).
const TABS: Array<{ role: ManagedAccessRole; label: string; singular: string; hint: string }> = [
    { role: 'secretario', label: 'Secretários', singular: 'secretário', hint: 'Acesso restrito à própria secretaria.' },
    { role: 'motorista', label: 'Motoristas', singular: 'motorista', hint: 'Entram no app pelo CPF.' },
    { role: 'oficina', label: 'Oficinas', singular: 'usuário de oficina', hint: 'Acessam só o portal da própria oficina.' },
    { role: 'posto', label: 'Postos', singular: 'usuário de posto', hint: 'Acessam só o portal do próprio posto.' },
    { role: 'gestor', label: 'Gestão', singular: 'gestor', hint: 'Gestores da frota, com as abas permitidas.' },
    { role: 'admin', label: 'Administração', singular: 'administrador', hint: 'Acesso total, inclusive a esta tela.' },
];

const ROLE_OPTIONS: Array<{ value: ManagedAccessRole; label: string }> = [
    { value: 'admin', label: 'Administrador' },
    { value: 'gestor', label: 'Gestor' },
    { value: 'secretario', label: 'Secretário' },
    { value: 'motorista', label: 'Motorista' },
    { value: 'posto', label: 'Usuário de posto' },
    { value: 'oficina', label: 'Usuário de oficina' },
];

function RoleIcon({ role }: { role: ManagedAccessRole }) {
    const Icon = role === 'motorista' ? Users : role === 'posto' ? Fuel : role === 'oficina' ? Wrench : ShieldCheck;
    return (
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--sgf-primary-soft)] text-[var(--sgf-primary)]">
            <Icon className="h-5 w-5" />
        </span>
    );
}

/**
 * Gestão de acessos — só administrador e superadministrador (a rota, o menu e a
 * API bloqueiam os demais). Cada linha abre a edição completa do acesso.
 */
export default function AccessManagement() {
    const { setTitle, setDescription } = useHeader();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const isSuperadmin = user?.accountRole === 'superadmin';

    const [tab, setTab] = useState<ManagedAccessRole>('secretario');
    const current = TABS.find((item) => item.role === tab)!;
    const [search, setSearch] = useState('');
    const [showBlocked, setShowBlocked] = useState(true);
    const [editing, setEditing] = useState<ManagedAccess | null>(null);
    const [removing, setRemoving] = useState<ManagedAccess | null>(null);
    const [credential, setCredential] = useState<{ name: string; login: string; password: string } | null>(null);

    const [createOpen, setCreateOpen] = useState(false);
    const [role, setRole] = useState<ManagedAccessRole>('secretario');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [cpf, setCpf] = useState('');
    const [registrationNumber, setRegistrationNumber] = useState('');
    const [departmentId, setDepartmentId] = useState('');
    const [partnerId, setPartnerId] = useState('');
    const [tenantId, setTenantId] = useState('');
    const [allowedModules, setAllowedModules] = useState<string[]>([...ALL_ACCESS_MODULES]);

    useEffect(() => {
        setTitle('Gerenciamento de acessos');
        setDescription('Crie, edite, bloqueie e remova os acessos da prefeitura, dos motoristas e dos parceiros.');
    }, [setDescription, setTitle]);

    const accesses = useQuery({ queryKey: ['managed-accesses'], queryFn: accessManagementApi.list });
    const departments = useQuery({ queryKey: ['departments', 'access-management'], queryFn: departmentsApi.getAll });
    const tenants = useQuery({ queryKey: ['tenants', 'access-management'], queryFn: tenantApi.getAll, enabled: isSuperadmin });
    const stations = useQuery({ queryKey: ['stations', 'access-management'], queryFn: () => stationsApi.getAll(), enabled: createOpen && role === 'posto' });
    const shops = useQuery({ queryKey: ['repair-shops', 'access-management'], queryFn: () => repairShopsApi.getAll(), enabled: createOpen && role === 'oficina' });

    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: ['managed-accesses'] });
        void queryClient.invalidateQueries({ queryKey: ['drivers'] });
        void queryClient.invalidateQueries({ queryKey: ['partner-users'] });
    };

    const rows = useMemo(() => accesses.data ?? [], [accesses.data]);
    const counts = useMemo(() => Object.fromEntries(TABS.map((item) => [item.role, rows.filter((row) => row.role === item.role).length])) as Record<ManagedAccessRole, number>, [rows]);
    const visible = useMemo(() => {
        const term = search.trim().toLocaleLowerCase('pt-BR');
        return rows
            .filter((row) => row.role === tab)
            .filter((row) => showBlocked || !row.access_blocked)
            .filter((row) => !term || [row.full_name, row.email, row.cpf, row.departments?.name, row.fuel_stations?.name, row.repair_shops?.name]
                .some((value) => value?.toLocaleLowerCase('pt-BR').includes(term)));
    }, [rows, tab, search, showBlocked]);

    const resetCreate = () => {
        setRole(tab);
        setName(''); setEmail(''); setCpf(''); setRegistrationNumber('');
        setDepartmentId(''); setPartnerId(''); setTenantId('');
        setAllowedModules([...ALL_ACCESS_MODULES]);
    };
    const openCreate = () => { resetCreate(); setCreateOpen(true); };

    const createAccess = useMutation({
        mutationFn: (payload: CreateManagedAccess) => accessManagementApi.create(payload),
        onSuccess: (created) => {
            setCreateOpen(false);
            refresh();
            if (created.tempPassword) {
                setCredential({ name: created.full_name, login: loginOf(created), password: created.tempPassword });
            } else {
                toast.success('Acesso criado.');
            }
        },
        onError: (error) => toast.error((error as Error).message),
    });

    const isStaffRole = STAFF_ROLES.includes(role);
    const isPartnerRole = role === 'posto' || role === 'oficina';
    const departmentOptions = (departments.data ?? [])
        .filter((item) => !isSuperadmin || !tenantId || item.tenant_id === tenantId)
        .map((item) => ({ value: item.id, label: item.name }));
    const partnerOptions = (role === 'posto' ? stations.data ?? [] : shops.data ?? [])
        .filter((item) => !isSuperadmin || !tenantId || item.tenant_id === tenantId)
        .map((item) => ({ value: item.id, label: item.name }));

    const submitCreate = () => {
        if (name.trim().length < 3) return toast.error('Informe o nome completo.');
        if (role === 'motorista' && cpf.replace(/\D/g, '').length !== 11) return toast.error('Informe um CPF válido.');
        if (role !== 'motorista' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error('Informe um e-mail válido.');
        if (role === 'secretario' && !departmentId) return toast.error('Selecione a secretaria.');
        if (isPartnerRole && !partnerId) return toast.error(role === 'posto' ? 'Selecione o posto.' : 'Selecione a oficina.');
        if (isSuperadmin && !tenantId) return toast.error('Selecione a prefeitura.');
        if (isStaffRole && allowedModules.length === 0) return toast.error('Selecione ao menos uma aba.');
        createAccess.mutate({
            role,
            name: name.trim(),
            email: email.trim(),
            cpf: cpf.replace(/\D/g, ''),
            registrationNumber: registrationNumber.trim(),
            departmentId: departmentId || undefined,
            partnerId: partnerId || undefined,
            tenantId: tenantId || undefined,
            allowedModules: isStaffRole ? allowedModules : undefined,
        });
    };

    const subtitleOf = (access: ManagedAccess) => [
        loginOf(access),
        ROLE_LABEL[access.role],
        access.departments?.name,
        access.fuel_stations?.name,
        access.repair_shops?.name,
        isSuperadmin ? access.tenants?.name : null,
    ].filter(Boolean).join(' · ');

    return (
        <div className="space-y-6 pb-16">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {TABS.map((item) => (
                        <button
                            key={item.role}
                            type="button"
                            onClick={() => setTab(item.role)}
                            className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
                                tab === item.role
                                    ? 'bg-[var(--sgf-accent)] text-[var(--sgf-accent-contrast)] shadow-sm'
                                    : 'bg-white text-slate-600 shadow-sm hover:bg-[var(--sgf-primary-soft)]'
                            }`}
                        >
                            {item.label}
                            <span className={`rounded-full px-2 py-0.5 text-xs ${tab === item.role ? 'bg-white/40' : 'bg-slate-100 text-slate-500'}`}>{counts[item.role] ?? 0}</span>
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <ExpandableSearch value={search} onChange={setSearch} placeholder="Buscar nome, e-mail, CPF…" />
                    <SGFButton icon={Plus} onClick={openCreate} className="shrink-0">
                        <span className="hidden sm:inline">Novo {current.singular}</span>
                        <span className="sm:hidden">Novo</span>
                    </SGFButton>
                </div>
            </div>

            <SGFCard padding="none" className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                    <div>
                        <h2 className="font-bold text-slate-900">{current.label}</h2>
                        <p className="text-sm text-slate-500">{current.hint} Clique em um acesso para editar, gerar nova senha, bloquear ou remover.</p>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                        <input type="checkbox" checked={showBlocked} onChange={(event) => setShowBlocked(event.target.checked)} className="h-4 w-4 accent-[var(--sgf-primary)]" />
                        Mostrar bloqueados
                    </label>
                </div>
                {accesses.isLoading ? (
                    <div className="p-8 text-center text-sm text-slate-500">Carregando acessos…</div>
                ) : accesses.isError ? (
                    <div className="p-8 text-center">
                        <p className="text-sm font-semibold text-red-700">Não foi possível carregar os acessos.</p>
                        <p className="mt-1 text-xs text-slate-500">{(accesses.error as Error).message}</p>
                        <SGFButton className="mt-4" variant="ghost" size="sm" onClick={() => accesses.refetch()}>Tentar novamente</SGFButton>
                    </div>
                ) : visible.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">{search ? 'Nenhum acesso encontrado para a busca.' : `Nenhum ${current.singular} cadastrado.`}</div>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {visible.map((access) => (
                            <li key={access.id}>
                                <button
                                    type="button"
                                    onClick={() => setEditing(access)}
                                    className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50"
                                >
                                    <RoleIcon role={access.role} />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-2">
                                            <span className="truncate font-bold text-slate-900">{access.full_name}</span>
                                            {access.id === user?.id && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">você</span>}
                                        </span>
                                        <span className="block truncate text-sm text-slate-500">{subtitleOf(access)}</span>
                                    </span>
                                    {access.must_change_password && !access.access_blocked && (
                                        <span className="hidden rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 sm:inline">Senha provisória</span>
                                    )}
                                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${access.access_blocked ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                        {access.access_blocked ? 'Bloqueado' : 'Ativo'}
                                    </span>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </SGFCard>

            <Modal
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                title={`Novo ${current.singular}`}
                description="A senha provisória é gerada pelo sistema e mostrada uma única vez. A pessoa troca no primeiro acesso."
                size="lg"
                footer={(
                    <ModalFooter>
                        <SGFButton variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</SGFButton>
                        <SGFButton icon={KeyRound} loading={createAccess.isPending} onClick={submitCreate}>Criar acesso</SGFButton>
                    </ModalFooter>
                )}
            >
                <div className="space-y-5">
                    {isSuperadmin && (
                        <SGFSelect
                            label="Prefeitura"
                            value={tenantId}
                            onChange={(value) => { setTenantId(value); setDepartmentId(''); setPartnerId(''); }}
                            options={(tenants.data ?? []).map((tenant) => ({ value: tenant.id, label: tenant.name }))}
                            placeholder="Selecione a prefeitura"
                            fullWidth
                        />
                    )}
                    {isStaffRole && (
                        <SGFSelect
                            label="Cargo"
                            value={role}
                            onChange={(value) => setRole(value as ManagedAccessRole)}
                            options={ROLE_OPTIONS.filter((item) => STAFF_ROLES.includes(item.value))}
                            fullWidth
                        />
                    )}
                    {isPartnerRole && (
                        <SGFSelect
                            label={role === 'posto' ? 'Posto' : 'Oficina'}
                            value={partnerId}
                            onChange={setPartnerId}
                            options={partnerOptions}
                            placeholder={role === 'posto' ? 'Selecione o posto' : 'Selecione a oficina'}
                            fullWidth
                        />
                    )}
                    <SGFInput label={isPartnerRole ? 'Nome do responsável' : 'Nome completo'} value={name} onChange={(event) => setName(event.target.value)} fullWidth />
                    {role === 'motorista' ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <SGFInput label="CPF (login do motorista)" value={cpf} onChange={(event) => setCpf(event.target.value)} inputMode="numeric" fullWidth />
                            <SGFInput label="Matrícula (opcional)" value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} fullWidth />
                        </div>
                    ) : (
                        <SGFInput label="E-mail de acesso" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@empresa.com.br" fullWidth />
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
                    {isStaffRole && <ModuleChecks value={allowedModules} onChange={setAllowedModules} />}
                </div>
            </Modal>

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
        </div>
    );
}
