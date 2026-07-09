/**
 * Supabase Direct API Layer
 * Replaces the old Axios-based api.ts with direct Supabase queries.
 * All queries go through PostgREST and respect RLS policies.
 */

import { supabase } from './supabase';
import { optimizeImage, IMAGE_PRESETS } from './imageUtils';
import type { Enums, Tables, TablesInsert, TablesUpdate } from '@/types/database.types';
import type { VehicleStatus, DriverStatus, TripStatus, MaintenanceStatus } from '@/types';
import {
    webToDbVehicleStatus,
    webToDbDriverStatus,
    webToDbTripStatus,
    webToDbMaintenanceStatus,
    webToDbFuelType,
    dbToWebTripStatus,
    dbToWebMaintenanceStatus,
    dbCategoryToWebTypeCategory,
    webUrgencyToDbPriority,
} from './db-mapping';

// "Driver" no banco unificado = profile com role='motorista'.
// Apelidamos as colunas para preservar o que o resto do web já espera.
export type DriverRecord = Tables<'profiles'> & {
    departments?: { id: string; name: string } | null;
    // aliases retro-compatíveis (preenchidos via decorateDriver na camada de API)
    name?: string;
    cnh_expiry_date?: string | null;
    // status já mapeado para o enum EN que o web usa (ACTIVE|INACTIVE|SUSPENDED).
    status?: DriverStatus;
    // No banco unificado profile.id === auth.users.id; exposto como user_id por compat.
    user_id?: string;
};

export type VehicleRecord = Omit<Tables<'vehicles'>, 'status'> & {
    // status já mapeado para o enum EN que o web usa (AVAILABLE|IN_USE|MAINTENANCE|INACTIVE).
    status: VehicleStatus;
    departments?: { id: string; name: string } | null;
};

// Trip decorada pela camada de API: status em EN + aliases de colunas (start_time/end_time/...).
export type TripRecord = Omit<Tables<'trips'>, 'status'> & {
    status: TripStatus;
    start_time: string;
    end_time: string | null;
    actual_distance_km: number | null;
    has_anomaly: boolean;
    vehicles?: { id: string; plate: string; brand: string; model: string; photo_url: string | null } | null;
    drivers?: { id: string; name: string; photo_url: string | null } | null;
};

// Fueling decorada pela camada de API: aliases date/supplier_name + relações.
export type RefuelingRecord = Tables<'fuelings'> & {
    date: string;
    supplier_name: string;
    drivers?: { id: string; name: string; photo_url: string | null } | null;
    station_relation?: { id: string; name: string; code: string | null } | null;
};

export interface DepartmentOverview {
    id: string;
    name: string;
    code: string;
    vehicleCount: number;
    availableVehicles: number;
    activeVehicles: number;
    maintenanceVehicles: number;
    driverCount: number;
    activeDrivers: number;
    totalTrips: number;
    totalTripKm: number;
    fuelCost: number;
    fuelLiters: number;
    avgKmPerLiter: number;
    maintenanceCost: number;
    maintenanceCount: number;
    pendingMaintenances: number;
    anomalyCount: number;
    lastActivityAt: string | null;
}

export interface DepartmentMonthlyFuelPoint {
    month: string;
    totalCost: number;
    liters: number;
}

export interface DepartmentMonthlyTripPoint {
    month: string;
    totalKm: number;
    trips: number;
}

export interface DepartmentFuelTypePoint {
    fuelType: string;
    totalCost: number;
    liters: number;
}

export interface DepartmentTripRecord {
    id: string;
    destination: string;
    // Compat: 'start_time' é alias de 'start_at' do banco unificado, preservado para o restante do web.
    start_time: string;
    status: TripStatus;
    actual_distance_km: number | null;
    has_anomaly: boolean | null;
    vehicles?: {
        id: string;
        plate: string;
        brand: string;
        model: string;
        photo_url?: string | null;
    } | null;
    drivers?: {
        id: string;
        name: string;
        photo_url?: string | null;
    } | null;
}

export interface DepartmentRefuelingRecord {
    id: string;
    // Compat: 'date' é alias de 'created_at' do banco unificado.
    date: string | null;
    total_cost: number;
    liters: number;
    fuel_type: string;
    // Compat: 'supplier_name' é alias de 'station'.
    supplier_name: string;
    km_per_liter: number | null;
    has_anomaly: boolean | null;
    vehicles?: {
        id: string;
        plate: string;
        brand: string;
        model: string;
        photo_url?: string | null;
    } | null;
    drivers?: {
        id: string;
        name: string;
        photo_url?: string | null;
    } | null;
}

export interface DepartmentMaintenanceRecord {
    id: string;
    created_at: string | null;
    // O banco unificado não tem type/category enum — guardamos os mapeados do catálogo do app.
    type: string;
    category: string;
    description: string;
    // Status já mapeado para o enum EN que o web usa (PENDING|APPROVED|...).
    status: MaintenanceStatus;
    actual_cost: number | null;
    estimated_cost: number | null;
    vehicles?: {
        id: string;
        plate: string;
        brand: string;
        model: string;
        photo_url?: string | null;
    } | null;
}

export interface DepartmentDetail {
    department: Tables<'departments'>;
    overview: DepartmentOverview;
    vehicles: VehicleRecord[];
    drivers: DriverRecord[];
    recentTrips: DepartmentTripRecord[];
    recentRefuelings: DepartmentRefuelingRecord[];
    recentMaintenances: DepartmentMaintenanceRecord[];
    monthlyFuelCost: DepartmentMonthlyFuelPoint[];
    monthlyTripDistance: DepartmentMonthlyTripPoint[];
    fuelTypeBreakdown: DepartmentFuelTypePoint[];
    checklistIssues: number;
}

// ========================================
// ERROR HANDLING
// ========================================

class SupabaseApiError extends Error {
    readonly code?: string;
    readonly details?: string;
    constructor(
        message: string,
        code?: string,
        details?: string
    ) {
        super(message);
        this.name = 'SupabaseApiError';
        this.code = code;
        this.details = details;
    }
}

function handleError(error: { message: string; code?: string; details?: string }): never {
    throw new SupabaseApiError(error.message, error.code, error.details);
}

function getTrailingMonthBuckets(months: number) {
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    return Array.from({ length: months }, (_, index) => {
        const date = new Date();
        date.setMonth(date.getMonth() - (months - 1 - index));

        const year = date.getFullYear();
        const month = date.getMonth();

        return {
            key: `${year}-${String(month + 1).padStart(2, '0')}`,
            label: `${monthNames[month]}/${String(year).slice(2)}`,
        };
    });
}

function getMonthKey(date: string | null | undefined) {
    if (!date) return null;
    return date.slice(0, 7);
}

// O banco unificado não tem custo de manutenção em service_orders.
// Mantemos a função para compat — sempre retorna 0 até decidirmos onde armazenar.
function getMaintenanceCost(_record: unknown) {
    return 0;
}

function roundTo(value: number, digits: number = 1) {
    return Number(value.toFixed(digits));
}

// Resolve a janela de datas de um filtro de período: usa o range personalizado (de/até)
// quando informado, senão calcula "últimos N meses" a partir do 1º dia do mês inicial.
function resolvePeriodWindow(
    monthsBack: number = 1,
    range?: { from?: string; to?: string },
): { startDate: Date; endDate: Date } {
    if (range?.from && range?.to) {
        const startDate = new Date(range.from);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(range.to);
        endDate.setHours(23, 59, 59, 999);
        return { startDate, endDate };
    }
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - (monthsBack - 1));
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);
    return { startDate, endDate };
}

// Tipos mínimos usados no agregador (refletem o schema unificado em pt-BR).
type OverviewVehicleSlice = Pick<Tables<'vehicles'>, 'id' | 'status'>;
type OverviewDriverSlice = Pick<Tables<'profiles'>, 'driver_status'>;
type OverviewTripSlice = Pick<Tables<'trips'>, 'start_at' | 'status' | 'distance_km'>;
type OverviewFuelingSlice = Pick<Tables<'fuelings'>, 'created_at' | 'total_cost' | 'liters' | 'km_per_liter' | 'has_anomaly'>;
type OverviewMaintenanceSlice = Pick<Tables<'service_orders'>, 'created_at' | 'status'>;

function buildDepartmentOverview(
    department: Tables<'departments'>,
    vehicles: OverviewVehicleSlice[],
    drivers: OverviewDriverSlice[],
    trips: OverviewTripSlice[],
    refuelings: OverviewFuelingSlice[],
    maintenances: OverviewMaintenanceSlice[],
    checklistIssues: number,
): DepartmentOverview {
    const avgKmEntries = refuelings.filter((entry) => entry.km_per_liter && entry.km_per_liter > 0);
    const avgKmPerLiter = avgKmEntries.length > 0
        ? avgKmEntries.reduce((sum, entry) => sum + (entry.km_per_liter || 0), 0) / avgKmEntries.length
        : 0;

    const lastActivityDates = [
        ...trips.map((entry) => entry.start_at).filter(Boolean),
        ...refuelings.map((entry) => entry.created_at).filter(Boolean),
        ...maintenances.map((entry) => entry.created_at).filter(Boolean),
    ] as string[];

    return {
        id: department.id,
        name: department.name,
        code: department.code ?? '',
        vehicleCount: vehicles.length,
        // 'liberado' do banco = AVAILABLE; "em uso" não tem coluna dedicada (derivado de trip ativa).
        availableVehicles: vehicles.filter((v) => v.status === 'liberado').length,
        activeVehicles: 0,
        maintenanceVehicles: vehicles.filter((v) => v.status === 'manutencao').length,
        driverCount: drivers.length,
        activeDrivers: drivers.filter((d) => d.driver_status === 'ativo').length,
        totalTrips: trips.length,
        totalTripKm: roundTo(trips.reduce((sum, entry) => sum + (Number(entry.distance_km) || 0), 0)),
        fuelCost: roundTo(refuelings.reduce((sum, entry) => sum + (Number(entry.total_cost) || 0), 0), 2),
        fuelLiters: roundTo(refuelings.reduce((sum, entry) => sum + Number(entry.liters || 0), 0), 1),
        avgKmPerLiter: roundTo(avgKmPerLiter, 2),
        maintenanceCost: roundTo(maintenances.reduce((sum, entry) => sum + getMaintenanceCost(entry), 0), 2),
        maintenanceCount: maintenances.length,
        pendingMaintenances: maintenances.filter((entry) => entry.status === 'pendente' || entry.status === 'em_execucao').length,
        anomalyCount:
            trips.filter((entry) => entry.status === 'problema').length +
            refuelings.filter((entry) => entry.has_anomaly).length +
            checklistIssues,
        lastActivityAt: lastActivityDates.length > 0
            ? lastActivityDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
            : null,
    };
}

// ========================================
// VEHICLES
// ========================================

