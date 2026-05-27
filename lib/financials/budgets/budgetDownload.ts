// Presentation-ready full-budget .xlsx export. Mirrors what the
// /financials/budgets page renders for the selected property — group
// headers, section names, line items with their sub-line breakdowns
// indented underneath, in-section subtotals, and the big cross-section
// subtotals (TOTAL REVENUES, NOI, CASH FLOW, …). Empty rows are
// skipped so the file reads clean.
//
// Cell-level styling is intentionally minimal because the community
// xlsx library doesn't reliably emit font/fill/border on write — the
// number format on the dollar columns is the most useful thing we can
// hand off. Staff can apply table styles in Excel afterwards.

import * as XLSX from "xlsx";
import type { BudgetLine, BudgetWorkbook, PropertyBudget } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONEY_FMT = '"$"#,##0;[Red]"$"-#,##0;"—"';

function isEmpty(line: BudgetLine): boolean {
  return !line.isSubtotal && line.total === 0 && line.months.every((m) => m === 0);
}

function emitLine(aoa: unknown[][], line: BudgetLine, depth: number): void {
  if (isEmpty(line)) return;
  const indent = "  ".repeat(depth);
  aoa.push([
    line.glAccount ?? "",
    indent + line.label,
    ...line.months,
    line.total,
  ]);
  if (line.subLines) {
    for (const sub of line.subLines) emitLine(aoa, sub, depth + 1);
  }
}

/** Cross-section subtotal labels appended after a given section name.
 *  Mirrors the page's BudgetTable subtotalsAfter() logic so the
 *  download lays out top-to-bottom in the same order as the screen.
 *  When the property has no Capital section (JV III office sheets),
 *  CASH FLOW BEFORE DEBT SERVICE slides up to sit after Non-Reimbursable. */
function subtotalKeysAfter(sectionName: string, hasDebt: boolean, hasCapital: boolean): string[] {
  const n = sectionName.toLowerCase();
  if (/reimburs/.test(n) && !/expense/.test(n) && !/non/.test(n)) return ["TOTAL REVENUES"];
  if (/non-reimbursable/.test(n)) {
    const out = ["TOTAL OPERATING EXPENSES", "NET OPERATING INCOME"];
    if (!hasCapital) out.push(hasDebt ? "CASH FLOW BEFORE DEBT SERVICE" : "CASH FLOW");
    return out;
  }
  if (/capital/.test(n)) return [hasDebt ? "CASH FLOW BEFORE DEBT SERVICE" : "CASH FLOW"];
  if (/debt service/.test(n)) return ["CASH FLOW AFTER DEBT SERVICE"];
  return [];
}

/** REVENUES / OPERATING EXPENSES / CAPITAL IMPROVEMENTS / DEBT SERVICE
 *  group banner that sits above the first section in each top-level
 *  group on the screen. Same mapping as the page's groupHeaderFor(). */
function groupHeaderFor(sectionName: string): string | null {
  const n = sectionName.toLowerCase();
  if (/^revenues?$/.test(n)) return "REVENUES";
  if (/^reimbursable expenses?$/.test(n)) return "OPERATING EXPENSES";
  if (/^capital/.test(n)) return "CAPITAL IMPROVEMENTS";
  if (/^debt service$/.test(n)) return "DEBT SERVICE";
  return null;
}

