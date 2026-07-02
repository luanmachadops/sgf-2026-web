import { supabase } from './supabase';
import { apiUrl } from './apiBase';
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.types';

export type Tenant = Tables<'tenants'>;
export type Invoice = Tables<'tenant_invoices'>;
export type Contract = Tables<'tenant_contracts'>;
export type AiUsage = Tables<'ai_usage'>;
export type AiLimit = Tables<'tenant_ai_limits'>;
export type Tracker = Tables<'trackers'>;
// Sugestões de modelos (o modelo real é detectado pela IOPGPS via IMEI e pode ser
// qualquer aparelho suportado por eles — o campo aceita texto livre).
export const TRACKER_MODELS = ['SL48', 'SL48-4G', 'SL46-4G', 'S5', 'S20', 'GT06N'] as const;

function bail<T>(data: T, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data;
}

export const tenantsApi = {
  list: async (): Promise<Tenant[]> => {
    const { data, error } = await supabase.from('tenants').select('*').order('name');
    return bail(data ?? [], error);
  },
  get: async (id: string): Promise<Tenant | null> => {
    const { data, error } = await supabase.from('tenants').select('*').eq('id', id).maybeSingle();
    return bail(data, error);
  },
  update: async (id: string, patch: TablesUpdate<'tenants'>): Promise<void> => {
    const { error } = await supabase.from('tenants').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    bail(null, error);
  },
  stats: async (id: string): Promise<TenantStats> => {
    const [veh, drv, trk, mgr] = await Promise.all([
      supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', id).eq('role', 'motorista'),
      supabase.from('trackers').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', id).in('role', ['admin', 'gestor', 'secretario']),
    ]);
    return { vehicles: veh.count ?? 0, drivers: drv.count ?? 0, trackers: trk.count ?? 0, managers: mgr.count ?? 0 };
  },
  create: async (patch: TablesInsert<'tenants'>): Promise<Tenant> => {
    const { data, error } = await supabase.from('tenants').insert(patch).select('*').single();
    return bail(data, error)!;
  },
};

export const invoicesApi = {
  list: async (tenantId?: string): Promise<Invoice[]> => {
    let q = supabase.from('tenant_invoices').select('*').order('competencia', { ascending: false });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    return bail(data ?? [], error);
  },
  create: async (patch: TablesInsert<'tenant_invoices'>): Promise<void> => {
    const { error } = await supabase.from('tenant_invoices').insert(patch);
    bail(null, error);
  },
  update: async (id: string, patch: TablesUpdate<'tenant_invoices'>): Promise<void> => {
    const { error } = await supabase.from('tenant_invoices').update(patch).eq('id', id);
    bail(null, error);
  },
};

export const contractsApi = {
  list: async (tenantId?: string): Promise<Contract[]> => {
    let q = supabase.from('tenant_contracts').select('*').order('end_date', { ascending: true });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    return bail(data ?? [], error);
  },
  create: async (patch: TablesInsert<'tenant_contracts'>): Promise<void> => {
    const { error } = await supabase.from('tenant_contracts').insert(patch);
    bail(null, error);
  },
  update: async (id: string, patch: TablesUpdate<'tenant_contracts'>): Promise<void> => {
    const { error } = await supabase.from('tenant_contracts').update(patch).eq('id', id);
    bail(null, error);
  },
};

export const aiApi = {
  usage: async (): Promise<AiUsage[]> => {
    const { data, error } = await supabase.from('ai_usage').select('*').order('created_at', { ascending: false }).limit(2000);
    return bail(data ?? [], error);
  },
  limits: async (): Promise<AiLimit[]> => {
    const { data, error } = await supabase.from('tenant_ai_limits').select('*');
    return bail(data ?? [], error);
  },
  setLimit: async (tenantId: string, monthlyCapUsd: number, enabled: boolean): Promise<void> => {
    const { error } = await supabase.from('tenant_ai_limits')
      .upsert({ tenant_id: tenantId, monthly_cap_usd: monthlyCapUsd, enabled, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });
    bail(null, error);
  },
};

export interface Series { month: string; value: number }
export interface TenantStats { vehicles: number; drivers: number; trackers: number; managers: number }

export interface Manager {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  tenant_id: string | null;
  access_blocked: boolean;
  created_at: string | null;
}

