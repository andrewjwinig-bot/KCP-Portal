// Parser for the Korman operating-budget workbook (per the 2026 file).
// Per-property sheet layout (consistent across all property sheets in the
// 2026 workbook):
//
//   Col 0 (A): GL account code, e.g. "4230-8501"
//   Col 1 (B): Optional sub-category tag, e.g. "(SC)" or "Office Direct"
//   Col 2 (C): Line label, e.g. "Rental Income - In Place"
//   Col 3 (D): blank separator
//   Cols 4–15 (E–P): Jan–Dec monthly amounts
//   Col 16 (Q): Annual total
//   Col 17 (R): Total / SF
//   Col 18 (S): Input initials (or prior-year total when there's a reproj column)
//   Col 19 (T): Notes (or variance %)
//
//   Row 0: code in col 1, "- name" in col 2, "Operating Budget" in col 9
//   Row 3: rentable SF in col 1, month/total headers from col 4
//   Row 5: Occupancy % per month (cols 4–15)
//   Row 6: Occupancy SF per month
//   Row 7+: Section header rows (label in col 1, no money) followed by line items.
//
//   Section rollup rows (TOTAL REVENUES, NET OPERATING INCOME, etc.) carry
//   their monthly distribution on the same row and live in `rollups`.
//
// The "Budget Import - <code>" block (near the bottom of each sheet) is a
// flat GL → annual-total table — col 0 label, col 2 GL, col 3 amount
// (revenues are stored as parenthesized negatives — Skyline credits).

import * as XLSX from "xlsx";
import type {
  BudgetCategory,
  BudgetLine,
  BudgetSection,
  BudgetWorkbook,
  PropertyBudget,
  SkylineImportLine,
} from "./types";

