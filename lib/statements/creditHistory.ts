// Open credits month over month (owner, 11/2026: "see the +/- over previous
// months to see if we are getting things resolved or not"). Pure.
//
// Each month is read by the SAME rule the Open Credits page reads today
// (`openCreditTenants`): the Credit Balance Report where it covers a property,
// else the Laser Statement — only as of that month's end: the newest Credit
// Balance snapshot on or before the last day of the month, and the newest
// Laser Statement for that month or earlier. Credits under $5 are left off,
// as the page leaves them off. The latest point IS the page's current list,
// so the trend always ends on the figures above it.

import { composeAging, creditLinesOf, laserCreditTenants, MIN_OPEN_CREDIT, type AgingSnapshot, type OpenCreditTenant } from "./aging";
import type { StatementRun, TenantStatement } from "./types";

export type CreditMonth = {
  /** "YYYY-MM". */
  month: string;
  /** The newest data date inside the month. */
  asOf: string;
  tenants: number;
  /** Total credits held, positive. */
  credit: number;
  /** Charges − credits across those tenants (negative = we hold money). */
  net: number;
  /** unit ref (upper case) → that tenant's credit. */
  byUnit: Record<string, number>;
};

export type CreditChange = {
  /** The month compared against. */
  prior: CreditMonth;
  /** Tenants with a credit last month and none now. */
  resolved: { unitRef: string; credit: number }[];
  /** Tenants with a credit now and none last month. */
  added: { unitRef: string; credit: number }[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function lastDay(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** One month's figures from a set of credit tenants. */
export function summarizeCredits(month: string, tenants: OpenCreditTenant[]): CreditMonth | null {
  const byUnit: Record<string, number> = {};
  let credit = 0, net = 0, asOf = "";
  for (const t of tenants) {
    const credits = creditLinesOf(t);
    if (!credits.length) continue;
    const c = r2(-credits.reduce((a, l) => a + l.amount, 0));
    if (c < MIN_OPEN_CREDIT) continue;
    const charges = t.lines.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0);
    byUnit[t.unitRef.toUpperCase()] = r2((byUnit[t.unitRef.toUpperCase()] ?? 0) + c);
    credit += c; net += charges - c;
    if (t.asOf > asOf) asOf = t.asOf;
  }
  const units = Object.keys(byUnit);
  if (!units.length && !asOf) return null;
  return { month, asOf: asOf || lastDay(month), tenants: units.length, credit: r2(credit), net: r2(net), byUnit };
}

/** The credit tenants as the page would have read them at a month's end. */
export function creditTenantsAsOf(
  month: string, snaps: AgingSnapshot[], runs: StatementRun[],
  laserDate: (st: TenantStatement, runUpdated: string) => string,
): OpenCreditTenant[] | null {
  const cutoff = lastDay(month);
  const aging = composeAging(snaps, cutoff);
  const run = [...runs].filter((r) => r.period <= month).sort((a, b) => b.period.localeCompare(a.period))[0] ?? null;
  if (!run && !Object.keys(aging.coverage).length) return null;
  const laser = run ? laserCreditTenants(run.statements, aging.coverage, (st) => laserDate(st, run.updatedAt)) : [];
  return [...aging.tenants, ...laser];
}

/**
 * Up to `count` months, oldest first, ending with `current` (the page's own
 * list, filed under the month of its newest data). A month with no data on
 * file is left out rather than read as zero.
 */
export function creditHistory(
  current: OpenCreditTenant[], snaps: AgingSnapshot[], runs: StatementRun[],
  laserDate: (st: TenantStatement, runUpdated: string) => string, count = 6,
): CreditMonth[] {
  const latestAsOf = current.map((t) => t.asOf).filter(Boolean).sort().pop();
  if (!latestAsOf) return [];
  const nowMonth = latestAsOf.slice(0, 7);
  const now = summarizeCredits(nowMonth, current);
  const out: CreditMonth[] = [];
  const [y, m] = nowMonth.split("-").map(Number);
  for (let i = count - 1; i >= 1; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const month = d.toISOString().slice(0, 7);
    const tenants = creditTenantsAsOf(month, snaps, runs, laserDate);
    if (!tenants) continue;
    // A month whose newest data is from an EARLIER month is a repeat of it, not news.
    const s = summarizeCredits(month, tenants);
    if (s && s.asOf.slice(0, 7) === month) out.push(s);
  }
  if (now) out.push(now);
  return out;
}

/** Who cleared and who is new since the month before the latest. */
export function creditChange(history: CreditMonth[]): CreditChange | null {
  if (history.length < 2) return null;
  const now = history[history.length - 1];
  const prior = history[history.length - 2];
  const resolved = Object.entries(prior.byUnit).filter(([u]) => !(u in now.byUnit)).map(([unitRef, credit]) => ({ unitRef, credit }));
  const added = Object.entries(now.byUnit).filter(([u]) => !(u in prior.byUnit)).map(([unitRef, credit]) => ({ unitRef, credit }));
  return { prior, resolved: resolved.sort((a, b) => b.credit - a.credit), added: added.sort((a, b) => b.credit - a.credit) };
}
