import { supabase } from './supabase';
import type { Tables } from '@/types/database.types';

// ═══════════════════════════════════════════════════════════════════════
// Alertas de controle: expediente, feriados, autorização fora do horário
// e tolerâncias por prefeitura. RLS limita tudo ao tenant do usuário.
// ═══════════════════════════════════════════════════════════════════════

export type WorkSchedule = Tables<'work_schedules'>;
export type Holiday = Tables<'holidays'>;
export type OffHoursAuthorization = Tables<'off_hours_authorizations'>;

export const MIN_REASON_LENGTH = 10;

export const WEEKDAY_LABELS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'] as const;

function fail(error: { message: string }): never {
    throw new Error(error.message);
}

// ── Tolerâncias e chaves (tabela tenants) ───────────────────────────────
export interface AlertSettings {
    tenantId: string;
    kmGapTolerance: number;
    consumptionTolerancePct: number;
    requireTripPurpose: boolean;
    autoPreventiveOs: boolean;
}

const SETTINGS_COLS = 'id, km_gap_tolerance, consumption_tolerance_pct, require_trip_purpose, auto_preventive_os';

type AlertSettingsPatch = Partial<Omit<AlertSettings, 'tenantId'>>;

function mapSettings(row: Pick<Tables<'tenants'>, 'id' | 'km_gap_tolerance' | 'consumption_tolerance_pct' | 'require_trip_purpose' | 'auto_preventive_os'>): AlertSettings {
    return {
        tenantId: row.id,
        kmGapTolerance: row.km_gap_tolerance,
        consumptionTolerancePct: row.consumption_tolerance_pct,
        requireTripPurpose: row.require_trip_purpose,
        autoPreventiveOs: row.auto_preventive_os,
    };
}

export const alertSettingsApi = {
    get: async (): Promise<AlertSettings | null> => {
        const { data, error } = await supabase.from('tenants').select(SETTINGS_COLS).limit(1).maybeSingle();
        if (error) fail(error);
        return data ? mapSettings(data) : null;
    },

    update: async (tenantId: string, patch: AlertSettingsPatch): Promise<AlertSettings> => {
        const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (patch.kmGapTolerance !== undefined) payload.km_gap_tolerance = patch.kmGapTolerance;
        if (patch.consumptionTolerancePct !== undefined) payload.consumption_tolerance_pct = patch.consumptionTolerancePct;
        if (patch.requireTripPurpose !== undefined) payload.require_trip_purpose = patch.requireTripPurpose;
        if (patch.autoPreventiveOs !== undefined) payload.auto_preventive_os = patch.autoPreventiveOs;
        const { data, error } = await supabase.from('tenants').update(payload).eq('id', tenantId).select(SETTINGS_COLS).single();
        if (error) fail(error);
        return mapSettings(data);
    },
};

// ── Expediente ──────────────────────────────────────────────────────────
export interface ScheduleDay {
    weekday: number;
    active: boolean;
    /** HH:mm */
    start: string;
    end: string;
}

export const DEFAULT_SCHEDULE_DAYS: ScheduleDay[] = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    active: weekday >= 1 && weekday <= 5,
    start: '08:00',
    end: '17:00',
}));

const hhmm = (t: string) => t.slice(0, 5);

/** Converte as linhas de um escopo na grade de 7 dias. */
export function scheduleRowsToDays(rows: WorkSchedule[]): ScheduleDay[] {
    return DEFAULT_SCHEDULE_DAYS.map((d) => {
        const row = rows.find((r) => r.weekday === d.weekday);
        return row ? { weekday: d.weekday, active: true, start: hhmm(row.start_time), end: hhmm(row.end_time) } : { ...d, active: false };
    });
}

export const workSchedulesApi = {
    list: async (): Promise<WorkSchedule[]> => {
        const { data, error } = await supabase.from('work_schedules').select('*').order('weekday');
        if (error) fail(error);
        return data ?? [];
    },

    /** Substitui a grade do escopo (departmentId nulo = padrão da prefeitura). Grade vazia remove o escopo. */
    replace: async (departmentId: string | null, days: ScheduleDay[]): Promise<void> => {
        for (const d of days) {
            if (d.active && d.end <= d.start) {
                throw new Error(`${WEEKDAY_LABELS[d.weekday]}: o fim do expediente deve ser depois do início.`);
            }
        }
        const del = supabase.from('work_schedules').delete();
        const { error: delError } = await (departmentId ? del.eq('department_id', departmentId) : del.is('department_id', null));
        if (delError) fail(delError);
        const rows = days.filter((d) => d.active).map((d) => ({
            department_id: departmentId,
            weekday: d.weekday,
            start_time: d.start,
            end_time: d.end,
        }));
        if (rows.length === 0) return;
        const { error } = await supabase.from('work_schedules').insert(rows);
        if (error) fail(error);
    },
};

