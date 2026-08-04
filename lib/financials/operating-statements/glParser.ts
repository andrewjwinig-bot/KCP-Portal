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
  /** account → opening (Beginning Balance) on the account header row. Zero/
   *  absent for P&L; carries the prior-year carry-forward for balance-sheet
   *  accounts (e.g. Cash), so an ending balance = beginning + YTD net. */
  beginning: Record<string, number>;
  /** account → the GL's "YTD Total" row. For a balance-sheet account this is
   *  the ending balance directly (the Operating Cash KPI reads it). */
  ytdTotal: Record<string, number>;
  /** account → individual transactions, for the line-item drill-down. */
  transactions: Record<string, GlTransaction[]>;
  /** account → the account name/description from the GL header row (e.g.
   *  "0110-0000" → "Cash - Operating"). Used to label accounts that don't map
   *  to a statement/reprojection line. Older uploads omit it. */
  names: Record<string, string>;
  /** True when the GL's date range spans more than one calendar year (a
   *  Multi-Year report run across years). Months are bucketed into the range's
   *  END year; the flag lets the upload warn to run one year per file. */
  multiYear?: boolean;
  /** Distinct calendar years the file touched (sorted), for the warning. */
  yearsCovered?: number[];
};

export type GlTransaction = {
  /** Reporting month 1–12 — by the "<Month> Total" grouping, not the trans
   *  date (a December invoice posted in January is a January transaction). */
  month: number;
  /** Trans date, ISO YYYY-MM-DD when parseable. */
  date: string | null;
  /** Vendor / payer (tenant on a rent charge), kept separate from the merged
   *  description so transactions can be grouped per tenant. */
  vendor?: string;
  description: string;
  ref: string;
  amount: number;
};

type Cell = string | number | boolean | Date | null | undefined;
type Row = Cell[];

const ACCOUNT_RE = /^\d{4}-\d{4}$/;

/** The account name sits in the first text cell after the account number on the
 *  header row (e.g. "0110-0000" then "Cash - Operating"). Returns "" if none. */
function accountNameFrom(row: Row, numCol: number): string {
  for (let c = numCol + 1; c < row.length; c++) {
    const s = asStr(row[c]).trim();
    if (s && /[A-Za-z]/.test(s)) return s;
  }
  return "";
}
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
// Captures the month name (group 1) and, when the label carries one, the year
// (group 2) — e.g. "January 2024 Total" → ["January", "2024"]. The year lets a
// Multi-Year GL bucket each month into the right year instead of colliding.
const MONTH_TOTAL_RE = new RegExp(`^\\s*(${MONTHS.join("|")})(?:\\s+(\\d{4}))?\\s+total\\b`, "i");
const YTD_TOTAL_RE = /^\s*ytd\s+total\b/i;

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
 *  M/D/YY string. (Kept for completeness; the Detailed GL derives months from
 *  the "<Month> Total" rows instead, since transaction Trans Dates can carry a
 *  prior-month invoice date.) */
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
void monthFromCell;

// The report period range — e.g. "1/1/2026 To 1/31/2026" — lives near the top
// (cell K8 on the Detailed GL). Its END month is the authoritative reporting
// period: it tells us which month a single-month file covers, or the latest
// period a YTD file runs through — independent of any transaction dates.
/** Trans date as ISO YYYY-MM-DD (Excel serial / Date / passthrough string). */
function dateFromCell(v: Cell): string | null {
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) {
      return new Date(Math.round(v) * 86400000 + Date.UTC(1899, 11, 30)).toISOString().slice(0, 10);
    }
    return null;
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return v.trim() || null;
  return null;
}

