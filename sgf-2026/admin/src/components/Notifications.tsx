import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { tenantsApi, contractsApi, invoicesApi, aiApi, trackersApi } from '@/lib/api';
import { iopgpsApi } from '@/lib/iopgpsApi';
import { fmtBrl } from '@/lib/ui';
import { SGFCard } from '@/components/sgf';
import { Bell, X, Check, ChevronRight } from '@/components/sgf/icons';

/**
 * Central de avisos do superadmin.
 *
 * Os avisos são calculados a partir dos dados que o superadmin já lê (contratos,
 * faturas, prefeituras, IA, rastreadores) — nada novo no banco. "Lido" e as
 * categorias ligadas/desligadas ficam guardados neste navegador. Um aviso lido
 * volta a aparecer se a situação mudar (a chave inclui o estado).
 */

export type AlertCategory = 'contracts' | 'invoices' | 'trials' | 'ai' | 'trackers';
export const CATEGORIES: { key: AlertCategory; label: string; hint: string }[] = [
  { key: 'contracts', label: 'Contratos', hint: 'Vencendo em 30 dias ou já vencidos' },
  { key: 'invoices', label: 'Faturas', hint: 'Atrasadas ou vencendo em 7 dias' },
  { key: 'trials', label: 'Prefeituras em teste', hint: 'Em avaliação há mais de 30 dias' },
  { key: 'ai', label: 'Uso de IA', hint: 'Gasto acima de 80% do teto mensal' },
  { key: 'trackers', label: 'Rastreadores', hint: 'Sem sinal há 24 h ou sem veículo vinculado' },
];

export type PlatformAlert = {
  id: string;
  category: AlertCategory;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  link: string;
};

// ── Preferências locais (lidos + categorias) com assinatura para re-render ──
const READ_KEY = 'rt:alerts:read';
const OFF_KEY = 'rt:alerts:off';
const listeners = new Set<() => void>();
let version = 0;
function readSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]') as string[]); } catch { return new Set(); }
}
function writeSet(key: string, set: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* sem storage */ }
  version += 1; listeners.forEach((l) => l());
}
function usePrefsVersion() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => version);
}
export function markRead(ids: string[]) { const s = readSet(READ_KEY); ids.forEach((i) => s.add(i)); writeSet(READ_KEY, s); }
export function toggleCategory(c: AlertCategory, on: boolean) { const s = readSet(OFF_KEY); if (on) s.delete(c); else s.add(c); writeSet(OFF_KEY, s); }

const DAY = 864e5;
const isoDay = (offset = 0) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const br = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR');

