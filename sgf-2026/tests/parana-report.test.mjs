import { test } from "node:test";
import assert from "node:assert/strict";
import {
  paranaReviewRows,
  paranaReviewCsv,
  PARANA_FIELDS,
} from "../web/src/lib/parana-budget-report.ts";
const contract = {
  reference: "Pregão 24",
  fiscal_year: 2026,
  category: "fuel",
  allocations: [
    {
      department_id: "d",
      department_name: "Obras",
      funding_source: "00100",
      spending_limit: 100,
      reserved: 20,
      realized: 30,
      disputed: 5,
      available: 45,
    },
  ],
};
test("conferência destaca dados ausentes sem declarar remessa oficial", () => {
  const row = paranaReviewRows([contract])[1];
  assert.match(row[0], /NÃO É REMESSA/);
  assert.match(row.at(-1), /Código da entidade/);
  assert.match(row.at(-1), /28 dígitos/);
  assert.ok(row.includes("45,00"));
});
test("códigos preservam zeros e não dispensam conferência contábil", () => {
  const reporting = Object.fromEntries(PARANA_FIELDS.map(([k]) => [k, "01"]));
  reporting.dotacoes = { d: "0".repeat(28) };
  const row = paranaReviewRows([{ ...contract, reporting }])[1];
  assert.ok(row.includes("0".repeat(28)));
  assert.match(row.at(-1), /Conferir códigos oficiais/);
});
test("CSV neutraliza fórmula e escapa aspas e separadores", () => {
  const csv = paranaReviewCsv([
    { ...contract, reference: ' =HYPERLINK("x");' },
  ]);
  assert.ok(csv.includes("' =HYPERLINK("));
  assert.ok(csv.includes('""x""'));
  assert.ok(csv.startsWith("\uFEFF"));
});
