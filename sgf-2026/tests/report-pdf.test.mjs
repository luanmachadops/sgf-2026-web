import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import {
  computeTableLayout,
  contentWidth,
  MIN_PRINT_FONT_PT,
} from "../web/src/lib/reports/layout.ts";
import {
  buildReportPdf,
  getPdfTextMeasurer,
} from "../web/src/lib/reports/pdf.ts";

const measurer = await getPdfTextMeasurer();

const column = (key, extra = {}) => ({ key, label: `Coluna ${key}`, ...extra });
const money = (key, extra = {}) =>
  column(key, { align: "right", format: "currency", total: "sum", ...extra });

// Mesma forma do relatório mais largo (Conciliação Fiscal: 18 colunas).
const wideColumns = [
  column("fiscalYear", { label: "Exercício", stackUnder: "process", format: "integer" }),
  column("process", { label: "Processo", anchor: true, priority: 1 }),
  column("instrument", { label: "Instrumento", stackUnder: "process" }),
  column("department", { label: "Secretaria", priority: 1 }),
  column("category", { label: "Categoria", stackUnder: "department" }),
  column("appropriation", { label: "Dotação" }),
  column("fundingSource", { label: "Fonte", stackUnder: "appropriation" }),
  column("simam", { label: "Código SIM-AM", priority: 3, stackUnder: "appropriation" }),
  money("planned", { label: "Teto" }),
  money("reserved", { label: "Reservado" }),
  money("realized", { label: "Realizado" }),
  money("disputed", { label: "Contestado", priority: 3 }),
  money("legacy", { label: "Legado conciliado", priority: 3 }),
  money("consumed", { label: "Consumido" }),
  money("remaining", { label: "Saldo" }),
  money("invoiced", { label: "Faturado" }),
  money("attested", { label: "Atestado" }),
  money("paid", { label: "Pago" }),
];

function wideRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    fiscalYear: 2026,
    process: `PE ${100 + index}/2026`,
    instrument: `Ata ${index} (Ata)`,
    department: index % 2 ? "Secretaria Municipal de Educação" : "Secretaria de Obras e Serviços Urbanos",
    category: "Combustível",
    appropriation: "02.010.04.122.0002.2003",
    fundingSource: "00100",
    simam: "3.3.90.30.01.00.00",
    planned: 125000.5 + index,
    reserved: 1200,
    realized: 98765.43,
    disputed: 0,
    legacy: 0,
    consumed: 99965.43,
    remaining: 25035.07,
    invoiced: 1000,
    attested: 900,
    paid: 800,
  }));
}

function blockWidth(block) {
  return block.cells.reduce((sum, cell) => sum + cell.width, 0);
}

test("tabela estreita fica em retrato e ocupa a largura útil", () => {
  const layout = computeTableLayout({
    columns: [column("plate", { label: "Placa" }), column("model", { label: "Modelo" }), money("cost", { label: "Valor" })],
    rows: [{ plate: "ABC1D23", model: "Fiat Strada", cost: 10 }],
    orientation: "auto",
    fontSize: 9,
  }, measurer);
  assert.equal(layout.orientation, "portrait");
  assert.equal(layout.status, "fits");
  assert.equal(layout.blocks.length, 1);
  assert.ok(Math.abs(blockWidth(layout.blocks[0]) - contentWidth("portrait")) < 0.5);
});

test("fonte nunca fica abaixo de 8 pt, mesmo pedindo menos", () => {
  const layout = computeTableLayout({ columns: wideColumns, rows: wideRows(5), orientation: "auto", fontSize: 5 }, measurer);
  assert.equal(layout.fontSize, MIN_PRINT_FONT_PT);
});

test("relatório de 18 colunas vira paisagem e nunca passa da largura da folha", () => {
  const layout = computeTableLayout({ columns: wideColumns, rows: wideRows(50), orientation: "auto", fontSize: 9 }, measurer);
  assert.equal(layout.orientation, "landscape");
  assert.equal(layout.autoLandscape, true);
  assert.equal(layout.fontSize, 9);
  for (const block of layout.blocks) {
    assert.ok(blockWidth(block) <= contentWidth("landscape") + 0.5, "bloco maior que a folha");
  }
  if (layout.status === "stacked") {
    const process = layout.blocks[0].cells.find((cell) => cell.column.key === "process");
    assert.deepEqual(process.children.map((child) => child.key), ["fiscalYear", "instrument"]);
  }
});

test("tabela larga demais é dividida em blocos repetindo a coluna-âncora", () => {
  const many = Array.from({ length: 30 }, (_, index) =>
    index === 0 ? column("id", { label: "Protocolo", anchor: true }) : money(`v${index}`, { label: `Valor ${index}` }));
  const rows = [Object.fromEntries(many.map((item) => [item.key, item.key === "id" ? "PROT-2026-0001" : 1234567.89]))];
  const layout = computeTableLayout({ columns: many, rows, orientation: "portrait", fontSize: 10 }, measurer);
  assert.equal(layout.status, "split");
  assert.equal(layout.orientation, "portrait");
  assert.ok(layout.blocks.length > 1);
  for (const block of layout.blocks) {
    assert.equal(block.cells[0].column.key, "id");
    assert.ok(blockWidth(block) <= contentWidth("portrait") + 0.5);
  }
  const printed = layout.blocks.flatMap((block) => block.cells.slice(1).map((cell) => cell.column.key));
  assert.equal(new Set(printed).size, 29, "cada coluna aparece em exatamente um bloco");
});

