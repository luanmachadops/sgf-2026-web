/**
 * Mapeamento entre o schema do banco (pt-BR, lowercase) e os enums que o web usa (EN, UPPERCASE).
 *
 * Objetivo: o banco e o app de motorista são em pt-BR; o código do web foi escrito em EN.
 * Para evitar refatorar todo o web, mapeamos no boundary (camada de API).
 */

import type {
    User,
    VehicleStatus,
    FuelType,
    DriverStatus,
    TripStatus,
    MaintenanceStatus,
    MaintenanceType,
    MaintenanceCategory,
} from '@/types';
import type { Database } from '@/types/database.types';

// ─────────────────────────────────────────────────────────────────
// ROLE: motorista|gestor|admin (DB)  ↔  VIEWER|MANAGER|ADMIN (Web)
// ─────────────────────────────────────────────────────────────────
export function dbToWebRole(db: string | null | undefined): User['role'] {
    switch ((db ?? '').toLowerCase()) {
        case 'admin': return 'ADMIN';
        case 'gestor': return 'MANAGER';
        case 'motorista': return 'VIEWER';
        default: return 'VIEWER';
    }
}
export function webToDbRole(w: User['role']): string {
    switch (w) {
        case 'ADMIN': return 'admin';
        case 'MANAGER': return 'gestor';
        case 'VIEWER': return 'motorista';
    }
}

// ─────────────────────────────────────────────────────────────────
// VEHICLE STATUS: liberado|manutencao|bloqueado (DB)  ↔  AVAILABLE|IN_USE|MAINTENANCE|INACTIVE (Web)
// ─────────────────────────────────────────────────────────────────
export function dbToWebVehicleStatus(db: Database['public']['Enums']['vehicle_status'] | null | undefined): VehicleStatus {
    switch (db) {
        case 'liberado': return 'AVAILABLE';
        case 'manutencao': return 'MAINTENANCE';
        case 'bloqueado': return 'INACTIVE';
        default: return 'AVAILABLE';
    }
}
export function webToDbVehicleStatus(w: VehicleStatus): Database['public']['Enums']['vehicle_status'] {
    switch (w) {
        case 'AVAILABLE': return 'liberado';
        case 'IN_USE': return 'liberado'; // "Em uso" é estado derivado: veículo liberado com viagem ativa
        case 'MAINTENANCE': return 'manutencao';
        case 'INACTIVE': return 'bloqueado';
    }
}

// ─────────────────────────────────────────────────────────────────
// FUEL TYPE: diesel|gasolina|etanol|flex (DB)  ↔  DIESEL|GASOLINE|ETHANOL|FLEX (Web)
// ─────────────────────────────────────────────────────────────────
export function dbToWebFuelType(db: Database['public']['Enums']['fuel_type_enum'] | string | null | undefined): FuelType {
    const v = (db ?? '').toLowerCase();
    if (v === 'diesel') return 'DIESEL';
    if (v === 'gasolina' || v === 'gasoline') return 'GASOLINE';
    if (v === 'etanol' || v === 'ethanol') return 'ETHANOL';
    if (v === 'flex') return 'FLEX';
    return 'DIESEL';
}
export function webToDbFuelType(w: FuelType): Database['public']['Enums']['fuel_type_enum'] {
    switch (w) {
        case 'DIESEL': return 'diesel';
        case 'GASOLINE': return 'gasolina';
        case 'ETHANOL': return 'etanol';
        case 'FLEX': return 'flex';
    }
}

// ─────────────────────────────────────────────────────────────────
// DRIVER STATUS: ativo|inativo|suspenso (DB)  ↔  ACTIVE|INACTIVE|SUSPENDED (Web)
// ─────────────────────────────────────────────────────────────────
export function dbToWebDriverStatus(db: Database['public']['Enums']['driver_lifecycle'] | null | undefined): DriverStatus {
    switch (db) {
        case 'ativo': return 'ACTIVE';
        case 'inativo': return 'INACTIVE';
        case 'suspenso': return 'SUSPENDED';
        default: return 'ACTIVE';
    }
}
export function webToDbDriverStatus(w: DriverStatus): Database['public']['Enums']['driver_lifecycle'] {
    switch (w) {
        case 'ACTIVE': return 'ativo';
        case 'INACTIVE': return 'inativo';
        case 'SUSPENDED': return 'suspenso';
    }
}

