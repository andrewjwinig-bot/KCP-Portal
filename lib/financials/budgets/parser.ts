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
import { PROPERTY_DEFS } from "@/lib/properties/data";
import type {
  BudgetCategory,
  BudgetLine,
  BudgetSection,
  BudgetWorkbook,
  PropertyBudget,
  SkylineImportLine,
} from "./types";

function lookupPropertyName(code: string): string | null {
  const def = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase());
  return def?.name ?? null;
}

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

/** True when a workbook cell holds a placeholder ("-", "—", " - ") that
 *  staff use to denote "nothing here" rather than an actual note /
 *  initials. The page would otherwise show a misleading ⓘ info icon on
 *  every line with a placeholder in the notes column. */
function isPlaceholderText(s: string): boolean {
  return /^[-—–\s]+$/.test(s);
}

function trimMeaningful(s: string | null): string | null {
  if (s == null) return null;
  const t = s.trim();
  if (!t || isPlaceholderText(t)) return null;
  return t;
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
// Sheet name patterns we always ignore. Supporting tabs (INS RET[/ DEBT],
// Building Maint, Allocated Expenses, etc.) are handled by their own
// parsers below; everything in IGNORE_SHEET is workbook scaffolding
// we don't pull anything from.
const IGNORE_SHEET = /^(cover\s*sheet|sheet\d+|source and use of cash|assumptions|dscr\s*calc|in place revenue|renew(\s*&\s*vac.*)?|tenant recoveries|lik mgmt fee|parking lot maint|landscaping|trash|trusts|notes to projections|\d+\s*year\s*projection)\s*$/i;
const INS_RET_DEBT_SHEET = /^ins\s+ret(\s+debt)?$/i;
const BUILDING_MAINT_SHEET = /^building\s+maint$/i;
const ALLOCATED_EXPENSES_SHEET = /^allocated\s+expenses$/i;
const WATER_SEWER_SHEET = /^water\s*sewer$/i;
const OFFICE_WORKS_SHEET = /^the\s+office\s+works$/i;
const TOW_RR_CIP_SHEET = /^monthly\s+rent\s+roll(\s*&\s*cip)?$/i;
const LIK_BUDGET_SHEET = /^lik\s+budget\s+\d{4}$/i;

function isRollupSheet(name: string): boolean {
  const n = name.trim();
  // "All Shopping Centers" (SC file) or "JV III Consolidated" / "NI LLC
  // Consolidated" (office files) — both are the portfolio-level rollup
  // sheet that mirrors a property sheet's layout.
  return /^all\s+/i.test(n) || /consolidated\s*$/i.test(n);
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
  const rawInput = trimMeaningful(r[18] == null ? null : String(r[18]));
  const rawNotes = trimMeaningful(r[19] == null ? null : String(r[19]));
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
  const isRollup = isRollupSheet(sheetName);
  // For property sheets the property code usually lives in row 0 col 1.
  // For rollup sheets ("All Shopping Centers", "JV III Consolidated")
  // that cell carries the rollup's display name instead. For NI LLC's
  // 4000 sheet it carries "Unallocated Expenses" — in that case we fall
  // back to the sheet name (which IS a property code) and use the
  // descriptive text as the display name.
  let code: string;
  let name: string;
  if (isRollup) {
    code = "CONSOLIDATED";
    name = codeRaw || "Consolidated";
  } else if (isPropertyCode(codeRaw.toUpperCase())) {
    code = codeRaw.toUpperCase();
    // Property name: strip leading dash + spaces from "- Brookwood
    // Shopping Center". The SC file carries the name in col 2 of row 0;
    // the JV III office files leave it blank — fall back to PROPERTY_DEFS
    // so the page header reads cleanly either way.
    const nameFromSheet = trim(r0[2]).replace(/^[-\s]+/, "");
    name = nameFromSheet || lookupPropertyName(code) || code;
  } else if (isPropertyCode(sheetName.toUpperCase())) {
    // Sheet name carries the property code; row 0 col 1 has descriptive
    // text (e.g. "Unallocated Expenses" on NI LLC's 4000 sheet — the
    // holding-entity bucket for LLC-level expenses).
    code = sheetName.toUpperCase();
    name = codeRaw || lookupPropertyName(code) || code;
  } else {
    return null;
  }

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
      const rawInput = trimMeaningful(r[18] == null ? null : String(r[18]));
      const rawNotes = trimMeaningful(r[19] == null ? null : String(r[19]));
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

  // Synthesize missing subtotal rows for the main P&L sections so every
  // property — including the CONSOLIDATED rollup — carries the same
  // "Total Rental and Other", "Total Reimbursements", etc. footers
  // regardless of whether the workbook's sheet for that property ships
  // them explicitly. Both SC and the office files leave these rows off
  // their respective consolidated sheets, which is what staff were
  // missing visually.
  const SYNTH_SUBTOTAL_LABEL: Record<string, string> = {
    "revenues":                 "Total Rental and Other",
    "reimbursements":           "Total Reimbursements",
    "reimbursable expenses":    "Total Reimbursable Expenses",
    "non-reimbursable expenses": "Total Non-Reimbursable Expenses",
    "capital improvements":     "Total Capital Improvements",
    "debt service":             "Total Debt Service",
  };
  for (const section of sections) {
    const expected = SYNTH_SUBTOTAL_LABEL[section.name.toLowerCase().trim()];
    if (!expected) continue;
    if (section.lines.some((l) => l.isSubtotal)) continue;
    const summedMonths = Array(12).fill(0);
    let summedTotal = 0;
    for (const l of section.lines) {
      if (l.isSubtotal) continue;
      for (let i = 0; i < 12; i++) summedMonths[i] += l.months[i] ?? 0;
      summedTotal += l.total;
    }
    section.lines.push({
      glAccount: null,
      subCategory: null,
      label: expected,
      months: summedMonths,
      total: summedTotal,
      totalPsf: null,
      input: null,
      notes: null,
      isSubtotal: true,
    });
  }

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
/** Parses the Water Sewer supporting tab — same block-per-property
 *  shape as the INS RET DEBT insurance block but with the data shifted
 *  left two columns (months at cols 2..13 / total at col 14).
 *  Each block has one row per vendor (Aqua, BCWSA, etc.) terminated by
 *  a "TOTAL:" row. */
function parseWaterSewerDetail(rows: unknown[][]): Map<string, BudgetLine[]> {
  const out = new Map<string, BudgetLine[]>();
  let currentCode: string | null = null;
  let currentLines: BudgetLine[] = [];

  for (let i = 4; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const col0 = trim(r[0]);
    const col1 = trim(r[1]);

    // Property block boundary marker
    if (isPropertyCode(col0)) {
      if (currentCode && currentLines.length) out.set(currentCode, currentLines);
      currentCode = col0.toUpperCase();
      currentLines = [];
    }
    if (!currentCode) continue;

    // End of block — TOTAL row
    if (/^total\s*:?\s*$/i.test(col1)) {
      if (currentLines.length) out.set(currentCode, currentLines);
      currentCode = null;
      currentLines = [];
      continue;
    }

    if (!col1) continue;
    const ms: number[] = [];
    for (let j = 2; j < 14; j++) ms.push(num(r[j]));
    const total = num(r[14]);
    if (total === 0 && ms.every((m) => m === 0)) continue;

    const note = r[16] != null && trim(r[16]) !== "" ? trim(r[16]) : null;
    currentLines.push({
      glAccount: null,
      subCategory: null,
      label: col1,
      months: ms,
      total,
      totalPsf: null,
      input: null,
      notes: note,
      isSubtotal: false,
    });
  }
  if (currentCode && currentLines.length) out.set(currentCode, currentLines);
  return out;
}

/** Attach the Water Sewer detail to a property's "Water & Sewer" line
 *  (GL 6130-8502). Matches by label since both the Reimbursements and
 *  the Reimbursable Expenses sides share the same number on office
 *  workbooks. */
function attachWaterSewerSubLines(property: PropertyBudget, subLines: BudgetLine[]): void {
  if (subLines.length === 0) return;
  for (const sec of property.sections) {
    for (const line of sec.lines) {
      if (line.isSubtotal) continue;
      if (/^water\s*(&|and)?\s*sewer$/i.test(line.label.trim())) {
        line.subLines = subLines;
      }
    }
  }
}

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

/** Parses the Allocated Expenses tab — a stack of portfolio-wide
 *  expense blocks (Maintenance Salaries, Leasing Salaries, Marketing
 *  Salaries, Marketing direct, etc.) where each row distributes a
 *  central total across all properties by sqft share OR by an annual
 *  amount listed directly. Returns per-property allocations grouped by
 *  GL so the budget viewer can annotate each P&L line with the
 *  underlying calculation.
 *
 *  Block shape:
 *    Title row:   col 0 = GL, col 1 = label, col 16 = portfolio total,
 *                 col 18 = optional source note
 *    Header row:  col 2 "SF", col 3 "Reimb" (sqft mode) | "Annual"
 *                 (direct $ mode), cols 4..15 = Jan..Dec, col 16 "Total",
 *                 col 18 = optional allocation-basis note
 *    Data rows:   col 1 = property code, col 2 = sqft, col 3 = share % or
 *                 annual $, cols 4..15 = monthly, col 16 = annual total
 *    TOTAL row:   col 1 = "TOTAL:", col 16 = total (matches portfolio
 *                 total on the title row) */
function parseAllocatedExpenses(rows: unknown[][]): Map<string, import("./types").AllocationDetail[]> {
  const out = new Map<string, import("./types").AllocationDetail[]>();
  const push = (code: string, alloc: import("./types").AllocationDetail) => {
    const key = code.toUpperCase();
    let arr = out.get(key);
    if (!arr) { arr = []; out.set(key, arr); }
    arr.push(alloc);
  };

  type PendingRow = {
    code: string;
    sqft: number;
    months: number[];
    propertyAmount: number;
  };
  type Block = {
    gl: string;
    label: string;
    portfolioTotal: number;
    sourceNote: string | null;
    basis: "sqft" | "annual" | "other";
    inHeader: boolean;
    /** Column index where the Jan column starts on this block's data
     *  rows. JV III uses col 4 (no extra columns); NI LLC uses col 5
     *  because the header row carries an extra "Alternate" share %
     *  column between the primary share % and Jan. Detected by finding
     *  "Jan" in the header row. */
    monthStart: number;
    pending: PendingRow[];
  };
  let block: Block | null = null;

  const finalize = (b: Block, totalFromRow: number) => {
    const total = b.portfolioTotal > 0 ? b.portfolioTotal : (totalFromRow > 0 ? totalFromRow : b.pending.reduce((s, p) => s + p.propertyAmount, 0));
    // Build the full block row list once so every per-property
    // allocation can carry the same reference (cheap — 10 rows × 12
    // months per block).
    const blockRows: import("./types").AllocationBlockRow[] = b.pending
      .map((p) => ({
        propertyCode: p.code.toUpperCase(),
        sqft: p.sqft,
        sharePct: total > 0 ? (p.propertyAmount / total) * 100 : 0,
        months: p.months,
        total: p.propertyAmount,
      }))
      .sort((a, c) => a.propertyCode.localeCompare(c.propertyCode));

    for (const p of b.pending) {
      const sharePct = total > 0 ? (p.propertyAmount / total) * 100 : 0;
      push(p.code, {
        propertyAmount: p.propertyAmount,
        sharePct,
        portfolioTotal: total,
        basis: b.basis,
        blockLabel: b.label,
        glAccount: b.gl,
        sourceNote: b.sourceNote ?? undefined,
        rows: blockRows,
      });
    }
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const col0 = trim(r[0]);
    const col1 = trim(r[1]);
    const col3 = trim(r[3]);

    // Title row — GL in col 0, label in col 1, portfolio total in col 16
    // (sometimes col 17 when an extra share column is present), optional
    // source note in col 18+.
    if (col0 && /^\d{4}-\d{4}$/.test(col0) && col1) {
      if (block) finalize(block, 0);
      // Search broadly for portfolio total + note since the column
      // shifts when extra columns are present.
      const titleTotal = num(r[16]) || num(r[17]);
      const noteCol = [r[18], r[19], r[20]].map((c) => (c != null ? trim(c) : "")).find((s) => s !== "");
      block = {
        gl: col0,
        label: col1,
        portfolioTotal: titleTotal,
        sourceNote: noteCol || null,
        basis: "other",
        inHeader: true,
        monthStart: 4,    // default; refined when we hit the header row
        pending: [],
      };
      continue;
    }
    if (!block) continue;

    // Header row — finds the Jan column dynamically, since some
    // workbooks (NI LLC) carry an extra "Alternate" share column that
    // shifts the months right by one. Also detects allocation basis:
    // "Reimb" / "<fund> PRS" / "%" → sqft share, "Annual" → direct
    // dollar amounts per property.
    if (block.inHeader) {
      const janIdx = r.findIndex((c) => /^jan$/i.test(trim(c)));
      if (janIdx > 0) {
        block.monthStart = janIdx;
        // Anything in col 3 that isn't "Annual" is treated as a share-
        // basis label (Reimb, NI LLC PRS, etc.) → sqft allocation.
        const basisLabel = col3.toLowerCase();
        block.basis = /^annual/.test(basisLabel) ? "annual" : "sqft";
        // Header row may also carry a basis note in a column past Total.
        const totalIdx = janIdx + 12;
        for (let i = totalIdx + 1; i < r.length && i <= totalIdx + 4; i++) {
          const v = trim(r[i]);
          if (v && !block.sourceNote) { block.sourceNote = v; break; }
        }
        block.inHeader = false;
      }
      continue;
    }

    // End of block — the TOTAL row carries the portfolio total in the
    // Total column (especially important for annual-basis blocks where
    // the title row's total cell is empty).
    if (/^total\s*:?\s*$/i.test(col1)) {
      finalize(block, num(r[block.monthStart + 12]));
      block = null;
      continue;
    }

    // Per-property data row — buffer; finalize once the block boundary
    // is known so the sharePct can be computed against the real
    // portfolio total.
    if (!block.inHeader && isPropertyCode(col1)) {
      const propertyAmount = num(r[block.monthStart + 12]);
      if (propertyAmount === 0) continue;
      const sqft = num(r[2]);
      const ms: number[] = [];
      for (let j = block.monthStart; j < block.monthStart + 12; j++) ms.push(num(r[j]));
      block.pending.push({ code: col1, sqft, months: ms, propertyAmount });
    }
  }
  if (block) finalize(block, 0);
  return out;
}

/** Attach allocation detail to every line on the property (parent OR
 *  sub-line at any depth) whose GL matches an allocation block's GL.
 *  One line can collect multiple allocations when several blocks share
 *  the same GL (e.g. "Marketing" on the property sheet aggregates both
 *  the Marketing Salaries allocation and the Marketing direct allocation). */
function attachAllocations(property: PropertyBudget, allocations: import("./types").AllocationDetail[]): void {
  if (allocations.length === 0) return;
  const visit = (line: BudgetLine) => {
    if (!line.isSubtotal && line.glAccount) {
      const matches = allocations.filter((a) => a.glAccount === line.glAccount);
      if (matches.length > 0) {
        // Multiple allocations may share a GL but represent different
        // contributions to this line. Dedup by blockLabel to avoid
        // double-counting if the parser ever sees a block twice.
        const seen = new Set<string>();
        line.allocations = matches.filter((a) => {
          const key = `${a.blockLabel}|${a.propertyAmount}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    }
    if (line.subLines) line.subLines.forEach(visit);
  };
  for (const sec of property.sections) sec.lines.forEach(visit);
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
    // Only attach to the Reimbursable Expenses side. The Non-
    // Reimbursable "Building Maintenance" line has its own hardcoded
    // sub-line totals — the Building Maint supporting tab covers
    // operating CAM-style maintenance, not the building's own R&M.
    if (!/^reimbursable expenses?$/i.test(sec.name.trim())) continue;
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
  // "Other Budgets" bucket — one-off books that don't roll into the
  // Shopping Centers / JV III / NI LLC funds: The Office Works (4900),
  // KCP Management (2010), and the LIK payroll budget. Checked before
  // the generic "office" rule so "Office Works" doesn't land in Office.
  if (l.includes("office works") || /\b2010\b/.test(l) || l.includes("payroll budget") || l.includes("lik payroll")) return "Other";
  if (l.includes("shopping center")) return "Shopping Centers";
  if (l.includes("office") || /\bni\s*llc\b/.test(l) || l.includes("jv iii")) return "Office";
  if (l.includes("residential") || l.includes("korman home")) return "Residential";
  return "Other";
}

function idFromLabel(label: string, year: number): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${slug || "budget"}-${year}`;
}

/** When a multi-building workbook has a CONSOLIDATED rollup and at
 *  least two real buildings, synthesize an AllocationDetail on each
 *  building's line for the supplied GLs — Debt Service for JV III /
 *  NI LLC where the loan sits at the fund level and gets split across
 *  the buildings.
 *
 *  portfolioTotal = sum of the buildings' own line totals (the
 *  CONSOLIDATED sheet doesn't always carry the GL as a discrete row
 *  — NI LLC's debt section is just a rollup subtotal). The label
 *  comes from the first building's line so the modal still reads
 *  "Interest" / "Mortgage Amortization" rather than "Total Debt
 *  Service". Skips when fewer than 2 buildings carry a non-zero
 *  amount for the GL — no allocation to make. */
/** Scans the property sheet for "Management Fee" rows, reads the Jan
 *  cell's formula (e.g. ROUND(E$24 * 0.06, 0)), pulls out the
 *  multiplier (6%), and stamps it on the matching BudgetLine.
 *  Management fee % varies by property (SC: 6%, JV III: 4%, NI LLC
 *  Kor Centers: 6%, NI LLC towers: 4%); rendering it inline next to
 *  the label lets staff spot-check what rate each property pays. */
function attachManagementFeePercent(
  property: PropertyBudget,
  rows: unknown[][],
  sheet: XLSX.WorkSheet,
): void {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const col0 = trim(r[0]);
    const col2 = trim(r[2]);
    if (!/management fee/i.test(col2)) continue;
    if (!/^6610-850\d$/.test(col0)) continue;
    const addr = XLSX.utils.encode_cell({ r: i, c: 4 });
    const cell = sheet[addr];
    const formula = cell?.f as string | undefined;
    if (!formula) continue;
    // Match "* 0.06" or "* .06" — the multiplier on the revenue base.
    const m = formula.match(/\*\s*(0?\.[0-9]+)/);
    if (!m) continue;
    const pct = Math.round(parseFloat(m[1]) * 1000) / 10; // 0.06 → 6.0
    for (const sec of property.sections) {
      for (const line of sec.lines) {
        if (line.isSubtotal) continue;
        if (line.glAccount === col0 && /management fee/i.test(line.label)) {
          line.feePercent = pct;
        }
      }
    }
  }
}

/** Set the CONSOLIDATED property's Management Fee feePercent (or
 *  feePercentRange when buildings carry different rates). The rollup
 *  sheet's formula is a SUM across building cells, so the rate isn't
 *  embedded there — derive from the buildings we already stamped. */
function deriveConsolidatedManagementFeePercent(properties: PropertyBudget[]): void {
  const consolidated = properties.find((p) => p.propertyCode === "CONSOLIDATED");
  const buildings = properties.filter((p) => p.propertyCode !== "CONSOLIDATED");
  if (!consolidated || buildings.length < 2) return;
  const buildingPercents = buildings
    .flatMap((b) => b.sections.flatMap((s) => s.lines))
    .filter((l) => !l.isSubtotal && /management fee/i.test(l.label) && l.feePercent != null)
    .map((l) => l.feePercent as number);
  if (buildingPercents.length === 0) return;
  const min = Math.min(...buildingPercents);
  const max = Math.max(...buildingPercents);
  for (const sec of consolidated.sections) {
    for (const line of sec.lines) {
      if (line.isSubtotal) continue;
      if (!/management fee/i.test(line.label)) continue;
      if (!line.glAccount?.startsWith("6610-")) continue;
      if (min === max) line.feePercent = min;
      else line.feePercentRange = [min, max];
    }
  }
}

/** Source workbook spells out "Leasing Salaries and Commissions" — we
 *  use & elsewhere on the page (header treatments, section names) so
 *  normalize here. Easy place to add more renames if other labels
 *  drift. */
function normalizeLabels(properties: PropertyBudget[]): void {
  const rewrites: Array<[RegExp, string]> = [
    [/^Leasing Salaries and Commissions$/i, "Leasing Salaries & Commissions"],
  ];
  const visit = (line: BudgetLine) => {
    for (const [re, replacement] of rewrites) {
      if (re.test(line.label.trim())) {
        line.label = replacement;
        break;
      }
    }
    line.subLines?.forEach(visit);
  };
  for (const property of properties) {
    for (const section of property.sections) section.lines.forEach(visit);
  }
}

function synthesizeMultiBuildingAllocations(
  properties: PropertyBudget[],
  glAccounts: string[],
): void {
  const consolidated = properties.find((p) => p.propertyCode === "CONSOLIDATED");
  const buildings = properties.filter((p) => p.propertyCode !== "CONSOLIDATED");
  if (!consolidated || buildings.length < 2) return;
  const findLine = (p: PropertyBudget, gl: string): BudgetLine | null => {
    for (const sec of p.sections) {
      for (const line of sec.lines) {
        if (!line.isSubtotal && line.glAccount === gl) return line;
      }
    }
    return null;
  };
  for (const gl of glAccounts) {
    const buildingLines = buildings
      .map((b) => ({ building: b, line: findLine(b, gl) }))
      .filter((x): x is { building: PropertyBudget; line: BudgetLine } => !!x.line && x.line.total !== 0);
    if (buildingLines.length < 2) continue;
    const portfolioTotal = buildingLines.reduce((s, { line }) => s + line.total, 0);
    const blockLabel = buildingLines[0].line.label;
    const rows = buildingLines.map(({ building, line }) => ({
      propertyCode: building.propertyCode,
      sqft: building.rentableSqft,
      sharePct: portfolioTotal > 0 ? (line.total / portfolioTotal) * 100 : 0,
      months: line.months.slice(),
      total: line.total,
    }));
    rows.sort((a, b) => a.propertyCode.localeCompare(b.propertyCode));
    for (const { line } of buildingLines) {
      const existing = line.allocations ?? [];
      // Skip if we've already attached a synthetic entry for this GL
      // (e.g. on a re-parse of the same workbook).
      if (existing.some((a) => a.glAccount === gl && a.blockLabel === blockLabel)) continue;
      line.allocations = [
        ...existing,
        {
          propertyAmount: line.total,
          sharePct: portfolioTotal > 0 ? (line.total / portfolioTotal) * 100 : 0,
          portfolioTotal,
          basis: "annual",
          blockLabel,
          glAccount: gl,
          sourceNote: `Allocated across ${buildingLines.length} buildings`,
          rows,
        },
      ];
    }
  }
}

/** The Office Works (4900) workbook is shaped differently from the
 *  shopping-center / JV III / NI LLC books: months sit one column to
 *  the right (E–P → F–Q, total in R, notes in T), the sheet doesn't
 *  carry the rentable-SF / occupancy header block, and the "TOTAL …"
 *  rows live in col 2 rather than col 1. Rather than parameterizing
 *  the main parser, handle it as its own path — small workbook, one
 *  sheet, one supporting tab. */
function parseOfficeWorksSheet(rows: unknown[][], sheetName: string): PropertyBudget | null {
  // Find the "Jan" column dynamically from the header row (row 5 in
  // the 2026 file). Falls back to col 5 (the position observed in the
  // shipped workbook) so a header tweak doesn't kill the parse.
  let janCol = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const r = rows[i] ?? [];
    for (let j = 0; j < r.length; j++) {
      if (/^jan$/i.test(trim(r[j]))) { janCol = j; break; }
    }
    if (janCol >= 0) break;
  }
  if (janCol < 0) janCol = 5;
  const totalCol = janCol + 12;
  const notesCol = totalCol + 2;

  const cellMonths = (r: unknown[]): number[] => r.slice(janCol, janCol + 12).map(num);

  // Property code lives on row 0, but at col 5 (further right than
  // the other workbooks). Name lives on row 1 col 9. Bail if neither
  // is the expected 4900 / "The Office Works" — keeps the focused
  // parser from accidentally claiming a sheet it doesn't understand.
  const r0 = rows[0] ?? [];
  const r1 = rows[1] ?? [];
  let code = "";
  for (let j = 0; j < r0.length; j++) {
    const v = trim(r0[j]);
    if (isPropertyCode(v.toUpperCase())) { code = v.toUpperCase(); break; }
  }
  if (!code) return null;
  let name = "";
  for (let j = 0; j < r1.length; j++) {
    const v = trim(r1[j]);
    if (v && !/operating budget/i.test(v)) { name = v; break; }
  }
  if (!name) name = lookupPropertyName(code) || code;

  const sections: BudgetSection[] = [];
  const rollups: { name: string; total: number; months: number[] }[] = [];
  let currentSection: BudgetSection | null = null;
  // The G&A block is laid out with a zero-valued "General & Administrative"
  // parent row followed by its sub-line items (col 3 labels), which is the
  // reverse of the other workbooks. Track an open parent and attach
  // subsequent col-3 sub-lines until a section header / subtotal / new
  // parent row commits it.
  let openParent: { line: BudgetLine; children: BudgetLine[] } | null = null;
  const commitParent = () => {
    if (!openParent) return;
    if (openParent.children.length > 0) {
      openParent.line.subLines = openParent.children;
      // Derive parent totals from the children since the workbook leaves
      // the parent row blank (sub-lines are inputs).
      const summed = Array(12).fill(0);
      let tot = 0;
      for (const c of openParent.children) {
        for (let i = 0; i < 12; i++) summed[i] += c.months[i] ?? 0;
        tot += c.total;
      }
      openParent.line.months = summed;
      openParent.line.total = tot;
    }
    if (currentSection) currentSection.lines.push(openParent.line);
    openParent = null;
  };

  for (let i = 7; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (rowIsBlank(r)) continue;
    const col0 = trim(r[0]);
    const col1 = trim(r[1]);
    const col2 = trim(r[2]);
    const col3 = trim(r[3]);

    // Stop accumulating once the Skyline import block starts ("BUDGET
    // IMPORT" in col 2). The flat GL → annual table that follows is
    // not part of the main P&L.
    if (/^budget\s+import/i.test(col1) || /^budget\s+import/i.test(col2)) {
      commitParent();
      break;
    }

    // Section header — colon-suffixed label in col 1 with no money.
    if (!col0 && !col2 && col1 && r.slice(janCol, janCol + 12).every((c) => c == null || (typeof c === "string" && c.trim() === ""))) {
      commitParent();
      if (currentSection) sections.push(currentSection);
      currentSection = { name: col1.replace(/:\s*$/, ""), lines: [] };
      continue;
    }

    // Cross-section rollups — "TOTAL REVENUES", "NET OPERATING INCOME",
    // "NET OPERATING CASH FLOW" — labelled in col 2, big monthly figures.
    if (!col0 && !col1 && (/^total\s+revenues?$/i.test(col2) || /^net\s+/i.test(col2))) {
      commitParent();
      const ms = cellMonths(r);
      const total = num(r[totalCol]);
      rollups.push({ name: col2, total, months: ms });
      continue;
    }

    // In-section subtotal ("TOTAL RENTAL & OTHER", "TOTAL REIMBURSEMENTS",
    // "TOTAL SECRETARIAL SERVICES", "TOTAL NON-REIMBURSABLE EXPENSES",
    // "TOTAL OPERATING EXPENSES", "TOTAL CAPITAL EXPENDITURES",
    // "TOTAL DEBT SERVICE").
    if (!col0 && /^total\s+/i.test(col2)) {
      commitParent();
      const ms = cellMonths(r);
      const line: BudgetLine = {
        glAccount: null,
        subCategory: null,
        label: col2,
        months: ms,
        total: num(r[totalCol]),
        totalPsf: null,
        input: null,
        notes: null,
        isSubtotal: true,
      };
      if (currentSection) currentSection.lines.push(line);
      continue;
    }

    // Sub-line row — col 4 (the cell just left of Jan) carries the
    // label; col 2 is empty. Used by the General & Administrative
    // block (Bank Fees, Business Taxes, etc.). When there's no
    // parent open the sub-line is treated as a regular line item
    // below.
    const subLineLabel = trim(r[janCol - 1]);
    if (!col2 && !col1 && subLineLabel && openParent) {
      const ms = cellMonths(r);
      openParent.children.push({
        glAccount: col0 || null,
        subCategory: null,
        label: subLineLabel,
        months: ms,
        total: num(r[totalCol]),
        totalPsf: null,
        input: null,
        notes: trimMeaningful(r[notesCol] == null ? null : String(r[notesCol])),
        isSubtotal: false,
      });
      continue;
    }

    if (col0 || col2) {
      const ms = cellMonths(r);
      const total = num(r[totalCol]);
      const allZero = total === 0 && ms.every((m) => m === 0);

      // Parent-header row — col 2 label, no GL, all zero months. The
      // workbook uses this for "General & Administrative" whose detail
      // sits in col-3 sub-lines below. Open a parent and let the next
      // rows attach.
      if (!col0 && allZero && col2) {
        commitParent();
        openParent = {
          line: {
            glAccount: null,
            subCategory: col1 || null,
            label: col2,
            months: Array(12).fill(0),
            total: 0,
            totalPsf: null,
            input: null,
            notes: trimMeaningful(r[notesCol] == null ? null : String(r[notesCol])),
            isSubtotal: false,
          },
          children: [],
        };
        continue;
      }

      // Regular line item — commit any open parent first.
      commitParent();
      if (!col0 && allZero) continue;
      const line: BudgetLine = {
        glAccount: col0 || null,
        subCategory: col1 || null,
        label: col2 || col0,
        months: ms,
        total,
        totalPsf: null,
        input: null,
        notes: trimMeaningful(r[notesCol] == null ? null : String(r[notesCol])),
        isSubtotal: false,
      };
      if (!currentSection) currentSection = { name: "Other", lines: [] };
      currentSection.lines.push(line);
    }
  }
  commitParent();
  if (currentSection) sections.push(currentSection);

  // Reimbursements section label cleanup — the workbook spells every
  // line with the chargeback code in parens ("Postage (1PO-2PO)
  // (1PP-2PP)") which is noisy for the page. Strip them. For lines
  // where the workbook note carries useful context (Copier rates,
  // Postage markup, Clerical handset), lift it inline next to the
  // label in the same paren shape Management Fee uses — and drop the
  // now-redundant note so no stray ⓘ chip renders.
  for (const sec of sections) {
    if (!/^reimbursements?$/i.test(sec.name.trim())) continue;
    for (const line of sec.lines) {
      if (line.isSubtotal) continue;
      const base = line.label.replace(/\s*\([^)]*\)/g, "").trim();
      if (/^copier/i.test(line.label)) {
        const rateMatch = line.notes?.match(/\$\s*0?\.(\d+)/);
        if (rateMatch) {
          const cents = rateMatch[1].padEnd(2, "0").slice(0, 2);
          line.label = `${base} ($0.${cents}/pg)`;
          line.notes = null;
        } else {
          line.label = base;
        }
      } else if (/^postage/i.test(base)) {
        line.label = `${base} (Cost +20%)`;
        line.notes = null;
      } else if (/^clerical/i.test(base)) {
        line.label = `${base} (KCP Phone)`;
        line.notes = null;
      } else {
        line.label = base;
      }
    }
  }

  // Operation Expenses cleanup — only the three lines staff flagged
  // get touched (Office Supplies, the two Copier rows). Leave the
  // rest of the section alone so parens on labels like "Postage
  // (Pitney Bowes…)" and "Telephone (TDS)" stay as-is.
  for (const sec of sections) {
    if (!/^operation\s+expenses?$/i.test(sec.name.trim())) continue;
    for (const line of sec.lines) {
      if (line.isSubtotal) continue;
      if (/^office\s+supplies$/i.test(line.label.trim())) {
        line.label = "Office Supplies (NR)";
        line.notes = null;
      } else if (/^copier/i.test(line.label)) {
        const rateMatch = line.notes?.match(/\$\s*0?\.(\d+)/);
        if (rateMatch) {
          const cents = rateMatch[1].padEnd(2, "0").slice(0, 2);
          line.label = `${line.label.trim()} ($0.${cents}/pg)`;
          line.notes = null;
        }
      }
    }
  }

  return {
    propertyCode: code,
    propertyName: name,
    rentableSqft: 0,
    occupancyPct: Array(12).fill(0),
    occupancySqft: Array(12).fill(0),
    sections,
    rollups,
    skylineImport: [],
    skylineImportTotal: 0,
  };
}

/** Parse the office roster from the top half of The Office Works'
 *  "Monthly Rent Roll & CIP" tab — each row is one numbered office
 *  (col 1 = tenant name, col 2 = office #, cols 4–15 = monthly rent).
 *  The workbook doesn't carry per-unit SF; staff just need a per-month
 *  "how many of the 32 offices are bringing in rent" count so the
 *  budget page can render the occupancy strip in the same shape as
 *  the property workbooks. */
function parseTowOfficeOccupancy(rows: unknown[][]): { totalUnits: number; monthlyOccupied: number[] } | null {
  // Lock onto the Jan column from the header row.
  let janCol = -1;
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const r = rows[i] ?? [];
    for (let j = 0; j < r.length; j++) {
      if (/^jan$/i.test(trim(r[j]))) { janCol = j; break; }
    }
    if (janCol >= 0) break;
  }
  if (janCol < 0) janCol = 4;

  let totalUnits = 0;
  const monthlyOccupied = Array(12).fill(0);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = trim(r[1]);
    const ofcRaw = trim(r[2]);
    if (!name || !ofcRaw) continue;
    // Stop counting once we hit SUB-TOTAL or the CIP block (col 2 = "CIP").
    if (/^sub-?total$/i.test(name)) break;
    if (/^cip$/i.test(ofcRaw)) continue;
    // Office # is an integer 1–32; ignore anything else (CIP rows
    // already filtered above, but be defensive).
    if (!/^\d+$/.test(ofcRaw)) continue;
    totalUnits++;
    const ms = r.slice(janCol, janCol + 12).map(num);
    const isNamedVacancy = /^vacant$/i.test(name);
    for (let m = 0; m < 12; m++) {
      // A unit counts as occupied in month m when (a) the row isn't
      // labelled "Vacant" and (b) it has rent in that month. Rows like
      // "Vacant/Lyneer" — which start vacant and pick up a tenant
      // mid-year — fall through correctly: the months with rent count
      // as occupied because the name isn't literally "Vacant".
      if (isNamedVacancy) continue;
      if ((ms[m] ?? 0) > 0) monthlyOccupied[m]++;
    }
  }
  if (totalUnits === 0) return null;
  return { totalUnits, monthlyOccupied };
}

/** Pull the building's rentable SF out of the property sheet's "Office
 *  Rent & electric $17.50 psf (10,048 sf)" label, which is where the
 *  workbook records the size. Returns null when the label isn't found
 *  or doesn't carry an SF parenthetical. */
function extractTowRentableSqft(property: PropertyBudget): number | null {
  for (const sec of property.sections) {
    for (const line of sec.lines) {
      if (line.isSubtotal) continue;
      if (!/office\s+rent/i.test(line.label)) continue;
      const m = line.label.match(/\(\s*([\d,]+)\s*sf\s*\)/i);
      if (m) return Number(m[1].replace(/,/g, ""));
    }
  }
  return null;
}

/** Parse the CIP block from The Office Works' "Monthly Rent Roll & CIP"
 *  supporting tab. The CIP roster lives below the rent-roll block —
 *  each row is one CIP member (col 1 = name, col 2 = "CIP" tag, cols
 *  4–15 = monthly billing). Returns the per-tenant breakdown plus the
 *  block total so the UI modal can tie out to the parent line. */
function parseTowCip(rows: unknown[][]): import("./types").CipDetail | null {
  // Find header row to lock in the Jan column.
  let janCol = -1;
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const r = rows[i] ?? [];
    for (let j = 0; j < r.length; j++) {
      if (/^jan$/i.test(trim(r[j]))) { janCol = j; break; }
    }
    if (janCol >= 0) break;
  }
  if (janCol < 0) janCol = 4;

  const tenants: { name: string; months: number[]; total: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = trim(r[1]);
    const tag = trim(r[2]);
    if (!name) continue;
    if (!/^cip$/i.test(tag)) continue;
    const ms = r.slice(janCol, janCol + 12).map(num);
    const t = ms.reduce((s, v) => s + v, 0);
    if (t === 0 && ms.every((m) => m === 0)) continue;
    tenants.push({ name, months: ms, total: t });
  }
  if (tenants.length === 0) return null;
  const total = tenants.reduce((s, t) => s + t.total, 0);
  return { tenants, total };
}

/** Parser for the LIK Management (2010) operating budget. The workbook
 *  is a single management-company P&L — Revenue + Operating Expenses,
 *  no property layout, no occupancy header, no Skyline-style import
 *  block in the body (just appears at the bottom as a flat GL table).
 *
 *  Quirks:
 *   - Months sit at cols C-N (Jan = col 2) with Total / Input / Notes at
 *     cols O / P / Q for parent rows.
 *   - Two sub-line shapes: (A) cols 0+1 empty, label at col 2 with the
 *     numbers shifted one column right — used for the JV III / NI LLC /
 *     SC / Residential breakdown of "Total Management Fees"; (B) col 0
 *     empty, col 1 carries a leading-whitespace label, numbers stay at
 *     cols 2-13 like a parent — used for Base Rents / Electric under
 *     Office Rent, Insurance D&O / W/C / Liab, and the Business Taxes
 *     fragments.
 *   - "TOTAL REVENUES:" + "Net Income" go to rollups; "Sub-Total
 *     Expenses" stays as an in-section subtotal.
 *   - "Budget Import - 2010" at the bottom is the skyline export, ignore. */
function parseLikBudgetSheet(rows: unknown[][]): PropertyBudget | null {
  // Property code lives at row 0 col 0 ("2010") with the workbook title
  // in col 1. Different again from the property books.
  const r0 = rows[0] ?? [];
  const codeRaw = trim(r0[0]);
  if (!isPropertyCode(codeRaw.toUpperCase())) return null;
  const code = codeRaw.toUpperCase();
  const name = trim((rows[1] ?? [])[1]) || lookupPropertyName(code) || code;

  // Lock the Jan column from the header row.
  let janCol = -1;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const r = rows[i] ?? [];
    for (let j = 0; j < r.length; j++) {
      if (/^jan$/i.test(trim(r[j]))) { janCol = j; break; }
    }
    if (janCol >= 0) break;
  }
  if (janCol < 0) janCol = 2;
  const totalCol = janCol + 12;
  const inputCol = janCol + 13;
  const notesCol = janCol + 14;

  const sections: BudgetSection[] = [];
  const rollups: { name: string; total: number; months: number[] }[] = [];
  let currentSection: BudgetSection | null = null;
  let pendingSubLines: BudgetLine[] = [];

  const isKnownSectionName = (s: string) =>
    /^(revenues?|operating\s+expenses?|operation\s+expenses?|reimbursements?|reimbursable\s+expenses?|non-reimbursable\s+expenses?|capital(\s+improvements?|\s+expenditures?)?|debt\s+service)$/i.test(s.trim());

  const monthlyAllEmpty = (r: unknown[], start: number) =>
    r.slice(start, start + 12).every((c) => c == null || (typeof c === "string" && c.trim() === ""));

  const flushPending = () => {
    if (pendingSubLines.length === 0) return;
    if (currentSection) currentSection.lines.push(...pendingSubLines);
    pendingSubLines = [];
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (rowIsBlank(r)) {
      // Blank gap → buffered non-GL rows weren't pre-parent siblings;
      // flush them as standalone lines so we don't lose them.
      flushPending();
      continue;
    }
    const col0 = trim(r[0]);
    // Preserve leading whitespace on col 1 so we can distinguish a
    // sub-line ("   Base Rents") from a parent line ("Base Rents").
    const col1Raw = String(r[1] ?? "");
    const col1 = col1Raw.trim();
    const col2Raw = String(r[2] ?? "");
    const col2 = col2Raw.trim();

    // Skip the title + header rows.
    if (i < 4) continue;

    // Budget Import block — stop main P&L.
    if (/budget\s+import/i.test(col1) || /budget\s+import/i.test(col2)) break;

    // Section header — col 1 set, no money, no GL, label matches a
    // known section name. Restricting to known names keeps zero-row
    // line items like "Non-Deductible expense" from being mis-classed.
    if (!col0 && col1 && isKnownSectionName(col1) && monthlyAllEmpty(r, janCol)) {
      if (currentSection) sections.push(currentSection);
      currentSection = { name: col1, lines: [] };
      pendingSubLines = [];
      continue;
    }

    // Cross-section rollups — TOTAL REVENUES:, Net Income.
    if (!col0 && /^(net\s+income|total\s+revenues?:?)$/i.test(col1)) {
      const ms = r.slice(janCol, janCol + 12).map(num);
      rollups.push({ name: col1.replace(/:\s*$/, ""), total: num(r[totalCol]), months: ms });
      pendingSubLines = [];
      continue;
    }

    // Section subtotal — "Sub-Total Expenses".
    if (!col0 && /^sub-?total/i.test(col1)) {
      const ms = r.slice(janCol, janCol + 12).map(num);
      const line: BudgetLine = {
        glAccount: null, subCategory: null,
        label: col1,
        months: ms,
        total: num(r[totalCol]),
        totalPsf: null, input: null, notes: null,
        isSubtotal: true,
      };
      if (currentSection) currentSection.lines.push(line);
      pendingSubLines = [];
      continue;
    }

    // Non-GL data row — buffer as a potential sub-line. The workbook
    // doesn't explicitly mark sub-lines (no consistent indent / col
    // shift), so we lean on the parent's sum formula instead: when
    // the next GL row's total matches the running sum, attach the
    // buffer as its sub-lines. Otherwise we flush the buffer as
    // standalone rows on the next blank gap.
    //
    // Zero-month rows count too (e.g. Insurance D&O / W/C) — they're
    // legit-but-empty sub-line categories.
    if (!col0 && col1) {
      const ms = r.slice(janCol, janCol + 12).map(num);
      pendingSubLines.push({
        glAccount: null, subCategory: null,
        label: col1,
        months: ms,
        total: num(r[totalCol]),
        totalPsf: null,
        input: trimMeaningful(r[inputCol] == null ? null : String(r[inputCol])),
        notes: trimMeaningful(r[notesCol] == null ? null : String(r[notesCol])),
        isSubtotal: false,
      });
      continue;
    }

    // Parent or standalone line — has either a GL or a flush-left
    // label with monthly values. Attaches the buffered sub-lines
    // when the totals tie out (within $1 for rounding); otherwise
    // flushes them as standalone lines first.
    if ((col0 || col1) && !monthlyAllEmpty(r, janCol)) {
      const ms = r.slice(janCol, janCol + 12).map(num);
      const parentTotal = num(r[totalCol]);
      let attached: BudgetLine[] | undefined;
      if (pendingSubLines.length > 0) {
        const sum = pendingSubLines.reduce((s, l) => s + l.total, 0);
        if (Math.abs(sum - parentTotal) <= 1) {
          attached = pendingSubLines;
        } else {
          if (currentSection) currentSection.lines.push(...pendingSubLines);
        }
        pendingSubLines = [];
      }
      const line: BudgetLine = {
        glAccount: col0 || null,
        subCategory: null,
        label: col1 || col0,
        months: ms,
        total: parentTotal,
        totalPsf: null,
        input: trimMeaningful(r[inputCol] == null ? null : String(r[inputCol])),
        notes: trimMeaningful(r[notesCol] == null ? null : String(r[notesCol])),
        isSubtotal: false,
        subLines: attached,
      };
      if (!currentSection) currentSection = { name: "Other", lines: [] };
      currentSection.lines.push(line);
      continue;
    }
  }
  // Flush any trailing buffered non-GL rows.
  if (pendingSubLines.length > 0 && currentSection) {
    currentSection.lines.push(...pendingSubLines);
  }
  if (currentSection) sections.push(currentSection);

  // Normalize the rollup names + synthesize "TOTAL OPERATING EXPENSES"
  // and "CASH FLOW BEFORE DEBT SERVICE" so the headline pills + the
  // between-section SubtotalCards render consistently with the
  // property workbooks. The workbook's own labels are "TOTAL
  // REVENUES:" / "Net Income" / "Sub-Total Expenses".
  for (const r of rollups) {
    const t = r.name.toUpperCase().replace(/:\s*$/, "").trim();
    if (t === "NET INCOME") r.name = "NET OPERATING INCOME";
    else r.name = t;
  }
  const opsSection = sections.find((s) => /^operating\s+expenses?$/i.test(s.name.trim()));
  const opsSubtotal = opsSection?.lines.find((l) => l.isSubtotal && /^sub-?total/i.test(l.label));
  if (opsSubtotal && !rollups.some((r) => /^total operating expenses?$/i.test(r.name))) {
    rollups.push({
      name: "TOTAL OPERATING EXPENSES",
      total: opsSubtotal.total,
      months: opsSubtotal.months.slice(),
    });
  }
  const noi = rollups.find((r) => r.name === "NET OPERATING INCOME");
  if (noi && !rollups.some((r) => /^cash flow/i.test(r.name))) {
    rollups.push({
      name: "CASH FLOW BEFORE DEBT SERVICE",
      total: noi.total,
      months: noi.months.slice(),
    });
  }

  return {
    propertyCode: code,
    propertyName: name,
    rentableSqft: 0,
    occupancyPct: Array(12).fill(0),
    occupancySqft: Array(12).fill(0),
    sections,
    rollups,
    skylineImport: [],
    skylineImportTotal: 0,
  };
}

