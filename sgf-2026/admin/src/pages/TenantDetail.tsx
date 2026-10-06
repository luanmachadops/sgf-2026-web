import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tenantsApi, type Tenant } from '@/lib/api';
import { Button, Input, Badge } from '@/lib/ui';
import { SGFCard, SGFSelect } from '@/components/sgf';
import { ArrowLeft, Building2, Car, User, Map, ShieldCheck } from '@/components/sgf/icons';
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

  if (isLoading || !t) return <div className="h-72 animate-pulse rounded-[var(--rt-radius-card)] bg-white" />;
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
    { icon: Car, value: stats?.vehicles, label: 'Veículos' },
    { icon: User, value: stats?.drivers, label: 'Motoristas' },
    { icon: Map, value: stats?.trackers, label: 'Rastreadores' },
    { icon: ShieldCheck, value: stats?.managers, label: 'Gestores' },
  ];
  const IMAGES = [
    { kind: 'photo' as const, key: 'photo_url' as const, label: 'Foto da prefeitura', hint: 'Capa do login e dos cartões', cover: true },
    { kind: 'seal' as const, key: 'seal_url' as const, label: 'Brasão', hint: 'Relatórios e cabeçalhos', cover: false },
    { kind: 'logo' as const, key: 'logo_url' as const, label: 'Logo', hint: 'Marca no painel do gestor', cover: false },
  ];
  const mark = t.seal_url || t.logo_url;

  return (
    <div className="space-y-6">
      {/* Destaque da prefeitura */}
      <section className="rt-rise relative overflow-hidden rounded-[var(--rt-radius-card)] bg-[var(--rt-ink900)] text-white">
        {t.photo_url && <img src={t.photo_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--rt-ink900)] via-[var(--rt-ink900)]/85 to-[var(--rt-ink900)]/40" aria-hidden />
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button onClick={() => navigate('/prefeituras')} className="inline-flex h-10 items-center gap-2 rounded-full bg-white/10 pl-3 pr-4 text-sm font-semibold transition hover:bg-white/15">
              <ArrowLeft className="h-4 w-4" /> Prefeituras
            </button>
            <div className="flex items-center gap-2">
              <SGFSelect value={t.status} onChange={(status) => set({ status })}
                options={[{ value: 'active', label: 'Ativa' }, { value: 'trial', label: 'Trial / Demo' }, { value: 'suspended', label: 'Suspensa' }]}
                className="w-44" tone="dark" triggerClassName="!h-11 !rounded-full !bg-white/12 hover:!bg-white/20" />
              <Button onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</Button>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white ring-4 ring-white/10">
              {mark ? <img src={mark} alt="" className="h-full w-full object-contain p-1.5" /> : <Building2 className="h-7 w-7 text-[var(--rt-ink900)]" />}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-bold tracking-[-0.01em] sm:text-[28px]">{t.name}</h1>
                <Badge status={t.status} />
              </div>
              <p className="mt-1 truncate text-sm text-white/60">{[t.city ? `${t.city}${t.state ? '/' + t.state : ''}` : '', t.slug].filter(Boolean).join(' · ')}</p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 border-t border-white/10 pt-6 sm:grid-cols-4">
            {STATS.map((st) => (
              <div key={st.label} className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10"><st.icon width={20} height={20} /></span>
                <div>
                  <p className="rt-num text-2xl font-light leading-none">{st.value ?? '—'}</p>
                  <p className="mt-1 text-xs text-white/55">{st.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Abas em pílula */}
      <div className="inline-flex rounded-full bg-white p-1 shadow-[var(--rt-shadow-card)]" role="tablist">
        {([['identidade', 'Identidade'], ['acessos', 'Gestores e acessos']] as const).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`h-10 rounded-full px-5 text-sm font-semibold transition ${tab === key ? 'bg-[var(--rt-ink900)] text-white' : 'text-[var(--rt-ink500)] hover:text-[var(--rt-ink900)]'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'identidade' && (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <SGFCard padding="lg" title="Dados do município" icon={Building2}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Nome" value={t.name} onChange={(e) => set({ name: e.target.value })} className="sm:col-span-2" />
                <Input label="Cidade" value={t.city ?? ''} onChange={(e) => set({ city: e.target.value })} />
                <Input label="UF" value={t.state ?? ''} maxLength={2} onChange={(e) => set({ state: e.target.value.toUpperCase() })} />
                <Input label="CNPJ" value={t.cnpj ?? ''} onChange={(e) => set({ cnpj: e.target.value })} />
                <Input label="Prefeito(a)" value={t.mayor_name ?? ''} onChange={(e) => set({ mayor_name: e.target.value })} />
                <Input label="Endereço" value={t.address ?? ''} onChange={(e) => set({ address: e.target.value })} className="sm:col-span-2" />
              </div>
            </SGFCard>

            <SGFCard padding="lg" title="Aparência no sistema" icon={Eye}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Endereço no sistema (slug)" value={t.slug} onChange={(e) => set({ slug: e.target.value })} />
                <Input label="Nome no app" value={t.app_name ?? ''} onChange={(e) => set({ app_name: e.target.value })} />
                <Input label="Texto acima do login" value={t.login_eyebrow ?? ''} onChange={(e) => set({ login_eyebrow: e.target.value })} />
                <Input label="Rodapé dos relatórios" value={t.report_footer ?? ''} onChange={(e) => set({ report_footer: e.target.value })} />
              </div>

              <p className="mb-3 mt-6 text-[13px] font-medium text-[var(--rt-ink500)]">Cores da prefeitura</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {([['Primária', 'primary_color'], ['Escura', 'dark_color'], ['Destaque', 'accent_color']] as const).map(([lbl, key]) => (
                  <label key={key} className="flex cursor-pointer items-center gap-3 rounded-2xl bg-[var(--rt-paper)] p-2.5 transition hover:bg-[var(--rt-paper2)]">
                    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]" style={{ background: (t[key] as string) || '#000000' }}>
                      <input aria-label={`Cor ${lbl.toLowerCase()}`} type="color" value={(t[key] as string) || '#000000'} onChange={(e) => set({ [key]: e.target.value } as Partial<Tenant>)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-[var(--rt-ink900)]">{lbl}</span>
                      <span className="font-mono text-xs uppercase text-[var(--rt-ink500)]">{(t[key] as string) || '#000000'}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-5 flex justify-end">
                <Button variant="outline" onClick={() => setShowPreview(true)}><Eye className="h-4 w-4" /> Pré-visualizar painel</Button>
              </div>
            </SGFCard>
          </div>

          <SGFCard padding="lg" title="Imagens" icon={Map} className="h-fit">
            <div className="space-y-3">
              {IMAGES.map((img) => {
                const url = t[img.key] as string | null;
                return (
                  <div key={img.kind} className="flex items-center gap-3 rounded-[22px] bg-[var(--rt-paper)] p-2.5">
                    <span className={`grid h-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white text-[var(--rt-ink300)] ${img.cover ? 'w-24' : 'w-16'}`}>
                      {url ? <img src={url} alt="" className={`h-full w-full ${img.cover ? 'object-cover' : 'object-contain p-1.5'}`} /> : <Building2 width={22} height={22} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--rt-ink900)]">{img.label}</p>
                      <p className="text-xs text-[var(--rt-ink500)]">{img.hint}</p>
                    </div>
                    <label className={`inline-flex h-9 cursor-pointer items-center rounded-full bg-white px-4 text-[13px] font-semibold text-[var(--rt-ink900)] shadow-[var(--rt-shadow-card)] transition hover:bg-[var(--rt-paper2)] ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
                      {url ? 'Trocar' : 'Enviar'}
                      <input type="file" accept="image/*" className="sr-only" onChange={(e) => void uploadBranding(img.kind, e.target.files?.[0])} />
                    </label>
                  </div>
                );
              })}
            </div>
            <details className="group mt-4">
              <summary className="cursor-pointer list-none rounded-full px-1 text-[13px] font-semibold text-[var(--rt-ink500)] hover:text-[var(--rt-ink900)]">
                Endereços das imagens (avançado)
              </summary>
              <div className="mt-3 space-y-3">
                <Input label="Logo (URL)" value={t.logo_url ?? ''} onChange={(e) => set({ logo_url: e.target.value })} />
                <Input label="Brasão (URL)" value={t.seal_url ?? ''} onChange={(e) => set({ seal_url: e.target.value })} />
                <Input label="Foto (URL)" value={t.photo_url ?? ''} onChange={(e) => set({ photo_url: e.target.value })} />
              </div>
            </details>
          </SGFCard>
        </div>
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
