// Month-over-month signals for a statement line, so auto-explain can hunt for
// things that look "off" (a line that jumped vs recent months, a missing or
// extra recurring payment) — not just actual-vs-budget variance.
//
// Pure (operates on numeric series) so it's unit-tested.

/** This month's amount departs materially from the mean of the prior months.
 *  Needs ≥3 months so there's a pattern to break. */
export function amountAnomaly(amounts: number[]): boolean {
  if (amounts.length < 3) return false;
  const last = amounts[amounts.length - 1];
  const prior = amounts.slice(0, -1);
  const avg = prior.reduce((a, b) => a + b, 0) / prior.length;
  const diff = Math.abs(last - avg);
  if (diff < 500) return false; // immaterial dollar move
  return Math.abs(avg) < 1 ? true : diff / Math.abs(avg) > 0.4; // >40% off the recent run
}

/** Prior months all share one transaction count and this month breaks it —
 *  e.g. utilities that post twice a month suddenly post once (missed bill) or
 *  three times (possible double-pay). Needs ≥3 months. */
export function countAnomaly(counts: number[]): boolean {
  if (counts.length < 3) return false;
  const last = counts[counts.length - 1];
  const prior = counts.slice(0, -1);
  return prior[0] > 0 && prior.every((c) => c === prior[0]) && last !== prior[0];
}

/** This month departs materially from the same month last year. */
export function yoyAnomaly(thisYear: number | null, lastYear: number | null): boolean {
  if (thisYear == null || lastYear == null) return false;
  const diff = Math.abs(thisYear - lastYear);
  if (diff < 500) return false;
  return Math.abs(lastYear) < 1 ? true : diff / Math.abs(lastYear) > 0.4;
}

/** Human-readable reasons a line is worth a look this month. */
export function trendFlags(amounts: number[], counts: number[], thisYearSameMonth: number | null = null, lastYearSameMonth: number | null = null): string[] {
  const out: string[] = [];
  if (amountAnomaly(amounts)) out.push("amount differs sharply from recent months");
  if (countAnomaly(counts)) out.push("transaction count differs from recent months");
  if (yoyAnomaly(thisYearSameMonth, lastYearSameMonth)) out.push("differs from the same month last year");
  return out;
}
