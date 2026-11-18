// WHAT EACH OFFICE EXPENSE LINE RECOVERED (owner, 11/2026: "show as a $ and %
// of each line item what the recoveries were … since each expense is
// calculated on its own line against the base year").
//
// Pure: a reconciled building (compute.ts) in, a RecoveryGroup out
// (lib/cam/recoveries.ts). Each Op Ex line (+ RET): the booked expense, what
// tenants were billed on it (share × max(0, actual − base) × proration — the
// recon's own figures), and where the rest went:
//   · Under base years — each tenant's share of the line up to its base;
//   · Vacant & not billed — space with no reconciling tenant (vacancy, gross
//     leases, amenity, part-year) — the remainder;
//   · Gross-up to 95% — a grossed-up lease recovers on MORE than was booked,
//     so it is a negative part (it adds to the recovery).
// A lease with a stop on the expense TOTAL (aggregateBaseYear) has no
// per-line answer: its amount due is spread over the lines in proportion to
// how far each rose above its base.

import type { BuildingReconResult, OfficeExpensePool, ReconScheduleLine } from "./types";
import { addPart, addTenant, assembleGroup, finishRow, newRow, type RecoveryGroup, type RowAcc } from "../recoveries";

export const OFFICE_PARTS = {
  base: "Under base years",
  vacancy: "Vacant & not billed",
  grossUp: "Gross-up to 95%",
} as const;

/** The booked expense on a base account, FINAL first. */
export function bookedExpense(pool: OfficeExpensePool, account: string, year: number, finals?: Record<string, number>): number {
  return finals?.[account] ?? pool.values[account]?.[String(year)] ?? 0;
}

function addLine(acc: RowAcc, sl: ReconScheduleLine, booked: number, weight: number, paid: number, who: { unitRef: string; name: string; building: string }) {
  addTenant(acc, who, paid);
  // The tenant's slice of what it reconciled on (grossed-up where its lease
  // is) splits into what it paid and what its base absorbed; the slice above
  // the booked figure is the gross-up.
  addPart(acc, OFFICE_PARTS.base, weight * sl.actual - paid);
  addPart(acc, OFFICE_PARTS.grossUp, -weight * (sl.actual - booked));
}

export function officeLineRecoveries(
  pool: OfficeExpensePool,
  result: BuildingReconResult,
  finals: Record<string, number> | undefined,
  name: string,
): RecoveryGroup {
  const year = result.reconYear;
  const code = result.propertyCode;
  const lines = pool.opexLines.map((l) => newRow(`opex|${l.glAccount}`, l.glAccount, l.label, "opex", bookedExpense(pool, l.glAccount, year, finals)));
  const ret = newRow(`ret|${pool.retAccount}`, pool.retAccount, pool.retLabel || "Real Estate Taxes", "ret", bookedExpense(pool, pool.retAccount, year, finals));

  let reconciled = 0;
  for (const t of result.tenants) {
    if (t.isVacant) continue;
    reconciled += 1;
    const who = { unitRef: t.unitRef, name: t.name, building: code };
    const weight = (t.proRataPct / 100) * t.recoveryPct;
    if (t.aggregateBaseYear && !t.futureBaseYear) {
      const rises = t.opexLines.map((sl) => Math.max(0, sl.actual - sl.baseCost));
      const sum = rises.reduce((a, b) => a + b, 0);
      t.opexLines.forEach((sl, i) => addLine(lines[i], sl, lines[i].expense, weight, sum > 0 ? t.opexAmountDue * (rises[i] / sum) : 0, who));
    } else {
      t.opexLines.forEach((sl, i) => addLine(lines[i], sl, lines[i].expense, weight, sl.netIncrease * weight, who));
    }
    addLine(ret, t.retLine, ret.expense, weight, t.retAmountDue, who);
  }

  return assembleGroup(
    { code, name, year, kind: "office" },
    lines.map((l) => finishRow(l, OFFICE_PARTS.vacancy)),
    [finishRow(ret, OFFICE_PARTS.vacancy)],
    reconciled,
  );
}
