import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useHeader } from "@/contexts/HeaderContext";
import { SGFButton } from "@/components/sgf/SGFButton";
import { SGFCard } from "@/components/sgf/SGFCard";
import { SGFInput } from "@/components/sgf/SGFInput";
import { SGFCurrencyInput } from "@/components/sgf/SGFCurrencyInput";
import { SGFSelect } from "@/components/sgf/SGFSelect";
import { Modal } from "@/components/ui/Modal";
import {
  departmentBudgetApi,
  type BudgetPayload,
  type DepartmentBudget,
} from "@/lib/department-budget-api";
import {
  departmentsApi,
  stationsApi,
  repairShopsApi,
} from "@/lib/supabase-api";

const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (s: string) =>
  new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR");
const categoryName = {
  fuel: "Combustível e operações dos postos",
  maintenance: "Manutenção",
};
const PAGE_SIZE = 10;
/** Dotação e fonte são obrigatórias no banco; aqui a contabilidade não as informa. */
const NOT_INFORMED = "Não informado";
const DEFAULT_REASON = "Atualização dos limites por secretaria";
/** Consumo (reservado + realizado + contestado) em relação ao limite, de 0 a 100+. */
const usagePercent = (a: { spending_limit: number; available: number }) =>
  a.spending_limit > 0 ? ((a.spending_limit - a.available) / a.spending_limit) * 100 : 0;

