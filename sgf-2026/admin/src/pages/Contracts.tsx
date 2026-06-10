import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { contractsApi, tenantsApi } from '@/lib/api';
import { Card, Button, Input, Badge, fmtBrl } from '@/lib/ui';

export default function Contracts() {
  const qc = useQueryClient();
  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list });
  const { data: contracts = [], isLoading } = useQuery({ queryKey: ['contracts'], queryFn: () => contractsApi.list() });
  const tName = useMemo(() => Object.fromEntries(tenants.map((t) => [t.id, t.name])), [tenants]);

  const [f, setF] = useState({ tenant_id: '', title: '', object: '', value: '', start_date: '', end_date: '' });
  const set = (p: Partial<typeof f>) => setF((c) => ({ ...c, ...p }));

  const create = useMutation({
    mutationFn: () => contractsApi.create({ tenant_id: f.tenant_id, title: f.title, object: f.object || null, value: f.value ? Number(f.value) : null, start_date: f.start_date || null, end_date: f.end_date || null }),
    onSuccess: () => { toast.success('Contrato cadastrado.'); setF({ tenant_id: '', title: '', object: '', value: '', start_date: '', end_date: '' }); qc.invalidateQueries({ queryKey: ['contracts'] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const today = new Date().toISOString().slice(0, 10);
  const soon = (d: string | null) => d && d >= today && d <= new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Licitações & Contratos</h1>
        <p className="text-sm text-slate-500">Contratos das prefeituras com a plataforma.</p>
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Novo contrato</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-500">Prefeitura</span>
            <select value={f.tenant_id} onChange={(e) => set({ tenant_id: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="">Selecione…</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <Input label="Título" value={f.title} onChange={(e) => set({ title: e.target.value })} />
          <Input label="Valor (R$)" type="number" value={f.value} onChange={(e) => set({ value: e.target.value })} />
          <Input label="Objeto" value={f.object} onChange={(e) => set({ object: e.target.value })} />
          <Input label="Início" type="date" value={f.start_date} onChange={(e) => set({ start_date: e.target.value })} />
          <Input label="Fim" type="date" value={f.end_date} onChange={(e) => set({ end_date: e.target.value })} />
        </div>
        <div className="mt-3 flex justify-end"><Button disabled={!f.tenant_id || !f.title || create.isPending} onClick={() => create.mutate()}>Cadastrar</Button></div>
      </Card>

      <Card className="p-0">
        {isLoading ? <p className="p-5 text-slate-400">Carregando…</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-5 py-3">Prefeitura</th><th className="px-5 py-3">Título</th><th className="px-5 py-3">Valor</th><th className="px-5 py-3">Vigência</th><th className="px-5 py-3">Status</th>
            </tr></thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id} className="border-b border-slate-100">
                  <td className="px-5 py-3">{tName[c.tenant_id] ?? '—'}</td>
                  <td className="px-5 py-3 font-medium">{c.title}</td>
                  <td className="px-5 py-3">{c.value != null ? fmtBrl(Number(c.value)) : '—'}</td>
                  <td className="px-5 py-3">{c.start_date ?? '—'} → <span className={soon(c.end_date) ? 'font-semibold text-amber-600' : ''}>{c.end_date ?? '—'}</span></td>
                  <td className="px-5 py-3"><Badge status={c.status} /></td>
                </tr>
              ))}
              {contracts.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">Sem contratos.</td></tr>}
            </tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
