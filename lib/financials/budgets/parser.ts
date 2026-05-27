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

// Sheet name patterns we always ignore (cover, junk pivot). Supporting
// tabs (INS RET DEBT, Building Maint, etc.) are NOT ignored here — they
// don't match the property-sheet layout so parsePropertySheet returns
// null for them. They're picked up separately by parseInsuranceDetail /
// parseBuildingMaintDetail (and future parsers as we expand sub-line
// coverage).
const IGNORE_SHEET = /^(cover\s*sheet|sheet\d+|in place revenue|renew|tenant recoveries|allocated expenses|lik mgmt fee)\s*$/i;
const INS_RET_DEBT_SHEET = /^ins\s+ret\s+debt$/i;
const BUILDING_MAINT_SHEET = /^building\s+maint$/i;

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

/** Workbook column S (col 18) is either author initials ("DW") or a
 *  prior-year total ("$45,254" / "45,254"). Column T (col 19) is either
 *  a free-text note ("Includes $500/mo to mow empty field") or a YoY
 *  variance % ("-16.09%"). We can't reliably tie out variance / prior-
 *  year totals until the portal carries multi-year actuals, so detect
 *  the YoY pair and drop both — keep only real notes / initials. */
function isYoyVarianceColumn(input: string | null, notes: string | null): boolean {
  if (!input && !notes) return false;
  const variancePct = /^[-+]?\d+(\.\d+)?\s*%$/;
  const priorYearNumber = /^\$?\s*-?[\d,]+(\.\d+)?$/;
  // Treat as YoY pair if EITHER column matches its variance/prior shape.
  return (notes !== null && variancePct.test(notes.trim())) ||
         (input !== null && priorYearNumber.test(input.trim()) && (input.includes(",") || input.includes("$")));
}

/** Build a sub-line BudgetLine from a row that has its label in col 3.
 *  These rows precede their parent line in the property sheet — e.g.
 *  rows for "Building Maint.-Contractual / Recurring / Big Projects"
 *  immediately precede the "Building Maintenance" parent row that holds
 *  the summed total. Some sub-lines also carry their own GL code in
 *  col 0 (e.g. 6010-8501 Salaries & Wages under "Leasing Salaries and
 *  Commissions"); preserve that when present. */
