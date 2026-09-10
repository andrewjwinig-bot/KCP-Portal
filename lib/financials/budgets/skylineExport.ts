// Generate the Skyline-format Budget Import .xlsx for a single property.
// Core data only — Skyline only needs the per-GL monthly + annual figures,
// so we drop the line label, the leading blank spacer columns, the title
// row, the column header row, and the footer Total row that the source
// workbook carries as visual chrome. Output is one row per GL:
//   col 0 = GL, cols 1–12 = Jan–Dec, col 13 = annual total.

import * as XLSX from "xlsx";
import type { PropertyBudget, BudgetWorkbook } from "./types";

export function generateSkylineImportXlsx(
  wb: BudgetWorkbook,
  property: PropertyBudget,
): Buffer {
  const aoa: unknown[][] = [];
  for (const line of property.skylineImport) {
    aoa.push([line.glAccount, ...line.months, line.total]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [
    { wch: 14 },
    ...Array.from({ length: 12 }, () => ({ wch: 11 })),
    { wch: 14 },
  ];

  const out = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(out, sheet, `Budget Import - ${property.propertyCode}`);

  const buf = XLSX.write(out, { type: "buffer", bookType: "xlsx" });
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer);
  // wb is intentionally unused once the title row is dropped — kept on
  // the signature for caller compatibility.
  void wb;
}
