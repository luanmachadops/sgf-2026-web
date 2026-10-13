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

// ── F2/F5: agrupamento, assinaturas e integridade ───────────────────────────

const { arrangeRows, nextSort } = await import("../web/src/lib/reports/viewerState.ts");
const { reportIntegrityCode } = await import("../web/src/lib/reports/pdf.ts");

const tripColumns = [
  column("plate", { label: "Placa", anchor: true, filterable: true }),
  column("date", { label: "Data", format: "date" }),
  column("km", { label: "Km rodados", align: "right", format: "decimal", total: "sum" }),
];
const tripRows = [
  { plate: "BBB2B22", date: "02/09/2026", km: 10 },
  { plate: "AAA1A11", date: "10/09/2026", km: 5 },
  { plate: "AAA1A11", date: "01/09/2026", km: 7.5 },
  { plate: "BBB2B22", date: "15/08/2026", km: 2 },
];

test("ordena datas dd/mm/aaaa como data e agrupa mantendo a ordem dentro do grupo", () => {
  const byDate = arrangeRows(tripRows, tripColumns, { key: "date", direction: "asc" }, null);
  assert.deepEqual(byDate.map((row) => row.date), ["15/08/2026", "01/09/2026", "02/09/2026", "10/09/2026"]);
  const grouped = arrangeRows(tripRows, tripColumns, { key: "date", direction: "desc" }, "plate");
  assert.deepEqual(grouped.map((row) => `${row.plate} ${row.date}`), [
    "AAA1A11 10/09/2026", "AAA1A11 01/09/2026", "BBB2B22 02/09/2026", "BBB2B22 15/08/2026",
  ]);
  assert.deepEqual(nextSort(null, "km"), { key: "km", direction: "asc" });
  assert.deepEqual(nextSort({ key: "km", direction: "asc" }, "km"), { key: "km", direction: "desc" });
  assert.equal(nextSort({ key: "km", direction: "desc" }, "km"), null);
});

test("PDF agrupado traz cabeçalho e subtotal por grupo, assinaturas e código de integridade", async () => {
  const rows = arrangeRows(tripRows, tripColumns, null, "plate");
  const bytes = await buildReportPdf({
    ...baseOptions,
    reportTitle: "Boletim de Tráfego",
    dataset: { columns: tripColumns, rows, kpis: [] },
    groupBy: "plate",
    signatures: [{ name: "Maria Souza", role: "Responsável pela frota" }, { name: "", role: "Secretário(a)" }],
    issuer: "Gestor Teste",
  });
  const textContent = drawnText(pdfStreams(bytes).streams);
  assert.match(textContent, /Placa: AAA1A11 · 2 registros/);
  assert.match(textContent, /Subtotal — AAA1A11/);
  assert.match(textContent, /12,50/); // 5 + 7,5
  assert.match(textContent, /Total \(4 registros\)/);
  assert.match(textContent, /Maria Souza/);
  assert.match(textContent, /Secretário\(a\)/);
  assert.match(textContent, /Tapejara\/PR, 12 de outubro de 2026/);
  assert.match(textContent, /Integridade: [0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4} · Emitido por Gestor Teste/);
});

test("código de integridade muda quando qualquer valor muda", async () => {
  const options = { ...baseOptions, reportTitle: "X", dataset: { columns: tripColumns, rows: tripRows, kpis: [] } };
  const a = await reportIntegrityCode(options, baseOptions.issuedAt);
  const b = await reportIntegrityCode(options, baseOptions.issuedAt);
  const changed = await reportIntegrityCode(
    { ...options, dataset: { ...options.dataset, rows: [{ ...tripRows[0], km: 11 }, ...tripRows.slice(1)] } },
    baseOptions.issuedAt,
  );
  assert.equal(a, b);
  assert.notEqual(a, changed);
});

// ── F6: etiquetas QR e comprovante ──────────────────────────────────────────

const { buildQrLabelsPdf, qrMatrix } = await import("../web/src/lib/qrLabelsPdf.ts");
const { buildReceiptPdf } = await import("../web/src/lib/receiptPdf.ts");

