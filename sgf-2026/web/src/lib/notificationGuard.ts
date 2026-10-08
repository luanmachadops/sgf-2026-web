import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { NotificationRecord } from '@/lib/supabase-api';

type Target = Pick<NotificationRecord, 'entity_type' | 'entity_id'> & Partial<Pick<NotificationRecord, 'title'>>;

type Check = { table: string; select: string; stale?: (row: Record<string, unknown>) => string | null };

/**
 * Notificação é a foto do momento em que foi criada. Antes de abrir o destino,
 * confere se o assunto ainda existe e se ainda está no estado que a
 * notificação descreve (viagem aberta, autorização válida, OS ativa…).
 */
const CHECKS: Record<string, Check> = {
    trip: { table: 'trips', select: 'id, status', stale: (r) => (r.status !== 'andamento' ? 'Essa viagem já foi encerrada. Abrindo o resumo dela.' : null) },
    trip_close: { table: 'trips', select: 'id, status', stale: (r) => (r.status !== 'andamento' ? 'Essa viagem já foi encerrada. Abrindo o resumo dela.' : null) },
    viagem: { table: 'trips', select: 'id, status', stale: (r) => (r.status !== 'andamento' ? 'Essa viagem já foi encerrada. Abrindo o resumo dela.' : null) },
    service_order: { table: 'service_orders', select: 'id, operational_status', stale: (r) => (r.operational_status === 'cancelled' ? 'Essa ordem de serviço foi cancelada.' : null) },
    service_orders: { table: 'service_orders', select: 'id, operational_status', stale: (r) => (r.operational_status === 'cancelled' ? 'Essa ordem de serviço foi cancelada.' : null) },
    maintenance: { table: 'service_orders', select: 'id, operational_status', stale: (r) => (r.operational_status === 'cancelled' ? 'Essa ordem de serviço foi cancelada.' : null) },
    manutencao: { table: 'service_orders', select: 'id, operational_status', stale: (r) => (r.operational_status === 'cancelled' ? 'Essa ordem de serviço foi cancelada.' : null) },
    fueling: { table: 'fuelings', select: 'id, workflow_status, cancelled_at, expires_at', stale: fuelingStale },
    refueling: { table: 'fuelings', select: 'id, workflow_status, cancelled_at, expires_at', stale: fuelingStale },
    abastecimento: { table: 'fuelings', select: 'id, workflow_status, cancelled_at, expires_at', stale: fuelingStale },
    fuel: { table: 'fuelings', select: 'id, workflow_status, cancelled_at, expires_at', stale: fuelingStale },
    vehicle: { table: 'vehicles', select: 'id' },
    veiculo: { table: 'vehicles', select: 'id' },
    driver: { table: 'profiles', select: 'id, archived_at', stale: (r) => (r.archived_at ? 'Esse motorista foi removido; o histórico continua disponível.' : null) },
    motorista: { table: 'profiles', select: 'id, archived_at', stale: (r) => (r.archived_at ? 'Esse motorista foi removido; o histórico continua disponível.' : null) },
    fuel_station: { table: 'fuel_stations', select: 'id' },
    station: { table: 'fuel_stations', select: 'id' },
    posto: { table: 'fuel_stations', select: 'id' },
    repair_shop: { table: 'repair_shops', select: 'id' },
    oficina: { table: 'repair_shops', select: 'id' },
    workshop: { table: 'repair_shops', select: 'id' },
};

function fuelingStale(r: Record<string, unknown>): string | null {
    if (r.cancelled_at) return 'Essa autorização de abastecimento foi cancelada ou venceu.';
    if (r.workflow_status === 'autorizado' && r.expires_at && new Date(String(r.expires_at)) <= new Date()) {
        return 'Essa autorização de abastecimento venceu.';
    }
    return null;
}

/**
 * Resultado: `missing` quando o assunto não existe mais (não navegar),
 * `stale` com o aviso quando mudou (navegar avisando), `ok` caso contrário.
 */
export async function checkNotificationTarget(n: Target): Promise<{ state: 'ok' } | { state: 'missing' } | { state: 'stale'; message: string }> {
    const check = CHECKS[(n.entity_type ?? '').toLowerCase()];
    if (!check || !n.entity_id) return { state: 'ok' };
    try {
        const { data, error } = await supabase.from(check.table as never).select(check.select).eq('id', n.entity_id).maybeSingle();
        if (error) return { state: 'ok' }; // sem permissão/rede: deixa a tela tratar
        if (!data) return { state: 'missing' };
        const message = check.stale?.(data as Record<string, unknown>);
        return message ? { state: 'stale', message } : { state: 'ok' };
    } catch {
        return { state: 'ok' };
    }
}

/**
 * Abre o destino de uma notificação já conferido. Assunto removido: avisa e
 * fica onde está. Assunto que mudou: avisa e abre (o histórico continua
 * útil), ou abre `staleRoute` quando a tela original não faz mais sentido.
 */
export async function openNotification(
    n: Target,
    route: string,
    navigate: (to: string) => void,
    staleRoute?: string,
): Promise<void> {
    const result = await checkNotificationTarget(n);
    if (result.state === 'missing') {
        toast.info('Esse item não está mais disponível.');
        return;
    }
    if (result.state === 'stale') {
        toast.info(result.message);
        navigate(staleRoute ?? route);
        return;
    }
    navigate(route);
}
