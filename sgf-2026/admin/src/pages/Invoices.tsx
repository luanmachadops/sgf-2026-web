import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invoicesApi, tenantsApi, type Invoice } from '@/lib/api';
import { Button, Input, Badge, fmtBrl } from '@/lib/ui';
import { SGFSelect, SGFTable, SGFKPICard, SGFButton, PageHeader, Sheet } from '@/components/sgf';
import { Receipt, Clock, ShieldCheck, Plus } from '@/components/sgf/icons';
import { TenantIdentity } from '@/components/TenantIdentity';

export default function Invoices() {
  const qc = useQueryClient();
  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list });
  const { data: invoices = [], isLoading } = useQuery({ queryKey: ['invoices'], queryFn: () => invoicesApi.list() });
  const tenantById = useMemo(() => Object.fromEntries(tenants.map((t) => [t.id, t])), [tenants]);

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

  const [formOpen, setFormOpen] = useState(false);
  const paidCount = invoices.filter((i) => i.status === 'paid').length;
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const comp = (c: string) => { const [y, m] = c.split('-'); return m ? `${MES[Number(m) - 1] ?? m}/${y}` : c; };
  const br = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : '—');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagamentos"
        subtitle="Faturas lançadas para cada prefeitura."
        actions={<Button onClick={() => setFormOpen(true)}><Plus width={18} height={18} /> Lançar fatura</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SGFKPICard title="Total faturado" value={fmtBrl(total)} icon={Receipt} tone="brand" loading={isLoading} />
        <SGFKPICard title="A receber" value={fmtBrl(pending)} icon={Clock} tone={pending > 0 ? 'amber' : 'neutral'} loading={isLoading} />
        <SGFKPICard title="Faturas pagas" value={paidCount} hint={`de ${invoices.length} lançadas`} icon={ShieldCheck} tone="blue" loading={isLoading} />
      </div>

      <SGFTable<Invoice>
        loading={isLoading}
        data={invoices}
        keyExtractor={(i) => i.id}
        emptyMessage="Nenhuma fatura lançada."
        columns={[
          { header: 'Prefeitura', accessor: (i) => <TenantIdentity tenant={tenantById[i.tenant_id]} /> },
          { header: 'Competência', accessor: (i) => <span className="font-medium capitalize text-[var(--rt-ink900)]">{comp(i.competencia)}</span> },
          { header: 'Valor', accessor: (i) => <span className="rt-num whitespace-nowrap font-semibold text-[var(--rt-ink900)]">{fmtBrl(Number(i.amount))}</span> },
          { header: 'Vencimento', accessor: (i) => <span className="rt-num">{br(i.due_date)}</span> },
          { header: 'Situação', accessor: (i) => <Badge status={i.status} /> },
          {
            header: '',
            className: 'text-right',
            accessor: (i) => i.status !== 'paid' && i.status !== 'canceled'
              ? <SGFButton size="sm" variant="outline" onClick={() => markPaid.mutate(i.id)}>Marcar como paga</SGFButton>
              : null,
          },
        ]}
      />

      <Sheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="sm"
        title="Lançar fatura"
        footer={<>
          <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button>
          <Button disabled={!f.tenant_id || !f.competencia || create.isPending} onClick={() => create.mutate(undefined, { onSuccess: () => setFormOpen(false) })}>
            {create.isPending ? 'Lançando…' : 'Lançar fatura'}
          </Button>
        </>}
      >
        <div className="space-y-4">
          <SGFSelect label="Prefeitura" fullWidth value={f.tenant_id} onChange={(tenant_id) => set({ tenant_id })}
            options={tenants.map((t) => ({ value: t.id, label: t.name }))} placeholder="Escolha a prefeitura" />
          <Input label="Competência" type="month" value={f.competencia} onChange={(e) => set({ competencia: e.target.value })} />
          <Input label="Valor (R$)" type="number" min="0" step="0.01" value={f.amount} onChange={(e) => set({ amount: e.target.value })} />
          <Input label="Vencimento" type="date" value={f.due_date} onChange={(e) => set({ due_date: e.target.value })} />
        </div>
      </Sheet>
    </div>
  );
}
