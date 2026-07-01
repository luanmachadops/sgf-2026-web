import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { iopgpsApi } from '@/lib/iopgpsApi';
import { trackersApi, tenantsApi } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { Card, Button, Input } from '@/lib/ui';

function ago(iso: string | null): string {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `há ${s}s`;
  if (s < 3600) return `há ${Math.floor(s / 60)}min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)}h`;
  return `há ${Math.floor(s / 86400)}d`;
}

/** Monitoramento GPS (IOPGPS). Lista status dos dispositivos + comandos remotos. */
export function IopgpsPanel({ tenantId }: { tenantId?: string }) {
  const qc = useQueryClient();
  const fixed = !!tenantId;

  const { data: status = [], isLoading } = useQuery({
    queryKey: ['iopgps-status', tenantId ?? 'all'],
    queryFn: () => iopgpsApi.status(tenantId),
    refetchInterval: 30_000,
  });
  const { data: trackers = [] } = useQuery({ queryKey: ['trackers', tenantId ?? 'all'], queryFn: () => trackersApi.list(tenantId) });
  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list, enabled: !fixed });

  // Mapas auxiliares para enriquecer a tabela.
  const trkByVehicle = useMemo(() => Object.fromEntries(trackers.filter((t) => t.vehicle_id).map((t) => [t.vehicle_id!, t])), [trackers]);
  const trkById = useMemo(() => Object.fromEntries(trackers.map((t) => [t.id, t])), [trackers]);
  const tName = useMemo(() => Object.fromEntries(tenants.map((t) => [t.id, t.name])), [tenants]);

  // Placas dos veículos referenciados.
  const vehicleIds = useMemo(() => Array.from(new Set(status.map((s) => s.vehicle_id).filter(Boolean))) as string[], [status]);
  const { data: plates = {} } = useQuery({
    queryKey: ['vehicle-plates', vehicleIds.join(',')],
    enabled: vehicleIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('vehicles').select('id, plate').in('id', vehicleIds);
      return Object.fromEntries((data ?? []).map((v) => [v.id, v.plate]));
    },
  });

  const sync = useMutation({
    mutationFn: iopgpsApi.syncNow,
    onSuccess: (r) => { toast.success(`Sincronizado: ${r.positions} posições, ${r.alarms} alarmes.`); qc.invalidateQueries({ queryKey: ['iopgps-status'] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const fuel = useMutation({
    mutationFn: ({ trackerId, command }: { trackerId: string; command: 'FUEL_CUT' | 'FUEL_RESTORE' }) => iopgpsApi.fuelCommand(trackerId, command),
    onSuccess: () => toast.success('Comando enviado ao rastreador.'),
    onError: (e) => toast.error((e as Error).message),
  });

  function onFuel(trackerId: string, cut: boolean) {
    const verb = cut ? 'CORTAR o combustível' : 'RETOMAR o combustível';
    if (!confirm(`Tem certeza que deseja ${verb} deste veículo?`)) return;
    if (!confirm(`Confirme novamente: ${verb}. Esta ação afeta o veículo fisicamente.`)) return;
    fuel.mutate({ trackerId, command: cut ? 'FUEL_CUT' : 'FUEL_RESTORE' });
  }

  return (
    <div className="space-y-5">
      <CredentialsCard fixed={fixed} tenantId={tenantId} tenants={tenants} onSaved={() => qc.invalidateQueries({ queryKey: ['iopgps-status'] })} />

      <Card className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <h2 className="text-lg font-semibold text-slate-800">Status dos dispositivos</h2>
          <Button variant="secondary" disabled={sync.isPending} onClick={() => sync.mutate()}>
            {sync.isPending ? 'Sincronizando…' : 'Sincronizar agora'}
          </Button>
        </div>
        {isLoading ? <p className="p-5 text-slate-400">Carregando…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                {!fixed && <th className="px-5 py-3">Prefeitura</th>}
                <th className="px-5 py-3">Veículo</th><th className="px-5 py-3">IMEI</th><th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Velocidade</th><th className="px-5 py-3">Ignição</th><th className="px-5 py-3">Tensão</th>
                <th className="px-5 py-3">Fonte</th><th className="px-5 py-3">Atualizado</th><th></th>
              </tr></thead>
              <tbody>
                {status.map((s) => {
                  const trk = (s.vehicle_id && trkByVehicle[s.vehicle_id]) || trkById[s.tracker_id];
                  return (
                    <tr key={s.tracker_id} className="border-b border-slate-100">
                      {!fixed && <td className="px-5 py-3 text-slate-600">{tName[s.tenant_id] ?? '—'}</td>}
                      <td className="px-5 py-3 font-medium text-slate-800">{(s.vehicle_id && plates[s.vehicle_id]) || trk?.label || '—'}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-600">{s.imei}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                          {s.online ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td className="px-5 py-3">{s.speed != null ? `${Math.round(s.speed)} km/h` : '—'}</td>
                      <td className="px-5 py-3">{s.ignition == null ? '—' : s.ignition ? 'Ligada' : 'Desligada'}</td>
                      <td className="px-5 py-3">{s.voltage != null ? `${s.voltage.toFixed(1)} V` : '—'}</td>
                      <td className="px-5 py-3 uppercase text-xs text-slate-500">{s.fix_source ?? '—'}</td>
                      <td className="px-5 py-3 text-slate-500">{ago(s.gps_time ?? s.updated_at)}</td>
                      <td className="px-5 py-3 text-right">
                        {trk && (
                          <div className="flex justify-end gap-3">
                            <button onClick={() => onFuel(trk.id, true)} className="text-xs font-semibold text-rose-600 hover:underline">Cortar</button>
                            <button onClick={() => onFuel(trk.id, false)} className="text-xs font-semibold text-[var(--sgf-primary)] hover:underline">Retomar</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {status.length === 0 && <tr><td colSpan={fixed ? 9 : 10} className="px-5 py-8 text-center text-slate-400">Nenhum dado de rastreador ainda. Configure as credenciais e clique em “Sincronizar agora”.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function CredentialsCard({ fixed, tenantId, tenants, onSaved }: {
  fixed: boolean; tenantId?: string; tenants: { id: string; name: string }[]; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ tenant_id: tenantId ?? '', appid: '', app_secret: '', base_url: 'https://open.iopgps.com' });
  const set = (p: Partial<typeof f>) => setF((c) => ({ ...c, ...p }));

  const save = useMutation({
    mutationFn: () => iopgpsApi.saveCredentials({
      tenant_id: fixed ? tenantId : (f.tenant_id || null), base_url: f.base_url, appid: f.appid.trim(), app_secret: f.app_secret.trim(),
    }),
    onSuccess: () => { toast.success('Credenciais salvas.'); setF((c) => ({ ...c, appid: '', app_secret: '' })); onSaved(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Credenciais IOPGPS</h2>
          <p className="text-sm text-slate-500">appid + chave secreta da conta Open API (open.iopgps.com).</p>
        </div>
        <span className="text-sm text-[var(--sgf-primary)]">{open ? 'Fechar' : 'Configurar'}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {!fixed && (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Prefeitura (vazio = global)</span>
                <select value={f.tenant_id} onChange={(e) => set({ tenant_id: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                  <option value="">Global (todas)</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            )}
            <Input label="Base URL" value={f.base_url} onChange={(e) => set({ base_url: e.target.value })} />
            <Input label="appid" value={f.appid} onChange={(e) => set({ appid: e.target.value })} />
            <Input label="Chave secreta (app secret)" type="password" value={f.app_secret} onChange={(e) => set({ app_secret: e.target.value })} />
          </div>
          <div className="flex justify-end">
            <Button disabled={!f.appid || !f.app_secret || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Salvando…' : 'Salvar credenciais'}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default IopgpsPanel;
