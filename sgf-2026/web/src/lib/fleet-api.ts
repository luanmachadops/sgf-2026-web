/**
 * API da classificacao da frota (vinculo, centros de custo, contratos de locacao)
 * e da manutencao preventiva (planos + status). Tudo via PostgREST sob RLS.
 */
import { supabase } from './supabase';
import type { Enums, Tables, TablesInsert, TablesUpdate } from '@/types/database.types';

export type VehicleOwnership = Enums<'vehicle_ownership'>;
export type CostCenter = Tables<'cost_centers'> & { departments: { id: string; name: string } | null };
export type RentalContract = Tables<'vehicle_rental_contracts'>;
export type MaintenancePlan = Tables<'maintenance_plans'>;
export type MaintenancePlanStatus = Tables<'maintenance_plan_status'>;
export type PlanStatusKey = 'em_dia' | 'proximo' | 'vencido' | 'sem_base';

export const OWNERSHIP_OPTIONS: Array<{ value: VehicleOwnership; label: string }> = [
    { value: 'proprio', label: 'Próprio' },
    { value: 'locado', label: 'Locado' },
    { value: 'cedido', label: 'Cedido' },
    { value: 'comodato', label: 'Comodato' },
];

export function ownershipLabel(value: string | null | undefined): string {
    return OWNERSHIP_OPTIONS.find((o) => o.value === value)?.label ?? 'Próprio';
}

export const SERVICE_SUGGESTIONS = [
    'Troca de óleo',
    'Rodízio de pneus',
    'Revisão',
    'Filtro de ar',
    'Filtro de combustível',
    'Correia dentada',
    'Alinhamento e balanceamento',
];

