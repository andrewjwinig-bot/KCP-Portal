// Pure half of `statementBilling.ts` — the monthly INS charge in a tenant's
// statement lines.

import type { StatementCharge } from "@/lib/statements/types";

export type StatementBilling = { ins?: number; month?: string };

/** The newest month carrying an insurance CHARGE (dated, owed, not a
 *  year-end reconciliation adjustment), and that month's total of them. */
export function statementMonthlyBilling(charges: StatementCharge[]): StatementBilling {
  const byMonth = new Map<string, number>();
  for (const c of charges) {
    if (c.category !== "insurance" || !c.dateISO || !(c.amount > 0) || c.reconYear != null) continue;
    const m = c.dateISO.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + c.amount);
  }
  if (!byMonth.size) return {};
  const month = [...byMonth.keys()].sort().pop()!;
  return { ins: Math.round(byMonth.get(month)! * 100) / 100, month };
}
