import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tenantsApi, type Tenant } from '@/lib/api';
import { Card, Button, Input, Badge } from '@/lib/ui';
import { SGFCard, SGFSelect } from '@/components/sgf';
import { ArrowLeft, Building2, Receipt, User, Map, ShieldCheck } from '@/components/sgf/icons';
import { ManagersPanel } from '@/components/ManagersPanel';
import { TenantBrandingPreviewModal } from '@/components/branding/TenantBrandingPreviewModal';
import { Eye } from '@/components/sgf/icons';

type Tab = 'identidade' | 'acessos';

export default function TenantDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['tenant', id], queryFn: () => tenantsApi.get(id) });
  const { data: stats } = useQuery({ queryKey: ['tenant-stats', id], queryFn: () => tenantsApi.stats(id), enabled: !!id });
  const [t, setT] = useState<Tenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<Tab>('identidade');
  const [showPreview, setShowPreview] = useState(false);
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

  const uploadBranding = async (kind: 'photo' | 'seal' | 'logo', file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await tenantsApi.uploadBrandingImage(t.id, kind, file);
      const field = kind === 'photo' ? 'photo_url' : kind === 'seal' ? 'seal_url' : 'logo_url';
      await tenantsApi.update(t.id, { [field]: url });
      set({ [field]: url } as Partial<Tenant>);
      toast.success('Imagem atualizada.');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUploading(false);
    }
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
            <div className="flex h-12 w-12 shrink-0 items-center justify-center">
              {t.photo_url || t.seal_url || t.logo_url
                ? <img src={(t.photo_url || t.seal_url || t.logo_url)!} alt={t.name} className="h-full w-full object-contain" />
                : <div className="flex h-full w-full items-center justify-center rounded-xl bg-[var(--sgf-dark)]"><Building2 className="h-6 w-6 text-white" /></div>}
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
          <SGFSelect value={t.status} onChange={(status) => set({ status })}
            options={[{ value: 'active', label: 'Ativa' }, { value: 'trial', label: 'Trial / Demo' }, { value: 'suspended', label: 'Suspensa' }]}
            className="w-44" />
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
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {([
              ['logo', 'Enviar logo'],
              ['seal', 'Enviar brasão'],
              ['photo', 'Enviar foto da prefeitura'],
            ] as const).map(([kind, label]) => (
              <label key={kind} className={`block rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
                <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
                <input type="file" accept="image/*" onChange={(e) => void uploadBranding(kind, e.target.files?.[0])} className="block w-full text-xs text-slate-500 file:mr-2 file:rounded-full file:border-0 file:bg-emerald-100 file:px-3 file:py-2 file:font-semibold file:text-emerald-700" />
              </label>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 pt-5">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Cores do painel</p>
              <div className="flex flex-wrap gap-3">
            {([['Primária', 'primary_color'], ['Escura', 'dark_color'], ['Destaque', 'accent_color']] as const).map(([lbl, key]) => (
              <label key={key} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                <input aria-label={`Cor ${lbl.toLowerCase()}`} type="color" value={(t[key] as string) || '#000000'} onChange={(e) => set({ [key]: e.target.value } as Partial<Tenant>)} className="h-8 w-10 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
                <span>
                  <span className="block text-[10px] uppercase tracking-wide text-slate-400">{lbl}</span>
                  <span className="font-mono text-xs">{(t[key] as string) || '#000000'}</span>
                </span>
              </label>
            ))}
              </div>
            </div>
            <Button variant="outline" onClick={() => setShowPreview(true)}>
              <Eye className="h-4 w-4" /> Visualizar painel
            </Button>
          </div>
        </Card>
      )}

      {tab === 'acessos' && <ManagersPanel tenantId={t.id} />}

      <TenantBrandingPreviewModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        branding={{
          name: t.name,
          slug: t.slug,
          appName: t.app_name ?? undefined,
          loginEyebrow: t.login_eyebrow ?? undefined,
          logoUrl: t.logo_url ?? undefined,
          sealUrl: t.seal_url ?? undefined,
          photoUrl: t.photo_url ?? undefined,
          primaryColor: t.primary_color ?? undefined,
          darkColor: t.dark_color ?? undefined,
          accentColor: t.accent_color ?? undefined,
          city: t.city ?? undefined,
          state: t.state ?? undefined,
        }}
      />
    </div>
  );
}
