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
 * The bar for an AS-NEEDED line, which is higher because those lines swing by
 * nature.
 *
 * Building Maintenance, Parking Lot Maintenance and Landscaping are the ones
 * the owner named: unpredictable by construction, so a big month or a $0 month
 * is normal rather than informative. Holding them to the same $500 as Electric
 * means the lines that move most earn the most marks, which is backwards — the
 * mark should go where movement is surprising.
 *
 * A judgement call, not a derived number: raise it if these still read noisy,
 * lower it if a real overrun slips through.
 */
export const LOOSE_FLAG_MIN_DOLLARS = 1_500;

/**
 * Whether a line posts on a schedule at THIS property.
 *
 * Landscaping is the case that forced this: some properties have a contract
 * that invoices every month, others call someone when the grass needs cutting.
 * The label is identical either way, so no keyword can tell them apart — but
 * the ledger can. A line that posted in most months so far IS a contract here;
 * one that posted in three months out of seven is not.
 *
 * Needs at least three months before it will claim to know.
 */
export function postsRegularly(history?: number[] | null): boolean | null {
  if (!history || history.length < 3) return null;
  const posted = history.filter((a) => Math.abs(a) >= 0.5).length;
  return posted / history.length >= 0.7;
}

/**
 * Which floor this line is held to.
 *
 * `history` is the line's month-by-month amounts at this property, and it is
 * what settles the AMBIGUOUS lines. Without it an ambiguous line falls to the
 * loose floor — the direction of every change in this file is less noise, and
 * a landscaping overrun that hides is a smaller cost than four marks a month
 * nobody reads.
 */
export function flagFloorFor(line?: { label: string } | null, history?: number[] | null): number {
  if (!line) return FLAG_MIN_DOLLARS;
  if (CONTRACTUAL.test(line.label)) return FLAG_MIN_DOLLARS;
  if (!AMBIGUOUS.test(line.label)) {
    return DISCRETIONARY.test(line.label) ? LOOSE_FLAG_MIN_DOLLARS : FLAG_MIN_DOLLARS;
  }
  // Ambiguous: let this property's own ledger answer it.
  return postsRegularly(history) ? FLAG_MIN_DOLLARS : LOOSE_FLAG_MIN_DOLLARS;
}

/**
 * Is this line's variance big enough to be worth investigating?
 *
 * A line with NO budget has no variance to measure, so it passes and falls back
 * to the trend checks' own dollar floor — otherwise an unbudgeted line could
 * never be flagged at all, which is the opposite of what the floor is for.
 */
export function meetsFlagFloor(
  periodVariance: number | null | undefined,
  line?: { label: string } | null,
  history?: number[] | null,
): boolean {
  if (periodVariance == null || !Number.isFinite(periodVariance)) return true;
  return Math.abs(periodVariance) >= flagFloorFor(line, history);
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
  /** This line's month-by-month amounts at this property — settles whether an
   *  ambiguous line (landscaping) is on a contract HERE. */
  history?: number[] | null,
): string[] {
  if (role === "capital") return [];
  if (!meetsFlagFloor(periodVariance, line, history)) return [];
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

/**
 * Where the amber ⚠ "not posted" mark belongs.
 *
 * The finding itself (`expectedMissing`) is computed once in `compute.ts`, but
 * WHICH CELL it marks was decided in three places — the statement page, the
 * Excel export and the PDF — and all three had the same defect: a
 * budget-basis finding is YTD-scoped ("nothing posted all year against a
 * $2,500 YTD budget") and yet it painted the MONTHLY cell too, on a month that
 * had budgeted nothing. Parking Lot Maintenance read `⚠ | 0` for July: nothing
 * was expected that month, nothing was posted, and the row carried a warning.
 *
 * A month that budgeted nothing cannot be missing anything.
 */
type ExpectedMissingLike = { scope: "ytd" | "period" } | null | undefined;

export function marksPeriodUnposted(
  em: ExpectedMissingLike,
  periodActual: number,
  periodBudget: number | null | undefined,
): boolean {
  if (!em || Math.abs(periodActual) >= 0.5) return false;
  // A debt signal IS about this month — the Debt Tracker schedules P&I for it.
  if (em.scope === "period") return true;
  // A budget signal only reaches the month when the month expected something.
  return periodBudget != null && Math.abs(periodBudget) >= 0.5;
}

export function marksYtdUnposted(em: ExpectedMissingLike, ytdActual: number): boolean {
  return !!em && em.scope === "ytd" && Math.abs(ytdActual) < 0.5;
}

/**
 * A line whose budget is a PROVISION, not a commitment.
 *
 * "Nothing posted against a budget" only means something is MISSING when the
 * money was going to be spent either way — a utility bill arrives, a contract
 * invoices, payroll runs, taxes are billed. An as-needed line is different:
 * the budget is money set aside in case the lot needs patching, and a year
 * where it doesn't is a good year, not an unposted charge.
 *
 * Capital was already exempt for exactly this reason ("lumpy and hard to
 * plan"). Parking Lot Maintenance sits in the same category and was not, so a
 * $0 against a $2,500 provision read as an error.
 *
 * CONTRACTUAL wins over DISCRETIONARY deliberately, because the words overlap:
 * "Maintenance Salaries" is payroll and runs every period; "Parking Lot
 * Cleaning" is a sweeping contract. Only "Parking Lot Maintenance" is the
 * as-needed one, and the difference is a single word.
 */
const CONTRACTUAL =
  /(salar|payroll|wage|benefit|insurance|\btax|utilit|electric|\bgas\b|water|sewer|trash|refuse|rubbish|security|snow|clean|janitor|sweep|management fee|elevator|alarm|sprinkler|fire\s|licen|permit|\brent\b|lease|service contract)/i;
const DISCRETIONARY =
  /(repair|maintenance|paving|resurfac|striping|patch|paint|signage|improvement|replacement|contingen|legal|professional|consult|bad\s*debt|roof|misc|other|supplies|equipment|tools)/i;
/**
 * Lines that are a contract at SOME properties and as-needed at others.
 *
 * Checked before both lists, because the words overlap with each: the label
 * cannot settle it, so `flagFloorFor` asks the property's ledger instead.
 */
const AMBIGUOUS = /(landscap|ground|lawn|mow|pest|exterminat|window wash|porter)/i;

export function isDiscretionaryLine(l: { label: string }): boolean {
  if (CONTRACTUAL.test(l.label)) return false;
  return DISCRETIONARY.test(l.label);
}
