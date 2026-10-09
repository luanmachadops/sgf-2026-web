import type { Json } from '@/types/database.types';
import type { ActivityRow } from '@/lib/audit-api';
import { actionLabel, entityTypeLabel, sourceLabel } from '@/lib/audit-api';
import { formatRoleLabel, maskCpfLGPD } from '@/lib/utils';

const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  plate: 'Placa',
  name: 'Nome',
  full_name: 'Nome completo',
  email: 'E-mail',
  phone: 'Telefone',
  cpf: 'CPF',
  cnh: 'CNH',
  cnh_number: 'Nº da CNH',
  cnh_category: 'Categoria da CNH',
  cnh_expiry: 'Validade da CNH',
  role: 'Perfil',
  access_blocked: 'Acesso bloqueado',
  department_id: 'Secretaria',
  vehicle_id: 'Veículo',
  driver_id: 'Motorista',
  station_id: 'Posto',
  liters: 'Litros',
  total_value: 'Valor total',
  price_per_liter: 'Preço por litro',
  fuel_type: 'Combustível',
  odometer: 'Odômetro',
  start_odometer: 'Odômetro inicial',
  end_odometer: 'Odômetro final',
  start_km: 'KM inicial',
  end_km: 'KM final',
  destination: 'Destino',
  origin: 'Origem',
  purpose: 'Finalidade',
  notes: 'Observações',
  observations: 'Observações',
  priority: 'Prioridade',
  category: 'Categoria',
  description: 'Descrição',
  validated_at: 'Validado em',
  validated_by: 'Validado por',
  approved_at: 'Aprovado em',
  rejection_reason: 'Motivo da reprovação',
  started_at: 'Início',
  ended_at: 'Fim',
  created_at: 'Criado em',
  updated_at: 'Atualizado em',
  tenant_id: 'Prefeitura',
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function isRecord(v: unknown): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function formatValue(v: Json | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString('pt-BR');
    }
    return v;
  }
  return JSON.stringify(v);
}

export interface DiffEntry {
  field: string;
  label: string;
  before: string;
  after: string;
}

/** Interpreta `changes` no formato { campo: { de, para } }. */
export function parseChanges(changes: Json | null): DiffEntry[] {
  if (!isRecord(changes)) return [];
  return Object.entries(changes).map(([field, val]) => {
    if (isRecord(val) && ('de' in val || 'para' in val)) {
      return { field, label: fieldLabel(field), before: formatValue(val.de), after: formatValue(val.para) };
    }
    return { field, label: fieldLabel(field), before: '—', after: formatValue(val) };
  });
}

export function actorRoleLabel(role: string | null): string {
  return role ? formatRoleLabel(role) : '—';
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

export function shortHash(h: string | null | undefined): string {
  if (!h) return '—';
  return h.length > 16 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h;
}

export function originLabel(r: ActivityRow): string {
  const ip = r.ip ? String(r.ip) : '';
  return ip ? `${sourceLabel(r.source)} · ${ip}` : sourceLabel(r.source);
}

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  // Evita injeção de fórmula em planilhas.
  const safe = /^[=+@\-\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function buildCsv(rows: ActivityRow[]): string {
  const header = [
    'Seq', 'Data/hora', 'Usuário', 'Perfil', 'CPF (mascarado)', 'Secretaria do usuário', 'Ação',
    'Tipo de registro', 'Registro', 'ID do registro', 'Origem', 'IP', 'Sensibilidade', 'Alterações',
    'Hash anterior', 'Hash do registro', 'ID do evento',
  ];
  const lines = [header.map(csvCell).join(';')];
  for (const r of rows) {
    const diff = parseChanges(r.changes)
      .map((d) => `${d.label}: ${d.before} -> ${d.after}`)
      .join(' | ');
    lines.push([
      r.chain_seq, formatDateTime(r.created_at), r.actor_name, actorRoleLabel(r.actor_role),
      r.actor_cpf ? maskCpfLGPD(r.actor_cpf) : '', r.actor_department_name, actionLabel(r.action),
      entityTypeLabel(r.entity_type), r.entity_label, r.entity_id, sourceLabel(r.source),
      r.ip ? String(r.ip) : '', r.sensitivity, diff, r.prev_hash, r.row_hash, r.id,
    ].map(csvCell).join(';'));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
