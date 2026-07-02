import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { trackersApi, tenantsApi, vehiclesApi, TRACKER_MODELS, type VehicleOption } from '@/lib/api';
import { iopgpsApi } from '@/lib/iopgpsApi';
import { VehiclePicker } from '@/components/VehiclePicker';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Camera } from '@/components/sgf/icons';
import { Card, Button } from '@/lib/ui';

// Estilo padrão dos campos (mesma altura/design do SGFInput) reutilizado em toda a página.
const LABEL_CLS = 'mb-[var(--sgf-space-2)] block text-[var(--sgf-text-sm)] font-semibold text-[var(--sgf-text-primary)]';
const FIELD_CLS = 'w-full h-11 rounded-[var(--sgf-input-radius)] border border-slate-200 bg-slate-50 px-[var(--sgf-input-padding-x)] text-[var(--sgf-text-sm)] transition-all placeholder:text-slate-400 focus:border-[var(--sgf-primary)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-500/10 disabled:opacity-50';

/** Máscara de telefone BR: +55 (44) 99999-9999 (aceita fixo 8 dígitos). */
function maskPhone(value: string): string {
  let d = value.replace(/\D/g, '');
  if (d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length === 0) return '';
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  let s = `+55 (${ddd}`;
  if (d.length >= 2) s += ') ';
  if (rest) s += rest.length <= 8 ? rest.replace(/(\d{4})(\d{0,4})/, (_m, a, b) => (b ? `${a}-${b}` : a))
    : `${rest.slice(0, 5)}-${rest.slice(5)}`;
  return s.trimEnd();
}