function parseHeader(rows: Row[]): { propertyCode: string | null; year: number | null; startYear: number | null; endYear: number | null; endMonth: number | null } {
  const propMatch = findFirst(rows, /Property\/Company\s*:\s*([A-Za-z0-9]+)/);
  const rangeMatch = findFirst(rows, /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+To\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  const startYear = rangeMatch ? Number(rangeMatch[3]) : null;
  const endYear = rangeMatch ? Number(rangeMatch[6]) : null;
  const endMonth = rangeMatch ? Number(rangeMatch[4]) : null;
  return {
    propertyCode: propMatch ? propMatch[1] : null,
    // The reporting year is the range's END year (start == end for a normal
    // single-year file); a multi-year range is flagged separately.
    year: endYear ?? startYear,
    startYear,
    endYear,
    endMonth: endMonth && endMonth >= 1 && endMonth <= 12 ? endMonth : null,
  };
}

/** If the row is a "<Month> [Year] Total" row (scanning columns [lo, hi]),
 *  return its month index (0–11) and the year on the label (null if none). */
function monthTotalOf(row: Row, lo: number, hi: number): { mIdx: number; year: number | null } | null {
  for (let c = lo; c <= hi && c < row.length; c++) {
    const m = asStr(row[c]).match(MONTH_TOTAL_RE);
    if (m) return { mIdx: MONTHS.indexOf(m[1].toLowerCase()), year: m[2] ? Number(m[2]) : null };
  }
  return null;
}

/** Detailed GL: read each account's per-month "<Month> Total" rows. The month
 *  label reflects the accounting period, NOT individual transaction invoice
 *  dates (which can fall in a prior month — e.g. a December invoice posted in
 *  January), so bucketing by Trans Date would mis-assign the period. The amount
 *  sits in the single signed Amount column. */
type DetailCols = { amount: number; date: number; vendor: number; ref: number; desc: number };
function monthlyFromDetailed(rows: Row[], cols: DetailCols, targetYear: number | null): { monthly: Record<string, number[]>; beginning: Record<string, number>; ytdTotal: Record<string, number>; maxMonth: number; transactions: Record<string, GlTransaction[]>; names: Record<string, string>; otherYears: number[] } {
  const monthly: Record<string, number[]> = {};
  const beginning: Record<string, number> = {};
  const ytdTotal: Record<string, number> = {};
  const transactions: Record<string, GlTransaction[]> = {};
  const names: Record<string, string> = {};
  const otherYears = new Set<number>();
  let current: string | null = null;
  let maxMonth = 0;
  let buffer: GlTransaction[] = []; // pending transactions until their "<Month> Total" row
  for (const row of rows) {
    const c1 = asStr(row[1]);
    if (ACCOUNT_RE.test(c1)) {
      current = c1;
      if (!monthly[current]) monthly[current] = new Array(12).fill(0);
      if (!transactions[current]) transactions[current] = [];
      // The account name sits in the Vendor-Name column (col G on the GL) on
      // the account header row; fall back to the first text cell after the code.
      const nm = asStr(row[cols.vendor]).trim() || accountNameFrom(row, 1);
      if (nm && !names[current]) names[current] = nm;
      beginning[current] = numIn(row, cols.amount, cols.amount + 1);
      buffer = [];
      continue;
    }
    if (!current) continue;
    const mt = monthTotalOf(row, 0, row.length - 1); // "<Month> Total" (not "YTD Total")
    if (mt) {
      // A month total for a DIFFERENT year (multi-year range) — drop its pending
      // transactions and skip, so it can't overwrite the target year's month.
      if (targetYear != null && mt.year != null && mt.year !== targetYear) {
        otherYears.add(mt.year);
        buffer = [];
      } else if (mt.mIdx >= 0) {
        monthly[current][mt.mIdx] = numIn(row, cols.amount, cols.amount + 1);
        if (mt.mIdx + 1 > maxMonth) maxMonth = mt.mIdx + 1;
        // The buffered transactions roll into this accounting month.
        for (const t of buffer) { t.month = mt.mIdx + 1; transactions[current].push(t); }
        buffer = [];
      }
      continue;
    }
    // The account's "YTD Total" row — for a balance-sheet account this IS the
    // ending balance (beginning + YTD activity), captured for the Operating
    // Cash KPI directly off the GL.
    if (row.some((c) => YTD_TOTAL_RE.test(asStr(c)))) {
      ytdTotal[current] = numIn(row, cols.amount, cols.amount + 1);
      continue;
    }
    // A transaction row carries a Trans Date (Beginning Balance / blank rows
    // don't, which keeps them out).
    if (dateFromCell(row[cols.date]) == null) continue;
    const vendor = asStr(row[cols.vendor]);
    const desc = asStr(row[cols.desc]);
    const ref = asStr(row[cols.ref]);
    buffer.push({
      month: 0,
      date: dateFromCell(row[cols.date]),
      vendor: vendor || undefined,
      description: [vendor, desc].filter(Boolean).join(" — ") || ref || "(no description)",
      ref,
      amount: numIn(row, cols.amount, cols.amount + 1),
    });
  }
  return { monthly, beginning, ytdTotal, maxMonth, transactions, names, otherYears: [...otherYears] };
}

/** Year-To-Date / Multi-Year GL: separate Debit/Credit columns with a per-
 *  account "<Month> Total" row (net = Debit − Credit). The Multi-Year layout
 *  (the report run for 2024 and prior years) also carries, per account, the
 *  Beginning Balance on the header row's Balance column, an account grand-
 *  "Total" row (the ending balance), and dated transaction rows — all captured
 *  here so these imports get the SAME Operating Cash KPI + line drill-down as
 *  the Detailed GL. Older Year-To-Date files that lack those rows simply return
 *  empty beginning/ytdTotal/transactions; the monthly nets are identical. */
function monthlyFromDebitCredit(rows: Row[], targetYear: number | null): { monthly: Record<string, number[]>; beginning: Record<string, number>; ytdTotal: Record<string, number>; maxMonth: number; transactions: Record<string, GlTransaction[]>; names: Record<string, string>; otherYears: number[] } {
  // Debit value can land one column left of its header (merged cells).
  const debitCol = headerCol(rows, "debit") ?? 23;
  const creditCol = headerCol(rows, "credit") ?? 25;
  const balanceCol = headerCol(rows, "balance") ?? 28;
  const debitLo = Math.max(0, debitCol - 1), debitHi = creditCol - 1;
  const creditLo = creditCol, creditHi = balanceCol - 1;
  const descCol = headerCol(rows, "description") ?? 5;
  const refCol = headerCol(rows, "ref") ?? 21;
  // Signed activity for a row: Debit − Credit (revenue credit-normal/negative).
  const net = (row: Row) => numIn(row, debitLo, debitHi) - numIn(row, creditLo, creditHi);
  // A transaction row carries an M/D/YY Trans Date in the account-number column.
  const isTxnDate = (s: string) => /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s);

  const monthly: Record<string, number[]> = {};
  const beginning: Record<string, number> = {};
  const ytdTotal: Record<string, number> = {};
  const transactions: Record<string, GlTransaction[]> = {};
  const names: Record<string, string> = {};
  const otherYears = new Set<number>();
  let current: string | null = null;
  let maxMonth = 0;
  let buffer: GlTransaction[] = []; // pending transactions until their "<Month> Total" row
  for (const row of rows) {
    const c1 = asStr(row[1]);
    if (ACCOUNT_RE.test(c1)) {
      current = c1;
      if (!monthly[current]) monthly[current] = new Array(12).fill(0);
      if (!transactions[current]) transactions[current] = [];
      const nm = accountNameFrom(row, 1);
      if (nm && !names[current]) names[current] = nm;
      // Beginning Balance sits in the Balance column on the account header row.
      beginning[current] = numIn(row, balanceCol, balanceCol + 1);
      buffer = [];
      continue;
    }
    if (!current) continue;
    // "<Month> Total" row → the month's net activity; flush its transactions.
    const mt = monthTotalOf(row, 5, 10);
    if (mt) {
      // Skip a month total belonging to a different year (multi-year range).
      if (targetYear != null && mt.year != null && mt.year !== targetYear) {
        otherYears.add(mt.year);
        buffer = [];
      } else if (mt.mIdx >= 0) {
        monthly[current][mt.mIdx] = net(row);
        if (mt.mIdx + 1 > maxMonth) maxMonth = mt.mIdx + 1;
        for (const t of buffer) { t.month = mt.mIdx + 1; transactions[current].push(t); }
        buffer = [];
      }
      continue;
    }
    // The account grand-"Total" row — its Balance column is the ending balance
    // (beginning + YTD net); the Operating Cash KPI reads it for cash accounts.
    if (row.some((c) => /^\s*total\s*$/i.test(asStr(c)))) {
      ytdTotal[current] = numIn(row, balanceCol, balanceCol + 1);
      continue;
    }
    // A dated transaction row — buffered until its month is known.
    if (!isTxnDate(c1)) continue;
    const desc = asStr(row[descCol]);
    const ref = asStr(row[refCol]);
    buffer.push({
      month: 0,
      date: c1,
      vendor: desc || undefined,
      description: desc || ref || "(no description)",
      ref,
      amount: net(row),
    });
  }
  return { monthly, beginning, ytdTotal, maxMonth, transactions, names, otherYears: [...otherYears] };
}

