// Payroll tie-out: does the allocation add back up to the payroll register?
//
// buildInvoices splits each employee's comp across buildings by allocation %.
// If an employee can't be matched to an allocation row their whole comp is
// silently dropped; if their percentages don't sum to 100% the remainder never
// lands anywhere. This reconciles the register total against what was actually
// allocated and names exactly what leaked, so an unbalanced batch can't quietly
// go to Avid.

import { makeAllocationMatcher } from "@/lib/invoicing/buildInvoices";
import type { AllocationTable, PayrollParseResult, PropertyInvoice } from "@/lib/types";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Allocatable comp for one employee (everything buildInvoices spreads —
 *  commissions live in `exclusions` and are intentionally NOT here). */
function allocatableComp(e: PayrollParseResult["employees"][number]): number {
  return (e.salaryAmt || 0) + (e.overtimeAmt || 0) + (e.holAmt || 0) +
    (e.er401kAmt || 0) + (e.otherAmt || 0) + (e.taxesErAmt || 0);
}

/** Sum of an allocation row's top-level percentages (direct props + groups +
 *  marketing). Values may be fractions (0–1) or percents (0–100). */
function allocationPctSum(top: Record<string, number>): number {
  const vals = Object.values(top).map((v) => v || 0);
  const raw = vals.reduce((s, v) => s + v, 0);
  // Heuristic: if any single value > 1.5 the map is in percent (0–100).
  return vals.some((v) => v > 1.5) ? raw / 100 : raw;
}

export type UnmatchedEmployee = { name: string; employeeId?: string; amount: number };
export type OffAllocationEmployee = { name: string; pctSum: number; shortfall: number; accepted: boolean };

export type PayrollTieOut = {
  /** Allocatable comp from the register (excludes commissions). */
  sourceTotal: number;
  /** What actually landed on buildings (Σ invoice totals). */
  allocatedTotal: number;
  /** Commissions & other pay excluded from allocation by design. */
  excludedTotal: number;
  /** Employees with no allocation row — their comp never lands anywhere. */
  unmatched: UnmatchedEmployee[];
  unmatchedTotal: number;
  /** Matched employees whose percentages don't sum to 100% (accepted = the
   *  documented Harry Feldman / Middletown ~5.14% gap). */
  offAllocation: OffAllocationEmployee[];
  /** sourceTotal − allocatedTotal: all allocatable comp that didn't land. */
  delta: number;
  /** delta minus accepted variances — unallocated comp that shouldn't exist
   *  (unmatched employees + off-100% allocations). */
  unexplained: number;
  /** True once the only unallocated comp is an accepted variance (|unexplained| < $1). */
  ties: boolean;
};

const isAcceptedFeldman = (name: string, pctSum: number) =>
  /feldman/i.test(name) && pctSum > 0.93 && pctSum < 0.97; // documented ~94.86%

export function reconcilePayroll(
  payroll: PayrollParseResult,
  alloc: AllocationTable,
  invoices: PropertyInvoice[],
): PayrollTieOut {
  const match = makeAllocationMatcher(alloc);

  let sourceTotal = 0, excludedTotal = 0, unmatchedTotal = 0;
  const unmatched: UnmatchedEmployee[] = [];
  const offAllocation: OffAllocationEmployee[] = [];
  let acceptedShortfall = 0;

  for (const e of payroll.employees) {
    const comp = allocatableComp(e);
    sourceTotal += comp;
    excludedTotal += (e.exclusions ?? []).reduce((s, x) => s + (x.amount || 0), 0);

    const a = match(e);
    if (!a) {
      if (comp) { unmatched.push({ name: e.name, employeeId: e.employeeId != null ? String(e.employeeId) : undefined, amount: r2(comp) }); unmatchedTotal += comp; }
      continue;
    }
    const pctSum = allocationPctSum(a.top || a.allocations || {});
    if (comp && Math.abs(pctSum - 1) > 0.01) {
      const accepted = isAcceptedFeldman(a.name, pctSum);
      const shortfall = comp * (1 - pctSum); // + = under-allocated, − = over-allocated
      offAllocation.push({ name: a.name, pctSum: Math.round(pctSum * 10000) / 10000, shortfall: r2(shortfall), accepted });
      if (accepted) acceptedShortfall += shortfall;
    }
  }

  const allocatedTotal = invoices.reduce((s, inv) => s + (inv.total || 0), 0);
  const delta = sourceTotal - allocatedTotal;
  // Everything that didn't land on a building EXCEPT accepted variances (the
  // documented Feldman/Middletown gap). Unmatched employees and off-100%
  // allocations are NOT accepted — they keep the tie-out red.
  const unexplained = delta - acceptedShortfall;

  return {
    sourceTotal: r2(sourceTotal),
    allocatedTotal: r2(allocatedTotal),
    excludedTotal: r2(excludedTotal),
    unmatched,
    unmatchedTotal: r2(unmatchedTotal),
    offAllocation,
    delta: r2(delta),
    unexplained: r2(unexplained),
    ties: Math.abs(unexplained) < 1,
  };
}
