import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { managersApi, tenantsApi, type Manager } from '@/lib/api';
import { Button, Input } from '@/lib/ui';
import { PASSWORD_MIN_LENGTH, PASSWORD_PLACEHOLDER } from '@/lib/passwordPolicy';
import { SGFSelect, SGFTable, SGFBadge, SGFButton, Sheet } from '@/components/sgf';
import { Plus } from '@/components/sgf/icons';
import { TenantIdentity } from '@/components/TenantIdentity';

const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', gestor: 'Gestor', secretario: 'Secretário' };

/** Painel de gestores de acesso. Se `tenantId` vier, fica preso à prefeitura. */
export function ManagersPanel({ tenantId }: { tenantId?: string }) {
  const qc = useQueryClient();
  const fixed = !!tenantId;
  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list, enabled: !fixed });
  const { data: managers = [], isLoading } = useQuery({
    queryKey: ['managers', tenantId ?? 'all'],
    queryFn: () => managersApi.list(tenantId),
  });
  const tenantById = useMemo(() => Object.fromEntries(tenants.map((t) => [t.id, t])), [tenants]);

  const [f, setF] = useState({ tenant_id: tenantId ?? '', role: 'gestor', name: '', email: '', password: '' });
  const set = (p: Partial<typeof f>) => setF((c) => ({ ...c, ...p }));

  const invalidate = () => qc.invalidateQueries({ queryKey: ['managers'] });

  const create = useMutation({
    mutationFn: () => managersApi.action({ action: 'create', tenantId: tenantId ?? f.tenant_id, role: f.role, name: f.name, email: f.email, password: f.password }),
    onSuccess: () => { toast.success('Gestor criado.'); setF({ tenant_id: tenantId ?? '', role: 'gestor', name: '', email: '', password: '' }); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const setBlocked = useMutation({
    mutationFn: ({ userId, blocked }: { userId: string; blocked: boolean }) => managersApi.action({ action: 'setBlocked', userId, blocked }),
    onSuccess: () => { toast.success('Acesso atualizado.'); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const resetPass = useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) => managersApi.action({ action: 'resetPassword', userId, password }),
    onSuccess: () => toast.success('Senha redefinida.'),
    onError: (e) => toast.error((e as Error).message),
  });

  const canSubmit = (fixed || f.tenant_id) && f.email.includes('@') && f.password.length >= PASSWORD_MIN_LENGTH;
  const [creating, setCreating] = useState(false);
  const [resetFor, setResetFor] = useState<Manager | null>(null);
  const [newPass, setNewPass] = useState('');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--rt-ink500)]">
          {managers.length} {managers.length === 1 ? 'pessoa com acesso' : 'pessoas com acesso'} ao painel do gestor.
        </p>
        <Button onClick={() => setCreating(true)}><Plus width={18} height={18} /> Novo gestor</Button>
      </div>

      <SGFTable<Manager>
        loading={isLoading}
        data={managers}
        keyExtractor={(m) => m.id}
        emptyMessage="Nenhum gestor cadastrado."
        columns={[
          ...(!fixed ? [{ header: 'Prefeitura', accessor: (m: Manager) => <TenantIdentity tenant={m.tenant_id ? tenantById[m.tenant_id] : null} /> }] : []),
          {
            header: 'Pessoa',
            accessor: (m: Manager) => (
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--rt-brand-100)] text-xs font-bold text-[#0B7A50]">
                  {(m.full_name ?? m.email ?? '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[var(--rt-ink900)]">{m.full_name ?? '—'}</p>
                  <p className="truncate text-xs text-[var(--rt-ink500)]">{m.email ?? '—'}</p>
                </div>
              </div>
            ),
          },
          { header: 'Papel', accessor: (m: Manager) => ROLE_LABEL[m.role] ?? m.role },
          { header: 'Acesso', accessor: (m: Manager) => <SGFBadge variant={m.access_blocked ? 'error' : 'success'} dot>{m.access_blocked ? 'Bloqueado' : 'Ativo'}</SGFBadge> },
          {
            header: '',
            className: 'text-right',
            accessor: (m: Manager) => (
              <div className="flex justify-end gap-1.5">
                <SGFButton size="sm" variant="outline" onClick={() => { setNewPass(''); setResetFor(m); }}>Nova senha</SGFButton>
                <SGFButton size="sm" variant="ghost" className={m.access_blocked ? '' : '!text-[var(--rt-red600)]'} onClick={() => setBlocked.mutate({ userId: m.id, blocked: !m.access_blocked })}>
                  {m.access_blocked ? 'Reativar' : 'Bloquear'}
                </SGFButton>
              </div>
            ),
          },
        ]}
      />

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title="Novo gestor"
        subtitle="Cria o login de gestor ou administrador da prefeitura, com acesso ao painel do gestor."
        footer={<>
          <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
          <Button disabled={!canSubmit || create.isPending} onClick={() => create.mutate(undefined, { onSuccess: () => setCreating(false) })}>
            {create.isPending ? 'Criando…' : 'Criar gestor'}
          </Button>
        </>}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!fixed && (
            <SGFSelect label="Prefeitura" fullWidth value={f.tenant_id} onChange={(tenant_id) => set({ tenant_id })}
              options={tenants.map((t) => ({ value: t.id, label: t.name }))} placeholder="Escolha a prefeitura" className="sm:col-span-2" />
          )}
          <SGFSelect label="Papel" fullWidth value={f.role} onChange={(role) => set({ role })} className="sm:col-span-2"
            options={[
              { value: 'gestor', label: 'Gestor (acesso total da prefeitura)' },
              { value: 'admin', label: 'Administrador' },
            ]} />
          <Input label="Nome completo" value={f.name} onChange={(e) => set({ name: e.target.value })} />
          <Input label="E-mail" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />
          <Input label="Senha inicial" type="text" value={f.password} onChange={(e) => set({ password: e.target.value })} placeholder={PASSWORD_PLACEHOLDER} hint={`Mínimo de ${PASSWORD_MIN_LENGTH} caracteres.`} />
        </div>
      </Sheet>

      <Sheet
        open={!!resetFor}
        onClose={() => setResetFor(null)}
        size="sm"
        title="Definir nova senha"
        subtitle={resetFor ? `Para ${resetFor.full_name ?? resetFor.email}` : undefined}
        footer={<>
          <Button variant="ghost" onClick={() => setResetFor(null)}>Cancelar</Button>
          <Button
            disabled={newPass.length < PASSWORD_MIN_LENGTH || resetPass.isPending}
            onClick={() => resetFor && resetPass.mutate({ userId: resetFor.id, password: newPass }, { onSuccess: () => setResetFor(null) })}
          >
            {resetPass.isPending ? 'Salvando…' : 'Salvar senha'}
          </Button>
        </>}
      >
        <Input label="Nova senha" type="text" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder={PASSWORD_PLACEHOLDER} hint={`Mínimo de ${PASSWORD_MIN_LENGTH} caracteres. Passe para a pessoa por um canal seguro.`} />
      </Sheet>
    </div>
  );
}

export default ManagersPanel;
