// SHARED LEASING & MAINTENANCE OFFICE — LIK's office space that works for
// every property, billed back each month with the Allocated Expenses (owner,
// 11/2026: "a portion of our office is leasing and maintenance office shared
// for all the properties … whatever that sf is as a prs of Korman Commercial
// 2010 Office Rental line item should be allocated to all properties").
//
// The month's cost is 2010's Office Rental (8110-*, the 4080-400 rent AND its
// electric, both posted there). Its shared part is each space's square feet
// over the whole office (suite 4080-400 on the rent roll), and each space goes
// to the properties it serves — the owner's option (b):
//   Nancy's office      → the business parks        (9301)
//   Harry's office      → the shopping centres      (9302)
//   Greg's office       → every property            (9303)
//   The conference room → every property            (9303)
// The amounts ride into the month's allocation as ordinary 9301 / 9302 / 9303
// accounts named "Shared Leasing & Maintenance Office", billed to each
// property's Other G&A (8990-8501). From there they take the same path as the
// 2000 accounts: the $100 hold, the invoice to AvidXchange, and — when 2010 is
// posted after its month went out, or later changes — the late-charge true-up.
//
// Pure: the numbers are passed in; `sharedOfficeFor` (server) reads them.

import type { GLParseResult, GLTransaction, GLAccountTotal } from "./glParser";

export const SHARED_OFFICE_NAME = "Shared Leasing & Maintenance Office";
/** The account each property books it to — Other G&A, on every property's
 *  General & Administrative line. */
export const SHARED_OFFICE_BASE = "8990";
/** LIK's office: suite 4080-400 at Building 8. */
export const LIK_OFFICE_UNIT = "4080-400";
/** 2010's Office Rental — the rent and the electric both post here. */
export const OFFICE_RENTAL_MASK = /^8110-/;

export type SharedSpace = { name: string; sqft: number; suffix: "9301" | "9302" | "9303" };

export const SHARED_SPACES: SharedSpace[] = [
  { name: "Nancy's office (leasing, business parks)", sqft: 116, suffix: "9301" },
  { name: "Harry's office (leasing, shopping centers)", sqft: 180, suffix: "9302" },
  { name: "Greg's office (maintenance, all properties)", sqft: 210, suffix: "9303" },
  { name: "Conference room (all properties)", sqft: 96, suffix: "9303" },
];

/** The first month billed. Earlier months were billed before this existed
 *  (the old year-end Rent Reimbursement) — adding them now would read as late
 *  charges on every finalized month and true them all up. */
export const SHARED_OFFICE_FROM = "2026-10";

export const SHARED_SQFT = SHARED_SPACES.reduce((s, x) => s + x.sqft, 0);

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The month's shared amount per allocation suffix: Office Rental × each
 *  space's SF ÷ the office's SF. Empty when either is missing. */
/** The account-totals key for an allocated line: the shared office keeps its
 *  own entry so a 2000 account of the same number never absorbs it. */
export const totalsKey = (accountCode: string, accountName: string) => (accountName === SHARED_OFFICE_NAME ? `${accountCode}|shared` : accountCode);

export function sharedOfficeAmounts(officeRental: number, officeSqft: number): { suffix: "9301" | "9302" | "9303"; amount: number }[] {
  if (!officeRental || !(officeSqft > 0)) return [];
  const by = new Map<"9301" | "9302" | "9303", number>();
  for (const s of SHARED_SPACES) by.set(s.suffix, (by.get(s.suffix) ?? 0) + officeRental * (s.sqft / officeSqft));
  return [...by.entries()].map(([suffix, amount]) => ({ suffix, amount: r2(amount) })).filter((x) => Math.abs(x.amount) >= 0.005);
}

export type SharedOfficeMonth = { month: string; officeRental: number; officeSqft: number };

const isShared = (name: string) => name === SHARED_OFFICE_NAME;

function lastDay(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 0).getDate();
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
}

/** The GL with each month's shared office added as 9301 / 9302 / 9303 lines.
 *  Idempotent: a GL already carrying them (a stashed copy) is returned as is.
 *  A single-month GL gets account totals; a range GL gets transactions, which
 *  `splitIntoMonths` totals by month. */
