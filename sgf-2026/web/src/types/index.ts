// User types
export interface User {
    id: string;
    email: string;
    name: string;
    role: 'ADMIN' | 'MANAGER' | 'VIEWER';
    departmentId?: string;
    departmentName?: string;
    createdAt: string;
    photoUrl?: string;
    /** Definido apenas para 'secretário': trava o usuário à sua secretaria (escopo). */
    departmentScopeId?: string;
}

export interface LoginResponse {
    access_token: string;
    user: User;
}

// Department
export interface Department {
    id: string;
    name: string;
    description?: string;
}

// Vehicle types
export type VehicleStatus = 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'INACTIVE';
export type FuelType = 'DIESEL' | 'GASOLINE' | 'ETHANOL' | 'FLEX';

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
    qrCodeHash: string;
    createdAt: string;
    updatedAt: string;
}

// Driver types
export type DriverStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface Driver {
    id: string;
    cpf: string;
    name: string;
    registrationNumber?: string;
    cnhNumber: string;
    cnhCategory: string;
    cnhExpiryDate: string;
    departmentId: string;
    department?: Department;
    phone?: string;
    email?: string;
    score: number;
    status: DriverStatus;
    createdAt: string;
    updatedAt: string;
}

// Trip types
export type TripStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

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
    startTime: string;
    endTime?: string;
    startLocation?: { lat: number; lng: number };
    endLocation?: { lat: number; lng: number };
    status: TripStatus;
    hasAnomaly: boolean;
    anomalyNotes?: string;
    createdAt: string;
}

// Refueling types
export interface Refueling {
    id: string;
    vehicleId: string;
    vehicle?: Vehicle;
    driverId: string;
    driver?: Driver;
    tripId?: string;
    liters: number;
    totalCost: number;
    odometer: number;
    fuelType: FuelType;
    supplierName?: string;
    photoDashboardUrl: string;
    photoReceiptUrl: string;
    location?: { lat: number; lng: number };
    kmPerLiter?: number;
    hasAnomaly: boolean;
    anomalyType?: string;
    validatedAt?: string;
    validatedBy?: string;
    createdAt: string;
}

// Maintenance types
export type MaintenanceStatus =
    | 'PENDING'
    | 'APPROVED'
    | 'REJECTED'
    | 'IN_PROGRESS'
    | 'AWAITING_PARTS'
    | 'COMPLETED';

export type MaintenanceType = 'PREVENTIVE' | 'CORRECTIVE' | 'EMERGENCY';
export type MaintenanceCategory = 'MECHANICAL' | 'ELECTRICAL' | 'TIRES' | 'BODY';

export interface Maintenance {
    id: string;
    vehicleId: string;
    vehicle?: Vehicle;
    requestedById?: string;
    requestedBy?: Driver;
    type: MaintenanceType;
    category: MaintenanceCategory;
    description: string;
    urgency: number;
    status: MaintenanceStatus;
    estimatedCost?: number;
    actualCost?: number;
    startDate?: string;
    endDate?: string;
    serviceProvider?: string;
    notes?: string;
    approvedAt?: string;
    createdAt: string;
    updatedAt: string;
}

// Dashboard KPIs
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

// Chart data
export interface ExpenseChartData {
    month: string;
    fuel: number;
    maintenance: number;
    total: number;
}

export interface DepartmentChartData {
    name: string;
    value: number;
    color: string;
}

// Map types
export type VehicleMapStatus = 'moving' | 'idle' | 'stopped' | 'alert';

export interface VehiclePosition {
    vehicleId: string;
    plate: string;
    lat: number;
    lng: number;
    speed: number;
    status: VehicleMapStatus;
    driver: string;
    destination?: string;
    lastUpdate: string;
}

// Activity log
export interface ActivityLog {
    id: string;
    timestamp: string;
    userId: string;
    userName: string;
    action: string;
    entityType: string;
    entityId: string;
    details?: string;
}

// Alert
export interface Alert {
    id: string;
    type: 'CNH_EXPIRING' | 'MAINTENANCE_REQUIRED' | 'ANOMALY_DETECTED' | 'OTHER';
    priority: 'low' | 'medium' | 'high';
    title: string;
    message: string;
    entityType?: string;
    entityId?: string;
    createdAt: string;
    readAt?: string;
}

// Pagination
export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

// API Error
export interface ApiError {
    message: string;
    statusCode: number;
    error?: string;
}

// Filter types
export interface VehicleFilters {
    departmentId?: string;
    status?: VehicleStatus;
    search?: string;
    page?: number;
    limit?: number;
}

export interface DriverFilters {
    departmentId?: string;
    status?: DriverStatus;
    search?: string;
    page?: number;
    limit?: number;
}

export interface TripFilters {
    vehicleId?: string;
    driverId?: string;
    departmentId?: string;
    status?: TripStatus;
    startDate?: string;
    endDate?: string;
    hasAnomaly?: boolean;
    page?: number;
    limit?: number;
}

export interface RefuelingFilters {
    vehicleId?: string;
    driverId?: string;
    startDate?: string;
    endDate?: string;
    hasAnomaly?: boolean;
    page?: number;
    limit?: number;
}

export interface MaintenanceFilters {
    vehicleId?: string;
    status?: MaintenanceStatus;
    type?: MaintenanceType;
    page?: number;
    limit?: number;
}
