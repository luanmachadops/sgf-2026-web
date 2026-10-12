// Preferências de relatório compartilhadas pela prefeitura (RLS por tenant):
// modelos de layout (report_layout_models) e assinaturas padrão
// (app_settings.report_signatures).

import type { Json, TablesInsert } from '@/types/database.types';
import { supabase } from '../supabase';
import type { ReportOrientation, ReportSignature } from './types';
import type { ReportSort } from './viewerState';

export interface ReportLayoutConfig {
    columns: string[];
    orientation: ReportOrientation;
    fontSize: number;
    groupBy: string | null;
    sort: ReportSort | null;
    signaturesEnabled: boolean;
}

export interface ReportLayoutModel {
    id: string;
    name: string;
    config: ReportLayoutConfig;
    createdBy: string | null;
}

export const DEFAULT_SIGNATURES: ReportSignature[] = [
    { name: '', role: 'Responsável pela frota' },
    { name: '', role: 'Secretário(a) responsável' },
];

function parseConfig(value: unknown): ReportLayoutConfig | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<ReportLayoutConfig>;
    if (!Array.isArray(raw.columns)) return null;
    const orientation = raw.orientation === 'portrait' || raw.orientation === 'landscape' ? raw.orientation : 'auto';
    const sort = raw.sort && typeof raw.sort.key === 'string' && (raw.sort.direction === 'asc' || raw.sort.direction === 'desc')
        ? raw.sort
        : null;
    return {
        columns: raw.columns.filter((key): key is string => typeof key === 'string'),
        orientation,
        fontSize: Number.isFinite(raw.fontSize) ? Number(raw.fontSize) : 9,
        groupBy: typeof raw.groupBy === 'string' ? raw.groupBy : null,
        sort,
        signaturesEnabled: Boolean(raw.signaturesEnabled),
    };
}

export function parseSignatures(value: unknown): ReportSignature[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => ({ name: String(item.name ?? '').slice(0, 80), role: String(item.role ?? '').slice(0, 80) }))
        .filter((item) => item.name.trim() || item.role.trim())
        .slice(0, 6);
}

export const reportSettingsApi = {
    async listModels(reportId: string): Promise<ReportLayoutModel[]> {
        const { data, error } = await supabase
            .from('report_layout_models')
            .select('id, name, config, created_by')
            .eq('report_id', reportId)
            .order('name', { ascending: true })
            .order('id', { ascending: true });
        if (error) throw new Error(error.message);
        return (data ?? []).flatMap((row) => {
            const config = parseConfig(row.config);
            return config ? [{ id: row.id, name: row.name, config, createdBy: row.created_by }] : [];
        });
    },

    async saveModel(reportId: string, name: string, config: ReportLayoutConfig): Promise<void> {
        const trimmed = name.trim().slice(0, 60);
        const { data: existing, error: findError } = await supabase
            .from('report_layout_models')
            .select('id')
            .eq('report_id', reportId)
            .eq('name', trimmed)
            .maybeSingle();
        if (findError) throw new Error(findError.message);
        const payload = { config: config as unknown as Json, updated_at: new Date().toISOString() };
        const { error } = existing
            ? await supabase.from('report_layout_models').update(payload).eq('id', existing.id)
            : await supabase.from('report_layout_models').insert({ report_id: reportId, name: trimmed, ...payload });
        if (error) throw new Error(error.message);
    },

    async deleteModel(id: string): Promise<void> {
        const { error } = await supabase.from('report_layout_models').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },

    async getSignatures(): Promise<ReportSignature[]> {
        const { data, error } = await supabase
            .from('app_settings')
            .select('report_signatures')
            .limit(1)
            .maybeSingle();
        if (error) throw new Error(error.message);
        const list = parseSignatures(data?.report_signatures);
        return list.length ? list : DEFAULT_SIGNATURES;
    },

    async saveSignatures(signatures: ReportSignature[]): Promise<void> {
        const clean = parseSignatures(signatures);
        const { error } = await supabase
            .from('app_settings')
            .upsert(
                { report_signatures: clean as unknown as Json, updated_at: new Date().toISOString() } as TablesInsert<'app_settings'>,
                { onConflict: 'tenant_id' },
            );
        if (error) throw new Error(error.message);
    },
};
