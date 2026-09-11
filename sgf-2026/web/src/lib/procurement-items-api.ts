import { z } from 'zod';
import { supabase } from './supabase';
import type { Json } from '@/types/database.types';

export const ITEM_CATEGORIES = { fuel: 'Combustível', arla: 'ARLA', lubricant: 'Lubrificantes', parts: 'Peças', labor: 'Mão de obra', tires: 'Pneus', tire_service: 'Borracharia', other: 'Outros' } as const;
export const ITEM_UNITS = { L: 'Litro', UN: 'Unidade', H: 'Hora', KM: 'Quilômetro', KG: 'Quilograma', SERV: 'Serviço' } as const;
const priceSchema = z.object({ id: z.string(), item_id: z.string(), effective_on: z.string(), pricing_mode: z.enum(['unit', 'discount']), unit_price: z.number().nullable(), discount_percent: z.number().nullable(), table_reference: z.string().nullable(), document_reference: z.string(), revision: z.number() });
const itemSchema = z.object({ id: z.string(), instrument_id: z.string(), reference: z.string(), lot_reference: z.string(), description: z.string(), category: z.enum(['fuel', 'arla', 'lubricant', 'parts', 'labor', 'tires', 'tire_service', 'other']), unit: z.enum(['L', 'UN', 'H', 'KM', 'KG', 'SERV']), quantity: z.number(), partner_kind: z.enum(['posto', 'oficina']), partner_id: z.string(), partner_name: z.string(), origin_item_id: z.string().nullable(), version: z.number(), price: priceSchema.nullable() });
export type ProcurementItem = z.infer<typeof itemSchema>;
export type ProcurementPrice = z.infer<typeof priceSchema>;
export type ItemPayload = Pick<ProcurementItem, 'instrument_id' | 'reference' | 'lot_reference' | 'description' | 'category' | 'unit' | 'quantity' | 'partner_kind' | 'partner_id' | 'origin_item_id'> & { id?: string; version?: number; reason: string };
export type PricePayload = Pick<ProcurementPrice, 'item_id' | 'effective_on' | 'pricing_mode' | 'unit_price' | 'discount_percent' | 'table_reference' | 'document_reference'> & { version: number; reason: string };
function check(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === 'PGRST202' || error.code === '42P01') throw new Error('O cadastro de itens aguarda implantação da estrutura no banco.');
  if (error.code === '23505') throw new Error('Já existe um item com esta referência no instrumento.');
  if (['23514', '23502', '22P02', '22003', '22007', '22008'].includes(error.code ?? '')) throw new Error('Confira os campos obrigatórios, quantidades, datas e condições de preço.');
  throw new Error(error.message);
}
export const procurementItemsApi = {
  async list(instrumentId: string, offset = 0, search = '', date?: string) {
    const { data, error } = await supabase.rpc('get_procurement_items', { p_instrument: instrumentId, p_offset: offset, p_search: search, ...(date ? { p_date: date } : {}) });
    check(error); return z.object({ total: z.number(), items: z.array(itemSchema) }).parse(data);
  },
  async save(payload: ItemPayload) {
    const { data, error } = await supabase.rpc('save_procurement_item', { p_payload: payload as Json });
    check(error); return data;
  },
  async prices(itemId: string, offset = 0) {
    const { data, error } = await supabase.rpc('get_procurement_prices', { p_item: itemId, p_offset: offset });
    check(error); return z.object({ total: z.number(), items: z.array(priceSchema) }).parse(data);
  },
  async savePrice(payload: PricePayload) {
    const { data, error } = await supabase.rpc('save_procurement_price', { p_payload: payload as Json });
    check(error); return data;
  },
};