/** Chave técnica do serviço: minúsculas, sem acento, só [a-z0-9_]. */
export function serviceTypeFromLabel(label: string): string {
    return label
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

export const PLAN_STATUS_META: Record<PlanStatusKey, { label: string; variant: 'success' | 'warning' | 'error' | 'default' }> = {
    em_dia: { label: 'Em dia', variant: 'success' },
    proximo: { label: 'Próximo', variant: 'warning' },
    vencido: { label: 'Vencido', variant: 'error' },
    sem_base: { label: 'Sem base', variant: 'default' },
};

export function planStatusKey(status: string | null | undefined): PlanStatusKey {
    return status === 'em_dia' || status === 'proximo' || status === 'vencido' ? status : 'sem_base';
}

/** Texto de "quanto falta" para km e dias, conforme o que o plano controla. */
export function describeRemaining(plan: MaintenancePlanStatus): string[] {
    const parts: string[] = [];
    if (plan.interval_km != null) {
        if (plan.km_remaining == null) parts.push('km: sem base');
        else if (plan.km_remaining <= 0) parts.push(`vencido há ${Math.abs(plan.km_remaining).toLocaleString('pt-BR')} km`);
        else parts.push(`faltam ${plan.km_remaining.toLocaleString('pt-BR')} km`);
    }
    if (plan.interval_days != null) {
        if (plan.days_remaining == null) parts.push('dias: sem base');
        else if (plan.days_remaining <= 0) parts.push(`vencido há ${Math.abs(plan.days_remaining)} dia(s)`);
        else parts.push(`faltam ${plan.days_remaining} dia(s)`);
    }
    return parts;
}

function fail(error: { message: string }): never {
    throw new Error(error.message);
}

export const costCentersApi = {
    getAll: async (): Promise<CostCenter[]> => {
        const { data, error } = await supabase
            .from('cost_centers')
            .select('*, departments(id, name)')
            .order('code', { ascending: true });
        if (error) fail(error);
        return (data ?? []) as CostCenter[];
    },
    create: async (input: Pick<TablesInsert<'cost_centers'>, 'code' | 'name' | 'department_id'>): Promise<void> => {
        const { error } = await supabase.from('cost_centers').insert(input);
        if (error) {
            if (error.code === '23505') throw new Error('Já existe um centro de custo com este código.');
            fail(error);
        }
    },
    update: async (id: string, patch: TablesUpdate<'cost_centers'>): Promise<void> => {
        const { error } = await supabase.from('cost_centers').update(patch).eq('id', id);
        if (error) {
            if (error.code === '23505') throw new Error('Já existe um centro de custo com este código.');
            fail(error);
        }
    },
};

export const rentalContractsApi = {
    getByVehicle: async (vehicleId: string): Promise<RentalContract[]> => {
        const { data, error } = await supabase
            .from('vehicle_rental_contracts')
            .select('*')
            .eq('vehicle_id', vehicleId)
            .order('start_date', { ascending: false });
        if (error) fail(error);
        return data ?? [];
    },
    create: async (input: Omit<TablesInsert<'vehicle_rental_contracts'>, 'tenant_id' | 'created_by' | 'ended_at' | 'ended_reason'>): Promise<void> => {
        const { error } = await supabase.from('vehicle_rental_contracts').insert(input);
        if (error) fail(error);
    },
    end: async (id: string, reason: string): Promise<void> => {
        const { error } = await supabase
            .from('vehicle_rental_contracts')
            .update({ ended_at: new Date().toISOString(), ended_reason: reason.trim() })
            .eq('id', id);
        if (error) fail(error);
    },
};

export interface MaintenancePlanInput {
    vehicleId: string;
    serviceLabel: string;
    intervalKm: number | null;
    intervalDays: number | null;
    warnPct: number;
    lastDoneKm: number | null;
    lastDoneAt: string | null;
}

export const maintenancePlansApi = {
    /** Planos de um veículo (inclui inativos) já com status calculado. */
    getByVehicle: async (vehicleId: string): Promise<MaintenancePlanStatus[]> => {
        const { data, error } = await supabase
            .from('maintenance_plan_status')
            .select('*')
            .eq('vehicle_id', vehicleId)
            .order('service_label', { ascending: true });
        if (error) fail(error);
        return data ?? [];
    },
    /** Planos ativos da frota toda. */
    getActive: async (): Promise<MaintenancePlanStatus[]> => {
        const { data, error } = await supabase
            .from('maintenance_plan_status')
            .select('*')
            .eq('active', true);
        if (error) fail(error);
        return data ?? [];
    },
    create: async (input: MaintenancePlanInput): Promise<void> => {
        const { error } = await supabase.from('maintenance_plans').insert({
            vehicle_id: input.vehicleId,
            service_type: serviceTypeFromLabel(input.serviceLabel),
            service_label: input.serviceLabel.trim(),
            interval_km: input.intervalKm,
            interval_days: input.intervalDays,
            warn_pct: input.warnPct,
            last_done_km: input.lastDoneKm,
            last_done_at: input.lastDoneAt,
        });
        if (error) {
            if (error.code === '23505') throw new Error('Este veículo já tem um plano ativo para este serviço.');
            fail(error);
        }
    },
    update: async (id: string, input: Omit<MaintenancePlanInput, 'vehicleId'>): Promise<void> => {
        const { error } = await supabase.from('maintenance_plans').update({
            service_type: serviceTypeFromLabel(input.serviceLabel),
            service_label: input.serviceLabel.trim(),
            interval_km: input.intervalKm,
            interval_days: input.intervalDays,
            warn_pct: input.warnPct,
            last_done_km: input.lastDoneKm,
            last_done_at: input.lastDoneAt,
        }).eq('id', id);
        if (error) {
            if (error.code === '23505') throw new Error('Este veículo já tem um plano ativo para este serviço.');
            fail(error);
        }
    },
    setActive: async (id: string, active: boolean): Promise<void> => {
        const { error } = await supabase.from('maintenance_plans').update({ active }).eq('id', id);
        if (error) {
            if (error.code === '23505') throw new Error('Já existe outro plano ativo para este serviço neste veículo.');
            fail(error);
        }
    },
    /**
     * Abre uma OS preventiva a partir do plano. A RPC manager_create_service_order
     * não recebe maintenance_plan_id nem origin, então: cria pela RPC e em seguida
     * marca origin='preventiva' + maintenance_plan_id (gestor/admin têm UPDATE).
     */
    openServiceOrder: async (plan: MaintenancePlanStatus): Promise<string> => {
        if (!plan.plan_id || !plan.vehicle_id) throw new Error('Plano inválido.');
        const label = plan.service_label ?? 'Manutenção preventiva';
        const priority = plan.status === 'vencido' ? 'alta' : 'media';
        const { data: orderId, error } = await supabase.rpc('manager_create_service_order', {
            p_vehicle_id: plan.vehicle_id,
            p_driver_id: null as unknown as string,
            p_category: label,
            p_priority: priority,
            p_description: `Manutenção preventiva: ${label}.`,
            p_odometer: plan.current_odometer ?? undefined,
        });
        if (error) fail(error);
        const { error: linkError } = await supabase
            .from('service_orders')
            .update({ origin: 'preventiva', maintenance_plan_id: plan.plan_id })
            .eq('id', orderId);
        if (linkError) {
            throw new Error(`OS criada, mas não foi possível vinculá-la ao plano: ${linkError.message}`);
        }
        return orderId;
    },
    /** Planos ativos que têm OS aberta (para não duplicar o "Abrir OS"). */
    getOpenOrderPlanIds: async (): Promise<Set<string>> => {
        const { data, error } = await supabase
            .from('service_orders')
            .select('maintenance_plan_id, status')
            .not('maintenance_plan_id', 'is', null)
            .not('status', 'in', '(concluida,rejeitada)');
        if (error) fail(error);
        return new Set((data ?? []).map((r) => r.maintenance_plan_id as string));
    },
};