export const managersApi = {
  list: async (tenantId?: string): Promise<Manager[]> => {
    let q = supabase.from('profiles')
      .select('id, full_name, email, role, tenant_id, access_blocked, created_at')
      .in('role', ['admin', 'gestor', 'secretario'])
      .order('created_at', { ascending: false });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    return bail((data ?? []) as Manager[], error);
  },
  // Ações sensíveis via função serverless (service-role).
  action: async (body: Record<string, unknown>): Promise<{ ok: boolean }> => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(apiUrl('managers'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.message || 'Falha na operação');
    return json;
  },
};

export const trackersApi = {
  list: async (tenantId?: string): Promise<Tracker[]> => {
    let q = supabase.from('trackers').select('*').order('created_at', { ascending: false });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    return bail(data ?? [], error);
  },
  create: async (patch: TablesInsert<'trackers'>): Promise<void> => {
    const { error } = await supabase.from('trackers').insert(patch);
    bail(null, error);
  },
  setActive: async (id: string, active: boolean): Promise<void> => {
    const { error } = await supabase.from('trackers').update({ active, updated_at: new Date().toISOString() }).eq('id', id);
    bail(null, error);
  },
  setVehicle: async (id: string, vehicleId: string | null): Promise<void> => {
    const { error } = await supabase.from('trackers').update({ vehicle_id: vehicleId, updated_at: new Date().toISOString() }).eq('id', id);
    bail(null, error);
  },
  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from('trackers').delete().eq('id', id);
    bail(null, error);
  },
};

export interface VehicleOption {
  id: string; plate: string | null; brand: string | null; model: string | null;
  tenant_id: string; photo_url: string | null; departmentName: string | null;
}

export const vehiclesApi = {
  // Veículos cadastrados (para vincular a rastreadores). Escopo por prefeitura quando informado.
  list: async (tenantId?: string): Promise<VehicleOption[]> => {
    let q = supabase.from('vehicles').select('id, plate, brand, model, tenant_id, photo_url, departments(name)').order('plate');
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    const rows = bail(data ?? [], error);
    return (rows as any[]).map((v) => ({
      id: v.id, plate: v.plate, brand: v.brand, model: v.model, tenant_id: v.tenant_id,
      photo_url: v.photo_url ?? null, departmentName: (v.departments as { name?: string } | null)?.name ?? null,
    }));
  },
};

/** Placa formatada (ABC-1234 / ABC-1D23). */
export function formatPlate(plate: string | null | undefined): string {
  if (!plate) return '';
  const c = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (c.length === 7) {
    if (/[A-Z]{3}\d[A-Z]\d{2}/.test(c)) return c.replace(/([A-Z]{3})(\d)([A-Z])(\d{2})/, '$1-$2$3$4');
    return c.replace(/([A-Z]{3})(\d{4})/, '$1-$2');
  }
  return plate;
}

export function vehicleLabel(v: VehicleOption): string {
  const model = [v.brand, v.model].filter(Boolean).join(' ');
  return [formatPlate(v.plate), model].filter(Boolean).join(' — ') || 'Veículo sem placa';
}

