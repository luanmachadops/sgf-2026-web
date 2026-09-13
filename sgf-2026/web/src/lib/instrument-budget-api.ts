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
  // Alguns erros HTTP (ex.: 401/403 sem corpo) chegam com message vazia — nunca falhar em silêncio.
  throw new Error(error.message?.trim() || 'Não foi possível concluir a operação. Verifique sua sessão e tente novamente.');
}
export const instrumentBudgetApi = {
  async preview(payload: {item_id:string;allocation_id:string;operation_date:string;quantity:number;base_price?:number;table_reference?:string}) {
    const {data,error}=await supabase.rpc('preview_procurement_operation',{p_payload:payload});
    check(error);
    return z.object({planning_compatible:z.boolean(),issues:z.array(z.string()),estimated_total:z.number().nullable(),calculated_unit_price:z.number().nullable(),allocation_limit:z.number(),item_quantity:z.number(),unit:z.string(),price_id:z.string().nullable(),price_revision:z.number().nullable(),item_version:z.number(),plan_version:z.number(),instrument_version:z.number(),operation_date:z.string(),quantity:z.number(),reserved:z.literal(false),operational_balance_checked:z.literal(false)}).parse(data);
  },
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
