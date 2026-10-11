import { supabase } from './supabase';
import type { Tables } from '@/types/database.types';

export type DriverTermsAcceptance = Tables<'driver_terms_acceptances'>;

/** Versão do termo que o app exige hoje (mesmo valor de appFrota/src/lib/terms.ts). */
export const CURRENT_TERMS_VERSION = '2026-10-v1';

export async function getDriverTermsAcceptances(driverId: string): Promise<DriverTermsAcceptance[]> {
    const { data, error } = await supabase
        .from('driver_terms_acceptances')
        .select('*')
        .eq('driver_id', driverId)
        .order('accepted_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
}

async function rows<T>(label: string, query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
    const { data, error } = await query;
    if (error) throw new Error(`${label}: ${error.message}`);
    return data ?? [];
}

/**
 * Atendimento ao titular (LGPD art. 18, II — acesso aos dados): reúne num
 * único JSON tudo o que o sistema guarda sobre o motorista e que o gestor da
 * prefeitura pode ver (respeitando RLS). Não apaga nem altera nada.
 * Fotos e documentos vão como caminho no storage; o arquivo não os embute.
 */
export async function exportDriverData(driverId: string): Promise<Blob> {
    const [profile] = await rows('perfil', supabase.from('profiles').select('*').eq('id', driverId));
    const trips = await rows('viagens', supabase.from('trips').select('*').eq('driver_id', driverId).order('start_at'));
    const tripIds = trips.map((t) => t.id);
    const [stops, locationsCount, checklists, fuelings, issues, serviceOrders, notifications, terms, activity] = await Promise.all([
        tripIds.length
            ? rows('paradas', supabase.from('trip_stops').select('*').in('trip_id', tripIds).order('arrived_at'))
            : Promise.resolve([]),
        tripIds.length
            ? supabase.from('trip_locations').select('id', { count: 'exact', head: true }).in('trip_id', tripIds).then((r) => r.count ?? 0)
            : Promise.resolve(0),
        rows('checklists', supabase.from('checklists').select('*, checklist_items(*)').eq('driver_id', driverId).order('created_at')),
        rows('abastecimentos', supabase.from('fuelings').select('*').eq('driver_id', driverId).order('created_at')),
        rows('ocorrências', supabase.from('issues').select('*').eq('driver_id', driverId).order('created_at')),
        rows('ordens de serviço', supabase.from('service_orders').select('*').eq('driver_id', driverId).order('created_at')),
        rows('notificações', supabase.from('notifications').select('*').eq('driver_id', driverId).order('created_at')),
        rows('termo de ciência', supabase.from('driver_terms_acceptances').select('*').eq('driver_id', driverId).order('accepted_at')),
        rows('trilha de auditoria', supabase.from('activity_log').select('created_at, action, entity_type, entity_label, source, ip, user_agent').eq('actor_id', driverId).order('created_at')),
    ]);

    const payload = {
        gerado_em: new Date().toISOString(),
        finalidade: 'Atendimento ao titular de dados (LGPD, art. 18, II). Cópia dos registros do motorista mantidos pela prefeitura no sistema de gestão de frota.',
        observacao: 'Pontos de GPS das viagens não foram incluídos individualmente (ver total em gps_pontos_total); fotos e documentos aparecem como caminho no armazenamento.',
        perfil: profile ?? null,
        termo_de_ciencia: terms,
        viagens: trips,
        paradas: stops,
        gps_pontos_total: locationsCount,
        checklists,
        abastecimentos: fuelings,
        ocorrencias: issues,
        ordens_de_servico: serviceOrders,
        notificacoes: notifications,
        acoes_registradas: activity,
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
}

export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
