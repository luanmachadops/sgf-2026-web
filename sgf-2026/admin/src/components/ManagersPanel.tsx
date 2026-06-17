import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { managersApi, tenantsApi } from '@/lib/api';
import { Card, Button, Input } from '@/lib/ui';

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
  const tName = useMemo(() => Object.fromEntries(tenants.map((t) => [t.id, t.name])), [tenants]);

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

  const canSubmit = (fixed || f.tenant_id) && f.email.includes('@') && f.password.length >= 6;

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="mb-1 text-lg font-semibold text-slate-800">Novo gestor de acesso</h2>
        <p className="mb-4 text-sm text-slate-500">Cria o login do gestor/administrador da prefeitura (acesso ao painel do gestor).</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {!fixed && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Prefeitura</span>
              <select value={f.tenant_id} onChange={(e) => set({ tenant_id: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option value="">Selecione…</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Papel</span>
            <select value={f.role} onChange={(e) => set({ role: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="gestor">Gestor (acesso total da prefeitura)</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
          <Input label="Nome" value={f.name} onChange={(e) => set({ name: e.target.value })} />
          <Input label="E-mail" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />
          <Input label="Senha inicial" type="text" value={f.password} onChange={(e) => set({ password: e.target.value })} placeholder="Mínimo 6 caracteres" />
        </div>
        <div className="mt-4 flex justify-end">
          <Button disabled={!canSubmit || create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Criando…' : 'Criar gestor'}</Button>
        </div>
      </Card>

      <Card className="p-0">
        {isLoading ? <p className="p-5 text-slate-400">Carregando…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                {!fixed && <th className="px-5 py-3">Prefeitura</th>}
                <th className="px-5 py-3">Nome</th><th className="px-5 py-3">E-mail</th><th className="px-5 py-3">Papel</th><th className="px-5 py-3">Acesso</th><th></th>
              </tr></thead>
              <tbody>
                {managers.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100">
                    {!fixed && <td className="px-5 py-3 text-slate-600">{m.tenant_id ? (tName[m.tenant_id] ?? '—') : '—'}</td>}
                    <td className="px-5 py-3 font-medium text-slate-800">{m.full_name ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{m.email ?? '—'}</td>
                    <td className="px-5 py-3">{ROLE_LABEL[m.role] ?? m.role}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${m.access_blocked ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {m.access_blocked ? 'Bloqueado' : 'Ativo'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-3">
                        <button onClick={() => setBlocked.mutate({ userId: m.id, blocked: !m.access_blocked })} className="text-xs font-semibold text-[var(--sgf-primary)] hover:underline">
                          {m.access_blocked ? 'Reativar' : 'Bloquear'}
                        </button>
                        <button onClick={() => { const p = prompt('Nova senha (mín. 6):'); if (p && p.length >= 6) resetPass.mutate({ userId: m.id, password: p }); }} className="text-xs font-semibold text-slate-500 hover:underline">Redefinir senha</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {managers.length === 0 && <tr><td colSpan={fixed ? 5 : 6} className="px-5 py-8 text-center text-slate-400">Nenhum gestor cadastrado.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default ManagersPanel;
