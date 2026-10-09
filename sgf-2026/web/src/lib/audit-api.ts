import { supabase } from './supabase';
import type { Database, Json } from '@/types/database.types';

export type ActivityRow = Database['public']['Tables']['activity_log']['Row'];

export interface ActivityFilters {
  /** yyyy-MM-dd (início do dia, horário local) */
  from?: string;
  /** yyyy-MM-dd (inclui o dia inteiro, horário local) */
  to?: string;
  entityType?: string;
  actorId?: string;
  action?: string;
  search?: string;
  /** Prefeitura do perfil: limita a lista (o superadmin lê todas pelo RLS). */
  tenantId?: string;
}

export interface ListActivityParams extends ActivityFilters {
  page?: number;
  pageSize?: number;
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  firstBrokenId: string | null;
  firstBrokenSeq: number | null;
}

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  trip: 'Viagem',
  fueling: 'Abastecimento',
  checklist: 'Checklist',
  vehicle: 'Veículo',
  service_order: 'Ordem de serviço',
  driver: 'Motorista',
  user: 'Usuário',
  station: 'Posto',
  trip_correction: 'Correção de viagem',
};

export const ACTION_LABELS: Record<string, string> = {
  create: 'Criação',
  update: 'Alteração',
  delete: 'Exclusão',
  approve: 'Aprovação',
  reject: 'Reprovação',
  login: 'Acesso',
  reset_password: 'Redefinição de senha',
  block_access: 'Bloqueio de acesso',
  purge: 'Expurgo',
};

export const SOURCE_LABELS: Record<string, string> = {
  web_gestor: 'Painel do gestor',
  app_motorista: 'App do motorista',
  sistema: 'Sistema',
};

export const entityTypeLabel = (t: string) => ENTITY_TYPE_LABELS[t] ?? t;
export const actionLabel = (a: string) => ACTION_LABELS[a] ?? a;
export const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s;

/** Converte yyyy-MM-dd local em ISO (início do dia ou início do dia seguinte). */
function dayStartIso(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}
function nextDayStartIso(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function escapeIlike(s: string): string {
  return s.replace(/[\\%_,()]/g, (c) => (c === ',' || c === '(' || c === ')' ? ' ' : `\\${c}`));
}

interface LooseFilter {
  gte: (c: string, v: string) => LooseFilter;
  lt: (c: string, v: string) => LooseFilter;
  eq: (c: string, v: string) => LooseFilter;
  ilike: (c: string, v: string) => LooseFilter;
}

function applyFilters<Q>(query: Q, f: ActivityFilters): Q {
  let q = query as unknown as LooseFilter;
  if (f.tenantId) q = q.eq('tenant_id', f.tenantId);
  if (f.from) q = q.gte('created_at', dayStartIso(f.from));
  if (f.to) q = q.lt('created_at', nextDayStartIso(f.to));
  if (f.entityType) q = q.eq('entity_type', f.entityType);
  if (f.actorId) q = q.eq('actor_id', f.actorId);
  if (f.action) q = q.eq('action', f.action);
  const term = f.search?.trim();
  if (term) q = q.ilike('entity_label', `%${escapeIlike(term)}%`);
  return q as unknown as Q;
}

export const auditApi = {
  async listActivity(params: ListActivityParams = {}): Promise<{ rows: ActivityRow[]; count: number }> {
    const page = Math.max(0, params.page ?? 0);
    const pageSize = Math.min(Math.max(1, params.pageSize ?? 25), 1000);
    const query = applyFilters(
      supabase.from('activity_log').select('*', { count: 'exact' }),
      params,
    )
      .order('created_at', { ascending: false })
      .order('chain_seq', { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { rows: data ?? [], count: count ?? 0 };
  },

  /** Busca até `limit` linhas (para exportação). `truncated` indica que havia mais. */
  async listForExport(
    filters: ActivityFilters,
    limit = 10_000,
  ): Promise<{ rows: ActivityRow[]; truncated: boolean }> {
    const chunk = 1000;
    const rows: ActivityRow[] = [];
    let truncated = false;
    for (let offset = 0; offset < limit; offset += chunk) {
      const size = Math.min(chunk, limit - offset);
      const { data, error } = await applyFilters(
        supabase.from('activity_log').select('*'),
        filters,
      )
        .order('created_at', { ascending: false })
        .order('chain_seq', { ascending: false })
        .range(offset, offset + size - 1);
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < size) return { rows, truncated };
    }
    // Atingiu o limite: confere se ainda existe registro além dele.
    const { data: more, error: moreErr } = await applyFilters(
      supabase.from('activity_log').select('id'),
      filters,
    )
      .order('created_at', { ascending: false })
      .order('chain_seq', { ascending: false })
      .range(limit, limit);
    if (moreErr) throw new Error(moreErr.message);
    truncated = (more?.length ?? 0) > 0;
    return { rows, truncated };
  },

  async getById(id: string): Promise<ActivityRow | null> {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async verifyChain(from?: string, to?: string): Promise<ChainVerification> {
    const { data, error } = await supabase.rpc('verify_activity_chain', {
      p_from: from ? dayStartIso(from) : undefined,
      p_to: to ? nextDayStartIso(to) : undefined,
    });
    if (error) throw new Error(error.message);
    const r = data?.[0];
    if (!r) return { ok: true, checked: 0, firstBrokenId: null, firstBrokenSeq: null };
    return {
      ok: r.ok,
      checked: Number(r.checked),
      firstBrokenId: r.first_broken_id ?? null,
      firstBrokenSeq: r.first_broken_seq != null ? Number(r.first_broken_seq) : null,
    };
  },

  async listActors(): Promise<Array<{ id: string; name: string; role: string | null }>> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .order('full_name');
    if (error) throw new Error(error.message);
    return (data ?? []).map((p) => ({ id: p.id, name: p.full_name ?? 'Sem nome', role: p.role }));
  },
};

export type { Json };
