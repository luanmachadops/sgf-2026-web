import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { aiApi, tenantsApi } from '@/lib/api';
import { Card, Button, Input, fmtUsd } from '@/lib/ui';

export default function AiUsage() {
  const qc = useQueryClient();
  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list });
  const { data: usage = [] } = useQuery({ queryKey: ['ai-usage'], queryFn: aiApi.usage });
  const { data: limits = [] } = useQuery({ queryKey: ['ai-limits'], queryFn: aiApi.limits });

  const monthStart = useMemo(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString(); }, []);
  const limitByTenant = useMemo(() => Object.fromEntries(limits.map((l) => [l.tenant_id, l])), [limits]);

  const perTenant = useMemo(() => {
    const acc: Record<string, { cost: number; calls: number }> = {};
    for (const u of usage) {
      if (u.created_at < monthStart) continue;
      const a = (acc[u.tenant_id] ??= { cost: 0, calls: 0 });
      a.cost += Number(u.cost_usd ?? 0); a.calls += 1;
    }
    return acc;
  }, [usage, monthStart]);

  const [edit, setEdit] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: ({ tenantId, cap }: { tenantId: string; cap: number }) => aiApi.setLimit(tenantId, cap, true),
    onSuccess: () => { toast.success('Teto atualizado.'); qc.invalidateQueries({ queryKey: ['ai-limits'] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const totalMonth = Object.values(perTenant).reduce((s, a) => s + a.cost, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Uso de IA</h1>
        <p className="text-sm text-slate-500">Custo por prefeitura (mês atual) e tetos de gasto.</p>
      </div>

      <Card><div className="text-2xl font-bold text-[var(--sgf-dark)]">{fmtUsd(totalMonth)}</div><div className="text-xs uppercase text-slate-400">Custo total de IA (mês)</div></Card>

      <Card className="p-0">
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
            <th className="px-5 py-3">Prefeitura</th><th className="px-5 py-3">Chamadas (mês)</th><th className="px-5 py-3">Custo (mês)</th><th className="px-5 py-3">Teto mensal (USD)</th><th></th>
          </tr></thead>
          <tbody>
            {tenants.map((t) => {
              const p = perTenant[t.id] ?? { cost: 0, calls: 0 };
              const cap = limitByTenant[t.id]?.monthly_cap_usd ?? 0;
              const over = cap > 0 && p.cost >= Number(cap);
              return (
                <tr key={t.id} className="border-b border-slate-100">
                  <td className="px-5 py-3 font-medium">{t.name}</td>
                  <td className="px-5 py-3">{p.calls}</td>
                  <td className={`px-5 py-3 ${over ? 'font-bold text-red-600' : ''}`}>{fmtUsd(p.cost)}</td>
                  <td className="px-5 py-3">
                    <Input type="number" value={edit[t.id] ?? String(cap ?? 0)} onChange={(e) => setEdit((s) => ({ ...s, [t.id]: e.target.value }))} className="w-28" />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button variant="ghost" onClick={() => save.mutate({ tenantId: t.id, cap: Number(edit[t.id] ?? cap) || 0 })}>Salvar</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </Card>
    </div>
  );
}
