import { supabase } from '@/lib/supabase';
import { uploadFoto } from '@/lib/fotoStorage';
import { optimizeImage, validateUploadFile } from '@/lib/imageUtils';
import type { Json } from '@/types/database.types';

export interface StationContext {
    profileId: string;
    tenantId: string;
    stationId: string;
    stationName: string;
}

export interface StationAuthorization {
    fuelingId: string;
    plate: string;
    brand: string;
    model: string;
    fuelType: string;
    maxLiters: number | null;
    authorizedAt: string;
    expiresAt: string | null;
    note: string | null;
    pricePerLiter: number | null;
}

export interface StationHistoryItem {
    fuelingId: string;
    plate: string;
    brand: string;
    model: string;
    fuelType: string;
    liters: number;
    odometer: number;
    pricePerLiter: number;
    totalCost: number;
    receiptNo: string | null;
    photoUrl: string | null;
    filledAt: string;
    workflowStatus: string;
    rejectionReason: string | null;
    hasAnomaly: boolean;
}

export interface StationHistoryPage {
    items: StationHistoryItem[];
    total: number;
}

export interface StationMonthlySummary {
    fuelType: string;
    totalCount: number;
    totalLiters: number;
    totalAmount: number;
    pendingCount: number;
    pendingAmount: number;
    validatedCount: number;
    validatedAmount: number;
    rejectedCount: number;
}

export interface StationDetails {
    id: string;
    name: string;
    cnpj: string | null;
    address: string | null;
    city: string | null;
    phone: string | null;
    contractNumber: string | null;
    contractStart: string | null;
    contractEnd: string | null;
    contractValue: number | null;
    contractAlertPercent: number;
    contractAlertDays: number;
    isActive: boolean;
    fuelTypes: string[];
    fuelPrices: Json;
}

function throwIfError(error: { message: string } | null): void {
    if (error) throw new Error(error.message);
}

export const stationPortalApi = {
    getContext: async (): Promise<StationContext> => {
        const { data, error } = await supabase.rpc('partner_read_context');
        throwIfError(error);
        const row = data?.[0];
        if (!row || row.kind !== 'posto') {
            throw new Error('Não foi possível identificar o posto deste acesso.');
        }
        return {
            profileId: row.profile_id,
            tenantId: row.tenant_id,
            stationId: row.partner_id,
            stationName: row.partner_name,
        };
    },

    getPending: async (): Promise<StationAuthorization[]> => {
        const { data, error } = await supabase.rpc('get_station_pending_authorizations');
        throwIfError(error);
        return (data ?? []).map((row) => ({
            fuelingId: row.fueling_id,
            plate: row.plate,
            brand: row.brand,
            model: row.model,
            fuelType: row.fuel_type,
            maxLiters: row.max_liters,
            authorizedAt: row.authorized_at,
            expiresAt: row.expires_at,
            note: row.note,
            pricePerLiter: row.price_per_liter,
        }));
    },

    getHistory: async (params: {
        from: string;
        to: string;
        page: number;
        pageSize: number;
    }): Promise<StationHistoryPage> => {
        const { data, error } = await supabase.rpc('get_station_history', {
            p_from: params.from,
            p_to: params.to,
            p_limit: params.pageSize,
            p_offset: params.page * params.pageSize,
        });
        throwIfError(error);
        const rows = data ?? [];
        return {
            total: Number(rows[0]?.total_count ?? 0),
            items: rows.map((row) => ({
                fuelingId: row.fueling_id,
                plate: row.plate,
                brand: row.brand,
                model: row.model,
                fuelType: row.fuel_type,
                liters: row.liters,
                odometer: row.odometer,
                pricePerLiter: row.price_per_liter,
                totalCost: row.total_cost,
                receiptNo: row.receipt_no,
                photoUrl: row.photo_url,
                filledAt: row.filled_at,
                workflowStatus: row.workflow_status,
                rejectionReason: row.rejection_reason,
                hasAnomaly: row.has_anomaly,
            })),
        };
    },

    getMonthlySummary: async (month: string): Promise<StationMonthlySummary[]> => {
        const { data, error } = await supabase.rpc('get_station_monthly_summary', {
            p_month: `${month}-01`,
        });
        throwIfError(error);
        return (data ?? []).map((row) => ({
            fuelType: row.fuel_type,
            totalCount: Number(row.total_count),
            totalLiters: Number(row.total_liters),
            totalAmount: Number(row.total_amount),
            pendingCount: Number(row.pending_count),
            pendingAmount: Number(row.pending_amount),
            validatedCount: Number(row.validated_count),
            validatedAmount: Number(row.validated_amount),
            rejectedCount: Number(row.rejected_count),
        }));
    },

    getDetails: async (stationId: string): Promise<StationDetails> => {
        const { data, error } = await supabase
            .from('fuel_stations')
            .select('id, name, cnpj, address, city, phone, contract_number, contract_start, contract_end, contract_value, contract_alert_percent, contract_alert_days, is_active, fuel_types, fuel_prices')
            .eq('id', stationId)
            .single();
        throwIfError(error);
        return {
            id: data.id,
            name: data.name,
            cnpj: data.cnpj,
            address: data.address,
            city: data.city,
            phone: data.phone,
            contractNumber: data.contract_number,
            contractStart: data.contract_start,
            contractEnd: data.contract_end,
            contractValue: data.contract_value == null ? null : Number(data.contract_value),
            contractAlertPercent: Number(data.contract_alert_percent),
            contractAlertDays: Number(data.contract_alert_days),
            isActive: data.is_active,
            fuelTypes: data.fuel_types ?? [],
            fuelPrices: data.fuel_prices,
        };
    },

    completeFueling: async (input: {
        authorization: StationAuthorization;
        liters: number;
        odometer: number;
        receiptNo: string;
        photo: File;
        tenantId: string;
        stationId: string;
    }): Promise<{ totalCost: number; pricePerLiter: number }> => {
        validateUploadFile(input.photo);
        const optimized = await optimizeImage(input.photo);
        const uniqueId = typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const suffix = `stations/${input.stationId}/fuelings/${input.authorization.fuelingId}/${uniqueId}.${optimized.ext}`;
        const uploaded = await uploadFoto(
            suffix,
            optimized.blob,
            optimized.contentType,
            { upsert: false, tenantId: input.tenantId },
        );

        try {
            const { data, error } = await supabase.rpc('partner_complete_fueling_v2', {
                p_fueling_id: input.authorization.fuelingId,
                p_liters: input.liters,
                p_odometer: input.odometer,
                p_receipt_no: input.receiptNo.trim(),
                p_photo_url: uploaded.publicUrl,
            });
            throwIfError(error);
            const result = data?.[0];
            if (!result) throw new Error('O abastecimento não foi confirmado pelo servidor.');
            return {
                totalCost: result.total_cost,
                pricePerLiter: result.price_per_liter,
            };
        } catch (error) {
            // A foto nasceu nesta tentativa e ainda não está referenciada. Evita
            // órfãos quando a autorização expira ou outro atendente envia antes.
            await supabase.storage.from('fotos').remove([uploaded.path]);
            throw error;
        }
    },
};