// ── PDF ────────────────────────────────────────────────────────────────────

function pdfStreams(bytes) {
  const raw = Buffer.from(bytes).toString("latin1");
  const out = [];
  const pattern = /stream\r?\n/g;
  let match;
  while ((match = pattern.exec(raw))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    const chunk = Buffer.from(raw.slice(start, end), "latin1");
    try {
      out.push(inflateSync(chunk).toString("latin1"));
    } catch {
      out.push(chunk.toString("latin1"));
    }
    pattern.lastIndex = end + "endstream".length;
  }
  return { raw, streams: out.join("\n") };
}

// WinAnsi = Latin-1 + pontuação em 0x80–0x9F (o TextDecoder do Node trata
// "windows-1252" como Latin-1 puro).
const WIN_ANSI_EXTRA = { 0x85: "…", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—" };
const winAnsi = {
  decode: (buffer) => [...buffer].map((byte) => WIN_ANSI_EXTRA[byte] ?? String.fromCharCode(byte)).join(""),
};

/** Texto desenhado (operadores Tj) decodificado de WinAnsi. */
function drawnText(streams) {
  const parts = [];
  for (const match of streams.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) {
    parts.push(winAnsi.decode(Buffer.from(match[1], "hex")));
  }
  return parts.join(" ");
}

const baseOptions = {
  reportTitle: "Conciliação Fiscal das Licitações",
  reportDescription: "Teto, reserva, realização, faturamento, ateste e pagamento.",
  filters: { periodLabel: "Último ano", departmentLabel: "Todas as secretarias" },
  branding: { name: "Prefeitura Municipal de Tapejara", city: "Tapejara", state: "PR", cnpj: "00.000.000/0001-00" },
  issuedAt: new Date(2026, 9, 12, 10, 30),
};

test("PDF é vetorial: texto real, sem imagens e leve", async () => {
  const bytes = await buildReportPdf({
    ...baseOptions,
    dataset: {
      columns: wideColumns,
      rows: wideRows(300),
      kpis: [{ label: "Dotações", value: "300" }, { label: "Teto planejado", value: "R$ 37.500.000" }],
      charts: [
        { title: "Consumo por secretaria", type: "bar", valueFormat: "currency", data: [{ label: "Obras", value: 10 }, { label: "Educação", value: 7 }] },
        { title: "Situação", type: "donut", valueFormat: "integer", data: [{ label: "Pago", value: 3 }, { label: "Aberto", value: 1 }] },
      ],
      notes: ["Valores conferidos com a contabilidade."],
    },
  });
  const { raw, streams } = pdfStreams(bytes);
  assert.ok(!/\/Subtype\s*\/Image/.test(raw + streams), "PDF sem brasão não deve conter imagem");
  assert.ok(!/\/FontFile/.test(raw + streams), "fontes padrão não são embutidas");
  const textContent = drawnText(streams);
  assert.match(textContent, /CONCILIAÇÃO|Conciliação/);
  assert.match(textContent, /Secretaria Municipal de Educação/);
  assert.match(textContent, /Total \(300 registros\)/);
  assert.match(textContent, /Página 1 de \d+/);
  const pages = (raw + streams).match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
  assert.ok(pages >= 5, `esperava várias páginas, veio ${pages}`);
  // Meta do plano: 10 páginas de tabela abaixo de 150 KB.
  const perPage = bytes.length / pages;
  assert.ok(perPage * 10 < 150 * 1024, `${pages} páginas, ${Math.round(bytes.length / 1024)} KB`);
  assert.match(raw + streams, /Conciliação Fiscal|\/Title/);
});

test("brasão é embutido uma única vez para todas as páginas", async () => {
  // PNG 1x1 transparente.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  const bytes = await buildReportPdf({
    ...baseOptions,
    logo: { bytes: new Uint8Array(png), type: "png" },
    dataset: { columns: wideColumns, rows: wideRows(200), kpis: [] },
  });
  const { raw, streams } = pdfStreams(bytes);
  const images = (raw + streams).match(/\/Subtype\s*\/Image/g) ?? [];
  // PNG com transparência = imagem + máscara alfa (SMask), uma vez só.
  const alphaMasks = (raw + streams).match(/\/SMask\s+\d+\s+0\s+R/g) ?? [];
  assert.equal(images.length - alphaMasks.length, 1);
  assert.ok(alphaMasks.length <= 1);
  const pageCount = (drawnText(streams).match(/Página \d+ de (\d+)/) ?? [])[1];
  assert.ok(Number(pageCount) > 1);
});

test("caracteres fora do WinAnsi não quebram a geração", async () => {
  const bytes = await buildReportPdf({
    ...baseOptions,
    dataset: {
      columns: [column("text", { label: "Texto" })],
      rows: [{ text: "Emoji 🚗 e espaço fino — ok" }],
      kpis: [],
    },
  });
  assert.match(drawnText(pdfStreams(bytes).streams), /Emoji \? e espaço fino — ok/);
});
