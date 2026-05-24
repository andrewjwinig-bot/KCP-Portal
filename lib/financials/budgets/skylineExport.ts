// Generate the Skyline-format Budget Import .xlsx for a single property.
// Mirrors the table layout used at the bottom of each property sheet in
// the source workbook so the file can be imported directly into Skyline.

import * as XLSX from "xlsx";
import type { PropertyBudget, BudgetWorkbook } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function generateSkylineImportXlsx(
  wb: BudgetWorkbook,
  property: PropertyBudget,
): Buffer {
  // Mirrors the bottom-of-property-sheet Skyline block layout:
  //   col 0 = label, cols 1–2 blank, col 3 = GL, cols 4–15 = Jan–Dec,
  //   col 16 = annual total.
  const aoa: unknown[][] = [];
  aoa.push(["", `Budget Import - ${property.propertyCode}`, "", "", "", "", "", "", "", "", "", "", "", "", "", "", `${wb.year} Operating Budget`]);
  aoa.push(["", "", "", "Account", ...MONTHS, "Total"]);
  for (const line of property.skylineImport) {
    aoa.push([line.label, "", "", line.glAccount, ...line.months, line.total]);
  }
  // Footer total — sum the lines (column-wise) so the file is internally
  // consistent even if the stored manifest's totals were off.
  const monthTotals = Array.from({ length: 12 }, (_, i) =>
    property.skylineImport.reduce((s, l) => s + (l.months[i] ?? 0), 0),
  );
  const grandTotal = property.skylineImport.reduce((s, l) => s + l.total, 0);
  aoa.push(["", "", "", "Total", ...monthTotals, grandTotal]);

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [
    { wch: 36 }, { wch: 2 }, { wch: 2 }, { wch: 14 },
    ...Array.from({ length: 12 }, () => ({ wch: 11 })),
    { wch: 14 },
  ];

  const out = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(out, sheet, `Budget Import - ${property.propertyCode}`);

  const buf = XLSX.write(out, { type: "buffer", bookType: "xlsx" });
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer);
}