/** Calcula os avisos da plataforma. Atualiza a cada 5 min. */
export function usePlatformAlerts() {
  usePrefsVersion();
  const opts = { refetchInterval: 5 * 60_000, staleTime: 60_000 };
  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list, ...opts });
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: () => contractsApi.list(), ...opts });
  const { data: invoices = [] } = useQuery({ queryKey: ['invoices'], queryFn: () => invoicesApi.list(), ...opts });
  const { data: usage = [] } = useQuery({ queryKey: ['ai-usage'], queryFn: aiApi.usage, ...opts });
  const { data: limits = [] } = useQuery({ queryKey: ['ai-limits'], queryFn: aiApi.limits, ...opts });
  const { data: trackers = [] } = useQuery({ queryKey: ['trackers', 'all'], queryFn: () => trackersApi.list(), ...opts });
  const { data: devices = [] } = useQuery({ queryKey: ['iopgps-status', 'all'], queryFn: () => iopgpsApi.status(), ...opts });

  const all = useMemo<PlatformAlert[]>(() => {
    const name = (id: string) => tenants.find((t) => t.id === id)?.name ?? 'Prefeitura';
    const out: PlatformAlert[] = [];
    const today = isoDay();

    for (const c of contracts) {
      if (c.status !== 'active' || !c.end_date) continue;
      if (c.end_date < today) out.push({ id: `contract:${c.id}:expired`, category: 'contracts', severity: 'critical', title: 'Contrato vencido', detail: `${c.title} · ${name(c.tenant_id)} · venceu em ${br(c.end_date)}`, link: '/contratos' });
      else if (c.end_date <= isoDay(30)) out.push({ id: `contract:${c.id}:soon`, category: 'contracts', severity: 'warning', title: 'Contrato vencendo', detail: `${c.title} · ${name(c.tenant_id)} · vence em ${br(c.end_date)}`, link: '/contratos' });
    }
    for (const i of invoices) {
      if (i.status === 'paid' || i.status === 'canceled') continue;
      if (i.status === 'overdue' || (i.due_date && i.due_date < today)) out.push({ id: `invoice:${i.id}:late`, category: 'invoices', severity: 'critical', title: 'Fatura atrasada', detail: `${name(i.tenant_id)} · ${fmtBrl(Number(i.amount))}${i.due_date ? ` · venceu em ${br(i.due_date)}` : ''}`, link: '/pagamentos' });
      else if (i.due_date && i.due_date <= isoDay(7)) out.push({ id: `invoice:${i.id}:soon`, category: 'invoices', severity: 'warning', title: 'Fatura vencendo', detail: `${name(i.tenant_id)} · ${fmtBrl(Number(i.amount))} · vence em ${br(i.due_date)}`, link: '/pagamentos' });
    }
    for (const t of tenants) {
      if (t.status !== 'trial' || !t.created_at) continue;
      const days = Math.floor((Date.now() - new Date(t.created_at).getTime()) / DAY);
      if (days > 30) out.push({ id: `trial:${t.id}:${Math.floor(days / 30)}`, category: 'trials', severity: 'info', title: 'Teste prolongado', detail: `${t.name} está em avaliação há ${days} dias`, link: `/prefeituras/${t.id}` });
    }
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const spent: Record<string, number> = {};
    for (const u of usage) if (u.created_at >= monthStart.toISOString()) spent[u.tenant_id] = (spent[u.tenant_id] ?? 0) + Number(u.cost_usd ?? 0);
    for (const l of limits) {
      const cap = Number(l.monthly_cap_usd ?? 0);
      const cost = spent[l.tenant_id] ?? 0;
      if (cap > 0 && cost >= cap * 0.8) {
        const over = cost >= cap;
        out.push({ id: `ai:${l.tenant_id}:${monthStart.getMonth()}:${over ? 'over' : 'near'}`, category: 'ai', severity: over ? 'critical' : 'warning', title: over ? 'Teto de IA atingido' : 'IA perto do teto', detail: `${name(l.tenant_id)} usou ${Math.round((cost / cap) * 100)}% do teto do mês`, link: '/ia' });
      }
    }
    for (const d of devices) {
      const t = d.gps_time ?? d.updated_at;
      if (t && Date.now() - new Date(t).getTime() > DAY) {
        const label = trackers.find((x) => x.id === d.tracker_id)?.label || d.imei;
        out.push({ id: `tracker:${d.tracker_id}:silent`, category: 'trackers', severity: 'warning', title: 'Rastreador sem sinal', detail: `${label} · ${name(d.tenant_id)} · sem sinal há mais de 24 h`, link: '/monitoramento' });
      }
    }
    for (const tr of trackers) {
      if (tr.active && !tr.vehicle_id) out.push({ id: `tracker:${tr.id}:unlinked`, category: 'trackers', severity: 'info', title: 'Rastreador sem veículo', detail: `${tr.label || tr.identifier} · ${name(tr.tenant_id)}`, link: '/rastreadores' });
    }
    const rank = { critical: 0, warning: 1, info: 2 };
    return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  }, [tenants, contracts, invoices, usage, limits, trackers, devices]);

  const off = readSet(OFF_KEY);
  const read = readSet(READ_KEY);
  const enabled = all.filter((a) => !off.has(a.category));
  return { alerts: enabled, unread: enabled.filter((a) => !read.has(a.id)), isRead: (id: string) => read.has(id), off };
}

const TONE = {
  critical: { dot: 'bg-[var(--rt-red600)]', box: 'bg-[var(--rt-red100)] text-[var(--rt-red600)]' },
  warning: { dot: 'bg-[#F59E0B]', box: 'bg-[var(--rt-amber100)] text-[var(--rt-amber600)]' },
  info: { dot: 'bg-[var(--rt-blue600)]', box: 'bg-[var(--rt-blue100)] text-[var(--rt-blue600)]' },
};

