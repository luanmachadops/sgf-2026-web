import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { trackersApi, tenantsApi, vehiclesApi, TRACKER_MODELS, type VehicleOption, type Tracker } from '@/lib/api';
import { iopgpsApi } from '@/lib/iopgpsApi';
import { VehiclePicker } from '@/components/VehiclePicker';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Camera, Plus } from '@/components/sgf/icons';
import { Button } from '@/lib/ui';
import { SGFSelect, SGFTable, SGFBadge, SGFButton, Sheet } from '@/components/sgf';
import { TenantIdentity } from '@/components/TenantIdentity';

// Estilo padrão dos campos (mesma altura/design do SGFInput) reutilizado em toda a página.
const LABEL_CLS = 'mb-2 block text-[13px] font-medium text-[var(--rt-ink500)]';
const FIELD_CLS = 'w-full h-12 rounded-2xl border border-transparent bg-[var(--rt-paper)] px-4 text-[15px] text-[var(--rt-ink900)] transition placeholder:text-[var(--rt-ink400)] focus:border-[var(--rt-brand)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--rt-brand)]/10 disabled:opacity-50';

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
  const tenantById = useMemo(() => Object.fromEntries(tenants.map((t) => [t.id, t])), [tenants]);

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
  const [formOpen, setFormOpen] = useState(false);

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

  const linked = trackers.filter((t) => t.vehicle_id).length;
  const activeCount = trackers.filter((t) => t.active).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Cadastrados', value: trackers.length },
            { label: 'Ativos', value: activeCount },
            { label: 'Vinculados a veículo', value: linked },
          ].map((k) => (
            <span key={k.label} className="inline-flex h-10 items-center gap-2 rounded-full bg-white pl-4 pr-1.5 text-sm font-medium text-[var(--rt-ink700)] shadow-[var(--rt-shadow-card)]">
              {k.label}
              <span className="rt-num grid h-7 min-w-7 place-items-center rounded-full bg-[var(--rt-paper)] px-2 text-[13px] font-semibold text-[var(--rt-ink900)]">{k.value}</span>
            </span>
          ))}
        </div>
        <Button onClick={() => setFormOpen(true)}><Plus width={18} height={18} /> Cadastrar rastreador</Button>
      </div>

      <Sheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="lg"
        title="Cadastrar rastreador"
        subtitle="Informe o IMEI e toque em Detectar: o modelo vem da IOPGPS. Depois vincule ao veículo."
        footer={<>
          <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button>
          <Button disabled={!canSubmit || create.isPending} onClick={() => create.mutate(undefined, { onSuccess: () => setFormOpen(false) })}>{create.isPending ? 'Salvando…' : 'Cadastrar'}</Button>
        </>}
      >
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          {!fixed && (
            <SGFSelect label="Prefeitura" fullWidth value={f.tenant_id}
              onChange={(tenant_id) => set({ tenant_id, vehicle_id: '' })}
              options={tenants.map((t) => ({ value: t.id, label: t.name }))} />
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
                className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--rt-paper)] text-[var(--rt-ink700)] transition hover:bg-[var(--rt-brand-100)] hover:text-[var(--rt-brand)]"
              >
                <Camera className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => detect.mutate(f.identifier)}
                disabled={f.identifier.trim().length < 6 || detect.isPending}
                className="h-12 shrink-0 rounded-full bg-[var(--rt-ink900)] px-4 text-[13px] font-semibold text-white transition hover:bg-[#163b40] disabled:opacity-40"
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
              <span className="mt-1.5 block text-xs font-medium text-[#0B7A50]">
                Detectado na IOPGPS{detected.online == null ? '' : detected.online ? ' · online' : ' · offline'}
              </span>
            )}
          </label>
          <label className="block sm:col-span-2">
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
      </Sheet>

      <SGFTable<Tracker>
        loading={isLoading}
        data={trackers}
        keyExtractor={(t) => t.id}
        emptyMessage="Nenhum rastreador cadastrado."
        columns={[
          ...(!fixed ? [{ header: 'Prefeitura', accessor: (t: Tracker) => <TenantIdentity tenant={tenantById[t.tenant_id]} /> }] : []),
          {
            header: 'Rastreador',
            accessor: (t: Tracker) => (
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--rt-ink900)]">{t.label || t.model}</p>
                <p className="rt-num truncate text-xs text-[var(--rt-ink500)]">{t.identifier}</p>
              </div>
            ),
          },
          {
            header: 'Veículo',
            className: 'min-w-[220px]',
            accessor: (t: Tracker) => (
              <VehiclePicker
                compact
                vehicles={vehiclesByTenant.get(t.tenant_id) ?? []}
                value={t.vehicle_id ?? null}
                onChange={(id) => setVehicle.mutate({ id: t.id, vehicleId: id })}
                emptyLabel="Vincular veículo"
              />
            ),
          },
          { header: 'Modelo', accessor: (t: Tracker) => t.model },
          { header: 'Chip', accessor: (t: Tracker) => <span className="rt-num whitespace-nowrap">{t.sim_number ?? '—'}</span> },
          { header: 'Situação', accessor: (t: Tracker) => <SGFBadge variant={t.active ? 'success' : 'default'} dot>{t.active ? 'Ativo' : 'Inativo'}</SGFBadge> },
          {
            header: '',
            className: 'text-right',
            accessor: (t: Tracker) => (
              <div className="flex justify-end gap-1.5">
                <SGFButton size="sm" variant="outline" onClick={() => toggle.mutate({ id: t.id, active: !t.active })}>{t.active ? 'Desativar' : 'Ativar'}</SGFButton>
                <SGFButton size="sm" variant="ghost" className="!text-[var(--rt-red600)]" onClick={() => { if (confirm('Remover este rastreador?')) remove.mutate(t.id); }}>Remover</SGFButton>
              </div>
            ),
          },
        ]}
      />

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
