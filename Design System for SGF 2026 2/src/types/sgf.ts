/**
 * SGF 2026 - Type Definitions
 * Definições de tipos TypeScript para o sistema
 */

// ========================================
// VEÍCULOS
// ========================================

export type VehicleStatus = 'available' | 'in_use' | 'maintenance' | 'inactive';
export type VehicleLiveStatus = 'moving' | 'idle' | 'stopped' | 'alert';
export type FuelType = 'diesel' | 'gasoline' | 'ethanol' | 'flex';

export interface Vehicle {
  id: string;
  plate: string;
  renavam?: string;
  chassis?: string;
  brand: string;
  model: string;
  year: number;
  fuelType: FuelType;
  tankCapacityLiters: number;
  currentOdometer: number;
  departmentId: string;
  department?: Department;
  status: VehicleStatus;
  liveStatus?: VehicleLiveStatus;
  qrCodeHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VehiclePosition {
  vehicleId: string;
  tripId: string;
  latitude: number;
  longitude: number;
  speedKmh: number;
  heading?: number;
  accuracyMeters?: number;
  timestamp: Date;
}

// ========================================
// MOTORISTAS
// ========================================

export type DriverStatus = 'active' | 'inactive' | 'suspended';
export type CNHCategory = 'A' | 'B' | 'C' | 'D' | 'E' | 'AB' | 'AC' | 'AD' | 'AE';

export interface Driver {
  id: string;
  cpf: string;
  name: string;
  registrationNumber?: string;
  cnhNumber: string;
  cnhCategory: CNHCategory;
  cnhExpiryDate: Date;
  departmentId: string;
  department?: Department;
  phone?: string;
  email?: string;
  score: number; // 0.00 a 5.00
  status: DriverStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ========================================
// VIAGENS
// ========================================

export type TripStatus = 'in_progress' | 'completed' | 'cancelled';

export interface Trip {
  id: string;
  vehicleId: string;
  vehicle?: Vehicle;
  driverId: string;
  driver?: Driver;
  destination: string;
  estimatedDistanceKm?: number;
  actualDistanceKm?: number;
  estimatedFuelLiters?: number;
  startOdometer: number;
  endOdometer?: number;
  startTime: Date;
  endTime?: Date;
  startLocation?: Coordinates;
  endLocation?: Coordinates;
  status: TripStatus;
  routePolyline?: string;
  hasAnomaly: boolean;
  anomalyNotes?: string;
  createdAt: Date;
}

export interface TripStop {
  id: string;
  tripId: string;
  type: 'meal' | 'load_unload' | 'emergency' | 'personal';
  location: Coordinates;
  startTime: Date;
  endTime?: Date;
  notes?: string;
}

// ========================================
// ABASTECIMENTOS
// ========================================

export type AnomalyType = 
  | 'odometer_regression' 
  | 'excessive_consumption' 
  | 'location_mismatch'
  | 'capacity_exceeded'
  | 'suspicious_timing';

export interface Refueling {
  id: string;
  vehicleId: string;
  vehicle?: Vehicle;
  driverId: string;
  driver?: Driver;
  tripId?: string;
  trip?: Trip;
  liters: number;
  totalCost: number;
  odometer: number;
  fuelType: FuelType;
  supplierId?: string;
  supplier?: Supplier;
  supplierName?: string;
  photoDashboardUrl: string;
  photoReceiptUrl: string;
  location?: Coordinates;
  kmPerLiter?: number;
  hasAnomaly: boolean;
  anomalyType?: AnomalyType;
  validatedAt?: Date;
  validatedBy?: string;
  createdAt: Date;
}

// ========================================
// MANUTENÇÕES
// ========================================

export type MaintenanceType = 'preventive' | 'corrective' | 'emergency';
export type MaintenanceCategory = 'mechanical' | 'electrical' | 'tires' | 'body';
export type MaintenanceStatus = 
  | 'pending' 
  | 'approved' 
  | 'rejected' 
  | 'in_progress' 
  | 'awaiting_parts' 
  | 'completed';

export interface Maintenance {
  id: string;
  vehicleId: string;
  vehicle?: Vehicle;
  requestedById?: string;
  requestedBy?: Driver;
  type: MaintenanceType;
  category: MaintenanceCategory;
  description: string;
  urgency: 1 | 2 | 3 | 4 | 5;
  status: MaintenanceStatus;
  estimatedCost?: number;
  actualCost?: number;
  startDate?: Date;
  endDate?: Date;
  serviceProvider?: string;
  notes?: string;
  approvedBy?: string;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ========================================
// CHECKLISTS
// ========================================

export type ChecklistType = 'pre_trip' | 'post_trip';
export type ChecklistItemStatus = 'ok' | 'problem' | 'not_applicable';

export interface Checklist {
  id: string;
  vehicleId: string;
  vehicle?: Vehicle;
  driverId: string;
  driver?: Driver;
  tripId?: string;
  type: ChecklistType;
  completedAt: Date;
  hasIssues: boolean;
  items: ChecklistItem[];
  createdAt: Date;
}

export interface ChecklistItem {
  id: string;
  checklistId: string;
  itemTemplateId: string;
  template?: ChecklistTemplate;
  status: ChecklistItemStatus;
  notes?: string;
  photoUrl?: string;
  isCritical: boolean;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  isCritical: boolean;
  order: number;
  vehicleTypes?: string[]; // Tipos de veículos aplicáveis
}

// ========================================
// DEPARTAMENTOS
// ========================================

export interface Department {
  id: string;
  name: string;
  code: string;
  responsibleName?: string;
  responsibleEmail?: string;
  responsiblePhone?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ========================================
// FORNECEDORES
// ========================================

export interface Supplier {
  id: string;
  name: string;
  cnpj?: string;
  type: 'fuel_station' | 'workshop' | 'parts' | 'other';
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ========================================
// USUÁRIOS E PERMISSÕES
// ========================================

export type UserRole = 'admin' | 'manager' | 'viewer' | 'driver';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  departmentId?: string;
  department?: Department;
  driverId?: string; // Se o usuário for motorista
  driver?: Driver;
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  resource: string;
  action: 'create' | 'read' | 'update' | 'delete';
  scope?: 'own' | 'department' | 'all';
}

// ========================================
// ALERTAS
// ========================================

export type AlertType = 
  | 'maintenance_required'
  | 'maintenance_approved'
  | 'cnh_expiring'
  | 'crlv_expiring'
  | 'anomaly_detected'
  | 'vehicle_stopped'
  | 'geofence_violation'
  | 'route_deviation';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  entityType?: 'vehicle' | 'driver' | 'trip' | 'refueling' | 'maintenance';
  entityId?: string;
  userId?: string;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
}

// ========================================
// RELATÓRIOS
// ========================================

export type ReportType = 
  | 'fuel_consumption'
  | 'trips_summary'
  | 'maintenance_history'
  | 'driver_performance'
  | 'cost_analysis'
  | 'anomalies';

export interface ReportParams {
  type: ReportType;
  startDate: Date;
  endDate: Date;
  departmentId?: string;
  vehicleId?: string;
  driverId?: string;
  format: 'pdf' | 'excel' | 'csv';
}

// ========================================
// DASHBOARD / KPIs
// ========================================

export interface DashboardKPIs {
  fleet: {
    totalVehicles: number;
    activeNow: number;
    inMaintenance: number;
    idle7Days: number;
    availabilityRate: number;
  };
  fuel: {
    totalLitersMonth: number;
    totalCostMonth: number;
    avgKmPerLiter: number;
    anomalyCount: number;
  };
  trips: {
    totalTripsMonth: number;
    totalKmMonth: number;
    avgTripsPerDay: number;
    avgTripDuration: number;
  };
  maintenance: {
    pendingRequests: number;
    inProgress: number;
    avgResolutionDays: number;
    preventiveCompliance: number;
  };
  drivers: {
    totalActive: number;
    cnhExpiringSoon: number;
    avgScore: number;
  };
}

// ========================================
// UTILITÁRIOS
// ========================================

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// ========================================
// CONFIGURAÇÕES DO SISTEMA
// ========================================

export interface SystemConfig {
  maintenance: {
    oilChangeKm: number;
    oilChangeMonths: number;
    tireRotationKm: number;
    generalRevisionKm: number;
    alertDaysBefore: number;
  };
  documents: {
    cnhAlertDaysBefore: number;
    crlvAlertDaysBefore: number;
  };
  trips: {
    gpsIntervalSeconds: number;
    maxIdleMinutes: number;
    deviationAlertPercent: number;
  };
  refueling: {
    requirePhotos: boolean;
    requireGps: boolean;
    consumptionTolerancePercent: number;
  };
  checklist: {
    required: boolean;
    blockOnCriticalIssue: boolean;
  };
}

// ========================================
// WEBSOCKET EVENTS
// ========================================

export interface WebSocketEvent<T = any> {
  event: string;
  data: T;
  timestamp: Date;
}

export interface PositionUpdateEvent {
  vehicleId: string;
  plate: string;
  position: VehiclePosition;
  driver: {
    id: string;
    name: string;
  };
  status: VehicleLiveStatus;
}

// ========================================
// FILTROS
// ========================================

export interface VehicleFilters {
  departmentId?: string;
  status?: VehicleStatus;
  fuelType?: FuelType;
  search?: string;
}

export interface TripFilters {
  startDate?: Date;
  endDate?: Date;
  vehicleId?: string;
  driverId?: string;
  departmentId?: string;
  status?: TripStatus;
  hasAnomaly?: boolean;
}

export interface MaintenanceFilters {
  startDate?: Date;
  endDate?: Date;
  vehicleId?: string;
  type?: MaintenanceType;
  category?: MaintenanceCategory;
  status?: MaintenanceStatus;
  urgency?: number;
}
