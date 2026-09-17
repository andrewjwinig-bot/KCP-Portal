// Shared "is this line worth investigating?" rules, so the per-property
// statement page, the Excel/PDF export, AND the cross-property Review all apply
// IDENTICAL logic. Previously the seasonal/lumpy adjustments lived only in the
// statement route, so the Review still flagged summer snow etc.

import type { SectionRole } from "./types";

/**
 * The smallest variance worth anyone's time.
 *
 * The trend checks already ignore a move under this much (`amountAnomaly`,
 * `yoyAnomaly` in `trends.ts`), but they measure a line against ITS OWN recent
 * months or against last year — not against budget. So a line sitting on budget
 * could still earn a "?" for having moved, and 9510's July statement showed
 * exactly that: Maintenance Salaries 577 vs 615, Building Maintenance 422 vs
 * 500, Landscaping 212 vs 515 — $38, $78 and $303 of variance, each carrying a
 * "?" next to it, while the one line that mattered (Parking Lot Maintenance,
 * 28,350 vs 592) carried the same mark and no more weight.
 *
 * A mark that appears on four lines and means something on one is not a signal.
 */
export const FLAG_MIN_DOLLARS = 500;

/**
 * Is this line's variance big enough to be worth investigating?
 *
 * A line with NO budget has no variance to measure, so it passes and falls back
 * to the trend checks' own dollar floor — otherwise an unbudgeted line could
 * never be flagged at all, which is the opposite of what the floor is for.
 */
export function meetsFlagFloor(periodVariance: number | null | undefined): boolean {
  if (periodVariance == null || !Number.isFinite(periodVariance)) return true;
  return Math.abs(periodVariance) >= FLAG_MIN_DOLLARS;
}

/** Snow removal is seasonal — expensed Nov–Mar. */
const SNOW_SEASON = new Set([11, 12, 1, 2, 3]);

type LineLike = { label: string; mask: string; accounts?: string[] };

export function isSnowLine(l: LineLike): boolean {
  return /snow/i.test(l.label) || /6370/.test(l.mask) || (l.accounts?.some((a) => a.startsWith("6370")) ?? false);
}

export function isRetLine(l: LineLike): boolean {
  return /real\s*estate\s*tax/i.test(l.label) || /6410/.test(l.mask) || (l.accounts?.some((a) => a.startsWith("6410")) ?? false);
}

/**
 * Adjust a line's raw month-over-month trend flags for seasonal / lumpy lines,
 * so the "?" only appears where it's meaningful:
 *  - A variance under FLAG_MIN_DOLLARS is not worth a look, whatever the trend
 *    says (see the note on that constant).
 *  - Capital is lumpy and unplannable → never trend-flagged.
 *  - Snow off-season → a ~$0 is expected (drop the flags); a real charge in the
 *    off-season is unusual and probably miscoded (flag THAT instead).
 *  - Real-estate taxes are paid in a lump → a $0 month is expected (drop). A RET
 *    value still runs the normal checks (catches a double-pay). A year with NO
 *    RET posted is caught separately by the not-posted check.
 * `period` is the month (1–12), `periodActual` that month's amount, and
 * `periodVariance` that month's actual-less-budget (null when unbudgeted).
 */
export function seasonalTrendFlags(
  role: SectionRole,
  line: LineLike,
  period: number,
  periodActual: number,
  baseFlags: string[],
  periodVariance?: number | null,
): string[] {
  if (role === "capital") return [];
  if (!meetsFlagFloor(periodVariance)) return [];
  if (isSnowLine(line) && !SNOW_SEASON.has(period)) {
    // A mis-coded snow charge is worth seeing, but the same floor applies —
    // nobody is opening the GL over $200 of July snow.
    return Math.abs(periodActual) >= FLAG_MIN_DOLLARS
      ? ["snow charge posted outside the Nov–Mar season — verify the GL coding"]
      : [];
  }
  if (isRetLine(line) && Math.abs(periodActual) < 100) return [];
  return baseFlags;
}
