// Parses a Skyline "Posting Report" — the receipt of journal entries posted in
// a run — into per-property, per-account, per-month deltas that can be layered
// onto the stored GLs as an interim update between full GL uploads.
//
// Two layouts appear in the wild, both handled here:
//  A) "A/P Posting Report" — a single property (its code in the
//     "Posting Property/Company : NNNN" header), the A/P invoices just posted.
//  B) "General Ledger Posting Report" — MANY properties in one file (a portfolio
//     post). Each journal line carries a Unit Ref whose prefix is the property
//     code (e.g. "3620-100" → 3620), so one file fans out to every property.
//
// A GL stores each account's monthly activity as net = debit − credit (uniform,
// no per-account sign flip); the posting report carries debit/credit per line,
// so a delta is just Σ(debit) − Σ(credit) per account/month — the exact same
// convention. Pure (operates on the sheet's string rows) so it's unit-tested.

import type { GlTransaction } from "./glParser";

export type PostingFormat = "ap" | "gl";

/** One property's posted activity: account → 12 monthly nets + transactions,
 *  plus the per-account net the report's own totals block claims (a checksum). */
export type PostingProperty = {
  property: string;
  monthly: Record<string, number[]>;
  transactions: Record<string, GlTransaction[]>;
  /** account → net (debit − credit) as summed from this property's lines. */
  net: Record<string, number>;
  /** Distinct months (1–12) this property's lines touch. */
  months: number[];
};

export type ParsedPostingReport = {
  format: PostingFormat;
  /** "Post Thru" date if present (MM/DD/YYYY). */
  postThru: string | null;
  /** Calendar year inferred from the line dates / post-thru. */
  year: number | null;
  properties: PostingProperty[];
  totalDebit: number;
  totalCredit: number;
  /** Double-entry sanity: total debits == total credits (within a cent). */
  balanced: boolean;
  /** Distinct months (1–12) any line touches. */
  months: number[];
};

const ACCT_RE = /^\d{4}-\d{4}$/;
const UNITREF_RE = /^[0-9]{3,4}[A-Z0-9]*-[A-Za-z0-9]+$/; // 3620-100, 4080-RT1, 9800-1
const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;

const s = (v: unknown): string => (v == null ? "" : String(v)).trim();
const num = (v: unknown): number => {
  const t = s(v).replace(/[$,]/g, "");
  if (!t || t === "-") return 0;
  const n = Number(t.replace(/^\((.*)\)$/, "-$1")); // (123) → -123
  return Number.isFinite(n) ? n : 0;
};
const monthOf = (date: string): number => {
  const m = DATE_RE.exec(date);
  return m ? Math.min(12, Math.max(1, Number(m[1]))) : 0;
};
const yearOf = (date: string): number | null => {
  const m = DATE_RE.exec(date);
  if (!m) return null;
  const y = Number(m[3]);
  return y < 100 ? 2000 + y : y;
};

/** Property code from a unit ref ("3620-100" → "3620") or a bare code. */
function propOfUnitRef(ref: string): string | null {
  const t = s(ref);
  if (UNITREF_RE.test(t)) return t.split("-")[0];
  if (/^\d{3,4}[A-Z0-9]*$/.test(t)) return t;
  return null;
}

/** Find the column index whose header cell (rows 0..~14) contains a label. */
function headerCol(rows: string[][], ...labels: string[]): number | null {
  for (let r = 0; r < Math.min(rows.length, 16); r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const cell = s(rows[r][c]).toLowerCase();
      if (labels.some((l) => cell === l || cell.startsWith(l))) return c;
    }
  }
  return null;
}

/** First number found in columns [lo, hi] (inclusive); 0 if none. */
function numInRange(row: string[], lo: number, hi: number): number {
  for (let c = lo; c <= hi && c < row.length; c++) {
    const v = num(row[c]);
    if (v) return v;
  }
  return 0;
}

const looksLikeTotalsRow = (cells: string[]): boolean =>
  cells.some((c) => /^(property totals|grand totals|gl\s+account summary|account no\.?|total)$/i.test(s(c)));

/** Detect the report format from the title / header text. */
export function detectPostingFormat(raw: (string | number | null)[][]): PostingFormat | null {
  const rows = raw.map((r) => (r ?? []).map(s));
  const head = rows.slice(0, 12).map((r) => r.join(" ")).join(" \n ").toLowerCase();
  if (head.includes("general ledger posting report")) return "gl";
  if (head.includes("a/p posting report") || head.includes("posting property/company")) return "ap";
  if (head.includes("posting report")) return head.includes("post to property") ? "gl" : "ap";
  return null;
}

