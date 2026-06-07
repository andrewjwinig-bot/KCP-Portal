// Parses a Skyline General Ledger export into per-account period + YTD
// activity. Supports the two report layouts seen in the wild:
//
//  A) "Detailed General Ledger" (the report staff actually run) — a single
//     signed `Amount` column, transactions carrying a `Trans Date`, and an
//     account header row that also holds the "Beginning Balance". P&L accounts
//     carry a non-zero beginning balance (prior-period accumulation), so we
//     sum the DATED TRANSACTIONS per month (verified to reproduce each
//     account's "<Month> Total" exactly) rather than trusting balances.
//
//  B) "Year-To-Date General Ledger" — separate Debit/Credit columns and one
//     "<Month> Total" row per account; P&L opens at $0. (Older sample.)
//
// Either way the result is per-account monthly nets (Debit − Credit, i.e.
// revenue credit-normal/negative; compute.ts flips revenue to positive). One
// upload powers any reporting period.
//
// Pure + dependency-free (takes a row matrix; the API converts the .xls/.xlsx
// via the `xlsx` lib), so it's trivially unit-tested.

import type { GlSummaryRow } from "./types";

export type GlParseResult = {
  propertyCode: string | null;
  year: number | null;
  period: number;
  maxPeriodInFile: number;
  rows: GlSummaryRow[];
};

export type GlMonthly = {
  propertyCode: string | null;
  year: number | null;
  maxPeriodInFile: number;
  /** account → 12 monthly nets (Jan–Dec). */
  monthly: Record<string, number[]>;
};

type Cell = string | number | boolean | Date | null | undefined;
type Row = Cell[];

const ACCOUNT_RE = /^\d{4}-\d{4}$/;
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_TOTAL_RE = new RegExp(`^\\s*(${MONTHS.join("|")})(?:\\s+\\d{4})?\\s+total\\b`, "i");

function asStr(v: Cell): string {
  return v == null ? "" : String(v).trim();
}

/** First finite number in columns [lo, hi]. */
function numIn(row: Row, lo: number, hi: number): number {
  for (let c = lo; c <= hi && c < row.length; c++) {
    const v = row[c];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v.replace(/[$,]/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

/** Column whose header cell (in the first ~14 rows) contains any of the labels. */
function headerCol(rows: Row[], ...labels: string[]): number | null {
  for (const row of rows.slice(0, 14)) {
    for (let c = 0; c < row.length; c++) {
      const s = asStr(row[c]).toLowerCase().replace(/\s+/g, " ").trim();
      if (s && labels.some((l) => s.includes(l))) return c;
    }
  }
  return null;
}

function findFirst(rows: Row[], re: RegExp): RegExpMatchArray | null {
  for (const row of rows.slice(0, 30)) {
    for (const cell of row) {
      const m = asStr(cell).match(re);
      if (m) return m;
    }
  }
  return null;
}

/** Month (1–12) from a Trans Date cell — Excel serial number, Date, or
 *  M/D/YY string. Returns null for non-dates (Beginning Balance / Total /
 *  blank rows), which is how transactions are separated from subtotals. */
function monthFromCell(v: Cell): number | null {
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) {
      const d = new Date(Math.round(v) * 86400000 + Date.UTC(1899, 11, 30));
      return d.getUTCMonth() + 1;
    }
    return null;
  }
  if (v instanceof Date) return v.getUTCMonth() + 1;
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      const mm = Number(m[1]);
      return mm >= 1 && mm <= 12 ? mm : null;
    }
  }
  return null;
}

function parseHeader(rows: Row[]): { propertyCode: string | null; year: number | null } {
  const propMatch = findFirst(rows, /Property\/Company\s*:\s*([A-Za-z0-9]+)/);
  const yearMatch = findFirst(rows, /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+To\s+/i);
  return {
    propertyCode: propMatch ? propMatch[1] : null,
    year: yearMatch ? Number(yearMatch[3]) : null,
  };
}