/** Attach the parsed CIP roster to The Office Works' "CIP Memberships"
 *  line so the UI can render a click-to-open modal. Matches by GL
 *  (4810-8502) and falls back to label match. */
function attachCipDetail(property: PropertyBudget, cip: import("./types").CipDetail): void {
  for (const sec of property.sections) {
    for (const line of sec.lines) {
      if (line.isSubtotal) continue;
      const glMatch = line.glAccount === "4810-8502";
      const labelMatch = /^cip\s+memberships?$/i.test(line.label.trim());
      if (glMatch || labelMatch) {
        line.cipDetail = cip;
        return;
      }
    }
  }
}

export function parseBudgetWorkbook(
  buf: Buffer | ArrayBuffer,
  label: string,
): BudgetWorkbook {
  const wb = XLSX.read(buf, {
    type: buf instanceof ArrayBuffer ? "array" : "buffer",
    cellDates: false,
    raw: false,
    cellFormula: true,
  });

  const properties: PropertyBudget[] = [];
  let rollup: PropertyBudget | undefined;
  let detectedYear: number | null = null;
  let insuranceDetail: Map<string, BudgetLine[]> | null = null;
  let buildingMaintDetail: Map<string, { contract: BudgetLine[]; recurring: BudgetLine[] }> | null = null;
  let allocatedExpenses: Map<string, import("./types").AllocationDetail[]> | null = null;
  let waterSewerDetail: Map<string, BudgetLine[]> | null = null;
  let towCipDetail: import("./types").CipDetail | null = null;
  let towOfficeOccupancy: { totalUnits: number; monthlyOccupied: number[] } | null = null;

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
    if (ALLOCATED_EXPENSES_SHEET.test(trimmed)) {
      allocatedExpenses = parseAllocatedExpenses(rows);
      continue;
    }
    if (WATER_SEWER_SHEET.test(trimmed)) {
      waterSewerDetail = parseWaterSewerDetail(rows);
      continue;
    }
    if (TOW_RR_CIP_SHEET.test(trimmed)) {
      towCipDetail = parseTowCip(rows);
      towOfficeOccupancy = parseTowOfficeOccupancy(rows);
      continue;
    }
    if (OFFICE_WORKS_SHEET.test(trimmed)) {
      const parsed = parseOfficeWorksSheet(rows, sheetName);
      if (parsed) properties.push(parsed);
      continue;
    }
    if (LIK_BUDGET_SHEET.test(trimmed)) {
      const parsed = parseLikBudgetSheet(rows);
      if (parsed) properties.push(parsed);
      continue;
    }
    const parsed = parsePropertySheet(rows, sheetName);
    if (!parsed) continue;
    attachManagementFeePercent(parsed, rows, sheet);
    if (isRollupSheet(sheetName)) rollup = parsed;
    else properties.push(parsed);
  }