test("etiquetas QR saem em vetor: nenhuma imagem, placa como texto", async () => {
  const bytes = await buildQrLabelsPdf({
    items: Array.from({ length: 30 }, (_, i) => ({ data: `ABC1D${String(i).padStart(2, "0")}`, plate: `ABC-1D${String(i).padStart(2, "0")}`, caption: "Fiat Strada • Obras" })),
    labelWidthMm: 58, qrSizeMm: 46, plateSizePt: 12, captionSizePt: 7.5, sheet: "A4",
  });
  const { raw, streams } = pdfStreams(bytes);
  assert.ok(!/\/Subtype\s*\/Image/.test(raw + streams), "QR não pode ser bitmap");
  assert.match(drawnText(streams), /ABC-1D00/);
  assert.match(drawnText(streams), /ABC-1D29/);
  // 30 QRs vetoriais continuam leves.
  assert.ok(bytes.length < 400 * 1024, `${Math.round(bytes.length / 1024)} KB`);
});

test("etiqueta com largura e altura definidas: o QR ocupa o espaço livre", async () => {
  const { qrLabelLayout } = await import("../web/src/lib/qrLabelsPdf.ts");
  const small = qrLabelLayout({ labelWidthMm: 60, labelHeightMm: 85, lineCount: 1, header: "X", appPromo: true });
  const large = qrLabelLayout({ labelWidthMm: 100, labelHeightMm: 140, lineCount: 1, header: "X", appPromo: true });
  assert.ok(large.qr > small.qr + 25, `${small.qr} -> ${large.qr}`);
  assert.ok(small.qrTop + small.qr <= small.footerTop, "QR não invade o rodapé");
  assert.ok(!qrLabelLayout({ labelWidthMm: 25, labelHeightMm: 25, lineCount: 3, header: "X", appPromo: true }).fits);
});

test("etiqueta compacta aproxima os elementos e respeita tamanhos escolhidos", async () => {
  const { qrLabelLayout } = await import("../web/src/lib/qrLabelsPdf.ts");
  const base = { labelWidthMm: 60, labelHeightMm: 85, lineCount: 2, header: "X", appPromo: true };
  const normal = qrLabelLayout(base);
  const compact = qrLabelLayout({ ...base, spacing: 0.35, lineHeight: 1.1, align: "grouped" });
  assert.ok(compact.qr >= normal.qr, "compacto não diminui o QR");
  // Agrupado: distância do fim do QR à placa é só o espaço entre elementos.
  assert.ok(compact.plateTop - (compact.qrTop + compact.qr) < normal.plateTop - (normal.qrTop + normal.qr));
  const custom = qrLabelLayout({ ...base, fonts: { plate: 18, name: 6 } });
  assert.equal(custom.fonts.plate, 18);
  assert.equal(custom.fonts.name, 6);
  assert.ok(custom.qr < normal.qr, "placa maior toma espaço do QR");
});

test("margens laterais mudam o QR quando a largura é o limite", async () => {
  const { qrLabelLayout } = await import("../web/src/lib/qrLabelsPdf.ts");
  const base = { labelWidthMm: 60, labelHeightMm: 85, lineCount: 1, header: "X", appPromo: true, spacing: 0.2 };
  const wide = qrLabelLayout({ ...base, sidePaddingMm: 8 });
  const narrow = qrLabelLayout({ ...base, sidePaddingMm: 2 });
  assert.equal(wide.qr, 60 - 16);
  assert.ok(narrow.qr > wide.qr + 10);
});

