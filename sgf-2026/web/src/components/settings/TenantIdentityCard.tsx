import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFInput } from '@/components/sgf/SGFInput';
import { SGFButton } from '@/components/sgf/SGFButton';
import { Building2, Loader2 } from '@/components/sgf/icons';
import { tenantApi, type TenantData } from '@/lib/supabase-api';
import { useAuth } from '@/contexts/AuthContext';
import { applyBrandingColors } from '@/lib/tenantBranding';

type ImageKind = 'logo' | 'seal' | 'photo';

function ImageField({ label, url, onUpload, uploading }: { label: string; url: string; onUpload: (f: File) => void; uploading: boolean }) {
    const ref = useRef<HTMLInputElement>(null);
    return (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                {url ? <img src={url} alt={label} className="h-full w-full object-contain" /> : <Building2 className="h-7 w-7 text-slate-300" />}
            </div>
            <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
            <SGFButton variant="ghost" size="sm" disabled={uploading} icon={uploading ? Loader2 : undefined} onClick={() => ref.current?.click()}>
                {uploading ? 'Enviando...' : 'Trocar'}
            </SGFButton>
        </div>
    );
}

export function TenantIdentityCard() {
    const { refreshUser } = useAuth();
    const [tenant, setTenant] = useState<TenantData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState<ImageKind | null>(null);

    useEffect(() => {
        tenantApi.getCurrent().then((t) => setTenant(t)).finally(() => setLoading(false));
    }, []);

    if (loading) {
        return <SGFCard padding="lg" className="border border-slate-200/80"><div className="flex items-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Carregando identidade...</div></SGFCard>;
    }
    if (!tenant) return null;

    const set = (patch: Partial<TenantData>) => setTenant((t) => (t ? { ...t, ...patch } : t));

    const handleUpload = async (kind: ImageKind, file: File) => {
        setUploading(kind);
        try {
            const url = await tenantApi.uploadBrandingImage(tenant.id, kind, file);
            const field = kind === 'logo' ? 'logoUrl' : kind === 'seal' ? 'sealUrl' : 'photoUrl';
            set({ [field]: url } as Partial<TenantData>);
            toast.success('Imagem enviada. Lembre de salvar.');
        } catch {
            toast.error('Falha ao enviar a imagem.');
        } finally {
            setUploading(null);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await tenantApi.update(tenant.id, tenant);
            applyBrandingColors({ ...tenant } as never);
            await refreshUser();
            toast.success('Identidade da prefeitura salva.');
        } catch {
            toast.error('Erro ao salvar a identidade.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <SGFCard padding="lg" className="border border-slate-200/80">
            <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-slate-400" />
                    <div>
                        <h3 className="text-lg font-semibold text-slate-900">Identidade da Prefeitura</h3>
                        <p className="text-sm text-slate-500">Logo, brasão, cores e dados que aparecem no painel e nos relatórios.</p>
                    </div>
                </div>
                <SGFButton onClick={handleSave} disabled={saving} icon={saving ? Loader2 : undefined}>{saving ? 'Salvando...' : 'Salvar'}</SGFButton>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:max-w-md">
                <ImageField label="Logo" url={tenant.logoUrl} uploading={uploading === 'logo'} onUpload={(f) => handleUpload('logo', f)} />
                <ImageField label="Brasão" url={tenant.sealUrl} uploading={uploading === 'seal'} onUpload={(f) => handleUpload('seal', f)} />
                <ImageField label="Foto" url={tenant.photoUrl} uploading={uploading === 'photo'} onUpload={(f) => handleUpload('photo', f)} />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SGFInput label="Nome da prefeitura" value={tenant.name} onChange={(e) => set({ name: e.target.value })} placeholder="Prefeitura Municipal de..." fullWidth />
                <SGFInput label="Nome no app (mobile)" value={tenant.appName} onChange={(e) => set({ appName: e.target.value })} placeholder="Frota Municipal" fullWidth />
                <SGFInput label="CNPJ" value={tenant.cnpj} onChange={(e) => set({ cnpj: e.target.value })} placeholder="00.000.000/0001-00" fullWidth />
                <SGFInput label="Prefeito(a)" value={tenant.mayorName} onChange={(e) => set({ mayorName: e.target.value })} fullWidth />
                <SGFInput label="Cidade" value={tenant.city} onChange={(e) => set({ city: e.target.value })} fullWidth />
                <SGFInput label="UF" value={tenant.state} onChange={(e) => set({ state: e.target.value })} placeholder="RS" fullWidth />
                <SGFInput label="Endereço" value={tenant.address} onChange={(e) => set({ address: e.target.value })} fullWidth />
                <SGFInput label="Texto do topo do login" value={tenant.loginEyebrow} onChange={(e) => set({ loginEyebrow: e.target.value })} placeholder="PREFEITURA DE..." fullWidth />
            </div>

            <div className="mt-5">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Cores do tema</p>
                <div className="flex flex-wrap gap-4">
                    {([['Primária', 'primaryColor'], ['Escura', 'darkColor'], ['Destaque', 'accentColor']] as const).map(([lbl, key]) => (
                        <label key={key} className="flex items-center gap-2 text-sm text-slate-600">
                            <input type="color" value={(tenant[key] as string) || '#000000'} onChange={(e) => set({ [key]: e.target.value } as Partial<TenantData>)} className="h-9 w-12 cursor-pointer rounded border border-slate-200" />
                            {lbl}
                        </label>
                    ))}
                </div>
            </div>
        </SGFCard>
    );
}

export default TenantIdentityCard;
