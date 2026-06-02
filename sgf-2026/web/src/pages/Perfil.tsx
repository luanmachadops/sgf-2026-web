import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SGFCard } from '@/components/sgf/SGFCard';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFInput } from '@/components/sgf/SGFInput';
import { Camera, Loader2, ShieldCheck, LockKeyhole } from '@/components/sgf/icons';
import { useHeader } from '@/contexts/HeaderContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { resizeAndConvertToWebP, isImageFile } from '@/lib/imageUtils';
import { maskPhone } from '@/lib/utils';

function getInitials(name: string) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '–';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ROLE_LABEL: Record<string, string> = { ADMIN: 'Administrador', MANAGER: 'Gestor', VIEWER: 'Motorista' };

export default function Perfil() {
    const { setTitle, setDescription } = useHeader();
    const { user } = useAuth();
    const qc = useQueryClient();
    const fileRef = useRef<HTMLInputElement>(null);

    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [photoUrl, setPhotoUrl] = useState('');
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [pwd, setPwd] = useState('');
    const [pwd2, setPwd2] = useState('');
    const [pwdSaving, setPwdSaving] = useState(false);

    useEffect(() => {
        setTitle('Meu perfil');
        setDescription('Gerencie seus dados de acesso e informações pessoais.');
    }, [setTitle, setDescription]);

    const { data: profile } = useQuery({
        queryKey: ['profile', 'me', user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, email, phone, role, photo_url, departments(name)')
                .eq('id', user!.id)
                .single();
            if (error) throw error;
            return data;
        },
        enabled: Boolean(user?.id),
    });

    useEffect(() => {
        if (!profile) return;
        setName(profile.full_name ?? '');
        setPhone(maskPhone(profile.phone ?? ''));
        setPhotoUrl((profile as { photo_url?: string | null }).photo_url ?? '');
    }, [profile]);

    const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;
        if (!isImageFile(file)) { toast.error('Selecione uma imagem válida.'); return; }
        try {
            setUploading(true);
            const blob = await resizeAndConvertToWebP(file, 800);
            const fileName = `drivers/${user.id}-${Date.now()}.webp`;
            const { error } = await supabase.storage.from('fotos').upload(fileName, blob, { contentType: 'image/webp', upsert: true });
            if (error) throw error;
            setPhotoUrl(supabase.storage.from('fotos').getPublicUrl(fileName).data.publicUrl);
            toast.success('Foto carregada. Salve para confirmar.');
        } catch (err) {
            toast.error((err as { message?: string })?.message ?? 'Erro ao enviar a foto.');
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const handleSave = async () => {
        if (!user) return;
        if (!name.trim()) { toast.error('Informe seu nome.'); return; }
        try {
            setSaving(true);
            const { error } = await supabase
                .from('profiles')
                .update({ full_name: name.trim(), phone: phone.replace(/\D/g, '') || null, photo_url: photoUrl || null })
                .eq('id', user.id);
            if (error) throw error;
            await qc.invalidateQueries({ queryKey: ['profile', 'me', user.id] });
            toast.success('Perfil atualizado!');
        } catch (err) {
            toast.error((err as { message?: string })?.message ?? 'Erro ao salvar o perfil.');
        } finally {
            setSaving(false);
        }
    };

    const handlePassword = async () => {
        if (pwd.length < 6) { toast.error('A senha deve ter ao menos 6 caracteres.'); return; }
        if (pwd !== pwd2) { toast.error('As senhas não coincidem.'); return; }
        try {
            setPwdSaving(true);
            const { error } = await supabase.auth.updateUser({ password: pwd });
            if (error) throw error;
            setPwd(''); setPwd2('');
            toast.success('Senha alterada com sucesso!');
        } catch (err) {
            toast.error((err as { message?: string })?.message ?? 'Erro ao alterar a senha.');
        } finally {
            setPwdSaving(false);
        }
    };

    const role = (profile?.role ?? user?.role ?? '').toUpperCase();
    const deptName = (profile as { departments?: { name?: string } | null } | undefined)?.departments?.name;

    return (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Cartão de identidade */}
            <SGFCard padding="lg" className="border border-slate-200/80 lg:col-span-1">
                <div className="flex flex-col items-center text-center">
                    <div className="relative">
                        {photoUrl ? (
                            <img src={photoUrl} alt={name} className="h-28 w-28 rounded-full object-cover shadow-sm" />
                        ) : (
                            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-3xl font-bold text-white shadow-sm">
                                {getInitials(name || user?.name || '')}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-white shadow hover:bg-emerald-600"
                            title="Alterar foto"
                        >
                            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                        </button>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-slate-900">{name || user?.name}</h3>
                    <p className="text-sm text-slate-500">{profile?.email ?? user?.email}</p>
                    <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                        <ShieldCheck className="h-3.5 w-3.5" /> {ROLE_LABEL[role] ?? role}
                    </span>
                    {deptName && <p className="mt-2 text-xs text-slate-400">{deptName}</p>}
                </div>
            </SGFCard>

            <div className="space-y-6 lg:col-span-2">
                {/* Dados pessoais */}
                <SGFCard padding="lg" className="border border-slate-200/80">
                    <h3 className="mb-4 text-lg font-semibold text-slate-900">Dados pessoais</h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <SGFInput label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
                        <SGFInput label="Telefone" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(00) 00000-0000" fullWidth />
                        <SGFInput label="E-mail" value={profile?.email ?? user?.email ?? ''} disabled fullWidth hint="O e-mail de acesso não pode ser alterado aqui." />
                    </div>
                    <div className="mt-5 flex justify-end">
                        <SGFButton icon={saving ? Loader2 : undefined} disabled={saving} onClick={handleSave}>
                            {saving ? 'Salvando...' : 'Salvar alterações'}
                        </SGFButton>
                    </div>
                </SGFCard>

                {/* Segurança */}
                <SGFCard padding="lg" className="border border-slate-200/80">
                    <div className="mb-4 flex items-center gap-2">
                        <LockKeyhole className="h-5 w-5 text-slate-400" />
                        <h3 className="text-lg font-semibold text-slate-900">Alterar senha</h3>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <SGFInput label="Nova senha" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Mínimo 6 caracteres" fullWidth />
                        <SGFInput label="Confirmar nova senha" type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} fullWidth />
                    </div>
                    <div className="mt-5 flex justify-end">
                        <SGFButton variant="secondary" icon={pwdSaving ? Loader2 : undefined} disabled={pwdSaving} onClick={handlePassword}>
                            {pwdSaving ? 'Alterando...' : 'Alterar senha'}
                        </SGFButton>
                    </div>
                </SGFCard>
            </div>
        </div>
    );
}
