import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Button, Input } from '@/lib/ui';
import { PageHeader, SGFCard } from '@/components/sgf';
import { ShieldCheck, User, Camera } from '@/components/sgf/icons';
import { NotificationPrefsCard } from '@/components/Notifications';
import { IopgpsCredentialsCard } from '@/components/IopgpsCredentialsCard';
import { AiModelCard } from '@/components/AiModelCard';
import { useMyProfile, useInvalidateProfile, uploadMyPhoto, maskPhone } from '@/lib/profile';

function initials(name: string | null | undefined, email: string | null) {
  const base = (name || email || '?').trim();
  return base.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function Settings() {
  const { email, logout } = useAuth();
  const { data: profile, isLoading } = useMyProfile();
  const invalidate = useInvalidateProfile();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (!profile) return;
    setName(profile.full_name ?? '');
    setPhone(maskPhone(profile.phone ?? ''));
  }, [profile]);

  const saveProfile = async () => {
    if (!profile) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase.from('profiles').update({ full_name: name.trim() || undefined, phone: phone.replace(/\D/g, '') || null }).eq('id', profile.id);
      if (error) throw error;
      toast.success('Perfil atualizado.');
      invalidate();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSavingProfile(false); }
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file || !profile) return;
    setUploading(true);
    try { await uploadMyPhoto(profile, file); toast.success('Foto atualizada.'); invalidate(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setUploading(false); }
  };


  const dirty = !!profile && (name.trim() !== (profile.full_name ?? '') || phone.replace(/\D/g, '') !== (profile.phone ?? '').replace(/\D/g, ''));

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" subtitle="Seu perfil, avisos e integrações." />

      {/* Perfil em destaque */}
      <section className="rt-rise relative overflow-hidden rounded-[var(--rt-radius-card)] bg-[var(--rt-ink900)] p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[var(--rt-brand)]/20 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-5">
          <label className={`group relative h-24 w-24 shrink-0 cursor-pointer ${uploading ? 'pointer-events-none' : ''}`} title="Trocar foto">
            <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-[var(--rt-brand)] text-2xl font-bold ring-4 ring-white/10">
              {profile?.photoSrc ? <img src={profile.photoSrc} alt="" className="h-full w-full object-cover" /> : initials(profile?.full_name, email)}
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--rt-ink900)] shadow-lg transition group-hover:scale-105">
              {uploading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--rt-ink300)] border-t-[var(--rt-ink900)]" /> : <Camera width={18} height={18} />}
            </span>
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => { void onPhoto(e.target.files?.[0]); e.currentTarget.value = ''; }} />
          </label>
          <div className="min-w-0">
            <p className="text-2xl font-bold tracking-[-0.01em]">{isLoading ? '…' : profile?.full_name || 'Sem nome'}</p>
            <p className="mt-1 truncate text-sm text-white/60">{email}</p>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold"><ShieldCheck width={14} height={14} /> Superusuário</span>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-2">
      <SGFCard padding="lg" title="Dados pessoais" icon={User}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} className="sm:col-span-2" />
          <Input label="Telefone" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel" />
          <Input label="E-mail" value={email ?? ''} readOnly hint="O e-mail de acesso não é alterado por aqui." />
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={saveProfile} disabled={!dirty || savingProfile}>{savingProfile ? 'Salvando…' : 'Salvar perfil'}</Button>
        </div>
      </SGFCard>

      <NotificationPrefsCard />
      </div>

      <AiModelCard />

      <IopgpsCredentialsCard />

      <SGFCard padding="lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--rt-ink900)]">Sair da conta</h3>
            <p className="text-sm text-[var(--rt-ink500)]">Encerra a sessão neste navegador.</p>
          </div>
          <Button variant="outline" onClick={logout}>Sair</Button>
        </div>
      </SGFCard>
    </div>
  );
}