export interface GlobalKpis {
  tenants: number;
  activeTenants: number;
  vehicles: number;
  drivers: number;
  aiCostMonth: number;
  pendingInvoices: number;
  series: {
    tenants: Series[]; vehicles: Series[]; drivers: Series[];
    aiCost: Series[]; invoices: Series[];
  };
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Agrupa por mês (últimos 6) somando `value` (1 por linha, ou um campo numérico). */
function buckets(rows: { created_at?: string | null }[], field?: string): Series[] {
  const now = new Date();
  const keys: { y: number; m: number; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push({ y: d.getFullYear(), m: d.getMonth(), label: MONTHS[d.getMonth()] });
  }
  const map = new Map(keys.map((k) => [`${k.y}-${k.m}`, 0]));
  for (const r of rows) {
    if (!r.created_at) continue;
    const d = new Date(r.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + (field ? Number((r as Record<string, unknown>)[field] ?? 0) : 1));
  }
  return keys.map((k) => ({ month: k.label, value: map.get(`${k.y}-${k.m}`) ?? 0 }));
}

export interface TrendPoint { month: string; aiCost: number; invoices: number }

/** Resolve um intervalo [from,to] a partir de monthsBack OU datas explícitas. */
function resolveRange(p: { monthsBack?: number; from?: string; to?: string }): { from: Date; to: Date } {
  if (p.from && p.to) return { from: new Date(p.from), to: new Date(p.to) };
  const to = new Date();
  const back = p.monthsBack ?? 6;
  const from = new Date(to.getFullYear(), to.getMonth() - (back - 1), 1);
  return { from, to };
}

function monthKeys(from: Date, to: Date) {
  const keys: { y: number; m: number; label: string }[] = [];
  const d = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (d <= end && keys.length < 36) {
    keys.push({ y: d.getFullYear(), m: d.getMonth(), label: MONTHS[d.getMonth()] });
    d.setMonth(d.getMonth() + 1);
  }
  return keys;
}

export const dashboardApi = {
  trend: async (p: { monthsBack?: number; from?: string; to?: string }): Promise<TrendPoint[]> => {
    const { from, to } = resolveRange(p);
    const fromIso = from.toISOString();
    const toIso = new Date(to.getFullYear(), to.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const [ai, inv] = await Promise.all([
      supabase.from('ai_usage').select('created_at, cost_usd').gte('created_at', fromIso).lte('created_at', toIso),
      supabase.from('tenant_invoices').select('created_at, amount').gte('created_at', fromIso).lte('created_at', toIso),
    ]);
    const keys = monthKeys(from, to);
    const aiMap = new Map(keys.map((k) => [`${k.y}-${k.m}`, 0]));
    const invMap = new Map(keys.map((k) => [`${k.y}-${k.m}`, 0]));
    for (const r of ai.data ?? []) { const d = new Date(r.created_at!); const k = `${d.getFullYear()}-${d.getMonth()}`; if (aiMap.has(k)) aiMap.set(k, (aiMap.get(k) ?? 0) + Number(r.cost_usd ?? 0)); }
    for (const r of inv.data ?? []) { const d = new Date(r.created_at!); const k = `${d.getFullYear()}-${d.getMonth()}`; if (invMap.has(k)) invMap.set(k, (invMap.get(k) ?? 0) + Number(r.amount ?? 0)); }
    return keys.map((k) => ({ month: k.label, aiCost: aiMap.get(`${k.y}-${k.m}`) ?? 0, invoices: invMap.get(`${k.y}-${k.m}`) ?? 0 }));
  },

  kpis: async (): Promise<GlobalKpis> => {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const since = new Date(); since.setMonth(since.getMonth() - 6);
    const sinceIso = since.toISOString();

    const [tenants, vehicles, drivers, aiMonth, ai6, inv6, pending] = await Promise.all([
      supabase.from('tenants').select('id, status, created_at'),
      supabase.from('vehicles').select('id, created_at'),
      supabase.from('profiles').select('id, created_at').eq('role', 'motorista'),
      supabase.from('ai_usage').select('cost_usd').gte('created_at', monthStart.toISOString()),
      supabase.from('ai_usage').select('created_at, cost_usd').gte('created_at', sinceIso),
      supabase.from('tenant_invoices').select('created_at, amount').gte('created_at', sinceIso),
      supabase.from('tenant_invoices').select('id', { count: 'exact', head: true }).in('status', ['pending', 'overdue']),
    ]);
    const tlist = tenants.data ?? [];
    const vlist = vehicles.data ?? [];
    const dlist = drivers.data ?? [];
    const aiCost = (aiMonth.data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
    return {
      tenants: tlist.length,
      activeTenants: tlist.filter((t) => t.status === 'active').length,
      vehicles: vlist.length,
      drivers: dlist.length,
      aiCostMonth: aiCost,
      pendingInvoices: pending.count ?? 0,
      series: {
        tenants: buckets(tlist),
        vehicles: buckets(vlist),
        drivers: buckets(dlist),
        aiCost: buckets((ai6.data ?? []) as { created_at?: string }[], 'cost_usd'),
        invoices: buckets((inv6.data ?? []) as { created_at?: string }[], 'amount'),
      },
    };
  },
};

/** Cria prefeitura + primeiro admin via função serverless (service-role). */
export async function provisionTenant(payload: {
  name: string; slug: string; city?: string; state?: string; cnpj?: string;
  adminName: string; adminEmail: string; adminPassword: string;
}): Promise<{ tenantId: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(apiUrl('tenants/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || 'Falha ao provisionar prefeitura');
  return json;
}
