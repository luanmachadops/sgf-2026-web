import { z } from 'zod';
import { supabase } from './supabase';
import type { Json } from '@/types/database.types';

const candidateSchema = z.object({
    item_id: z.string(), item_reference: z.string(), item_description: z.string(), instrument_reference: z.string(),
    allocation_id: z.string(), department_name: z.string(), appropriation: z.string(), funding_source: z.string(),
    contract_unit_price: z.number(),
});
const lineSchema = z.object({
    quote_item_id: z.string(), description: z.string(), kind: z.enum(['peca', 'mao_de_obra']),
    category: z.string().nullable(), unit: z.string().nullable(), qty: z.number(), unit_price: z.number(),
    linked: z.object({ procurement_item_id: z.string(), allocation_id: z.string(), procurement_price_id: z.string(), contract_unit_price: z.number() }).nullable(),
    candidates: z.array(candidateSchema),
});

export type QuoteProcurementLine = z.infer<typeof lineSchema>;
export type QuoteProcurementCandidate = z.infer<typeof candidateSchema>;
export type QuoteProcurementLink = { quoteItemId: string; procurementItemId: string; allocationId: string };

function check(error: { code?: string; message: string } | null) {
    if (!error) return;
    if (error.code === 'PGRST202') throw new Error('O vínculo do orçamento com a licitação aguarda implantação no banco.');
    if (error.code === '42501') throw new Error('Seu acesso não permite vincular orçamento, licitação e dotação.');
    throw new Error(error.message);
}

export const workshopQuoteProcurementApi = {
    async candidates(quoteId: string): Promise<QuoteProcurementLine[]> {
        const { data, error } = await supabase.rpc('get_quote_procurement_candidates', { p_quote_id: quoteId });
        check(error);
        return z.array(lineSchema).parse(data);
    },
    async saveLinks(quoteId: string, links: QuoteProcurementLink[], reason: string): Promise<void> {
        const payload = links.map((link) => ({
            quote_item_id: link.quoteItemId,
            procurement_item_id: link.procurementItemId,
            allocation_id: link.allocationId,
        }));
        const { error } = await supabase.rpc('set_quote_procurement_links', {
            p_quote_id: quoteId, p_links: payload as Json, p_reason: reason.trim(),
        });
        check(error);
    },
};