/** Parse a Skyline posting report (either layout) into per-property deltas. */
export function parsePostingReport(raw: (string | number | null)[][]): ParsedPostingReport {
  const rows: string[][] = raw.map((r) => (r ?? []).map(s));
  const format = detectPostingFormat(rows) ?? "gl";

  const debitCol = headerCol(rows, "debit") ?? (format === "gl" ? 34 : 34);
  const creditCol = headerCol(rows, "credit") ?? (format === "gl" ? 40 : 40);
  const dateCol = headerCol(rows, "date");
  const acctCol = headerCol(rows, "gl acct", "gl account", "gl  acct");
  const descCol = headerCol(rows, "description");
  const refCol = headerCol(rows, "ref", "ref.");

  // AP layout: single property from the header line.
  let apProperty: string | null = null;
  if (format === "ap") {
    for (const row of rows.slice(0, 12)) {
      for (const cell of row) {
        const m = /posting property\/company\s*:?\s*(\d{3,4}[A-Z0-9]*)/i.exec(s(cell));
        if (m) { apProperty = m[1]; break; }
      }
      if (apProperty) break;
    }
  }

  let postThru: string | null = null;
  for (const row of rows.slice(0, 14)) {
    for (const cell of row) {
      const m = /post thru\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(s(cell));
      if (m) { postThru = m[1]; break; }
    }
    if (postThru) break;
  }

  const byProp = new Map<string, PostingProperty>();
  const ensureProp = (code: string): PostingProperty => {
    let p = byProp.get(code);
    if (!p) byProp.set(code, (p = { property: code, monthly: {}, transactions: {}, net: {}, months: [] }));
    return p;
  };

  let totalDebit = 0, totalCredit = 0;
  let inferredYear: number | null = yearOf(postThru ?? "");
  const monthsSeen = new Set<number>();

  for (const row of rows) {
    if (looksLikeTotalsRow(row)) continue;
    // Locate the pieces of a journal line: a date, a GL account, an amount.
    const date = dateCol != null ? s(row[dateCol]) : (row.map(s).find((c) => DATE_RE.test(c)) ?? "");
    if (!DATE_RE.test(date)) continue;
    const acct = acctCol != null && ACCT_RE.test(s(row[acctCol]))
      ? s(row[acctCol])
      : (row.map(s).find((c) => ACCT_RE.test(c)) ?? "");
    if (!ACCT_RE.test(acct)) continue;

    const month = monthOf(date);
    if (!month) continue;
    inferredYear = inferredYear ?? yearOf(date);
    monthsSeen.add(month);

    // Debit sits in the debit column band, credit at/after the credit column.
    const debit = numInRange(row, Math.max(0, debitCol - 2), creditCol - 1);
    const credit = numInRange(row, creditCol, row.length - 1);
    const amount = debit - credit;
    totalDebit += debit;
    totalCredit += credit;

    const code = format === "ap" ? apProperty : propOfUnitRef(s(row[0]));
    if (!code) continue;
    const p = ensureProp(code);

    (p.monthly[acct] ??= new Array(12).fill(0))[month - 1] += amount;
    p.net[acct] = (p.net[acct] ?? 0) + amount;
    const description = descCol != null ? s(row[descCol]) : "";
    const ref = refCol != null ? s(row[refCol]) : "";
    (p.transactions[acct] ??= []).push({
      month, date, description: description || ref || "(posted)", ref, amount,
      vendor: description || undefined,
    });
  }

  const monthsOfMonthly = (m: Record<string, number[]>): number[] => {
    const set = new Set<number>();
    for (const nets of Object.values(m)) for (let i = 0; i < 12; i++) if (Math.abs(nets[i] ?? 0) > 0.005) set.add(i + 1);
    return [...set].sort((a, b) => a - b);
  };
  return {
    format,
    postThru,
    year: inferredYear,
    properties: [...byProp.values()]
      .map((p) => ({ ...p, months: monthsOfMonthly(p.monthly) }))
      .sort((a, b) => a.property.localeCompare(b.property)),
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    months: [...monthsSeen].sort((a, b) => a - b),
  };
}
