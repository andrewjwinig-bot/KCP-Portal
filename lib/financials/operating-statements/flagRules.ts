// Shared "is this line worth investigating?" rules, so the per-property
// statement page, the Excel/PDF export, AND the cross-property Review all apply
// IDENTICAL logic. Previously the seasonal/lumpy adjustments lived only in the
// statement route, so the Review still flagged summer snow etc.

import type { SectionRole } from "./types";
import { basisForLine } from "./rentCheck";

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

/**
 * Grounds work is seasonal too, and it is snow's mirror image: nothing grows
 * Dec–Mar, so a $0 landscaping month in winter is the expected state.
 *
 * Snow had this rule from the start and grounds did not, which produced
 * "No grounds spend at all Jan–Apr … the recurring landscape contract appears
 * unbilled or unposted. Chase Sharp's Landscaping for missing invoices." The
 * observation is a good one — a contract that stops invoicing IS worth
 * catching — but it was counting winter as evidence.
 */
const GROUNDS_SEASON = new Set([4, 5, 6, 7, 8, 9, 10, 11]);

export function isGroundsLine(l: { label: string; mask?: string }): boolean {
  return /(landscap|ground|lawn|mow|mulch|irrigat|\btree)/i.test(l.label);
}

type LineLike = { label: string; mask: string; accounts?: string[] };

export function isSnowLine(l: LineLike): boolean {
  return /snow/i.test(l.label) || /6370/.test(l.mask) || (l.accounts?.some((a) => a.startsWith("6370")) ?? false);
}

/**
 * A line whose spend is DEAL-DRIVEN, so its budget is not a commitment and a
 * $0 budget is not a finding.
 *
 * Tenant improvements are the clearest case: TI is spent because a lease was
 * signed, and a budget set a year earlier cannot have known which suites would
 * lease or what allowance they would carry. So "the whole year's TI spend sits
 * against a zero budget" describes how the business works, not an error — and
 * "tie it to the tenant allowances in the new leases and get the funding
 * approved" tells the owner to approve funding they already approved when they
 * signed the lease.
 *
 * Capital accounts (14xx here) are the same shape as the `capital` section
 * role, which has always been exempt from trend flags for exactly this reason
 * ("lumpy and unplannable"). This catches the line wherever it sits, since a
 * TI line does not always live in a section typed `capital`.
 *
 * It does NOT suppress the flag: naming what the capital spend WAS, and
 * whether it landed on the right account, is the useful half of that note.
 * It tells the note not to make the BUDGET the finding.
 */