function trim(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/** Parse a $ value that may be parenthesized (negative), comma-separated,
 *  blank, or a literal dash. Returns 0 for any non-numeric input. */
function num(v: unknown): number {
  if (v == null) return 0;
  const s = String(v).trim();
  if (!s || s === "-" || s === "—" || s === "$-") return 0;
  const neg = /^\(.+\)$/.test(s);
  const cleaned = s.replace(/[(),$\s]/g, "");
  if (!cleaned || cleaned === "-") return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

function pct(v: unknown): number {
  const s = trim(v);
  if (!s) return 0;
  const n = Number(s.replace("%", ""));
  return Number.isFinite(n) ? n : 0;
}

function rowIsBlank(r: unknown[]): boolean {
  return r.every((c) => c == null || (typeof c === "string" && c.trim() === ""));
}

function months(r: unknown[]): number[] {
  return r.slice(4, 16).map(num);
}

// Sheet name patterns we always ignore (cover, junk pivot, supporting tabs).
const IGNORE_SHEET = /^(cover\s*sheet|sheet\d+|in place revenue|renew|tenant recoveries|ins ret debt|building maint|allocated expenses|lik mgmt fee)\s*$/i;

function isRollupSheet(name: string): boolean {
  return /^all\s+/i.test(name.trim());
}

function isPropertyCode(code: string): boolean {
  // Korman codes are 4 chars: digits with optional hex letters (e.g. 40A0)
  return /^[0-9][0-9A-Za-z]{3}$/.test(code);
}

/** Heuristic for "this is a section-header row" — only col 1 has text and the
 *  monthly cells are empty. */
function isSectionHeader(r: unknown[], col0: string, col1: string, col2: string): boolean {
  if (col0 || col2) return false;
  if (!col1) return false;
  return r.slice(4, 16).every((c) => c == null || (typeof c === "string" && c.trim() === ""));
}

function isRollupLabel(label: string): boolean {
  const u = label.toUpperCase();
  return u.startsWith("TOTAL ") || u.startsWith("NET ") || u.startsWith("CASH FLOW");
}

function parsePropertySheet(rows: unknown[][], sheetName: string): PropertyBudget | null {
  const r0 = rows[0] ?? [];
  const codeRaw = trim(r0[1]);
  const code = codeRaw.toUpperCase();
  if (!isPropertyCode(code) && !isRollupSheet(sheetName)) return null;

  // Property name: strip leading dash + spaces from "- Brookwood Shopping Center"
  const name = trim(r0[2]).replace(/^[-\s]+/, "");

  const r3 = rows[3] ?? [];
  const rentableSqft = num(r3[1]);

  const r5 = rows[5] ?? [];
  const r6 = rows[6] ?? [];
  const occupancyPct = r5.slice(4, 16).map(pct);
  const occupancySqft = months(r6);

  const sections: BudgetSection[] = [];
  const rollups: { name: string; total: number; months: number[] }[] = [];
  let currentSection: BudgetSection | null = null;

  let skylineImport: SkylineImportLine[] = [];
  let skylineImportTotal = 0;
  let inSkylineBlock = false;
  let stopMainPnl = false;

  for (let i = 7; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (rowIsBlank(r)) continue;
    const col0 = trim(r[0]);
    const col1 = trim(r[1]);
    const col2 = trim(r[2]);

    // Budget Import block — once we hit "Budget Import - <code>" in col 1,
    // we stop accumulating the main P&L and parse this flat table instead.
    if (col1.toLowerCase().includes("budget import")) {
      inSkylineBlock = true;
      stopMainPnl = true;
      continue;
    }
    if (inSkylineBlock) {
      // Header row: col 3 = "Account", col 16 = "Total"
      const col3 = trim(r[3]);
      if (col3.toLowerCase() === "account") continue;
      const importLabel = col0;
      const importGl = col3;
      const importMonths = months(r);          // cols 4–15
      const importTotal = num(r[16]);          // col 16
      // Final "Total" row → captures sanity-check sum
      if (importLabel.toLowerCase() === "total" || (importGl.toLowerCase() === "total" && !importLabel)) {
        skylineImportTotal = importTotal;
        continue;
      }
      if (importLabel && importGl) {
        skylineImport.push({
          label: importLabel,
          glAccount: importGl,
          months: importMonths,
          total: importTotal,
        });
      }
      continue;
    }

    if (stopMainPnl) continue;

    // Tenant-level "Rental Summary by Month" / "Rental Income - In Place"
    // detail blocks live between the main P&L and the Skyline block — we
    // skip them on import (the per-line totals in the main P&L already
    // capture what's there).
    if (
      col1.toLowerCase().includes("rental summary") ||
      (col1.toLowerCase().includes("rental income") && col0 === "")
    ) {
      // We don't set stopMainPnl here — keep scanning, just skip detail rows.
      // The blocks naturally end before Budget Import.
      continue;
    }

    // Rollup rows like " TOTAL REVENUES " — col 1 has uppercase label AND
    // the row carries monthly figures + a total in col 16.
    if (!col0 && !col2 && col1 && isRollupLabel(col1)) {
      const ms = months(r);
      const total = num(r[16]);
      if (total !== 0 || ms.some((m) => m !== 0)) {
        rollups.push({ name: col1, total, months: ms });
      }
      continue;
    }

    // Section header
    if (isSectionHeader(r, col0, col1, col2)) {
      if (currentSection) sections.push(currentSection);
      currentSection = { name: col1, lines: [] };
      continue;
    }

    // Subtotal row: no GL, label in col 2 starting with "Total "
    if (!col0 && col2.toLowerCase().startsWith("total ")) {
      const ms = months(r);
      const line: BudgetLine = {
        glAccount: null,
        subCategory: null,
        label: col2,
        months: ms,
        total: num(r[16]),
        totalPsf: r[17] != null && trim(r[17]) !== "" ? num(r[17]) : null,
        input: null,
        notes: null,
        isSubtotal: true,
      };
      if (currentSection) currentSection.lines.push(line);
      continue;
    }

    // Line item — needs either a GL code or a label, plus some monthly value
    if (col0 || col2) {
      const ms = months(r);
      const total = num(r[16]);
      // Skip completely empty rows that slipped through (no GL, no money)
      if (!col0 && total === 0 && ms.every((m) => m === 0)) continue;
      const line: BudgetLine = {
        glAccount: col0 || null,
        subCategory: col1 || null,
        label: col2 || col0,
        months: ms,
        total,
        totalPsf: r[17] != null && trim(r[17]) !== "" ? num(r[17]) : null,
        input: r[18] != null && trim(r[18]) !== "" ? trim(r[18]) : null,
        notes: r[19] != null && trim(r[19]) !== "" ? trim(r[19]) : null,
        isSubtotal: false,
      };
      if (!currentSection) currentSection = { name: "Other", lines: [] };
      currentSection.lines.push(line);
    }
  }

  if (currentSection) sections.push(currentSection);

  return {
    propertyCode: code,
    propertyName: name,
    rentableSqft,
    occupancyPct,
    occupancySqft,
    sections,
    rollups,
    skylineImport,
    skylineImportTotal,
  };
}

function inferYear(rows: unknown[][]): number | null {
  const r0 = rows[0] ?? [];
  for (let i = 0; i < Math.min(r0.length, 30); i++) {
    const v = trim(r0[i]);
    if (/^\d{4}$/.test(v)) {
      const n = Number(v);
      if (n >= 2000 && n <= 2100) return n;
    }
  }
  return null;
}

function inferCategoryFromLabel(label: string): BudgetCategory {
  const l = label.toLowerCase();
  if (l.includes("shopping center")) return "Shopping Centers";
  if (l.includes("office") || l.includes("nilllc") || l.includes("jv iii")) return "Office";
  if (l.includes("residential") || l.includes("korman home")) return "Residential";
  return "Other";
}

function idFromLabel(label: string, year: number): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${slug || "budget"}-${year}`;
}

export function parseBudgetWorkbook(
  buf: Buffer | ArrayBuffer,
  label: string,
): BudgetWorkbook {
  const wb = XLSX.read(buf, {
    type: buf instanceof ArrayBuffer ? "array" : "buffer",
    cellDates: false,
    raw: false,
  });

  const properties: PropertyBudget[] = [];
  let rollup: PropertyBudget | undefined;
  let detectedYear: number | null = null;

  for (const sheetName of wb.SheetNames) {
    if (IGNORE_SHEET.test(sheetName.trim())) continue;
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];
    if (!detectedYear) detectedYear = inferYear(rows);
    const parsed = parsePropertySheet(rows, sheetName);
    if (!parsed) continue;
    if (isRollupSheet(sheetName)) rollup = parsed;
    else properties.push(parsed);
  }

  const year = detectedYear ?? new Date().getFullYear();
  const category = inferCategoryFromLabel(label);

  return {
    id: idFromLabel(label, year),
    label,
    kind: "imported",
    category,
    year,
    uploadedAt: new Date().toISOString(),
    rollup,
    properties,
  };
}
