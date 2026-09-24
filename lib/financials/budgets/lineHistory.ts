// A budget line's trailing years — what it was budgeted and what it actually
// cost, going back as far as the data goes.
//
// This is the thing a budget conversation runs on. "Snow, $12,000?" is an
// argument about a number; "budgeted 10.8, 10.8, 11.5 and spent 14.2, 9.1,
// 22.4" is an argument about a line. Both figures per year, because either
// alone misleads: actuals with no budget beside them hide whether anyone
// expected it, and budgets with no actuals hide whether the plan ever held.
//
// Everything here is already stored — the GL is kept per year and so are the
// budgets. Nothing new is imported; it is read across years instead of one.

import "server-only";
import { listFullGls } from "@/lib/financials/operating-statements/statementStore";
import { assembleGls } from "@/lib/financials/operating-statements/glAssemble";
import { lineMonthly } from "@/lib/financials/operating-statements/lineSeries";
import { resolvePropertyBudget, makeBudgetLookup } from "@/lib/financials/operating-statements/budgetCrosswalk";

export type LineYear = {
  year: number;
  /** 12 monthly actuals, display-signed. Null when no GL was loaded for the year. */
  months: number[] | null;
  actual: number | null;
  budget: number | null;
  /** The year's budget month by month (same sign as `budget`). Null with no budget. */
  budgetMonths?: number[] | null;
  /** actual − budget. Positive means over. Null when either side is missing. */
  variance: number | null;
  /** How much of the year the GL covers — 12 is a full year. */
  monthsCovered: number;
  /** True when the budget came from a different year's file (a fallback). */
  budgetFallback: boolean;
  /** Whether the year's GL kept TRANSACTIONS ("lean" = imported monthly totals
   *  only, so its cells open onto no detail). */
  detail?: "stored" | "lean" | "partial";
};

export type LineHistory = {
  propertyCode: string;
  label: string;
  mask: string;
  years: LineYear[];
  /** Mean of the complete years' actuals — the number an argument starts from. */
  averageActual: number | null;
  /** Complete years only: a partial year would drag an average down silently. */
  completeYears: number;
};

const r0 = (n: number) => Math.round(n);

/**
 * Read one line across `back` years ending at `throughYear`.
 *
 * A PARTIAL YEAR IS MARKED, NOT HIDDEN. The current year's GL usually stops a
 * month or two back, and showing its total beside four complete years invites
 * exactly the wrong comparison — so `monthsCovered` travels with every row and
 * the average is taken over complete years only.
 */
export async function lineHistory(opts: {
  key: string;
  propertyCode: string;
  label: string;
  mask: string;
  /** 1 for expenses (debit-normal), -1 for revenue. */
  sign: 1 | -1;
  throughYear: number;
  back?: number;
}): Promise<LineHistory> {
  const { key, propertyCode, label, mask, sign, throughYear } = opts;
  const back = opts.back ?? 5;
  const fulls = await listFullGls();

  const years: LineYear[] = [];
  for (let y = throughYear - back + 1; y <= throughYear; y++) {
    const glsY = fulls.filter((g) => g.key === key && g.year === y);
    const stored = assembleGls(glsY);
    const leanN = glsY.filter((g) => g.transactionsStored === false).length;
    const detail = !glsY.length ? undefined : leanN === 0 ? "stored" as const : leanN === glsY.length ? "lean" as const : "partial" as const;
    const covered = stored?.maxPeriodInFile ?? 0;
    const months = stored ? lineMonthly(stored.monthly, mask, sign, 12) : null;
    const actual = months ? r0(months.reduce((s, n) => s + n, 0)) : null;

    let budget: number | null = null;
    let budgetMonths: number[] | null = null;
    let budgetFallback = false;
    try {
      const b = await resolvePropertyBudget(propertyCode, y);
      if (b) {
        // The mask is looked up on its own rather than through a section's
        // sibling masks — there is no statement here to claim accounts
        // against, and a line's own mask is what the caller is asking about.
        const lookup = makeBudgetLookup(b, 12);
        const hit = lookup("", mask, [mask]);
        budget = hit ? r0(hit.annualBudget) : null;
        // Month by month, for the history's monthly table.
        if (hit) budgetMonths = Array.from({ length: 12 }, (_, i) => r0(makeBudgetLookup(b, i + 1)("", mask, [mask])?.periodBudget ?? 0));
        budgetFallback = !!b.fallback;
      }
    } catch { /* a year with no budget file simply has no budget */ }

    years.push({
      year: y, months, actual, budget, budgetMonths,
      variance: actual != null && budget != null ? r0(actual - budget) : null,
      monthsCovered: covered,
      budgetFallback,
      detail,
    });
  }

  const complete = years.filter((y) => y.actual != null && y.monthsCovered >= 12);
  return {
    propertyCode, label, mask, years,
    averageActual: complete.length ? r0(complete.reduce((s, y) => s + (y.actual ?? 0), 0) / complete.length) : null,
    completeYears: complete.length,
  };
}
