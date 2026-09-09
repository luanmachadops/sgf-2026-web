// SIM-AM 2026 licitações v1.2b, published 03/09/2026. Reconciliation only.
export const PARANA_FIELDS = [
  ["idPessoa", "Código da entidade no TCE-PR", 7],
  ["idTipoInstrumentoConvocatorio", "Código do instrumento convocatório", 2],
  ["idTipoDocOrigemLicitacao", "Código do tipo de documento de origem", 2],
  [
    "nrDocOrigemLicitacao",
    "Documento da entidade de origem (sem pontuação)",
    15,
  ],
  ["nrLicitacao", "Número da licitação", 9],
  ["nrAnoLicitacao", "Ano da licitação", 4],
  ["idModalidadeLicitacao", "Código da modalidade no SIM-AM", 2],
] as const;
export type ParanaField = (typeof PARANA_FIELDS)[number][0];
export type ParanaReporting = Partial<Record<ParanaField, string>> & {
  dotacoes?: Record<string, string>;
};
interface ReportContract {
  reference: string;
  fiscal_year: number;
  category: string;
  reporting?: ParanaReporting;
  allocations: Array<{
    department_id: string;
    department_name: string;
    funding_source: string;
    spending_limit: number;
    reserved: number;
    realized: number;
    disputed: number;
    available: number;
  }>;
}
export function paranaReviewRows(contracts: ReportContract[]): string[][] {
  const rows = [
    [
      "Tipo de arquivo",
      "Licitação",
      "Exercício",
      "Categoria",
      "Secretaria",
      ...PARANA_FIELDS.map((f) => f[0]),
      "nrDotacaoOrcamentaria",
      "Fonte informada",
      "Cota",
      "Reservado",
      "Realizado",
      "Contestação",
      "Disponível",
      "Pendências de conferência",
    ],
  ];
  for (const c of contracts)
    for (const a of c.allocations) {
      const r = c.reporting ?? {};
      const missing = PARANA_FIELDS.filter(([key]) => !r[key]?.trim()).map(
        ([, label]) => label as string,
      );
      const dotacao = r.dotacoes?.[a.department_id] ?? "";
      if (!/^\d{28}$/.test(dotacao))
        missing.push("Dotação completa de 28 dígitos");
      if (!a.funding_source.trim()) missing.push("Fonte de recursos");
      rows.push([
        "CONFERÊNCIA — NÃO É REMESSA SIM-AM",
        c.reference,
        String(c.fiscal_year),
        c.category,
        a.department_name,
        ...PARANA_FIELDS.map(([key]) => r[key] ?? ""),
        dotacao,
        a.funding_source,
        ...[
          a.spending_limit,
          a.reserved,
          a.realized,
          a.disputed,
          a.available,
        ].map((n) => n.toFixed(2).replace(".", ",")),
        missing.length
          ? missing.join(" | ")
          : "Conferir códigos oficiais, exercício, empenhos e documentos na contabilidade",
      ]);
    }
  return rows;
}
export function paranaReviewCsv(contracts: ReportContract[]): string {
  const cell = (value: string) =>
    '"' + value.replace(/^[\s]*[=+@-]/, "'$&").replaceAll('"', '""') + '"';
  return (
    "\uFEFF" +
    paranaReviewRows(contracts)
      .map((row) => row.map(cell).join(";"))
      .join("\r\n")
  );
}
