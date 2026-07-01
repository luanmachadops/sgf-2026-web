import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { trackersApi, tenantsApi, vehiclesApi, vehicleLabel, TRACKER_MODELS, type VehicleOption } from '@/lib/api';
import { Card, Button, Input } from '@/lib/ui';

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
  const vLabel = useMemo(() => Object.fromEntries(vehicles.map((v) => [v.id, vehicleLabel(v)])), [vehicles]);

  const [f, setF] = useState({ tenant_id: tenantId ?? '', model: TRACKER_MODELS[0] as string, identifier: '', label: '', sim_number: '', vehicle_id: '' });
  const set = (p: Partial<typeof f>) => setF((c) => ({ ...c, ...p }));
  const formTenant = tenantId ?? f.tenant_id;
  const formVehicles = formTenant ? (vehiclesByTenant.get(formTenant) ?? []) : [];

  const create = useMutation({
    mutationFn: () => trackersApi.create({
      tenant_id: tenantId ?? f.tenant_id, model: f.model, identifier: f.identifier.trim(),
      label: f.label.trim() || null, sim_number: f.sim_number.trim() || null,
      vehicle_id: f.vehicle_id || null, active: true,
    }),
    onSuccess: () => {
      toast.success('Rastreador cadastrado.');
      setF({ tenant_id: tenantId ?? '', model: TRACKER_MODELS[0], identifier: '', label: '', sim_number: '', vehicle_id: '' });
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
        <p className="mb-4 text-sm text-slate-500">Modelo <span className="font-semibold">SL48-4G</span>. Informe o identificador (IMEI/ID) e o veículo onde está instalado.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {!fixed && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Prefeitura</span>
              <select value={f.tenant_id} onChange={(e) => set({ tenant_id: e.target.value, vehicle_id: '' })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option value="">Selecione…</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Modelo</span>
            <select value={f.model} onChange={(e) => set({ model: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
              {TRACKER_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <Input label="Identificador (IMEI/ID)" value={f.identifier} onChange={(e) => set({ identifier: e.target.value })} placeholder="Ex.: 868xxxxxxxxxxx" />
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Veículo</span>
            <select
              value={f.vehicle_id}
              onChange={(e) => set({ vehicle_id: e.target.value })}
              disabled={!formTenant}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">{formTenant ? 'Sem veículo (vincular depois)' : 'Selecione a prefeitura primeiro'}</option>
              {formVehicles.map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}
            </select>
          </label>
          <Input label="Apelido (opcional)" value={f.label} onChange={(e) => set({ label: e.target.value })} placeholder="Ex.: Caminhão 03" />
          <Input label="Nº do chip (opcional)" value={f.sim_number} onChange={(e) => set({ sim_number: e.target.value })} />
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
                        <select
                          value={t.vehicle_id ?? ''}
                          onChange={(e) => setVehicle.mutate({ id: t.id, vehicleId: e.target.value || null })}
                          className="max-w-[220px] rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                          title={t.vehicle_id ? vLabel[t.vehicle_id] : 'Sem veículo'}
                        >
                          <option value="">Sem veículo</option>
                          {/* garante que o veículo atual apareça mesmo se estiver fora da lista carregada */}
                          {t.vehicle_id && !opts.some((v) => v.id === t.vehicle_id) && (
                            <option value={t.vehicle_id}>{vLabel[t.vehicle_id] ?? 'Veículo vinculado'}</option>
                          )}
                          {opts.map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}
                        </select>
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
    </div>
  );
}

export default TrackersPanel;
