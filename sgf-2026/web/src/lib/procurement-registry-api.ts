import { z } from 'zod';
import { supabase } from './supabase';
import type { Json } from '@/types/database.types';

const documents = z.array(z.object({ label: z.string(), url: z.string() }));
const base = z.object({ id: z.string(), reference: z.string(), year: z.number(), version: z.number(), status: z.literal('draft'), documents });
export const processSchema = base.extend({ object: z.string(), modality: z.string(), legal_basis: z.string() });
export const instrumentSchema = base.extend({ process_id: z.string(), kind: z.enum(['ata', 'contract']), starts_on: z.string(), ends_on: z.string(), declared_value: z.number().nullable(), origin_ata_id: z.string().nullable(), partners: z.array(z.string()) });
export type ProcurementProcess = z.infer<typeof processSchema>;
export type ProcurementInstrument = z.infer<typeof instrumentSchema>;
export type RegistryDocument = z.infer<typeof documents>[number];
export type RegistryPayload = {
  id?: string; version?: number; reference: string; year: number; reason: string; documents: RegistryDocument[];
  object?: string; modality?: string; legal_basis?: string; process_id?: string; kind?: 'ata' | 'contract';
  starts_on?: string; ends_on?: string; declared_value?: number | null; origin_ata_id?: string | null; partners?: string[];
};
function check(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === 'PGRST202' || error.code === '42P01') throw new Error('O cadastro de processos aguarda a implantação da estrutura no banco.');
  if (error.code === '23503') throw new Error('Este vínculo é utilizado por itens ou contratos. Confira os registros relacionados antes de alterar.');
  if (error.code === '23505') throw new Error('Esta referência já existe para o mesmo tipo e ano. Confira o cadastro existente.');
  if (['23514', '23502', '22P02', '22003', '22007', '22008'].includes(error.code ?? '')) throw new Error('Confira os campos obrigatórios, as datas e os valores informados.');
  // Alguns erros HTTP (ex.: 401/403 sem corpo) chegam com message vazia — nunca falhar em silêncio.
  throw new Error(error.message?.trim() || 'Não foi possível concluir a operação. Verifique sua sessão e tente novamente.');
}
const eventsSchema = z.object({ total: z.number(), items: z.array(z.object({
  id: z.number(), record_id: z.string(), kind: z.string(), actor_id: z.string(), actor_name: z.string(), reason: z.string(),
  occurred_at: z.string(), before_value: z.record(z.string(), z.unknown()).nullable(), after_value: z.record(z.string(), z.unknown()),
})) });
export const procurementRegistryApi = {
  async processes(offset = 0, search = '') {
    const { data, error } = await supabase.rpc('get_procurement_registry', { p_kind: 'process', p_offset: offset, p_search: search });
    check(error);
    return z.object({ total: z.number(), items: z.array(processSchema) }).parse(data);
  },
  async instruments(processId: string, offset = 0, search = '') {
    const { data, error } = await supabase.rpc('get_procurement_registry', { p_kind: 'instrument', p_process: processId, p_offset: offset, p_search: search });
    check(error);
    return z.object({ total: z.number(), items: z.array(instrumentSchema) }).parse(data);
  },
  async save(kind: 'process' | 'instrument', payload: RegistryPayload) {
    const { data, error } = await supabase.rpc('save_procurement_registry', { p_kind: kind, p_payload: payload as Json });
    check(error);
    return data;
  },
  async partners() {
    const { data, error } = await supabase.rpc('get_procurement_registry_partners');
    check(error);
    return z.array(z.object({ id: z.string(), name: z.string() })).parse(data);
  },
  async events(processId: string, offset = 0) {
    const { data, error } = await supabase.rpc('get_procurement_registry_events', { p_process: processId, p_offset: offset });
    check(error);
    return eventsSchema.parse(data);
  },
};
