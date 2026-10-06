import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invoicesApi, tenantsApi, type Invoice } from '@/lib/api';
import { Button, Input, Badge, fmtBrl, MoneyInput } from '@/lib/ui';
import { SGFSelect, SGFTable, SGFKPICard, SGFButton, PageHeader, Sheet } from '@/components/sgf';
import { Receipt, Clock, ShieldCheck, Plus, Edit, Trash2 } from '@/components/sgf/icons';
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

  // Editor de fatura: clique na linha abre; dá para corrigir tudo ou excluir.
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [ed, setEd] = useState({ competencia: '', amount: '', due_date: '', status: 'pending', notes: '' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const openEditor = (i: Invoice) => {
    setEditing(i);
    setConfirmDelete(false);
    setEd({ competencia: i.competencia, amount: String(i.amount ?? ''), due_date: i.due_date ?? '', status: i.status, notes: i.notes ?? '' });
  };
  const saveEdit = useMutation({
    mutationFn: () => invoicesApi.update(editing!.id, {
      competencia: ed.competencia,
      amount: Number(ed.amount) || 0,
      due_date: ed.due_date || null,
      status: ed.status,
      notes: ed.notes.trim() || null,
      // Mantém a data de pagamento coerente com a situação.
      paid_at: ed.status === 'paid' ? (editing!.paid_at ?? new Date().toISOString()) : null,
    }),
    onSuccess: () => { toast.success('Fatura atualizada.'); setEditing(null); qc.invalidateQueries({ queryKey: ['invoices'] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const removeInvoice = useMutation({
    mutationFn: () => invoicesApi.remove(editing!.id),
    onSuccess: () => { toast.success('Fatura excluída.'); setEditing(null); qc.invalidateQueries({ queryKey: ['invoices'] }); },
    onError: (e) => toast.error((e as Error).message),
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
        onRowClick={openEditor}
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
            accessor: (i) => (
              <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                {i.status !== 'paid' && i.status !== 'canceled' && (
                  <SGFButton size="sm" variant="outline" onClick={() => markPaid.mutate(i.id)}>Marcar como paga</SGFButton>
                )}
                <SGFButton size="sm" variant="ghost" icon={Edit} onClick={() => openEditor(i)}>Editar</SGFButton>
              </div>
            ),
          },
        ]}
      />

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        size="sm"
        title="Editar fatura"
        subtitle={editing ? tenantById[editing.tenant_id]?.name : undefined}
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <SGFButton variant="danger" size="sm" loading={removeInvoice.isPending} onClick={() => removeInvoice.mutate()}>Confirmar exclusão</SGFButton>
                <SGFButton variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Não</SGFButton>
              </div>
            ) : (
              <SGFButton variant="ghost" size="sm" icon={Trash2} className="!text-[var(--rt-red600)]" onClick={() => setConfirmDelete(true)}>Excluir</SGFButton>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button disabled={!ed.competencia || saveEdit.isPending} onClick={() => saveEdit.mutate()}>{saveEdit.isPending ? 'Salvando…' : 'Salvar'}</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Competência" type="month" value={ed.competencia} onChange={(e) => setEd((c) => ({ ...c, competencia: e.target.value }))} />
          <MoneyInput label="Valor" value={ed.amount} onChange={(v) => setEd((c) => ({ ...c, amount: v }))} />
          <Input label="Vencimento" type="date" value={ed.due_date} onChange={(e) => setEd((c) => ({ ...c, due_date: e.target.value }))} />
          <SGFSelect label="Situação" fullWidth value={ed.status} onChange={(status) => setEd((c) => ({ ...c, status }))}
            options={[
              { value: 'pending', label: 'Pendente' },
              { value: 'paid', label: 'Paga' },
              { value: 'overdue', label: 'Atrasada' },
              { value: 'canceled', label: 'Cancelada' },
            ]} />
          <Input label="Observação" value={ed.notes} onChange={(e) => setEd((c) => ({ ...c, notes: e.target.value }))} placeholder="Opcional" />
        </div>
      </Sheet>

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
          <MoneyInput label="Valor" value={f.amount} onChange={(v) => set({ amount: v })} />
          <Input label="Vencimento" type="date" value={f.due_date} onChange={(e) => set({ due_date: e.target.value })} />
        </div>
      </Sheet>
    </div>
  );
}
