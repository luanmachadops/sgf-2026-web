import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tenantsApi, provisionTenant, type Tenant } from '@/lib/api';
import { Card, Button, Input, Badge } from '@/lib/ui';
import { SGFKPICard, type SGFKPIChartData } from '@/components/sgf';
import { Building2, ShieldCheck, Sparkle, XCircle } from '@/components/sgf/icons';

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Série dos últimos 6 meses de criação de prefeituras (filtrável por status). */
function creationSeries(tenants: Tenant[], status?: string): SGFKPIChartData[] {
  const now = new Date();
  const keys = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { k: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()] };
  });
  const map = new Map(keys.map((x) => [x.k, 0]));
  for (const t of tenants) {
    if (status && t.status !== status) continue;
    if (!t.created_at) continue;
    const d = new Date(t.created_at);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return keys.map((x) => ({ month: x.label, value: map.get(x.k) ?? 0 }));
}

export default function Tenants() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: tenants = [], isLoading } = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', city: '', state: '', cnpj: '', adminName: '', adminEmail: '', adminPassword: '' });
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  const create = useMutation({
    mutationFn: () => provisionTenant(form),
    onSuccess: () => {
      toast.success('Prefeitura criada com o primeiro administrador.');
      setOpen(false);
      setForm({ name: '', slug: '', city: '', state: '', cnpj: '', adminName: '', adminEmail: '', adminPassword: '' });
      qc.invalidateQueries({ queryKey: ['tenants'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const counts = useMemo(() => ({
    total: tenants.length,
    active: tenants.filter((t) => t.status === 'active').length,
    trial: tenants.filter((t) => t.status === 'trial').length,
    suspended: tenants.filter((t) => t.status === 'suspended').length,
  }), [tenants]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Prefeituras</h1>
          <p className="text-sm text-slate-500">Cadastro, white-label e provisionamento.</p>
        </div>
        <Button onClick={() => setOpen(true)}>Nova prefeitura</Button>
      </div>

      {/* Cards pequenos (KPI) */}
      <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 md:grid-cols-2 lg:grid-cols-4">
        <SGFKPICard title="Total de prefeituras" value={counts.total} loading={isLoading} icon={Building2}
          iconColor="text-emerald-500" chartColor="#10b981" chartData={creationSeries(tenants)} />
        <SGFKPICard title="Ativas" value={counts.active} loading={isLoading} icon={ShieldCheck}
          iconColor="text-teal-500" chartColor="#14b8a6" chartData={creationSeries(tenants, 'active')} />
        <SGFKPICard title="Em trial" value={counts.trial} loading={isLoading} icon={Sparkle}
          iconColor="text-blue-500" chartColor="#3b82f6" chartData={creationSeries(tenants, 'trial')} />
        <SGFKPICard title="Suspensas" value={counts.suspended} loading={isLoading} icon={XCircle}
          iconColor="text-rose-500" chartColor="#f43f5e" chartData={creationSeries(tenants, 'suspended')} />
      </div>

      {open && (
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Provisionar prefeitura</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Nome" value={form.name} onChange={(e) => set({ name: e.target.value, slug: form.slug || slugify(e.target.value) })} />
            <Input label="Slug (subdomínio)" value={form.slug} onChange={(e) => set({ slug: slugify(e.target.value) })} />
            <Input label="Cidade" value={form.city} onChange={(e) => set({ city: e.target.value })} />
            <Input label="UF" value={form.state} onChange={(e) => set({ state: e.target.value })} />
            <Input label="CNPJ" value={form.cnpj} onChange={(e) => set({ cnpj: e.target.value })} />
            <div />
            <Input label="Nome do 1º administrador" value={form.adminName} onChange={(e) => set({ adminName: e.target.value })} />
            <Input label="E-mail do administrador" type="email" value={form.adminEmail} onChange={(e) => set({ adminEmail: e.target.value })} />
            <Input label="Senha inicial" type="text" value={form.adminPassword} onChange={(e) => set({ adminPassword: e.target.value })} />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={create.isPending || !form.name || !form.slug || !form.adminEmail || form.adminPassword.length < 6} onClick={() => create.mutate()}>
              {create.isPending ? 'Criando…' : 'Criar prefeitura'}
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-0">
        {isLoading ? <p className="p-5 text-slate-400">Carregando…</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-5 py-3">Prefeitura</th><th className="px-5 py-3">Cidade</th><th className="px-5 py-3">Slug</th><th className="px-5 py-3">Status</th><th></th>
            </tr></thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} onClick={() => navigate(`/prefeituras/${t.id}`)} className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">{t.name}</td>
                  <td className="px-5 py-3 text-slate-600">{t.city ? `${t.city}${t.state ? '/' + t.state : ''}` : '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{t.slug}</td>
                  <td className="px-5 py-3"><Badge status={t.status} /></td>
                  <td className="px-5 py-3 text-right"><Link to={`/prefeituras/${t.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-[var(--sgf-primary)] hover:underline">Gerenciar</Link></td>
                </tr>
              ))}
              {tenants.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">Nenhuma prefeitura.</td></tr>}
            </tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