/** Detailed GL: sum dated transactions per account per month. */
function monthlyFromDetailed(rows: Row[], amountCol: number, dateCol: number): { monthly: Record<string, number[]>; maxMonth: number } {
  const monthly: Record<string, number[]> = {};
  let current: string | null = null;
  let maxMonth = 0;
  for (const row of rows) {
    const c1 = asStr(row[1]);
    if (ACCOUNT_RE.test(c1)) {
      current = c1;
      if (!monthly[current]) monthly[current] = new Array(12).fill(0);
      continue;
    }
    if (!current) continue;
    const month = monthFromCell(row[dateCol]); // null for Beginning Balance / Total rows
    if (month == null) continue;
    monthly[current][month - 1] += numIn(row, amountCol, amountCol + 1);
    if (month > maxMonth) maxMonth = month;
  }
  return { monthly, maxMonth };
}

/** Year-To-Date GL: read the per-account monthly "Total" rows (Debit − Credit). */
function monthlyFromDebitCredit(rows: Row[]): { monthly: Record<string, number[]>; maxMonth: number } {
  // Debit value can land one column left of its header (merged cells).
  const debitCol = headerCol(rows, "debit") ?? 23;
  const creditCol = headerCol(rows, "credit") ?? 25;
  const balanceCol = headerCol(rows, "balance") ?? 28;
  const debitLo = Math.max(0, debitCol - 1), debitHi = creditCol - 1;
  const creditLo = creditCol, creditHi = balanceCol - 1;

  const monthly: Record<string, number[]> = {};
  let current: string | null = null;
  let maxMonth = 0;
  for (const row of rows) {
    const c1 = asStr(row[1]);
    if (ACCOUNT_RE.test(c1)) {
      current = c1;
      if (!monthly[current]) monthly[current] = new Array(12).fill(0);
      continue;
    }
    if (!current) continue;
    let mIdx = -1;
    for (let c = 5; c <= 10 && c < row.length; c++) {
      const m = asStr(row[c]).match(MONTH_TOTAL_RE);
      if (m) { mIdx = MONTHS.indexOf(m[1].toLowerCase()); break; }
    }
    if (mIdx >= 0) {
      monthly[current][mIdx] = numIn(row, debitLo, debitHi) - numIn(row, creditLo, creditHi);
      if (mIdx + 1 > maxMonth) maxMonth = mIdx + 1;
    }
  }
  return { monthly, maxMonth };
}

export function parseGeneralLedgerMonthly(rows: Row[]): GlMonthly {
  const { propertyCode, year } = parseHeader(rows);

  // Format detection: a single "Amount" column → Detailed GL; otherwise fall
  // back to the Debit/Credit "Year-To-Date" layout.
  const amountCol = headerCol(rows, "amount");
  const hasDebit = headerCol(rows, "debit") != null;
  const { monthly, maxMonth } =
    amountCol != null && !hasDebit
      ? monthlyFromDetailed(rows, amountCol, headerCol(rows, "trans date", "date") ?? 0)
      : monthlyFromDebitCredit(rows);

  return { propertyCode, year, maxPeriodInFile: maxMonth || 12, monthly };
}

/** Collapse monthly nets into the period + YTD summary the compute consumes. */
export function summaryForPeriod(monthly: Record<string, number[]>, period: number): GlSummaryRow[] {
  const out: GlSummaryRow[] = [];
  for (const [account, nets] of Object.entries(monthly)) {
    const periodActual = nets[period - 1] ?? 0;
    const ytdActual = nets.slice(0, period).reduce((a, n) => a + n, 0);
    if (periodActual === 0 && ytdActual === 0) continue; // skip dormant accounts
    out.push({ account, periodActual, ytdActual });
  }
  return out;
}

export function parseGeneralLedger(rows: Row[], requestedPeriod: number): GlParseResult {
  const m = parseGeneralLedgerMonthly(rows);
  const period = Math.min(Math.max(1, requestedPeriod), m.maxPeriodInFile);
  return {
    propertyCode: m.propertyCode,
    year: m.year,
    period,
    maxPeriodInFile: m.maxPeriodInFile,
    rows: summaryForPeriod(m.monthly, period),
  };
}
