import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { iopgpsApi } from '@/lib/iopgpsApi';
import { tenantsApi } from '@/lib/api';
import { Button, Input } from '@/lib/ui';
import { SGFSelect, SGFCard } from '@/components/sgf';
import { MapPin } from '@/components/sgf/icons';

/** Credenciais da Open API IOPGPS: globais ou por prefeitura. */
export function IopgpsCredentialsCard() {
  const qc = useQueryClient();
  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list });
  const [f, setF] = useState({ tenant_id: '', appid: '', app_secret: '', base_url: 'https://open.iopgps.com' });
  const set = (p: Partial<typeof f>) => setF((c) => ({ ...c, ...p }));

  const save = useMutation({
    mutationFn: () => iopgpsApi.saveCredentials({
      tenant_id: f.tenant_id || null, base_url: f.base_url, appid: f.appid.trim(), app_secret: f.app_secret.trim(),
    }),
    onSuccess: () => {
      toast.success('Credenciais salvas.');
      setF((c) => ({ ...c, appid: '', app_secret: '' }));
      qc.invalidateQueries({ queryKey: ['iopgps-status'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <SGFCard padding="lg" title="Credenciais IOPGPS" icon={MapPin}>
      <p className="-mt-1 mb-4 text-sm text-[var(--rt-ink500)]">appid e chave secreta da conta Open API (open.iopgps.com). Sem prefeitura, valem para todas.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SGFSelect label="Prefeitura (vazio = global)" fullWidth value={f.tenant_id} placeholder="Global (todas)"
          onChange={(tenant_id) => set({ tenant_id })}
          options={[{ value: '', label: 'Global (todas)' }, ...tenants.map((t) => ({ value: t.id, label: t.name }))]} />
        <Input label="Base URL" value={f.base_url} onChange={(e) => set({ base_url: e.target.value })} />
        <Input label="appid" value={f.appid} onChange={(e) => set({ appid: e.target.value })} />
        <Input label="Chave secreta (app secret)" type="password" value={f.app_secret} onChange={(e) => set({ app_secret: e.target.value })} />
      </div>
      <div className="mt-5 flex justify-end">
        <Button disabled={!f.appid || !f.app_secret || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Salvando…' : 'Salvar credenciais'}</Button>
      </div>
    </SGFCard>
  );
}
