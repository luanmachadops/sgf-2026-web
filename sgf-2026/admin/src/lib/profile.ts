import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './auth';

export type MyProfile = { id: string; full_name: string | null; phone: string | null; photo_url: string | null; tenant_id: string | null };

/** A foto pode estar guardada como caminho do bucket `fotos` (privado) ou URL antiga. */
async function signedPhoto(value: string | null): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//.test(value)) return value;
  const { data } = await supabase.storage.from('fotos').createSignedUrl(value, 60 * 60);
  return data?.signedUrl ?? null;
}

export function useMyProfile() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['my-profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, phone, photo_url, tenant_id').eq('id', userId!).maybeSingle();
      if (error) throw error;
      const p = data as MyProfile | null;
      return p ? { ...p, photoSrc: await signedPhoto(p.photo_url) } : null;
    },
  });
}

export function useInvalidateProfile() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['my-profile'] });
}

const MAX_PHOTO = 5 * 1024 * 1024;

/** Envia a foto de perfil (só imagem, até 5 MB) e grava o caminho no perfil. */
export async function uploadMyPhoto(profile: MyProfile, file: File): Promise<void> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  if (file.size > MAX_PHOTO) throw new Error('A foto deve ter no máximo 5 MB.');
  if (!profile.tenant_id) throw new Error('Conta sem prefeitura vinculada para guardar a foto.');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `tenant/${profile.tenant_id}/avatars/${profile.id}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('fotos').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Falha ao enviar a foto: ${error.message}`);
  const { error: e2 } = await supabase.from('profiles').update({ photo_url: path }).eq('id', profile.id);
  if (e2) throw e2;
}

export function maskPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
