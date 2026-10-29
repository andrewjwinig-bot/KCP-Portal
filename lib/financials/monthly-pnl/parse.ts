// Parser for the "Actual by Month" / "Budget by Month" reporting workbooks.
//
// Layout (per building sheet, e.g. "3640"): a few title rows, then a header row
// with Jan…Dec | Total | (gap) | Annual, then a sub-row of Actual/Budget labels,
// then the P&L waterfall — section headers in column B, GL-mask lines with a
// label in column C, and named subtotals (Total Revenues, Net Operating Income,
// …) again in column B. Row positions drift between funds/years, so everything
// is anchored on the Jan…Dec header row and on label text, never fixed rows.

import * as XLSX from "xlsx";
import { MonthlyPnlStatement, PnlLine, PnlSubtotals, PnlKind } from "./types";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);

/** A building sheet is named with a 4-char property code (3610, 40A0, 4000). */
export function isPropertySheet(name: string): boolean {
  return /^[0-9][0-9A-Z]{3}$/.test(name);
}

const SECTION_STARTS = new Set([
  "revenues", "reimbursements", "reimbursable expenses", "non-reimbursable expenses", "debt service",
]);

const SUBTOTAL_KEYS: Record<string, keyof PnlSubtotals> = {
  "total revenue and other": "totalRevenueAndOther",
  "total reimbursements": "totalReimbursements",
  "total revenues": "totalRevenues",
  "total reimbursable expenses": "totalReimbursableExpenses",
  "total non-reimbursable expenses": "totalNonReimbursableExpenses",
  "total operating expenses": "totalOperatingExpenses",
  "net operating income": "netOperatingIncome",
  "total debt service": "totalDebtService",
  "cash flow before debt service": "cashFlowBeforeDebtService",
  "cash flow after debt service": "cashFlowAfterDebtService",
};

type SheetParse = {
  kind: PnlKind;
  year: number | null;
  name: string;
  lines: PnlLine[];
  subtotals: PnlSubtotals;
};

function parseSheet(ws: XLSX.WorkSheet): SheetParse | null {
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null });

  // 1) Locate the Jan…Dec header row and the Total / Annual columns.
  let hdr = -1, monthCols: number[] = [], totalCol = -1, annualCol = -1;
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cells = (rows[r] || []).map(norm);
    const janIdx = cells.indexOf("jan");
    if (janIdx >= 0 && MONTHS.every((m, i) => cells[janIdx + i] === m)) {
      hdr = r;
      monthCols = MONTHS.map((_, i) => janIdx + i);
      totalCol = cells.indexOf("total");
      annualCol = cells.indexOf("annual");
      break;
    }
  }
  if (hdr < 0) return null;

  // 2) Kind — the row under the header labels every month Actual or Budget.
  const kindRow = (rows[hdr + 1] || []).map(norm);
  const kind: PnlKind = kindRow.includes("budget") && !kindRow.includes("actual") ? "budget" : "actual";

  // 3) Year + property name from the title rows (year is best-effort — the
  //    workbook has a known "Actaul" typo, so match loosely; caller can override).
  let year: number | null = null, name = "";
  for (let r = 0; r < rows.length; r++) {
    for (const cell of (rows[r] || [])) {
      const t = String(cell ?? "");
      if (!year) {
        const ym = t.match(/(20\d\d)\s*(?:actual|actaul|budget)/i);
        if (ym) year = Number(ym[1]);
      }
      if (!name && /neshaminy|bldg|building|interplex|plex|center|shop|llc/i.test(t)) name = t.trim();
    }
    if (year && name) break;
  }

  // 4) Walk the waterfall.
  const lines: PnlLine[] = [];
  const subtotals: PnlSubtotals = {};
  let section = "";
  for (let r = hdr + 2; r < rows.length; r++) {
    const row = rows[r] || [];
    const mask = String(row[0] ?? "").trim();
    const colB = norm(row[1]).replace(/\.+$/, "");
    const colC = String(row[2] ?? "").trim();
    const cLabel = norm(colC).replace(/\.+$/, "");
    const monthly = monthCols.map((c) => num(row[c]));
    const total = totalCol >= 0 ? num(row[totalCol]) : monthly.reduce((a, b) => a + b, 0);
    const annualBudget = annualCol >= 0 ? num(row[annualCol]) : 0;
    const hasVals = monthly.some((v) => v !== 0) || total !== 0;

    // Named subtotal — top-level totals sit in col B, section totals in col C.
    // Match either column (exact, or a generous prefix for any source truncation).
    const matchesLabel = (cand: string, lbl: string) =>
      cand === lbl || (cand.length >= 12 && lbl.startsWith(cand)) || cand.startsWith(lbl.slice(0, 18));
    let matched: keyof PnlSubtotals | null = null;
    for (const [lbl, key] of Object.entries(SUBTOTAL_KEYS)) {
      if (matchesLabel(colB, lbl) || matchesLabel(cLabel, lbl)) { matched = key; break; }
    }
    if (matched && !subtotals[matched]) {
      subtotals[matched] = { monthly, total, annualBudget };
      // Reset the section context so below-the-line lines (capital, TI, …) that
      // sit after NOI aren't mis-attributed to the last operating-expense section.
      if (matched === "totalOperatingExpenses") section = "";
      else if (matched === "netOperatingIncome") section = "below-noi";
      continue;
    }

    // Section header (label in col B, no values).
    if (colB && !hasVals && SECTION_STARTS.has(colB)) { section = colB; continue; }

    // Detail line (label in col C, a mask and/or values).
    if (colC && (mask || hasVals)) lines.push({ section, label: colC, mask, monthly, total, annualBudget });
  }

  return { kind, year, name, lines, subtotals };
}

