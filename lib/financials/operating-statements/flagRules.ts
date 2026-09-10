// Shared "is this line worth investigating?" rules, so the per-property
// statement page, the Excel/PDF export, AND the cross-property Review all apply
// IDENTICAL logic. Previously the seasonal/lumpy adjustments lived only in the
// statement route, so the Review still flagged summer snow etc.

import type { SectionRole } from "./types";

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
 *  - Capital is lumpy and unplannable → never trend-flagged.
 *  - Snow off-season → a ~$0 is expected (drop the flags); a real charge in the
 *    off-season is unusual and probably miscoded (flag THAT instead).
 *  - Real-estate taxes are paid in a lump → a $0 month is expected (drop). A RET
 *    value still runs the normal checks (catches a double-pay). A year with NO
 *    RET posted is caught separately by the not-posted check.
 * `period` is the month (1–12), `periodActual` that month's amount.
 */
export function seasonalTrendFlags(
  role: SectionRole,
  line: LineLike,
  period: number,
  periodActual: number,
  baseFlags: string[],
): string[] {
  if (role === "capital") return [];
  if (isSnowLine(line) && !SNOW_SEASON.has(period)) {
    return Math.abs(periodActual) >= 100
      ? ["snow charge posted outside the Nov–Mar season — verify the GL coding"]
      : [];
  }
  if (isRetLine(line) && Math.abs(periodActual) < 100) return [];
  return baseFlags;
}
