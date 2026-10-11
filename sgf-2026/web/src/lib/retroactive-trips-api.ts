import { supabase } from './supabase';
import { uploadPrivateDoc } from './docStorage';
import type { Database } from '@/types/database.types';

type PurposeCategory = Database['public']['Enums']['trip_purpose_category'];

export const MIN_RETROACTIVE_TEXT = 10;

export interface RetroactiveTripInput {
    vehicleId: string;
    driverId: string;
    startAt: string; // ISO
    endAt: string; // ISO
    startOdometer: number;
    endOdometer: number;
    origin: string;
    destination: string;
    purpose: string;
    purposeCategory: PurposeCategory | null;
    passengerCount: number | null;
    justification: string;
    document: File;
    tenantId: string;
}

/**
 * Lançamento retroativo (P2.6): o gestor passa para o sistema uma viagem que
 * foi registrada na folha de papel durante a transição. O scan da folha vai
 * para o bucket privado `documentos` e a viagem nasce concluída e imutável
 * pela RPC `manager_create_retroactive_trip` (que valida tudo no banco).
 */
export async function createRetroactiveTrip(input: RetroactiveTripInput): Promise<string> {
    const documentPath = await uploadPrivateDoc(input.document, 'retroativo', input.tenantId, input.vehicleId);
    const { data, error } = await supabase.rpc('manager_create_retroactive_trip', {
        p_vehicle_id: input.vehicleId,
        p_driver_id: input.driverId,
        p_start_at: input.startAt,
        p_end_at: input.endAt,
        p_start_odometer: input.startOdometer,
        p_end_odometer: input.endOdometer,
        p_origin: input.origin,
        p_destination: input.destination,
        p_purpose: input.purpose,
        // A RPC aceita categoria nula; o tipo gerado não expressa isso.
        p_purpose_category: input.purposeCategory as PurposeCategory,
        p_passenger_count: input.passengerCount as number,
        p_justification: input.justification,
        p_document_path: documentPath,
    });
    if (error) throw new Error(error.message);
    return data as string;
}
