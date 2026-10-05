import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { aiApi, tenantsApi } from '@/lib/api';
import { Input, fmtUsdSmart } from '@/lib/ui';
import { PageHeader, SGFTable, SGFButton } from '@/components/sgf';
import { Sparkle } from '@/components/sgf/icons';
import { TenantIdentity } from '@/components/TenantIdentity';

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

  const totalCalls = Object.values(perTenant).reduce((n, a) => n + a.calls, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Uso de IA" subtitle="Custo de inteligência artificial por prefeitura no mês atual e os tetos de gasto." />

      <section className="rt-rise relative overflow-hidden rounded-[var(--rt-radius-card)] bg-[var(--rt-ink900)] p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#F26A1F]/15 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold"><Sparkle width={14} height={14} /> Mês atual</span>
            <p className="rt-num mt-5 text-[52px] font-light leading-none">{fmtUsdSmart(totalMonth)}</p>
            <p className="mt-2 text-sm text-white/55">custo total em todas as prefeituras</p>
          </div>
          <div>
            <p className="rt-num text-[28px] font-light leading-none">{totalCalls.toLocaleString('pt-BR')}</p>
            <p className="mt-1.5 text-xs text-white/55">chamadas no mês</p>
          </div>
        </div>
      </section>

      <SGFTable<(typeof tenants)[number]>
        data={tenants}
        keyExtractor={(t) => t.id}
        emptyMessage="Nenhuma prefeitura."
        columns={[
          { header: 'Prefeitura', accessor: (t) => <TenantIdentity tenant={t} /> },
          { header: 'Chamadas', accessor: (t) => <span className="rt-num">{(perTenant[t.id]?.calls ?? 0).toLocaleString('pt-BR')}</span> },
          {
            header: 'Gasto do mês × teto',
            className: 'min-w-[240px]',
            accessor: (t) => {
              const cost = perTenant[t.id]?.cost ?? 0;
              const cap = Number(limitByTenant[t.id]?.monthly_cap_usd ?? 0);
              const pct = cap > 0 ? Math.min(100, (cost / cap) * 100) : 0;
              const over = cap > 0 && cost >= cap;
              return (
                <div>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className={`rt-num font-semibold ${over ? 'text-[var(--rt-red600)]' : 'text-[var(--rt-ink900)]'}`}>{fmtUsdSmart(cost)}</span>
                    <span className="text-xs text-[var(--rt-ink500)]">{cap > 0 ? `teto ${fmtUsdSmart(cap)}` : 'sem teto'}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--rt-paper2)]" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Uso do teto">
                    <div className={`h-full rounded-full ${over ? 'bg-[var(--rt-red600)]' : pct > 80 ? 'bg-[#F59E0B]' : 'bg-[var(--rt-brand)]'}`} style={{ width: `${cap > 0 ? Math.max(pct, cost > 0 ? 3 : 0) : 0}%` }} />
                  </div>
                </div>
              );
            },
          },
          {
            header: 'Teto mensal (US$)',
            accessor: (t) => {
              const cap = limitByTenant[t.id]?.monthly_cap_usd ?? 0;
              return (
                <div className="flex items-center gap-2">
                  <Input type="number" min="0" step="0.01" aria-label="Teto mensal em dólar" value={edit[t.id] ?? String(cap ?? 0)} onChange={(e) => setEdit((s) => ({ ...s, [t.id]: e.target.value }))} className="w-32" />
                  <SGFButton size="sm" variant="outline" onClick={() => save.mutate({ tenantId: t.id, cap: Number(edit[t.id] ?? cap) || 0 })}>Salvar</SGFButton>
                </div>
              );
            },
          },
        ]}
      />
    </div>
  );
}
