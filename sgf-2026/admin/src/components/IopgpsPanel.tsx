import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { iopgpsApi } from '@/lib/iopgpsApi';
import { trackersApi, tenantsApi } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { Button, Input } from '@/lib/ui';
import { SGFSelect, SGFCard, SGFBadge, SGFButton } from '@/components/sgf';
import { TenantIdentity } from '@/components/TenantIdentity';

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
  const tenantById = useMemo(() => Object.fromEntries(tenants.map((t) => [t.id, t])), [tenants]);

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

  // A IOPGPS guarda o último estado recebido: um aparelho que parou de transmitir
  // continua "online" e "ligado" para sempre. Sem sinal há mais de 15 min = offline.
  const STALE_MS = 15 * 60 * 1000;
  const isLive = (d: (typeof status)[number]) => {
    const t = d.gps_time ?? d.updated_at;
    return !!d.online && !!t && Date.now() - new Date(t).getTime() < STALE_MS;
  };
  const online = status.filter(isLive).length;
  const moving = status.filter((d) => isLive(d) && (d.speed ?? 0) > 3).length;
  const ignitionOn = status.filter((d) => isLive(d) && d.ignition).length;

  return (
    <div className="space-y-4">
      {/* Resumo da frota rastreada */}
      <section className="rt-rise relative overflow-hidden rounded-[var(--rt-radius-card)] bg-[var(--rt-ink900)] p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -left-20 -top-28 h-72 w-72 rounded-full bg-[var(--rt-brand)]/20 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3EF074]" /> Atualiza a cada 30 s
            </span>
            <div className="mt-5 flex items-end gap-3">
              <span className="rt-num text-[56px] font-light leading-none">{online}</span>
              <span className="pb-1.5 text-lg text-white/60">de {status.length} online</span>
            </div>
          </div>
          <div className="flex items-end gap-6">
            {[{ label: 'Em movimento', value: moving }, { label: 'Ignição ligada', value: ignitionOn }].map((k) => (
              <div key={k.label}>
                <p className="rt-num text-[28px] font-light leading-none">{k.value}</p>
                <p className="mt-1.5 text-xs text-white/55">{k.label}</p>
              </div>
            ))}
            <Button variant="primary" disabled={sync.isPending} onClick={() => sync.mutate()}>
              {sync.isPending ? 'Sincronizando…' : 'Sincronizar agora'}
            </Button>
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded-[var(--rt-radius-card)] bg-white" />)}</div>
      ) : status.length === 0 ? (
        <div className="grid place-items-center rounded-[var(--rt-radius-card)] bg-white px-6 py-14 text-center shadow-[var(--rt-shadow-card)]">
          <p className="text-[15px] font-semibold text-[var(--rt-ink900)]">Nenhum dado de rastreador ainda</p>
          <p className="mt-1 text-sm text-[var(--rt-ink500)]">Configure as credenciais da IOPGPS abaixo e toque em “Sincronizar agora”.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {status.map((d, i) => {
            const trk = (d.vehicle_id && trkByVehicle[d.vehicle_id]) || trkById[d.tracker_id];
            const plate = (d.vehicle_id && plates[d.vehicle_id]) || trk?.label || 'Sem veículo';
            const live = isLive(d);
            const movingNow = live && (d.speed ?? 0) > 3;
            const state = !live ? { label: d.online ? 'Sem sinal' : 'Offline', variant: 'stopped' as const }
              : movingNow ? { label: 'Em movimento', variant: 'moving' as const }
              : d.ignition ? { label: 'Parado, ligado', variant: 'idle' as const }
              : { label: 'Parado', variant: 'stopped' as const };
            return (
              <article key={d.tracker_id} className="rt-rise flex flex-col rounded-[var(--rt-radius-card)] bg-white p-5 shadow-[var(--rt-shadow-card)]" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="rt-num truncate font-mono text-[17px] font-bold tracking-wide text-[var(--rt-ink900)]">{plate}</p>
                    <p className="rt-num truncate font-mono text-xs text-[var(--rt-ink500)]">{d.imei}</p>
                    {!fixed && <div className="mt-2"><TenantIdentity tenant={tenantById[d.tenant_id]} /></div>}
                  </div>
                  <SGFBadge variant={state.variant} dot>{state.label}</SGFBadge>
                </div>

                <div className="mt-5 flex items-end gap-2">
                  <span className="rt-num text-[40px] font-light leading-none text-[var(--rt-ink900)]">{d.speed != null ? Math.round(d.speed) : '—'}</span>
                  <span className="pb-1 text-sm text-[var(--rt-ink500)]">km/h</span>
                </div>

                <dl className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-[var(--rt-paper)] p-3 text-center">
                  <div><dt className="text-[11px] text-[var(--rt-ink500)]">Ignição</dt><dd className="mt-0.5 text-sm font-semibold text-[var(--rt-ink900)]">{d.ignition == null ? '—' : d.ignition ? 'Ligada' : 'Desligada'}</dd></div>
                  <div><dt className="text-[11px] text-[var(--rt-ink500)]">Tensão</dt><dd className="rt-num mt-0.5 text-sm font-semibold text-[var(--rt-ink900)]">{d.voltage != null ? `${d.voltage.toFixed(1)} V` : '—'}</dd></div>
                  <div><dt className="text-[11px] text-[var(--rt-ink500)]">Sinal</dt><dd className="mt-0.5 text-sm font-semibold uppercase text-[var(--rt-ink900)]">{d.fix_source ?? '—'}</dd></div>
                </dl>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="text-xs text-[var(--rt-ink400)]">Atualizado {ago(d.gps_time ?? d.updated_at)}</span>
                  {trk && (
                    <div className="flex gap-1.5">
                      <SGFButton size="sm" variant="ghost" className="!text-[var(--rt-red600)]" onClick={() => onFuel(trk.id, true)}>Cortar</SGFButton>
                      <SGFButton size="sm" variant="outline" onClick={() => onFuel(trk.id, false)}>Retomar</SGFButton>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <CredentialsCard fixed={fixed} tenantId={tenantId} tenants={tenants} onSaved={() => qc.invalidateQueries({ queryKey: ['iopgps-status'] })} />
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
    <SGFCard padding="lg">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={open}>
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--rt-ink900)]">Credenciais IOPGPS</h2>
          <p className="text-sm text-[var(--rt-ink500)]">appid e chave secreta da conta Open API (open.iopgps.com).</p>
        </div>
        <span className="inline-flex h-9 shrink-0 items-center rounded-full bg-[var(--rt-paper)] px-4 text-[13px] font-semibold text-[var(--rt-ink900)]">{open ? 'Fechar' : 'Configurar'}</span>
      </button>
      {open && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {!fixed && (
              <SGFSelect label="Prefeitura (vazio = global)" fullWidth value={f.tenant_id} placeholder="Global (todas)"
                onChange={(tenant_id) => set({ tenant_id })}
                options={[{ value: '', label: 'Global (todas)' }, ...tenants.map((t) => ({ value: t.id, label: t.name }))]} />
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
    </SGFCard>
  );
}

export default IopgpsPanel;
