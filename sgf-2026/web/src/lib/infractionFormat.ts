import type { Tables } from '@/types/database.types';

export type InfractionRow = Tables<'infractions'> & {
    vehicles?: { plate?: string; brand?: string; model?: string; photo_url?: string | null; departments?: { name?: string } | null } | null;
    suggested?: { id: string; full_name: string; photo_url?: string | null } | null;
    indicated?: { id: string; full_name: string; photo_url?: string | null } | null;
};

export const STATUS_META: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' }> = {
    pendente: { label: 'Pendente', variant: 'warning' },
    indicada: { label: 'Indicada', variant: 'info' },
    aprovada: { label: 'Aprovada', variant: 'success' },
    rejeitada: { label: 'Rejeitada', variant: 'error' },
    paga: { label: 'Paga', variant: 'default' },
};


const STATE_NAMES = ['Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal', 'Espírito Santo', 'Goiás', 'Maranhão',
    'Mato Grosso', 'Mato Grosso do Sul', 'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco', 'Piauí', 'Rio de Janeiro',
    'Rio Grande do Norte', 'Rio Grande do Sul', 'Rondônia', 'Roraima', 'Santa Catarina', 'São Paulo', 'Sergipe', 'Tocantins'];

/** Cidade de um endereço livre ("Av. X, 93, Tapejara, Paraná, Região Sul, Brasil" → "Tapejara"). */
export function cityFromAddress(address: string | null | undefined, tenantCity?: string | null): string {
    if (!address) return '—';
    if (tenantCity && address.toLowerCase().includes(tenantCity.toLowerCase())) return tenantCity;
    const parts = address.split(/,| - /).map((p) => p.trim()).filter(Boolean);
    const stateIdx = parts.findIndex((p) => STATE_NAMES.includes(p) || /^[A-Z]{2}$/.test(p));
    if (stateIdx > 0) return parts[stateIdx - 1];
    return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}

/** "08/10/2026 às 12:00" — data e hora numa linha só. */
export function fmtDateTimeLong(iso?: string | null) {
    return fmtDateTime(iso).replace(' - ', ' às ');
}

export function fmtDateTime(iso?: string | null) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} - ${timeStr}`;
}