// Decora um vehicle com status em UPPERCASE EN para preservar comparações antigas no web.
function decorateVehicle(row: Record<string, unknown>): VehicleRecord {
    const s = row.status as string | null;
    const statusEn = s === 'liberado' ? 'AVAILABLE'
        : s === 'manutencao' ? 'MAINTENANCE'
        : s === 'bloqueado' ? 'INACTIVE'
        : 'AVAILABLE';
    return {
        ...(row as object),
        status: statusEn,
    } as unknown as VehicleRecord;
}

export const vehiclesApi = {
    getAll: async (filters?: {
        departmentId?: string;
        status?: string;
        search?: string;
        page?: number;
        limit?: number;
    }): Promise<VehicleRecord[]> => {
        let query = supabase
            .from('vehicles')
            .select('*, departments(id, name)')
            .order('created_at', { ascending: false });

        if (filters?.departmentId) {
            query = query.eq('department_id', filters.departmentId);
        }
        if (filters?.status) {
            query = query.eq('status', webToDbVehicleStatus(filters.status as VehicleStatus));
        }
        if (filters?.search) {
            query = query.or(
                `plate.ilike.%${filters.search}%,brand.ilike.%${filters.search}%,model.ilike.%${filters.search}%`
            );
        }
        if (filters?.page !== undefined && filters?.limit) {
            const from = filters.page * filters.limit;
            const to = from + filters.limit - 1;
            query = query.range(from, to);
        }

        const { data, error } = await query;
        if (error) handleError(error);
        return (data ?? []).map((r) => decorateVehicle(r as Record<string, unknown>));
    },

    getById: async (id: string): Promise<VehicleRecord> => {
        const { data, error } = await supabase
            .from('vehicles')
            .select('*, departments(id, name)')
            .eq('id', id)
            .single();
        if (error) handleError(error);
        return decorateVehicle(data as Record<string, unknown>);
    },

    create: async (vehicle: TablesInsert<'vehicles'>): Promise<VehicleRecord> => {
        // O resto do web fala UPPERCASE EN ('DIESEL', 'AVAILABLE'); o banco aceita
        // só os enums em pt-BR/lowercase. Convertemos no boundary.
        const payload: TablesInsert<'vehicles'> = {
            ...vehicle,
            fuel_type: vehicle.fuel_type
                ? webToDbFuelType(vehicle.fuel_type as unknown as 'DIESEL' | 'GASOLINE' | 'ETHANOL' | 'FLEX')
                : vehicle.fuel_type,
            status: vehicle.status
                ? webToDbVehicleStatus(vehicle.status as unknown as VehicleStatus)
                : vehicle.status,
        };
        const { data, error } = await supabase
            .from('vehicles')
            .insert(payload)
            .select()
            .single();
        if (error) handleError(error);
        return decorateVehicle(data as Record<string, unknown>);
    },

    update: async (id: string, updates: TablesUpdate<'vehicles'>): Promise<VehicleRecord> => {
        const payload: TablesUpdate<'vehicles'> = {
            ...updates,
            ...(updates.fuel_type !== undefined && {
                fuel_type: updates.fuel_type
                    ? webToDbFuelType(updates.fuel_type as unknown as 'DIESEL' | 'GASOLINE' | 'ETHANOL' | 'FLEX')
                    : updates.fuel_type,
            }),
            ...(updates.status !== undefined && {
                status: updates.status
                    ? webToDbVehicleStatus(updates.status as unknown as VehicleStatus)
                    : updates.status,
            }),
        };
        const { data, error } = await supabase
            .from('vehicles')
            .update(payload)
            .eq('id', id)
            .select()
            .single();
        if (error) handleError(error);
        return decorateVehicle(data as Record<string, unknown>);
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('vehicles')
            .delete()
            .eq('id', id);
        if (error) handleError(error);
    },

    updatePhoto: async (id: string, photoUrl: string): Promise<Tables<'vehicles'>> => {
        const { data, error } = await supabase
            .from('vehicles')
            .update({ photo_url: photoUrl })
            .eq('id', id)
            .select()
            .single();
        if (error) handleError(error);
        return data;
    },
};

// ========================================
// VEHICLE DOCUMENTS / PHOTOS (placa, renavam, hodômetro, extras)
// ========================================

export const vehicleDocumentsApi = {
    getByVehicle: async (vehicleId: string): Promise<Tables<'vehicle_documents'>[]> => {
        const { data, error } = await supabase
            .from('vehicle_documents')
            .select('*')
            .eq('vehicle_id', vehicleId)
            .order('created_at', { ascending: false });
        if (error) handleError(error);
        return (data ?? []) as Tables<'vehicle_documents'>[];
    },

    add: async (input: { vehicleId: string; url: string; title: string; docType: string }): Promise<void> => {
        const { error } = await supabase.from('vehicle_documents').insert({
            vehicle_id: input.vehicleId,
            url: input.url,
            title: input.title,
            doc_type: input.docType,
        } as TablesInsert<'vehicle_documents'>);
        if (error) handleError(error);
    },

    remove: async (id: string): Promise<void> => {
        const { error } = await supabase.from('vehicle_documents').delete().eq('id', id);
        if (error) handleError(error);
    },
};

// ========================================
// DRIVERS
// ========================================

// No banco unificado, "drivers" = profiles WHERE role='motorista'.
// Adiciona aliases (name, cnh_expiry_date, status em UPPERCASE EN, user_id) ao retornar
// para preservar compatibilidade com componentes do web que ainda esperam os nomes antigos.
function decorateDriver(profile: Record<string, unknown>): DriverRecord {
    const ds = profile.driver_status as string | null;
    const statusEn = ds === 'ativo' ? 'ACTIVE'
        : ds === 'inativo' ? 'INACTIVE'
        : ds === 'suspenso' ? 'SUSPENDED'
        : 'ACTIVE';
    return {
        ...(profile as object),
        name: profile.full_name as string,
        cnh_expiry_date: profile.cnh_expiry as string | null,
        status: statusEn,
        // No banco unificado, profile.id = auth.users.id sempre.
        user_id: profile.id as string,
    } as unknown as DriverRecord;
}

export const driversApi = {
    getAll: async (filters?: {
        departmentId?: string;
        status?: string;
        search?: string;
        page?: number;
        limit?: number;
    }): Promise<DriverRecord[]> => {
        let query = supabase
            .from('profiles')
            .select('*, departments(id, name)')
            .eq('role', 'motorista')
            .order('full_name', { ascending: true });

        if (filters?.departmentId) {
            query = query.eq('department_id', filters.departmentId);
        }
        if (filters?.status) {
            query = query.eq('driver_status', webToDbDriverStatus(filters.status as DriverStatus));
        }
        if (filters?.search) {
            query = query.or(
                `full_name.ilike.%${filters.search}%,cpf.ilike.%${filters.search}%,email.ilike.%${filters.search}%`
            );
        }
        if (filters?.page !== undefined && filters?.limit) {
            const from = filters.page * filters.limit;
            const to = from + filters.limit - 1;
            query = query.range(from, to);
        }

        const { data, error } = await query;
        if (error) handleError(error);
        return (data ?? []).map((row) => decorateDriver(row as Record<string, unknown>));
    },

    getById: async (id: string): Promise<DriverRecord> => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*, departments(id, name)')
            .eq('id', id)
            .single();
        if (error) handleError(error);
        return decorateDriver(data as Record<string, unknown>);
    },

    create: async (driver: TablesInsert<'profiles'>): Promise<Tables<'profiles'>> => {
        const payload: TablesInsert<'profiles'> = { ...driver, role: driver.role ?? 'motorista' };
        const { data, error } = await supabase
            .from('profiles')
            .insert(payload)
            .select()
            .single();
        if (error) handleError(error);
        return data as Tables<'profiles'>;
    },

    update: async (id: string, updates: TablesUpdate<'profiles'>): Promise<Tables<'profiles'>> => {
        const { data, error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) handleError(error);
        return data as Tables<'profiles'>;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('id', id);
        if (error) handleError(error);
    },

    updatePhoto: async (id: string, photoUrl: string): Promise<Tables<'profiles'>> => {
        const { data, error } = await supabase
            .from('profiles')
            .update({ photo_url: photoUrl })
            .eq('id', id)
            .select()
            .single();
        if (error) handleError(error);
        return data as Tables<'profiles'>;
    },
};

// ========================================
// TRIPS
// ========================================

// Decora um trip com aliases retro-compatíveis (status em UPPERCASE EN,
// start_time/end_time/actual_distance_km/has_anomaly/drivers.name).
function decorateTrip(row: Record<string, unknown>): TripRecord {
    const drv = row.profiles as { id: string; full_name: string; photo_url?: string | null } | null;
    return {
        ...row,
        start_time: row.start_at as string,
        end_time: row.end_at as string | null,
        actual_distance_km: (row.distance_km as number | null) ?? null,
        has_anomaly: row.status === 'problema',
        status: dbToWebTripStatus(row.status as Enums<'trip_status'>),
        drivers: drv ? { id: drv.id, name: drv.full_name, photo_url: drv.photo_url ?? null } : null,
    } as unknown as TripRecord;
}

export const tripsApi = {
    getAll: async (filters?: {
        vehicleId?: string;
        driverId?: string;
        status?: string;
        startDate?: string;
        endDate?: string;
        hasAnomaly?: boolean;
        page?: number;
        limit?: number;
    }): Promise<TripRecord[]> => {
        let query = supabase
            .from('trips')
            .select('*, vehicles(id, plate, brand, model, photo_url), profiles!trips_driver_id_fkey(id, full_name, photo_url)')
            .order('start_at', { ascending: false });

        if (filters?.vehicleId) query = query.eq('vehicle_id', filters.vehicleId);
        if (filters?.driverId) query = query.eq('driver_id', filters.driverId);
        if (filters?.status) query = query.eq('status', webToDbTripStatus(filters.status as TripStatus));
        if (filters?.startDate) query = query.gte('start_at', filters.startDate);
        if (filters?.endDate) query = query.lte('start_at', filters.endDate);
        // A tabela trips unificada não tem coluna `has_anomaly`; equivalemos a status='problema'.
        if (filters?.hasAnomaly === true) query = query.eq('status', 'problema');
        if (filters?.page !== undefined && filters?.limit) {
            const from = filters.page * filters.limit;
            const to = from + filters.limit - 1;
            query = query.range(from, to);
        }

        const { data, error } = await query;
        if (error) handleError(error);
        return (data ?? []).map((r) => decorateTrip(r as Record<string, unknown>));
    },

    getById: async (id: string): Promise<TripRecord> => {
        const { data, error } = await supabase
            .from('trips')
            .select('*, vehicles(id, plate, brand, model, photo_url), profiles!trips_driver_id_fkey(id, full_name, photo_url)')
            .eq('id', id)
            .single();
        if (error) handleError(error);
        return decorateTrip(data as Record<string, unknown>);
    },

    // Pontos GPS registrados ao longo da viagem (para desenhar o traçado/rota no mapa).
    getLocations: async (tripId: string): Promise<Tables<'trip_locations'>[]> => {
        const { data, error } = await supabase
            .from('trip_locations')
            .select('*')
            .eq('trip_id', tripId)
            .order('recorded_at', { ascending: true });
        if (error) handleError(error);
        return (data ?? []) as Tables<'trip_locations'>[];
    },
};

