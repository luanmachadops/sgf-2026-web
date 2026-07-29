import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { contractsApi, tenantsApi, type Contract } from '@/lib/api';
import { Card, Button, Input, Badge, fmtBrl } from '@/lib/ui';
import { SGFSelect } from '@/components/sgf';
import { TenantIdentity } from '@/components/TenantIdentity';

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
  const upload = useMutation({
    mutationFn: ({ contract, selected }: { contract: Contract; selected: File[] }) => contractsApi.uploadDocuments(contract, selected),
    onSuccess: () => { toast.success('Documento enviado.'); qc.invalidateQueries({ queryKey: ['contracts'] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const today = new Date().toISOString().slice(0, 10);
  const soon = (d: string | null) => d && d >= today && d <= new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const active = contracts.filter((c) => c.status === 'active' && (!c.end_date || c.end_date >= today)).length;
  const expiring = contracts.filter((c) => soon(c.end_date)).length;
  const totalValue = contracts.filter((c) => c.status !== 'canceled').reduce((sum, c) => sum + Number(c.value ?? 0), 0);
  const tenantOptions = tenants.map((tenant) => ({ value: tenant.id, label: tenant.name }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Licitações & Contratos</h1>
        <p className="text-sm text-slate-500">Contratos das prefeituras com a plataforma.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><div className="text-2xl font-bold text-slate-900">{contracts.length}</div><div className="text-xs font-semibold uppercase text-slate-400">Contratos</div></Card>
        <Card><div className="text-2xl font-bold text-emerald-600">{active}</div><div className="text-xs font-semibold uppercase text-slate-400">Ativos</div></Card>
        <Card><div className="text-2xl font-bold text-amber-600">{expiring}</div><div className="text-xs font-semibold uppercase text-slate-400">Vencem em 30 dias</div></Card>
        <Card><div className="text-xl font-bold text-[var(--sgf-dark)]">{fmtBrl(totalValue)}</div><div className="text-xs font-semibold uppercase text-slate-400">Valor contratado</div></Card>
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Novo contrato</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SGFSelect label="Prefeitura" fullWidth value={f.tenant_id} onChange={(tenant_id) => set({ tenant_id })} options={tenantOptions} />
          <Input label="Título" value={f.title} onChange={(e) => set({ title: e.target.value })} />
          <Input label="Valor (R$)" type="number" value={f.value} onChange={(e) => set({ value: e.target.value })} />
          <Input label="Objeto" value={f.object} onChange={(e) => set({ object: e.target.value })} />
          <Input label="Início" type="date" value={f.start_date} onChange={(e) => set({ start_date: e.target.value })} />
          <Input label="Fim" type="date" value={f.end_date} onChange={(e) => set({ end_date: e.target.value })} />
          <label className="block sm:col-span-3">
            <span className="mb-2 block text-sm font-semibold text-slate-700">Documentos</span>
            <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="block w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-emerald-100 file:px-4 file:py-2 file:font-semibold file:text-emerald-700" />
            {files.length > 0 && <span className="mt-1 block text-xs text-slate-500">{files.length} arquivo(s) selecionado(s)</span>}
          </label>
        </div>
        <div className="mt-3 flex justify-end"><Button disabled={!f.tenant_id || !f.title || create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Cadastrando…' : 'Cadastrar'}</Button></div>
      </Card>

      <Card className="p-0">
        {isLoading ? <p className="p-5 text-slate-400">Carregando…</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-5 py-3">Prefeitura</th><th className="px-5 py-3">Título</th><th className="px-5 py-3">Valor</th><th className="px-5 py-3">Vigência</th><th className="px-5 py-3">Documentos</th><th className="px-5 py-3">Status</th>
            </tr></thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id} className="border-b border-slate-100">
                  <td className="px-5 py-3"><TenantIdentity tenant={tenantById[c.tenant_id]} /></td>
                  <td className="px-5 py-3 font-medium">{c.title}</td>
                  <td className="px-5 py-3">{c.value != null ? fmtBrl(Number(c.value)) : '—'}</td>
                  <td className="px-5 py-3">{c.start_date ?? '—'} → <span className={soon(c.end_date) ? 'font-semibold text-amber-600' : ''}>{c.end_date ?? '—'}</span></td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {contractsApi.documents(c).map((document) => (
                        <button key={document.path} onClick={() => contractsApi.openDocument(document).catch((e) => toast.error((e as Error).message))}
                          className="max-w-32 truncate rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
                          title={document.name}>{document.name}</button>
                      ))}
                      <label className="cursor-pointer text-xs font-semibold text-[var(--sgf-primary)] hover:underline">
                        + Enviar
                        <input type="file" multiple className="hidden" onChange={(e) => {
                          const selected = Array.from(e.target.files ?? []);
                          if (selected.length) upload.mutate({ contract: c, selected });
                          e.currentTarget.value = '';
                        }} />
                      </label>
                    </div>
                  </td>
                  <td className="px-5 py-3"><Badge status={c.status} /></td>
                </tr>
              ))}
              {contracts.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400">Sem contratos.</td></tr>}
            </tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