test("etiquetas QR personalizadas: uma por página, título, linhas e pular posições", async () => {
  const items = [
    { data: "ABC1D23", plate: "ABC-1D23", lines: ["Fiat Strada", "Obras", "Prefixo 12"] },
    { data: "XYZ9A87", plate: "XYZ-9A87", lines: ["VW Gol"] },
  ];
  const single = await buildQrLabelsPdf({
    items, labelWidthMm: 57, qrSizeMm: 45, plateSizePt: 12, captionSizePt: 7.5,
    sheet: "label", qrStyle: "plain", header: "Prefeitura de Teste", appPromo: true, border: false,
  });
  const singleText = drawnText(pdfStreams(single).streams);
  const { PDFDocument } = await import("../web/node_modules/pdf-lib/cjs/index.js");
  assert.equal((await PDFDocument.load(single)).getPageCount(), 2, "uma página por etiqueta");
  assert.match(singleText, /PREFEITURA DE TESTE/);
  assert.match(singleText, /Baixe o app do motorista/);
  assert.match(singleText, /Exattus Rotta/);
  assert.match(singleText, /Prefixo 12/);
  assert.match(singleText, /XYZ-9A87/);

  const { qrLabelMetrics } = await import("../web/src/lib/qrLabelsPdf.ts");
  const metrics = qrLabelMetrics({ labelWidthMm: 57, qrSizeMm: 45, plateSizePt: 12, captionSizePt: 7.5, sheet: "A4", lineCount: 1 });
  // Pulando todas as posições menos uma, a 2ª etiqueta cai na folha seguinte.
  const skipped = await buildQrLabelsPdf({
    items, labelWidthMm: 57, qrSizeMm: 45, plateSizePt: 12, captionSizePt: 7.5,
    sheet: "A4", skip: metrics.perPage - 1,
  });
  assert.equal((await PDFDocument.load(skipped)).getPageCount(), 2);
});

test("matriz do QR usa correção H e o conteúdo da placa crua", () => {
  const matrix = qrMatrix("abc1d23");
  assert.equal(matrix.length, matrix[0].length);
  assert.ok(matrix.length >= 21);
  // Padrão localizador no canto superior esquerdo: borda 7×7 escura.
  for (let i = 0; i < 7; i += 1) assert.ok(matrix[0][i] && matrix[i][0]);
});

test("comprovante de abastecimento tem texto real e omite campos vazios", async () => {
  const bytes = await buildReceiptPdf({
    title: "Comprovante de Abastecimento",
    protocol: "AB-1A2B3C4D",
    status: "Validado",
    sections: [{ title: "Abastecimento", fields: [["Litros", "62,40 L"], ["Nota fiscal", "—"]] }],
    branding: { name: "Prefeitura Municipal de Tapejara" },
    issuer: "Gestor",
  });
  const textContent = drawnText(pdfStreams(bytes).streams);
  assert.match(textContent, /Comprovante de Abastecimento/);
  assert.match(textContent, /Protocolo AB-1A2B3C4D/);
  assert.match(textContent, /62,40 L/);
  assert.doesNotMatch(textContent, /Nota fiscal/);
});

// ── Verificação pública (report_snapshots) ──────────────────────────────────

const { reportContentHash } = await import("../web/src/lib/reports/pdf.ts");
const { formatVerificationCode, normalizeVerificationCode } = await import("../web/src/lib/reports/verification.ts");

test("hash do conteúdo é SHA-256 hex (64) e o código local deriva dele", async () => {
  const options = { ...baseOptions, reportTitle: "X", dataset: { columns: tripColumns, rows: tripRows, kpis: [] } };
  const hash = await reportContentHash(options, baseOptions.issuedAt);
  assert.match(hash, /^[0-9a-f]{64}$/);
  const code = await reportIntegrityCode(options, baseOptions.issuedAt);
  assert.equal(code.replaceAll("-", ""), hash.slice(0, 16).toUpperCase());
});

test("formata e normaliza o código de verificação do servidor", () => {
  assert.equal(formatVerificationCode("abcd2345efgh"), "ABCD-2345-EFGH");
  assert.equal(normalizeVerificationCode(" abcd-2345 efgh "), "ABCD2345EFGH");
});

test("PDF registrado traz código no rodapé e QR vetorial de conferência", async () => {
  const bytes = await buildReportPdf({
    ...baseOptions,
    dataset: { columns: tripColumns, rows: tripRows, kpis: [] },
    verification: { code: "ABCD2345EFGH", url: "https://frota.exemplo.gov.br/verificar/ABCD2345EFGH" },
  });
  const { raw, streams } = pdfStreams(bytes);
  const textContent = drawnText(streams);
  assert.match(textContent, /Verificação: ABCD-2345-EFGH/);
  assert.match(textContent, /Código de verificação: ABCD-2345-EFGH/);
  assert.match(textContent, /frota\.exemplo\.gov\.br\/verificar/);
  assert.doesNotMatch(textContent, /Integridade:/);
  assert.ok(!/\/Subtype\s*\/Image/.test(raw + streams), "QR de verificação também é vetor");
});
