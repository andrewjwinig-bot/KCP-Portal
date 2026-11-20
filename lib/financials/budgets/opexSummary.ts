// Per-property budgeted operating-expense summary, for the Historical Op-Ex
// page's budget column. Pulls the "Reimbursable Expenses" section from each
// property's budget (the CAM-reimbursable opex lines — same GL accounts as the
// actuals), splitting Real Estate Taxes out so it lines up with the actuals
// summary (Op Ex / RET / Total).

import "server-only";
import { listBudgets } from "./storage";
import { pickBudgetYear, preferredWorkbooks } from "./inForce";

export type BudgetOpexSummary = {
  year: number;
  byProperty: Record<string, { opex: number; ret: number }>;
};

const isRet = (label: string, gl: string | null) =>
  /real estate tax/i.test(label) || (gl ? gl.startsWith("6410") : false);

export async function budgetOpexSummary(): Promise<BudgetOpexSummary> {
  const wbs = await listBudgets();
  // The budget IN FORCE, not the newest on file — a 2027 budget published in
  // October must not stand in for 2026's until January.
  const year = pickBudgetYear(wbs.map((w) => w.year)) ?? 0;
  const byProperty: Record<string, { opex: number; ret: number }> = {};
  const taken = new Set<string>();

  for (const wb of preferredWorkbooks(wbs)) {
    if (wb.year !== year) continue;
    for (const p of wb.properties) {
      if (taken.has(p.propertyCode.toUpperCase())) continue;
      taken.add(p.propertyCode.toUpperCase());
      // The reimbursable operating-expense section (exclude the
      // "Non-Reimbursable Expenses" section, which is broader than CAM).
      const sec = p.sections.find(
        (s) => /reimbursable expenses?/i.test(s.name) && !/non-?reimbursable/i.test(s.name),
      );
      if (!sec) continue;
      let opex = 0, ret = 0;
      for (const ln of sec.lines) {
        if (ln.isSubtotal) continue;
        const v = typeof ln.total === "number" ? ln.total : 0;
        if (!v) continue;
        if (isRet(ln.label, ln.glAccount)) ret += v; else opex += v;
      }
      const code = p.propertyCode.toUpperCase();
      const cur = byProperty[code] ?? { opex: 0, ret: 0 };
      cur.opex += opex;
      cur.ret += ret;
      byProperty[code] = cur;
    }
  }
  return { year, byProperty };
}
