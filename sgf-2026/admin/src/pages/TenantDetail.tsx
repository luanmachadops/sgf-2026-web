import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tenantsApi, type Tenant } from '@/lib/api';
import { Card, Button, Input, Badge } from '@/lib/ui';
import { SGFCard } from '@/components/sgf';
import { ArrowLeft, Building2, Receipt, User, Map, ShieldCheck } from '@/components/sgf/icons';
import { ManagersPanel } from '@/components/ManagersPanel';

type Tab = 'identidade' | 'acessos';

export default function TenantDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['tenant', id], queryFn: () => tenantsApi.get(id) });
  const { data: stats } = useQuery({ queryKey: ['tenant-stats', id], queryFn: () => tenantsApi.stats(id), enabled: !!id });
  const [t, setT] = useState<Tenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('identidade');
  useEffect(() => { if (data) setT(data); }, [data]);

  if (isLoading || !t) return <p className="text-slate-400">Carregando…</p>;
  const set = (p: Partial<Tenant>) => setT((cur) => (cur ? { ...cur, ...p } : cur));

  const save = async () => {
    setSaving(true);
    try {
      await tenantsApi.update(t.id, {
        name: t.name, slug: t.slug, city: t.city, state: t.state, cnpj: t.cnpj, address: t.address,
        mayor_name: t.mayor_name, app_name: t.app_name, login_eyebrow: t.login_eyebrow,
        logo_url: t.logo_url, seal_url: t.seal_url, photo_url: t.photo_url,
        primary_color: t.primary_color, dark_color: t.dark_color, accent_color: t.accent_color,
        report_footer: t.report_footer, status: t.status,
      });
      toast.success('Prefeitura salva.');
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const STATS = [
    { icon: Receipt, color: 'text-blue-600', bg: 'bg-blue-50', value: stats?.vehicles ?? '—', label: 'Veículos' },
    { icon: User, color: 'text-violet-600', bg: 'bg-violet-50', value: stats?.drivers ?? '—', label: 'Motoristas' },
    { icon: Map, color: 'text-emerald-600', bg: 'bg-emerald-50', value: stats?.trackers ?? '—', label: 'Rastreadores' },
    { icon: ShieldCheck, color: 'text-amber-600', bg: 'bg-amber-50', value: stats?.managers ?? '—', label: 'Gestores' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/prefeituras')}><ArrowLeft className="h-4 w-4" /> Voltar</Button>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--sgf-dark)]">
              {t.seal_url || t.logo_url ? <img src={(t.seal_url || t.logo_url)!} alt={t.name} className="h-full w-full object-contain" /> : <Building2 className="h-6 w-6 text-white" />}
            </div>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 truncate text-2xl font-bold text-slate-900">
                {t.name} <Badge status={t.status} />
              </h1>
              <p className="truncate text-sm text-slate-500">{[t.city ? `${t.city}${t.state ? '/' + t.state : ''}` : '', t.slug].filter(Boolean).join('  •  ')}</p>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <select value={t.status} onChange={(e) => set({ status: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
            <option value="active">Ativa</option><option value="trial">Trial / Demo</option><option value="suspended">Suspensa</option>
          </select>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {STATS.map((s) => {
          const Icon = s.icon;
          return (
            <SGFCard key={s.label} padding="sm">
              <div className="flex items-center gap-3">
                <div className={`rounded-xl p-2.5 ${s.bg}`}><Icon className={`h-5 w-5 ${s.color}`} /></div>
                <div className="min-w-0">
                  <p className="truncate text-xl font-bold text-slate-900">{s.value}</p>
                  <p className="truncate text-sm text-slate-500">{s.label}</p>
                </div>
              </div>
            </SGFCard>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="mx-auto grid w-full grid-cols-2 gap-1 rounded-xl bg-slate-100/70 p-1 sm:w-[320px]">
        {([['identidade', 'Identidade'], ['acessos', 'Acessos']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`rounded-lg py-2 text-sm font-semibold transition-all ${tab === key ? 'bg-[#00A86B] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'identidade' && (
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Dados & White-label</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Nome" value={t.name} onChange={(e) => set({ name: e.target.value })} />
            <Input label="Slug" value={t.slug} onChange={(e) => set({ slug: e.target.value })} />
            <Input label="Nome no app" value={t.app_name ?? ''} onChange={(e) => set({ app_name: e.target.value })} />
            <Input label="Topo do login" value={t.login_eyebrow ?? ''} onChange={(e) => set({ login_eyebrow: e.target.value })} />
            <Input label="Cidade" value={t.city ?? ''} onChange={(e) => set({ city: e.target.value })} />
            <Input label="UF" value={t.state ?? ''} onChange={(e) => set({ state: e.target.value })} />
            <Input label="CNPJ" value={t.cnpj ?? ''} onChange={(e) => set({ cnpj: e.target.value })} />
            <Input label="Prefeito(a)" value={t.mayor_name ?? ''} onChange={(e) => set({ mayor_name: e.target.value })} />
            <Input label="Endereço" value={t.address ?? ''} onChange={(e) => set({ address: e.target.value })} />
            <Input label="Rodapé dos relatórios" value={t.report_footer ?? ''} onChange={(e) => set({ report_footer: e.target.value })} />
            <Input label="Logo (URL)" value={t.logo_url ?? ''} onChange={(e) => set({ logo_url: e.target.value })} />
            <Input label="Brasão (URL)" value={t.seal_url ?? ''} onChange={(e) => set({ seal_url: e.target.value })} />
            <Input label="Foto (URL)" value={t.photo_url ?? ''} onChange={(e) => set({ photo_url: e.target.value })} />
          </div>
          <div className="mt-4 flex flex-wrap gap-4">
            {([['Primária', 'primary_color'], ['Escura', 'dark_color'], ['Destaque', 'accent_color']] as const).map(([lbl, key]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-slate-600">
                <input type="color" value={(t[key] as string) || '#000000'} onChange={(e) => set({ [key]: e.target.value } as Partial<Tenant>)} className="h-9 w-12 rounded border border-slate-200" />
                {lbl}
              </label>
            ))}
          </div>
        </Card>
      )}

      {tab === 'acessos' && <ManagersPanel tenantId={t.id} />}
    </div>
  );
}
