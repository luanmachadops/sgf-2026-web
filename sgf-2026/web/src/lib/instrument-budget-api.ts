import { z } from 'zod';
import { supabase } from './supabase';
import type { Json } from '@/types/database.types';
export const budgetLineSchema = z.object({ id: z.string(), department_id: z.string(), department_name: z.string(), category: z.enum(['fuel', 'arla', 'lubricant', 'parts', 'labor', 'tires', 'tire_service', 'other']), spending_limit: z.number(), appropriation: z.string(), funding_source: z.string(), simam_code: z.string() });
const planSchema = z.object({ id: z.string(), instrument_id: z.string(), fiscal_year: z.number(), version: z.number(), status: z.literal('draft'), document_reference: z.string(), reference: z.string(), kind: z.enum(['ata','contract']), origin_ata_id: z.string().nullable(), total_limit: z.number().nullable(), declared_value: z.number().nullable(), allocations: z.array(budgetLineSchema) });
export type InstrumentBudget = z.infer<typeof planSchema>;
export type InstrumentBudgetLine = Omit<z.infer<typeof budgetLineSchema>, 'id' | 'department_name'> & { id?: string };
export type InstrumentBudgetPayload = { id?: string; version?: number; instrument_id: string; fiscal_year: number; total_limit: number; document_reference: string; reason: string; allocations: InstrumentBudgetLine[] };
function check(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === 'PGRST202') throw new Error('O planejamento por instrumento aguarda implantação no banco.');
  if (error.code === '23505') throw new Error('Já existe esse planejamento ou uma dotação repetida para a mesma secretaria, categoria e fonte.');
  if (['23514', '23502', '22P02', '22003'].includes(error.code ?? '')) throw new Error('Confira valores, campos obrigatórios e o código SIM-AM (28 dígitos, quando informado).');
  throw new Error(error.message);
}
export const instrumentBudgetApi = {
  async list(year: number, instrumentId?: string, offset = 0) {
    const { data, error } = await supabase.rpc('get_instrument_budgets', { p_year: year, ...(instrumentId ? {p_instrument: instrumentId} : {}), p_offset: offset });
    check(error); return z.object({ total: z.number(), items: z.array(planSchema), departments: z.array(z.object({id: z.string(), name: z.string()})) }).parse(data);
  },
  async save(payload: InstrumentBudgetPayload) {
    const { data, error } = await supabase.rpc('save_instrument_budget', { p_payload: payload as Json }); check(error); return data;
  },
  async events(planId: string, offset = 0) {
    const { data, error } = await supabase.rpc('get_instrument_budget_events', {p_plan: planId, p_offset: offset}); check(error);
    return z.object({total: z.number(), items: z.array(z.object({id: z.number(), actor_name: z.string(), reason: z.string(), occurred_at: z.string(), before_value: z.unknown(), after_value: z.unknown()}))}).parse(data);
  },
};
