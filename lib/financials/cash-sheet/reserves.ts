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

/** One "Big Projects" line's amount in each window month. */
export type ReserveLine = { label: string; amounts: number[] };
/** A property's reserve breakdown for the look-ahead window. */
export type ReserveDetail = { windowMonths: number[]; lines: ReserveLine[]; total: number };

/** 1-based month numbers in the look-ahead window (current + next 2), clamped
 *  to December — no wrap into next year. */
function windowMonths(month: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < RESERVE_WINDOW_MONTHS; k++) {
    const m = month + k;
    if (m <= 12) out.push(m);
  }
  return out;
}

/** Budgeted "Big Projects" reserve per property for a cash-sheet (year, month):
 *  every budget sub-line labeled "Big Projects", summed over the look-ahead
 *  window. Returns the per-property total (`byCode`, uppercased) and the
 *  line-by-line breakdown (`detail`). Uses the matching budget year (falling
 *  back to the latest available). Empty when no budget is loaded. */
export async function bigProjectsReserveFor(year: number, month: number): Promise<{ byCode: Record<string, number>; detail: Record<string, ReserveDetail> }> {
  const budgets = await listBudgets();
  if (!budgets.length) return { byCode: {}, detail: {} };
  const years = budgets.map((b) => b.year);
  const useYear = years.includes(year) ? year : Math.max(...years);
  const wm = windowMonths(month);
  const idx = wm.map((m) => m - 1); // 0-based into the months array
  const byCode: Record<string, number> = {};
  const detail: Record<string, ReserveDetail> = {};
  for (const wb of budgets) {
    if (wb.year !== useYear) continue;
    for (const property of wb.properties) {
      if (property.propertyCode === "CONSOLIDATED") continue;
      const lines: ReserveLine[] = [];
      const visit = (bl: BudgetLine[]) => {
        for (const line of bl) {
          if (!line.isSubtotal && /big project/i.test(line.label)) {
            const amounts = idx.map((m) => Math.round(line.months?.[m] ?? 0));
            if (amounts.some((a) => a !== 0)) lines.push({ label: line.label, amounts });
          }
          if (line.subLines) visit(line.subLines);
        }
      };
      for (const sec of property.sections) visit(sec.lines);
      if (!lines.length) continue;
      const total = lines.reduce((a, l) => a + l.amounts.reduce((b, n) => b + n, 0), 0);
      const code = property.propertyCode.toUpperCase();
      byCode[code] = total;
      detail[code] = { windowMonths: wm, lines, total };
    }
  }
  return { byCode, detail };
}
