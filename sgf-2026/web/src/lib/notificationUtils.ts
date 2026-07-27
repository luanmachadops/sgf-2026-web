import React from 'react';
import { toast } from 'sonner';
import { notificationsApi, type NotificationRecord } from '@/lib/supabase-api';
import {
    Car,
    User,
    GasPump,
    Wrench,
    CheckCircle,
    Route,
    Building2,
    AlertTriangle,
    Bell,
    ShieldCheck,
    MapPin,
} from '@/components/sgf/icons';

/**
 * Retorna o ícone e cores temáticas contextualizados de acordo com o assunto/entidade da notificação.
 */
export function getNotificationIcon(n: Partial<NotificationRecord>) {
    const entityType = n.entity_type?.toLowerCase();
    const textContent = `${n.title ?? ''} ${n.body ?? ''}`.toLowerCase();

    // 1. Abastecimentos / Posto / Combustível
    if (entityType === 'refueling' || entityType === 'abastecimento' || textContent.includes('abastecimento') || textContent.includes('combustível') || textContent.includes('posto') || textContent.includes('litro')) {
        return { Icon: GasPump, bg: 'bg-emerald-50 text-emerald-600 border border-emerald-200/60' };
    }

    // 2. Veículos / GPS / Movimentação / Rastreamento
    if (entityType === 'vehicle' || entityType === 'veiculo' || textContent.includes('veículo') || textContent.includes('placa') || textContent.includes('movimento') || textContent.includes('geofence') || textContent.includes('velocidade')) {
        if (textContent.includes('movimento') || textContent.includes('geofence') || textContent.includes('velocidade')) {
            return { Icon: MapPin, bg: 'bg-indigo-50 text-indigo-600 border border-indigo-200/60' };
        }
        return { Icon: Car, bg: 'bg-blue-50 text-blue-600 border border-blue-200/60' };
    }

    // 3. Motorista / CNH
    if (entityType === 'driver' || entityType === 'motorista' || textContent.includes('cnh') || textContent.includes('motorista')) {
        if (textContent.includes('cnh') || textContent.includes('venc') || textContent.includes('validade')) {
            return { Icon: ShieldCheck, bg: 'bg-amber-50 text-amber-600 border border-amber-200/60' };
        }
        return { Icon: User, bg: 'bg-slate-100 text-slate-700 border border-slate-200/60' };
    }

    // 4. Manutenção / Oficina
    if (entityType === 'maintenance' || entityType === 'manutencao' || entityType === 'issue' || entityType === 'service_order' || textContent.includes('manutenção') || textContent.includes('oficina') || textContent.includes('reparo')) {
        return { Icon: Wrench, bg: 'bg-rose-50 text-rose-600 border border-rose-200/60' };
    }

    // 5. Checklist
    if (entityType === 'checklist' || textContent.includes('checklist')) {
        return { Icon: CheckCircle, bg: 'bg-teal-50 text-teal-600 border border-teal-200/60' };
    }

    // 6. Viagens / Rota
    if (entityType === 'trip' || entityType === 'viagem' || textContent.includes('viagem') || textContent.includes('rota')) {
        return { Icon: Route, bg: 'bg-cyan-50 text-cyan-600 border border-cyan-200/60' };
    }

    // 7. Secretarias
    if (entityType === 'department' || entityType === 'secretaria') {
        return { Icon: Building2, bg: 'bg-purple-50 text-purple-600 border border-purple-200/60' };
    }

    // Fallbacks baseados na severidade (alert/warning/success/info)
    switch (n.type) {
        case 'alert':   return { Icon: AlertTriangle, bg: 'bg-rose-50 text-rose-600 border border-rose-200/60' };
        case 'warning': return { Icon: AlertTriangle, bg: 'bg-amber-50 text-amber-600 border border-amber-200/60' };
        case 'success': return { Icon: CheckCircle,   bg: 'bg-emerald-50 text-emerald-600 border border-emerald-200/60' };
        default:        return { Icon: Bell,          bg: 'bg-blue-50 text-blue-600 border border-blue-200/60' };
    }
}

export type NotificationGroup = {
    label: string;
    items: NotificationRecord[];
};

/**
 * Agrupa notificações por período de data ("Hoje", "Ontem", "20 de mai.", etc.)
 */