/** Friendly display name for the synthesized "Consolidated" property.
 *  The rollup sheet's row-0 col-1 value can be cryptic ("Consolidated
 *  - 1, 2, 4"); derive a fund/category-aware label from the workbook
 *  label instead so the dropdown reads cleanly. */
function rollupDisplayName(workbookLabel: string, fallback: string): string {
  const l = workbookLabel.toLowerCase();
  if (/jv\s*iii/.test(l)) return "JV III";
  if (/ni\s*llc/.test(l)) return "NI LLC";
  if (/shopping centers/.test(l)) return "All Shopping Centers";
  if (/residential|korman home/.test(l)) return "All Residential";
  return fallback || "Consolidated";
}

  // Surface the rollup as a selectable "Consolidated" entry at the top
  // of the property list so the dropdown lets staff jump straight to
  // the portfolio view alongside the individual buildings. The supporting-
  // tab attachers below correctly no-op on it (no allocations / sub-line
  // detail keyed off propertyCode="CONSOLIDATED").
  if (rollup) {
    rollup.propertyName = rollupDisplayName(label, rollup.propertyName);
    // The workbook's rollup sheet often leaves row 6 (Occupancy SF)
    // blank even though row 5 (Occupancy %) is populated — sum the
    // SF from the underlying buildings so the consolidated view ties
    // out. Same back-fill for rentable SF and occupancy % when blank.
    if (properties.length > 0) {
      const summedSqft = Array.from({ length: 12 }, (_, i) =>
        properties.reduce((s, p) => s + (p.occupancySqft[i] ?? 0), 0),
      );
      const totalRentable = properties.reduce((s, p) => s + p.rentableSqft, 0);
      if (rollup.occupancySqft.every((s) => s === 0)) {
        rollup.occupancySqft = summedSqft;
      }
      if (rollup.rentableSqft === 0) {
        rollup.rentableSqft = totalRentable;
      }
      if (rollup.occupancyPct.every((p) => p === 0) && totalRentable > 0) {
        rollup.occupancyPct = summedSqft.map(
          (s) => Number(((s / totalRentable) * 100).toFixed(1)),
        );
      }
    }
    properties.unshift(rollup);
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
    if (allocatedExpenses) {
      const allocs = allocatedExpenses.get(property.propertyCode);
      if (allocs) attachAllocations(property, allocs);
    }
    if (waterSewerDetail) {
      const subs = waterSewerDetail.get(property.propertyCode);
      if (subs) attachWaterSewerSubLines(property, subs);
    }
    if (towCipDetail && property.propertyCode === "4900") {
      attachCipDetail(property, towCipDetail);
    }
    if (towOfficeOccupancy && property.propertyCode === "4900") {
      // Hydrate the occupancy strip from the workbook's rent roll
      // tab. Per-unit SF isn't carried in the workbook so we allocate
      // the building's RSF evenly across the 32 numbered offices,
      // which matches how staff describe the space ("each office is
      // roughly 300 sf"). Once the portal carries a real 4900 rent
      // roll snapshot we can swap in per-unit SF from there.
      const rsf = extractTowRentableSqft(property) ?? property.rentableSqft;
      if (rsf > 0 && towOfficeOccupancy.totalUnits > 0) {
        const sfPerUnit = rsf / towOfficeOccupancy.totalUnits;
        property.rentableSqft = rsf;
        property.occupancySqft = towOfficeOccupancy.monthlyOccupied.map(
          (n) => Math.round(n * sfPerUnit),
        );
        property.occupancyPct = towOfficeOccupancy.monthlyOccupied.map(
          (n) => Number(((n / towOfficeOccupancy!.totalUnits) * 100).toFixed(1)),
        );
      }
    }
  }

  // Synthesize fund-level allocations for Debt Service GLs across the
  // buildings of a multi-building workbook. JV III's debt sits on the
  // fund-level loan and gets split across the 3 buildings — the
  // Allocated Expenses tab doesn't carry debt blocks, so each building's
  // Interest / Mortgage Amortization line has the right number but no
  // allocation metadata. Pull the CONSOLIDATED total, the per-building
  // amounts, and synthesize an allocation entry on each building's
  // matching line so the modal opens with the same breakdown layout as
  // any other allocated expense. Skip Shopping Centers — each SC has
  // its own loan, not a fund-level allocation, so the modal would
  // misleadingly suggest the loans are shared.
  const category = inferCategoryFromLabel(label);
  // Derive a Management Fee rate for the CONSOLIDATED rollup by
  // looking across the buildings. The rollup sheet's formula is a
  // straight SUM of building cells — no rate of its own.
  deriveConsolidatedManagementFeePercent(properties);
  // Source workbook spells the line "Leasing Salaries and
  // Commissions"; switch to & for consistency with everywhere else
  // we use the ampersand form.
  normalizeLabels(properties);
  if (category === "Office") {
    synthesizeMultiBuildingAllocations(properties, [
      "9210-8501",  // Interest
      "2740-8501",  // Mortgage Amortization
      "2740-0000",  // Loan Proceeds
    ]);
  }

  const year = detectedYear ?? new Date().getFullYear();

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