export function withSharedOffice(gl: GLParseResult, months: SharedOfficeMonth[]): GLParseResult {
  if (gl.transactions.some((t) => isShared(t.accountName)) || [...gl.accountTotals.values()].some((a) => isShared(a.accountName))) return gl;
  const txs: GLTransaction[] = [];
  for (const m of months) {
    for (const a of sharedOfficeAmounts(m.officeRental, m.officeSqft)) {
      txs.push({
        accountCode: `${SHARED_OFFICE_BASE}-${a.suffix}`, accountName: SHARED_OFFICE_NAME, accountSuffix: a.suffix,
        date: lastDay(m.month), jrn: "", ref: "SHARED-OFFICE",
        debit: a.amount > 0 ? a.amount : 0, credit: a.amount < 0 ? -a.amount : 0, net: a.amount,
        description: `${SHARED_SQFT} of ${m.officeSqft.toLocaleString("en-US")} SF of 2010 Office Rental`,
      });
    }
  }
  if (!txs.length) return gl;
  const accountTotals = new Map<string, GLAccountTotal>(gl.accountTotals);
  if (/^\d{4}-\d{2}$/.test(gl.statementMonth)) {
    for (const t of txs.filter((x) => lastDay(gl.statementMonth) === x.date)) {
      // Keyed apart from any 2000 account of the same number, so neither
      // overwrites the other; both bill to 8990-8501.
      accountTotals.set(totalsKey(t.accountCode, t.accountName), { accountCode: t.accountCode, accountName: t.accountName, accountSuffix: t.accountSuffix, netTotal: t.net });
    }
  }
  return { ...gl, transactions: [...gl.transactions, ...txs], accountTotals };
}

/** The calendar months a GL covers ("YYYY-MM" or "YYYY-MM_to_YYYY-MM"). */
export function monthsOfPeriod(period: string): string[] {
  const m = period.match(/^(\d{4})-(\d{2})(?:_to_(\d{4})-(\d{2}))?$/);
  if (!m) return [];
  const out: string[] = [];
  let y = Number(m[1]), mo = Number(m[2]);
  const ey = m[3] ? Number(m[3]) : y, em = m[4] ? Number(m[4]) : mo;
  while (y < ey || (y === ey && mo <= em)) {
    out.push(`${y}-${String(mo).padStart(2, "0")}`);
    if (++mo > 12) { mo = 1; y++; }
  }
  return out;
}

// ─── 2026 YEAR-TO-DATE TRUE-UP (owner, 11/2026: "when i posted november can
// you true up the year to date reimbursement for the office rent and
// electric … then itll be month by month after that") ──────────────────────
//
// Billing month by month starts at SHARED_OFFICE_FROM. The months of 2026
// before it — and October too when it went out before this existed — are
// billed ONCE, as one true-up invoice per property, after November is posted
// (`sharedOfficeTrueUp.ts`). Every property bills in full: a catch-up of a
// year is not held under $100.

export const TRUEUP_YEAR = 2026;
/** The true-up waits for 2010's November — the owner's trigger. */
export const TRUEUP_AFTER_MONTH = 11;

/** "TU4080YTD26" — a true-up, property, the year to date. Deterministic, so
 *  AvidXchange's duplicate check catches a resend. */
export const trueUpInvoiceId = (propertyId: string, year = TRUEUP_YEAR) =>
  `TU${String(propertyId).replace(/[^A-Z0-9]/gi, "").toUpperCase()}YTD${String(year).slice(2)}`;

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "January – September 2026". */
export function trueUpLabel(months: string[]): string {
  const s = [...months].sort();
  if (!s.length) return "";
  const name = (m: string) => MONTH_NAMES[Number(m.slice(5, 7)) - 1];
  return s.length === 1 ? `${name(s[0])} ${s[0].slice(0, 4)}` : `${name(s[0])} – ${name(s[s.length - 1])} ${s[s.length - 1].slice(0, 4)}`;
}

/** The months' shared office summed into ONE GL dated the last of them, ready
 *  for `computeOneMonth`. Each suffix's line says the months it covers. Pure. */
export function trueUpGl(months: SharedOfficeMonth[]): GLParseResult | null {
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  if (!sorted.length) return null;
  const by = new Map<"9301" | "9302" | "9303", number>();
  for (const m of sorted) for (const a of sharedOfficeAmounts(m.officeRental, m.officeSqft)) by.set(a.suffix, r2((by.get(a.suffix) ?? 0) + a.amount));
  if (![...by.values()].some((v) => Math.abs(v) >= 0.005)) return null;
  const last = sorted[sorted.length - 1].month;
  const label = trueUpLabel(sorted.map((m) => m.month));
  const date = lastDay(last);
  const accountTotals = new Map<string, GLAccountTotal>();
  const transactions: GLTransaction[] = [];
  for (const [suffix, amount] of by) {
    const accountCode = `${SHARED_OFFICE_BASE}-${suffix}`;
    accountTotals.set(totalsKey(accountCode, SHARED_OFFICE_NAME), { accountCode, accountName: SHARED_OFFICE_NAME, accountSuffix: suffix, netTotal: amount });
    transactions.push({
      accountCode, accountName: SHARED_OFFICE_NAME, accountSuffix: suffix, date, jrn: "", ref: "SHARED-OFFICE-YTD",
      debit: amount > 0 ? amount : 0, credit: amount < 0 ? -amount : 0, net: amount, description: `${label} true-up`,
    });
  }
  return {
    statementMonth: last,
    periodText: `${SHARED_OFFICE_NAME} — ${label} true-up`,
    periodEndDate: `${last}-${date.slice(3, 5)}`,
    transactions, accountTotals,
  };
}
