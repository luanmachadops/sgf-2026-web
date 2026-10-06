import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { iopgpsApi } from '@/lib/iopgpsApi';
import { trackersApi, tenantsApi } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { Button } from '@/lib/ui';
import { SGFBadge, SGFButton, SGFTable, ViewToggle, useViewMode } from '@/components/sgf';
import { MapPin } from '@/components/sgf/icons';
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

  const [view, setView] = useViewMode('iopgps');
  type Row = {
    d: (typeof status)[number];
    trk: (typeof trackers)[number] | undefined;
    plate: string;
    state: { label: string; variant: 'moving' | 'idle' | 'stopped' };
  };
  const rows: Row[] = status.map((d) => {
    const trk = (d.vehicle_id && trkByVehicle[d.vehicle_id]) || trkById[d.tracker_id];
    const live = isLive(d);
    const movingNow = live && (d.speed ?? 0) > 3;
    const state = !live ? { label: d.online ? 'Sem sinal' : 'Offline', variant: 'stopped' as const }
      : movingNow ? { label: 'Em movimento', variant: 'moving' as const }
      : d.ignition ? { label: 'Parado, ligado', variant: 'idle' as const }
      : { label: 'Parado', variant: 'stopped' as const };
    return { d, trk, plate: (d.vehicle_id && plates[d.vehicle_id]) || trk?.label || 'Sem veículo', state };
  });

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

      <div className="flex items-center justify-between gap-3">
        <p className="px-1 text-sm text-[var(--rt-ink500)]">{status.length} {status.length === 1 ? 'rastreador' : 'rastreadores'}</p>
        <ViewToggle value={view} onChange={setView} />
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-[var(--rt-radius-card)] bg-white" />)}</div>
      ) : status.length === 0 ? (
        <div className="grid place-items-center rounded-[var(--rt-radius-card)] bg-white px-6 py-14 text-center shadow-[var(--rt-shadow-card)]">
          <p className="text-[15px] font-semibold text-[var(--rt-ink900)]">Nenhum dado de rastreador ainda</p>
          <p className="mt-1 text-sm text-[var(--rt-ink500)]">Configure as credenciais da IOPGPS abaixo e toque em “Sincronizar agora”.</p>
        </div>
      ) : view === 'table' ? (
        <SGFTable<Row>
          data={rows}
          keyExtractor={(r) => r.d.tracker_id}
          columns={[
            ...(!fixed ? [{ header: 'Prefeitura', accessor: (r: Row) => <TenantIdentity tenant={tenantById[r.d.tenant_id]} /> }] : []),
            {
              header: 'Veículo',
              accessor: (r: Row) => (
                <div className="min-w-0">
                  <p className="truncate font-bold text-[var(--rt-ink900)]">{r.plate}</p>
                  <p className="rt-num truncate text-xs text-[var(--rt-ink500)]">{r.d.imei}</p>
                </div>
              ),
            },
            { header: 'Situação', accessor: (r: Row) => <SGFBadge variant={r.state.variant} dot>{r.state.label}</SGFBadge> },
            { header: 'Velocidade', accessor: (r: Row) => <span className="rt-num whitespace-nowrap">{r.d.speed != null ? `${Math.round(r.d.speed)} km/h` : '—'}</span> },
            { header: 'Ignição', accessor: (r: Row) => (r.d.ignition == null ? '—' : r.d.ignition ? 'Ligada' : 'Desligada') },
            { header: 'Tensão', accessor: (r: Row) => <span className="rt-num whitespace-nowrap">{r.d.voltage != null ? `${r.d.voltage.toFixed(1)} V` : '—'}</span> },
            { header: 'Atualizado', accessor: (r: Row) => <span className="whitespace-nowrap text-[var(--rt-ink500)]">{ago(r.d.gps_time ?? r.d.updated_at)}</span> },
            {
              header: '',
              className: 'text-right',
              accessor: (r: Row) => r.trk && (
                <div className="flex justify-end gap-1.5">
                  <SGFButton size="sm" variant="ghost" className="!text-[var(--rt-red600)]" onClick={() => onFuel(r.trk!.id, true)}>Cortar</SGFButton>
                  <SGFButton size="sm" variant="outline" onClick={() => onFuel(r.trk!.id, false)}>Retomar</SGFButton>
                </div>
              ),
            },
          ]}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ d, trk, plate, state }, i) => (
            <article key={d.tracker_id} className="rt-rise rounded-[22px] bg-white p-4 shadow-[var(--rt-shadow-card)]" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--rt-brand-100)] text-[var(--rt-brand)]"><MapPin width={18} height={18} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-[var(--rt-ink900)]">{plate}</p>
                  <p className="rt-num truncate text-[11px] text-[var(--rt-ink500)]">{d.imei}</p>
                </div>
                <SGFBadge variant={state.variant} size="sm" dot>{state.label}</SGFBadge>
              </div>

              <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[var(--rt-paper)] px-3 py-2.5">
                <div className="flex items-baseline gap-1 pr-3 shadow-[1px_0_0_var(--rt-hairline)]">
                  <span className="rt-num text-2xl font-light leading-none text-[var(--rt-ink900)]">{d.speed != null ? Math.round(d.speed) : '—'}</span>
                  <span className="text-[11px] text-[var(--rt-ink500)]">km/h</span>
                </div>
                <dl className="grid flex-1 grid-cols-3 gap-1 text-center">
                  <div><dt className="text-[10px] text-[var(--rt-ink500)]">Ignição</dt><dd className="text-xs font-semibold text-[var(--rt-ink900)]">{d.ignition == null ? '—' : d.ignition ? 'Ligada' : 'Desligada'}</dd></div>
                  <div><dt className="text-[10px] text-[var(--rt-ink500)]">Tensão</dt><dd className="rt-num whitespace-nowrap text-xs font-semibold text-[var(--rt-ink900)]">{d.voltage != null ? `${d.voltage.toFixed(1)} V` : '—'}</dd></div>
                  <div><dt className="text-[10px] text-[var(--rt-ink500)]">Sinal</dt><dd className="text-xs font-semibold uppercase text-[var(--rt-ink900)]">{d.fix_source ?? '—'}</dd></div>
                </dl>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-[11px] text-[var(--rt-ink400)]">
                  {!fixed && <span title={tenantById[d.tenant_id]?.name}>{tenantById[d.tenant_id]?.name ?? '—'} · </span>}
                  {ago(d.gps_time ?? d.updated_at)}
                </p>
                {trk && (
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => onFuel(trk.id, true)} className="h-8 rounded-full px-3 text-xs font-semibold text-[var(--rt-red600)] transition hover:bg-[var(--rt-red100)]">Cortar</button>
                    <button onClick={() => onFuel(trk.id, false)} className="h-8 rounded-full bg-[var(--rt-paper)] px-3 text-xs font-semibold text-[var(--rt-ink900)] transition hover:bg-[var(--rt-paper2)]">Retomar</button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

    </div>
  );
}

export default IopgpsPanel;