// ── Feriados ────────────────────────────────────────────────────────────
export const holidaysApi = {
    list: async (): Promise<Holiday[]> => {
        const { data, error } = await supabase.from('holidays').select('*').order('date');
        if (error) fail(error);
        return data ?? [];
    },

    add: async (date: string, description: string): Promise<void> => {
        const { error } = await supabase.from('holidays').insert({ date, description: description.trim() });
        if (error) {
            if (error.code === '23505') throw new Error('Já existe um feriado cadastrado nesta data.');
            fail(error);
        }
    },

    remove: async (id: string): Promise<void> => {
        const { error } = await supabase.from('holidays').delete().eq('id', id);
        if (error) fail(error);
    },
};

// ── Autorizações fora do horário ────────────────────────────────────────
export type AuthorizationState = 'vigente' | 'futura' | 'expirada' | 'revogada';

export interface OffHoursAuthorizationRow extends OffHoursAuthorization {
    vehicles: { plate: string | null; brand: string | null; model: string | null } | null;
    driver: { full_name: string | null } | null;
    authorizer: { full_name: string | null } | null;
}

export function authorizationState(a: Pick<OffHoursAuthorization, 'revoked_at' | 'valid_from' | 'valid_to'>, now = Date.now()): AuthorizationState {
    if (a.revoked_at) return 'revogada';
    if (new Date(a.valid_to).getTime() < now) return 'expirada';
    if (new Date(a.valid_from).getTime() > now) return 'futura';
    return 'vigente';
}

export interface CreateAuthorizationInput {
    vehicleId: string;
    driverId: string | null;
    validFrom: string;
    validTo: string;
    reason: string;
}

export const offHoursAuthorizationsApi = {
    list: async (): Promise<OffHoursAuthorizationRow[]> => {
        const { data, error } = await supabase
            .from('off_hours_authorizations')
            .select('*, vehicles(plate, brand, model), driver:profiles!off_hours_authorizations_driver_id_fkey(full_name), authorizer:profiles!off_hours_authorizations_authorized_by_fkey(full_name)')
            .order('valid_from', { ascending: false });
        if (error) fail(error);
        return (data ?? []) as unknown as OffHoursAuthorizationRow[];
    },

    create: async (input: CreateAuthorizationInput): Promise<void> => {
        const reason = input.reason.trim();
        if (reason.length < MIN_REASON_LENGTH) throw new Error(`Informe o motivo (mínimo ${MIN_REASON_LENGTH} caracteres).`);
        if (new Date(input.validTo) <= new Date(input.validFrom)) throw new Error('O fim da vigência deve ser depois do início.');
        const { error } = await supabase.from('off_hours_authorizations').insert({
            vehicle_id: input.vehicleId,
            driver_id: input.driverId,
            valid_from: input.validFrom,
            valid_to: input.validTo,
            reason,
        });
        if (error) fail(error);
    },

    revoke: async (id: string, reason: string): Promise<void> => {
        const trimmed = reason.trim();
        if (trimmed.length < MIN_REASON_LENGTH) throw new Error(`Informe o motivo (mínimo ${MIN_REASON_LENGTH} caracteres).`);
        const { error } = await supabase
            .from('off_hours_authorizations')
            .update({ revoked_at: new Date().toISOString(), revoke_reason: trimmed })
            .eq('id', id)
            .is('revoked_at', null);
        if (error) fail(error);
    },
};

// ── Selos de alerta (viagens e abastecimentos) ──────────────────────────
export interface TripAlertFlags {
    odometerGapKm: number | null;
    offHours: boolean;
    offHoursAuthorizationId: string | null;
}

export interface TripAlertBadge {
    key: string;
    variant: 'warning' | 'error' | 'info';
    label: string;
}

const kmFmt = (n: number) => Math.abs(n).toLocaleString('pt-BR');

export function tripAlertBadges(flags: TripAlertFlags): TripAlertBadge[] {
    const badges: TripAlertBadge[] = [];
    const gap = flags.odometerGapKm ?? 0;
    if (gap > 0) badges.push({ key: 'gap', variant: 'warning', label: `Km sem registro: +${kmFmt(gap)} km` });
    if (gap < 0) badges.push({ key: 'regress', variant: 'error', label: `Hodômetro regressivo: −${kmFmt(gap)} km` });
    if (flags.offHours) {
        badges.push(flags.offHoursAuthorizationId
            ? { key: 'off-auth', variant: 'info', label: 'Autorizada fora do horário' }
            : { key: 'off', variant: 'warning', label: 'Fora do expediente' });
    }
    return badges;
}

export function hasTripAlert(flags: TripAlertFlags): boolean {
    return (flags.odometerGapKm ?? 0) !== 0 || flags.offHours;
}

export function hasLowConsumption(anomalyType: string | null | undefined): boolean {
    return Boolean(anomalyType && anomalyType.split(';').some((p) => p.trim() === 'consumo_baixo'));
}
