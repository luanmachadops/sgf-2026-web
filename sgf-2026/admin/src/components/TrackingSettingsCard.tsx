import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { tenantsApi, type Tenant } from '@/lib/api';
import { Button } from '@/lib/ui';
import { SGFCard } from '@/components/sgf';
import { MapPin, Bell } from '@/components/sgf/icons';

type Source = 'auto' | 'vehicle' | 'phone';

const SOURCES: { value: Source; title: string; text: string }[] = [
  {
    value: 'auto',
    title: 'Automático',
    text: 'Veículo com rastreador ativo usa o rastreador e o celular fica parado (sem gastar bateria). Sem rastreador, usa o GPS do celular.',
  },
  {
    value: 'vehicle',
    title: 'GPS do veículo',
    text: 'Sempre o rastreador. Se o veículo não tiver rastreador ou ele estiver sem sinal, cai no GPS do celular para não perder o trajeto.',
  },
  {
    value: 'phone',
    title: 'GPS do celular',
    text: 'Sempre o celular do motorista, mesmo que o veículo tenha rastreador. Usa o modo econômico de localização.',
  },
];

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));

/**
 * Fonte de rastreamento da prefeitura e tempos dos lembretes de "veículo
 * parado com a viagem aberta". O vigia roda no servidor a cada 5 min
 * (public.trip_watchdog) e manda os avisos por push — o celular não processa nada.
 */
export function TrackingSettingsCard({ tenant, onSaved }: { tenant: Tenant; onSaved: (patch: Partial<Tenant>) => void }) {
  const [source, setSource] = useState<Source>((tenant.tracking_source as Source) ?? 'auto');
  const [first, setFirst] = useState(String(tenant.trip_reminder_first_min ?? 15));
  const [interval, setIntervalMin] = useState(String(tenant.trip_reminder_interval_min ?? 30));
  const [close, setClose] = useState(String(tenant.trip_close_required_min ?? 120));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSource((tenant.tracking_source as Source) ?? 'auto');
    setFirst(String(tenant.trip_reminder_first_min ?? 15));
    setIntervalMin(String(tenant.trip_reminder_interval_min ?? 30));
    setClose(String(tenant.trip_close_required_min ?? 120));
  }, [tenant.id, tenant.tracking_source, tenant.trip_reminder_first_min, tenant.trip_reminder_interval_min, tenant.trip_close_required_min]);

  const firstN = clamp(Number(first) || 15, 5, 240);
  const intervalN = clamp(Number(interval) || 30, 5, 240);
  const closeN = clamp(Number(close) || 120, 15, 1440);
  const closeInvalid = closeN <= firstN;

  const save = async () => {
    if (closeInvalid) { toast.error('O encerramento obrigatório precisa vir depois do primeiro aviso.'); return; }
    setSaving(true);
    try {
      const patch = {
        tracking_source: source,
        trip_reminder_first_min: firstN,
        trip_reminder_interval_min: intervalN,
        trip_close_required_min: closeN,
      };
      await tenantsApi.update(tenant.id, patch);
      onSaved(patch);
      toast.success('Rastreamento atualizado. Vale para as próximas viagens.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Linha do tempo dos avisos com os valores atuais (até o encerramento obrigatório).
  const timeline: number[] = [];
  for (let m = firstN; m < closeN && timeline.length < 8; m += m < 60 ? firstN : intervalN) timeline.push(m);
  const fmtMin = (m: number) => (m >= 60 ? `${(m / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h` : `${m} min`);

  const numberField = (label: string, value: string, onChange: (v: string) => void, hint: string, invalid = false) => (
    <label className="block">
      <span className="mb-2 block text-[13px] font-medium text-[var(--rt-ink500)]">{label}</span>
      <span className={`flex h-12 items-center rounded-2xl border bg-[var(--rt-paper)] pr-4 focus-within:border-[var(--rt-brand)] focus-within:bg-white ${invalid ? 'border-[var(--rt-red600)]' : 'border-transparent'}`}>
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
          className="rt-num h-full min-w-0 flex-1 bg-transparent px-4 text-[15px] text-[var(--rt-ink900)] outline-none"
        />
        <span className="text-sm text-[var(--rt-ink400)]">min</span>
      </span>
      <span className={`mt-1.5 block text-xs ${invalid ? 'text-[var(--rt-red600)]' : 'text-[var(--rt-ink400)]'}`}>{hint}</span>
    </label>
  );

  return (
    <div className="space-y-4">
      <SGFCard padding="lg" title="Fonte do rastreamento" icon={MapPin}>
        <p className="-mt-1 mb-4 text-sm text-[var(--rt-ink500)]">Qual GPS registra o trajeto das viagens desta prefeitura.</p>
        <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Fonte do rastreamento">
          {SOURCES.map((s) => {
            const active = source === s.value;
            return (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSource(s.value)}
                className={`rounded-[22px] border-2 p-4 text-left transition ${active ? 'border-[var(--rt-brand)] bg-[var(--rt-brand-100)]/50' : 'border-transparent bg-[var(--rt-paper)] hover:bg-[var(--rt-paper2)]'}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold text-[var(--rt-ink900)]">{s.title}</span>
                  <span className={`grid h-5 w-5 place-items-center rounded-full border-2 ${active ? 'border-[var(--rt-brand)]' : 'border-[var(--rt-ink300)]'}`}>
                    {active && <span className="h-2.5 w-2.5 rounded-full bg-[var(--rt-brand)]" />}
                  </span>
                </span>
                <span className="mt-1.5 block text-[13px] leading-snug text-[var(--rt-ink500)]">{s.text}</span>
              </button>
            );
          })}
        </div>
      </SGFCard>

      <SGFCard padding="lg" title="Lembretes de veículo parado" icon={Bell}>
        <p className="-mt-1 mb-4 text-sm text-[var(--rt-ink500)]">
          Quando o veículo fica parado com a viagem aberta, o motorista recebe avisos no celular. Passado o limite, o app obriga a encerrar a viagem ao ser aberto e os gestores são avisados a partir de 1 h parado.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {numberField('Primeiro aviso após', first, setFirst, 'Repete nesse intervalo até 1 h parado.')}
          {numberField('Depois de 1 h, avisar a cada', interval, setIntervalMin, 'Entre 5 e 240 min.')}
          {numberField('Encerramento obrigatório após', close, setClose, closeInvalid ? 'Precisa ser maior que o primeiro aviso.' : `= ${fmtMin(closeN)} parado.`, closeInvalid)}
        </div>

        <div className="mt-5 rounded-2xl bg-[var(--rt-paper)] p-4">
          <p className="mb-3 text-xs font-medium text-[var(--rt-ink500)]">Como fica para o motorista</p>
          <div className="flex flex-wrap items-center gap-2">
            {timeline.map((m) => (
              <span key={m} className="rt-num inline-flex h-8 items-center rounded-full bg-white px-3 text-[13px] font-semibold text-[var(--rt-ink700)] shadow-[var(--rt-shadow-card)]">
                {fmtMin(m)}
              </span>
            ))}
            <span className="rt-num inline-flex h-8 items-center rounded-full bg-[var(--rt-red100)] px-3 text-[13px] font-semibold text-[var(--rt-red600)]">
              {fmtMin(closeN)} · encerrar
            </span>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={save} disabled={saving || closeInvalid}>{saving ? 'Salvando…' : 'Salvar rastreamento'}</Button>
        </div>
      </SGFCard>
    </div>
  );
}