export function generateBudgetDownloadXlsx(wb: BudgetWorkbook, property: PropertyBudget): Buffer {
  const aoa: unknown[][] = [];

  // ── Title block ─────────────────────────────────────────────────────
  aoa.push([`${property.propertyCode} — ${property.propertyName}`]);
  aoa.push([`${wb.year} Operating Budget · ${wb.category}`]);
  const meta: string[] = [];
  if (property.rentableSqft) meta.push(`Rentable SF: ${property.rentableSqft.toLocaleString("en-US")}`);
  if (wb.source?.opExGrowthPct != null) meta.push(`OpEx defaulted at ${wb.source.opExGrowthPct}% over prior`);
  if (meta.length) aoa.push([meta.join(" · ")]);
  aoa.push([]);

  // ── KPI rollups header ─────────────────────────────────────────────
  const rollupByName = new Map(property.rollups.map((r) => [r.name.toUpperCase().trim(), r]));
  const hasDebt = property.sections.some(
    (s) => /debt service/i.test(s.name) && s.lines.some((l) => !l.isSubtotal && l.total !== 0),
  );
  const headlinePills: { name: string; value: number }[] = [];
  const get = (n: string) => rollupByName.get(n);
  if (get("TOTAL REVENUES")) headlinePills.push({ name: "TOTAL REVENUES", value: get("TOTAL REVENUES")!.total });
  if (get("TOTAL OPERATING EXPENSES")) headlinePills.push({ name: "TOTAL OPERATING EXPENSES", value: get("TOTAL OPERATING EXPENSES")!.total });
  if (get("NET OPERATING INCOME")) headlinePills.push({ name: "NET OPERATING INCOME", value: get("NET OPERATING INCOME")!.total });
  if (hasDebt && get("CASH FLOW AFTER DEBT SERVICE")) {
    headlinePills.push({ name: "CASH FLOW AFTER DEBT SERVICE", value: get("CASH FLOW AFTER DEBT SERVICE")!.total });
  } else if (get("CASH FLOW BEFORE DEBT SERVICE")) {
    headlinePills.push({ name: "CASH FLOW", value: get("CASH FLOW BEFORE DEBT SERVICE")!.total });
  }
  if (headlinePills.length) {
    aoa.push(headlinePills.map((p) => p.name));
    aoa.push(headlinePills.map((p) => p.value));
    aoa.push([]);
  }

  // ── Column headers ─────────────────────────────────────────────────
  const headerRowIdx = aoa.length;
  aoa.push(["GL", "Line", ...MONTHS, "Total"]);

  // ── Sections + subtotals ───────────────────────────────────────────
  const visibleSections = property.sections.filter(
    (s) => hasDebt || !/debt service/i.test(s.name),
  );
  const hasCapital = property.sections.some((s) => /^capital/i.test(s.name));

  for (const sec of visibleSections) {
    const groupHeader = groupHeaderFor(sec.name);
    if (groupHeader) {
      aoa.push([]);
      aoa.push(["", groupHeader]);
    }
    aoa.push([]);
    aoa.push(["", sec.name]);
    for (const line of sec.lines) emitLine(aoa, line, 0);
    for (const key of subtotalKeysAfter(sec.name, hasDebt, hasCapital)) {
      // CASH FLOW (no-debt case) reuses the "before debt service"
      // rollup data; everything else looks up by literal name.
      const rollup =
        key === "CASH FLOW" ? rollupByName.get("CASH FLOW BEFORE DEBT SERVICE") : rollupByName.get(key);
      if (!rollup) continue;
      aoa.push([]);
      aoa.push(["", key, ...rollup.months, rollup.total]);
    }
  }

  // ── Worksheet assembly ─────────────────────────────────────────────
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [
    { wch: 12 },               // GL
    { wch: 42 },               // Line label
    ...Array.from({ length: 12 }, () => ({ wch: 11 })),
    { wch: 13 },               // Total
  ];

  // Apply currency format to every numeric cell in the dollar columns
  // (col 2 → col 14). Skip the headline-pill values row too so it
  // formats consistently.
  for (let r = 0; r < aoa.length; r++) {
    for (let c = 0; c < (aoa[r]?.length ?? 0); c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (cell && typeof cell.v === "number") cell.z = MONEY_FMT;
    }
  }

  // Freeze the header row + label columns so scrolling stays oriented.
  sheet["!freeze"] = { xSplit: 2, ySplit: headerRowIdx + 1 };

  const out = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(out, sheet, `${property.propertyCode} ${wb.year}`);
  const buf = XLSX.write(out, { type: "buffer", bookType: "xlsx" });
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer);
}