/** Sino com contador + painel lateral de avisos. */
export function NotificationBell({ onDark = true }: { onDark?: boolean }) {
  const [open, setOpen] = useState(false);
  const { alerts, unread, isRead } = usePlatformAlerts();
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Avisos${unread.length ? ` (${unread.length} novos)` : ''}`}
        className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition ${onDark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-white text-[var(--rt-ink900)] shadow-[var(--rt-shadow-card)]'}`}
      >
        <Bell width={20} height={20} />
        {unread.length > 0 && (
          <span className={`rt-num absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--rt-accent)] px-1 text-[11px] font-bold text-white ring-2 ${onDark ? 'ring-[var(--rt-ink900)]' : 'ring-white'}`}>
            {unread.length > 99 ? '99+' : unread.length}
          </span>
        )}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[1100] flex justify-end" role="dialog" aria-modal="true" aria-label="Avisos">
          <div className="absolute inset-0 bg-[var(--rt-ink900)]/35" onClick={() => setOpen(false)} />
          <aside className="rt-rise relative m-3 flex w-full max-w-md flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_24px_64px_rgb(15_43_47/0.28)]">
            <div className="flex items-center justify-between gap-3 px-6 pb-3 pt-6">
              <div>
                <h2 className="text-xl font-bold text-[var(--rt-ink900)]">Avisos</h2>
                <p className="text-sm text-[var(--rt-ink500)]">{unread.length ? `${unread.length} ${unread.length === 1 ? 'novo' : 'novos'}` : 'Tudo em dia'}</p>
              </div>
              <div className="flex items-center gap-2">
                {unread.length > 0 && (
                  <button onClick={() => markRead(unread.map((a) => a.id))} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--rt-paper)] px-3.5 text-[13px] font-semibold text-[var(--rt-ink900)] hover:bg-[var(--rt-paper2)]">
                    <Check width={15} height={15} /> Marcar todos
                  </button>
                )}
                <button onClick={() => setOpen(false)} aria-label="Fechar" className="grid h-10 w-10 place-items-center rounded-full bg-[var(--rt-paper)] text-[var(--rt-ink700)] hover:bg-[var(--rt-paper2)]"><X width={20} height={20} /></button>
              </div>
            </div>
            <div className="rt-scroll flex-1 space-y-2 overflow-y-auto px-4 pb-4">
              {alerts.length === 0 ? (
                <div className="grid place-items-center px-6 py-16 text-center">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--rt-brand-100)] text-[var(--rt-brand)]"><Check width={26} height={26} /></span>
                  <p className="mt-4 font-semibold text-[var(--rt-ink900)]">Nenhum aviso</p>
                  <p className="mt-1 text-sm text-[var(--rt-ink500)]">Contratos, faturas e rastreadores estão em dia.</p>
                </div>
              ) : alerts.map((a) => {
                const read = isRead(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => { markRead([a.id]); setOpen(false); navigate(a.link); }}
                    className={`flex w-full items-start gap-3 rounded-[22px] p-3.5 text-left transition hover:bg-[var(--rt-paper)] ${read ? 'opacity-60' : 'bg-[var(--rt-paper)]/60'}`}
                  >
                    <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${TONE[a.severity].box}`}><Bell width={16} height={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-semibold text-[var(--rt-ink900)]">
                        {!read && <span className={`h-2 w-2 shrink-0 rounded-full ${TONE[a.severity].dot}`} />}
                        {a.title}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-[var(--rt-ink500)]">{a.detail}</span>
                    </span>
                    <ChevronRight width={16} height={16} className="mt-2.5 shrink-0 text-[var(--rt-ink400)]" />
                  </button>
                );
              })}
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Preferências: quais tipos de aviso aparecem (por navegador). */
export function NotificationPrefsCard() {
  const { off, alerts } = usePlatformAlerts();
  return (
    <SGFCard padding="lg" title="Notificações" icon={Bell}>
      <p className="-mt-1 mb-4 text-sm text-[var(--rt-ink500)]">Escolha o que aparece no sino de avisos. Vale para este navegador.</p>
      <div className="divide-y divide-[var(--rt-hairline)]">
        {CATEGORIES.map((c) => {
          const on = !off.has(c.key);
          const count = alerts.filter((a) => a.category === c.key).length;
          return (
            <label key={c.key} className="flex cursor-pointer items-center justify-between gap-4 py-3.5">
              <span className="min-w-0">
                <span className="block text-[15px] font-medium text-[var(--rt-ink900)]">{c.label}{on && count > 0 && <span className="rt-num ml-2 rounded-full bg-[var(--rt-paper)] px-2 py-0.5 text-xs font-semibold text-[var(--rt-ink500)]">{count}</span>}</span>
                <span className="block text-[13px] text-[var(--rt-ink500)]">{c.hint}</span>
              </span>
              <span className="relative inline-flex">
                <input type="checkbox" className="peer sr-only" checked={on} onChange={(e) => toggleCategory(c.key, e.target.checked)} />
                <span className="h-7 w-12 rounded-full bg-[var(--rt-ink300)] transition peer-checked:bg-[var(--rt-brand)] peer-focus-visible:ring-4 peer-focus-visible:ring-[var(--rt-brand)]/20" />
                <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
              </span>
            </label>
          );
        })}
      </div>
    </SGFCard>
  );
}
