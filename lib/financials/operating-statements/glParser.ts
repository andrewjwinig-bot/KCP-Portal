// Parses a Skyline "Year-To-Date / Multi-Year General Ledger" export into the
// per-account period + YTD summary the statement compute consumes.
//
// The export is a transaction report grouped by account:
//
//   <account>  <name>                                   <opening balance>
//     MM/DD/YY  <description>           Jnl  Ref   Debit   Credit   Balance
//     …
//                 <Month> [YYYY] Total                  Σdr     Σcr   <running bal>
//     … (one Total row per month) …
//                                Total                  Σdr     Σcr   <ending bal>
//
// Key facts that make this robust (verified against the 7010 FY2025 export):
//   • P&L accounts open at $0, so a single YTD-range report yields BOTH the
//     current-period figure (that month's Total row) and YTD (Σ of monthly
//     nets through the period) — no second file needed.
//   • Net activity = Debit − Credit. Revenue/reimbursement accounts are
//     credit-normal (net negative); compute.ts flips their sign to positive.
//   • We read the MONTHLY TOTAL rows, not individual transactions — exact and
//     cheap. (Transactions stay available for a future drill-down.)
//   • The Debit column drifts (col 22 vs 23 across exports) while Credit/Balance
//     are stable, so columns are located by header label with a scan window.
//
// Pure + dependency-free: takes a row matrix (the API converts the .xls/.xlsx
// via the `xlsx` lib) so it's trivially unit-tested.

import type { GlSummaryRow } from "./types";

export type GlParseResult = {
  propertyCode: string | null;
  year: number | null;
  /** Inclusive reporting period (1–12) requested. */
  period: number;
  /** Last period present in the file (≥ requested period is clamped to this). */
  maxPeriodInFile: number;
  rows: GlSummaryRow[];
};

/** Per-account monthly nets (Debit − Credit), index 0 = Jan. This is what gets
 *  stored from one upload so any period can be computed without re-uploading. */
export type GlMonthly = {
  propertyCode: string | null;
  year: number | null;
  maxPeriodInFile: number;
  /** account → 12 monthly nets (Jan–Dec). */
  monthly: Record<string, number[]>;
};

type Cell = string | number | null | undefined;
type Row = Cell[];

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const ACCOUNT_RE = /^\d{4}-\d{4}$/;
const MONTH_TOTAL_RE = new RegExp(`^\\s*(${MONTHS.join("|")})(?:\\s+\\d{4})?\\s+total\\b`, "i");

function asStr(v: Cell): string {
  return v == null ? "" : String(v).trim();
}

/** First finite number found in columns [lo, hi] inclusive. */
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

/** Locate the Debit / Credit / Balance columns from the header row that labels
 *  them. Falls back to the observed defaults if the header isn't found. */
function findColumns(rows: Row[]): { debit: number; credit: number; balance: number } {
  for (const row of rows.slice(0, 30)) {
    let debit = -1, credit = -1, balance = -1;
    row.forEach((v, c) => {
      const s = asStr(v).toLowerCase();
      if (s === "debit") debit = c;
      else if (s === "credit") credit = c;
      else if (s === "balance") balance = c;
    });
    if (debit >= 0 && credit >= 0 && balance >= 0) return { debit, credit, balance };
  }
  return { debit: 23, credit: 25, balance: 28 };
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

/** Parse the GL into per-account monthly nets + header meta. */
export function parseGeneralLedgerMonthly(rows: Row[]): GlMonthly {
  const cols = findColumns(rows);
  // Debit value can land one column left of its header (merged cells); scan a
  // small window from the header column.
  const debitLo = Math.max(0, cols.debit - 1), debitHi = cols.credit - 1;
  const creditLo = cols.credit, creditHi = cols.balance - 1;

  const propMatch = findFirst(rows, /Property\/Company\s*:\s*([A-Za-z0-9]+)/);
  const propertyCode = propMatch ? propMatch[1] : null;
  const yearMatch = findFirst(rows, /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+To\s+/i);
  const year = yearMatch ? Number(yearMatch[3]) : null;

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
    // Month-total row — the label sits in the description cluster (cols ~5–9).
    let mIdx = -1;
    for (let c = 5; c <= 10 && c < row.length; c++) {
      const m = asStr(row[c]).match(MONTH_TOTAL_RE);
      if (m) { mIdx = MONTHS.indexOf(m[1].toLowerCase()); break; }
    }
    if (mIdx >= 0) {
      const debit = numIn(row, debitLo, debitHi);
      const credit = numIn(row, creditLo, creditHi);
      monthly[current][mIdx] = debit - credit;
      if (mIdx + 1 > maxMonth) maxMonth = mIdx + 1;
    }
  }

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
