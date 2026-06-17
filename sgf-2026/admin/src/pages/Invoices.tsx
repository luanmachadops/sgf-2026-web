import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invoicesApi, tenantsApi } from '@/lib/api';
import { Card, Button, Input, Badge, fmtBrl } from '@/lib/ui';

export default function Invoices() {
  const qc = useQueryClient();
  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list });
  const { data: invoices = [], isLoading } = useQuery({ queryKey: ['invoices'], queryFn: () => invoicesApi.list() });
  const tName = useMemo(() => Object.fromEntries(tenants.map((t) => [t.id, t.name])), [tenants]);

  const [f, setF] = useState({ tenant_id: '', competencia: '', amount: '', due_date: '' });
  const set = (p: Partial<typeof f>) => setF((c) => ({ ...c, ...p }));

  const create = useMutation({
    mutationFn: () => invoicesApi.create({ tenant_id: f.tenant_id, competencia: f.competencia, amount: Number(f.amount) || 0, due_date: f.due_date || null }),
    onSuccess: () => { toast.success('Fatura lançada.'); setF({ tenant_id: '', competencia: '', amount: '', due_date: '' }); qc.invalidateQueries({ queryKey: ['invoices'] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const markPaid = useMutation({
    mutationFn: (id: string) => invoicesApi.update(id, { status: 'paid', paid_at: new Date().toISOString() }),
    onSuccess: () => { toast.success('Fatura paga.'); qc.invalidateQueries({ queryKey: ['invoices'] }); },
  });

  const total = invoices.filter((i) => i.status !== 'canceled').reduce((s, i) => s + Number(i.amount), 0);
  const pending = invoices.filter((i) => i.status === 'pending' || i.status === 'overdue').reduce((s, i) => s + Number(i.amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pagamentos</h1>
        <p className="text-sm text-slate-500">Faturamento manual por prefeitura.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card><div className="text-2xl font-bold text-[var(--sgf-dark)]">{fmtBrl(total)}</div><div className="text-xs uppercase text-slate-400">Faturado</div></Card>
        <Card><div className="text-2xl font-bold text-amber-600">{fmtBrl(pending)}</div><div className="text-xs uppercase text-slate-400">A receber</div></Card>
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Lançar fatura</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-500">Prefeitura</span>
            <select value={f.tenant_id} onChange={(e) => set({ tenant_id: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="">Selecione…</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <Input label="Competência (AAAA-MM)" value={f.competencia} onChange={(e) => set({ competencia: e.target.value })} placeholder="2026-06" />
          <Input label="Valor (R$)" type="number" value={f.amount} onChange={(e) => set({ amount: e.target.value })} />
          <Input label="Vencimento" type="date" value={f.due_date} onChange={(e) => set({ due_date: e.target.value })} />
        </div>
        <div className="mt-3 flex justify-end">
          <Button disabled={!f.tenant_id || !f.competencia || create.isPending} onClick={() => create.mutate()}>Lançar</Button>
        </div>
      </Card>

      <Card className="p-0">
        {isLoading ? <p className="p-5 text-slate-400">Carregando…</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-5 py-3">Prefeitura</th><th className="px-5 py-3">Competência</th><th className="px-5 py-3">Valor</th><th className="px-5 py-3">Vencimento</th><th className="px-5 py-3">Status</th><th></th>
            </tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="border-b border-slate-100">
                  <td className="px-5 py-3">{tName[i.tenant_id] ?? '—'}</td>
                  <td className="px-5 py-3">{i.competencia}</td>
                  <td className="px-5 py-3">{fmtBrl(Number(i.amount))}</td>
                  <td className="px-5 py-3">{i.due_date ?? '—'}</td>
                  <td className="px-5 py-3"><Badge status={i.status} /></td>
                  <td className="px-5 py-3 text-right">{i.status !== 'paid' && <button onClick={() => markPaid.mutate(i.id)} className="text-xs font-semibold text-[var(--sgf-primary)] hover:underline">Marcar paga</button>}</td>
                </tr>
              ))}
              {invoices.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400">Sem faturas.</td></tr>}
            </tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
