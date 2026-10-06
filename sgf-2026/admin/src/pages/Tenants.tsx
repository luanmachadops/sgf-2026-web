import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tenantsApi, provisionTenant, type Tenant } from '@/lib/api';
import { Button, Input, Badge } from '@/lib/ui';
import { PageHeader, Sheet, ImageDrop, FilterChip, SearchField, SGFTable, ViewToggle, useViewMode } from '@/components/sgf';
import { TenantIdentity } from '@/components/TenantIdentity';
import { Building2, ChevronRight, Plus } from '@/components/sgf/icons';
import { PASSWORD_MIN_LENGTH, PASSWORD_PLACEHOLDER } from '@/lib/passwordPolicy';

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function Tenants() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: tenants = [], isLoading } = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', city: '', state: '', cnpj: '', adminName: '', adminEmail: '', adminPassword: '' });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [sealFile, setSealFile] = useState<File | null>(null);
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  const create = useMutation({
    mutationFn: async () => {
      const result = await provisionTenant(form);
      const branding: { photo_url?: string; seal_url?: string } = {};
      if (photoFile) branding.photo_url = await tenantsApi.uploadBrandingImage(result.tenantId, 'photo', photoFile);
      if (sealFile) branding.seal_url = await tenantsApi.uploadBrandingImage(result.tenantId, 'seal', sealFile);
      if (Object.keys(branding).length) await tenantsApi.update(result.tenantId, branding);
      return result;
    },
    onSuccess: () => {
      toast.success('Prefeitura criada com o primeiro administrador.');
      setOpen(false);
      setForm({ name: '', slug: '', city: '', state: '', cnpj: '', adminName: '', adminEmail: '', adminPassword: '' });
      setPhotoFile(null);
      setSealFile(null);
      qc.invalidateQueries({ queryKey: ['tenants'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [filter, setFilter] = useState<'all' | 'active' | 'trial' | 'suspended'>('all');
  const [q, setQ] = useState('');
  const [view, setView] = useViewMode('tenants');
  const counts = useMemo(() => ({
    all: tenants.length,
    active: tenants.filter((t) => t.status === 'active').length,
    trial: tenants.filter((t) => t.status === 'trial').length,
    suspended: tenants.filter((t) => t.status === 'suspended').length,
  }), [tenants]);
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return tenants.filter((t) =>
      (filter === 'all' || t.status === filter)
      && (!term || [t.name, t.city, t.slug, t.state].some((v) => (v ?? '').toLowerCase().includes(term))));
  }, [tenants, filter, q]);
  const canCreate = !!form.name && !!form.slug && !!form.adminEmail && form.adminPassword.length >= PASSWORD_MIN_LENGTH;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prefeituras"
        subtitle="Cadastro, identidade visual e provisionamento de cada município."
        actions={<Button onClick={() => setOpen(true)}><Plus width={18} height={18} /> Nova prefeitura</Button>}
      />

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        {/* Filtros: em telas estreitas rolam na horizontal em vez de quebrar em várias linhas. */}
        <div className="-mx-4 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0">
          <FilterChip label="Todas" count={counts.all} active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterChip label="Ativas" count={counts.active} active={filter === 'active'} onClick={() => setFilter('active')} />
          <FilterChip label="Em trial" count={counts.trial} active={filter === 'trial'} onClick={() => setFilter('trial')} />
          <FilterChip label="Suspensas" count={counts.suspended} active={filter === 'suspended'} onClick={() => setFilter('suspended')} />
        </div>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 xl:w-72 xl:flex-none [&>label]:!w-full">
            <SearchField value={q} onChange={setQ} placeholder="Buscar prefeitura ou cidade" />
          </div>
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-64 animate-pulse rounded-[var(--rt-radius-card)] bg-white" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="grid place-items-center rounded-[var(--rt-radius-card)] bg-white px-6 py-16 text-center shadow-[var(--rt-shadow-card)]">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--rt-paper)] text-[var(--rt-ink400)]"><Building2 width={26} height={26} /></span>
          <p className="mt-4 text-[15px] font-semibold text-[var(--rt-ink900)]">{tenants.length === 0 ? 'Nenhuma prefeitura cadastrada' : 'Nada encontrado'}</p>
          <p className="mt-1 text-sm text-[var(--rt-ink500)]">{tenants.length === 0 ? 'Comece provisionando a primeira prefeitura.' : 'Ajuste o filtro ou a busca.'}</p>
        </div>
      ) : view === 'table' ? (
        <SGFTable<Tenant>
          data={visible}
          keyExtractor={(t) => t.id}
          onRowClick={(t) => navigate(`/prefeituras/${t.id}`)}
          columns={[
            { header: 'Prefeitura', accessor: (t) => <TenantIdentity tenant={t} /> },
            { header: 'Cidade', accessor: (t) => (t.city ? `${t.city}${t.state ? '/' + t.state : ''}` : '—') },
            { header: 'Endereço no sistema', accessor: (t) => <span className="font-mono text-xs">{t.slug}</span> },
            { header: 'Situação', accessor: (t) => <Badge status={t.status} /> },
            { header: '', className: 'text-right', accessor: () => <ChevronRight width={18} height={18} className="ml-auto text-[var(--rt-ink400)]" /> },
          ]}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((t, i) => (
            <button
              key={t.id}
              type="button"
              onClick={() => navigate(`/prefeituras/${t.id}`)}
              className="rt-rise group flex flex-col overflow-hidden rounded-[var(--rt-radius-card)] bg-white text-left shadow-[var(--rt-shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--rt-shadow-float)]"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <div className="relative h-32 w-full overflow-hidden bg-[var(--rt-ink900)]">
                {t.photo_url
                  ? <img src={t.photo_url} alt="" className="h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-[1.03]" />
                  : <div className="h-full w-full bg-[radial-gradient(circle_at_80%_0%,rgb(0_168_107/0.35),transparent_60%)]" />}
                <div className="absolute right-3 top-3"><Badge status={t.status} /></div>
              </div>
              <div className="flex flex-1 items-center gap-3 p-5">
                <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[var(--rt-paper)] text-[var(--rt-brand)]">
                  {t.seal_url || t.logo_url
                    ? <img src={(t.seal_url || t.logo_url) as string} alt="" className="h-full w-full object-contain p-1" />
                    : <Building2 width={24} height={24} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-[var(--rt-ink900)]">{t.name}</p>
                  <p className="truncate text-[13px] text-[var(--rt-ink500)]">
                    {[t.city && `${t.city}${t.state ? '/' + t.state : ''}`, t.slug].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--rt-paper)] text-[var(--rt-ink700)] transition group-hover:bg-[var(--rt-brand)] group-hover:text-white">
                  <ChevronRight width={18} height={18} />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Nova prefeitura"
        subtitle="Cria a prefeitura e o primeiro administrador, que recebe acesso ao painel do gestor."
        size="lg"
        footer={<>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={create.isPending || !canCreate} onClick={() => create.mutate()}>
            {create.isPending ? 'Criando…' : 'Criar prefeitura'}
          </Button>
        </>}
      >
        <div className="space-y-6">
          <fieldset>
            <legend className="mb-3 text-[15px] font-semibold text-[var(--rt-ink900)]">Município</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Nome" value={form.name} onChange={(e) => set({ name: e.target.value, slug: form.slug || slugify(e.target.value) })} placeholder="Prefeitura Municipal de…" />
              <Input label="Endereço no sistema (slug)" value={form.slug} onChange={(e) => set({ slug: slugify(e.target.value) })} placeholder="ex.: tapejara" />
              <Input label="Cidade" value={form.city} onChange={(e) => set({ city: e.target.value })} />
              <Input label="UF" value={form.state} maxLength={2} onChange={(e) => set({ state: e.target.value.toUpperCase() })} placeholder="PR" />
              <Input label="CNPJ" value={form.cnpj} onChange={(e) => set({ cnpj: e.target.value })} className="sm:col-span-2" />
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-3 text-[15px] font-semibold text-[var(--rt-ink900)]">Identidade visual</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ImageDrop label="Foto da prefeitura" file={photoFile} onChange={setPhotoFile} hint="Capa dos cartões e do login" />
              <ImageDrop label="Brasão" file={sealFile} onChange={setSealFile} hint="Aparece nos relatórios" />
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-3 text-[15px] font-semibold text-[var(--rt-ink900)]">Primeiro administrador</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Nome completo" value={form.adminName} onChange={(e) => set({ adminName: e.target.value })} />
              <Input label="E-mail" type="email" value={form.adminEmail} onChange={(e) => set({ adminEmail: e.target.value })} />
              <Input label="Senha inicial" type="text" value={form.adminPassword} onChange={(e) => set({ adminPassword: e.target.value })} placeholder={PASSWORD_PLACEHOLDER} hint={`Mínimo de ${PASSWORD_MIN_LENGTH} caracteres. O administrador troca no primeiro acesso.`} />
            </div>
          </fieldset>
        </div>
      </Sheet>
    </div>
  );
}
