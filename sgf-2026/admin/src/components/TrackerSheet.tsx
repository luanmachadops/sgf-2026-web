import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { trackersApi, vehiclesApi, formatPlate, type Tenant, type Tracker } from '@/lib/api';
import { Button } from '@/lib/ui';
import { Sheet, SGFBadge, SGFButton } from '@/components/sgf';
import { Car, Trash2 } from '@/components/sgf/icons';
import { VehiclePicker } from '@/components/VehiclePicker';

const CONFIRM_WORD = 'EXCLUIR';
const brDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-[var(--rt-paper)] px-4 py-3">
      <p className="text-xs text-[var(--rt-ink500)]">{label}</p>
      <p className="mt-0.5 truncate text-[15px] font-semibold text-[var(--rt-ink900)]">{value || '—'}</p>
    </div>
  );
}

/**
 * Detalhes do rastreador: foto grande do veículo, prefeitura, dados do aparelho,
 * troca de veículo (somente veículos da prefeitura do rastreador) e, no rodapé,
 * ativar/desativar e excluir — a exclusão pede que se digite EXCLUIR.
 */
export function TrackerSheet({ tracker, tenant, onClose }: { tracker: Tracker | null; tenant?: Tenant; onClose: () => void }) {
  const qc = useQueryClient();
  const [vehicleDraft, setVehicleDraft] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    setVehicleDraft(tracker?.vehicle_id ?? null);
    setConfirmOpen(false);
    setConfirmText('');
  }, [tracker]);

  // Apenas os veículos da prefeitura deste rastreador.
  const { data: vehicles = [], isLoading: loadingVehicles } = useQuery({
    queryKey: ['vehicles', tracker?.tenant_id],
    queryFn: () => vehiclesApi.list(tracker!.tenant_id),
    enabled: !!tracker,
  });
  const current = vehicles.find((v) => v.id === tracker?.vehicle_id) ?? null;

  const refresh = () => qc.invalidateQueries({ queryKey: ['trackers'] });
  const toggle = useMutation({
    mutationFn: () => trackersApi.setActive(tracker!.id, !tracker!.active),
    onSuccess: () => { toast.success(tracker!.active ? 'Rastreador desativado.' : 'Rastreador ativado.'); refresh(); onClose(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const saveVehicle = useMutation({
    mutationFn: () => trackersApi.setVehicle(tracker!.id, vehicleDraft),
    onSuccess: () => { toast.success(vehicleDraft ? 'Veículo vinculado.' : 'Veículo desvinculado.'); refresh(); onClose(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: () => trackersApi.remove(tracker!.id),
    onSuccess: () => { toast.success('Rastreador excluído.'); refresh(); setConfirmOpen(false); onClose(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const vehicleChanged = (tracker?.vehicle_id ?? null) !== vehicleDraft;
  const vehicleName = current ? ([current.brand, current.model].filter(Boolean).join(' ') || current.name || 'Veículo') : null;

  return (
    <>
      <Sheet
        open={!!tracker && !confirmOpen}
        onClose={onClose}
        size="lg"
        title={tracker?.label || tracker?.identifier || 'Rastreador'}
        subtitle={tracker?.label ? `IMEI ${tracker.identifier}` : undefined}
        footer={tracker && (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <SGFButton variant="ghost" size="sm" icon={Trash2} className="!text-[var(--rt-red600)]" onClick={() => setConfirmOpen(true)}>Remover</SGFButton>
              <SGFButton variant="outline" size="sm" loading={toggle.isPending} onClick={() => toggle.mutate()}>
                {tracker.active ? 'Desativar' : 'Ativar'}
              </SGFButton>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>Fechar</Button>
              {vehicleChanged && (
                <Button disabled={saveVehicle.isPending} onClick={() => saveVehicle.mutate()}>
                  {saveVehicle.isPending ? 'Salvando…' : 'Salvar veículo'}
                </Button>
              )}
            </div>
          </div>
        )}
      >
        {tracker && (
          <div className="space-y-6">
            {/* Veículo em destaque */}
            <div className="relative h-56 overflow-hidden rounded-[22px] bg-[var(--rt-ink900)] text-white sm:h-64">
              {current?.photo_url
                ? <img src={current.photo_url} alt={vehicleName ?? ''} className="absolute inset-0 h-full w-full object-cover" />
                : (
                  <div className="absolute inset-0 grid place-items-center text-white/25">
                    <Car width={72} height={72} />
                  </div>
                )}
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--rt-ink900)] via-[var(--rt-ink900)]/40 to-transparent" aria-hidden />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
                <div className="min-w-0">
                  {current ? (
                    <>
                      <p className="text-2xl font-bold leading-tight">{formatPlate(current.plate) || 'Sem placa'}</p>
                      <p className="truncate text-sm text-white/75">{[vehicleName, current.year, current.departmentName].filter(Boolean).join(' · ')}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xl font-bold leading-tight">{loadingVehicles && tracker.vehicle_id ? 'Carregando…' : 'Sem veículo vinculado'}</p>
                      <p className="text-sm text-white/70">Escolha abaixo um veículo da prefeitura.</p>
                    </>
                  )}
                </div>
                <SGFBadge variant={tracker.active ? 'success' : 'default'} dot>{tracker.active ? 'Ativo' : 'Inativo'}</SGFBadge>
              </div>
            </div>

            {/* Prefeitura */}
            <div className="flex items-center gap-3 rounded-[22px] bg-[var(--rt-paper)] p-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white">
                {tenant?.photo_url || tenant?.seal_url || tenant?.logo_url
                  ? <img src={(tenant.photo_url || tenant.seal_url || tenant.logo_url) as string} alt="" className="h-full w-full object-cover" />
                  : null}
              </span>
              <div className="min-w-0">
                <p className="text-xs text-[var(--rt-ink500)]">Prefeitura</p>
                <p className="truncate text-[15px] font-semibold text-[var(--rt-ink900)]">{tenant?.name ?? '—'}</p>
                {tenant?.city && <p className="text-xs text-[var(--rt-ink500)]">{tenant.city}{tenant.state ? `/${tenant.state}` : ''}</p>}
              </div>
            </div>

            {/* Dados */}
            <section>
              <h3 className="mb-3 text-[15px] font-semibold text-[var(--rt-ink900)]">Dados do rastreador</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="IMEI / identificador" value={tracker.identifier} />
                <Field label="Apelido" value={tracker.label} />
                <Field label="Modelo" value={tracker.model} />
                <Field label="Nº do chip" value={tracker.sim_number} />
                <Field label="Cadastrado em" value={brDate(tracker.created_at)} />
                <Field label="Última alteração" value={brDate(tracker.updated_at)} />
                {tracker.notes && <div className="sm:col-span-2"><Field label="Observações" value={tracker.notes} /></div>}
              </div>
            </section>

            {/* Vínculo */}
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-[15px] font-semibold text-[var(--rt-ink900)]">Veículo vinculado</h3>
                {vehicleDraft && (
                  <button type="button" onClick={() => setVehicleDraft(null)} className="text-[13px] font-semibold text-[var(--rt-red600)] hover:underline">
                    Desvincular
                  </button>
                )}
              </div>
              <VehiclePicker
                vehicles={vehicles}
                value={vehicleDraft}
                onChange={setVehicleDraft}
                disabled={loadingVehicles}
                emptyLabel={loadingVehicles ? 'Carregando veículos…' : undefined}
              />
              <p className="mt-2 text-xs text-[var(--rt-ink500)]">
                Só aparecem veículos de {tenant?.name ?? 'esta prefeitura'} ({vehicles.length}).
              </p>
            </section>
          </div>
        )}
      </Sheet>

      <Sheet
        open={!!tracker && confirmOpen}
        onClose={() => { setConfirmOpen(false); setConfirmText(''); }}
        size="sm"
        title="Excluir rastreador"
        subtitle="Esta ação não pode ser desfeita."
        footer={<>
          <Button variant="ghost" onClick={() => { setConfirmOpen(false); setConfirmText(''); }}>Cancelar</Button>
          <Button
            variant="danger"
            disabled={confirmText.trim().toUpperCase() !== CONFIRM_WORD || remove.isPending}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? 'Excluindo…' : 'Excluir definitivamente'}
          </Button>
        </>}
      >
        {tracker && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--rt-ink700)]">
              O rastreador <strong>{tracker.label || tracker.identifier}</strong> (IMEI {tracker.identifier}) será removido
              {current ? <> e desvinculado do veículo <strong>{formatPlate(current.plate)}</strong></> : null}.
            </p>
            <label className="block">
              <span className="mb-2 block text-[13px] font-medium text-[var(--rt-ink500)]">
                Para confirmar, digite <strong className="text-[var(--rt-ink900)]">{CONFIRM_WORD}</strong>
              </span>
              <input
                autoFocus
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_WORD}
                className="h-12 w-full rounded-2xl border border-transparent bg-[var(--rt-paper)] px-4 text-[15px] text-[var(--rt-ink900)] placeholder:text-[var(--rt-ink400)] focus:border-[var(--rt-red600)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--rt-red600)]/10"
              />
            </label>
          </div>
        )}
      </Sheet>
    </>
  );
}