function buildSubLineFromRow(r: unknown[], label: string, glAccount: string | null): BudgetLine {
  const ms = months(r);
  const rawInput = r[18] != null && trim(r[18]) !== "" ? trim(r[18]) : null;
  const rawNotes = r[19] != null && trim(r[19]) !== "" ? trim(r[19]) : null;
  const isYoy = isYoyVarianceColumn(rawInput, rawNotes);
  return {
    glAccount,
    subCategory: null,
    label,
    months: ms,
    total: num(r[16]),
    totalPsf: r[17] != null && trim(r[17]) !== "" ? num(r[17]) : null,
    input: isYoy ? null : rawInput,
    notes: isYoy ? null : rawNotes,
    isSubtotal: false,
  };
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
  // Sub-line rows (label in col 3, no GL) precede their parent row in the
  // property sheet — e.g. "Building Maint.-Contractual / -Recurring /
  // -Big Projects" appear immediately before the "Building Maintenance"
  // parent row. We buffer them here and attach on the next parent.
  let pendingSubLines: BudgetLine[] = [];

  let skylineImport: SkylineImportLine[] = [];
  let skylineImportTotal = 0;
  let inSkylineBlock = false;
  let stopMainPnl = false;

  for (let i = 7; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (rowIsBlank(r)) { pendingSubLines = []; continue; }
    const col0 = trim(r[0]);
    const col1 = trim(r[1]);
    const col2 = trim(r[2]);
    const col3 = trim(r[3]);

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
      pendingSubLines = [];
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
      pendingSubLines = [];
      continue;
    }

    // Section header
    if (isSectionHeader(r, col0, col1, col2)) {
      if (currentSection) sections.push(currentSection);
      currentSection = { name: col1, lines: [] };
      pendingSubLines = [];
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
      pendingSubLines = [];
      continue;
    }

    // Sub-line row — label lives in col 3, no parent-label in col 2.
    // Col 0 (GL) MAY be set (e.g. 6010-8501 Salaries & Wages under
    // "Leasing Salaries and Commissions"; same shape for Utilities,
    // G&A, Capital, Outside Leasing Commissions) — we preserve the
    // GL on the sub-line so it stays visible in the GL column.
    // Buffer for the next parent line. Empty sub-lines (e.g. D&O = 0)
    // are tolerated so the breakdown still lists every category;
    // the page mutes empty rows on its own.
    if (!col2 && col3 && !col1) {
      pendingSubLines.push(buildSubLineFromRow(r, col3, col0 || null));
      continue;
    }

    // Line item — needs either a GL code or a label, plus some monthly value
    if (col0 || col2) {
      const ms = months(r);
      const total = num(r[16]);
      // Skip completely empty rows that slipped through (no GL, no money)
      if (!col0 && total === 0 && ms.every((m) => m === 0)) {
        pendingSubLines = [];
        continue;
      }
      const rawInput = r[18] != null && trim(r[18]) !== "" ? trim(r[18]) : null;
      const rawNotes = r[19] != null && trim(r[19]) !== "" ? trim(r[19]) : null;
      const isYoy = isYoyVarianceColumn(rawInput, rawNotes);
      const line: BudgetLine = {
        glAccount: col0 || null,
        subCategory: col1 || null,
        label: col2 || col0,
        months: ms,
        total,
        totalPsf: r[17] != null && trim(r[17]) !== "" ? num(r[17]) : null,
        input: isYoy ? null : rawInput,
        notes: isYoy ? null : rawNotes,
        isSubtotal: false,
        subLines: pendingSubLines.length > 0 ? pendingSubLines : undefined,
      };
      pendingSubLines = [];
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

/**
 * Parses the INSURANCE block at the top of the INS RET DEBT supporting
 * sheet. Each property gets a block of rows — Gen Liability / Umbrella /
 * (Insurance - Liability intermediate subtotal) / Property / D&O /
 * TOTAL — terminated by a "TOTAL:" row in col 1. Returns a map keyed by
 * the property code that the block starts with.
 *
 * Row layout inside a block:
 *   Col 0  = property code (only on the first sub-line row of the block)
 *   Col 1  = sub-line label
 *   Col 3..14 = Jan..Dec
 *   Col 15 = annual total
 *   Col 18 = GL-label tag the sub-line rolls up into (e.g. "Insurance-Liability")
 *
 * Stops at row 76 — that's the "TOTAL INSURANCE:" portfolio rollup, after
 * which the RET and Debt blocks begin (those aren't useful sub-detail —
 * one row per property).
 */
function parseInsuranceDetail(rows: unknown[][]): Map<string, BudgetLine[]> {
  const out = new Map<string, BudgetLine[]>();
  let currentCode: string | null = null;
  let currentLines: BudgetLine[] = [];

  for (let i = 5; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const col0 = trim(r[0]);
    const col1 = trim(r[1]);

    // Stop at the portfolio rollup row — beyond this is the RET section.
    if (/^total\s+insurance/i.test(col1)) {
      if (currentCode && currentLines.length) out.set(currentCode, currentLines);
      break;
    }

    // Property block boundary marker
    if (isPropertyCode(col0)) {
      if (currentCode && currentLines.length) out.set(currentCode, currentLines);
      currentCode = col0.toUpperCase();
      currentLines = [];
    }
    if (!currentCode) continue;

    // End of block — push and clear
    if (/^total\s*:?\s*$/i.test(col1)) {
      if (currentLines.length) out.set(currentCode, currentLines);
      currentCode = null;
      currentLines = [];
      continue;
    }

    // Sub-line row — needs a label and either a total or a monthly value
    if (!col1) continue;
    const ms: number[] = [];
    for (let j = 3; j < 15; j++) ms.push(num(r[j]));
    const total = num(r[15]);
    if (total === 0 && ms.every((m) => m === 0)) continue;

    const targetTag = trim(r[18]);
    const isIntermediateSubtotal = /^insurance\s*-\s*liability$/i.test(col1);
    currentLines.push({
      glAccount: null,
      subCategory: targetTag || null,
      label: col1,
      months: ms,
      total,
      totalPsf: null,
      input: null,
      notes: null,
      isSubtotal: isIntermediateSubtotal,
    });
  }
  if (currentCode && currentLines.length) out.set(currentCode, currentLines);
  return out;
}

/** Find every line in a property that looks like an Insurance row in the
 *  main P&L and attach the sub-lines parsed from INS RET DEBT. Both the
 *  Reimbursements (revenue) and Reimbursable Expenses (cost) Insurance
 *  rows get the same breakdown — the tenants reimburse the cost, so the
 *  composition is the same on both sides. */
function attachInsuranceSubLines(property: PropertyBudget, subLines: BudgetLine[]): void {
  if (subLines.length === 0) return;
  for (const sec of property.sections) {
    for (const line of sec.lines) {
      if (line.isSubtotal) continue;
      if (/^insurance$/i.test(line.label.trim())) {
        line.subLines = subLines;
      }
    }
  }
}

/** Parses the Building Maint supporting sheet. Each detail block (e.g.
 *  "Contract - Sprinkler Inspection", "Recurring - Misc Expenses") spans
 *  one row per property. Returns per-property level-2 sub-lines bucketed
 *  by category — Contract items roll up into Building Maint.-Contractual,
 *  Recurring items roll up into Building Maint.-Recurring. (Big Projects
 *  has no per-item detail in this tab; it's just a single bucket with a
 *  description carried on the parent line.)
 *
 *  Row layout inside a detail block:
 *    Col 0  = " Contract - " / " Recurring - " on the title row only
 *    Col 1  = item name on the title row, property code on data rows
 *    Cols 2..13 = Jan..Dec
 *    Col 14 = annual total
 *
 *  Note this column layout differs from the property sheet (which uses
 *  cols 4..15 for months / col 16 for total) — the Building Maint tab
 *  is shifted left by two columns. */
function parseBuildingMaintDetail(rows: unknown[][]): Map<string, { contract: BudgetLine[]; recurring: BudgetLine[] }> {
  const out = new Map<string, { contract: BudgetLine[]; recurring: BudgetLine[] }>();
  const ensure = (code: string) => {
    let b = out.get(code);
    if (!b) { b = { contract: [], recurring: [] }; out.set(code, b); }
    return b;
  };

  let blockCategory: "contract" | "recurring" | null = null;
  let blockItem: string | null = null;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const c0 = trim(r[0]);
    const c1 = trim(r[1]);

    // Block title: " Contract - " or " Recurring - " in col 0, item name in col 1.
    if (/^contract\s*-/i.test(c0)) { blockCategory = "contract";  blockItem = c1 || null; continue; }
    if (/^recurring\s*-/i.test(c0)) { blockCategory = "recurring"; blockItem = c1 || null; continue; }

    if (!blockCategory || !blockItem) continue;
    // End of block: TOTAL row or blank row resets the cursor (next block
    // title will set it again).
    if (/^total\s*:?\s*$/i.test(c1)) { blockCategory = null; blockItem = null; continue; }
    if (!c1) continue;

    // Per-property row: col 1 is the property code, cols 2..13 are months,
    // col 14 is the annual total.
    if (!isPropertyCode(c1)) continue;
    const ms: number[] = [];
    for (let j = 2; j < 14; j++) ms.push(num(r[j]));
    const total = num(r[14]);
    if (total === 0 && ms.every((m) => m === 0)) continue; // skip empty
    const code = c1.toUpperCase();
    const bucket = ensure(code);
    const line: BudgetLine = {
      glAccount: null,
      subCategory: null,
      label: blockItem,
      months: ms,
      total,
      totalPsf: null,
      input: null,
      notes: null,
      isSubtotal: false,
    };
    bucket[blockCategory].push(line);
  }
  return out;
}

/** Attach the level-2 Building Maint detail to the corresponding level-1
 *  sub-lines under each property's "Building Maintenance" parent line.
 *  Matches by the level-1 label substring "Contractual" / "Recurring". */
function attachBuildingMaintSubLines(
  property: PropertyBudget,
  bucket: { contract: BudgetLine[]; recurring: BudgetLine[] },
): void {
  if (bucket.contract.length === 0 && bucket.recurring.length === 0) return;
  for (const sec of property.sections) {
    for (const line of sec.lines) {
      if (line.isSubtotal) continue;
      if (!/^building maintenance$/i.test(line.label.trim())) continue;
      if (!line.subLines) continue;
      for (const sub of line.subLines) {
        if (/contract/i.test(sub.label) && bucket.contract.length > 0) {
          sub.subLines = bucket.contract;
        } else if (/recurring/i.test(sub.label) && bucket.recurring.length > 0) {
          sub.subLines = bucket.recurring;
        }
      }
    }
  }
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
  let insuranceDetail: Map<string, BudgetLine[]> | null = null;
  let buildingMaintDetail: Map<string, { contract: BudgetLine[]; recurring: BudgetLine[] }> | null = null;

  for (const sheetName of wb.SheetNames) {
    const trimmed = sheetName.trim();
    if (IGNORE_SHEET.test(trimmed)) continue;
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];
    if (!detectedYear) detectedYear = inferYear(rows);
    if (INS_RET_DEBT_SHEET.test(trimmed)) {
      insuranceDetail = parseInsuranceDetail(rows);
      continue;
    }
    if (BUILDING_MAINT_SHEET.test(trimmed)) {
      buildingMaintDetail = parseBuildingMaintDetail(rows);
      continue;
    }
    const parsed = parsePropertySheet(rows, sheetName);
    if (!parsed) continue;
    if (isRollupSheet(sheetName)) rollup = parsed;
    else properties.push(parsed);
  }

  // Attach supporting-tab detail after all property sheets are parsed
  // (the supporting tabs can appear before or after them in the workbook).
  for (const property of properties) {
    if (insuranceDetail) {
      const subs = insuranceDetail.get(property.propertyCode);
      if (subs) attachInsuranceSubLines(property, subs);
    }
    if (buildingMaintDetail) {
      const bucket = buildingMaintDetail.get(property.propertyCode);
      if (bucket) attachBuildingMaintSubLines(property, bucket);
    }
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
