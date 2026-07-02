import { supabase } from './supabase';
import { prepareUpload } from './imageUtils';

const DOC_BUCKET = 'documentos';

/**
 * Envia um documento sensível (PDF/imagem) para o bucket PRIVADO, com o path
 * escopado por prefeitura: `<folder>/<tenantId>/<key>-<ts>.<ext>`.
 * Retorna o PATH (não uma URL pública) — guarde-o na coluna do registro.
 */
export async function uploadPrivateDoc(
  file: File,
  folder: string,
  tenantId: string,
  key: string,
): Promise<string> {
  if (!tenantId) throw new Error('Sem prefeitura definida para o upload do documento.');
  const prepared = await prepareUpload(file, { maxSize: 1600, quality: 0.85 });
  const path = `${folder}/${tenantId}/${key}-${Date.now()}.${prepared.ext}`;
  const { error } = await supabase.storage.from(DOC_BUCKET).upload(path, prepared.blob, {
    contentType: prepared.contentType,
    upsert: true,
  });
  if (error) throw error;
  return path;
}

/**
 * Resolve um valor de documento para uma URL utilizável:
 * - se já for uma URL http(s) (registros antigos, bucket público), retorna como está;
 * - se for um path do bucket privado, gera uma URL assinada temporária.
 */
export async function resolveDocUrl(pathOrUrl: string | null | undefined, expiresInSec = 3600): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(pathOrUrl, expiresInSec);
  if (error) throw error;
  return data?.signedUrl ?? null;
}
