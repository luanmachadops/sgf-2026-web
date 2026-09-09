import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const requireWeb = createRequire(
  new URL("../web/package.json", import.meta.url),
);
const ExcelJS = requireWeb("exceljs");

test("ExcelJS exporta e reabre planilha com o UUID corrigido", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Cotas");
  sheet.addRows([
    ["Secretaria", "Limite"],
    ["Obras", 600000],
    ["Saúde", 250000],
  ]);
  // Extended data bars exercise the only ExcelJS consumer of uuid.v4.
  sheet.addConditionalFormatting({
    ref: "B2:B3",
    rules: [
      {
        type: "dataBar",
        cfvo: [{ type: "min" }, { type: "max" }],
        color: { argb: "FF00A86B" },
        gradient: false,
        showValue: true,
      },
    ],
  });
  const bytes = await workbook.xlsx.writeBuffer();
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(bytes);
  assert.equal(restored.getWorksheet("Cotas").getCell("B2").value, 600000);
  assert.equal(restored.getWorksheet("Cotas").getCell("A3").value, "Saúde");
});
