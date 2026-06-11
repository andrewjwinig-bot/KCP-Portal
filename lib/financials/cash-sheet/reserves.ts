// Cash Sheet — Reserves sourcing.
//
// Reserves = cash held back for upcoming "Big Projects" capital work — the
// lumpy, plan-ahead items budgeted per property (Building Maint., Parking Lot
// Maint., Landscaping, …). The reserve for a month is the sum of every budget
// sub-line labeled "Big Projects" over a rolling window of this month + the next
// two, per property — so a project starts being held ~3 months out and drops off
// once its month passes. Auto by default; staff can override per month.

import "server-only";
import { listBudgets } from "@/lib/financials/budgets/storage";
import type { BudgetLine } from "@/lib/financials/budgets/types";

const RESERVE_WINDOW_MONTHS = 3; // current month + next two

/** 0-based month indices in the look-ahead window (current + next 2), clamped
 *  to December — no wrap into next year. */
function windowIdx(month: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < RESERVE_WINDOW_MONTHS; k++) {
    const m = month - 1 + k;
    if (m <= 11) out.push(m);
  }
  return out;
}

/** Budgeted "Big Projects" reserve per property code (uppercased) for a
 *  cash-sheet (year, month): every budget sub-line labeled "Big Projects",
 *  summed over the look-ahead window. Uses the matching budget year (falling
 *  back to the latest available). Empty when no budget is loaded. */
export async function bigProjectsReserveFor(year: number, month: number): Promise<Record<string, number>> {
  const budgets = await listBudgets();
  if (!budgets.length) return {};
  const years = budgets.map((b) => b.year);
  const useYear = years.includes(year) ? year : Math.max(...years);
  const idx = windowIdx(month);
  const out: Record<string, number> = {};
  for (const wb of budgets) {
    if (wb.year !== useYear) continue;
    for (const property of wb.properties) {
      if (property.propertyCode === "CONSOLIDATED") continue;
      let sum = 0;
      const visit = (lines: BudgetLine[]) => {
        for (const line of lines) {
          if (!line.isSubtotal && /big project/i.test(line.label)) {
            for (const m of idx) sum += line.months?.[m] ?? 0;
          }
          if (line.subLines) visit(line.subLines);
        }
      };
      for (const sec of property.sections) visit(sec.lines);
      const rounded = Math.round(sum);
      if (rounded !== 0) out[property.propertyCode.toUpperCase()] = rounded;
    }
  }
  return out;
}