// ========================================
// MAPA (Centro de Comando) — posições reais
// ========================================

export interface LiveVehicle {
    id: string;
    plate: string;
    driver: string;
    department: string;
    vehicleModel: string;
    photo: string | null;
    lat: number;
    lng: number;
    speed: number;
    status: 'moving' | 'idle' | 'alert';
    recordedAt: string | null;
    // Viagem associada (para o modal de detalhes)
    tripId: string;
    destination: string;
    startAt: string | null;
}

type VehicleEmbed = { plate?: string | null; brand?: string | null; model?: string | null; photo_url?: string | null; departments?: { name?: string } | null } | null;

function buildModel(v: VehicleEmbed): string {
    return [v?.brand, v?.model].filter(Boolean).join(' ') || 'Veículo';
}

export const mapApi = {
    // Rastreamento contínuo: TODOS os veículos com rastreador (device_status, sinal do
    // hardware IOPGPS) — mesmo sem viagem — enriquecidos com motorista/destino quando há
    // viagem ativa. Veículos em viagem SEM rastreador caem no app do motorista (fallback).
    getLiveVehicles: async (): Promise<LiveVehicle[]> => {
        // 1) Viagens ativas -> motorista/destino (para enriquecer).
        const { data: trips } = await supabase
            .from('trips')
            .select('id, status, vehicle_id, destination, start_at, vehicles(plate, brand, model, photo_url, departments(name)), profiles!trips_driver_id_fkey(full_name)')
            .in('status', ['andamento', 'problema']);
        const activeTrips = trips ?? [];
        const tripByVehicle = new Map<string, (typeof activeTrips)[number]>();
        for (const t of activeTrips) if (t.vehicle_id) tripByVehicle.set(t.vehicle_id, t);

        const byVehicle = new Map<string, LiveVehicle>();

        // 2) Sinal contínuo do hardware (device_status ainda não está nos tipos gerados).
        const { data: statuses } = await (supabase as unknown as {
            from: (t: string) => any;
        }).from('device_status')
            .select('vehicle_id, lat, lng, speed, online, gps_time, vehicles(plate, brand, model, photo_url, departments(name))')
            .not('vehicle_id', 'is', null);

        for (const s of (statuses ?? []) as any[]) {
            if (s.lat == null || s.lng == null) continue;
            const v = s.vehicles as VehicleEmbed;
            const trip = tripByVehicle.get(s.vehicle_id);
            const speed = Math.round(Number(s.speed ?? 0));
            // offline = alerta (sem sinal); viagem com problema = alerta; senão movimento/parado.
            const status: LiveVehicle['status'] =
                trip?.status === 'problema' || s.online === false ? 'alert' : speed > 3 ? 'moving' : 'idle';
            byVehicle.set(s.vehicle_id, {
                id: s.vehicle_id,
                plate: v?.plate ?? 'Sem placa',
                driver: trip ? ((trip.profiles as { full_name?: string } | null)?.full_name ?? 'Sem motorista') : 'Sem viagem ativa',
                department: v?.departments?.name ?? '—',
                vehicleModel: buildModel(v),
                photo: v?.photo_url ?? null,
                lat: Number(s.lat),
                lng: Number(s.lng),
                speed,
                status,
                recordedAt: s.gps_time ?? null,
                tripId: trip?.id ?? '',
                destination: (trip as { destination?: string } | undefined)?.destination ?? '—',
                startAt: (trip as { start_at?: string | null } | undefined)?.start_at ?? null,
            });
        }

        // 3) Fallback: veículos em viagem SEM rastreador (posição do app do motorista).
        const missing = activeTrips.filter((t) => t.vehicle_id && !byVehicle.has(t.vehicle_id));
        if (missing.length > 0) {
            const ids = missing.map((t) => t.id);
            const { data: locs } = await supabase
                .from('trip_locations')
                .select('trip_id, lat, lng, speed, recorded_at')
                .in('trip_id', ids)
                .order('recorded_at', { ascending: false });
            const latestByTrip = new Map<string, { lat: number; lng: number; speed: number | null; recorded_at: string }>();
            for (const l of locs ?? []) if (!latestByTrip.has(l.trip_id)) latestByTrip.set(l.trip_id, l as any);
            for (const t of missing) {
                const loc = latestByTrip.get(t.id);
                if (!loc) continue;
                const v = t.vehicles as VehicleEmbed;
                const speed = Math.round(Number(loc.speed ?? 0));
                const status: LiveVehicle['status'] = t.status === 'problema' ? 'alert' : speed > 3 ? 'moving' : 'idle';
                byVehicle.set(t.vehicle_id!, {
                    id: t.vehicle_id!,
                    plate: v?.plate ?? 'Sem placa',
                    driver: (t.profiles as { full_name?: string } | null)?.full_name ?? 'Sem motorista',
                    department: v?.departments?.name ?? '—',
                    vehicleModel: buildModel(v),
                    photo: v?.photo_url ?? null,
                    lat: Number(loc.lat),
                    lng: Number(loc.lng),
                    speed,
                    status,
                    recordedAt: loc.recorded_at ?? null,
                    tripId: t.id,
                    destination: (t as { destination?: string }).destination ?? '—',
                    startAt: (t as { start_at?: string | null }).start_at ?? null,
                });
            }
        }

        return Array.from(byVehicle.values());
    },
};

// ========================================
// INFRAÇÕES (multas)
// ========================================

export interface InfractionCandidate {
    tripId: string;
    driverId: string;
    driverName: string;
    driverPhoto: string | null;
    startAt: string;
    endAt: string | null;
    destination: string | null;
}

