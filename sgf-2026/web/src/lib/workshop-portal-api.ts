import { supabase } from '@/lib/supabase';
import { uploadFoto } from '@/lib/fotoStorage';
import { optimizeImage, validateUploadFile } from '@/lib/imageUtils';
import { uploadPrivateDoc } from '@/lib/docStorage';
import type { Json } from '@/types/database.types';

export type WorkshopOperationalStatus =
    | 'pending'
    | 'authorized'
    | 'at_shop'
    | 'awaiting_quote_approval'
    | 'in_progress'
    | 'ready'
    | 'received'
    | 'cancelled';

export type WorkshopFinancialStatus =
    | 'not_started'
    | 'awaiting_commitment'
    | 'committed'
    | 'invoiced'
    | 'attested'
    | 'paid';

export interface WorkshopContext {
    profileId: string;
    tenantId: string;
    repairShopId: string;
    repairShopName: string;
}

export interface WorkshopOrder {
    orderId: string;
    plate: string;
    brand: string;
    model: string;
    year: number | null;
    odometer: number | null;
    category: string;
    description: string;
    priority: string;
    operationalStatus: WorkshopOperationalStatus;
    financialStatus: WorkshopFinancialStatus;
    commitmentNumber: string | null;
    createdAt: string;
}

export interface WorkshopQuoteItem {
    id?: string;
    kind: 'peca' | 'mao_de_obra';
    description: string;
    qty: number;
    unitPrice: number;
}

export interface WorkshopQuote {
    id: string;
    version: number;
    total: number;
    status: string;
    validUntil: string | null;
    note: string | null;
    reviewNote: string | null;
    createdAt: string;
    items: WorkshopQuoteItem[];
}

export interface WorkshopInvoice {
    id: string;
    invoiceNumber: string;
    amount: number;
    issuedAt: string;
    commitmentNumber: string | null;
    filePath: string | null;
    attestedAt: string | null;
    createdAt: string;
}

export interface WorkshopEvent {
    id: string;
    axis: string;
    fromState: string | null;
    toState: string | null;
    actorRole: string | null;
    note: string | null;
    attachmentPath: string | null;
    createdAt: string;
}

export interface WorkshopOrderDetails {
    quotes: WorkshopQuote[];
    invoices: WorkshopInvoice[];
    events: WorkshopEvent[];
}

export interface WorkshopDetails {
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
    specialties: string[];
}

function throwIfError(error: { message: string } | null): void {
    if (error) throw new Error(error.message);
}

