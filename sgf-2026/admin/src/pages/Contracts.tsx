import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { contractsApi, tenantsApi, type Contract } from '@/lib/api';
import { Button, Input, Badge, fmtBrl, MoneyInput } from '@/lib/ui';
import { SGFSelect, SGFTable, SGFKPICard, PageHeader, Sheet } from '@/components/sgf';
import { FileText, ShieldCheck, Clock, Receipt, Plus } from '@/components/sgf/icons';
import { TenantIdentity } from '@/components/TenantIdentity';
import { ContractSheet } from '@/components/ContractSheet';

export default function Contracts() {
  const qc = useQueryClient();
  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list });
  const { data: contracts = [], isLoading } = useQuery({ queryKey: ['contracts'], queryFn: () => contractsApi.list() });
  const tenantById = useMemo(() => Object.fromEntries(tenants.map((t) => [t.id, t])), [tenants]);

  const [f, setF] = useState({ tenant_id: '', title: '', object: '', value: '', start_date: '', end_date: '' });
  const [files, setFiles] = useState<File[]>([]);
  const set = (p: Partial<typeof f>) => setF((c) => ({ ...c, ...p }));

  const create = useMutation({
    mutationFn: async () => {
      const contract = await contractsApi.create({
        tenant_id: f.tenant_id,
        title: f.title,
        object: f.object || null,
        value: f.value ? Number(f.value) : null,
        start_date: f.start_date || null,
        end_date: f.end_date || null,
      });
      if (files.length) await contractsApi.uploadDocuments(contract, files);
      return contract;
    },
    onSuccess: () => {
      toast.success(files.length ? 'Contrato e documentos cadastrados.' : 'Contrato cadastrado.');
      setF({ tenant_id: '', title: '', object: '', value: '', start_date: '', end_date: '' });
      setFiles([]);
      qc.invalidateQueries({ queryKey: ['contracts'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const today = new Date().toISOString().slice(0, 10);
  const soon = (d: string | null) => d && d >= today && d <= new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const active = contracts.filter((c) => c.status === 'active' && (!c.end_date || c.end_date >= today)).length;
  const expiring = contracts.filter((c) => soon(c.end_date)).length;
  const totalValue = contracts.filter((c) => c.status !== 'canceled').reduce((sum, c) => sum + Number(c.value ?? 0), 0);
  const tenantOptions = tenants.map((tenant) => ({ value: tenant.id, label: tenant.name }));

  const [formOpen, setFormOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = contracts.find((c) => c.id === openId) ?? null;
  const br = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : '—');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contratos"
        subtitle="Licitações e contratos das prefeituras com a plataforma."
        actions={<Button onClick={() => setFormOpen(true)}><Plus width={18} height={18} /> Novo contrato</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SGFKPICard title="Contratos" value={contracts.length} icon={FileText} tone="neutral" loading={isLoading} />
        <SGFKPICard title="Vigentes" value={active} icon={ShieldCheck} tone="brand" loading={isLoading} />
        <SGFKPICard title="Vencem em 30 dias" value={expiring} icon={Clock} tone={expiring > 0 ? 'amber' : 'neutral'} loading={isLoading} />
        <SGFKPICard title="Valor contratado" value={fmtBrl(totalValue)} icon={Receipt} tone="blue" loading={isLoading} />
      </div>

      <SGFTable<Contract>
        loading={isLoading}
        data={contracts}
        keyExtractor={(c) => c.id}
        onRowClick={(c) => setOpenId(c.id)}
        emptyMessage="Nenhum contrato cadastrado."
        columns={[
          { header: 'Prefeitura', accessor: (c) => <TenantIdentity tenant={tenantById[c.tenant_id]} /> },
          {
            header: 'Contrato',
            accessor: (c) => (
              <div className="min-w-0 max-w-[260px]">
                <p className="truncate font-semibold text-[var(--rt-ink900)]">{c.title}</p>
                {c.object && <p className="truncate text-xs text-[var(--rt-ink500)]">{c.object}</p>}
              </div>
            ),
          },
          { header: 'Valor', accessor: (c) => <span className="rt-num whitespace-nowrap font-semibold text-[var(--rt-ink900)]">{c.value != null ? fmtBrl(Number(c.value)) : '—'}</span> },
          {
            header: 'Vigência',
            accessor: (c) => (
              <span className="rt-num whitespace-nowrap">
                {br(c.start_date)} – <span className={soon(c.end_date) ? 'font-semibold text-[var(--rt-amber600)]' : ''}>{br(c.end_date)}</span>
              </span>
            ),
          },
          {
            header: 'Documentos',
            accessor: (c) => {
              const n = contractsApi.documents(c).length;
              return (
                <span className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-semibold ${n ? 'bg-[var(--rt-paper)] text-[var(--rt-ink700)]' : 'text-[var(--rt-ink400)]'}`}>
                  <FileText width={14} height={14} /> {n ? `${n} ${n === 1 ? 'documento' : 'documentos'}` : 'Nenhum'}
                </span>
              );
            },
          },
          { header: 'Situação', accessor: (c) => <Badge status={c.status} /> },
        ]}
      />

      <ContractSheet contract={opened} tenant={opened ? tenantById[opened.tenant_id] : undefined} onClose={() => setOpenId(null)} />

      <Sheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Novo contrato"
        subtitle="Registre o contrato da prefeitura com a plataforma e anexe os documentos."
        footer={<>
          <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button>
          <Button disabled={!f.tenant_id || !f.title || create.isPending} onClick={() => create.mutate(undefined, { onSuccess: () => setFormOpen(false) })}>
            {create.isPending ? 'Cadastrando…' : 'Cadastrar contrato'}
          </Button>
        </>}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SGFSelect label="Prefeitura" fullWidth value={f.tenant_id} onChange={(tenant_id) => set({ tenant_id })} options={tenantOptions} placeholder="Escolha a prefeitura" className="sm:col-span-2" />
          <Input label="Título" value={f.title} onChange={(e) => set({ title: e.target.value })} className="sm:col-span-2" />
          <Input label="Objeto" value={f.object} onChange={(e) => set({ object: e.target.value })} className="sm:col-span-2" />
          <MoneyInput label="Valor" value={f.value} onChange={(v) => set({ value: v })} />
          <div />
          <Input label="Início" type="date" value={f.start_date} onChange={(e) => set({ start_date: e.target.value })} />
          <Input label="Fim" type="date" value={f.end_date} onChange={(e) => set({ end_date: e.target.value })} />
          <label className="block cursor-pointer sm:col-span-2">
            <span className="mb-2 block text-[13px] font-medium text-[var(--rt-ink500)]">Documentos</span>
            <span className="flex items-center gap-3 rounded-2xl bg-[var(--rt-paper)] p-3 transition hover:bg-[var(--rt-paper2)]">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[var(--rt-ink500)]"><FileText width={20} height={20} /></span>
              <span className="text-sm text-[var(--rt-ink700)]">{files.length ? `${files.length} arquivo(s) selecionado(s)` : 'Escolher arquivos (PDF, Word, Excel ou imagem)'}</span>
            </span>
            <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" className="sr-only" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </label>
        </div>
      </Sheet>
    </div>
  );
}
