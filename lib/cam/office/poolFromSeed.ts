// Derive an OfficeExpensePool from the app's existing expense history
// (lib/rentroll/baseYearExpenses → SEED_EXPENSES). This is the key
// connection that makes every office building's reconciliation pool come
// straight from the data already on the Expense History page — no per-
// building re-keying. RET lives in the PropertyExpenses.ret map (not in
// `lines`), so it's mapped onto the standard RET account here.

import type { PropertyExpenses } from "../../rentroll/baseYearExpenses";
import type { OfficeExpensePool } from "./types";

const RET_ACCOUNT = "6410-8502";

export function poolFromSeedExpenses(p: PropertyExpenses): OfficeExpensePool {
  const values: Record<string, Record<string, number>> = {};
  for (const l of p.lines) values[l.glAccount] = { ...l.values };
  values[RET_ACCOUNT] = { ...p.ret };

  // Accounts that carry a 95%-grossed-up variant ("-95").
  const has95 = new Set(
    p.lines.filter((l) => l.glAccount.endsWith("-95")).map((l) => l.glAccount.slice(0, -3)),
  );
  // Operating-expense schedule: real lines (not RET, not separately-billed
  // electric, not the -95 variants), each pointing at its gross-up variant
  // when one exists.
  const opexLines = p.lines
    .filter((l) => !l.separateCharge && !l.glAccount.endsWith("-95"))
    .map((l) => ({
      glAccount: l.glAccount,
      label: l.label,
      ...(has95.has(l.glAccount) ? { grossUpAccount: `${l.glAccount}-95` } : {}),
    }));

  return {
    propertyCode: p.propertyCode,
    values,
    opexLines,
    retAccount: RET_ACCOUNT,
    retLabel: "Rate x Building Sq. Ft",
    rentableSqft: p.rentableSqft,
    updatedAt: p.updatedAt,
  };
}