function exportSummary(contracts: DepartmentBudget[]) {
  const cell = (v: string | number) =>
    `"${String(v)
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""')}"`;
  const rows: Array<Array<string | number>> = [
    [
      "Exercício",
      "Licitação/contrato",
      "Categoria",
      "Secretaria",
      "Empenho(s)",
      "Valor empenhado (limite)",
      "Reservado",
      "Realizado",
      "Em contestação",
      "Disponível",
      "Consumo",
    ],
  ];
  contracts.forEach((c) =>
    c.allocations.forEach((a) =>
      rows.push([
        c.fiscal_year,
        c.reference,
        categoryName[c.category],
        a.department_name,
        c.reporting?.empenhos?.[a.department_id] ?? "",
        a.spending_limit,
        a.reserved,
        a.realized,
        a.disputed,
        a.available,
        `${Math.round(usagePercent(a))}%`,
      ]),
    ),
  );
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "limites-por-secretaria.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function BudgetEditor({
  contract,
  category,
  year,
  onClose,
}: {
  contract: DepartmentBudget | null;
  category: "fuel" | "maintenance";
  year: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const departments = useQuery({
    queryKey: ["departments", "budget-editor"],
    queryFn: departmentsApi.getAll,
  });
  const partners = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["budget-partners", category],
    queryFn: async () => {
      const rows =
        category === "fuel"
          ? await stationsApi.getAll()
          : await repairShopsApi.getAll();
      return rows.map(({ id, name }) => ({ id, name }));
    },
  });
  const [form, setForm] = useState<BudgetPayload>(() => ({
    id: contract?.id,
    version: contract?.version,
    category,
    reference: contract?.reference ?? "",
    fiscal_year: year,
    starts_on: contract?.starts_on ?? `${year}-01-01`,
    ends_on: contract?.ends_on ?? `${year}-12-31`,
    total_limit: contract?.total_limit ?? 0,
    partner_ids: contract?.partner_ids ?? [],
    reason: "",
    reporting: contract?.reporting ?? {},
    allocations:
      contract?.allocations.map((a) => ({
        department_id: a.department_id,
        spending_limit: a.spending_limit,
        appropriation: a.appropriation,
        funding_source: a.funding_source,
      })) ?? [],
  }));
  const [error, setError] = useState("");
  const [departmentPage, setDepartmentPage] = useState(0);
  const [search, setSearch] = useState("");
  const save = useMutation({
    mutationFn: departmentBudgetApi.save,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["department-budgets"] });
      void qc.invalidateQueries({ queryKey: ["budget-events"] });
      toast.success("Limites registrados com histórico de auditoria.");
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });
  const allocated = form.allocations.reduce((s, a) => s + a.spending_limit, 0);
  const updateAllocation = (
    id: string,
    patch: Partial<BudgetPayload["allocations"][number]>,
  ) =>
    setForm((f) => {
      const existing = f.allocations.find((a) => a.department_id === id);
      const next = {
        department_id: id,
        spending_limit: 0,
        appropriation: NOT_INFORMED,
        funding_source: NOT_INFORMED,
        ...existing,
        ...patch,
      };
      return {
        ...f,
        allocations: [
          ...f.allocations.filter((a) => a.department_id !== id),
          next,
        ],
      };
    });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (allocated > form.total_limit + 0.001)
      return setError("A soma das cotas ultrapassa o teto global.");
    if (!form.allocations.length || !form.partner_ids.length)
      return setError("Selecione fornecedores e ao menos uma secretaria.");
    if (form.total_limit <= 0)
      return setError("Informe o teto total da licitação.");
    const reason = form.reason.trim();
    // Só envia os números de empenho preenchidos (e só a chave se houver algum).
    const empenhos = Object.fromEntries(
      Object.entries(form.reporting?.empenhos ?? {})
        .map(([id, value]) => [id, value.trim()])
        .filter(([id, value]) => value && form.allocations.some((a) => a.department_id === id)),
    );
    const { empenhos: _drop, ...reportingRest } = form.reporting ?? {};
    void _drop;
    save.mutate({
      ...form,
      reporting: Object.keys(empenhos).length ? { ...reportingRest, empenhos } : reportingRest,
      reason: reason.length >= 10 ? reason : reason ? `${DEFAULT_REASON}: ${reason}` : DEFAULT_REASON,
    });
  };
  const departmentRows = (departments.data ?? []).filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Modal
      isOpen
      onClose={save.isPending ? () => {} : onClose}
      title={
        contract ? "Revisar limites da licitação" : "Nova licitação e limites"
      }
      size="xl"
    >
      <form onSubmit={submit} className="space-y-5">
        <p className="text-sm text-slate-600">
          {categoryName[category]} · Exercício {year}. Informe, para cada
          secretaria, o valor que a contabilidade empenhou nesta licitação. Ao
          salvar, abastecimentos e ordens de serviço dos fornecedores marcados
          passam a respeitar esse valor. Quando houver reforço ou anulação de
          empenho, revise aqui.
        </p>
        {!contract && (
          <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
            O saldo inicial considera as despesas já registradas no período e as
            reservas em aberto. Confira a lotação dos veículos antes de salvar.
            Reservas vencidas precisam ser canceladas para liberar a cota.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <SGFInput
            label="Licitação (número ou referência)"
            value={form.reference}
            disabled={Boolean(contract)}
            required
            maxLength={160}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
          />
          <SGFCurrencyInput
            label="Teto total da licitação no exercício"
            value={form.total_limit}
            required
            onChange={(value) => setForm({ ...form, total_limit: value })}
          />
          <SGFInput
            label="Início da vigência"
            type="date"
            value={form.starts_on}
            disabled={Boolean(contract)}
            required
            onChange={(e) => setForm({ ...form, starts_on: e.target.value })}
          />
          <SGFInput
            label="Fim da vigência"
            type="date"
            value={form.ends_on}
            disabled={Boolean(contract)}
            required
            onChange={(e) => setForm({ ...form, ends_on: e.target.value })}
          />
        </div>
        <fieldset
          disabled={Boolean(contract) || save.isPending}
          className="rounded-xl border border-slate-200 p-4"
        >
          <legend className="px-2 font-semibold">
            Fornecedores desta licitação
          </legend>
          {partners.isPending && <p>Carregando fornecedores…</p>}
          {partners.error && <p role="alert">{partners.error.message}</p>}
          <div className="grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">
            {partners.data?.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.partner_ids.includes(p.id)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      partner_ids: e.target.checked
                        ? [...form.partner_ids, p.id]
                        : form.partner_ids.filter((id) => id !== p.id),
                    })
                  }
                />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Valor empenhado por secretaria</h3>
          <p
            className={
              allocated > form.total_limit ? "text-red-600" : "text-slate-600"
            }
          >
            Distribuído: {money(allocated)} · A distribuir:{" "}
            {money(form.total_limit - allocated)}
          </p>
        </div>
        <SGFInput
          label="Buscar secretaria"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setDepartmentPage(0);
          }}
        />
        {departments.error && <p role="alert">{departments.error.message}</p>}
        {departmentRows
          .slice(departmentPage * PAGE_SIZE, (departmentPage + 1) * PAGE_SIZE)
          .map((d) => {
            const a = form.allocations.find((a) => a.department_id === d.id);
            return (
              <div
                key={d.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={Boolean(a)}
                    disabled={Boolean(
                      contract?.allocations.some(
                        (x) => x.department_id === d.id,
                      ),
                    )}
                    onChange={(e) =>
                      e.target.checked
                        ? updateAllocation(d.id, {})
                        : setForm({
                            ...form,
                            allocations: form.allocations.filter(
                              (a) => a.department_id !== d.id,
                            ),
                            reporting: {
                              ...form.reporting,
                              empenhos: Object.fromEntries(
                                Object.entries(form.reporting?.empenhos ?? {}).filter(([id]) => id !== d.id),
                              ),
                            },
                          })
                    }
                  />
                  {d.name}
                </label>
                {a && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <SGFCurrencyInput
                      label="Valor empenhado pela secretaria"
                      hint="O consumo desta secretaria não pode passar deste valor."
                      value={a.spending_limit}
                      required
                      onChange={(value) => updateAllocation(d.id, { spending_limit: value })}
                    />
                    <SGFInput
                      label="Nº do(s) empenho(s) (opcional)"
                      hint="Referência para a conferência com a contabilidade."
                      value={form.reporting?.empenhos?.[d.id] ?? ""}
                      maxLength={200}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          reporting: {
                            ...form.reporting,
                            empenhos: { ...form.reporting?.empenhos, [d.id]: e.target.value },
                          },
                        })
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        <div className="flex justify-end gap-2">
          <SGFButton
            type="button"
            variant="ghost"
            disabled={!departmentPage}
            onClick={() => setDepartmentPage((p) => p - 1)}
          >
            Anterior
          </SGFButton>
          <SGFButton
            type="button"
            variant="ghost"
            disabled={(departmentPage + 1) * PAGE_SIZE >= departmentRows.length}
            onClick={() => setDepartmentPage((p) => p + 1)}
          >
            Próxima
          </SGFButton>
        </div>
        <SGFInput
          label="Observação (opcional)"
          hint="Ex.: número do processo, motivo do remanejamento. Fica registrada no histórico."
          value={form.reason}
          maxLength={2000}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
        />
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <SGFButton
            type="button"
            variant="ghost"
            disabled={save.isPending}
            onClick={onClose}
          >
            Cancelar
          </SGFButton>
          <SGFButton
            type="submit"
            loading={save.isPending}
            disabled={
              departments.isPending ||
              partners.isPending ||
              Boolean(departments.error || partners.error)
            }
          >
            Salvar limites
          </SGFButton>
        </div>
      </form>
    </Modal>
  );
}

function describeSnapshot(value: unknown, contract: DepartmentBudget): string {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return "Sem registro anterior";
  const row = value as Record<string, unknown>;
  if (!("contract" in row) && !("source_type" in row))
    return JSON.stringify(row, null, 2);
  const departmentName = (id: unknown) =>
    contract.allocations.find((a) => a.department_id === id)?.department_name ??
    String(id ?? "");
  if ("source_type" in row) {
    const labels: Record<string, string> = {
      fuelings: "Abastecimento",
      service_orders: "Ordem de serviço",
      station_operations: "Operação do posto",
    };
    return [
      `${labels[String(row.source_type)] ?? "Despesa"} · ${row.source_id}`,
      departmentName(row.department_id),
      `Reservado: ${money(Number(row.reserved ?? 0))}`,
      `Realizado: ${money(Number(row.realized ?? 0))}`,
      `Em contestação: ${money(Number(row.disputed ?? 0))}`,
    ].join("\n");
  }
  const details =
    row.contract && typeof row.contract === "object"
      ? (row.contract as Record<string, unknown>)
      : {};
  const lines = [
    `${details.reference ?? contract.reference}`,
    `Teto total: ${money(Number(details.total_limit ?? 0))}`,
  ];
  if (Array.isArray(row.allocations))
    for (const item of row.allocations) {
      if (!item || typeof item !== "object") continue;
      const a = item as Record<string, unknown>;
      lines.push(
        `${departmentName(a.department_id)}: ${money(Number(a.spending_limit ?? 0))}`,
      );
    }
  return lines.join("\n");
}

function BudgetHistory({
  contract,
  onClose,
}: {
  contract: DepartmentBudget;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["budget-events", contract.id, page],
    queryFn: () => departmentBudgetApi.events(contract.id, page * 25),
  });
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Histórico · ${contract.reference}`}
      size="xl"
    >
      {query.isPending && <p>Carregando histórico…</p>}
      {query.error && <p role="alert">{query.error.message}</p>}
      <div className="space-y-3">
        {query.data?.items.map((e) => (
          <details
            key={e.id}
            className="rounded-xl border border-slate-200 p-3"
          >
            <summary className="cursor-pointer text-sm">
              <strong>{new Date(e.occurred_at).toLocaleString("pt-BR")}</strong>{" "}
              · {e.actor_name ?? "Sistema"} · {e.reason}
            </summary>
            <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <p className="font-semibold">Antes</p>
                <pre className="overflow-auto whitespace-pre-wrap">
                  {describeSnapshot(e.before_value, contract)}
                </pre>
              </div>
              <div>
                <p className="font-semibold">Depois</p>
                <pre className="overflow-auto whitespace-pre-wrap">
                  {describeSnapshot(e.after_value, contract)}
                </pre>
              </div>
            </div>
          </details>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm">
          {query.data?.total ?? 0} eventos · Página {page + 1}
        </p>
        <div className="flex gap-2">
          <SGFButton
            variant="ghost"
            disabled={!page}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </SGFButton>
          <SGFButton
            variant="ghost"
            disabled={(page + 1) * 25 >= (query.data?.total ?? 0)}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </SGFButton>
        </div>
      </div>
    </Modal>
  );
}

export default function DepartmentBudgets() {
  const { user } = useAuth();
  const { setTitle, setDescription } = useHeader();
  useEffect(() => {
    setTitle("Limites por secretaria");
    setDescription(
      "Teto de consumo de cada secretaria em cada licitação de combustível e manutenção.",
    );
  }, [setTitle, setDescription]);
  // A tela fica dentro de Secretarias; secretário (sem acesso a Secretarias) usa esta rota.
  if (!user?.departmentScopeId) return <Navigate to="/secretarias#limites" replace />;
  return <DepartmentBudgetsSection />;
}

/**
 * Valor empenhado por secretaria em cada licitação. Fica na página de
 * Secretarias (`embedded`), logo abaixo dos cards, e na rota /limites.
 */
export function DepartmentBudgetsSection({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [category, setCategory] = useState<"fuel" | "maintenance">("fuel");
  const [editor, setEditor] = useState<DepartmentBudget | "new" | null>(null);
  const [history, setHistory] = useState<DepartmentBudget | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["department-budgets", user?.tenantId, year],
    queryFn: () => departmentBudgetApi.list(year),
    refetchInterval: 30_000,
  });
  const canEdit = user?.accountRole === "admin";
  const canAudit = ["admin", "gestor"].includes(user?.accountRole ?? "");
  const contracts = (query.data ?? []).filter(
    (c) =>
      c.category === category &&
      c.reference.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-6" id="limites">
      {embedded && (
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Limites por secretaria</h3>
          <p className="text-sm text-slate-500">
            Valor empenhado por cada secretaria em cada licitação de combustível e manutenção.
          </p>
        </div>
      )}
      <SGFCard>
        <p className="text-sm text-slate-600">
          Para cada licitação, informe os fornecedores e o valor que cada
          secretaria empenhou. O sistema acompanha o consumo e bloqueia o
          abastecimento ou a ordem de serviço que passaria do valor empenhado
          (Lei 4.320/64, art. 60). Licitação, empenho, liquidação, pagamento e
          prestação de contas continuam com a contabilidade.
        </p>
      </SGFCard>
      <div className="flex flex-wrap items-end gap-3">
        <SGFSelect
          label="Tipo de despesa"
          value={category}
          options={Object.entries(categoryName).map(([value, label]) => ({
            value,
            label,
          }))}
          onChange={(v) => {
            setCategory(v as "fuel" | "maintenance");
            setPage(0);
          }}
        />
        <SGFInput
          label="Exercício"
          type="number"
          min={2020}
          max={2200}
          value={year}
          onChange={(e) => {
            const y = Number(e.target.value);
            if (y >= 2020 && y <= 2200) {
              setYear(y);
              setPage(0);
            }
          }}
        />
        <SGFInput
          label="Buscar licitação"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <SGFButton
          variant="outline"
          disabled={!contracts.length}
          onClick={() => exportSummary(contracts)}
        >
          Exportar CSV
        </SGFButton>
        {canEdit && (
          <SGFButton onClick={() => setEditor("new")}>
            Nova licitação
          </SGFButton>
        )}
      </div>
      {query.isPending && <p role="status">Carregando limites…</p>}
      {query.error && (
        <SGFCard>
          <p role="alert" className="text-red-700">
            {query.error.message}
          </p>
          <SGFButton variant="ghost" onClick={() => void query.refetch()}>
            Tentar novamente
          </SGFButton>
        </SGFCard>
      )}
      {!query.isPending && !query.error && !contracts.length && (
        <SGFCard>
          <h2 className="font-semibold">
            Nenhuma licitação com limites neste filtro
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Cadastre a licitação, vincule os fornecedores e defina o limite de
            cada secretaria. Fornecedores fora de uma licitação não têm limite
            por secretaria.
          </p>
        </SGFCard>
      )}
      {contracts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((c) => (
        <ContractCard
          key={c.id}
          contract={c}
          canEdit={canEdit}
          canAudit={canAudit}
          onEdit={() => setEditor(c)}
          onHistory={() => setHistory(c)}
        />
      ))}
      {contracts.length > PAGE_SIZE && (
        <div className="flex justify-end gap-2">
          <SGFButton
            variant="ghost"
            disabled={!page}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </SGFButton>
          <SGFButton
            variant="ghost"
            disabled={(page + 1) * PAGE_SIZE >= contracts.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </SGFButton>
        </div>
      )}
      {editor && (
        <BudgetEditor
          contract={editor === "new" ? null : editor}
          year={year}
          category={category}
          onClose={() => setEditor(null)}
        />
      )}
      {history && (
        <BudgetHistory contract={history} onClose={() => setHistory(null)} />
      )}
    </div>
  );
}

function ContractCard({
  contract: c,
  canEdit,
  canAudit,
  onEdit,
  onHistory,
}: {
  contract: DepartmentBudget;
  canEdit: boolean;
  canAudit: boolean;
  onEdit: () => void;
  onHistory: () => void;
}) {
  const [page, setPage] = useState(0);
  const allocated = c.allocations.reduce((s, a) => s + a.spending_limit, 0);
  return (
    <SGFCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{c.reference}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {date(c.starts_on)} a {date(c.ends_on)} · {c.partner_ids.length}{" "}
            fornecedor(es) · Revisão {c.version}
          </p>
        </div>
        <div className="flex gap-2">
          {canAudit && (
            <SGFButton variant="ghost" onClick={onHistory}>
              Histórico
            </SGFButton>
          )}
          {canEdit && (
            <SGFButton variant="outline" onClick={onEdit}>
              Revisar limites
            </SGFButton>
          )}
        </div>
      </div>
      <div className="my-5 grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-slate-500">Teto total no exercício</p>
          <p className="text-xl font-bold">{money(c.total_limit)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Distribuído às secretarias</p>
          <p className="text-xl font-bold">{money(allocated)}</p>
        </div>
        {canAudit && (
          <div>
            <p className="text-xs text-slate-500">Ainda não distribuído</p>
            <p className="text-xl font-bold">
              {money(c.total_limit - allocated)}
            </p>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-slate-500">
              {[
                "Secretaria",
                "Consumo",
                "Empenhado",
                "Reservado",
                "Realizado",
                "Em contestação",
                "Disponível",
              ].map((x) => (
                <th key={x} className="p-3">
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.allocations
              .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
              .map((a) => (
                <tr key={a.department_id} className="border-b border-slate-100">
                  <td className="p-3">
                    <p className="font-semibold">{a.department_name}</p>
                    {c.reporting?.empenhos?.[a.department_id] && (
                      <p className="text-xs text-slate-500">Empenho {c.reporting.empenhos[a.department_id]}</p>
                    )}
                  </td>
                  <td className="p-3">
                    <UsageBar percent={usagePercent(a)} />
                  </td>
                  <td className="p-3">{money(a.spending_limit)}</td>
                  <td className="p-3">{money(a.reserved)}</td>
                  <td className="p-3">{money(a.realized)}</td>
                  <td className="p-3">{money(a.disputed)}</td>
                  <td
                    className={`p-3 font-semibold ${a.available <= 0 ? "text-red-600" : a.available <= a.spending_limit * 0.2 ? "text-amber-600" : "text-[var(--sgf-primary)]"}`}
                  >
                    {money(a.available)}
                    {a.available <= 0 ? (
                      <p className="text-xs">Sem saldo: peça reforço de empenho</p>
                    ) : usagePercent(a) >= 80 ? (
                      <p className="text-xs">Avise a contabilidade sobre reforço</p>
                    ) : null}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {c.allocations.length > PAGE_SIZE && (
        <div className="mt-3 flex justify-end gap-2">
          <SGFButton
            variant="ghost"
            disabled={!page}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </SGFButton>
          <SGFButton
            variant="ghost"
            disabled={(page + 1) * PAGE_SIZE >= c.allocations.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </SGFButton>
        </div>
      )}
    </SGFCard>
  );
}

/** Barra de consumo: verde até 80%, âmbar até 100%, vermelho acima. */
function UsageBar({ percent }: { percent: number }) {
  const value = Math.max(0, percent);
  const tone =
    value >= 100 ? "bg-[#DC2626]" : value >= 80 ? "bg-[#F59E0B]" : "bg-[var(--sgf-primary)]";
  return (
    <div className="min-w-[110px]">
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <p className={`mt-1 text-xs font-semibold ${value >= 100 ? "text-red-600" : value >= 80 ? "text-amber-600" : "text-slate-500"}`}>
        {Math.round(value)}%{value >= 80 && value < 100 ? " · atenção" : ""}
      </p>
    </div>
  );
}
