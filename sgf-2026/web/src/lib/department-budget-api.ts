import type { ParanaReporting } from "./parana-budget-report";
import { z } from "zod";
import { supabase } from "./supabase";
import type { Json } from "@/types/database.types";

const allocationSchema = z.object({
  department_id: z.string(),
  department_name: z.string(),
  spending_limit: z.number(),
  appropriation: z.string(),
  funding_source: z.string(),
  reserved: z.number(),
  realized: z.number(),
  disputed: z.number(),
  available: z.number(),
});
const contractSchema = z.object({
  reporting: z
    .object({
      idPessoa: z.string().optional(),
      nrLicitacao: z.string().optional(),
      nrAnoLicitacao: z.string().optional(),
      idTipoInstrumentoConvocatorio: z.string().optional(),
      idModalidadeLicitacao: z.string().optional(),
      idTipoDocOrigemLicitacao: z.string().optional(),
      nrDocOrigemLicitacao: z.string().optional(),
      dotacoes: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  id: z.string(),
  category: z.enum(["fuel", "maintenance"]),
  reference: z.string(),
  fiscal_year: z.number(),
  starts_on: z.string(),
  ends_on: z.string(),
  total_limit: z.number(),
  version: z.number(),
  partner_ids: z.array(z.string()),
  allocations: z.array(allocationSchema),
});
const eventSchema = z.object({
  id: z.number(),
  actor_name: z.string().nullable(),
  event_type: z.string(),
  reason: z.string(),
  occurred_at: z.string(),
  before_value: z.unknown(),
  after_value: z.unknown(),
});
export type DepartmentBudget = z.infer<typeof contractSchema>;
export type BudgetAllocation = z.infer<typeof allocationSchema>;
export interface BudgetPayload {
  reporting?: ParanaReporting;
  id?: string;
  version?: number;
  category: "fuel" | "maintenance";
  reference: string;
  fiscal_year: number;
  starts_on: string;
  ends_on: string;
  total_limit: number;
  partner_ids: string[];
  reason: string;
  allocations: Array<
    Pick<
      BudgetAllocation,
      "department_id" | "spending_limit" | "appropriation" | "funding_source"
    >
  >;
}
function check(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "PGRST202")
    throw new Error(
      "O painel de limites ainda precisa ser habilitado no banco pela implantação.",
    );
  throw new Error(error.message);
}
export const departmentBudgetApi = {
  async list(year: number): Promise<DepartmentBudget[]> {
    const { data, error } = await supabase.rpc("get_department_budgets", {
      p_year: year,
    });
    check(error);
    return z.array(contractSchema).parse(data);
  },
  async save(payload: BudgetPayload) {
    const { data, error } = await supabase.rpc("save_department_budget", {
      p_payload: { ...payload } as Json,
    });
    check(error);
    return data;
  },
  async events(contractId: string, offset: number) {
    const { data, error } = await supabase.rpc("get_department_budget_events", {
      p_contract_id: contractId,
      p_offset: offset,
    });
    check(error);
    return z
      .object({ total: z.number(), items: z.array(eventSchema) })
      .parse(data);
  },
};