/** Painel de rastreadores. Se `tenantId` vier definido, fica preso à prefeitura (sem seletor). */
export function TrackersPanel({ tenantId }: { tenantId?: string }) {
  const qc = useQueryClient();
  const fixed = !!tenantId;
  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list, enabled: !fixed });
  const { data: trackers = [], isLoading } = useQuery({
    queryKey: ['trackers', tenantId ?? 'all'],
    queryFn: () => trackersApi.list(tenantId),
  });
  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', tenantId ?? 'all'],
    queryFn: () => vehiclesApi.list(tenantId),
  });
  const tName = useMemo(() => Object.fromEntries(tenants.map((t) => [t.id, t.name])), [tenants]);

  // Veículos agrupados por prefeitura (para filtrar as opções por tenant do rastreador).
  const vehiclesByTenant = useMemo(() => {
    const m = new Map<string, VehicleOption[]>();
    for (const v of vehicles) { const a = m.get(v.tenant_id) ?? []; a.push(v); m.set(v.tenant_id, a); }
    return m;
  }, [vehicles]);
  const [f, setF] = useState({ tenant_id: tenantId ?? '', model: '' as string, identifier: '', label: '', sim_number: '', vehicle_id: '' });
  const set = (p: Partial<typeof f>) => setF((c) => ({ ...c, ...p }));
  const formTenant = tenantId ?? f.tenant_id;
  const formVehicles = formTenant ? (vehiclesByTenant.get(formTenant) ?? []) : [];
  const [detected, setDetected] = useState<{ model: string | null; online: boolean | null } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  // Detecta o modelo do aparelho na IOPGPS pelo IMEI e preenche automaticamente.
  const detect = useMutation({
    mutationFn: (imei: string) => iopgpsApi.detectDevice(imei.trim(), formTenant || null),
    onSuccess: (r) => {
      if (!r.found) { setDetected(null); toast.error(r.message || 'IMEI não encontrado na conta IOPGPS.'); return; }
      setDetected({ model: r.model ?? null, online: r.online ?? null });
      setF((c) => ({ ...c, model: r.model ?? c.model, label: c.label || (r.deviceName ?? '') }));
      toast.success(`Modelo detectado: ${r.model ?? '—'}${r.online == null ? '' : r.online ? ' · online' : ' · offline'}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const create = useMutation({
    mutationFn: () => trackersApi.create({
      tenant_id: tenantId ?? f.tenant_id, model: f.model.trim() || 'SL48-4G', identifier: f.identifier.trim(),
      label: f.label.trim() || null, sim_number: f.sim_number.trim() || null,
      vehicle_id: f.vehicle_id || null, active: true,
    }),
    onSuccess: () => {
      toast.success('Rastreador cadastrado.');
      setF({ tenant_id: tenantId ?? '', model: '', identifier: '', label: '', sim_number: '', vehicle_id: '' });
      setDetected(null);
      qc.invalidateQueries({ queryKey: ['trackers'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => trackersApi.setActive(id, active),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trackers'] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const setVehicle = useMutation({
    mutationFn: ({ id, vehicleId }: { id: string; vehicleId: string | null }) => trackersApi.setVehicle(id, vehicleId),
    onSuccess: () => { toast.success('Veículo vinculado.'); qc.invalidateQueries({ queryKey: ['trackers'] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => trackersApi.remove(id),
    onSuccess: () => { toast.success('Rastreador removido.'); qc.invalidateQueries({ queryKey: ['trackers'] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const canSubmit = (fixed || f.tenant_id) && f.identifier.trim().length > 0;

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="mb-1 text-lg font-semibold text-slate-800">Cadastrar rastreador</h2>
        <p className="mb-4 text-sm text-slate-500">Informe o IMEI e clique em <span className="font-semibold">Detectar</span> — o modelo é identificado automaticamente na IOPGPS. Depois vincule ao veículo.</p>
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {!fixed && (
            <label className="block">
              <span className={LABEL_CLS}>Prefeitura</span>
              <select value={f.tenant_id} onChange={(e) => set({ tenant_id: e.target.value, vehicle_id: '' })} className={FIELD_CLS}>
                <option value="">Selecione…</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className={LABEL_CLS}>Identificador (IMEI/ID)</span>
            <div className="flex gap-2">
              <input
                value={f.identifier}
                onChange={(e) => { set({ identifier: e.target.value }); setDetected(null); }}
                placeholder="Ex.: 868xxxxxxxxxxx"
                className={FIELD_CLS}
              />
              <button
                type="button"
                onClick={() => setScanOpen(true)}
                title="Ler por câmera (código de barras/QR)"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--sgf-input-radius)] border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-[var(--sgf-primary)] hover:text-[var(--sgf-primary)]"
              >
                <Camera className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => detect.mutate(f.identifier)}
                disabled={f.identifier.trim().length < 6 || detect.isPending}
                className="h-11 shrink-0 rounded-[var(--sgf-input-radius)] border border-[var(--sgf-primary)] px-3 text-xs font-semibold text-[var(--sgf-primary)] transition hover:bg-emerald-50 disabled:opacity-40"
              >
                {detect.isPending ? '…' : 'Detectar'}
              </button>
            </div>
          </label>
          <label className="block">
            <span className={LABEL_CLS}>Modelo</span>
            <input
              list="tracker-models"
              value={f.model}
              onChange={(e) => set({ model: e.target.value })}
              placeholder="Detectado pelo IMEI (ou digite)"
              className={FIELD_CLS}
            />
            <datalist id="tracker-models">{TRACKER_MODELS.map((m) => <option key={m} value={m} />)}</datalist>
            {detected && (
              <span className="mt-1 block text-[11px] font-medium text-emerald-600">
                Detectado na IOPGPS{detected.online == null ? '' : detected.online ? ' · online' : ' · offline'}
              </span>
            )}
          </label>
          <label className="block sm:col-span-2 lg:col-span-1">
            <span className={LABEL_CLS}>Veículo</span>
            <VehiclePicker
              vehicles={formVehicles}
              value={f.vehicle_id || null}
              onChange={(id) => set({ vehicle_id: id ?? '' })}
              disabled={!formTenant}
              emptyLabel={formTenant ? 'Buscar placa ou modelo…' : 'Selecione a prefeitura primeiro'}
            />
          </label>
          <label className="block">
            <span className={LABEL_CLS}>Apelido (opcional)</span>
            <input value={f.label} onChange={(e) => set({ label: e.target.value })} placeholder="Ex.: Caminhão 03" className={FIELD_CLS} />
          </label>
          <label className="block">
            <span className={LABEL_CLS}>Nº do chip (opcional)</span>
            <input value={f.sim_number} onChange={(e) => set({ sim_number: maskPhone(e.target.value) })} placeholder="+55 (44) 99999-9999" inputMode="numeric" className={FIELD_CLS} />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <Button disabled={!canSubmit || create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Salvando…' : 'Cadastrar'}</Button>
        </div>
      </Card>

      <Card className="p-0">
        {isLoading ? <p className="p-5 text-slate-400">Carregando…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                {!fixed && <th className="px-5 py-3">Prefeitura</th>}
                <th className="px-5 py-3">Identificador</th><th className="px-5 py-3">Apelido</th><th className="px-5 py-3">Veículo</th><th className="px-5 py-3">Modelo</th><th className="px-5 py-3">Chip</th><th className="px-5 py-3">Status</th><th></th>
              </tr></thead>
              <tbody>
                {trackers.map((t) => {
                  const opts = vehiclesByTenant.get(t.tenant_id) ?? [];
                  return (
                    <tr key={t.id} className="border-b border-slate-100">
                      {!fixed && <td className="px-5 py-3 text-slate-600">{tName[t.tenant_id] ?? '—'}</td>}
                      <td className="px-5 py-3 font-mono text-slate-800">{t.identifier}</td>
                      <td className="px-5 py-3">{t.label ?? '—'}</td>
                      <td className="px-5 py-3">
                        <VehiclePicker
                          compact
                          vehicles={opts}
                          value={t.vehicle_id ?? null}
                          onChange={(id) => setVehicle.mutate({ id: t.id, vehicleId: id })}
                          emptyLabel="Vincular veículo"
                        />
                      </td>
                      <td className="px-5 py-3">{t.model}</td>
                      <td className="px-5 py-3">{t.sim_number ?? '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                          {t.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-3">
                          <button onClick={() => toggle.mutate({ id: t.id, active: !t.active })} className="text-xs font-semibold text-[var(--sgf-primary)] hover:underline">
                            {t.active ? 'Desativar' : 'Ativar'}
                          </button>
                          <button onClick={() => { if (confirm('Remover este rastreador?')) remove.mutate(t.id); }} className="text-xs font-semibold text-rose-600 hover:underline">Remover</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {trackers.length === 0 && <tr><td colSpan={fixed ? 7 : 8} className="px-5 py-8 text-center text-slate-400">Nenhum rastreador cadastrado.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <BarcodeScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetect={(value) => {
          const imei = value.replace(/\s/g, '');
          set({ identifier: imei });
          setDetected(null);
          setScanOpen(false);
          if (imei.length >= 6) detect.mutate(imei);
        }}
      />
    </div>
  );
}

export default TrackersPanel;