export function isCapitalLine(l: LineLike, role?: SectionRole): boolean {
  if (role === "capital") return true;
  if (/(tenant\s*improvement|leasehold|leasing\s*commission|build[\s-]*out|capital)/i.test(l.label)) return true;
  if (/\b14\d\d/.test(l.mask)) return true;
  return l.accounts?.some((a) => /^14\d\d/.test(a)) ?? false;
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
  if (isGroundsLine(line) && !GROUNDS_SEASON.has(period) && Math.abs(periodActual) < FLAG_MIN_DOLLARS) {
    // Nothing grows in January. The mirror of the snow rule above.
    return [];
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

/**
 * Nothing posted against a real budget.
 *
 * A $0 actual makes the variance EXACTLY the budget and the percentage exactly
 * 100% — by arithmetic, not by performance. Rendered the normal way that came
 * out as a green "+100.0%", which reads as money saved. It isn't: it means the
 * charge hasn't landed yet (insurance paid elsewhere, taxes paid up front, a
 * bill still to post). 9510's July showed three of them in one section —
 * Insurance 0 vs 653, Real Estate Taxes 0 vs 1,391, Building Maintenance 1 vs
 * 200 at +99.5%.
 *
 * Whatever is actually going on is already said by the ⚠ (unposted) or the ✅
 * (paid up front) marker in the actual column. The percentage adds a claim on
 * top of it, and the claim is wrong.
 */
export function nothingPosted(
  actual: number | null | undefined,
  budget: number | null | undefined,
): boolean {
  return actual != null && Math.abs(actual) < 0.5
    && budget != null && Math.abs(budget) >= 0.5;
}

/**
 * A line where NOTHING POSTED ALL YEAR is evidence of an error rather than an
 * observation about a budget.
 *
 * The "not posted" signal answers one question: is a figure the statement
 * should be carrying simply absent? Debt answers it with evidence — the Debt
 * Tracker holds the lender's own schedule, so we KNOW a payment was due. A
 * budget is not evidence of the same kind. It is a plan, and a plan that was
 * not spent is frequently the correct outcome.
 *
 * `isDiscretionaryLine` already removed the worst of that (Parking Lot
 * Maintenance's $2,500 provision), but it left every contractual line behind:
 * a $0 Electric line in month three, a landscaping contract between seasons,
 * a snow line in July. Each reads as "not posted to the GL" and each is
 * ordinary timing — so the card the owner scans for real omissions filled up
 * with lines that simply had not been billed yet, and the one that mattered
 * sat among them.
 *
 * What survives is the narrow set where a whole year at $0 CANNOT be timing:
 *
 *   - real-estate taxes — billed by the municipality whether or not anyone acts
 *   - insurance — a bound policy is invoiced
 *   - the management fee — LIK bills every building, every month (see the
 *     intercompany rule: no property pays an outside manager). Spelled
 *     "Mgmt Fees - Other" as well as "Management Fees" in this chart, so both
 *     forms are matched.
 *   - debt service — the lender's schedule says the payment was due
 *
 * Those are obligations, not intentions, and each is large enough that a
 * missing one distorts the statement. Everything else is left to the variance
 * and trend checks, which is where a line that is merely running light belongs.
 *
 * This was ALREADY the rule for the weekly alert email (`isSignificantNotPosted`
 * gated it on the same four categories) and only for that email — the
 * dashboard card, the ⚠ on the statement and the review checklist each showed
 * every budgeted line. One signal cannot mean two things, so the rule moves
 * here, to the point where the finding is made.
 */
const KNOWN_OBLIGATION =
  /(manage(?:ment)?\s*fee|mgmt\s*fee|insurance|real\s*estate\s*tax|\br\.?e\.?\s*tax|property\s*tax|\btaxes?\b|debt|mortgage)/i;

export function isKnownObligation(l: { label: string; section?: string }): boolean {
  return KNOWN_OBLIGATION.test(l.label) || (!!l.section && KNOWN_OBLIGATION.test(l.section));
}

/**
 * A LEASE-BILLED REVENUE LINE THAT CAME IN SHORT OF BUDGET.
 *
 * Every other "?" on a revenue line is a TREND — the line moved against its own
 * recent months or last year — or a rent-roll BILLING mismatch. Neither sees a
 * line that is short by the same amount every month: a lease the budget assumed
 * that is not billing, a CAM or tax recovery keyed low, a tenant who left. It
 * does not move, so no trend fires, and when the suite is vacant on the roll it
 * ties there too. The budget is the only thing that remembers what should have
 * come in.
 *
 * Limited to lines billed on a lease every month (`basisForLine`: base rent,
 * CAM, RE tax, insurance) — those land near budget month after month, so a
 * shortfall means something. Percentage rent, recon true-ups, late fees and
 * other income are budgeted evenly and post in lumps; a monthly gap on them is
 * arithmetic, not a finding. Short only: revenue OVER budget on these lines is
 * a new lease or an escalation, and a suite billed twice is the rent-roll
 * check's job.
 *
 * Its own floor ($500 of shortfall), NOT put through the trend filters — a
 * steady gap is exactly what they are built to ignore.
 */
export function revenueShortfallReason(
  role: SectionRole,
  line: { label: string; mask: string },
  periodActual: number,
  periodBudget: number | null | undefined,
): string | null {
  if (role !== "revenue" && role !== "reimbursement") return null;
  if (periodBudget == null || periodBudget < 1) return null;
  if (!basisForLine(line.label, line.mask)) return null;
  const short = periodBudget - periodActual;
  if (short < FLAG_MIN_DOLLARS) return null;
  const $ = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
  return `${$(short)} under budget — billed ${$(periodActual)} against ${$(periodBudget)}. A lease the budget assumed that is not billing, or a charge not keyed.`;
}