export function parseGeneralLedgerMonthly(rows: Row[]): GlMonthly {
  const { propertyCode, year, startYear, endYear, endMonth } = parseHeader(rows);
  // Multi-Year GL: bucket each month into the range's END year, so a two-year
  // range can't collide (Jan-2023 overwriting Jan-2024). Single-year files have
  // start == end and are unaffected.
  const targetYear = endYear;

  // Format detection: a single "Amount" column → Detailed GL; otherwise fall
  // back to the Debit/Credit "Year-To-Date" layout.
  const amountCol = headerCol(rows, "amount");
  const hasDebit = headerCol(rows, "debit") != null;
  let monthly: Record<string, number[]>;
  let beginning: Record<string, number> = {};
  let ytdTotal: Record<string, number> = {};
  let maxMonth: number;
  let transactions: Record<string, GlTransaction[]> = {};
  let names: Record<string, string> = {};
  let otherYears: number[] = [];
  if (amountCol != null && !hasDebit) {
    const cols: DetailCols = {
      amount: amountCol,
      date: headerCol(rows, "trans date", "date") ?? 0,
      vendor: headerCol(rows, "vendor") ?? 4,
      ref: headerCol(rows, "check", "jnl ref") ?? 9,
      desc: headerCol(rows, "invoice description", "jnl description") ?? 16,
    };
    ({ monthly, beginning, ytdTotal, maxMonth, transactions, names, otherYears } = monthlyFromDetailed(rows, cols, targetYear));
  } else {
    ({ monthly, beginning, ytdTotal, maxMonth, transactions, names, otherYears } = monthlyFromDebitCredit(rows, targetYear));
  }

  // The report range's end month is authoritative for the reporting period;
  // fall back to the last month with activity if the range can't be read.
  const maxPeriodInFile = endMonth ?? (maxMonth || 12);

  // Flag a multi-year range: either the header spans >1 year, or month totals
  // for other years appeared (and were excluded from the target year).
  const yearsCovered = [...new Set([startYear, endYear, ...otherYears].filter((y): y is number => y != null))].sort((a, b) => a - b);
  const multiYear = (startYear != null && endYear != null && startYear !== endYear) || otherYears.length > 0;

  return { propertyCode, year, maxPeriodInFile, monthly, beginning, ytdTotal, transactions, names, multiYear, yearsCovered };
}

