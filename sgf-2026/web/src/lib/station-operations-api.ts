import { supabase } from '@/lib/supabase';
import { optimizeImage, validateUploadFile } from '@/lib/imageUtils';
import { uploadFoto } from '@/lib/fotoStorage';

export interface StationCatalogItem {
    itemId: string;
    stationId: string;
    stationName: string;
    kind: string;
    name: string;
    unit: string;
    unitPrice: number | null;
    active: boolean;
    requiresOdometer: boolean;
}

export interface StationOperation {
    operationId: string;
    protocol: string;
    stationName: string;
    plate: string;
    vehicleName: string;
    driverName: string;
    departmentName: string;
    authorizerName: string;
    itemKind: string;
    itemName: string;
    unit: string;
    quantity: number | null;
    unitPrice: number;
    totalCost: number | null;
    odometer: number | null;
    receiptNumber: string | null;
    evidencePath: string | null;
    status: string;
    authorizedAt: string;
    executedAt: string | null;
    rejectionReason: string | null;
}

export interface PendingStationOperation {
    operationId: string;
    protocol: string;
    plate: string;
    brand: string;
    model: string;
    itemKind: string;
    itemName: string;
    unit: string;
    authorizedQuantity: number;
    unitPrice: number;
    authorizedAt: string;
    expiresAt: string;
    note: string | null;
}

function errorMessage(error: { message: string } | null): void {
    if (error) throw new Error(error.message);
}

export const stationOperationsApi = {
    listCatalog: async (stationId?: string, includeInactive = false): Promise<StationCatalogItem[]> => {
        const { data, error } = await supabase.rpc('manager_list_station_catalog', {
            p_station_id: stationId || undefined,
            p_include_inactive: includeInactive,
        });
        errorMessage(error);
        return (data ?? []).map((row) => ({
            itemId: row.item_id,
            stationId: row.station_id,
            stationName: row.station_name,
            kind: row.kind,
            name: row.name,
            unit: row.unit,
            unitPrice: row.unit_price == null ? null : Number(row.unit_price),
            active: row.active,
            requiresOdometer: row.requires_odometer,
        }));
    },

    authorize: async (input: {
        vehicleId: string;
        driverId: string;
        stationId: string;
        catalogItemId: string;
        quantity: number;
        expiresAt: string;
        note?: string;
    }): Promise<string> => {
        const { data, error } = await supabase.rpc('manager_create_station_operation', {
            p_vehicle_id: input.vehicleId,
            p_driver_id: input.driverId,
            p_station_id: input.stationId,
            p_catalog_item_id: input.catalogItemId,
            p_quantity: input.quantity,
            p_expires_at: input.expiresAt,
            p_note: input.note || undefined,
        });
        errorMessage(error);
        return data;
    },

    list: async (): Promise<StationOperation[]> => {
        const { data, error } = await supabase.rpc('manager_get_station_operations', {});
        errorMessage(error);
        return (data ?? []).map((row) => ({
            operationId: row.operation_id,
            protocol: row.protocol,
            stationName: row.station_name,
            plate: row.plate,
            vehicleName: row.vehicle_name,
            driverName: row.driver_name,
            departmentName: row.department_name,
            authorizerName: row.authorizer_name,
            itemKind: row.item_kind,
            itemName: row.item_name,
            unit: row.unit,
            quantity: row.quantity == null ? null : Number(row.quantity),
            unitPrice: Number(row.unit_price),
            totalCost: row.total_cost == null ? null : Number(row.total_cost),
            odometer: row.odometer,
            receiptNumber: row.receipt_number,
            evidencePath: row.evidence_path,
            status: row.status,
            authorizedAt: row.authorized_at,
            executedAt: row.executed_at,
            rejectionReason: row.rejection_reason,
        }));
    },

    review: async (operationId: string, approved: boolean, note?: string): Promise<void> => {
        const { error } = await supabase.rpc('manager_review_station_operation', {
            p_operation_id: operationId,
            p_approved: approved,
            p_note: note || undefined,
        });
        errorMessage(error);
    },

    getPending: async (): Promise<PendingStationOperation[]> => {
        const { data, error } = await supabase.rpc('partner_get_pending_station_operations');
        errorMessage(error);
        return (data ?? []).map((row) => ({
            operationId: row.operation_id,
            protocol: row.protocol,
            plate: row.plate,
            brand: row.brand,
            model: row.model,
            itemKind: row.item_kind,
            itemName: row.item_name,
            unit: row.unit,
            authorizedQuantity: Number(row.authorized_quantity),
            unitPrice: Number(row.unit_price),
            authorizedAt: row.authorized_at,
            expiresAt: row.expires_at,
            note: row.note,
        }));
    },

    complete: async (input: {
        operation: PendingStationOperation;
        quantity: number;
        odometer: number;
        receiptNumber: string;
        evidence: File;
        tenantId: string;
        stationId: string;
    }): Promise<{ totalCost: number; protocol: string }> => {
        validateUploadFile(input.evidence);
        const optimized = await optimizeImage(input.evidence);
        const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now());
        const suffix = `stations/${input.stationId}/operations/${input.operation.operationId}/${id}.${optimized.ext}`;
        const uploaded = await uploadFoto(suffix, optimized.blob, optimized.contentType, {
            upsert: false,
            tenantId: input.tenantId,
        });
        try {
            const { data, error } = await supabase.rpc('partner_complete_station_operation', {
                p_operation_id: input.operation.operationId,
                p_quantity: input.quantity,
                p_odometer: input.odometer,
                p_receipt_number: input.receiptNumber,
                p_evidence_path: uploaded.path,
            });
            errorMessage(error);
            const row = data?.[0];
            if (!row) throw new Error('A operação não foi confirmada.');
            return { totalCost: Number(row.total_cost), protocol: row.protocol };
        } catch (error) {
            await supabase.storage.from('fotos').remove([uploaded.path]);
            throw error;
        }
    },
};