export function groupNotificationsByDate(notifications: NotificationRecord[]): NotificationGroup[] {
    const groupsMap = new Map<string, NotificationRecord[]>();

    const now = new Date();
    const todayStr = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStr = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();

    for (const item of notifications) {
        const itemDate = new Date(item.created_at);
        const itemDayStart = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate()).getTime();

        let label: string;
        if (itemDayStart === todayStr) {
            label = 'Hoje';
        } else if (itemDayStart === yesterdayStr) {
            label = 'Ontem';
        } else {
            const formatted = itemDate.toLocaleDateString('pt-BR', {
                day: 'numeric',
                month: 'short',
            });
            // capitaliza primeira letra do mês (ex: "20 de mai.")
            label = formatted;
        }

        if (!groupsMap.has(label)) {
            groupsMap.set(label, []);
        }
        groupsMap.get(label)!.push(item);
    }

    return Array.from(groupsMap.entries()).map(([label, items]) => ({
        label,
        items,
    }));
}

/**
 * Resolve a rota de destino em português com base no link, tipo de entidade ou conteúdo da notificação.
 */
export function resolveNotificationRoute(n: Partial<NotificationRecord>): string {
    const rawLink = n.link?.trim();

    if (rawLink) {
        // Normaliza rotas que usam /map em vez de /mapa
        if (rawLink.startsWith('/map')) {
            return rawLink.replace(/^\/map/, '/mapa');
        }
        if (rawLink.includes('/vehicle-details')) {
            const match = rawLink.match(/id=([^&]+)/);
            if (match) return `/mapa?vehicleId=${match[1]}`;
            return '/veiculos';
        }
        if (rawLink.startsWith('/vehicles/')) {
            const id = rawLink.replace('/vehicles/', '');
            return `/veiculos/${id}`;
        }
        if (rawLink === '/vehicles') return '/veiculos';
        if (rawLink.startsWith('/drivers/')) {
            const id = rawLink.replace('/drivers/', '');
            return `/motoristas/${id}`;
        }
        if (rawLink === '/drivers') return '/motoristas';
        if (rawLink.startsWith('/trips')) return rawLink.replace('/trips', '/viagens');
        if (rawLink.startsWith('/refuelings') || rawLink.startsWith('/fuel')) return rawLink.replace(/^\/(refuelings|fuel)/, '/abastecimentos');
        if (rawLink.startsWith('/maintenances') || rawLink.startsWith('/maintenance')) return rawLink.replace(/^\/(maintenances|maintenance)/, '/manutencoes');
        if (rawLink.startsWith('/checklists')) return '/checklists';
        if (rawLink.startsWith('/departments')) return rawLink.replace('/departments', '/secretarias');
        if (rawLink.startsWith('/reports')) return '/relatorios';

        if (rawLink.startsWith('/')) {
            return rawLink;
        }
    }

    const entityType = n.entity_type?.toLowerCase() ?? '';
    const entityId = n.entity_id?.trim() ?? '';
    const textContent = `${n.title ?? ''} ${n.body ?? ''}`;
    const textLower = textContent.toLowerCase();

    // Extrai placa do título/corpo caso esteja no formato de placa brasileira (ex: UBJ4C93, ABC-1234)
    const plateMatch = textContent.match(/[A-Z]{3}-?\d[A-Z0-9]\d{2}/i);
    const extractedPlate = plateMatch ? plateMatch[0].replace('-', '').toUpperCase() : null;

    // 1. Manutenção / Ordem de Serviço / Oficina / Avaria
    if (
        entityType === 'maintenance' ||
        entityType === 'manutencao' ||
        entityType === 'issue' ||
        entityType === 'service_order' ||
        entityType === 'service_orders' ||
        textLower.includes('manutenção') ||
        textLower.includes('manutencao') ||
        textLower.includes('oficina') ||
        textLower.includes('reparo') ||
        textLower.includes('avaria')
    ) {
        if (entityId) return `/manutencoes?id=${entityId}`;
        if (extractedPlate) return `/manutencoes?search=${extractedPlate}`;
        return '/manutencoes';
    }

    // 2. Abastecimentos / Posto / Combustível
    if (
        entityType === 'refueling' ||
        entityType === 'abastecimento' ||
        entityType === 'fuel' ||
        entityType === 'station' ||
        textLower.includes('abastecimento') ||
        textLower.includes('combustível') ||
        textLower.includes('combustivel') ||
        textLower.includes('posto') ||
        textLower.includes('litro')
    ) {
        if (entityId) return `/abastecimentos?id=${entityId}`;
        if (extractedPlate) return `/abastecimentos?search=${extractedPlate}`;
        return '/abastecimentos';
    }

    // 3. Viagens / Rotas
    if (
        entityType === 'trip' ||
        entityType === 'viagem' ||
        textLower.includes('viagem') ||
        textLower.includes('rota')
    ) {
        if (entityId) return `/viagens?id=${entityId}`;
        if (extractedPlate) return `/viagens?search=${extractedPlate}`;
        return '/viagens';
    }

    // 4. Checklist
    if (
        entityType === 'checklist' ||
        textLower.includes('checklist')
    ) {
        if (entityId) return `/checklists?id=${entityId}`;
        if (extractedPlate) return `/checklists?search=${extractedPlate}`;
        return '/checklists';
    }

    // 5. Motorista / CNH
    if (
        entityType === 'driver' ||
        entityType === 'motorista' ||
        textLower.includes('cnh') ||
        textLower.includes('motorista')
    ) {
        return entityId ? `/motoristas/${entityId}` : '/motoristas';
    }

    // 6. Infração / Multa
    if (
        entityType === 'infraction' ||
        entityType === 'infracao' ||
        entityType === 'multa' ||
        textLower.includes('infração') ||
        textLower.includes('infracao') ||
        textLower.includes('multa')
    ) {
        if (entityId) return `/infracoes?id=${entityId}`;
        if (extractedPlate) return `/infracoes?search=${extractedPlate}`;
        return '/infracoes';
    }

    // 7. Secretarias
    if (
        entityType === 'department' ||
        entityType === 'secretaria'
    ) {
        return entityId ? `/secretarias/${entityId}` : '/secretarias';
    }

    // 8. Veículos / Movimentação / GPS
    if (
        entityType === 'vehicle' ||
        entityType === 'veiculo' ||
        textLower.includes('veículo') ||
        textLower.includes('veiculo') ||
        textLower.includes('placa') ||
        textLower.includes('movimento') ||
        textLower.includes('geofence') ||
        textLower.includes('velocidade')
    ) {
        if (entityId) return `/mapa?vehicleId=${entityId}`;
        if (extractedPlate) return `/veiculos?search=${extractedPlate}`;
        return '/veiculos';
    }

    // Fallback padrão com ID ou mapa
    if (entityId) return `/mapa?vehicleId=${entityId}`;
    if (extractedPlate) return `/veiculos?search=${extractedPlate}`;
    return '/mapa';
}

