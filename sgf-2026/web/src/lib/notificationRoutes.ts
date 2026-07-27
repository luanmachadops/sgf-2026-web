import type { NotificationRecord } from '@/lib/supabase-api';

type NotificationTarget = Partial<
    Pick<NotificationRecord, 'body' | 'entity_id' | 'entity_type' | 'link' | 'title'>
>;

export type PartnerNotificationPath = '/posto' | '/oficina';

const SERVICE_ORDER_TYPES = new Set([
    'maintenance',
    'manutencao',
    'service_order',
    'service_orders',
]);
const FUELING_TYPES = new Set(['abastecimento', 'fuel', 'fueling', 'refueling']);
const TRIP_TYPES = new Set(['trip', 'viagem']);
const CHECKLIST_TYPES = new Set(['checklist']);
const INFRACTION_TYPES = new Set(['infraction', 'infracao', 'multa']);
const DRIVER_TYPES = new Set(['cnh', 'driver', 'motorista', 'profile']);
const DEPARTMENT_TYPES = new Set(['department', 'secretaria']);
const VEHICLE_TYPES = new Set([
    'geofence',
    'movimento_sem_viagem',
    'speeding',
    'vehicle',
    'vehicle_idle',
    'veiculo',
]);
const STATION_TYPES = new Set(['fuel_station', 'posto', 'station']);
const WORKSHOP_TYPES = new Set(['oficina', 'repair_shop', 'workshop']);

function withQuery(path: string, search: string, key: string, value: string): string {
    const params = new URLSearchParams(search);
    params.set(key, value);
    const query = params.toString();
    return query ? `${path}?${query}` : path;
}

function matchEntityPath(path: string, aliases: readonly string[]): string | null {
    for (const alias of aliases) {
        const prefix = `${alias}/`;
        if (path.startsWith(prefix)) {
            const id = path.slice(prefix.length).split('/')[0]?.trim();
            if (id) return decodeURIComponent(id);
        }
    }
    return null;
}

/**
 * Converte links legados/ingleses para as rotas que realmente existem no
 * painel. Links externos são ignorados: notificações só podem navegar dentro
 * do SGF.
 */
function normalizeManagerLink(rawLink: string | null | undefined): string | null {
    const value = rawLink?.trim();
    if (!value?.startsWith('/')) return null;

    const url = new URL(value, 'https://sgf.local');
    const { pathname, search } = url;

    if (pathname === '/vehicle-details') {
        const vehicleId = url.searchParams.get('id');
        return vehicleId ? `/mapa?vehicleId=${encodeURIComponent(vehicleId)}` : '/veiculos';
    }
    if (pathname === '/map' || pathname.startsWith('/map/')) {
        return `${pathname.replace(/^\/map(?=\/|$)/, '/mapa')}${search}`;
    }

    const maintenanceId = matchEntityPath(pathname, [
        '/maintenance',
        '/maintenances',
        '/manutencoes',
    ]);
    if (maintenanceId) return withQuery('/manutencoes', search, 'id', maintenanceId);
    if (['/maintenance', '/maintenances'].includes(pathname)) return `/manutencoes${search}`;

    const fuelingId = matchEntityPath(pathname, [
        '/abastecimentos',
        '/fuel',
        '/fuelings',
        '/refuelings',
    ]);
    if (fuelingId) return withQuery('/abastecimentos', search, 'id', fuelingId);
    if (['/fuel', '/fuelings', '/refuelings'].includes(pathname)) return `/abastecimentos${search}`;

    const tripId = matchEntityPath(pathname, ['/trips', '/viagens']);
    if (tripId) return withQuery('/viagens', search, 'id', tripId);
    if (pathname === '/trips') return `/viagens${search}`;

    const checklistId = matchEntityPath(pathname, ['/checklists']);
    if (checklistId) return withQuery('/checklists', search, 'id', checklistId);

    const infractionId = matchEntityPath(pathname, ['/infractions', '/infracoes']);
    if (infractionId) return withQuery('/infracoes', search, 'id', infractionId);
    if (pathname === '/infractions') return `/infracoes${search}`;

    const vehicleId = matchEntityPath(pathname, ['/vehicles', '/veiculos']);
    if (vehicleId) return `/veiculos/${encodeURIComponent(vehicleId)}${search}`;
    if (pathname === '/vehicles') return `/veiculos${search}`;

    const driverId = matchEntityPath(pathname, ['/drivers', '/motoristas']);
    if (driverId) return `/motoristas/${encodeURIComponent(driverId)}${search}`;
    if (pathname === '/drivers') return `/motoristas${search}`;

    const departmentId = matchEntityPath(pathname, ['/departments', '/secretarias']);
    if (departmentId) return `/secretarias/${encodeURIComponent(departmentId)}${search}`;
    if (pathname === '/departments') return `/secretarias${search}`;

    if (pathname.startsWith('/reports')) return '/relatorios';
    return `${pathname}${search}`;
}

function isType(entityType: string, types: Set<string>): boolean {
    return types.has(entityType);
}

function getText(notification: NotificationTarget): { original: string; lower: string } {
    const original = `${notification.title ?? ''} ${notification.body ?? ''}`.trim();
    return { original, lower: original.toLowerCase() };
}

function extractPlate(text: string): string | null {
    const match = text.match(/[A-Z]{3}-?\d[A-Z0-9]\d{2}/i);
    return match ? match[0].replace('-', '').toUpperCase() : null;
}

/**
 * Resolve o destino do painel do gestor. Para entidades com modal, o ID da
 * notificação tem prioridade sobre links genéricos como `/manutencoes`.
 */