export type ParseOptions = { fallbackYear?: number; fund?: string; sourceFile?: string };

/** Parse every building sheet in the workbook into a MonthlyPnlStatement. */
export function parseMonthlyPnlWorkbook(data: ArrayBuffer | Uint8Array, opts: ParseOptions = {}): MonthlyPnlStatement[] {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const out: MonthlyPnlStatement[] = [];
  for (const sheetName of wb.SheetNames) {
    if (!isPropertySheet(sheetName)) continue;
    const p = parseSheet(wb.Sheets[sheetName]);
    if (!p) continue;
    const year = p.year ?? opts.fallbackYear;
    if (!year) continue; // can't file it without a year
    out.push({
      propertyCode: sheetName,
      propertyName: p.name,
      year,
      kind: p.kind,
      fund: opts.fund,
      lines: p.lines,
      subtotals: p.subtotals,
      sourceFile: opts.sourceFile,
    });
  }
  return out;
}

/** Best-effort fund + year from a workbook filename like
 *  "2024.12_Actual_by_Month__JVIII.xlsm" or "2025_Budget__NILLC_Values1.xlsm". */
export function inferFromFilename(fileName: string): { year?: number; kind?: PnlKind; fund?: string } {
  const y = fileName.match(/(20\d\d)/);
  const kind: PnlKind | undefined = /budget/i.test(fileName) ? "budget" : /actual/i.test(fileName) ? "actual" : undefined;
  let fund: string | undefined;
  if (/jv\s*iii|jviii|jv3/i.test(fileName)) fund = "JV III";
  else if (/ni[\s_]*llc|nillc/i.test(fileName)) fund = "NI LLC";
  else if (/shopping|shop[\s_]*ctr|shopping[\s_]*centers/i.test(fileName)) fund = "Shopping Centers";
  else if (/office[\s_]*works?/i.test(fileName)) fund = "Office Works";
  else if (/lik[\s_]*m(gm)?t/i.test(fileName)) fund = "LIK Mgmt";
  return { year: y ? Number(y[1]) : undefined, kind, fund };
}