/** One year's accumulation while splitting a Multi-Year GL. */
type YearAccum = {
  monthly: Record<string, number[]>;
  beginning: Record<string, number>;
  ytdTotal: Record<string, number>;
  transactions: Record<string, GlTransaction[]>;
  maxMonth: number;
  seen: Set<string>; // accounts whose first month this year was recorded (for beginning)
};

/** Split a Multi-Year (Debit/Credit) GL into one accumulation per calendar year.
 *  Each "<Month> Total" row carries its year, so months bucket into the right
 *  year with no collision; the running Balance column gives each year's
 *  opening (first month's balance − net) and ending (last month's balance). */
function monthlyByYearFromDebitCredit(rows: Row[], defaultYear: number | null): { years: Map<number, YearAccum>; names: Record<string, string> } {
  const debitCol = headerCol(rows, "debit") ?? 23;
  const creditCol = headerCol(rows, "credit") ?? 25;
  const balanceCol = headerCol(rows, "balance") ?? 28;
  const debitLo = Math.max(0, debitCol - 1), debitHi = creditCol - 1;
  const creditLo = creditCol, creditHi = balanceCol - 1;
  const descCol = headerCol(rows, "description") ?? 5;
  const refCol = headerCol(rows, "ref") ?? 21;
  const net = (row: Row) => numIn(row, debitLo, debitHi) - numIn(row, creditLo, creditHi);
  const bal = (row: Row) => numIn(row, balanceCol, balanceCol + 1);
  const isTxnDate = (s: string) => /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s);

  const years = new Map<number, YearAccum>();
  const names: Record<string, string> = {};
  const ensure = (y: number): YearAccum => {
    let a = years.get(y);
    if (!a) years.set(y, (a = { monthly: {}, beginning: {}, ytdTotal: {}, transactions: {}, maxMonth: 0, seen: new Set() }));
    return a;
  };

  let current: string | null = null;
  let buffer: GlTransaction[] = [];
  for (const row of rows) {
    const c1 = asStr(row[1]);
    if (ACCOUNT_RE.test(c1)) {
      current = c1;
      const nm = accountNameFrom(row, 1);
      if (nm && !names[current]) names[current] = nm;
      buffer = [];
      continue;
    }
    if (!current) continue;
    const mt = monthTotalOf(row, 5, 10);
    if (mt) {
      const y = mt.year ?? defaultYear;
      if (mt.mIdx < 0 || y == null) { buffer = []; continue; }
      const acc = ensure(y);
      if (!acc.monthly[current]) acc.monthly[current] = new Array(12).fill(0);
      if (!acc.transactions[current]) acc.transactions[current] = [];
      const nt = net(row);
      acc.monthly[current][mt.mIdx] = nt;
      if (mt.mIdx + 1 > acc.maxMonth) acc.maxMonth = mt.mIdx + 1;
      // Opening = running balance BEFORE this month (balance − net), captured on
      // the first month total seen for this account this year; ending = the
      // running balance after the latest month total (last one wins).
      if (!acc.seen.has(current)) { acc.beginning[current] = bal(row) - nt; acc.seen.add(current); }
      acc.ytdTotal[current] = bal(row);
      for (const t of buffer) { t.month = mt.mIdx + 1; acc.transactions[current].push(t); }
      buffer = [];
      continue;
    }
    // Grand "Total" row — the whole-range ending; per-year endings come from the
    // month totals, so skip it here.
    if (row.some((c) => /^\s*total\s*$/i.test(asStr(c)))) { buffer = []; continue; }
    if (!isTxnDate(c1)) continue;
    const desc = asStr(row[descCol]);
    const ref = asStr(row[refCol]);
    buffer.push({ month: 0, date: c1, vendor: desc || undefined, description: desc || ref || "(no description)", ref, amount: net(row) });
  }
  return { years, names };
}