export const infractionsApi = {
    getAll: async (filters?: { status?: string; search?: string }) => {
        let query = supabase
            .from('infractions')
            .select(`*,
                vehicles(plate, brand, model, departments(name)),
                suggested:profiles!infractions_suggested_driver_id_fkey(id, full_name),
                indicated:profiles!infractions_indicated_driver_id_fkey(id, full_name)
            `)
            .order('occurred_at', { ascending: false });
        if (filters?.status) query = query.eq('status', filters.status);
        if (filters?.search) {
            query = query.or(`plate.ilike.%${filters.search}%,ait.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
        }
        const { data, error } = await query;
        if (error) handleError(error);
        return (data ?? []) as unknown as Array<Tables<'infractions'> & {
            vehicles?: { plate?: string; brand?: string; model?: string; departments?: { name?: string } | null } | null;
            suggested?: { id: string; full_name: string } | null;
            indicated?: { id: string; full_name: string } | null;
        }>;
    },

    getById: async (id: string) => {
        const { data, error } = await supabase
            .from('infractions')
            .select(`*,
                vehicles(plate, brand, model, departments(name)),
                suggested:profiles!infractions_suggested_driver_id_fkey(id, full_name),
                indicated:profiles!infractions_indicated_driver_id_fkey(id, full_name)
            `)
            .eq('id', id)
            .single();
        if (error) handleError(error);
        return data;
    },

    // Cruza a data/hora da infração com o histórico de viagens do veículo para
    // sugerir quem estava dirigindo (motorista indicado).
    findCandidates: async (vehicleId: string, occurredAt: string): Promise<InfractionCandidate[]> => {
        const { data, error } = await supabase
            .from('trips')
            .select('id, driver_id, start_at, end_at, destination, profiles!trips_driver_id_fkey(full_name, photo_url)')
            .eq('vehicle_id', vehicleId)
            .lte('start_at', occurredAt)
            .order('start_at', { ascending: false });
        if (error) handleError(error);
        const occ = new Date(occurredAt).getTime();
        return (data ?? [])
            .filter((t) => {
                const start = new Date(t.start_at).getTime();
                const end = t.end_at ? new Date(t.end_at).getTime() : Date.now();
                return start <= occ && occ <= end;
            })
            .map((t) => ({
                tripId: t.id,
                driverId: t.driver_id,
                driverName: (t.profiles as { full_name?: string } | null)?.full_name ?? 'Motorista',
                driverPhoto: (t.profiles as { photo_url?: string | null } | null)?.photo_url ?? null,
                startAt: t.start_at,
                endAt: t.end_at,
                destination: t.destination ?? null,
            }));
    },

    // Cria a infração e já tenta sugerir o motorista pelo histórico de viagens.
    create: async (input: TablesInsert<'infractions'>) => {
        const payload: TablesInsert<'infractions'> = { ...input };

        // Resolve o veículo pela placa, se não veio vehicle_id.
        if (!payload.vehicle_id && payload.plate) {
            const { data: veh } = await supabase
                .from('vehicles')
                .select('id')
                .ilike('plate', payload.plate)
                .maybeSingle();
            if (veh) payload.vehicle_id = veh.id;
        }

        // Sugestão automática de motorista.
        if (payload.vehicle_id && payload.occurred_at && !payload.suggested_driver_id) {
            const candidates = await infractionsApi.findCandidates(payload.vehicle_id, payload.occurred_at as string);
            if (candidates.length > 0) {
                payload.suggested_driver_id = candidates[0].driverId;
                payload.indicated_trip_id = candidates[0].tripId;
            }
        }

        const { data, error } = await supabase.from('infractions').insert(payload).select().single();
        if (error) handleError(error);
        return data as Tables<'infractions'>;
    },

    // Indica um motorista (escolhido pelo admin) e marca como "indicada".
    indicate: async (id: string, driverId: string, tripId?: string | null) => {
        const { data, error } = await supabase
            .from('infractions')
            .update({ indicated_driver_id: driverId, indicated_trip_id: tripId ?? null, status: 'indicada' })
            .eq('id', id)
            .select()
            .single();
        if (error) handleError(error);
        return data as Tables<'infractions'>;
    },

    approve: async (id: string, approvedBy: string) => {
        const { data, error } = await supabase
            .from('infractions')
            .update({ status: 'aprovada', approved_by: approvedBy, approved_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error) handleError(error);
        return data as Tables<'infractions'>;
    },

    reject: async (id: string, reason?: string) => {
        const { data, error } = await supabase
            .from('infractions')
            .update({ status: 'rejeitada', notes: reason ?? null })
            .eq('id', id)
            .select()
            .single();
        if (error) handleError(error);
        return data as Tables<'infractions'>;
    },

    // Integração DETRAN (placeholder): consulta multas por CNPJ.
    // A integração real entra aqui (edge function com credenciais do órgão).
    importFromDetran: async (_cnpj: string): Promise<{ imported: number }> => {
        throw new Error('Integração com o DETRAN ainda não configurada. Lance as infrações manualmente por enquanto.');
    },
};

// ========================================
// REFUELINGS
// ========================================

// Decora um fueling com aliases (date, supplier_name, drivers.name) + dados do posto/autorização.
function decorateFueling(row: Record<string, unknown>): RefuelingRecord {
    const drv = row.profiles as { id: string; full_name: string; photo_url?: string | null } | null;
    const station = (row as { fuel_stations?: { id: string; name: string; code: string | null } | null }).fuel_stations ?? null;
    return {
        ...row,
        date: row.created_at as string,
        supplier_name: (row.station as string | null) ?? station?.name ?? '',
        drivers: drv ? { id: drv.id, name: drv.full_name, photo_url: drv.photo_url ?? null } : null,
        station_relation: station,
    } as unknown as RefuelingRecord;
}

// "refuelings" no banco unificado = fuelings (já com colunas de validação/anomalia)
export const refuelingsApi = {
    getAll: async (filters?: {
        vehicleId?: string;
        driverId?: string;
        startDate?: string;
        endDate?: string;
        hasAnomaly?: boolean;
        workflowStatus?: 'autorizado' | 'concluido' | 'rejeitado_motorista' | 'validado' | 'rejeitado_admin' | 'lancado_direto';
        page?: number;
        limit?: number;
    }): Promise<RefuelingRecord[]> => {
        let query = supabase
            .from('fuelings')
            .select('*, vehicles(id, plate, brand, model, photo_url), profiles!fuelings_driver_id_fkey(id, full_name, photo_url), fuel_stations(id, name, code)')
            .order('created_at', { ascending: false });

        if (filters?.vehicleId) query = query.eq('vehicle_id', filters.vehicleId);
        if (filters?.driverId) query = query.eq('driver_id', filters.driverId);
        if (filters?.startDate) query = query.gte('created_at', filters.startDate);
        if (filters?.endDate) query = query.lte('created_at', filters.endDate);
        if (filters?.hasAnomaly !== undefined) query = query.eq('has_anomaly', filters.hasAnomaly);
        if (filters?.workflowStatus) query = query.eq('workflow_status', filters.workflowStatus);
        if (filters?.page !== undefined && filters?.limit) {
            const from = filters.page * filters.limit;
            const to = from + filters.limit - 1;
            query = query.range(from, to);
        }

        const { data, error } = await query;
        if (error) handleError(error);
        return (data ?? []).map((r) => decorateFueling(r as Record<string, unknown>));
    },

    getById: async (id: string): Promise<RefuelingRecord> => {
        const { data, error } = await supabase
            .from('fuelings')
            .select('*, vehicles(id, plate, brand, model, photo_url), profiles!fuelings_driver_id_fkey(id, full_name, photo_url)')
            .eq('id', id)
            .single();
        if (error) handleError(error);
        return decorateFueling(data as Record<string, unknown>);
    },

    validate: async (id: string, approved: boolean, validatedBy: string, notes?: string) => {
        const { data, error } = await supabase
            .from('fuelings')
            .update({
                validated_at: approved ? new Date().toISOString() : null,
                validated_by: approved ? validatedBy : null,
                has_anomaly: !approved,
                anomaly_type: !approved ? (notes || 'Rejeitado pelo gestor') : null,
                workflow_status: approved ? 'validado' : 'rejeitado_admin',
            })
            .eq('id', id)
            .select()
            .single();
        if (error) handleError(error);
        return data;
    },

    // Cria uma pré-autorização (gestor define veículo, motorista, posto opcional e teto opcional).
    // O motorista verá no app, aceita/rejeita e completa com litros/foto.
    createAuthorization: async (input: {
        vehicle_id: string;
        driver_id?: string | null;
        authorized_by: string;
        station_id?: string | null;
        fuel_type?: string | null;
        max_liters?: number | null;
        notes?: string | null;
    }): Promise<Tables<'fuelings'>> => {
        const payload: TablesInsert<'fuelings'> = {
            vehicle_id: input.vehicle_id,
            // Autorização fica ligada ao VEÍCULO; qualquer motorista com ele realiza.
            driver_id: input.driver_id ?? null,
            authorized_by: input.authorized_by,
            authorized_at: new Date().toISOString(),
            station_id: input.station_id ?? null,
            fuel_type: input.fuel_type ?? null,
            max_liters: input.max_liters ?? null,
            // Placeholders até o motorista completar
            liters: 0,
            total_cost: null,
            odometer: null,
            workflow_status: 'autorizado',
            anomaly_type: input.notes ?? null,
        };
        const { data, error } = await supabase
            .from('fuelings')
            .insert(payload)
            .select()
            .single();
        if (error) handleError(error);
        return data as Tables<'fuelings'>;
    },

    // Cancela/rejeita uma autorização do lado do admin.
    cancelAuthorization: async (id: string, reason?: string) => {
        const { data, error } = await supabase
            .from('fuelings')
            .update({
                workflow_status: 'rejeitado_admin',
                anomaly_type: reason ?? 'Autorização cancelada pelo gestor',
            })
            .eq('id', id)
            .select()
            .single();
        if (error) handleError(error);
        return data;
    },

    getAnomalies: async (): Promise<Tables<'fuelings'>[]> => {
        const { data, error } = await supabase
            .from('fuelings')
            .select('*, vehicles(id, plate, brand, model), profiles!fuelings_driver_id_fkey(id, full_name)')
            .eq('has_anomaly', true)
            .order('created_at', { ascending: false });
        if (error) handleError(error);
        return (data ?? []).map((r) => decorateFueling(r as Record<string, unknown>)) as unknown as Tables<'fuelings'>[];
    },

    create: async (input: {
        vehicle_id: string;
        driver_id: string;
        fuel_type: string;
        liters: number;
        price_per_liter: number;
        total_cost: number;
        odometer: number;
        station?: string | null;
        station_id?: string | null;
        date?: string | null;
        photo_requisition_url?: string | null;
        photo_dashboard_url?: string | null;
        photo_receipt_url?: string | null;
        require_validation?: boolean;
        has_anomaly?: boolean;
        anomaly_type?: string | null;
    }): Promise<Tables<'fuelings'>> => {
        // Calcula km/L automaticamente a partir do último abastecimento do mesmo veículo
        // (se houver), para usar o delta de odômetro × litros agora.
        let kmPerLiter: number | null = null;
        const { data: last } = await supabase
            .from('fuelings')
            .select('odometer')
            .eq('vehicle_id', input.vehicle_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (last && typeof last.odometer === 'number' && input.odometer > last.odometer && input.liters > 0) {
            kmPerLiter = Number(((input.odometer - last.odometer) / input.liters).toFixed(2));
        }

        const payload: TablesInsert<'fuelings'> = {
            driver_id: input.driver_id,
            vehicle_id: input.vehicle_id,
            fuel_type: input.fuel_type,
            liters: input.liters,
            price_per_liter: input.price_per_liter,
            total_cost: input.total_cost,
            odometer: input.odometer,
            station: input.station ?? null,
            station_id: input.station_id ?? null,
            // Validação obrigatória (config): fica "concluido" aguardando o gestor validar.
            // Caso contrário, lançamento direto já validado.
            workflow_status: input.require_validation ? 'concluido' : 'lancado_direto',
            validated_at: input.require_validation ? null : new Date().toISOString(),
            has_anomaly: input.has_anomaly ?? false,
            anomaly_type: input.anomaly_type ?? null,
            km_per_liter: kmPerLiter,
            photo_requisition_url: input.photo_requisition_url ?? null,
            photo_dashboard_url: input.photo_dashboard_url ?? null,
            photo_receipt_url: input.photo_receipt_url ?? null,
            // Para registros lançados pelo gestor, deixamos `created_at` no default (now()).
            // Se o usuário informou uma `date` específica, gravamos em created_at para preservar
            // a cronologia consultada pelos gráficos.
            ...(input.date ? { created_at: new Date(input.date).toISOString() } : {}),
        };
        const { data, error } = await supabase
            .from('fuelings')
            .insert(payload)
            .select()
            .single();
        if (error) handleError(error);
        return data as Tables<'fuelings'>;
    },
};

// ========================================
// MAINTENANCES
// ========================================

// "maintenances" (workflow) no banco unificado = service_orders.
// O app já tem também uma tabela `maintenances` que é histórico de manutenções realizadas,
// mas o workflow de aprovação (pendente→aprovada→…) vive em service_orders.
export const maintenancesApi = {
    getAll: async (filters?: {
        vehicleId?: string;
        status?: string;
        type?: string;
        page?: number;
        limit?: number;
    }): Promise<Tables<'service_orders'>[]> => {
        let query = supabase
            .from('service_orders')
            .select('*, vehicles(id, plate, brand, model, photo_url, departments(name)), profiles!service_orders_driver_id_fkey(id, full_name)')
            .order('created_at', { ascending: false });

        if (filters?.vehicleId) query = query.eq('vehicle_id', filters.vehicleId);
        if (filters?.status) query = query.eq('status', webToDbMaintenanceStatus(filters.status as MaintenanceStatus));
        // O banco unificado não tem coluna `type` (PREVENTIVE/CORRECTIVE/EMERGENCY).
        // Tem `category` (texto livre do catálogo). Se vier filtro `type`, ignoramos por enquanto.
        if (filters?.page !== undefined && filters?.limit) {
            const from = filters.page * filters.limit;
            const to = from + filters.limit - 1;
            query = query.range(from, to);
        }

        const { data, error } = await query;
        if (error) handleError(error);
        return (data ?? []) as Tables<'service_orders'>[];
    },

    getById: async (id: string): Promise<Tables<'service_orders'>> => {
        const { data, error } = await supabase
            .from('service_orders')
            .select('*, vehicles(id, plate, brand, model, departments(name)), profiles!service_orders_driver_id_fkey(id, full_name)')
            .eq('id', id)
            .single();
        if (error) handleError(error);
        return data as Tables<'service_orders'>;
    },

    create: async (maintenance: TablesInsert<'service_orders'>): Promise<Tables<'service_orders'>> => {
        const { data, error } = await supabase
            .from('service_orders')
            .insert(maintenance)
            .select()
            .single();
        if (error) handleError(error);
        return data as Tables<'service_orders'>;
    },

    update: async (id: string, updates: TablesUpdate<'service_orders'>): Promise<Tables<'service_orders'>> => {
        const { data, error } = await supabase
            .from('service_orders')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) handleError(error);
        return data as Tables<'service_orders'>;
    },

    approve: async (id: string, approvedBy: string, _notes?: string) => {
        const { data, error } = await supabase
            .from('service_orders')
            .update({
                status: 'aprovada',
                approved_by: approvedBy,
                approved_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();
        if (error) handleError(error);
        return data;
    },

    reject: async (id: string, reason: string) => {
        const { data, error } = await supabase
            .from('service_orders')
            .update({
                status: 'rejeitada',
                admin_note: reason,
            })
            .eq('id', id)
            .select()
            .single();
        if (error) handleError(error);
        return data;
    },
};

// ========================================
// CHECKLISTS
// ========================================

export const checklistsApi = {
    getAll: async (filters?: {
        vehicleId?: string;
        driverId?: string;
        type?: string;
        page?: number;
        limit?: number;
    }): Promise<Tables<'checklists'>[]> => {
        let query = supabase
            .from('checklists')
            .select('*, vehicles(id, plate), profiles!checklists_driver_id_fkey(id, full_name)')
            .order('created_at', { ascending: false });

        if (filters?.vehicleId) query = query.eq('vehicle_id', filters.vehicleId);
        if (filters?.driverId) query = query.eq('driver_id', filters.driverId);
        // No banco unificado, checklists não tem coluna `type` (PRE_TRIP/POST_TRIP) — ignorado.
        if (filters?.page !== undefined && filters?.limit) {
            const from = filters.page * filters.limit;
            const to = from + filters.limit - 1;
            query = query.range(from, to);
        }

        const { data, error } = await query;
        if (error) handleError(error);
        return (data ?? []) as Tables<'checklists'>[];
    },
};

// ========================================
// CONFIGURAÇÕES (app_settings — singleton)
// ========================================

export interface AppSettings {
    fuelPriceMode: 'contract' | 'free';
    orgName: string;
    cnhAlertDays: number;
    contractAlertDays: number;
    requireFuelValidation: boolean;
    tankOverflowAlert: boolean;
}

const SETTINGS_COLS = 'fuel_price_mode, org_name, cnh_alert_days, contract_alert_days, require_fuel_validation, tank_overflow_alert';

function mapSettings(d: Record<string, unknown> | null): AppSettings {
    return {
        fuelPriceMode: (d?.fuel_price_mode as 'contract' | 'free') ?? 'free',
        orgName: (d?.org_name as string | null) ?? '',
        cnhAlertDays: Number(d?.cnh_alert_days ?? 30),
        contractAlertDays: Number(d?.contract_alert_days ?? 30),
        requireFuelValidation: Boolean(d?.require_fuel_validation ?? false),
        tankOverflowAlert: Boolean(d?.tank_overflow_alert ?? true),
    };
}

export const settingsApi = {
    get: async (): Promise<AppSettings> => {
        const { data, error } = await supabase
            .from('app_settings')
            .select(SETTINGS_COLS)
            .eq('id', true)
            .maybeSingle();
        if (error) handleError(error);
        return mapSettings(data as Record<string, unknown> | null);
    },

    update: async (patch: Partial<AppSettings>): Promise<AppSettings> => {
        const payload: Record<string, unknown> = { id: true, updated_at: new Date().toISOString() };
        if (patch.fuelPriceMode !== undefined) payload.fuel_price_mode = patch.fuelPriceMode;
        if (patch.orgName !== undefined) payload.org_name = patch.orgName || null;
        if (patch.cnhAlertDays !== undefined) payload.cnh_alert_days = patch.cnhAlertDays;
        if (patch.contractAlertDays !== undefined) payload.contract_alert_days = patch.contractAlertDays;
        if (patch.requireFuelValidation !== undefined) payload.require_fuel_validation = patch.requireFuelValidation;
        if (patch.tankOverflowAlert !== undefined) payload.tank_overflow_alert = patch.tankOverflowAlert;
        const { data, error } = await supabase
            .from('app_settings')
            .upsert(payload as TablesInsert<'app_settings'>, { onConflict: 'id' })
            .select(SETTINGS_COLS)
            .single();
        if (error) handleError(error);
        return mapSettings(data as Record<string, unknown> | null);
    },
};

// ========================================
// TENANT (prefeitura — identidade / white-label)
// ========================================

export interface TenantData {
    id: string;
    slug: string;
    name: string;
    appName: string;
    loginEyebrow: string;
    logoUrl: string;
    sealUrl: string;
    photoUrl: string;
    primaryColor: string;
    darkColor: string;
    accentColor: string;
    cnpj: string;
    city: string;
    state: string;
    address: string;
    mayorName: string;
    reportFooter: string;
    status: string;
}

const TENANT_COLS = 'id, slug, name, app_name, login_eyebrow, logo_url, seal_url, photo_url, primary_color, dark_color, accent_color, cnpj, city, state, address, mayor_name, report_footer, status';

function mapTenantData(d: Record<string, unknown> | null): TenantData | null {
    if (!d) return null;
    return {
        id: String(d.id ?? ''), slug: String(d.slug ?? ''), name: String(d.name ?? ''),
        appName: (d.app_name as string) ?? '', loginEyebrow: (d.login_eyebrow as string) ?? '',
        logoUrl: (d.logo_url as string) ?? '', sealUrl: (d.seal_url as string) ?? '', photoUrl: (d.photo_url as string) ?? '',
        primaryColor: (d.primary_color as string) ?? '#00A86B', darkColor: (d.dark_color as string) ?? '#0F2B2F', accentColor: (d.accent_color as string) ?? '#70C4A8',
        cnpj: (d.cnpj as string) ?? '', city: (d.city as string) ?? '', state: (d.state as string) ?? '',
        address: (d.address as string) ?? '', mayorName: (d.mayor_name as string) ?? '', reportFooter: (d.report_footer as string) ?? '',
        status: (d.status as string) ?? 'active',
    };
}

export const tenantApi = {
    /** Retorna o tenant do usuário logado (RLS garante que só o próprio é visível). */
    getCurrent: async (): Promise<TenantData | null> => {
        const { data, error } = await supabase.from('tenants').select(TENANT_COLS).limit(1).maybeSingle();
        if (error) handleError(error);
        return mapTenantData(data as Record<string, unknown> | null);
    },

    update: async (id: string, patch: Partial<TenantData>): Promise<void> => {
        const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
        const map: Record<keyof TenantData, string> = {
            id: 'id', slug: 'slug', name: 'name', appName: 'app_name', loginEyebrow: 'login_eyebrow',
            logoUrl: 'logo_url', sealUrl: 'seal_url', photoUrl: 'photo_url',
            primaryColor: 'primary_color', darkColor: 'dark_color', accentColor: 'accent_color',
            cnpj: 'cnpj', city: 'city', state: 'state', address: 'address', mayorName: 'mayor_name',
            reportFooter: 'report_footer', status: 'status',
        };
        (Object.keys(patch) as (keyof TenantData)[]).forEach((k) => {
            if (k === 'id') return;
            const col = map[k];
            if (col) payload[col] = (patch[k] as string) || null;
        });
        const { error } = await supabase.from('tenants').update(payload).eq('id', id);
        if (error) handleError(error);
    },

    /** Upload de imagem de branding (logo/brasão/foto) no bucket público `fotos` — otimizada. */
    uploadBrandingImage: async (tenantId: string, kind: 'logo' | 'seal' | 'photo', file: File): Promise<string> => {
        const preset = kind === 'photo' ? IMAGE_PRESETS.photo : IMAGE_PRESETS.logo;
        const opt = await optimizeImage(file, preset);
        const path = `branding/${tenantId}/${kind}-${Date.now()}.${opt.ext}`;
        const { error } = await supabase.storage.from('fotos').upload(path, opt.blob, { upsert: true, contentType: opt.contentType });
        if (error) handleError(error);
        const { data } = supabase.storage.from('fotos').getPublicUrl(path);
        return data.publicUrl;
    },
};

// ========================================
// DEPARTMENTS
// ========================================

export const departmentsApi = {
    getAll: async (): Promise<Tables<'departments'>[]> => {
        const { data, error } = await supabase
            .from('departments')
            .select('*')
            .order('name', { ascending: true });
        if (error) handleError(error);
        return data;
    },

    create: async (dept: TablesInsert<'departments'>): Promise<Tables<'departments'>> => {
        const { data, error } = await supabase
            .from('departments')
            .insert(dept)
            .select()
            .single();
        if (error) handleError(error);
        return data;
    },

    update: async (id: string, updates: TablesUpdate<'departments'>): Promise<Tables<'departments'>> => {
        const { data, error } = await supabase
            .from('departments')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) handleError(error);
        return data;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('departments')
            .delete()
            .eq('id', id);
        if (error) handleError(error);
    },

    getOperationalOverview: async (
        monthsBack?: number,
        range?: { from?: string; to?: string },
    ): Promise<DepartmentOverview[]> => {
        // Período opcional: filtra trips/abastecimentos/manutenções pela janela de datas.
        const hasPeriod = !!(monthsBack && monthsBack > 0) || !!(range?.from && range?.to);
        const { startDate, endDate } = resolvePeriodWindow(monthsBack ?? 1, range);
        const startISO = hasPeriod ? startDate.toISOString() : null;
        const endISO = hasPeriod ? endDate.toISOString() : null;

        const tripsQuery = supabase.from('trips').select('vehicle_id, start_at, status, distance_km');
        const fuelingsQuery = supabase.from('fuelings').select('vehicle_id, created_at, total_cost, liters, km_per_liter, has_anomaly');
        const maintenancesQuery = supabase.from('service_orders').select('vehicle_id, created_at, status');
        if (startISO && endISO) {
            tripsQuery.gte('start_at', startISO).lte('start_at', endISO);
            fuelingsQuery.gte('created_at', startISO).lte('created_at', endISO);
            maintenancesQuery.gte('created_at', startISO).lte('created_at', endISO);
        }

        const [
            departmentsResult,
            vehiclesResult,
            driversResult,
            tripsResult,
            refuelingsResult,
            maintenancesResult,
            checklistsResult,
        ] = await Promise.all([
            supabase.from('departments').select('*').order('name', { ascending: true }),
            supabase.from('vehicles').select('id, department_id, status'),
            supabase.from('profiles').select('id, department_id, driver_status').eq('role', 'motorista'),
            tripsQuery,
            fuelingsQuery,
            maintenancesQuery,
            supabase.from('checklists').select('vehicle_id, quick_confirm'),
        ]);

        if (departmentsResult.error) handleError(departmentsResult.error);
        if (vehiclesResult.error) handleError(vehiclesResult.error);
        if (driversResult.error) handleError(driversResult.error);
        if (tripsResult.error) handleError(tripsResult.error);
        if (refuelingsResult.error) handleError(refuelingsResult.error);
        if (maintenancesResult.error) handleError(maintenancesResult.error);
        if (checklistsResult.error) handleError(checklistsResult.error);

        const departments = departmentsResult.data || [];
        const vehicles = vehiclesResult.data || [];
        const drivers = driversResult.data || [];
        const trips = tripsResult.data || [];
        const refuelings = refuelingsResult.data || [];
        const maintenances = maintenancesResult.data || [];
        const checklists = checklistsResult.data || [];

        const vehiclesByDepartment = new Map<string, Array<(typeof vehicles)[number]>>();
        const driversByDepartment = new Map<string, Array<(typeof drivers)[number]>>();
        const tripsByDepartment = new Map<string, Array<(typeof trips)[number]>>();
        const refuelingsByDepartment = new Map<string, Array<(typeof refuelings)[number]>>();
        const maintenancesByDepartment = new Map<string, Array<(typeof maintenances)[number]>>();
        const checklistIssuesByDepartment = new Map<string, number>();
        const vehicleDepartmentMap = new Map<string, string>();

        for (const vehicle of vehicles) {
            if (!vehicle.department_id) continue;
            vehicleDepartmentMap.set(vehicle.id, vehicle.department_id);
            vehiclesByDepartment.set(
                vehicle.department_id,
                [...(vehiclesByDepartment.get(vehicle.department_id) || []), vehicle],
            );
        }

        for (const driver of drivers) {
            if (!driver.department_id) continue;
            driversByDepartment.set(
                driver.department_id,
                [...(driversByDepartment.get(driver.department_id) || []), driver],
            );
        }

        for (const trip of trips) {
            const departmentId = vehicleDepartmentMap.get(trip.vehicle_id);
            if (!departmentId) continue;
            tripsByDepartment.set(departmentId, [...(tripsByDepartment.get(departmentId) || []), trip]);
        }

        for (const refueling of refuelings) {
            const departmentId = vehicleDepartmentMap.get(refueling.vehicle_id);
            if (!departmentId) continue;
            refuelingsByDepartment.set(departmentId, [...(refuelingsByDepartment.get(departmentId) || []), refueling]);
        }

        for (const maintenance of maintenances) {
            const departmentId = vehicleDepartmentMap.get(maintenance.vehicle_id);
            if (!departmentId) continue;
            maintenancesByDepartment.set(departmentId, [...(maintenancesByDepartment.get(departmentId) || []), maintenance]);
        }

        for (const checklist of checklists) {
            if (!checklist.vehicle_id) continue;
            const departmentId = vehicleDepartmentMap.get(checklist.vehicle_id);
            // Considera "issue" um checklist NÃO marcado como quick_confirm (i.e., teve algum item de atenção).
            if (!departmentId || checklist.quick_confirm) continue;
            checklistIssuesByDepartment.set(
                departmentId,
                (checklistIssuesByDepartment.get(departmentId) || 0) + 1,
            );
        }

        return departments
            .map((department) =>
                buildDepartmentOverview(
                    department,
                    vehiclesByDepartment.get(department.id) || [],
                    driversByDepartment.get(department.id) || [],
                    tripsByDepartment.get(department.id) || [],
                    refuelingsByDepartment.get(department.id) || [],
                    maintenancesByDepartment.get(department.id) || [],
                    checklistIssuesByDepartment.get(department.id) || 0,
                )
            )
            .sort((a, b) => b.fuelCost - a.fuelCost);
    },

    getOperationalDetail: async (departmentId: string): Promise<DepartmentDetail> => {
        const departmentResult = await supabase
            .from('departments')
            .select('*')
            .eq('id', departmentId)
            .single();

        if (departmentResult.error) handleError(departmentResult.error);

        const [vehiclesResult, driversResult] = await Promise.all([
            supabase
                .from('vehicles')
                .select('*, departments(id, name)')
                .eq('department_id', departmentId)
                .order('plate', { ascending: true }),
            supabase
                .from('profiles')
                .select('*, departments(id, name)')
                .eq('role', 'motorista')
                .eq('department_id', departmentId)
                .order('full_name', { ascending: true }),
        ]);

        if (vehiclesResult.error) handleError(vehiclesResult.error);
        if (driversResult.error) handleError(driversResult.error);

        // Dados crus (status pt-BR) para o agregador; versões decoradas (status EN) para a UI.
        const vehiclesRaw = (vehiclesResult.data || []) as unknown as Tables<'vehicles'>[];
        const driversRaw = (driversResult.data || []) as unknown as Tables<'profiles'>[];
        const vehicles = vehiclesRaw.map((v) => decorateVehicle(v as unknown as Record<string, unknown>));
        const drivers = driversRaw.map((d) => decorateDriver(d as unknown as Record<string, unknown>));
        const vehicleIds = vehicles.map((vehicle) => vehicle.id);

        if (vehicleIds.length === 0) {
            return {
                department: departmentResult.data,
                overview: buildDepartmentOverview(departmentResult.data, [], driversRaw, [], [], [], 0),
                vehicles,
                drivers,
                recentTrips: [],
                recentRefuelings: [],
                recentMaintenances: [],
                monthlyFuelCost: getTrailingMonthBuckets(6).map((bucket) => ({
                    month: bucket.label,
                    totalCost: 0,
                    liters: 0,
                })),
                monthlyTripDistance: getTrailingMonthBuckets(6).map((bucket) => ({
                    month: bucket.label,
                    totalKm: 0,
                    trips: 0,
                })),
                fuelTypeBreakdown: [],
                checklistIssues: 0,
            };
        }

        const [tripsResult, refuelingsResult, maintenancesResult, checklistsResult] = await Promise.all([
            supabase
                .from('trips')
                .select('id, destination, start_at, status, distance_km, vehicles(id, plate, brand, model, photo_url), profiles!trips_driver_id_fkey(id, full_name, photo_url)')
                .in('vehicle_id', vehicleIds)
                .order('start_at', { ascending: false })
                .limit(12),
            supabase
                .from('fuelings')
                .select('id, created_at, total_cost, liters, fuel_type, station, km_per_liter, has_anomaly, vehicles(id, plate, brand, model, photo_url), profiles!fuelings_driver_id_fkey(id, full_name, photo_url)')
                .in('vehicle_id', vehicleIds)
                .order('created_at', { ascending: false })
                .limit(12),
            supabase
                .from('service_orders')
                .select('id, created_at, category, description, status, priority, vehicles(id, plate, brand, model, photo_url)')
                .in('vehicle_id', vehicleIds)
                .order('created_at', { ascending: false })
                .limit(10),
            supabase
                .from('checklists')
                .select('id, quick_confirm')
                .in('vehicle_id', vehicleIds),
        ]);

        if (tripsResult.error) handleError(tripsResult.error);
        if (refuelingsResult.error) handleError(refuelingsResult.error);
        if (maintenancesResult.error) handleError(maintenancesResult.error);
        if (checklistsResult.error) handleError(checklistsResult.error);

        // Adapta os nomes do banco unificado (start_at, created_at, station, full_name)
        // para os aliases esperados pelos componentes do web (start_time, date, supplier_name, name).
        const trips: DepartmentTripRecord[] = (tripsResult.data || []).map((t: Record<string, unknown>) => {
            const drv = t.profiles as { id: string; full_name: string; photo_url: string | null } | null;
            const veh = t.vehicles as { id: string; plate: string; brand: string; model: string; photo_url: string | null } | null;
            return {
                id: t.id as string,
                destination: t.destination as string,
                start_time: t.start_at as string,
                status: dbToWebTripStatus(t.status as Enums<'trip_status'>),
                actual_distance_km: (t.distance_km as number | null) ?? null,
                has_anomaly: t.status === 'problema',
                vehicles: veh ? { id: veh.id, plate: veh.plate, brand: veh.brand, model: veh.model, photo_url: veh.photo_url } : null,
                drivers: drv ? { id: drv.id, name: drv.full_name, photo_url: drv.photo_url } : null,
            };
        });
        const refuelings: DepartmentRefuelingRecord[] = (refuelingsResult.data || []).map((r: Record<string, unknown>) => {
            const drv = r.profiles as { id: string; full_name: string; photo_url: string | null } | null;
            const veh = r.vehicles as { id: string; plate: string; brand: string; model: string; photo_url: string | null } | null;
            return {
                id: r.id as string,
                date: r.created_at as string | null,
                total_cost: Number(r.total_cost ?? 0),
                liters: Number(r.liters ?? 0),
                fuel_type: (r.fuel_type as string) ?? '',
                supplier_name: (r.station as string) ?? '',
                km_per_liter: (r.km_per_liter as number | null) ?? null,
                has_anomaly: (r.has_anomaly as boolean | null) ?? false,
                vehicles: veh ? { id: veh.id, plate: veh.plate, brand: veh.brand, model: veh.model, photo_url: veh.photo_url } : null,
                drivers: drv ? { id: drv.id, name: drv.full_name, photo_url: drv.photo_url } : null,
            };
        });
        const maintenances: DepartmentMaintenanceRecord[] = (maintenancesResult.data || []).map((m: Record<string, unknown>) => {
            const mapped = dbCategoryToWebTypeCategory(m.category as string);
            const veh = m.vehicles as { id: string; plate: string; brand: string; model: string; photo_url: string | null } | null;
            return {
                id: m.id as string,
                created_at: m.created_at as string | null,
                type: mapped.type,
                category: mapped.category,
                description: (m.description as string) ?? '',
                status: dbToWebMaintenanceStatus(m.status as Enums<'service_order_status'>),
                actual_cost: null,
                estimated_cost: null,
                vehicles: veh ? { id: veh.id, plate: veh.plate, brand: veh.brand, model: veh.model, photo_url: veh.photo_url } : null,
            };
        });
        // Considera issue um checklist NÃO marcado como quick_confirm
        const checklistIssues = (checklistsResult.data || []).filter((item) => !item.quick_confirm).length;

        const monthlyFuelCost = getTrailingMonthBuckets(6).map((bucket) => {
            const monthEntries = refuelings.filter((entry) => getMonthKey(entry.date) === bucket.key);
            return {
                month: bucket.label,
                totalCost: roundTo(monthEntries.reduce((sum, entry) => sum + entry.total_cost, 0), 2),
                liters: roundTo(monthEntries.reduce((sum, entry) => sum + entry.liters, 0), 1),
            };
        });

        const monthlyTripDistance = getTrailingMonthBuckets(6).map((bucket) => {
            const monthEntries = trips.filter((entry) => getMonthKey(entry.start_time) === bucket.key);
            return {
                month: bucket.label,
                totalKm: roundTo(monthEntries.reduce((sum, entry) => sum + (entry.actual_distance_km || 0), 0)),
                trips: monthEntries.length,
            };
        });

        const fuelTypeMap = new Map<string, DepartmentFuelTypePoint>();
        for (const refueling of refuelings) {
            const key = refueling.fuel_type || 'OUTROS';
            const current = fuelTypeMap.get(key) || {
                fuelType: key,
                totalCost: 0,
                liters: 0,
            };
            current.totalCost += refueling.total_cost;
            current.liters += refueling.liters;
            fuelTypeMap.set(key, current);
        }

        return {
            department: departmentResult.data,
            // O agregador trabalha com os valores crus pt-BR do banco (start_at/created_at/status pt-BR).
            overview: buildDepartmentOverview(
                departmentResult.data,
                vehiclesRaw,
                driversRaw,
                (tripsResult.data || []) as unknown as OverviewTripSlice[],
                (refuelingsResult.data || []) as unknown as OverviewFuelingSlice[],
                (maintenancesResult.data || []) as unknown as OverviewMaintenanceSlice[],
                checklistIssues,
            ),
            vehicles,
            drivers,
            recentTrips: trips,
            recentRefuelings: refuelings,
            recentMaintenances: maintenances,
            monthlyFuelCost,
            monthlyTripDistance,
            fuelTypeBreakdown: [...fuelTypeMap.values()]
                .map((entry) => ({
                    ...entry,
                    totalCost: roundTo(entry.totalCost, 2),
                    liters: roundTo(entry.liters, 1),
                }))
                .sort((a, b) => b.totalCost - a.totalCost),
            checklistIssues,
        };
    },
};

// ========================================
// DASHBOARD (Supabase Aggregations)
// ========================================

export const dashboardApi = {
    getKPIs: async () => {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

        const [
            vehiclesResult,
            driversResult,
            tripsResult,
            refuelingsResult,
            maintenancesResult,
        ] = await Promise.all([
            supabase.from('vehicles').select('id, status'),
            supabase.from('profiles').select('id, driver_status, cnh_expiry, score').eq('role', 'motorista'),
            supabase.from('trips').select('id, distance_km, start_at, end_at, status')
                .gte('start_at', monthStart).lte('start_at', monthEnd),
            supabase.from('fuelings').select('id, liters, total_cost, km_per_liter, has_anomaly')
                .gte('created_at', monthStart).lte('created_at', monthEnd),
            supabase.from('service_orders').select('id, status, created_at'),
        ]);
        if (vehiclesResult.error) handleError(vehiclesResult.error);
        if (driversResult.error) handleError(driversResult.error);
        if (tripsResult.error) handleError(tripsResult.error);
        if (refuelingsResult.error) handleError(refuelingsResult.error);
        if (maintenancesResult.error) handleError(maintenancesResult.error);

        const vehicles = vehiclesResult.data || [];
        const drivers = driversResult.data || [];
        const trips = tripsResult.data || [];
        const refuelings = refuelingsResult.data || [];
        const maintenances = maintenancesResult.data || [];

        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        const cnhExpiringSoon = drivers.filter(d =>
            d.cnh_expiry && new Date(d.cnh_expiry) <= thirtyDaysFromNow
        ).length;

        const activeDrivers = drivers.filter(d => d.driver_status === 'ativo');
        const avgScore = activeDrivers.length > 0
            ? activeDrivers.reduce((sum, d) => sum + (Number(d.score) || 0), 0) / activeDrivers.length
            : 0;

        const totalLiters = refuelings.reduce((sum, r) => sum + Number(r.liters || 0), 0);
        const totalCost = refuelings.reduce((sum, r) => sum + Number(r.total_cost || 0), 0);
        const validKmPerLiter = refuelings.filter(r => r.km_per_liter && r.km_per_liter > 0);
        const avgKmPerLiter = validKmPerLiter.length > 0
            ? validKmPerLiter.reduce((sum, r) => sum + (Number(r.km_per_liter) || 0), 0) / validKmPerLiter.length
            : 0;
        const anomalyCount = refuelings.filter(r => r.has_anomaly).length;

        const completedTrips = trips.filter(t => t.status === 'concluida');
        const totalKm = completedTrips.reduce((sum, t) => sum + (Number(t.distance_km) || 0), 0);
        const daysInMonth = now.getDate();
        const avgTripsPerDay = daysInMonth > 0 ? completedTrips.length / daysInMonth : 0;

        const tripsWithDuration = completedTrips.filter(t => t.start_at && t.end_at);
        const avgDuration = tripsWithDuration.length > 0
            ? tripsWithDuration.reduce((sum, t) => {
                const diff = new Date(t.end_at!).getTime() - new Date(t.start_at).getTime();
                return sum + diff / (1000 * 60 * 60);
            }, 0) / tripsWithDuration.length
            : 0;

        const pendingMaint = maintenances.filter(m => m.status === 'pendente').length;
        const inProgressMaint = maintenances.filter(m => m.status === 'em_execucao').length;

        // Note: schema unificado não tem 'IN_USE' como status persistido.
        // "Veículos ativos agora" = liberados com trip em andamento — buscamos separadamente.
        const inUseCount = trips.filter(t => t.status === 'andamento').length;

        return {
            fleet: {
                totalVehicles: vehicles.length,
                activeNow: inUseCount,
                inMaintenance: vehicles.filter(v => v.status === 'manutencao').length,
                idle7Days: vehicles.filter(v => v.status === 'liberado').length,
                availabilityRate: vehicles.length > 0
                    ? (vehicles.filter(v => v.status === 'liberado').length / vehicles.length) * 100
                    : 0,
            },
            fuel: {
                totalLitersMonth: totalLiters,
                totalCostMonth: totalCost,
                avgKmPerLiter: Number(avgKmPerLiter.toFixed(2)),
                anomalyCount,
            },
            trips: {
                totalTripsMonth: trips.length,
                totalKmMonth: Number(totalKm.toFixed(1)),
                avgTripsPerDay: Number(avgTripsPerDay.toFixed(1)),
                avgTripDuration: Number(avgDuration.toFixed(1)),
            },
            maintenance: {
                pendingRequests: pendingMaint,
                inProgress: inProgressMaint,
                avgResolutionDays: 0, // Would need completed maintenance dates
                preventiveCompliance: 0, // Would need scheduled maintenance data
            },
            drivers: {
                totalActive: activeDrivers.length,
                cnhExpiringSoon,
                avgScore: Number(avgScore.toFixed(2)),
            },
        };
    },

    // Séries dos últimos 6 meses para os mini-gráficos dos cards do dashboard.
    getKpiTrends: async () => {
        const buckets = getTrailingMonthBuckets(6);
        const start = new Date();
        start.setMonth(start.getMonth() - 5);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        const startIso = start.toISOString();

        const [fuelingsRes, tripsRes, ordersRes] = await Promise.all([
            supabase.from('fuelings').select('liters, created_at').gte('created_at', startIso),
            supabase.from('trips').select('vehicle_id, distance_km, status, start_at').gte('start_at', startIso),
            supabase.from('service_orders').select('created_at').gte('created_at', startIso),
        ]);
        if (fuelingsRes.error) handleError(fuelingsRes.error);
        if (tripsRes.error) handleError(tripsRes.error);
        if (ordersRes.error) handleError(ordersRes.error);

        const keyOf = (iso: string) => {
            const d = new Date(iso);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        };

        const fuel: Record<string, number> = {};
        const km: Record<string, number> = {};
        const maint: Record<string, number> = {};
        const active: Record<string, Set<string>> = {};
        buckets.forEach((b) => { fuel[b.key] = 0; km[b.key] = 0; maint[b.key] = 0; active[b.key] = new Set(); });

        (fuelingsRes.data || []).forEach((r) => {
            const k = keyOf(r.created_at as string);
            if (k in fuel) fuel[k] += Number(r.liters || 0);
        });
        (tripsRes.data || []).forEach((t) => {
            const k = keyOf(t.start_at as string);
            if (k in km) {
                if (t.status === 'concluida') km[k] += Number(t.distance_km || 0);
                if (t.vehicle_id) active[k].add(t.vehicle_id as string);
            }
        });
        (ordersRes.data || []).forEach((o) => {
            const k = keyOf(o.created_at as string);
            if (k in maint) maint[k] += 1;
        });

        return {
            fuelLiters: buckets.map((b) => ({ month: b.label, value: Math.round(fuel[b.key]) })),
            distanceKm: buckets.map((b) => ({ month: b.label, value: Math.round(km[b.key]) })),
            maintenance: buckets.map((b) => ({ month: b.label, value: maint[b.key] })),
            activeFleet: buckets.map((b) => ({ month: b.label, value: active[b.key].size })),
        };
    },

    getExpenseChart: async (months: number = 6, range?: { from?: string; to?: string }) => {
        const custom = !!(range?.from && range?.to);
        const endDate = custom ? new Date(range!.to as string) : new Date();
        const startDate = custom ? new Date(range!.from as string) : new Date();
        if (custom) {
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
        } else {
            startDate.setMonth(startDate.getMonth() - months);
        }

        const [refuelingsResult, maintenancesResult] = await Promise.all([
            supabase.from('fuelings').select('total_cost, created_at')
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString()),
            supabase.from('service_orders').select('created_at')
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString()),
        ]);
        if (refuelingsResult.error) handleError(refuelingsResult.error);
        if (maintenancesResult.error) handleError(maintenancesResult.error);

        const refuelings = refuelingsResult.data || [];
        const maintenances = maintenancesResult.data || [];

        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const chartData: Array<{ month: string; fuel: number; maintenance: number; total: number }> = [];

        // Itera mês a mês entre startDate e endDate (cobre tanto "últimos N meses" quanto período personalizado).
        const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
        while (cursor <= last) {
            const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
            const label = `${monthNames[cursor.getMonth()]}/${cursor.getFullYear().toString().slice(2)}`;

            const fuelCost = refuelings
                .filter(r => r.created_at && r.created_at.startsWith(monthKey))
                .reduce((sum, r) => sum + Number(r.total_cost || 0), 0);

            // O banco unificado ainda não armazena custo de OS — manutenção entra como 0 por enquanto.
            const maintCost = 0;
            void maintenances; // futuro: somar custos quando o app passar a registrar

            chartData.push({
                month: label,
                fuel: Number(fuelCost.toFixed(2)),
                maintenance: Number(maintCost.toFixed(2)),
                total: Number((fuelCost + maintCost).toFixed(2)),
            });
            cursor.setMonth(cursor.getMonth() + 1);
        }

        return chartData;
    },

    getDepartmentDistribution: async () => {
        const { data: departments, error: deptError } = await supabase
            .from('departments')
            .select('id, name');
        if (deptError) handleError(deptError);

        const { data: vehicles, error: vehError } = await supabase
            .from('vehicles')
            .select('department_id');
        if (vehError) handleError(vehError);

        const colors = ['#00A86B', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

        return (departments || []).map((dept, i) => ({
            name: dept.name,
            value: (vehicles || []).filter(v => v.department_id === dept.id).length,
            color: colors[i % colors.length],
        }));
    },

    // Gasto por tipo de combustível (período em meses retroativos; default = mês corrente)
    getFuelTypeBreakdown: async (monthsBack: number = 1, range?: { from?: string; to?: string }) => {
        const { startDate, endDate } = resolvePeriodWindow(monthsBack, range);

        const { data, error } = await supabase
            .from('fuelings')
            .select('fuel_type, liters, total_cost, created_at')
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());
        if (error) handleError(error);

        const colorMap: Record<string, string> = {
            diesel:  '#10B981',
            gasolina:'#F59E0B',
            etanol:  '#F97316',
            flex:    '#3B82F6',
            outros:  '#94A3B8',
        };
        const labelMap: Record<string, string> = {
            diesel:  'Diesel',
            gasolina:'Gasolina',
            etanol:  'Etanol',
            flex:    'Flex',
            outros:  'Outros',
        };

        const acc = new Map<string, { name: string; value: number; liters: number; color: string }>();
        for (const row of data ?? []) {
            const key = (row.fuel_type ?? 'outros').toLowerCase();
            const current = acc.get(key) ?? {
                name: labelMap[key] ?? row.fuel_type ?? 'Outros',
                value: 0,
                liters: 0,
                color: colorMap[key] ?? colorMap.outros,
            };
            current.value += Number(row.total_cost ?? 0);
            current.liters += Number(row.liters ?? 0);
            acc.set(key, current);
        }
        return Array.from(acc.values()).sort((a, b) => b.value - a.value);
    },

    // Consumo (combustível + manutenção) agrupado por secretaria
    getDepartmentConsumption: async (monthsBack: number = 1, range?: { from?: string; to?: string }) => {
        const { startDate, endDate } = resolvePeriodWindow(monthsBack, range);

        const [deptsRes, vehiclesRes, fuelingsRes] = await Promise.all([
            supabase.from('departments').select('id, name'),
            supabase.from('vehicles').select('id, department_id'),
            supabase.from('fuelings').select('vehicle_id, total_cost, created_at')
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString()),
        ]);
        if (deptsRes.error) handleError(deptsRes.error);
        if (vehiclesRes.error) handleError(vehiclesRes.error);
        if (fuelingsRes.error) handleError(fuelingsRes.error);

        const depts = deptsRes.data ?? [];
        const vehicles = vehiclesRes.data ?? [];
        const fuelings = fuelingsRes.data ?? [];

        const vehicleDept = new Map<string, string | null>();
        for (const v of vehicles) vehicleDept.set(v.id, v.department_id);

        return depts.map((d) => {
            const fuel = fuelings
                .filter((f) => f.vehicle_id && vehicleDept.get(f.vehicle_id) === d.id)
                .reduce((s, f) => s + Number(f.total_cost ?? 0), 0);
            return {
                name: d.name,
                fuel: Number(fuel.toFixed(2)),
                // Custo de manutenção ainda não é armazenado no banco unificado.
                maintenance: 0,
            };
        });
    },
};

// ========================================
// FUEL STATIONS (Postos)
// ========================================

export interface StationDetail {
    station: Tables<'fuel_stations'>;
    totalsAllTime: { liters: number; totalCost: number; refuelings: number; avgKmL: number };
    totals30d:     { liters: number; totalCost: number; refuelings: number };
    monthly:       { month: string; liters: number; totalCost: number }[];
    byFuelType:    { fuelType: string; liters: number; totalCost: number }[];
    topVehicles:   { vehicleId: string; plate: string | null; brand: string | null; model: string | null; totalCost: number; liters: number }[];
    recent:        Tables<'fuelings'>[];
}

export const stationsApi = {
    getAll: async (filters?: { activeOnly?: boolean; search?: string }) => {
        let query = supabase
            .from('fuel_stations')
            .select('*')
            .order('name', { ascending: true });

        if (filters?.activeOnly) query = query.eq('is_active', true);
        if (filters?.search) {
            query = query.or(
                `name.ilike.%${filters.search}%,code.ilike.%${filters.search}%,cnpj.ilike.%${filters.search}%`,
            );
        }
        const { data, error } = await query;
        if (error) handleError(error);
        return (data ?? []) as Tables<'fuel_stations'>[];
    },

    getById: async (id: string): Promise<Tables<'fuel_stations'>> => {
        const { data, error } = await supabase
            .from('fuel_stations')
            .select('*')
            .eq('id', id)
            .single();
        if (error) handleError(error);
        return data as Tables<'fuel_stations'>;
    },

    create: async (station: TablesInsert<'fuel_stations'>) => {
        const { data, error } = await supabase
            .from('fuel_stations')
            .insert(station)
            .select()
            .single();
        if (error) handleError(error);
        return data as Tables<'fuel_stations'>;
    },

    update: async (id: string, updates: TablesUpdate<'fuel_stations'>) => {
        const { data, error } = await supabase
            .from('fuel_stations')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) handleError(error);
        return data as Tables<'fuel_stations'>;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('fuel_stations').delete().eq('id', id);
        if (error) handleError(error);
    },

    // Métricas + detalhes do posto (para a tela de detalhe)
    getDetail: async (id: string): Promise<StationDetail> => {
        const stationRes = await supabase.from('fuel_stations').select('*').eq('id', id).single();
        if (stationRes.error) handleError(stationRes.error);

        const since30 = new Date(); since30.setDate(since30.getDate() - 30);
        const since6m = new Date(); since6m.setMonth(since6m.getMonth() - 5); since6m.setDate(1);

        const [allRes, last30Res, last6mRes, recentRes] = await Promise.all([
            supabase.from('fuelings')
                .select('id, liters, total_cost, km_per_liter, fuel_type, vehicle_id, vehicles(id, plate, brand, model)')
                .eq('station_id', id),
            supabase.from('fuelings').select('liters, total_cost')
                .eq('station_id', id)
                .gte('created_at', since30.toISOString()),
            supabase.from('fuelings').select('liters, total_cost, created_at')
                .eq('station_id', id)
                .gte('created_at', since6m.toISOString()),
            supabase.from('fuelings')
                .select('*, vehicles(id, plate, brand, model), profiles!fuelings_driver_id_fkey(id, full_name)')
                .eq('station_id', id)
                .order('created_at', { ascending: false })
                .limit(10),
        ]);
        if (allRes.error) handleError(allRes.error);
        if (last30Res.error) handleError(last30Res.error);
        if (last6mRes.error) handleError(last6mRes.error);
        if (recentRes.error) handleError(recentRes.error);

        const all = allRes.data ?? [];
        const last30 = last30Res.data ?? [];
        const last6m = last6mRes.data ?? [];

        const totalsAllTime = {
            liters: roundTo(all.reduce((s, r) => s + Number(r.liters ?? 0), 0), 1),
            totalCost: roundTo(all.reduce((s, r) => s + Number(r.total_cost ?? 0), 0), 2),
            refuelings: all.length,
            avgKmL: (() => {
                const ok = all.filter(r => r.km_per_liter && r.km_per_liter > 0);
                if (ok.length === 0) return 0;
                return roundTo(ok.reduce((s, r) => s + Number(r.km_per_liter ?? 0), 0) / ok.length, 2);
            })(),
        };

        const totals30d = {
            liters: roundTo(last30.reduce((s, r) => s + Number(r.liters ?? 0), 0), 1),
            totalCost: roundTo(last30.reduce((s, r) => s + Number(r.total_cost ?? 0), 0), 2),
            refuelings: last30.length,
        };

        const monthly = getTrailingMonthBuckets(6).map((bucket) => {
            const entries = last6m.filter((r) => (r.created_at as string)?.slice(0, 7) === bucket.key);
            return {
                month: bucket.label,
                liters: roundTo(entries.reduce((s, r) => s + Number(r.liters ?? 0), 0), 1),
                totalCost: roundTo(entries.reduce((s, r) => s + Number(r.total_cost ?? 0), 0), 2),
            };
        });

        const byFuelMap = new Map<string, { fuelType: string; liters: number; totalCost: number }>();
        for (const r of all) {
            const key = (r.fuel_type ?? 'Outros') as string;
            const c = byFuelMap.get(key) ?? { fuelType: key, liters: 0, totalCost: 0 };
            c.liters += Number(r.liters ?? 0);
            c.totalCost += Number(r.total_cost ?? 0);
            byFuelMap.set(key, c);
        }
        const byFuelType = Array.from(byFuelMap.values())
            .map(v => ({ ...v, liters: roundTo(v.liters, 1), totalCost: roundTo(v.totalCost, 2) }))
            .sort((a, b) => b.totalCost - a.totalCost);

        const vehMap = new Map<string, { vehicleId: string; plate: string | null; brand: string | null; model: string | null; totalCost: number; liters: number }>();
        for (const r of all) {
            if (!r.vehicle_id) continue;
            const v = (r as unknown as { vehicles?: { plate: string | null; brand: string | null; model: string | null } | null }).vehicles;
            const cur = vehMap.get(r.vehicle_id) ?? {
                vehicleId: r.vehicle_id, plate: v?.plate ?? null, brand: v?.brand ?? null, model: v?.model ?? null,
                totalCost: 0, liters: 0,
            };
            cur.totalCost += Number(r.total_cost ?? 0);
            cur.liters += Number(r.liters ?? 0);
            vehMap.set(r.vehicle_id, cur);
        }
        const topVehicles = Array.from(vehMap.values())
            .map(v => ({ ...v, totalCost: roundTo(v.totalCost, 2), liters: roundTo(v.liters, 1) }))
            .sort((a, b) => b.totalCost - a.totalCost)
            .slice(0, 6);

        return {
            station: stationRes.data as Tables<'fuel_stations'>,
            totalsAllTime,
            totals30d,
            monthly,
            byFuelType,
            topVehicles,
            recent: (recentRes.data ?? []) as Tables<'fuelings'>[],
        };
    },
};

// ========================================
// USER PROFILE
// ========================================

export const userProfileApi = {
    getProfile: async (): Promise<Tables<'profiles'> | null> => {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return null;

        const { data, error } = await supabase
            .from('profiles')
            .select('*, departments(id, name)')
            .eq('id', authUser.id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null;
            handleError(error);
        }
        return data as Tables<'profiles'>;
    },
};

// ========================================
// NOTIFICATIONS (alertas para admin/gestor)
// ========================================

// Destinatário = driver_id (= auth.users.id). Vale para admin/gestor e motoristas.
export type NotificationRecord = Tables<'notifications'>;

export const notificationsApi = {
    list: async (userId: string, limit = 30): Promise<NotificationRecord[]> => {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('driver_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) handleError(error);
        return (data ?? []) as NotificationRecord[];
    },

    unreadCount: async (userId: string): Promise<number> => {
        const { count, error } = await supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('driver_id', userId)
            .eq('read', false);
        if (error) handleError(error);
        return count ?? 0;
    },

    markRead: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('id', id);
        if (error) handleError(error);
    },

    markAllRead: async (userId: string): Promise<void> => {
        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('driver_id', userId)
            .eq('read', false);
        if (error) handleError(error);
    },
};
