/**
 * THE MANAGEMENT FEE IS A PERCENT OF GROSS REVENUE, not a figure grown from
 * last year. The owner's budget workbook writes it as a formula —
 * `ROUND(E$24 * 0.06, 0)`, row 24 being TOTAL REVENUES (rental and other +
 * reimbursements) — and the parser already reads that multiplier onto the
 * budget of record's line (`feePercent`). The draft applies the SAME rate to
 * its OWN revenue, month by month, so a lease-up or a recovery change moves
 * the fee with it.
 *
 * The rate is per property (SC 6%, JV III 4%, NI LLC towers 4%…) and is read
 * off last year's budget; a property whose workbook carries none keeps the
 * grown figure rather than guessing a rate.
 */
import { accountMatchesMask } from "@/lib/financials/operating-statements/mask";
import type { PropertyBudget } from "./types";

export type FeeRate = { account: string; pct: number };

/** Each management-fee account's rate in the budget of record. */
export function priorFeeRates(prior: PropertyBudget | null | undefined): FeeRate[] {
  const out: FeeRate[] = [];
  for (const sec of prior?.sections ?? []) {
    for (const l of sec.lines) {
      if (l.isSubtotal || l.feePercent == null || !l.glAccount) continue;
      if (!/management fee/i.test(l.label)) continue;
      if (!out.some((r) => r.account === l.glAccount)) out.push({ account: l.glAccount, pct: l.feePercent });
    }
  }
  return out;
}

type Sec = { role: string; lines: { label: string; mask: string; months: number[]; total: number; source?: string; feePct?: number; subLines?: unknown }[]; subtotal: number[]; total: number };

const REVENUE_ROLES = new Set(["revenue", "reimbursement"]);

/** Gross revenue by month — every revenue and reimbursement line, as the
 *  workbook's TOTAL REVENUES row sums them. */
export function grossRevenueMonths(sections: Sec[]): number[] {
  const out = new Array(12).fill(0);
  for (const sec of sections) {
    if (!REVENUE_ROLES.has(sec.role)) continue;
    for (const l of sec.lines) l.months.forEach((v, i) => { out[i] += v || 0; });
  }
  return out;
}

/** Sets each fee line to rate × that month's gross revenue (whole dollars, as
 *  the workbook's ROUND does). Returns the fee's total and whether any fee
 *  line sits in a RECOVERABLE section — there the fee is in the CAM pool,
 *  so the caller re-runs recoveries once the fee has moved. */
export function applyManagementFee(sections: Sec[], rates: FeeRate[]): { total: number; reimbursable: boolean; applied: boolean } {
  let total = 0, reimbursable = false, applied = false;
  if (!rates.length) return { total, reimbursable, applied };
  const rev = grossRevenueMonths(sections);
  for (const sec of sections) {
    if (REVENUE_ROLES.has(sec.role)) continue;
    let touched = false;
    sec.lines = sec.lines.map((l) => {
      if (!/management fee/i.test(l.label) || !l.mask) return l;
      const rate = rates.find((r) => accountMatchesMask(l.mask, r.account));
      if (!rate) return l;
      const months = rev.map((v) => Math.round((v * rate.pct) / 100));
      const t = months.reduce((a, v) => a + v, 0);
      total += t; applied = true; touched = true;
      if (sec.role === "reimbursable-expense") reimbursable = true;
      return { ...l, months, total: t, source: "fee", feePct: rate.pct, subLines: undefined };
    });
    if (touched) {
      const sub = new Array(12).fill(0);
      for (const l of sec.lines) l.months.forEach((v, i) => { sub[i] += v || 0; });
      sec.subtotal = sub.map((v) => Math.round(v));
      sec.total = sec.subtotal.reduce((a, v) => a + v, 0);
    }
  }
  return { total, reimbursable, applied };
}