// ─────────────────────────────────────────────────────────────────
// TRIP STATUS: andamento|concluida|problema (DB)  ↔  IN_PROGRESS|COMPLETED|CANCELLED (Web)
// ─────────────────────────────────────────────────────────────────
export function dbToWebTripStatus(db: Database['public']['Enums']['trip_status'] | null | undefined): TripStatus {
    switch (db) {
        case 'andamento': return 'IN_PROGRESS';
        case 'concluida': return 'COMPLETED';
        case 'problema': return 'CANCELLED';
        default: return 'IN_PROGRESS';
    }
}
export function webToDbTripStatus(w: TripStatus): Database['public']['Enums']['trip_status'] {
    switch (w) {
        case 'IN_PROGRESS': return 'andamento';
        case 'COMPLETED': return 'concluida';
        case 'CANCELLED': return 'problema';
    }
}

// ─────────────────────────────────────────────────────────────────
// MAINTENANCE / SERVICE ORDER STATUS
// service_orders status (DB): pendente|aprovada|rejeitada|em_execucao|concluida
// Web Maintenance status: PENDING|APPROVED|REJECTED|IN_PROGRESS|AWAITING_PARTS|COMPLETED
// ─────────────────────────────────────────────────────────────────
export function dbToWebMaintenanceStatus(db: Database['public']['Enums']['service_order_status'] | null | undefined): MaintenanceStatus {
    switch (db) {
        case 'pendente': return 'PENDING';
        case 'aprovada': return 'APPROVED';
        case 'rejeitada': return 'REJECTED';
        case 'em_execucao': return 'IN_PROGRESS';
        case 'concluida': return 'COMPLETED';
        default: return 'PENDING';
    }
}
export function webToDbMaintenanceStatus(w: MaintenanceStatus): Database['public']['Enums']['service_order_status'] {
    switch (w) {
        case 'PENDING': return 'pendente';
        case 'APPROVED': return 'aprovada';
        case 'REJECTED': return 'rejeitada';
        case 'IN_PROGRESS': return 'em_execucao';
        case 'AWAITING_PARTS': return 'em_execucao';
        case 'COMPLETED': return 'concluida';
    }
}

// ─────────────────────────────────────────────────────────────────
// MAINTENANCE TYPE / CATEGORY
// O DB armazena tudo em uma coluna `category` text livre (catálogo do app).
// Mapeamos por chave conhecida; default para genérico.
// ─────────────────────────────────────────────────────────────────
const CATEGORY_TO_WEB: Record<string, { type: MaintenanceType; category: MaintenanceCategory }> = {
    oleo:         { type: 'PREVENTIVE', category: 'MECHANICAL' },
    pneus:        { type: 'CORRECTIVE', category: 'TIRES' },
    freios:       { type: 'CORRECTIVE', category: 'MECHANICAL' },
    suspensao:    { type: 'CORRECTIVE', category: 'MECHANICAL' },
    eletrica:     { type: 'CORRECTIVE', category: 'ELECTRICAL' },
    arrefecimento:{ type: 'CORRECTIVE', category: 'MECHANICAL' },
    filtros:      { type: 'PREVENTIVE', category: 'MECHANICAL' },
    transmissao:  { type: 'CORRECTIVE', category: 'MECHANICAL' },
    lubrificacao: { type: 'PREVENTIVE', category: 'MECHANICAL' },
    hidraulico:   { type: 'CORRECTIVE', category: 'MECHANICAL' },
    lataria:      { type: 'CORRECTIVE', category: 'BODY' },
    revisao:      { type: 'PREVENTIVE', category: 'MECHANICAL' },
    outros:       { type: 'CORRECTIVE', category: 'MECHANICAL' },
};
export function dbCategoryToWebTypeCategory(dbCategory: string | null | undefined): { type: MaintenanceType; category: MaintenanceCategory } {
    const key = (dbCategory ?? '').toLowerCase();
    return CATEGORY_TO_WEB[key] ?? { type: 'CORRECTIVE', category: 'MECHANICAL' };
}

// ─────────────────────────────────────────────────────────────────
// PRIORITY (issue_severity)  ↔  Urgency (number 1-5)
// ─────────────────────────────────────────────────────────────────
export function dbPriorityToWebUrgency(db: Database['public']['Enums']['issue_severity'] | null | undefined): number {
    switch (db) {
        case 'baixa': return 1;
        case 'media': return 3;
        case 'alta': return 5;
        default: return 3;
    }
}
export function webUrgencyToDbPriority(urgency: number): Database['public']['Enums']['issue_severity'] {
    if (urgency <= 2) return 'baixa';
    if (urgency >= 4) return 'alta';
    return 'media';
}