/**
 * Dispara um toast instantâneo clicável na tela que leva à rota do assunto ao ser clicado em qualquer lugar.
 */
export function showClickableNotification(
    n: NotificationRecord,
    navigate: (route: string) => void,
    onMarkRead?: (id: string) => void
) {
    const route = resolveNotificationRoute(n);

    const handleNavigate = () => {
        if (n.id && onMarkRead) {
            onMarkRead(n.id);
        } else if (n.id) {
            notificationsApi.markRead(n.id).catch(() => {});
        }
        navigate(route);
    };

    toast.custom((t) => {
        const { Icon, bg } = getNotificationIcon(n);

        return React.createElement(
            'div',
            {
                onClick: () => {
                    toast.dismiss(t);
                    handleNavigate();
                },
                className:
                    'group relative flex w-full max-w-sm cursor-pointer items-start gap-3 rounded-2xl border border-amber-500/30 bg-[#0F2B2F] p-4 text-white shadow-2xl transition-all hover:scale-[1.02] active:scale-[0.98]',
            },
            React.createElement(
                'button',
                {
                    type: 'button',
                    onClick: (e: React.MouseEvent) => {
                        e.stopPropagation();
                        toast.dismiss(t);
                    },
                    className:
                        'absolute -top-2 -left-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-amber-300 border border-amber-500/40 hover:bg-black hover:text-white transition-colors',
                },
                React.createElement('span', { className: 'text-xs font-bold leading-none' }, '✕')
            ),
            React.createElement(
                'div',
                { className: `mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${bg}` },
                React.createElement(Icon, { className: 'h-4.5 w-4.5' })
            ),
            React.createElement(
                'div',
                { className: 'min-w-0 flex-1 pr-1' },
                React.createElement(
                    'p',
                    { className: 'text-xs font-bold text-amber-400 group-hover:text-amber-300 transition-colors' },
                    n.title
                ),
                n.body
                    ? React.createElement(
                          'p',
                          { className: 'mt-1 text-xs text-slate-200 leading-snug' },
                          n.body
                      )
                    : null
            )
        );
    }, { duration: 8000 });
}