/** Parse a GL into one GlMonthly PER YEAR it covers. A single-year file (or the
 *  Detailed single-month report) returns a one-element array; a Multi-Year GL
 *  spanning several years returns one entry per year, each ready to store on its
 *  own so every year's statements/history populate from a single upload. */
export function parseGeneralLedgerByYear(rows: Row[]): GlMonthly[] {
  const { propertyCode, endYear, endMonth } = parseHeader(rows);
  const amountCol = headerCol(rows, "amount");
  const hasDebit = headerCol(rows, "debit") != null;
  // The Detailed GL (single Amount column) is a single-month report — never
  // multi-year — so fall back to the single-result parse.
  if (amountCol != null && !hasDebit) return [parseGeneralLedgerMonthly(rows)];

  const { years, names } = monthlyByYearFromDebitCredit(rows, endYear);
  if (years.size <= 1) return [parseGeneralLedgerMonthly(rows)];

  const sorted = [...years.keys()].sort((a, b) => a - b);
  return sorted.map((y) => {
    const acc = years.get(y)!;
    // The end year uses the report's end month (it may be partial); fully
    // elapsed prior years use their last month with activity (normally 12).
    const maxPeriodInFile = y === endYear ? (endMonth ?? (acc.maxMonth || 12)) : (acc.maxMonth || 12);
    return {
      propertyCode, year: y, maxPeriodInFile,
      monthly: acc.monthly, beginning: acc.beginning, ytdTotal: acc.ytdTotal,
      transactions: acc.transactions, names,
      multiYear: true, yearsCovered: sorted,
    };
  });
}

/** Reconcile parsed monthly nets against the GL's own reported ending balances:
 *  for each account, beginning + Σ(monthly nets) must equal the account's
 *  "Total"/"YTD Total" ending balance. Only accounts that reported an ending
 *  balance are checked; a clean import reconciles every one. A mis-detected
 *  column layout shows up immediately as mismatches. */
export type GlReconciliation = {
  checked: number;
  reconciled: number;
  mismatches: { account: string; name: string | null; computed: number; reported: number; diff: number }[];
  /** Σ of every account's full-year net — a complete trial balance nets to ~0. */
  trialBalanceNet: number;
};

export function reconcileGl(m: GlMonthly): GlReconciliation {
  const mismatches: GlReconciliation["mismatches"] = [];
  let checked = 0;
  for (const [account, nets] of Object.entries(m.monthly)) {
    const reported = m.ytdTotal[account];
    if (reported == null) continue;
    checked++;
    const computed = (m.beginning[account] ?? 0) + nets.reduce((a, n) => a + n, 0);
    if (Math.abs(computed - reported) > 0.02) {
      mismatches.push({ account, name: m.names[account] ?? null, computed, reported, diff: computed - reported });
    }
  }
  const trialBalanceNet = Object.values(m.monthly).reduce((a, nets) => a + nets.reduce((x, n) => x + n, 0), 0);
  return { checked, reconciled: checked - mismatches.length, mismatches, trialBalanceNet };
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