export function resolveNotificationRoute(notification: NotificationTarget): string {
    const entityType = notification.entity_type?.trim().toLowerCase() ?? '';
    const entityId = notification.entity_id?.trim() ?? '';
    const normalizedLink = normalizeManagerLink(notification.link);
    const text = getText(notification);
    const plate = extractPlate(text.original);

    if (entityId) {
        if (isType(entityType, SERVICE_ORDER_TYPES)) {
            return `/manutencoes?id=${encodeURIComponent(entityId)}`;
        }
        if (isType(entityType, FUELING_TYPES)) {
            return `/abastecimentos?id=${encodeURIComponent(entityId)}`;
        }
        if (isType(entityType, TRIP_TYPES)) {
            return `/viagens?id=${encodeURIComponent(entityId)}`;
        }
        if (isType(entityType, CHECKLIST_TYPES)) {
            return `/checklists?id=${encodeURIComponent(entityId)}`;
        }
        if (isType(entityType, INFRACTION_TYPES)) {
            return `/infracoes?id=${encodeURIComponent(entityId)}`;
        }
        if (isType(entityType, DRIVER_TYPES)) {
            return `/motoristas/${encodeURIComponent(entityId)}`;
        }
        if (isType(entityType, DEPARTMENT_TYPES)) {
            return `/secretarias/${encodeURIComponent(entityId)}`;
        }
        if (isType(entityType, VEHICLE_TYPES)) {
            return `/mapa?vehicleId=${encodeURIComponent(entityId)}`;
        }
        if (isType(entityType, STATION_TYPES)) {
            return `/postos/${encodeURIComponent(entityId)}`;
        }
        if (isType(entityType, WORKSHOP_TYPES)) {
            return `/oficinas/${encodeURIComponent(entityId)}`;
        }
        if (entityType === 'issue' && normalizedLink?.startsWith('/veiculos/')) {
            const url = new URL(normalizedLink, 'https://sgf.local');
            return withQuery(url.pathname, url.search, 'issueId', entityId);
        }
    }

    if (normalizedLink) return normalizedLink;

    if (
        text.lower.includes('manutenção')
        || text.lower.includes('manutencao')
        || text.lower.includes('oficina')
        || text.lower.includes('reparo')
        || text.lower.includes('avaria')
    ) {
        if (entityId) return `/manutencoes?id=${encodeURIComponent(entityId)}`;
        return plate ? `/manutencoes?search=${encodeURIComponent(plate)}` : '/manutencoes';
    }
    if (
        text.lower.includes('abastecimento')
        || text.lower.includes('combustível')
        || text.lower.includes('combustivel')
        || text.lower.includes('posto')
        || text.lower.includes('litro')
    ) {
        if (entityId) return `/abastecimentos?id=${encodeURIComponent(entityId)}`;
        return plate ? `/abastecimentos?search=${encodeURIComponent(plate)}` : '/abastecimentos';
    }
    if (text.lower.includes('viagem') || text.lower.includes('rota')) {
        if (entityId) return `/viagens?id=${encodeURIComponent(entityId)}`;
        return plate ? `/viagens?search=${encodeURIComponent(plate)}` : '/viagens';
    }
    if (text.lower.includes('checklist')) {
        if (entityId) return `/checklists?id=${encodeURIComponent(entityId)}`;
        return plate ? `/checklists?search=${encodeURIComponent(plate)}` : '/checklists';
    }
    if (
        text.lower.includes('infração')
        || text.lower.includes('infracao')
        || text.lower.includes('multa')
    ) {
        if (entityId) return `/infracoes?id=${encodeURIComponent(entityId)}`;
        return plate ? `/infracoes?search=${encodeURIComponent(plate)}` : '/infracoes';
    }
    if (text.lower.includes('cnh') || text.lower.includes('motorista')) {
        return entityId ? `/motoristas/${encodeURIComponent(entityId)}` : '/motoristas';
    }
    if (
        text.lower.includes('veículo')
        || text.lower.includes('veiculo')
        || text.lower.includes('placa')
        || text.lower.includes('movimento')
        || text.lower.includes('geofence')
        || text.lower.includes('velocidade')
    ) {
        if (entityId) return `/mapa?vehicleId=${encodeURIComponent(entityId)}`;
        return plate ? `/veiculos?search=${encodeURIComponent(plate)}` : '/veiculos';
    }

    if (plate) return `/veiculos?search=${encodeURIComponent(plate)}`;
    return '/mapa';
}

/**
 * Resolve o destino dentro dos portais dos parceiros e abre o registro
 * relacionado, em vez de devolver apenas a página inicial do portal.
 */
export function resolvePartnerNotificationRoute(
    notification: NotificationTarget,
    fallbackPath: PartnerNotificationPath,
): string {
    const entityType = notification.entity_type?.trim().toLowerCase() ?? '';
    const entityId = notification.entity_id?.trim() ?? '';
    const rawLink = notification.link?.trim();
    const internalLink = rawLink?.startsWith(fallbackPath)
        ? normalizeManagerLink(rawLink)
        : null;

    if (fallbackPath === '/oficina' && entityId && isType(entityType, SERVICE_ORDER_TYPES)) {
        return `/oficina/ordens?id=${encodeURIComponent(entityId)}`;
    }

    if (fallbackPath === '/posto' && entityId && isType(entityType, FUELING_TYPES)) {
        const historyNotification = internalLink?.startsWith('/posto/historico');
        const target = historyNotification ? '/posto/historico' : '/posto/autorizacoes';
        return `${target}?id=${encodeURIComponent(entityId)}`;
    }

    return internalLink ?? fallbackPath;
}