function uniqueId(): string {
    return typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const workshopPortalApi = {
    getContext: async (): Promise<WorkshopContext> => {
        const { data, error } = await supabase.rpc('partner_read_context');
        throwIfError(error);
        const row = data?.[0];
        if (!row || row.kind !== 'oficina') {
            throw new Error('Não foi possível identificar a oficina deste acesso.');
        }
        return {
            profileId: row.profile_id,
            tenantId: row.tenant_id,
            repairShopId: row.partner_id,
            repairShopName: row.partner_name,
        };
    },

    getOrders: async (): Promise<WorkshopOrder[]> => {
        const { data, error } = await supabase.rpc('get_repair_shop_orders');
        throwIfError(error);
        return (data ?? []).map((row) => ({
            orderId: row.order_id,
            plate: row.plate,
            brand: row.brand,
            model: row.model,
            year: row.year,
            odometer: row.odometer,
            category: row.category,
            description: row.description,
            priority: row.priority,
            operationalStatus: row.operational_status as WorkshopOperationalStatus,
            financialStatus: row.financial_status as WorkshopFinancialStatus,
            commitmentNumber: row.commitment_number,
            createdAt: row.created_at,
        }));
    },

    getOrderDetails: async (orderId: string): Promise<WorkshopOrderDetails> => {
        const [quotesResult, invoicesResult, eventsResult] = await Promise.all([
            supabase
                .from('service_order_quotes')
                .select('*, service_order_quote_items(id, kind, description, qty, unit_price)')
                .eq('service_order_id', orderId)
                .order('version', { ascending: false }),
            supabase
                .from('service_order_invoices')
                .select('*')
                .eq('service_order_id', orderId)
                .order('created_at', { ascending: false }),
            supabase
                .from('service_order_events')
                .select('*')
                .eq('service_order_id', orderId)
                .order('created_at', { ascending: false }),
        ]);
        throwIfError(quotesResult.error);
        throwIfError(invoicesResult.error);
        throwIfError(eventsResult.error);

        return {
            quotes: (quotesResult.data ?? []).map((row) => ({
                id: row.id,
                version: row.version,
                total: row.total,
                status: row.status,
                validUntil: row.valid_until,
                note: row.note,
                reviewNote: row.review_note,
                createdAt: row.created_at,
                items: (row.service_order_quote_items ?? []).map((item) => ({
                    id: item.id,
                    kind: item.kind as WorkshopQuoteItem['kind'],
                    description: item.description,
                    qty: item.qty,
                    unitPrice: item.unit_price,
                })),
            })),
            invoices: (invoicesResult.data ?? []).map((row) => ({
                id: row.id,
                invoiceNumber: row.invoice_number,
                amount: row.amount,
                issuedAt: row.issued_at,
                commitmentNumber: row.commitment_number,
                filePath: row.file_path,
                attestedAt: row.attested_at,
                createdAt: row.created_at,
            })),
            events: (eventsResult.data ?? []).map((row) => ({
                id: row.id,
                axis: row.axis,
                fromState: row.from_state,
                toState: row.to_state,
                actorRole: row.actor_role,
                note: row.note,
                attachmentPath: row.attachment_path,
                createdAt: row.created_at,
            })),
        };
    },

    getDetails: async (repairShopId: string): Promise<WorkshopDetails> => {
        const { data, error } = await supabase
            .from('repair_shops')
            .select('id, name, cnpj, address, city, phone, contract_number, contract_start, contract_end, contract_value, contract_alert_percent, contract_alert_days, is_active, specialties')
            .eq('id', repairShopId)
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
            specialties: data.specialties ?? [],
        };
    },

    submitQuote: async (input: {
        orderId: string;
        items: WorkshopQuoteItem[];
        validUntil?: string;
        note?: string;
    }): Promise<string> => {
        const items: Json = input.items.map((item) => ({
            kind: item.kind,
            description: item.description.trim(),
            qty: item.qty,
            unit_price: item.unitPrice,
        }));
        const { data, error } = await supabase.rpc('repair_shop_submit_quote_v2', {
            p_order_id: input.orderId,
            p_items: items,
            p_valid_until: input.validUntil || undefined,
            p_note: input.note?.trim() || undefined,
        });
        throwIfError(error);
        return data;
    },

    startService: async (orderId: string): Promise<void> => {
        const { error } = await supabase.rpc('repair_shop_start_service', { p_order_id: orderId });
        throwIfError(error);
    },

    finishService: async (input: {
        orderId: string;
        note: string;
        photos: File[];
        tenantId: string;
        repairShopId: string;
    }): Promise<void> => {
        const uploaded: { path: string; publicUrl: string }[] = [];
        try {
            for (const photo of input.photos) {
                validateUploadFile(photo);
                const optimized = await optimizeImage(photo);
                const suffix = `repair_shops/${input.repairShopId}/service_orders/${input.orderId}/completion/${uniqueId()}.${optimized.ext}`;
                uploaded.push(await uploadFoto(
                    suffix,
                    optimized.blob,
                    optimized.contentType,
                    { upsert: false, tenantId: input.tenantId },
                ));
            }
            const { error } = await supabase.rpc('repair_shop_finish_service_v2', {
                p_order_id: input.orderId,
                p_note: input.note.trim(),
                p_photo_urls: uploaded.map((item) => item.publicUrl),
            });
            throwIfError(error);
        } catch (error) {
            if (uploaded.length > 0) {
                await supabase.storage.from('fotos').remove(uploaded.map((item) => item.path));
            }
            throw error;
        }
    },

    submitInvoice: async (input: {
        orderId: string;
        invoiceNumber: string;
        amount: number;
        issuedAt: string;
        file: File;
        tenantId: string;
        repairShopId: string;
    }): Promise<string> => {
        const key = `${input.repairShopId}/service_orders/${input.orderId}/invoices/nf-${uniqueId()}`;
        const path = await uploadPrivateDoc(input.file, 'repair_shops', input.tenantId, key);
        try {
            const { data, error } = await supabase.rpc('repair_shop_submit_invoice_v2', {
                p_order_id: input.orderId,
                p_invoice_number: input.invoiceNumber.trim(),
                p_amount: input.amount,
                p_file_path: path,
                p_issued_at: input.issuedAt,
            });
            throwIfError(error);
            return data;
        } catch (error) {
            await supabase.storage.from('documentos').remove([path]);
            throw error;
        }
    },
};
